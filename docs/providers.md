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

## Naming the provider to the consumer (gifos-perms.js)

The consumer's "would like to…" ack sheet already prints, per AI role, what the
role resolves to. When it resolves to a provider the sheet names the app:
"✓ Text → speech — set to **Pocket Voice (app on this device — nothing leaves
this browser)**". Both parties of the data flow are on the one sheet the user
actually reads, and the claim is *stronger* than the endpoint case, not weaker.

## Install-time assets: DOWNLOAD-THEN-SEAL (gifos-assets.js)

**Reserved for weights genuinely too big to live in a GIF** (ratified
2026-08-09): publicly hosted model files in the **tens of MB and up** — a
Whisper model, a quantized LLM, the kind of file that already lives on
Hugging Face behind a stable, CORS-served URL. Anything smaller rides
**inside** the GIF like Chess Grandmaster's Stockfish and Pocket Voice's
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
for hand-dropped slim GIFs), verifies the SHA-256, and **seals the bytes into
the GIF under `.assets/<path>`** (repack + putFile, so it happens once per
computer). The app reads them with `gifos.assets(path)` and never touches the
network itself.

Why this coexists with the network-less hard rule: the URL is fixed in the
manifest and the hash pins the exact bytes, so the download can neither carry
data out (no app-controlled parameters; it completes before the app sees any
consumer data) nor bring surprise bytes in. It is the author's shipped payload
arriving by a second route — the same trust as the GIF itself. Absolute URLs
must be https (public model hosts are the intended shape); origin-relative
URLs resolve against the serving origin and are what the harness uses
(`e2e-providers` pins a small local file to keep the machinery guarded while
no catalog app needs it — the 8 MB floor is catalog policy, not a mechanical
limit of the loader). `.assets/**` joins `.state/**` outside the signing
digest (the signed manifest already pins each asset by hash), snapshots and
exports carry the sealed assets (a shared installed GIF is complete), and the
store records the catalog sha at install (`storeSha`) so a sealed install
doesn't read as forever-outdated.

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

- **Pocket Voice** (`apps/pocket-voice/`, App Store) — the proof: offline TTS
  (eSpeak/meSpeak, GPL — same licensing posture as Chess Grandmaster's
  Stockfish), `provides: { ai: ["tts"] }`, no network. Engine + voice ride
  **inside the GIF** (~1.6 MB deflated) — at 5.6 MB raw it sits well under
  the assets floor, so download-then-seal would only add a failure mode.
- **Reader** (default app, Tools folder) — the consumer: paste text, hear it
  read via `gifos.ai.tts`, whoever serves it.
- Guards: `test/browser/e2e-providers.js` (recognition-by-place, red ✕,
  network-less rule, brokered end-to-end synthesis), wired into the release
  battery.
