# GifOS-certified apps

First-party apps that ship **with the GifOS project but are not seeded as
default apps** on the Home Screen. They're built and maintained here and
listed in the **App Store** on gifos.app — install one from there, or drop the
GIF on any GifOS desktop, to run it. A certified app can later be **promoted to
a default** (seeded from `site/js/sample-apps.js`) if it earns its place.

## Layout

```
apps/
  <name>/           ← the project SOURCE for that app
    index.html      ← (or a small multi-file project: app.js, style.css, …)
    manifest.json   ← the app's manifest: appId, names, version, minBuild,
                      capabilities
    listing.json    ← its STORE listing: author, tagline, description,
                      releaseDate, categories, tags, license
    screenshot.png  ← the master cover art the store's cover.jpg is made from
    README.md       ← what it is, which gifos.* capabilities it uses
    build.*         ← how the finished .gif is produced from this source

site/apps/          ← the PUBLISHED catalog (generated, but committed)
  index.json        ← the store grid, in one fetch
  <name>/
    app.json        ← manifest ∪ listing ∪ {bytes, sha256, cover, gif}
    <name>.gif      ← the finished, downloadable App GIF
    cover.jpg       ← the card / detail image
```

The finished `<name>.gif` lives under `site/`, not here: Pages publishes
**only** `site/` (`.github/workflows/pages.yml`), so a GIF anywhere else is not
downloadable. There is no second copy at this level — an 8 MB artifact in two
places is 8 MB twice in every clone, and two copies that drift.

Rebuild the GIF from the source with the app's build script (or the
`pack_gifos` recipe in [`site/llms.txt`](../site/llms.txt) / `+ Add`), writing
it to `site/apps/<name>/<name>.gif`. Then regenerate the catalog:

```bash
node scripts/build-app-catalog.mjs          # write site/apps/*
node scripts/build-app-catalog.mjs --check  # verify it's current (what CI runs)
```

A source tree with **no `listing.json` is simply not in the store** — that is
how an app stays unlisted while it's being built.

## `minBuild` — the oldest GifOS an app runs on

Every listed manifest MUST declare `minBuild`: the oldest **build number** the
app actually works on. The store reads it, tells the player what the app needs,
and refuses an install onto a computer that is older — because an app is not
free to install when installing it costs a gigabyte of weights and ends in an
icon that opens onto nothing.

This exists because it happened. Offline Cheap Text LLM BitNet needs the
install-time asset tier (`site/js/gifos-assets.js`), which is in NO release cut
so far — not even 0.9.5, the release most visitors run. The store happily
offered it to them, downloaded it, and installed something that could never
work.

Build numbers, not release numbers, because the build number is the thing that
is monotonic and always present: `site/js/build.js` carries the running build,
and `site/version.json`'s `builds` map turns each release into the edge build it
was cut from, so the store can translate the requirement into "release 0.9.6 and
up" for a human. A requirement newer than every release is a legitimate and
important state to be able to say — it is the state BitNet is in today.

Derive the number; do not guess it:

1. Find the newest OS feature the app needs and the commit that landed it.
2. `echo $((825 + $(git rev-list --count b4ada94..<sha> -- site)))` — the same
   anchored arithmetic `.github/workflows/pages.yml` and
   `scripts/archive-version.sh` use to stamp a build. (Re-anchor here too if
   those are ever re-anchored.)
3. An app needing nothing newer than the store itself declares **947**, the
   build the App Store shipped in. That is the floor `build-app-catalog.mjs`
   enforces: a build with no store cannot install from the store, so a lower
   claim is not generous, it is untrue.

`build-app-catalog.mjs` also knows the build a few manifest features arrived in
(`provides` 1177, `assets` 1178, `capabilities.pool` 1089) and fails a manifest
that asks for one while claiming an older floor. That table only catches the
obviously wrong; the number is still yours to justify.

Over-stating costs a player an update they did not strictly need. Under-stating
costs them an app that does not work. **When in doubt, state the higher.**

One honest limit: the store gates on the catalog, which reads
`apps/<slug>/manifest.json` directly, so a floor takes effect the moment the
catalog is rebuilt — no GIF rebuild needed. The copy of the manifest *inside*
the built GIF only picks the field up at the app's next build, so a GIF that
arrives by some route other than the store (dropped on a desktop, passed
between people) is not yet gated. That is why the number lives in the manifest
rather than the listing: it rides into the GIF on the next build, where the
runtime can eventually enforce it for every route.

## `launch` — letting a LINK say what to open on

An app that declares a `launch` block can be opened *on something* by URL:

```json
"launch": {
  "at":  { "label": "Open at a place the link picked",
           "detail": "A place name or a lat,lon." },
  "fly": { "label": "Arrive in the aeroplane, already in the air" }
}
```

```
https://gifos.app/?run=anyroad&go.at=36.0640,-112.1400&go.fly=1
```

Read them with `gifos.launch()`, which resolves to an object of the declared
keys — **or `null`**, which is the ordinary case and must always be a working
app. It resolves *late*: GifOS is showing the person what the link asked for,
in the `label`/`detail` words above, and the answer arrives when they tap. So
call it at boot and treat null as "open normally"; never block first paint on
it. Undeclared keys never arrive, and a decline is `null`, not an error.

Two things to get right on the app side:

- **Only expose what a stranger may safely trigger.** The rule of thumb that
  has held so far: if it is something the person could do in one tap once the
  app is open, a link may ask for it. Anyroad's `at` is its search box and
  `fly` is its ▲ button. Nothing that spends money, deletes data, or is hard to
  undo belongs here.
- **Say what happened.** A link-launched app is one a person arrived at with no
  context, so show the ask — Offline Text to Speech puts the sentence on screen
  before speaking it.

Not a `minBuild` feature: an older GifOS has no `gifos.launch()` at all, which
reads as `null`, and the app opens the ordinary way. A floor here would cost
people an update they do not need — see the rule above.

## What "certified" means here

- **First-party**: lives in this repo, built by us, and **signed with the
  gifos.app domain key** (`site/sign.html`, `gifos-sign.js`) so both store
  listings read **✓ signed by gifos.app**. The catalog records the signature
  claim (`build-app-catalog.mjs` reads the `GIFOSSIG` block); the store verifies
  it for real in the browser against the downloaded bytes and refuses any
  download whose claimed signature fails to verify.
- **Sandbox-honest**: runs as a normal sandboxed GifOS app — data in
  `gifos.db`, network only via the manifest allowlist, brokered capture/AI via
  `gifos.recordAudio` / `gifos.ai.*` (keys never touch the app).
- **Not a default**: not seeded automatically; you choose to add it.

## Apps

- **[anyroad](anyroad/)** — drive any road on Earth. The world is fetched, not
  authored: OpenStreetMap geometry for roads and buildings, terrain-RGB tiles for
  real elevation, streamed in around the car as it moves, rendered with
  hand-rolled WebGL. Races need no server — the invite link is the room, and
  everyone who opens it lands in the same place on the planet. The first app to
  need **binary `gifos.fetch`**: elevation arrives as a PNG whose pixels are
  metres. Every data source is swappable at runtime, and the optional satellite
  drape runs on the player's own key via `gifos.api`, so the app ships on
  genuinely open data with no account. Finished GIF:
  [`site/apps/anyroad/anyroad.gif`](../site/apps/anyroad/anyroad.gif) (~160 KB).
- **[fps-simple](fps-simple/)** — a first-person shooter in the sandbox. Solo, a
  garrison patrols a market street and hunts you; send the invite link and the
  same street becomes a deathmatch. The engine is
  [Claude of Duty](https://github.com/mshumer/Claude-of-Duty) (mshumer, MIT,
  Three.js), pinned and vendored as one IIFE bundle; the GifOS port adds the
  touch controls, the pointer handling and ALL of the multiplayer — upstream has
  no networking whatsoever. The first app to need **`capabilities.pointer`**:
  pointer lock is a sandbox flag, so without the declaration an FPS mounts,
  renders, and silently cannot aim. Two things made the port cheap: the game
  builds its world procedurally from one RNG seed, so every peer lands in the
  identical street having sent nothing, and remote players are AI soldier bodies
  with the brain removed — which means the existing ballistics already shoot
  them, headshots and hitmarkers included. Finished GIF:
  [`site/apps/fps-simple/fps-simple.gif`](../site/apps/fps-simple/fps-simple.gif) (~1 MB).
- **[fluence](fluence/)** — spontaneous-speech coach (full port). Nine drill
  types, record a take → Deepgram nova-3 transcript (word confidence + filler
  tagging via `gifos.api`) → deterministic pace/filler/lexical features →
  drill-type-aware `gifos.ai` coaching → suggested next drill → weekly review,
  all in `gifos.db`. Picture-description drills render a scene with
  `gifos.ai.image`. Finished GIF: [`site/apps/fluence/fluence.gif`](../site/apps/fluence/fluence.gif). The first app to
  exercise the generic third-party-API capability.
- **[sound-it-out](sound-it-out/)** — looping phonics videos for a child
  learning to read (full port of the sound-it-out desktop app's 0.4.x
  sentence-library design, built for a boy with Down syndrome). One list holds
  everything that gets read — letters, words, sentences; starter packs (Paw
  Patrol lines, letter sounds, the building-up ladder…) add entries with one
  tap. Words build up from their sounds (magic-e as onset+rime, irregulars
  shown whole), sentences end in the parent's own read with the highlight
  following her voice — timed by arithmetic over her word clips, no aligner.
  Recording is a per-entry walk-through over brokered `gifos.recordAudio`
  with take scoring (the schwa detector caught in-app); words land in a
  shared bank so each sentence gets cheaper; everything stays **private** in
  `gifos.db`. The GIF ships the desktop app's human starter voice (42
  phonemes) plus Kokoro-built pack clips; `gifos.ai.tts` (optional) reads
  unrecorded words — isolated phonemes never go to a model. Playback renders
  the storyboard live on canvas; export is a realtime WebM capture. **In the
  store** as of 0.9.6. Guarded by
  `test/unit/sound-it-out.js`: segment-exact parity with the Python original.
- **[offline-tts](offline-tts/)** — **Offline Text to Speech**: the first
  **Provider app** (docs/providers.md): kept in the
  Providers folder and assigned in Settings → AI models, it serves the
  **Text → speech** AI role to every app via `gifos.provider.serve`. The
  eSpeak engine + en-us voice ride **inside the GIF** (chess-grandmaster's
  pattern; the install-time assets pattern is reserved for far bigger public
  model weights). **GPLv3** (it embeds eSpeak via meSpeak/speak.js — see
  [`offline-tts/COPYING-espeak.txt`](offline-tts/COPYING-espeak.txt)).
  Finished GIF: [`site/apps/offline-tts/offline-tts.gif`](../site/apps/offline-tts/offline-tts.gif) (~1.6 MB).
- **[offline-llm-bitnet](offline-llm-bitnet/)** — **Offline Cheap Text LLM
  BitNet**: a Provider app serving the **Cheapest text LLM** role with
  llama.cpp compiled to WebAssembly (wllama, MIT) entirely in the sandbox.
  The GIF carries the engine + a labeled self-test model; Microsoft's
  **BitNet b1.58 2B-4T** ternary weights ride the **gigabyte asset tier**
  (manifest pin → Blob store cache). **In the store** as of 0.9.6, against a
  verified community TQ1_0 pin. Finished GIF:
  [`site/apps/offline-llm-bitnet/offline-llm-bitnet.gif`](../site/apps/offline-llm-bitnet/offline-llm-bitnet.gif) (~10 MB).
- **[offline-llm-gemma](offline-llm-gemma/)** — **Offline Cheap Text LLM
  Gemma 3**: the same engine as BitNet, a different brain — Google's
  **Gemma 3 1B Instruct**, hash-pinned to the gigabyte tier. Installing both
  is fine: GifOS never auto-assigns a role, so the user picks in
  Settings → AI models and can switch.
- **[offline-llm-gemma4](offline-llm-gemma4/)** — **Offline Cheap Text LLM
  Gemma 4**: a third `provides.ai: ["cheapest"]` provider, **Apache-2.0**,
  on Gemma 4 E2B QAT weights (~1.9 GB, hash-pinned). Same `minBuild` floor
  as its sibling — both need the Provider runtime (1177) and the asset
  tier (1178+).
- **[chess-grandmaster](chess-grandmaster/)** — play **full-strength Stockfish**
  (real engine, NNUE) running entirely offline in the sandbox. Pick a level from
  ~1320 Elo to the unshackled engine, with a live win/draw/loss read-out and
  centipawn eval. The first app to use the **`wasm`** capability: it bundles the
  Stockfish WASM (net embedded) and instantiates it from bytes — `connect-src`
  stays `'none'`, so the engine never touches the network. Finished GIF:
  [`site/apps/chess-grandmaster/chess-grandmaster.gif`](../site/apps/chess-grandmaster/chess-grandmaster.gif). **GPLv3** (it links Stockfish
  — see [`chess-grandmaster/COPYING-stockfish.txt`](chess-grandmaster/COPYING-stockfish.txt)).
- **[vocal-remover](vocal-remover/)** — **Ultimate Vocal Remover**'s MDX-Net
  separation path (Anjok07, MIT), transcribed to JavaScript and run on ONNX
  Runtime Web in the sandbox: a song in, the vocal and the backing out as
  separate WAVs, and optionally UVR's **vocal-split chain** on top (the karaoke
  model run on the first model's vocal stem, giving lead + backing). It runs at
  UVR's shipped defaults, including the `is_match_frequency_pitch` pass most
  re-implementations drop — the residual is the mix put back through the same
  STFT with no model in it, so the vocal stem does not carry back the band the
  model never saw. It ships its own **mixed-radix FFT**, because none of UVR's
  `n_fft` values (5120, 6144, 7680) is a power of two. UVR's own weights
  (120 MB) ride the asset pin; the engine and a labelled identity **self-test
  model** ride inside the GIF, which is what lets the whole pipeline be asserted
  by arithmetic offline — a 440 Hz tone in, the same tone out sample-aligned,
  and a −95 dBFS residual (`test/browser/e2e-vocal-remover.js`), on top of
  sample-exact parity with a numpy transcription of `separate.py`
  (`test/unit/vocal-remover.js`). Finished GIF:
  [`site/apps/vocal-remover/vocal-remover.gif`](../site/apps/vocal-remover/vocal-remover.gif) (~12.5 MB).
  ⚠ Its asset pin still needs `tools/verify-pins.py` run against a host that can
  reach the mirror — see the app's README.
