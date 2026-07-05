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

- Renders **icons** for every GIF and file the user has dropped in.
- Supports **drag-and-drop of any file**, **folders**, renaming, and arrangement.
- **Plays GIFs in-icon**, with resizable icons for a larger preview.
- **Double-click dispatch:**
  - Executable GifOS GIF → open a new tab and run it (Layer 2).
  - Anything else (`.jpg`, `.pdf`, a plain non-GifOS `.gif`, unknown formats) → show a **"not supported"** message.
- **Persists locally.** The desktop's contents live in the browser via **IndexedDB / OPFS**. There is **no account, no login, no server sync** — the desktop belongs to this browser, consistent with "nothing lives on our server." (A desktop does not follow you to another device; move a file by sharing its GIF.)

### Desktop storage model

```
IndexedDB / OPFS (this browser only)
├── /desktop/                 ← icon layout, folders, positions
├── /files/<id>.gif           ← the raw bytes of every dropped file
└── /appstate/<gifId>/        ← saved state per app icon (see "State & Resume")
```

Because storage is local and unsynced, GifOS never needs an identity system. The "account" is the browser profile.

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

## GIF Format: How a Filesystem is Stored

The low-level GIF mechanics are unchanged; only the payload's meaning changed (a filesystem archive rather than a JSON `{code}` blob).

### GIF89a structure

```
GIF Header
├── Logical Screen Descriptor
├── Global Color Table
├── Frame 1: Human-Readable Preview
│   ├── App name, icon, description
│   ├── Save date, state summary
│   └── Preview thumbnail
├── Application Extension Block: "GIFOS1.0"
│   ├── Version
│   ├── Compressed payload (chained 255-byte sub-blocks)
│   │   └── Deflated archive: the app's filesystem + embedded .state/
│   └── Checksum
├── Frame 2+: Pixel-Encoded Backup Data (optional)
│   └── RGB values encode bytes (~192KB per 256×256 frame)
└── GIF Trailer
```

- **Primary storage:** the `GIFOS1.0` Application Extension block holds a deflated archive of the whole filesystem, split across 255-byte sub-blocks.
- **Backup path:** large assets can additionally be pixel-encoded in frames 2+ for platforms that strip extension blocks.
- **Frame 1** stays a real, viewable image so the GIF looks like a screenshot everywhere.

## Encoding Pipeline (Export / Save)

```
App filesystem + current state
    │
    ▼
Serialize state (DB + preferences → .state/*.json)
    │
    ▼
Pack filesystem into an archive
    │
    ▼
Compress (pako deflate)
    │
    ▼
Split into 255-byte sub-blocks → GIFOS1.0 Application Extension
    │
    ▼
Render Frame 1 preview (Canvas)  ├─ optionally pixel-encode assets in Frame 2+
    │
    ▼
Assemble GIF89a  →  download as .gif  (a full self-contained snapshot)
```

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
    └── Not found? → not a GifOS app → "not supported" message
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
https://gifos.app/run#s=<session-id>&app=<gif-locator>&k=<join-token>
```

- `app` — how to obtain the app GIF (so a new client can download and unpack it).
- `s` — the server session to connect to.
- `k` — a join token the server validates before granting DB access.

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
  multiplayer, network allowlist).
- **Join tokens** scope a client to a single server session; the server
  validates every join.
- Snapshots are plain GIFs — treat a shared snapshot as sharing the data it
  contains.
- The relay is a dumb pipe: it routes by session but never inspects, stores, or
  decrypts payloads; P2P DataChannels are DTLS-encrypted end-to-end.

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
