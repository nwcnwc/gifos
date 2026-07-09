# GifOS Architecture

## Overview

GifOS is a **web desktop** where every app is a GIF file. It has four layers, all represented as plain files or stateless infrastructure:

1. **The Desktop** — `index.html` — a persistent, local-first desktop of icons and folders.
2. **App GIFs** — GIFs that pack a filesystem; if they contain an `index.html`, they run as apps.
3. **The Runtime Library** — an API the desktop exposes to a running app, providing database + networking so any browser can act as a server.
4. **The Relay** — `gifos.app`, a stateless message/GIF passthrough that connects browsers for multiplayer. It stores nothing.

Everything the user owns is a file. Nothing the user owns lives on our servers.

## Layer 1 — The Desktop (`index.html`)

The desktop is the only "installed" component: a single HTML file that behaves like a Windows/macOS desktop.

### What it does

- Renders **icons** for every GIF and file the user has dropped in — GIFs animate right in the icon.
- Supports **drag-and-drop of any file**, **folders**, grid-snap arrangement (mouse and touch), rename, resize.
- **System bar**: the GifOS menu (About, whole-desktop Backup/Restore, Empty Trash, Settings, Reset), an ＋ Add button (file picker, New Folder, paste-an-AI-app, `.zip` import), and a storage pill (quota usage + persistent-storage request).
- **Trash**: deletes are recoverable until emptied.
- **Icon context menu**: Open, **Download** (exports the file — for apps, with saved state repacked in — without launching it), Rename, Bigger/Smaller icon, Move to Trash.
- **Double-click dispatch:**
  - Executable GifOS GIF → open a new tab and run it (Layer 2).
  - Whole-desktop backup GIF → offer to **boot it as a computer image** (see "Computer Images") or destructively restore it.
  - Anything else (`.jpg`, `.pdf`, a plain non-GifOS `.gif`) → opens in its own tab like a normal file.
- **Cross-tab live sync**: every mutation announces on a BroadcastChannel; other tabs of the same desktop re-render.
- **Persists locally.** The desktop's contents live in the browser via **IndexedDB**. There is **no account, no login, no server sync** — the desktop belongs to this browser, consistent with "nothing lives on our server." (A desktop does not follow you to another device; move a file by sharing its GIF.)

### Desktop storage model

```
IndexedDB database 'gifos' (this browser only)
├── items       ← desktop icons + folders (layout, positions, sizes)
├── files       ← the raw bytes of every dropped file (keyed by id)
├── appstate    ← per-icon skeleton (collection list + seq counters) and
│                 non-collection blobs (prefs, session tokens); keyed by fileId
└── apprecords  ← one row per app record, keyed by [fileId, collection, id]
```

App state is stored **per record**, not as one JSON blob per app: a `put`
writes a single row via the composite key, and the whole `{ collections }`
object is only assembled when something actually needs it (snapshot export,
whole-computer backup, a multiplayer state dump). Record writes are single
IndexedDB transactions — the seq counter is read-and-bumped inside the same
transaction — so two tabs of the same app can't clobber each other.

The store is a **namespace factory**: the default desktop binds to the `gifos` database, and every **booted computer image** gets its own `gifos_vm_<fileId>` database with the identical schema — a whole computer per namespace (see "Computer Images"). Because storage is local and unsynced, GifOS never needs an identity system. The "account" is the browser profile (a screen name in `localStorage` is used to attribute multiplayer moves).

## Layer 2 — App GIFs

An **App GIF** is a GIF that packs a **filesystem** (files + directories). It is a single, self-contained unit that carries **both the application and its saved state together** — there is no separate "data GIF." Exporting a snapshot produces one complete GIF.

### Execution model

Double-clicking an executable GIF:

```
double-click app.gif on the desktop
        │
        ▼
   open a NEW browser tab
        │
        ▼
   unpack GIF → in-memory filesystem
        │
        ├── has /index.html? → load it into an iframe, hand over control
        └── no  /index.html? → render a browsable file listing
                               (like an open directory on a web server)
```

Running each app in its **own tab** (a separate browsing context) — rather than an inline iframe on the desktop page — keeps apps isolated from the desktop and from each other, and gives every app a **shareable URL** (see Layer 4).

### App GIF payload (a packed filesystem)

The GIF's embedded payload is a **filesystem archive**, not a fixed JSON code object. Conceptually:

```
app.gif
└── GIFOS filesystem
    ├── index.html          ← entry point (optional; absence → browsable folder)
    ├── app.js
    ├── styles.css
    ├── assets/
    │   ├── icon.png
    │   └── logo.svg
    ├── manifest.json       ← metadata + declared permissions (see below)
    └── .state/             ← embedded saved state (optional)
        ├── db.json         ← serialized database
        └── prefs.json      ← app preferences / view state
```

`manifest.json` declares identity and what the app is allowed to do:

```json
{
  "gifos": "1.0",
  "appId": "chess",
  "name": "Chess Grandmaster",
  "shortName": "Chess",
  "version": "1.0",
  "description": "Two-player chess over the relay",
  "icon": "assets/icon.png",
  "entry": "index.html",
  "capabilities": {
    "db": true,
    "multiplayer": true,
    "network": ["api.openai.com"]
  }
}
```

- `name` / `shortName` / `version` — **display identity**. `name` is the full title (the tile's label). `shortName` is a compact label (≤ ~14 chars, e.g. `"Chess"` for `"Chess Grandmaster"`) and `version` a short string (`"1.0"`, `"2.3"`). GifOS renders `shortName` + `version` together as an **identity pill** — "Chess v1.0", styled like the `SYSTEM` marker — on the app's desktop tile *and* in its runtime header, **but only when the app is signed**. An unsigned GIF can claim any name, so GifOS never shows an identity pill for one; the pill's presence means "this signed author declares this is Chess v1.0."
- `capabilities.db` — the app wants the runtime database library.
- `capabilities.multiplayer` — the app can host/join sessions over the relay.
- `capabilities.network` — external API hosts the app may call through the fetch bridge (see the networking doc).
- `capabilities.microphone` / `capabilities.camera` — **brokered capture**. A sandboxed app can't hold the live camera/mic (opaque origin), so instead it calls `gifos.recordAudio()` / `gifos.recordVideo()` / `gifos.takePhoto()`; the **runtime** (trusted `gifos.app` origin) records a clip behind a visible, unfakeable indicator it owns and returns only the bytes. The app never touches the live device — stronger than a raw grant.
- `capabilities.motion` — delegates the `gyroscope`/`accelerometer` allow-policy to the app frame (the events fire inside it). `gifos.motion(cb)` handles the iOS permission gesture. No camera, no location.
- `capabilities.agent` — **an in-app AI agent**. Declaring it makes the runtime inject a small GifOS agent (a bar + a read-DOM → ask-model → click/type loop) **into the app's sandboxed iframe**. Because that iframe is an opaque origin, the agent can only ever see and act on **this one app's** DOM — its blast radius is the app itself, never GifOS's chrome, the user's other apps, or their keys/data. Its "brain" is the user's **Smartest** model, brokered by the runtime (a dedicated `agentChat` channel), so the API key never enters the sandbox — the same reason `connect-src 'none'` forbids the app from reaching any network directly. The user starts each task and can stop it; runs are step-capped and shown. This is the deliberately-confined answer to "let an AI drive the UI": inject it where it's already contained, rather than in the trusted origin that holds the keys.
- `capabilities.wasm` — **the WASM hatch**. A sandboxed app normally *cannot run WebAssembly*: the default app CSP has no `'wasm-unsafe-eval'` (Chrome refuses WASM under a bare `script-src 'unsafe-inline'`) and no `worker-src` (workers are blocked). Declaring `wasm` swaps in a policy relaxed by **exactly two things and nothing else**: `'wasm-unsafe-eval'` added to `script-src` (a module can instantiate) and `worker-src blob:` (a heavy engine can run on a Web Worker). **`connect-src` stays `'none'`** — the engine and any worker get *zero* network, so an app must ship its `.wasm` bytes inside itself (e.g. base64) and instantiate from bytes via `WebAssembly.instantiate` / `Module.wasmBinary`, never fetch. Same airtight sandbox, just allowed to *compute*; the launch acknowledgement says the app "runs a compiled engine on your device." This is what lets an app carry a real engine — e.g. **Chess Grandmaster** bundles full-strength Stockfish (NNUE) and runs it entirely offline in the sandbox.
- `capabilities.ai` — the app may call `gifos.ai.chat/tts/stt/image/imageToVideo/video` and `gifos.ai.models()`. Declare it as an **array of the AI types the app actually uses** — `"ai": ["smartest","cheapest","image"]` — from `smartest`/`cheapest` (text), `tts`, `stt`, `image`, `image_to_video`, `video`; the runtime **gates calls to the declared types**, the acknowledgement lists them by their Settings label, and a missing one produces a specific prompt ("*Text → image isn't set up yet*"). A bare `true` is the legacy generic form (any type, unnamed). The user configures OpenAI-shaped endpoints + keys per type in **Settings → AI models** (stored in `localStorage`, per-origin, and excluded from a shareable backup GIF). The runtime attaches the key and returns the result; **the app never sees a key** and is portable across providers.
- `capabilities.api` — an **array of named third-party APIs** the app uses (`"api": ["deepgram"]`), for keyed services that aren't OpenAI-shaped. The user names each API in **Settings → Third-party APIs** with a base URL, an auth scheme (`bearer` / `token` / custom `header` / `query` param) and a key (again `localStorage`, per-origin, out of any backup GIF). The app calls `gifos.api(name, { method, path, query, headers, body, as })`; the runtime attaches the credential per the configured scheme and **pins it to the API's own origin** — a request whose resolved URL leaves that host is refused, so an app can never redirect the key elsewhere. Same broker pattern as `ai`, generalised to any key. **Browser reachability:** these are direct `fetch`es from the page origin, so the target must return permissive CORS headers. Providers that only serve server-to-server (e.g. Deepgram's REST API sends no `Access-Control-Allow-*`) are handled by an **optional CORS proxy** the user toggles per-API in Settings: the runtime then sends the request to `cors-proxy.gifos.app` (a stateless Cloudflare Worker in `cors-proxy/`) with the true destination in an `x-gifos-target` header, and the Worker forwards it and adds the CORS headers. The proxy stores nothing, is gated to `gifos.app` origins, and only forwards to an allow-list of API hosts; users can point at their own copy (widening the allow-list) via an Advanced field. Because Workers bill by request/CPU and never by bandwidth, running it is effectively free — the metered API cost stays on the user's own key.
- `requires` (optional) — an **array of required capabilities**. Capabilities are **optional by default**: an app launches even if the user hasn't set up an AI model or a third-party key, so they can look around and see what it is. Listing a capability key (e.g. `"ai"`) or a third-party API name (e.g. `"deepgram"`) in `requires` makes it **mandatory** — the runtime (`run.html`) checks the user's config on launch and, if a required item isn't set up, shows a **blocking gate** ("<App> needs setup to run") instead of letting the app run, with a re-check that clears once configured. Only settings-backed capabilities are gated (an AI model; a named third-party account); device permissions (`microphone`/`camera`/`motion`) and `network` are granted at use, so requiring them never blocks. Prefer optional; require only what the app is useless without.
- `system` (optional) — names a **system app**. Live camera/microphone can't run in the sandbox (WebRTC is neutered there and an opaque origin can't be granted camera permission), so a manifest like `{ "system": "meet" }` makes the runtime route the icon to a trusted first-party page instead of mounting the sandbox. The mapping is a **whitelist in the runtime** (`meet → meet.html`); a manifest cannot route to arbitrary URLs. The icon is still a real GIF — shareable, downloadable, with its own artwork — and carries a fallback `index.html` for non-GifOS environments.

## GIF Format: How a Filesystem is Stored

The low-level GIF mechanics are unchanged; only the payload's meaning changed (a filesystem archive rather than a JSON `{code}` blob).

### GIF89a structure

```
GIF Header
├── Logical Screen Descriptor
├── Global Color Table (adaptive palette from the artwork)
├── NETSCAPE2.0 loop extension (the icon animates forever)
├── Frames 1..N: the app's ANIMATED ARTWORK
│   └── hand-designed per app (SVG → canvas → adaptive-palette frames)
├── Application Extension Block: "GIFOS1.0"
│   └── payload in chained 255-byte sub-blocks:
│       flag byte (0x01 = deflate) + compressed JSON archive
│       { v: 1, files: { path → base64 bytes } }  ← filesystem + .state/
└── GIF Trailer
```

- **Primary storage:** the `GIFOS1.0` Application Extension block holds a deflate-compressed archive of the whole filesystem (native `CompressionStream`, no dependencies), split across 255-byte sub-blocks. Legacy uncompressed payloads still decode.
- **The visible frames are real artwork.** Each default app ships hand-designed animated SVG art (`gifos-icons.js`) in the GifOS house style — cute outlined sticker characters on a fully transparent background (GIF transparency flag, palette index 0 reserved) — rasterized through an adaptive-palette quantizer into the GIF's frames, so an App GIF looks like a living sticker everywhere, not machine noise. Apps a user creates get their declared `<link rel="icon">` SVG, or a generated animated sticker.

## Encoding Pipeline (Export / Save)

```
App filesystem + current state
    │
    ▼
Serialize state (DB → .state/db.json)
    │
    ▼
Pack filesystem into a JSON archive → deflate (CompressionStream)
    │
    ▼
Split into 255-byte sub-blocks → GIFOS1.0 Application Extension
    │
    ▼
Rasterize artwork frames (SVG → canvas → adaptive palette)
    │
    ▼
Assemble GIF89a  →  a full self-contained snapshot
```

### Repack: saves never touch the artwork

Once a GIF exists, saving new state into it does **not** re-run the pipeline.
`repack(originalBytes, files)` locates the `GIFOS1.0` extension block inside the
existing GIF and swaps **only its sub-block payload**, leaving the header,
palette, and every artwork frame byte-for-byte identical. Both the in-app
**Snapshot** button and the desktop's **Download** menu use repack, so custom
icon art survives every save-and-share cycle. A fresh encode happens only when
no original bytes exist (first creation).

## Decoding Pipeline (Load / Run)

```
User double-clicks a .gif icon
    │
    ▼
Parse GIF89a structure
    │
    ▼
Find "GIFOS1.0" Application Extension
    │
    ├── Found?     → reassemble sub-blocks → decompress → unpack filesystem
    └── Not found? → plain file → opens in its own tab like any image
    │
    ▼
Open new tab, mount filesystem in iframe
    │
    ├── /index.html present → run app, hydrate .state/ into the runtime DB
    └── /index.html absent   → render browsable directory listing
```

## Layer 3 — The Runtime Library (Desktop ↔ App)

When an app runs in its tab, the **desktop (parent/opener window)** exposes a **runtime library** to it. An app that knows about the library can request capabilities; an app that ignores it just runs as a static site. The headline capability is a **database**, and it's what makes an app a server or a client.

### Server vs. client — decided by where the DB lives

```
                     ┌─────────────────────────────┐
   App asks runtime  │  Is there a remote DB in     │
   for the DB   ───▶ │  my launch URL?              │
                     └───────────┬─────────────────┘
                        no │             │ yes
                           ▼             ▼
                  ┌─────────────┐   ┌──────────────────────┐
                  │  SERVER      │   │  CLIENT               │
                  │  host the    │   │  connect to the       │
                  │  central DB  │   │  remote DB via relay  │
                  │  locally     │   │  (server's browser)   │
                  └─────────────┘   └──────────────────────┘
```

- **Server mode:** this browser holds the authoritative database. Reads/writes are local; the runtime broadcasts changes to connected clients through the relay.
- **Client mode:** the app's DB calls are forwarded over the relay to the server browser, which owns the data.

The app developer writes against **one DB API**. Whether it resolves locally (server) or remotely (client) is decided by the launch URL, not by the app.

### Trust boundary

- The app runs in an **iframe inside its own tab**; the desktop/runtime is in the **parent/opener window**. The app never touches the raw database or the relay socket directly — it calls the runtime library, which mediates every operation.
- The runtime enforces `manifest.json` **capabilities**: an app without `db` gets no database; an app can only reach `network` hosts it declared.
- **Join URLs are capability tokens.** A client's URL grants access to a specific server session and nothing else (see Layer 4). The server's runtime validates joins before wiring a client to the DB.

## Layer 4 — The Relay (`gifos.app`) and Join URLs

`gifos.app` is a **stateless relay**. It passes messages — including GIF bytes — between browsers and **stores nothing**: even join tokens and video-room passwords live in the occupants' socket attachments (connection state that dies with the connection), never in storage. Sockets are accepted through Cloudflare's WebSocket Hibernation API, so idle sessions cost nothing while nobody is talking. It is the only always-on infrastructure, and it holds no user data, no app data, and no state.

Two session shapes share the same Durable Object: **host/client app sessions** (the host's browser is the server) and **host-less `mesh` rooms** (meetings — every participant equal, the room lives at its URL forever, whoever shows up talks to whoever is there). Details in [cors-and-networking.md](cors-and-networking.md).

### Apps inside meetings

A meeting (`meet.html`) and an app tab (`run.html`) are two entrances to the
same place: a room that can hold **live media and a shared app at once**. They
compose the two session shapes above rather than merging them:

- **Run app** in a meeting boots the chosen app through the normal app runtime,
  hosts it (`forever`, resilient), and advertises its join info — `{ s, k, relay,
  name }` — inside the host's own **status heartbeat**. Every participant's
  meeting reconciles against that gossip and mounts the app as a runtime
  **client**, so all faces share one live app session (its own sid, separate
  from the media mesh). Late joiners pick it up on the next heartbeat; when the
  sharer stops or leaves, the pane tears down everywhere.
- **Meeting** in an app tab hands the same app off to `meet.html#app=<fileId>`
  — same browser, same saved state — which auto-hosts it and lights the media
  up. Both doors land on the identical layout: the app on the stage, participant
  tiles as a filmstrip, meeting controls in the bar.

The media mesh and the app's data channels are independent peer connections
over the one relay room; the app never touches the camera (that stays with the
trusted meeting page), so the sandbox guarantees are unchanged.

### The shareable launch URL

When an app opens in a tab, that tab has a URL that can be handed to friends. The URL carries everything the relay needs to bootstrap a client:

```
https://gifos.app/run.html#s=<session-id>&k=<join-token>&relay=<relay-url>
```

- `s` — the server session to connect to (a Durable Object instance on the relay).
- `k` — a join token the relay checks against the host's token before admitting the client.
- `relay` — which relay hosts the session (normally `wss://relay.gifos.app`).

The app GIF itself is **delivered by the host browser** over the session on
join — the relay never stores it, and the bandwidth guard's burst allowance
(1 MB) exists precisely to let this one-time delivery through.

### The `?run=` link — open any app GIF by URL

`https://gifos.app/?run=<url-to-a-gif>` is a shareable "open this app" link. On
load the desktop fetches that GIF, files it into the user's **Stolen Apps**
folder (so it persists), and — if it's a real app GIF — runs it (a same-tab
redirect to `run.html`, avoiding a popup-blocked `window.open`). The `?run=`
query is stripped from the address bar first, so a refresh never re-runs it.
The fetch is a direct browser request, so the GIF's host must allow CORS
(GitHub raw and most CDNs do); if it doesn't, the user gets a clear error and
can download + `＋ Add` instead. The app still runs sandboxed and shows the
capability acknowledgement — `?run=` is a convenience over "download then add",
not a new trust path.

Flow when a friend opens the link:

```
Friend opens join URL
   │
   ▼
Relay delivers the app GIF ──▶ client unpacks it into a tab
   │
   ▼
Client runtime sees s=/k= in the URL ──▶ enters CLIENT mode
   │
   ▼
Relay bridges client DB calls ⇄ server browser's central DB
```

The app the friend runs is identical to the server's; only the DB target differs.

## State, Resume, and Failover

### State lives with the icon

On the server, an app's state is **always associated with its GIF icon on the desktop** (stored under `/appstate/<gifId>/`). Close the tab and double-click the icon again → the app resumes exactly where you left off. Nothing is lost by closing a tab.

### Snapshots

A **snapshot** is a full export of the running app — filesystem plus current state — as one self-contained GIF. **Clients can snapshot at any time**, capturing the shared state as they last saw it.

### Server lifecycle on close

What happens when the server drops (close/crash/battery) is set by the
**resilience** dial chosen at Invite time (see *Multiplayer & data* under
Security), not the lifetime:

| Resilience | On host drop |
|------------|--------------|
| **off** (default) | No guest mirrored the state, so nobody can resume it — the session ends for everyone. Reopening the icon within a still-valid window resumes the same link (or, for `close`, mints a fresh one). |
| **on** | Guests mirror the state; if the server stays gone a still-connected guest self-heals the session (below). Works for any lifetime, so a resilient `1h` link survives a dead battery yet still stops admitting strangers at the deadline. |

Lifetime is independent: expiry only stops *new* joins; it never kicks the
people already connected.

### Failover from a snapshot (resilient links only)

Only a link with **resilience on** mirrors state to guests, so only it can
survive the server's browser **dying** (crash, closed, offline). A
resilience-off link has exactly one host by design. For a resilient link:

```
server browser gone
   │
   ▼
any user holding a snapshot can "Become Server"
   │
   ▼
that snapshot's state is loaded as a new central DB
   │
   ▼
a new join URL is issued; remaining clients reconnect
```

Recovery fidelity equals the **freshest available snapshot** — clients are encouraged to snapshot periodically for resilience.

## Computer Images — GifOS Boots Inside Itself

**GifOS menu → Back up desktop** packs the entire computer into one GIF: every
file's bytes, every icon position, every app's saved state, all inside a
`{ "type": "desktop" }` manifest. That GIF is a **computer image**, and it can
be *booted*, not just restored.

Double-clicking a computer image offers two paths:

| Action | Effect |
|--------|--------|
| **▶ Boot this computer** | `boot.html` hydrates the image into its own IndexedDB namespace (`gifos_vm_<fileId>`) and runs the full desktop shell against it in a new tab. The host desktop is untouched. |
| **Replace this desktop** | The classic destructive restore into the current namespace. |

Properties of a booted image:

- **Isolation is total.** The VM's items, files, and app state live in their own
  database; its cross-tab sync and per-app channels are namespaced, so a booted
  computer never repaints — or leaks state into — the host desktop.
- **Apps work normally.** Icons inside the VM open through
  `run.html#id=…&db=gifos_vm_…`, so app files and saved state resolve inside
  the image. Multiplayer, snapshots, everything works.
- **It persists.** Re-opening the same image resumes that computer exactly
  where it left off. **⏏ Reboot fresh** wipes the namespace and re-hydrates
  from the image bytes.
- **It recurses.** A booted desktop can hold more computer images and boot
  them; each nesting level is just another namespace. It can also back *itself*
  up — producing a new image of the running VM.

This is the whole thesis in one feature: if apps are files and state lives in
files, then a computer is a file too — and a file can run anywhere, including
inside another computer.

## Security Considerations

> For the full picture — trust boundaries, adversaries, per-boundary mitigations,
> and explicit non-goals — see the [threat model](./threat-model.md). This
> section summarizes the mechanisms.

### App isolation & namespacing

Each app runs in a **sandboxed iframe** (`allow-scripts allow-forms`, no
`allow-same-origin`), so it has an **opaque (null) origin**. Consequences:

- **Storage is per-icon and collision-free.** The only persistence an app has is
  `gifos.db()`, whose backend is keyed by the **desktop icon's fileId**, not by
  `appId`. Two different apps → different fileIds → fully separate databases.
  Duplicating an icon forks its data; opening the *same* icon twice shares it.
- **Native browser storage is unavailable, not shared.** `localStorage`,
  `IndexedDB`, and `cookies` throw in an opaque origin — so there's nothing to
  collide in, and an app cannot reach the desktop's own `gifos` database.
- **The postMessage bridge is bound per-iframe.** The runtime checks `e.source`
  is that app's window, and its DB closure is hard-wired to that icon's fileId —
  an app cannot name another icon's fileId to read a neighbor.

> **Why there is no `capabilities.db` allowlist.** `gifos.db(name)` only names a
> *collection within the calling app's own fileId partition* — the bridge message
> carries no fileId, so there is no way for an app to address another app's data.
> Isolation is structural (one store per icon), not policy-based, so a per-app
> capability gate would only restrict an app from its *own* collections and buy no
> security. This is deliberate; don't add DB gating expecting a cross-app benefit.

### Network: the bridge is the only way out

A **Content-Security-Policy** `<meta>` is injected as the first child of every
app document (`default-src 'none'`; `connect-src 'none'`; inline script/style
and `data:`/`blob:` assets only; `form-action`, `frame-src`, `object-src`,
`base-uri` all `'none'`). The browser therefore refuses every direct network
primitive from app code — `fetch`, `XMLHttpRequest`, `WebSocket`,
`EventSource`, `sendBeacon`, image/media beacons, external form posts. WebRTC
(whose DataChannels bypass `connect-src`, and whose CSP directive isn't
universally supported) is neutered by removing `RTCPeerConnection` &co. in the
injected shim before app code runs. The **one** sanctioned relaxation is
`capabilities.wasm` (above): it adds `'wasm-unsafe-eval'` + `worker-src blob:`
so an app can run a compiled engine, but leaves `connect-src 'none'` untouched —
compute is unlocked, network is not.

The **only** network path is `gifos.fetch()` → postMessage → runtime, which
enforces the manifest `network` allowlist and executes from the runtime's real
origin (not governed by the app CSP). So the allowlist is real policy, not
etiquette: an undeclared host is unreachable. Residual theoretical leak: an app
can navigate *its own* window away (no CSP directive covers this), which is
one-shot, low-bandwidth, and destroys the app UI in plain sight.

### Multiplayer & data

- The runtime enforces per-app **capabilities** from `manifest.json` (db,
  multiplayer, network allowlist). System-app routing (`manifest.system`) is a
  hardcoded whitelist — a GIF cannot name an arbitrary page.
- **Join tokens** scope a client to a single server session; the relay
  validates every join against the host's token.
- **An invite link is a capability, not a viewer pass.** A joiner's browser
  mirrors the full app dataset to stay in sync, so anyone with the link can
  Download Snapshot a complete copy — and there is no un-sharing what already
  synced. Invite exposes **two independent dials**:
  - **Lifetime** — how long the link admits *new* joiners. `close` (default) is
    a fresh id each open, retired for good on close/rotate; `1h`/`24h` set an
    admission deadline; `forever` never expires. Expiry only shuts the door:
    `attachHost` refuses an *unknown* peer past `exp` (sends it `ended
    (expired)`) while every already-connected peer stays. It never ends a live
    session.
  - **Resilience** (`heal`) — whether a still-connected guest may take over if
    the host drops. Off by default (the session ends with you — safest for
    private data); on mirrors state to guests to enable self-healing (see
    Failover). `close` forces it off (a link that dies on close can't be kept
    alive by another). This is orthogonal to lifetime, so a **1h game can be
    resilient** — a dead battery doesn't end it, and it still stops admitting
    strangers after an hour.
  The host advertises `heal` and `exp` in the per-peer `app` message; guests
  gate mirroring on `heal` and a promoted healer keeps enforcing `exp`. **New
  link** rotates the session id, broadcasting `ended (revoked)` to guests on the
  old link. One live link per app.
- Snapshots are plain GIFs — treat a shared snapshot as sharing the data it
  contains.
- The relay is a dumb pipe: it routes by session but never inspects, stores, or
  decrypts payloads; P2P DataChannels are DTLS-encrypted end-to-end. A
  server-side **token-bucket bandwidth guard** (1 MB burst, ~384 Kbps
  sustained) makes it physically unusable for streaming media — see the
  networking doc.
- **App delivery scales past the relay budget over P2P.** A joining peer needs
  the app archive to boot. A *small* app rides the relay immediately (fast first
  paint, inside the burst). A *heavy* app — e.g. one bundling a multi-megabyte
  WASM engine — is far past the relay's per-message cap, so `attachHost` defers
  it: the peer is flagged `needsApp` and the archive is handed over the **P2P
  DataChannel** the moment it opens (`channel.onopen`), paced to the channel's
  `bufferedAmount` so the send buffer never overflows. The relay is only ever
  signalling + fallback; once peers are connected directly there is no bandwidth
  ceiling. The transport fragmentation layer reassembles up to ~25 MB
  (`FRAG_MAX_PARTS`), and the client receives the app over whichever transport
  delivered it (the same `receiveApp` path serves relay and DataChannel). If the
  DataChannel never opens within `APP_P2P_WAIT` (symmetric NAT, and there's no
  TURN), the host falls back to **dripping the app over the relay paced under its
  ~48 KB/s refill** (`relayPaced`) so nothing is dropped — slow (minutes for a
  big app) but it still arrives. Throughout, the joiner isn't a blank page: a
  loader in the mount area narrates the stage ("Connecting…", "opening a direct
  route…", "Receiving the app…") and shows a **live percent** bar driven by the
  defragmenter's progress callback, labelling whether the app is coming over the
  direct channel or the (slower) relay.
- **Booted computer images** run in separate IndexedDB namespaces with
  namespaced broadcast channels; a VM cannot read, write, or repaint the host
  desktop (and vice versa).

## Versioning & Compatibility

The site is static files. `gifos.app/` is always the **latest** build; every past
build is archived unchanged under `/versions/<x.y.z>/`. Because web storage is
**per-origin, not per-path**, all builds on `gifos.app` share one IndexedDB —
which drives the compatibility rules below.

### Two compatibility surfaces

1. **Shell ↔ stored desktop data** (the `gifos` IndexedDB: items, files,
   appstate). Migrations are **additive-only**: never drop/rename a store, never
   require a field old records lack; read defensively with defaults. This is
   what lets an older archived build safely read a desktop the latest build has
   touched — the guarantee that makes version pinning safe rather than a trap.
2. **App-GIF ↔ runtime API** (`window.gifos`). App GIFs are files that outlive
   the shell they were made on (saved, shared, received in chats), so the API is
   a **stable, add-only contract**, keyed by the manifest's `gifos` version. The
   runtime only *adds* surface; if a breaking change is ever unavoidable, the
   runtime branches on the declared version so old GIFs keep running.

### Update delivery

The shell bakes in its version (`window.GIFOS_VERSION`) and, on load, fetches
`/version.json` (no-store) to learn the deployed `current`. If it's behind, a
dismissible **update bar** invites a reload — the user chooses when, so state is
never yanked mid-use. (GitHub Pages' short HTML cache means a reload picks up the
new build.)

### Version pinning

Deep **Settings → Version** lists the archived versions and lets a user pin one.
Pinning writes `localStorage.gifos_pin`; a tiny bootstrap in the canonical
`index.html` reads it before anything else loads and redirects to
`/versions/<pin>/`. `gifos.app/?unpin` (or "Return to latest" in Settings)
clears it. Archived builds live under `/versions/` and never re-redirect, so
there is no loop, and because every pinnable build carries the Settings UI,
unpinning is always available. Cutting a release: `scripts/archive-version.sh`.

## Size Limits

| Scenario | GIF size | Capacity |
|----------|----------|----------|
| Small app, no state | ~50–100KB | Code + assets |
| App + moderate state | ~500KB–2MB | Thousands of records |
| App + files/images | 2–10MB | Documents, photos |
| Practical max | ~50MB | Large datasets |

GIF has no hard size limit; the practical limit is what platforms will transmit and display.

## Future Considerations

- **App Store** — gifos.app as a public directory of App GIFs.
- **Versioning** — upgrade an app GIF while keeping its embedded state compatible.
- **Merge** — combine two snapshots (git-style merge for shared app state).
- **Encryption** — password-protected GIFs and end-to-end encrypted relay sessions.
- **Multi-server** — sharded or replicated DBs for larger sessions instead of a single host browser.
- **Signed-app phone-home (possibility, not a commitment)** — let an app
  signed by a domain talk to *that domain only*: the signature would
  **constrain** the existing manifest-gated API bridge rather than grant a
  new power (an app may only request hosts matching its signing domain, so
  the badge identity and the data's destination are provably the same
  party). Conditions that make it defensible: explicit per-app user
  permission, all traffic shell-mediated through the bridge (never raw
  network in the sandbox), a loud always-visible indicator while the app is
  phoning home, and a per-app traffic log ("sent 14 KB to notes-app.com
  today"). Known costs it would trade against the core promises: the author
  is exactly the party most motivated to collect user data, and a
  phone-home app's behavior becomes server-controlled — the bytes still
  verify while the conduct can change — so this stays opt-in, loudly
  indicated, and off by default if it ever ships at all.

## Provenance Signatures

Any App GIF can be **signed** so GifOS can display who made it — the DKIM model
for files. A signature proves *authorship of these exact bytes*; it does **not**
assert the app is safe, and anyone can strip a signature (the file just becomes
anonymous). Verdicts are honest: **signed / unsigned / tampered** (never
"malware" — a signature can't prove that).

### Where the signature lives

A `GIFOSSIG` Application Extension block, a sibling of the `GIFOS1.0` filesystem
block, appended before the trailer. It holds JSON:
`{ v, type: 'domain'|'email', id, alg, sig (base64), ts }`. Verification excises
this block byte-for-byte before hashing, so a GIF can be signed after it's built
and re-signed later.

### What is signed (canonical content hash)

`SHA-256( visualBytes ‖ 0x00 ‖ filesDigest )` where `visualBytes` is the GIF
with the `GIFOS1.0` and `GIFOSSIG` blocks removed (all pixels/artwork), and
`filesDigest` is `SHA-256` over the sorted `path\0sha256(bytes)` list of every
app file **except `.state/**`**. Consequence: **saving app state never voids a
signature** (state lives only in `GIFOS1.0`, and `.state` is excluded), but
changing app code or artwork does. The identity string is folded into the signed
statement, so a signature can't be re-attributed to a different identity that
shares a key.

### Deriving the key location from the identity (the security crux)

The key URL is **never embedded** — it is derived from the identity being
displayed, so "Signed by X" is exactly as strong as controlling X:

- **domain** (e.g. `example.com`): Ed25519. The 32-byte public key must be
  base64 at `https://example.com/gifos.key` (served with CORS). Signing and
  verifying use native WebCrypto Ed25519 — zero dependencies.
- **email** (`alice@example.com`): OpenPGP. The signer signs the canonical
  statement with their own PGP key; the verifier fetches their key from
  `keys.openpgp.org` by email and verifies a detached OpenPGP signature — Ed25519, or RSA ≥2048 (via WebCrypto
  RSASSA-PKCS1-v1_5; most existing PGP keys are RSA).
  keys.openpgp.org only serves identity info for addresses the owner has
  confirmed, so an email-bound key that verifies = the address owner signed. The
  OpenPGP parser is hand-written (validated against real `gpg` output) — still
  no dependency.

### Trust boundary & UI

Verification runs in the **desktop shell** (which may fetch cross-origin), never
in the app sandbox. First-seen keys are pinned per identity (TOFU) and a key
change is flagged. Verdicts are cached per session so icons don't re-ping key
hosts on every render (also a privacy win). A shield badge sits on signed icons;
the run bar shows **✓ Signed by …**; the icon context menu has **Verify
signature**; signing happens at `sign.html` (private keys never leave the
browser for domain; never touch the page at all for email).
