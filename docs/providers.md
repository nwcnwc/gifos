# Provider apps — apps that ADD abilities to the OS

Ratified 2026-08-09 (Nathan). Until now capabilities flowed one way: the OS
brokers abilities (AI, keyed APIs, capture) DOWN to sandboxed apps. A
**Provider** is an app that flows the other way: it *supplies* an OS ability,
which the OS then brokers to every other app. Install a GIF and your computer
gains a power — the natural next rung of "everything is a file."

The first shipped case is AI: a Provider can carry an on-device model (the
`wasm`-hatch precedent — Chess Grandmaster's Stockfish — but serving instead of
playing) and be assigned to an AI role in **Settings → AI models**. Every app
that calls `gifos.ai.*` then gets answers from that app instead of a cloud
endpoint, with **zero setup, zero keys, nothing leaving the browser**. Consumer
apps need no changes: the role indirection (`smartest`/`cheapest`/`tts`/…) was
already the only thing apps see.

## The manifest

```json
{ "provides": { "ai": ["tts"] } }
```

A manifest with a non-empty `provides` object names a **Provider app**. Roles
are the Settings AI types: `smartest`, `cheapest`, `tts`, `stt`, `image`,
`image_to_video`, `video`. A Provider still runs as an ordinary app when
double-clicked (its page should explain itself and offer a Try box).

## THE HARD RULE: providers are network-less

Every prompt (or clip, or image request) from every consumer app flows INTO the
assigned provider's sandbox. A provider that could also reach the network would
be a machine for exfiltrating every app's AI traffic. So:

**A manifest with `provides` may not declare `capabilities.network` or
`capabilities.api`. Not a consent checkbox — refused mechanically.**

Enforced at serve time (`providerGuard` in runtime.js refuses to mount it) and
at assignment time (the Settings picker won't list it). With the rule in place
the existing sandbox does the privacy work — `connect-src 'none'` means the
provider physically cannot leak what it sees — and the consumer's ack sheet can
truthfully say "answered on this device; nothing leaves this browser."
(Residual, visible leak: a provider could persist what it sees into its own
saved state, which rides its snapshots. Named in the threat model, accepted.)

## The Providers folder — recognition is a PLACE

`ensureSystemItems` creates a system folder **Providers** (`sys_providers`,
sibling of `sys_stolen`) on every desktop. The contract:

- **A provider is recognized ONLY while its icon sits directly in that
  folder.** Settings only offers, and the broker only serves, direct children
  of `sys_providers`. One glance at one folder answers "what code answers my
  apps' AI calls?" — no hunting through nested folders.
- **Outside the folder, the icon wears a big red ✕ overlay** (`.provider-x`,
  baked into the icon key so moves repaint immediately). The GIF is intact and
  shareable — the ✕ means "inert here; move it to Providers to activate", and
  the tooltip says exactly that. Inside the folder the ✕ disappears.
- The App Store's install handoff (`#place=<fileId>`) files a `provides` app
  into `sys_providers` instead of the Home Screen, so a store install is
  active immediately. A hand-dropped GIF lands wherever it lands and shows the
  ✕ until the user moves it — that's the teaching mechanism.

## How a provider serves (runtime.js)

Assignment lives in the same per-role config apps already resolve through:
`gifos_ai_config[role] = { app: <fileId>, appId, appName }` instead of
`{ url, key, model }`. `brokerAI` (and `brokerAgentChat`) branch on `.app`:

1. **Guard** — load the GIF, decode the manifest, and require: role listed in
   `provides.ai`; no `network`/`api` capability; icon a direct child of
   `sys_providers` (and not in the Trash). Every failure is a clear,
   user-fixable error; a missing/moved provider also raises the system setup
   modal naming the provider and the folder.
2. **Mount** — a **hidden sandboxed iframe inside the consumer's own tab**
   (per provider fileId, lazily on first call, cached for the tab's life).
   Same `buildAppHtml` pipeline, same CSP (plus the wasm hatch if declared),
   same opaque origin. No shared provider tab, no cross-tab RPC: isolation
   stays structural, and a dead consumer tab cleans up its own provider
   instance. The cost (one engine instance per consuming tab) is the price of
   not inventing a new trust path.
3. **Serve** — the provider app calls
   `gifos.provider.serve({ tts: async (req) => ({ bytes, mime }), … })`
   (handlers keyed by ROLE). The runtime forwards each brokered call as a
   `provider-request` message and resolves the consumer's promise with the
   handler's result. Boot and per-call timeouts fail loudly. Results mirror
   the endpoint broker's shapes (`tts` → `{bytes, mime}`, chat → `{text}`,
   `stt` → `{text}`, `image` → `{bytes, mime}`), so consumers can't tell a
   provider from a cloud endpoint — which is the point.

The provider iframe gets NO db, no fetch, no capture — it is a pure
request→response engine. If a future provider genuinely needs its own saved
state, that's a deliberate extension, not a default.

### Saying what is happening: `ctx.progress(note, frac)`

Each handler receives `(req, ctx)`. `ctx.progress()` re-arms the OS's idle
clock — that is what lets a slow answer survive while a wedged one still fails
(see the timeout note above). Both arguments are optional and both go to the
USER:

- `note` — a short line the OS shows while the request is in flight
  ("Loading Gemma 3 weights…", "Writing the answer… (128 tokens)").
- `frac` — 0..1 when there is something honest to count. Omit it and the bar
  sweeps instead of parking at a number it cannot justify.

**The OS shows it, not the app that asked.** An on-device model loads hundreds
of megabytes before it can produce a token — minutes on a phone — and for a
long time GifOS said nothing at all for the whole of it: the asking app sat on
a promise, the user sat on a blank answer, and a model warming up looked exactly
like a computer that had given up. Making that the consumer's problem would mean
every app that asks for AI growing its own "please wait" out of nothing, each
guessing differently, while the only party that knows a provider is mounting,
that weights are still downloading, or that it has been ninety seconds, is the
broker doing the work.

So `runtime.js` owns a non-blocking status pill and drives it through the
phases it can see itself — reading the app GIF, downloading pinned assets,
starting the provider — then hands the words to the provider's own
`ctx.progress` once the handler is running. It also times each provider and
remembers the result (`sys::provider-timing`, cold and warm kept apart, since
they differ by orders of magnitude), so the second wait can say "usually about
1m 40s" instead of asking the user to guess. The estimate appears only once it
has actually been measured on that computer: a number invented on the first run
is a guess, and a guess that turns out short is worse than silence.

### Streaming the answer: `ctx.delta(text)`

`ctx.progress` says *that* work is happening. `ctx.delta(fragment)` shows *the
work itself* — the answer as it is written, one fragment at a time. Each
fragment crosses to the OS as `provider-delta` and comes back out of the asking
app's `gifos.ai.chat({ onDelta })`, the same channel a streaming HTTP endpoint's
server-sent events use. A consumer cannot tell the two apart, and does not need
to: it renders fragments and paints `r.text` at the end, and that is correct
whether the answer came from a phone or a datacentre.

It is OPTIONAL, and a provider that never calls it is exactly as correct as one
that does — the promise still resolves once with the whole answer, and
`r.streamed` is then `false`, which the consumer may show. What is NOT
acceptable is a provider that generates incrementally and keeps it to itself.
All three offline LLMs did precisely that: `wllama`'s `onData` fired per token,
the tokens were accumulated in a private string, and the caller got one lump at
the end. A six-minute answer on a phone showed nothing at all for six minutes,
then everything at once — and from the user's chair that is indistinguishable
from a computer that has hung. The tokens were always there. There was nowhere
to put them.

Two rules learned building it:

- **Stream what you will return, not what you have.** The offline LLMs trim
  the raw completion at its stop markers before returning it. Streaming the raw
  accumulation instead would type template scaffolding onto the screen and then
  silently delete it. One `cleanUp()` feeds both the fragments and the final
  text, so the answer being watched IS the answer that lands.
- **A disclaimer streams FIRST.** The self-test models emit token soup, and the
  handler labels it as such. Prepending that label at the end means the user
  reads soup as though it were an answer for the whole generation. The label
  goes out as the first fragment, before a single token of it.

`ctx.delta` also re-arms the idle clock, exactly as `ctx.progress` does: a
provider writing tokens is self-evidently not wedged.

## Naming the provider to the consumer (gifos-perms.js)

The consumer's "would like to…" ack sheet already prints, per AI role, what the
role resolves to. When it resolves to a provider the sheet names the app:
"✓ Text → speech — set to **Offline Text to Speech (app on this device — nothing leaves
this browser)**". Both parties of the data flow are on the one sheet the user
actually reads, and the claim is *stronger* than the endpoint case, not weaker.

## Install-time assets: DOWNLOAD-THEN-SEAL (gifos-assets.js)

**Reserved for weights genuinely too big to live in a GIF** (ratified
2026-08-09): publicly hosted model files in the **tens of MB and up** — a
Whisper model, a quantized LLM, the kind of file that already lives on
Hugging Face behind a stable, CORS-served URL. Anything smaller rides
**inside** the GIF like Chess Grandmaster's Stockfish and Offline Text to Speech's
eSpeak (5.6 MB raw deflates to ~1.6 MB in-GIF): the shared file stays
complete with no second fetch to fail, which is strictly better whenever it
fits. `build-app-catalog.mjs` enforces a hard 8 MB floor per asset so the
doctrine can't erode one convenient listing at a time; 40 MB+ is the
judgement zone the pattern actually exists for.

An app that truly needs it declares, in its manifest:

```json
"assets": [{ "url": "https://huggingface.co/…/model-q4.bin",
             "sha256": "<64-hex>", "path": "model.bin", "bytes": 48000000 }]
```

The **OS** — a trusted first-party page, never the sandbox — downloads each
pinned URL (App Store at install; run.html / the provider mount as a backfill
for hand-dropped slim GIFs), verifies the SHA-256, and **caches the bytes in
the computer's asset store** (`appassets` in IndexedDB, Blob-backed so the
browser keeps them on disk, keyed by the icon's fileId — once per computer,
never per tab). The app reads them with `gifos.assets(path)` — served with a
zero-copy ArrayBuffer transfer, so a gigabyte model crosses the bridge
without a structured-clone copy — and never touches the network itself.

**Why a store, not sealed into the GIF:** the GIF payload is base64-inside-
JSON, so a 1.2 GB model would base64 past the engine's maximum string length
before the encoder ran — and it's the right distribution story anyway: a
shared or exported GIF stays slim, and the receiving computer re-downloads
from the SAME manifest pin. The public host is the canonical storage; GifOS
holds a verified local cache (excluded from whole-computer backups, deleted
with the icon).

Why this coexists with the network-less hard rule: the URL is fixed in the
manifest and the hash pins the exact bytes, so the download can neither carry
data out (no app-controlled parameters; it completes before the app sees any
consumer data) nor bring surprise bytes in. It is the author's shipped payload
arriving by a second route — the same trust as the GIF itself. Absolute URLs
must be https (public model hosts are the intended shape); origin-relative
URLs resolve against the serving origin and are what the harness uses
(`e2e-providers` pins a small local file to keep the machinery guarded while
no catalog app needs it — the 8 MB floor is catalog policy, not a mechanical
limit of the loader). A hand-sealed `.assets/**` file inside a GIF still
serves (and stays outside the signing digest, like `.state/**` — the signed
manifest already pins each asset by hash), but nothing writes that path
anymore; the cache is where downloads land. The store also records the
catalog sha at install (`storeSha`) — belt-and-braces for any install whose
bytes ever diverge from the catalog's.

## What this deliberately does NOT do

- Providers cannot add new capability TYPES to the permission vocabulary. The
  ack sheet's fixed, human-written descriptions are load-bearing; third-party
  text does not get to define what a checkbox means.
- No auto-assignment. Installing a provider never silently captures a role;
  the user assigns it in Settings → AI models (the picker offers installed,
  recognized providers per role).
- No cross-tab shared instances, no background service lifetime.
- `provides.ai` only, for now. The registry is typed so other ability families
  can follow deliberately.

## Shipped with this feature

- **Offline Text to Speech** (`apps/offline-tts/`, App Store) — the proof: offline TTS
  (eSpeak/meSpeak, GPL — same licensing posture as Chess Grandmaster's
  Stockfish), `provides: { ai: ["tts"] }`, no network. Engine + voice ride
  **inside the GIF** (~1.6 MB deflated) — at 5.6 MB raw it sits well under
  the assets floor, so download-then-seal would only add a failure mode.
- **Offline Neural Text to Speech** (`apps/offline-tts-neural/`, App Store) —
  the SECOND tts provider, proving a role can have more than one and that the
  user chooses: eSpeak stays the 1.6 MB instant robot, this is a 15M-parameter
  neural voice (KittenTTS Nano, Apache-2.0). The split is the same as the LLMs
  — engine in-GIF (ONNX Runtime Web + the espeak-ng phonemizer + 8 style
  tables, 12.4 MB), 24 MB of weights by manifest pin. Design and the four
  measured surprises: docs/tts-neural.md and the app's README.
  Note what it does NOT do when its weights are missing: it fails with a
  fixable message instead of falling back to its in-GIF self-test tone. The
  LLM providers can honestly label token soup as a self-test in the text they
  return; audio has no such channel, and a consumer handed a beep cannot tell
  it from speech. The self-test runs only when asked for by name (the reserved
  voice `self-test`).
- **Offline Cheap Text LLM BitNet** (`apps/offline-llm-bitnet/`) — the
  gigabyte-tier proof, and now SHIPPED: llama.cpp compiled to wasm (wllama,
  MIT; ternary TQ quants compiled in) serves `cheapest` from inside the
  sandbox. The GIF carries the ENGINE (+ a labeled few-MB self-test model, so
  the pipeline is provable offline and in the gate); the BitNet b1.58 2B-4T
  weights arrive by manifest pin into the asset store — a community TQ1_0
  conversion, 1,105,874,048 bytes, verified bit-for-bit against our own
  conversion of Microsoft's official checkpoint before pinning (see its
  README). Two sandbox findings are load-bearing and encoded in its build:
  Chromium refuses `{type:'module'}` blob workers in opaque origins (rewritten
  to classic), and emscripten loaders need the wasm hatch's `connect-src
  blob:`. Named so siblings could follow, and they did:
- **Offline Cheap Text LLM Gemma 3** (`apps/offline-llm-gemma/`) — same engine,
  Google's Gemma 3 1B Instruct Q4_K_M, 806,058,240 bytes. The SMALLEST and
  FASTEST of the three, which matters because the engine runs single-threaded
  in the browser. Weights are under the **Gemma Terms of Use**, not an
  open-source licence — stated in the listing rather than buried.
- **Offline Cheap Text LLM Gemma 4** (`apps/offline-llm-gemma4/`) — same
  engine, Gemma 4 E2B from Google's own QAT-mobile checkpoint, 1,875,742,368
  bytes, **Apache-2.0**. Pick it for the licence, Gemma 3 for speed. It is a
  reasoning model run deliberately WITHOUT its thinking mode: on a
  single-threaded engine every reasoning token is wall-clock, and it was
  measured returning EMPTY content when thinking ate the caller's whole token
  budget.

  All three provide the SAME `cheapest` role. GifOS never auto-assigns, so a
  user installs any or all and switches in Settings → AI models. Each carries
  a different prompt format, and each is guarded independently in
  `e2e-providers.js`.
- **Reader** (default app, Tools folder) — the tts consumer: paste text, hear
  it read via `gifos.ai.tts`, whoever serves it. **Ask AI** (also Tools) is
  the seeded `cheapest`/`smartest` consumer — its declaration is typed, so
  its ack sheet names the serving provider per role.
- Guards: `test/browser/e2e-providers.js` (recognition-by-place, red ✕,
  network-less rule, brokered end-to-end synthesis), wired into the release
  battery.
