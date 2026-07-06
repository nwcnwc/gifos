# GifOS

**Your GIF-powered operating system.**

> One HTML shell. A desktop of GIFs. Every app is a file you own — and a whole computer is one GIF.

🌐 **Live at [gifos.app](https://gifos.app)** · relay at `relay.gifos.app` · each digit subdomain (`0.gifos.app` … `9.gifos.app`) is a separate computer

## What is GifOS?

GifOS turns your browser into a desktop where **every app is a GIF**.

Visit [gifos.app](https://gifos.app) and you land on your **Home Screen** — icons, folders, drag-and-drop with grid snap, a system bar, a Trash. Every GIF (and any other file) you've dropped in sits there as an icon. Double-click an executable GIF and it opens in its own **browser tab** and runs. Everything is just files, and the files are yours.

- **The Home Screen** — a persistent, phone-friendly home screen that holds your GIFs and files as icons. It lives in your browser (IndexedDB); nothing is stored on our servers.
- **App GIFs** — applications packed into real, viewable GIF images with **hand-designed animated artwork**. A GIF is a little filesystem; if it has an `index.html`, double-clicking runs it in a hardened sandbox. Its saved state travels **inside the same GIF**.
- **Computer images** — back up your whole desktop as ONE GIF… then double-click that GIF anywhere and **boot it as a computer**, inside GifOS, without touching the desktop it's sitting on. GifOS boots inside itself.
- **The relay** (`relay.gifos.app`) — a stateless message hub for multiplayer. It introduces browsers to each other and passes control messages; it persists nothing (even room passwords live in the occupants' connections), hibernates when idle, and **refuses to carry audio/video**.

No installs. No accounts. No app servers. Just files on a desktop.

## The Home Screen

- **Drop any file** onto the Home Screen — it becomes an icon. GIFs animate right in the icon.
- **Folders, drag-to-arrange (grid snap), rename, resize icons** — works with touch too.
- **Trash** — deletes are recoverable until you empty it.
- **System bar** — the GifOS menu (About, whole-Home-Screen Backup/Restore, Empty Trash, Settings, Reset) and an ＋ Add button (files, folders, paste-an-AI-app, zip import). Persistent storage is requested automatically; usage details live under Settings → Advanced.
- **Right-click any icon** → Open, **Download** (snapshot the GIF — with saved state folded in — without launching it), Rename, resize, Trash.
- **Cross-tab live sync** — two tabs of the same desktop stay identical in real time.

Default apps come organized in folders — **Games** (Tic-Tac-Toe, Connect Four, Minesweeper, Chess Tournament with time controls), **Studio** (Paint), **Tools** (Notes, Calculator, Timer & Stopwatch), **Social** (Guestbook, Chat), and **IRL Games** — party games for game night where everyone joins from their own phone (Fake Facts, One Clue, Same Brain, One Night Wolves) with pass-the-phone versions in a **Single Phone** subfolder (Odd Word Out, Catch the Spy, Tilt, The Dial, Party Roulette) — plus **Welcome** and **Video Call** right on the Home Screen. Every icon is a genuine App GIF with hand-drawn animated **sticker artwork on a transparent background**.

## How an App GIF Runs

1. Double-click → a **new browser tab** opens.
2. The GIF's embedded filesystem is unpacked; `index.html` is mounted in a **sandboxed iframe** (opaque origin, strict CSP — see security below).
3. The app talks to GifOS only through `window.gifos`: `db()` (state that persists with the icon), `me()` (player identity), `fetch()` (manifest-gated), `save()` (snapshot).
4. No `index.html`? The tab shows a **browsable filesystem** instead — like an open folder on a web server.

**Snapshots preserve the artwork.** Saving an app (in-app Snapshot or the icon's Download) *repacks* the GIF: only the embedded filesystem block is swapped, every pixel and animation byte stays identical. Your custom icon art survives every save.

**Make your own apps**: ＋ Add → "Ask an AI to build an app" copies a prompt that teaches any AI the GifOS format; paste back the HTML it returns. Or drop in a single `.html`, or a **`.zip` for multi-file apps** (js/css/assets included).

**Or let your AI do the whole thing (MCP).** Add the GifOS connector to Claude (Settings → Connectors → `https://mcp.gifos.app/mcp`) and just say *"build me a habit tracker for GifOS"* — the AI reads the build guide, writes the app, designs a pixel-art animated icon, and hands you a **finished `.gif` file** via the `pack_app` tool. Drop it on your Home Screen; done. AIs that merely browse the web learn the format from [`gifos.app/llms.txt`](site/llms.txt) and can produce paste-into-＋Add apps with no connector at all. See [`mcp/`](mcp).

**Mod anyone's app — encouraged.** Apps are files, and files get remixed. Hand any GifOS app GIF to an AI — *"add a dark mode"*, *"make the buttons bigger"*, *"turn this counter into a tracker"* — and get a modified `.gif` back: the MCP `unpack_app` tool opens everything inside, `pack_app` splices the changes back into the **same GIF**, so the animation survives byte-for-byte and saved data rides along. (`llms.txt` carries the equivalent Python recipe for AIs without the connector.) See an app you like in a friend's session? **Steal App** drops a fresh copy into your *Stolen Apps* treasure chest to hack on. A modified app ships unsigned — a remix is a new work, and the modder can sign their version.

## Multiplayer: Any Browser Can Be the Server

Press **Invite** in a running app: your browser becomes the host and the tab shows a share link. Friends open the link, receive the app GIF, and join your session — moves, messages, and scores attributed to each player's **screen name**.

- **P2P-first.** Traffic upgrades to a direct, DTLS-encrypted **WebRTC DataChannel** (~80–90% of networks); the relay stays connected as automatic fallback. The status bar shows *P2P direct* or *Via relay*.
- **State lives with the icon.** Close the host tab and clients are locked out; reopen the icon and the **same share link resumes**.
- **Failover.** Clients mirror the host's state. If the host dies, any client presses **Take Over** and the same session continues from their mirrored copy.
- **Video Call** (front and center on the Home Screen) is strictly P2P mesh — the relay only performs introductions and its **bandwidth guard refuses to carry media**. Quality auto-steps (720p → 480p → 360p → 240p) as more people join, and back up as they leave; the tile wall scrolls, so any number fit.
- **A call is a permanent, host-less room.** The room IS its URL: nobody owns it, the creator leaving changes nothing, an emptied room revives on the next join — a call link works forever. Sockets self-heal, broken pairs re-offer with ICE restarts, and a locked phone keeps its tile through a grace window.
- **Blocked pairs borrow a friend.** When two people can't reach each other directly (both behind strict firewalls), any mutual friend in the call automatically relays between them — chat, files, and **live media** forwarded browser-to-browser, labeled "📡 via <friend>" on the tile. No TURN server, no infrastructure: the volunteer's phone is the bridge, and it hands back to a direct route the moment one forms. If no path exists at all, the tile sinks to the bottom and says why.
- **Record & transcribe, zero servers.** Recording composites every tile on YOUR device (blurred feeds stay blurred, group-muted people stay silent) into a `.webm` that never leaves your machine — with a ⏺ chip on your tile so the whole room knows. Transcription is per-speaker: each phone captions its own mic with the browser's speech engine and the lines gossip P2P into one attributed, downloadable transcript with live captions on tiles.
- **Calls are civilized.** Everyone joins muted with camera off; a **Blur** button completely blurs your video for everyone; every tile shows live mute/blur/camera status; and **anyone can mute or blur anyone for the whole room** — enforced on every receiver's device, always attributed ("muted for everyone by Ada"), and the target can't lift it themselves. Rooms can be **password-locked** by anyone inside; the password propagates live to participants and is demanded of new joiners — held only by the room's occupants, never stored on a server.

## A Whole Computer Is One GIF

**GifOS menu → Back up Home Screen** produces one GIF containing everything: every file, every icon position, every app's saved state.

Double-click a backup GIF and choose:

- **Boot this computer** — it runs as a *computer inside your computer*, in its own isolated namespace. Your real Home Screen is untouched. Re-open the same image later and it resumes where it left off; **Reboot fresh** re-hydrates it from the image bytes. A booted desktop can hold more images — GifOS boots inside itself, recursively.
- **Replace this Home Screen** — the classic destructive restore.

## Multiple Computers (numbered subdomains)

A quiet power feature: **each single-digit subdomain of gifos.app is a separate computer** — `0.gifos.app` through `9.gifos.app`, ten spares.

- [gifos.app](https://gifos.app) — your main computer
- `1.gifos.app` … `9.gifos.app` — each a **completely isolated desktop** with its own files, apps, state, and storage

There's no switcher UI and no setup — just type a digit in front of the domain. The isolation is enforced by the browser itself: web storage is per-origin, and every numbered hostname is a distinct origin. One computer for work, one for games, one to hand a kid, one per project — all in the same browser, none able to see the others.

Move things between computers the GifOS way: snapshot an app (or back up a whole desktop) to a GIF on one, drop the GIF on another. Multiplayer works from any computer — share links carry everything a friend needs regardless of which number you're on.

Under the hood: GitHub Pages serves only the apex domain, so a tiny stateless Cloudflare Worker ([`mirror/`](mirror)) re-serves the same site on the ten digit subdomains via ten explicit routes — traffic to any other subdomain never invokes (or bills) the Worker.

## Security Model (short version)

- Apps run in a **sandboxed iframe with an opaque origin** — no cookies, no localStorage, no reach into the desktop's storage. Each icon's data is keyed by its fileId; apps cannot name another icon's data.
- An injected **CSP** (`default-src 'none'`, `connect-src 'none'`) blocks every direct network primitive; `RTCPeerConnection` is neutered in the app shim. The **only** way out is `gifos.fetch()`, which enforces the manifest's host allowlist.
- Live camera/mic apps (Video Call) therefore can't be sandboxed apps — they're **system apps**: the icon is a GIF whose manifest names a whitelisted first-party page. Manifests cannot route to arbitrary URLs.
- The relay is a dumb pipe with a **token-bucket bandwidth guard** (1 MB burst for app delivery, ~384 Kbps sustained) — enforced server-side, so nobody can tunnel media through it.

- **Provenance signatures** — anyone can sign an app GIF with their **domain** (Ed25519; public key at `https://domain/gifos.key`) or **email** (OpenPGP via keyservers — **Ed25519 or RSA ≥2048** keys both work, so your existing gpg key is fine). GifOS shows **✓ Signed by yourdomain.com**, **Unsigned**, or **⚠ Tampered** (contents changed after signing). Signing proves authorship, not safety, and a signature can always be stripped. The signed hash excludes app *state*, so saving data never voids it. Sign at [gifos.app/sign.html](https://gifos.app/sign.html).

Details: [docs/architecture.md](docs/architecture.md) · [docs/cors-and-networking.md](docs/cors-and-networking.md)

## Why GIFs?

GIF is the perfect container:
- **Universal** — every platform displays GIFs natively.
- **A filesystem in disguise** — a `GIFOS1.0` Application Extension block stores a whole deflate-compressed directory (code, assets, saved state) while the visible frames stay a real animated image.
- **Shareable** — send via chat, email, social. It looks like an image because it *is* an image.
- **Durable** — no one strips GIFs. They survive every platform.

Someone sends you a GIF in a group chat. It looks like an animated icon. Drop it on your desktop and double-click — it **becomes** that app, loaded with their data. Share your work by sharing a file. Fork someone's project by dropping their GIF. It's git for normal people.

## Getting Started

```bash
git clone https://github.com/nwcnwc/gifos.git

# Serve the site folder (any static server works)
python3 -m http.server 8099 -d site
# → open http://127.0.0.1:8099/index.html

# Optional: local relay for multiplayer testing
node test/relay-local.js          # ws://127.0.0.1:8790
# then in the browser console: localStorage.setItem('gifos_relay','ws://127.0.0.1:8790')
```

The desktop seeds itself with the default apps on first run. Open **two tabs** of `Guestbook.gif` and sign it in one — the other updates live.

### Tests

```bash
node test/node-roundtrip.js       # GIF codec: encode/decode/repack round-trips
node test/e2e.js                  # the desktop, sandbox, versioning (Chromium)
node test/e2e-relay.js            # multiplayer: P2P upgrade + relay fallback
node test/e2e-failover.js         # host death → client takeover, same session
node test/e2e-video.js            # video rooms: mesh, permanence, moderation, passwords
node test/e2e-reconnect.js        # sockets die like on phones; sessions self-heal
node test/e2e-irl.js              # 4 phones play One Night Wolves over the real stack
node test/e2e-boot.js             # computer images: boot, isolate, reboot fresh
node test/sign.js                 # provenance: Ed25519 + OpenPGP (EdDSA & RSA) vs real gpg
node test/mcp-server.js           # the MCP app builder end-to-end
```

The e2e suites expect the static server on `:8099` and (for relay/video) `test/relay-local.js` on `:8790`.

## Deployment

| Piece | Where | How it deploys |
|-------|-------|----------------|
| Desktop site | GitHub Pages → `gifos.app` | **Automatic** on every push to `main` ([`.github/workflows/pages.yml`](.github/workflows/pages.yml) publishes `site/` only) |
| Relay | Cloudflare Worker → `relay.gifos.app` | **Manual**: `cd relay && npx wrangler deploy` |
| Subdomain mirror | Cloudflare Worker → `0.gifos.app` … `9.gifos.app` | **Manual**: `cd mirror && npx wrangler deploy` |
| MCP app builder | Cloudflare Worker → `mcp.gifos.app` | **Manual**: `cd mcp && npx wrangler deploy` |

The Workers do not auto-deploy — after changing `relay/` or `mirror/`, run `wrangler deploy` from that directory.

**Releases**: `gifos.app/` is always the latest build; every past build is archived under `/versions/<x.y.z>/` and users can pin one in deep Settings ([`scripts/archive-version.sh`](scripts/archive-version.sh) cuts a release).

## Project Status

**Live and tested end-to-end** (170+ automated checks across ten suites):

- ✅ Persistent desktop: folders, grid-snap drag (mouse + touch), Trash, rename, resize, cross-tab sync
- ✅ GIF filesystem codec: deflate-compressed `GIFOS1.0` extension block inside a real animated GIF; `repack()` swaps data without touching artwork
- ✅ Hand-drawn animated sticker icons per app — transparent-background GIFs (real GIF transparency) that float on any wallpaper
- ✅ Hardened app sandbox: opaque origin + injected CSP + neutered WebRTC + per-icon DB namespacing
- ✅ Multiplayer: P2P DataChannels with automatic relay fallback, screen names, lock-until-reopen, snapshot failover (Become Host)
- ✅ Deployed: GitHub Pages (`gifos.app`), Cloudflare relay (`relay.gifos.app`) with server-side bandwidth guard + mesh peer routing, numbered-subdomain mirror
- ✅ P2P Video Call: permanent host-less rooms (a link works forever), mesh media, adaptive quality, quiet joins, blur, attributed group moderation, occupant-held room passwords — relay-refuses-media by design
- ✅ IRL party games: secret roles, hidden ballots, and simultaneous reveals dealt to each player's own phone; the drama happens in the room
- ✅ Provenance signatures: sign app GIFs by domain (Ed25519) or email (OpenPGP — Ed25519 or RSA keys); verified against real gpg in CI
- ✅ Scale-hardened relay: WebSocket hibernation (idle sessions cost nothing), zero persistence, per-IP and per-session abuse guards
- ✅ Computer images: whole-desktop backup GIFs that **boot** in isolated namespaces, recursively
- ✅ Version pinning: archived builds under `/versions/`, update bar, additive-only data migrations

**Next ideas**: app directory, snapshot merge (git-style), end-to-end encrypted relay sessions, SharedWorker hosting so sessions survive tab close.

## Architecture

- [docs/architecture.md](docs/architecture.md) — the desktop, the GIF filesystem format, execution model, sandbox security, computer images, versioning.
- [docs/cors-and-networking.md](docs/cors-and-networking.md) — browser-as-server, the transport ladder, the relay bandwidth guard, mesh signaling, video, and the external-API bridge.
- [mirror/README.md](mirror/README.md) — how numbered subdomains are served.

## License

TBD — Patent pending concepts. See [LICENSE](LICENSE) for details.
