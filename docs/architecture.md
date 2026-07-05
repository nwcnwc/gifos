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
├── items      ← desktop icons + folders (layout, positions, sizes)
├── files      ← the raw bytes of every dropped file (keyed by id)
└── appstate   ← saved state per app icon (keyed by fileId)
```

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
  "name": "Chess",
  "version": "1.0.0",
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

- `capabilities.db` — the app wants the runtime database library.
- `capabilities.multiplayer` — the app can host/join sessions over the relay.
- `capabilities.network` — external API hosts the app may call through the fetch bridge (see the networking doc).
- `system` (optional) — names a **system app**. Live camera/microphone can't run in the sandbox (WebRTC is neutered there and an opaque origin can't be granted camera permission), so a manifest like `{ "system": "video" }` makes the runtime route the icon to a trusted first-party page instead of mounting the sandbox. The mapping is a **whitelist in the runtime** (`video → video.html`); a manifest cannot route to arbitrary URLs. The icon is still a real GIF — shareable, downloadable, with its own artwork — and carries a fallback `index.html` for non-GifOS environments.

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
- **The visible frames are real artwork.** Each default app ships hand-designed animated SVG art (`gifos-icons.js`), rasterized through an adaptive-palette quantizer into the GIF's frames — so an App GIF looks like a living icon everywhere, not machine noise. Apps a user creates get their declared `<link rel="icon">` SVG, or a generated animated tile.

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

`gifos.app` is a **stateless relay**. It passes messages — including GIF bytes — between browsers and **stores nothing**. It is the only always-on infrastructure, and it holds no user data, no app data, and no state.

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

When the server closes the tab, they choose:

| Choice | Effect |
|--------|--------|
| **Lock** | Clients are suspended until the server reopens the app icon. |
| **Continue** | Clients keep playing — **but only while the server's browser stays online**, since the server browser still owns the DB. |

### Failover from a snapshot

If the server's browser **dies** (crash, closed, offline), the session is not necessarily lost:

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

### Network: the bridge is the only way out

A **Content-Security-Policy** `<meta>` is injected as the first child of every
app document (`default-src 'none'`; `connect-src 'none'`; inline script/style
and `data:`/`blob:` assets only; `form-action`, `frame-src`, `object-src`,
`base-uri` all `'none'`). The browser therefore refuses every direct network
primitive from app code — `fetch`, `XMLHttpRequest`, `WebSocket`,
`EventSource`, `sendBeacon`, image/media beacons, external form posts. WebRTC
(whose DataChannels bypass `connect-src`, and whose CSP directive isn't
universally supported) is neutered by removing `RTCPeerConnection` &co. in the
injected shim before app code runs.

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
- Snapshots are plain GIFs — treat a shared snapshot as sharing the data it
  contains.
- The relay is a dumb pipe: it routes by session but never inspects, stores, or
  decrypts payloads; P2P DataChannels are DTLS-encrypted end-to-end. A
  server-side **token-bucket bandwidth guard** (1 MB burst, ~384 Kbps
  sustained) makes it physically unusable for streaming media — see the
  networking doc.
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
