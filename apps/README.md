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
    manifest.json   ← the app's manifest: appId, names, version, capabilities
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
- **[fluence](fluence/)** — spontaneous-speech coach (full port). Nine drill
  types, record a take → Deepgram nova-3 transcript (word confidence + filler
  tagging via `gifos.api`) → deterministic pace/filler/lexical features →
  drill-type-aware `gifos.ai` coaching → suggested next drill → weekly review,
  all in `gifos.db`. Picture-description drills render a scene with
  `gifos.ai.image`. Finished GIF: [`site/apps/fluence/fluence.gif`](../site/apps/fluence/fluence.gif). The first app to
  exercise the generic third-party-API capability.
- **[sound-it-out](sound-it-out/)** — looping phonics videos for a child
  learning to read (full port of the sound-it-out desktop app, built for a boy
  with Down syndrome). Twelve levels from sight words to a growing story, each
  grapheme lit as its sound plays; the parent records the clip library in-app
  via brokered `gifos.recordAudio` with take scoring (the schwa detector caught
  in-app), recordings stay **private** in `gifos.db`, and a built-in voice —
  the desktop pipeline's Kokoro clips, schwa-shaped offline and packed into the
  GIF — covers day one. `gifos.ai.tts` (optional) reads unrecorded words;
  isolated phonemes never go to a model. Playback renders the storyboard live
  on canvas; export is a realtime WebM capture. **Not in the store yet** —
  upstream is still moving; `listing.unpublished.json` holds the listing
  (see its README for the publish move). Guarded by
  `test/unit/sound-it-out.js`: segment-exact parity with the Python original.
- **[chess-grandmaster](chess-grandmaster/)** — play **full-strength Stockfish**
  (real engine, NNUE) running entirely offline in the sandbox. Pick a level from
  ~1320 Elo to the unshackled engine, with a live win/draw/loss read-out and
  centipawn eval. The first app to use the **`wasm`** capability: it bundles the
  Stockfish WASM (net embedded) and instantiates it from bytes — `connect-src`
  stays `'none'`, so the engine never touches the network. Finished GIF:
  [`site/apps/chess-grandmaster/chess-grandmaster.gif`](../site/apps/chess-grandmaster/chess-grandmaster.gif). **GPLv3** (it links Stockfish
  — see [`chess-grandmaster/COPYING-stockfish.txt`](chess-grandmaster/COPYING-stockfish.txt)).
