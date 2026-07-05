# GifOS

**Your GIF-powered operating system.**

> One HTML shell. A desktop of GIFs. Every app is a file you own.

🌐 [gifos.app](https://gifos.app)

## What is GifOS?

GifOS turns your browser into a desktop where **every app is a GIF**.

Visit [gifos.app](https://gifos.app) and you land on a **desktop** — icons, folders, drag-and-drop, exactly like Windows or macOS. Every GIF (and any other file) you've ever dropped in is sitting there as an icon. Double-click an executable GIF and it opens in its own **browser tab** and runs. Everything is just files, and the files are yours.

- **The Desktop** (`index.html`) — A persistent web desktop that holds your GIFs and files as icons. It lives in your browser; nothing is stored on our servers.
- **App GIFs** — Applications packed into GIF images. A GIF is a little filesystem; if it has an `index.html`, double-clicking runs it as an app. Its saved state travels **inside the same GIF**.
- **gifos.app** — A stateless message relay. When apps go multiplayer, it passes messages (and GIFs) between browsers. It never stores anything.

No installs. No accounts. No app servers. Just files on a desktop.

## The Desktop

```
┌──────────────────────────────────────────────────────────┐
│  gifos.app                                          ▢ ✕   │
│                                                            │
│   📦          💾          📁          🖼️                  │
│  crm.gif   budget.gif   Work/     photo.jpg               │
│                                                            │
│   🎮          📦                                          │
│  chess.gif  notes.gif      ← drop any file here            │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

- **Drop any file** onto the desktop — it becomes an icon.
- **GIFs play** right in the icon; resize an icon to see the GIF better.
- **Make folders** to organize things, just like a real desktop.
- **Double-click an executable GIF** → it opens in a new tab and runs.
- **Double-click anything else** (a `.jpg`, a `.pdf`, a plain `.gif`) → GifOS shows a **"not supported"** message. Only GifOS-format GIFs execute.

Your desktop persists **locally in your browser** (IndexedDB / OPFS). There's no login and no sync — the desktop belongs to this browser, because nothing lives on our server.

## How an App GIF Runs

Double-click an executable GIF and GifOS:

1. Opens a **new browser tab**.
2. **Unpacks the GIF into a filesystem** inside that tab's iframe.
3. Hands control to the app's **`index.html`**.
4. If there's **no `index.html`**, the tab instead shows a **browsable filesystem** — like an unguarded folder served off a web server.

```
double-click crm.gif
        │
        ▼
   new browser tab
        │
        ▼
   unpack GIF → in-memory filesystem
        │
        ├── has index.html? → run it as an app
        └── no index.html?  → browse it as a folder
```

## Multiplayer: Any Browser Can Be the Server

The desktop (the parent window) exposes a **runtime library** to the app tab. If an app knows about it, it can ask for **database capabilities** — and that's what makes a GifOS app either a **server** or a **client**:

- **Server** — your browser hosts the central database. The app reads and writes locally.
- **Client** — the app connects to a **remote** database (someone else's browser) through the gifos.app relay.

When an app launches, its tab has a **shareable URL**. Send it to friends and that URL carries everything the relay needs to (1) deliver the app GIF to them and (2) point their copy at **your** database instead of their own. They join your session — a multiplayer game, a shared document, a multi-user app — with one link.

```
   You (server browser)                 Friend (client browser)
   ┌───────────────────┐                ┌───────────────────┐
   │  chess.gif tab    │                │  chess.gif tab    │
   │  ├ app            │  ── join URL ─▶ │  ├ app            │
   │  └ central DB ◀───┼──── relay ──────┼──▶ (uses your DB) │
   └───────────────────┘   gifos.app     └───────────────────┘
                          (passes messages, stores nothing)
```

### State, resume, and failover

- **State lives with the icon.** On the server, an app's state is always tied to its GIF icon on the desktop. Close the tab, double-click the icon again, and you're **right back where you were**.
- **Clients can export** a full copy of the app — a complete GIF snapshot — at any time.
- **When the server closes the tab**, they choose: **lock out** clients until they reopen the app, or **let clients keep going** — but only while the server's browser stays online.
- **If the server dies**, any user holding a snapshot can **become the new server** from that snapshot. The session survives.

## Why GIFs?

GIF is the perfect container:
- **Universal** — every platform displays GIFs natively.
- **A filesystem in disguise** — Application Extension blocks and frames store an entire packed directory (code, assets, and saved state).
- **Shareable** — send via chat, email, social. It looks like an image because it *is* an image.
- **Durable** — no one strips GIFs. They survive every platform.

Someone sends you a GIF in a group chat. It looks like a screenshot. Drop it on your desktop and double-click — it **becomes** that app, loaded with their data. Share your work by sharing a file. Fork someone's project by dropping their GIF. It's git for normal people.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/nwcnwc/gifos.git

# Serve the folder (any static server works)
python3 -m http.server 8099
# → open http://127.0.0.1:8099/index.html

# The desktop seeds itself with sample App GIFs on first run.
# Double-click Notes.gif or Guestbook.gif to run one in a new tab.
```

Open **two tabs** of `Guestbook.gif` and sign it in one — the other updates live. That's one browser hosting the database and another reading it, locally.

## Project Status

🚧 **Working proof of concept (v0.2).** The desktop and the GIF-as-app runtime are built and tested end-to-end:

**Built & tested**
- ✅ Persistent **desktop** — icons, folders, drag-to-arrange, drag-into-folders, resize, rename, delete (IndexedDB, local-only)
- ✅ **GIF filesystem codec** — packs a filesystem into a valid, viewable GIF89a and reads it back (verified in Chromium), **deflate-compressed** via native `CompressionStream` (no dependencies; legacy uncompressed GIFs still decode)
- ✅ **Double-click → run in a new tab**; unsupported files show a "not supported" message
- ✅ **Runtime `window.gifos`** — `db()` (persists with the icon, syncs across tabs), `fetch()` bridge, `save()` snapshot
- ✅ **Browsable-filesystem fallback** when a GIF has no `index.html`
- ✅ **Snapshot round-trip** — export the app + live state as one self-contained GIF; dropping a snapshot GIF on any desktop **resumes exactly where it was saved** (embedded state hydrates on first run)
- ✅ **Remote multiplayer, P2P-first** — one browser hosts the DB, others join via a share link. Traffic upgrades to a **direct WebRTC DataChannel** (DTLS-encrypted end-to-end; the relay only performs introductions) and **falls back to the relay automatically** when P2P can't be established — verified for both paths ([`test/e2e-relay.js`](test/e2e-relay.js))
- ✅ **Client capture** — a client saves a full copy of the app + live session state onto its own desktop
- ✅ **Failover** — clients mirror the host's state; if the host browser dies, a client clicks **Become Host** and takes over the *same session* from its mirrored copy; remaining clients keep playing ([`test/e2e-failover.js`](test/e2e-failover.js))
- ✅ **Lock-until-reopen** — the session id/token live with the desktop icon, so closing the host tab locks clients out and reopening the icon resumes hosting on the *same share link*

**Not yet done**
- ⏳ Hosted **`gifos.app` relay** — deploy [`relay/`](relay) to a Cloudflare account and set `js/relay-config.js` (everything above is verified against a protocol-identical local relay)
- ⏳ "Continue while host browser stays online after tab close" (needs desktop-side hosting, e.g. a SharedWorker)

See [docs/architecture.md](docs/architecture.md) for the full design and [`test/`](test) for the codec and end-to-end tests (37 checks across four suites).

## Architecture

- [docs/architecture.md](docs/architecture.md) — the desktop, the GIF filesystem format, execution model, persistence, and failover.
- [docs/cors-and-networking.md](docs/cors-and-networking.md) — the browser-as-server DB relay and the external-API bridge.

## License

TBD — Patent pending concepts. See [LICENSE](LICENSE) for details.
