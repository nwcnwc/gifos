# GifOS

**Your GIF-powered operating system.**

> One HTML shell. A desktop of GIFs. Every app is a file you own — and a whole computer is one GIF.

🌐 **Live at [gifos.app](https://gifos.app)** · relay at `relay.gifos.app` · each themed subdomain (`0.gifos.app` … `9.gifos.app`, plus named ones like `imagine.gifos.app`) is a separate computer

## What is GifOS?

GifOS turns your browser into a desktop where **every app is a GIF**.

Visit [gifos.app](https://gifos.app) and you land on your **Home Screen** — icons, folders, drag-and-drop with grid snap, a system bar, a Trash. Every GIF (and any other file) you've dropped in sits there as an icon. Double-click an executable GIF and it opens in its own **browser tab** and runs. Everything is just files, and the files are yours.

- **The Home Screen** — a persistent, phone-friendly home screen that holds your GIFs and files as icons. It lives in your browser (IndexedDB); nothing is stored on our servers.
- **App GIFs** — applications packed into real, viewable GIF images with **hand-designed animated artwork**. A GIF is a little filesystem; if it has an `index.html`, double-clicking runs it in a hardened sandbox. Its saved state travels **inside the same GIF**.
- **Computer images** — back up your whole desktop as ONE GIF… then double-click that GIF anywhere and **boot it as a computer**, inside GifOS, without touching the desktop it's sitting on. GifOS boots inside itself.
- **The relay** (`relay.gifos.app`) — a stateless message hub for multiplayer. It introduces browsers to each other and passes control messages; it persists nothing (even room passwords live in the occupants' connections), hibernates when idle, and **refuses to carry audio/video**.

No installs. No accounts. No app servers. Just files on a desktop.

**Built something?** Host the `.gif` anywhere and share
`gifos.app/?run=<url-to-your-gif>` — one click runs it for anyone, with no
install and no store. See [Ship Your App by Sending a Link](#ship-your-app-by-sending-a-link).

## The Home Screen

- **Drop any file** onto the Home Screen — it becomes an icon. GIFs animate right in the icon.
- **Folders, drag-to-arrange (grid snap), rename, resize icons** — works with touch too.
- **Trash** — deletes are recoverable until you empty it.
- **System bar** — the GifOS menu (About, App Store, Arrange icons, whole-Home-Screen Backup/Restore, Empty Trash, Settings — erasing the computer lives deep in Settings → Advanced, on purpose), an Invites button, and an ＋ Add button (the App Store, files, folders, paste-an-AI-app, add-by-URL, zip import). Persistent storage is requested automatically; usage details live under Settings → Advanced.
- **Right-click any icon** → Open, **Download** (snapshot the GIF — with saved state folded in — without launching it), Rename, resize, Trash.
- **Cross-tab live sync** — two tabs of the same desktop stay identical in real time.

Default apps come organized in folders — **Games** (Tic-Tac-Toe, Connect Four, Minesweeper, Chess Tournament with time controls, Ping Pong), **Studio** (Paint), **Tools** (Notes, Calculator, Stopwatch, Fortune, Bible Browser, Speech Coach, Ask AI, Reader), **Social** (Guestbook, Chat), and **IRL Games** — party games for game night where everyone joins from their own phone (Fake Facts, One Clue, Same Brain, One Night Wolves) with pass-the-phone versions in a **Single Phone** subfolder (Odd Word Out, Catch the Spy, Tilt, The Dial, Party Roulette) — plus **Welcome**, **Camera**, **My Media**, **Meeting**, **Broadcast** and the **App Store** right on the Home Screen. Every icon is a genuine App GIF with animated artwork on a transparent background, drawn in the computer's **icon pack**.

**Fourteen computers, fourteen worlds.** gifos.app ships **Aurora** — holographic glass, the flagship. Each numbered subdomain is its own isolated computer (separate origin, separate IndexedDB) with its own look: **0 Terminal Zero** (phosphor CRT, for the terminal people) · **1 Letterpress** (engraved paper, for people who want a calm serious tool) · **2 Sticker Meadow** (the hand-drawn kawaii original — the kids' computer) · **3 Toybox** (glossy pastel squish) · **4 Stadium** (varsity night game) · **5 Countdown** (chrome-and-ember space age) · **6 Watercolor** (loose ink over wet paint, for artists & dreamers) · **7 Lucky Sevens** (neon glitch, buzzing signs) · **8 8-Bit** (true pixel art) · **9 Zen Garden** (sumi-e ink wash) — plus the named computers **Imagine**, **David Welk** and **Orrery**. Icon art is baked into each app GIF at seed time, so an app stolen from a numbered computer keeps its birthplace's art. Themes live in [`site/themes/`](site/themes): the default is the top-level folder, and each computer's overrides go in a `themes/<label>/` subfolder named after its subdomain (`themes/0`, `themes/neon`) — reskin one by editing its folder.

## How an App GIF Runs

1. Double-click → a **new browser tab** opens.
2. The GIF's embedded filesystem is unpacked; `index.html` is mounted in a **sandboxed iframe** (opaque origin, strict CSP — see security below).
3. The app talks to GifOS only through `window.gifos`: `db()` (state that persists with the icon), `me()` (player identity), `fetch()` (manifest-gated), `save()` (snapshot), `storage()` (origin-wide usage/quota, so an app can warn before it fills the disk).
4. No `index.html`? The tab shows a **browsable filesystem** instead — like an open folder on a web server.

**Snapshots preserve the artwork.** Saving an app (in-app Snapshot or the icon's Download) *repacks* the GIF: only the embedded filesystem block is swapped, every pixel and animation byte stays identical. Your custom icon art survives every save.

**Make your own apps**: ＋ Add → "Ask an AI to build an app" copies a prompt that teaches any AI the GifOS format; paste back the HTML it returns. Or drop in a single `.html`, or a **`.zip` for multi-file apps** (js/css/assets included).

**Or let your AI do the whole thing.** Point any code-capable AI (Claude, etc.) at [`gifos.app/llms.txt`](site/llms.txt) and just say *"build me a habit tracker for GifOS"* — the guide teaches it to write the app, design a pixel-art animated icon, and pack it all into a **finished `.gif` file** with a short Python recipe, which it attaches for you to drop on your Home Screen. AIs that can't run code produce paste-into-＋Add HTML instead. No connector, no server, nothing to sign up for — the format is a public spec.

**Mod anyone's app — encouraged.** Apps are files, and files get remixed. Hand any GifOS app GIF to an AI — *"add a dark mode"*, *"make the buttons bigger"*, *"turn this counter into a tracker"* — and get a modified `.gif` back: the `llms.txt` recipe opens everything inside, splices the changes back into the **same GIF**, so the animation survives byte-for-byte and saved data rides along. See an app you like in a friend's session? **Steal** drops a fresh copy into your *Stolen Apps* treasure chest to hack on. A modified app ships unsigned — a remix is a new work, and the modder can sign their version.

## Ship Your App by Sending a Link

**Your app is one `.gif`. Put it on the web anywhere, and a link runs it.**

```
https://gifos.app/?run=https://example.com/my-app.gif
```

That is the whole distribution story. Whoever clicks it — on a phone, on a
borrowed laptop, someone who has never heard of GifOS — gets your app **running
in a sandbox, in about a second**. No install, no account, no store submission,
no review, no App GIF to email around and explain. GifOS fetches your GIF, files
it into their **Stolen Apps** folder so they keep it, and opens it.

You host the file. Anywhere that serves it with CORS works — GitHub
Pages/raw, Cloudflare, S3, a `python3 -m http.server`, your own site. There is
nothing to register: the URL *is* the app, and the link is a plain query
parameter you can paste into a chat, a QR code, a slide, or a README badge.

```
?run=<url-to-your-gif>   your own GIF, hosted anywhere with CORS
?run=<slug>              a certified app from the store, e.g. ?run=anyroad
```

**A GIF in a GitHub repo** is the common case, and the link you copy from the
address bar is the `blob` page *about* the file, not the file — GitHub serves
HTML there, with no CORS, so a fetch cannot read it. Both of these work:

```
?run=https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>/my-app.gif
?run=https://github.com/<owner>/<repo>/blob/<branch>/<path>/my-app.gif
```

The first is the direct bytes (`raw.githubusercontent.com` sends
`access-control-allow-origin: *`) and works on every GifOS build today. The
second is rewritten to the first on the fly — the edge build does it now, and
the next release will carry it to everyone else; until then a `blob` link on a
released build says "couldn't load that link" and names the raw one.

**Open it *on* something.** If your app declares a `launch` block in its
manifest, a link can also say what to do once it is up:

```
https://gifos.app/?run=anyroad&go.at=36.0640,-112.1400&go.fly=1
https://gifos.app/?run=offline-tts&go.say=Your%20lift%20is%20here
```

The first puts a first-time visitor into the Grand Canyon with the wings out.
The second makes their computer say a sentence out loud, offline. Read the
values with `gifos.launch()`; GifOS shows the person exactly what the link is
asking for — in the words *your* manifest supplies — and only hands them over
if they agree. An app only ever receives keys it declared, so a link cannot
reach a knob you did not publish. Full recipe:
[`apps/README.md`](apps/README.md#launch--letting-a-link-say-what-to-open-on).

Three things worth knowing before you paste a link into the world:

- **It stays sandboxed.** A run-link is a convenience over "download, then
  Add" — not a shortcut past anything. Your app runs in the same opaque-origin
  iframe with the same strict CSP, and the person still sees the capability
  sheet naming every host you asked to reach.
- **They keep it.** The GIF lands on their Home Screen as a file they own. It
  works offline afterwards, and they can copy it to a friend — which is the
  point of the format.
- **Sign it if you're sharing widely.** [`gifos.app/sign.html`](https://gifos.app/sign.html)
  gets your app a **✓ Signed by yourdomain.com** and makes tampering visible.

Prefer a store listing? Certified apps live at `gifos.app/store/<slug>` — but
the store is a *catalog*, not a gate. Nothing about publishing a GifOS app
requires our permission or our servers. Ratings and comments work the same
serverless way: **a review is a pull request** — one JSON file under your
GitHub name in [`apps/<slug>/reviews/`](apps/README.md#reviews), merged and
shown to every GifOS user with GitHub as the only backend.

## Multiplayer: Any Browser Can Be the Server

Press **Invite** in a running app: your browser becomes the host and the tab shows a share link. Friends open the link, receive the app GIF, and join your session — moves, messages, and scores attributed to each player's **screen name**.

- **P2P-first, P2P-only for state.** Traffic runs over direct, DTLS-encrypted **WebRTC DataChannels** (with a friend's browser as the bridge when a pair can't connect); the relay is a greeter + door that introduces browsers and carries no app state.
- **State lives with the icon.** Close the host tab and clients are locked out; reopen the icon and the **same share link resumes**.
- **Your invite links are yours by default.** An app invite is an **owned** link: only your copy can host it, because holding the host slot takes a secret your app generated and keeps to itself — not in the link, not shown to you, not on any server. The link carries only the secret's *verifier* (a hash), which lets the relay recognize the real host and admit guests **without letting any of them take over or impersonate you**. A signed app's link reads `/join/<app-name>/…`; an unsigned one reads `/join/<app-name>-anon/…` — same ownership, the `-anon` only flags that nobody vouched for who built it.
- **…or hand the room to everyone.** Toggle **"Let a friend keep it going"** at Invite and you mint the opposite on purpose: an **anyone-owns**, self-healing link — no secret, no owner, a *dotless* id. Anyone holding it can host, and if you drop off, a still-connected friend's browser takes over automatically so the session outlives any one host. You're trading the ownership guarantee for a room that outlives any one host. It's a deliberate, labeled choice, not the default — and the same shape a plain meeting link has.
- **Failover (anyone-owns links only).** On a self-healing link, clients mirror the host's state; if the host stays confirmed-gone (~60s), every member computes the **same successor** (deterministic — lowest present peer id), which adopts the app from its verified mirror and the same link keeps working — no clicks. An owned link has exactly one host — yours — by design, so there's nothing to take over.
- **Meeting** (front and center on the Home Screen) is strictly P2P mesh with **no fixed size limit** — the design target is that two people and a very large room use the same machinery, and the mesh folds the crowd into itself as it grows. The relay is only a **zero-knowledge greeter** that introduces browsers; its **bandwidth guard refuses to carry media**. It scales by folding the crowd into itself (the **stadium** model): you're directly wired only to the handful in your **row**, and the rest of the room composites into the **Stadium** tier, so your phone only ever carries its own corner. Quality auto-steps (720p → 480p → 360p → 240p) within a tier as neighbours join and back up as they leave. Audio-only is fine — the camera is optional. How it all fits together: [docs/meeting.md](docs/meeting.md).
- **Run an app inside a meeting.** Press **Run app** and everyone on the meeting shares one live app on stage — same state, same moves, exactly like joining an app by link, now with voice, video and recording around it. Two doors, one room: start a meeting and load an app, or open an app and hit **Meeting** in its tab to turn it into one. The app rides the room's own mesh, owner-signed (its ad rides the status heartbeat, so late joiners auto-mount); the app does not touch the camera, which stays with the trusted room page.
- **A front door, not a cold plunge.** Opening Meeting no longer drops you straight into a random room with the camera already on — it opens a **lobby** that asks what you came to do: **start a meeting** (open room, random id), **start a room you run** (pick a name and admin password right there), **join a link** (paste a full invite URL *or* just a meeting id), or reopen a **recent** meeting — most-recent-first, with the ones you keep coming back to kept as ★ bookmarks. The camera stays off until you choose, so there's no light and no permission prompt just to read the menu. A real invite link (or `/meet/<room>`) skips the lobby and takes you straight in — the link already says why you came.
- **A meeting is a host-less room with no expiry.** The room IS its URL: nobody owns it, the creator leaving changes nothing, an emptied room revives on the next join — a meeting link carries no deadline. Sockets self-heal, broken pairs re-offer with ICE restarts, and a locked phone keeps its tile through a grace window.
- **The low channels.** Room ids can be a *single character*: `gifos.app/meet/a` is a global public channel — wander the low channels and meet whoever in the world is there. Group moderation keeps them civilized: anyone can blur or mute anyone, with attribution.
- **Blocked pairs borrow a friend.** When two people can't reach each other directly (both behind strict firewalls), any mutual friend in the meeting automatically relays between them — chat, files, and **live media** forwarded browser-to-browser, labeled "📡 via <friend>" on the tile. No TURN server, no infrastructure: the volunteer's phone is the bridge, and it hands back to a direct route the moment one forms. If no path exists at all, the tile sinks to the bottom and says why.
- **A tile shows only its own person.** Every video stream is bound to identity: a tile displays a stream only if its id matches the one that peer *announced* for its own media, or was explicitly mapped by a relayer — not a guess. So when a direct link dies and a friend-relay takes over mid-meeting, the tile still shows the right face rather than the relayer's. (Live bug this killed: after a dropped link, a tile showed a *different* participant's camera under the wrong name.)
- **Self-healing by heartbeat.** Every phone re-announces its status, stream id, and (if admin) the room's moderation a few times a second. A single dropped message used to split the room's view of reality until someone reloaded — half the phones thinking everyone agreed to clear video, half not, so some tiles were clear and some blurry. Now any divergence repairs itself within a heartbeat, hands-free.
- **"Stepped away" ≠ "firewalled".** A phone that locks or switches apps tells the room it stepped away, and its tile says exactly that — it is not mislabeled as a blocked-by-firewall peer. Meetings keep running in the background too: a screen wake-lock plus worker-driven timers keep the blurred broadcast and any recording alive when the tab isn't focused (a backgrounded phone used to freeze its own outgoing video).
- **Record & transcribe, zero servers.** Recording composites every tile on YOUR device (blurred feeds stay blurred, group-muted people stay silent) into a `.webm` that stays on your device — with a ⏺ chip on your tile so the whole room knows. Transcription is per-speaker: each phone captions its own mic with the browser's speech engine and the lines gossip P2P into one attributed, downloadable transcript with live captions on tiles.
- **Meetings are civilized.** Everyone joins **muted, camera off, and Max-blurred** — you're invisible until you choose to be seen. Blur is three-state: **Max blur** (nothing legible), plain **Blur** (a soft silhouette), or off. Crucially it's **enforced at the sender** — the strongest blur that applies to you (your own setting, a group-blur aimed at you, or the room's guest blur) is baked into the pixels your browser broadcasts, so stripping a CSS rule does not recover a clear image — *and* at every receiver. Every tile shows live mute/blur/camera status; **anyone can mute or blur anyone for the whole room**, attributed, and not liftable by the target.
- **One blur rule, computed identically on every phone.** A given tile looks the same on every device because a single function decides it, from shared state, and drives both the pixels the sender broadcasts and the CSS every receiver applies. **Consent** = your camera is on and your blur is set to None. A tile shows **clear** if and only if: the room has a **password**, there's **no moderator block** on that tile, and *either* it is an admin room with an **admin present** and **that tile's owner consents**, *or* it is a plain room and **everyone** consents (an admin room whose admin is away stays blurred — a waiting room). Otherwise it shows at least a soft **Min** blur (or more, if the owner chose Max). Nothing else — no hidden floors, no auto-pinning, no room-wide guest-blur level.
- **What that means in practice.** An open (passwordless) room does *not* go clear — a stranger or a child could wander in. In a plain room, clear video is all-or-nothing: it needs a password *and* everyone ready (camera on, blur None), and one newcomer resets it. In an admin room, each guest clears on their own the moment they consent — no waiting for the room. A moderator (anyone in a plain room; the admin in an admin room) can **block any tile**, which overrides that person's None everywhere until it's lifted; the admin's **"Blur guests"** button is just a one-click shortcut that blocks every guest at once.
- **Vote-off-the-island is personal and global — no ban list exists.** Rather than any shared ban list (which a malicious app could forge or DOM-inject an "insta-ban" into), **every person carries one private vote-off list** — device ids — in their own browser, across *all* meetings. The relay only ever tallies a **live majority of the connected devices** (minimum 2, counted by device so extra tabs can't stuff the ballot). Cross the threshold and you're removed; the votes **follow the person** — meet someone you voted off in a different room and your vote is already counted, and a standing majority denies entry outright. Nothing is stored on any server, and an injected button can cast only its own author's single vote.
- **File sharing needs a password too.** You can pin files to a meeting (P2P, bytes browser-to-browser) — but only in a **password-protected** room; an open room anyone can wander into shows a lock note instead of a file picker. Clearing the password warns you first, then **deletes every shared file** for everyone, since the room's door just came off.
- **Nobody is anonymous.** P2P means everyone on a meeting exchanges network addresses anyway — GifOS makes that *visible*: tapping the status pill lists every participant's name and address, with a download button. Serverless is not consequence-free; if someone truly crosses a line, the room can hand that record to the authorities.
- **Admin rooms: consent by address (serverless!).** `gifos.app/meet/<room>` is *anarchic by address* — no admin exists in it, and one cannot be imposed mid-meeting. `gifos.app/meet/<room>/<verifier>` is a **different room** whose very address declares an authority: joining it *is* the consent to be moderated. The verifier is a hash of a hash of the admin password (PBKDF2, room-salted — expensive on purpose, so the public link resists password guessing), which makes the full link safe to share with everyone; **admin power is knowing the password**, typed on your device and not present in any URL or on any server. You make one from **Invite → "create a room you control"** (all meeting links are minted in one place now) — **name it anything you like** (the field is prefilled with the room you're in, but it's yours to change). An admin room is a separate room — its address contains the verifier, a fingerprint of the password — so creating one is unavoidably a move; if people are already with you, Invite offers to **drop the new link into the current room's chat** so they can follow you over, and nobody is stranded. The separate **Admin** button now appears only *inside* an admin room, purely to sign in (type the password to take the controls) and manage bans. Only admins can set the room password, globally mute/blur, or **ban devices** (bans sever live media, refuse rejoins, and are undoable from the banned-list panel; an admin returning to an emptied room re-seeds the list from their own device). Every privileged order travels **individually Ed25519-signed** by the keypair the admin password seeds, and peers and the relay verify the same proof — no socket is "an admin socket", so adminship can't be spoofed over any transport (docs/meet-security.md §SIG).
- **Meeting is a SYSTEM app, and says so.** Its desktop icon wears a `SYSTEM` badge and the meeting page shows a `SYSTEM` chip: this one page runs as trusted first-party code with camera/mic/WebRTC — capabilities every regular app is sandboxed away from (see security below). The honest signage is the point: no app acquires these powers quietly.

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

Under the hood: GitHub Pages serves only the apex domain, so a tiny stateless Cloudflare Worker ([`mirror/`](mirror)) re-serves the same site on the theme subdomains via an **explicit allow-list of routes** (the ten digits plus each named computer) rather than a wildcard, so traffic to an un-listed subdomain does not invoke (or bill) the Worker.

## Every Computer Has Its Own Theme (and you can build one)

Each computer wears its own **theme** — a complete visual identity, resolved once from the hostname:

| | | | |
|---|---|---|---|
| [gifos.app](https://gifos.app) — **Aurora** (glossy glass) | `0` — **Terminal Zero** (phosphor CRT) | `1` — **Letterpress** (ink on warm paper) | `2` — **Sticker Meadow** (hand-drawn kawaii) |
| `3` — **Toybox** (glossy pastel) | `4` — **Stadium** (varsity gold) | `5` — **Countdown** (space chrome) | `6` — **Watercolor** (loose ink + wash) |
| `7` — **Lucky Sevens** (neon glitch) | `8` — **8-Bit** (PICO-8 pixels) | `9` — **Zen Garden** (sumi-e) | |

A theme is more than a colour swap. Each one ships its own **icon pack** — hand-drawn, animated artwork for every app, rasterized into real GIFs — plus **chrome** (the desktop palette) and, because the default apps are rebuilt from source on every computer's first boot, **the theme carries all the way into the apps themselves**: open Notes on Watercolor and it's ink-on-cream; open it on Terminal Zero and it's green phosphor. The art is baked into each app GIF at seed time, so a stolen app keeps its birthplace's look wherever it travels.

**Want your own computer? Send a theme — it's one folder.** A theme is a folder under [`site/themes/`](site/themes); the loader ([`gifos-themes.js`](site/js/gifos-themes.js)) resolves each file per subdomain, using `themes/<label>/<file>` when present and falling back to `themes/<file>`. A theme folder (named after the subdomain) holds any of:

- **`theme.js`** — `GifOS.setTheme({ name, pack, chrome:{ cssVar: value } })`: the name, the palette (CSS-variable chrome), and which pack it draws with. Applied before first paint.
- **`icons.js`** — the icon pack: `GifOS.iconPacks.register(name, { size, frames, draw(subject, accent), fallback(letter, accent) })` draws each app's animated art (the default apps carry all the way into the theme — open Notes on Watercolor and it's ink-on-cream, on Terminal Zero it's green phosphor). The existing packs (e.g. [`themes/6/icons.js`](site/themes/6/icons.js)) are the reference.
- **`eggs.js`** *(optional)* — `GifOS.addEggs([{ name, appId, accent, folder, html }])`: bonus apps seeded on this computer only, filed into a folder (Games, Tools, …). See [`themes/0/eggs.js`](site/themes/0/eggs.js) for a worked example.
- **`wallpaper.js`** *(optional)* — a live background for this computer only: drop the file in and the loader runs it on the desktop (behind the icons). Make it a fixed canvas at `z-index:0; pointer-events:none`, self-guard against duplicate loads, honour `prefers-reduced-motion`, and pause when the tab is hidden. There's no default wallpaper, so this is override-only, and it is not loaded on the meeting/app pages.

Every file is optional — omit one and the default is used. All computers get the same default apps automatically dressed in the theme; you only write what differs.

**Reskin a live computer** (0–9) with just its folder — push, and GitHub Pages redeploys. **Standing up a *new* computer** needs two more small steps, because subdomains are an **explicit allow-list rather than a wildcard** (so computers cannot be conjured in bulk): add a route for it in [`mirror/wrangler.toml`](mirror/wrangler.toml) — named labels like `neon.gifos.app` are fine — and run `npx wrangler deploy` in `mirror/`. The loader resolves the theme folder straight from the subdomain label, so no other code changes.

**If it's beautiful — genuinely its own world, with original GIF animations — it gets its own subdomain.** Propose the subdomain you'd like in the PR (a name, not just the next number), and if we ship it, it's yours: your art, your palette, your corner of GifOS.

## Security Model (short version)

- Apps run in a **sandboxed iframe with an opaque origin** — no cookies, no localStorage, no reach into the desktop's storage. Each icon's data is keyed by its fileId; apps cannot name another icon's data.
- An injected **CSP** (`default-src 'none'`, `connect-src 'none'`) blocks every direct network primitive — `fetch`/`XHR`/`WebSocket`/`EventSource`, and workers too (no `worker-src`); `RTCPeerConnection` is neutered in the app shim. The **only** way out is `gifos.fetch()`, which enforces the manifest's host allowlist, requires `https://`, refuses the GifOS origin itself, and does not attach credentials.
- **You see and control what an app can reach.** A self-contained GIF declares no hosts (`capabilities.network: []`) has no path to the internet. When an app *does* ask for hosts, a plain-language acknowledgement pops up **the first time you open it — and again only if the app later changes the sites it asks for** (a changed request means a changed app). It lists each site with a checkbox — untick one to revoke it (which may break the app; that's fine). Your choices persist with the icon, and a chip in the tab lets you review or change them anytime. An app that asks for **any** site (`network: ["*"]`) is allowed but wears a red **⚠ Unsafe** label with a click-through explainer.
- Live camera/mic apps (Meeting) therefore can't be sandboxed apps — they're **system apps**: the icon is a GIF whose manifest names a whitelisted first-party page. Manifests cannot route to arbitrary URLs.
- The relay is a dumb pipe with a **token-bucket bandwidth guard** (1 MB burst for app delivery, ~384 Kbps sustained) — enforced server-side, so media does not fit through it.

- **Provenance signatures** — anyone can sign an app GIF with their **domain** (Ed25519; public key at `https://domain/gifos.key`) or **email** (OpenPGP via keyservers — **Ed25519 or RSA ≥2048** keys both work, so your existing gpg key is fine). GifOS shows **✓ Signed by yourdomain.com**, **Unsigned**, or **⚠ Tampered** (contents changed after signing). Signing proves authorship, not safety, and a signature can be stripped. The signed hash excludes app *state*, so saving data does not void it. Sign at [gifos.app/sign.html](https://gifos.app/sign.html).

Details: [docs/architecture.md](docs/architecture.md) · [docs/cors-and-networking.md](docs/cors-and-networking.md) · [docs/threat-model.md](docs/threat-model.md)

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
node test/servers/relay-local.js          # ws://127.0.0.1:8790
# then in the browser console: localStorage.setItem('gifos_relay','ws://127.0.0.1:8790')
```

The desktop seeds itself with the default apps on first run. Open **two tabs** of `Guestbook.gif` and sign it in one — the other updates live.

### Tests

Every suite is a standalone Node script — there's no runner. Run one with `node test/<dir>/<file>.js`; it exits non-zero on failure. Suites are grouped by **what they need to run** — see **[`test/README.md`](test/README.md)** for the full index, prerequisites, and the pre-push gates. A representative slice:

```bash
node test/unit/node-roundtrip.js          # GIF codec: encode/decode/repack round-trips
node test/unit/sign.js                    # provenance: Ed25519 + OpenPGP (EdDSA & RSA) vs real gpg
node test/mesh/mesh-harness.js            # meeting mesh: JS control plane vs the C++ reference
node test/browser/e2e.js                  # the desktop, sandbox, versioning (Chromium)
node test/browser/e2e-fetch-bridge.js     # fetch bridge: redirect-bypass + first-party denylist
node test/browser/e2e-store.js            # per-record store: orphan safety + delete/replace invariants
node test/browser/e2e-knock-first.js      # multiplayer: the greeter door + P2P mesh
node test/browser/e2e-video.js            # video rooms: mesh, permanence, moderation, passwords
node test/browser/e2e-media-recovery.js   # denied camera re-asks on tap; black camera auto-restarts
node test/browser/e2e-irl.js              # 4 phones play One Night Wolves over the real stack
node test/browser/e2e-boot.js             # computer images: boot, isolate, reboot fresh
```

- **`test/unit/`** needs nothing; **`test/browser/`** wants the static site on `:8099` plus `test/servers/relay-local.js` on `:8790` for the relay/video suites; **`test/drills/`** spawn their own servers.
- **`test/sim/`** is the C++ reference mesh (built with `g++`) that the JS port is verified against; **`test/batteries/`** are the cross-environment gates to run before pushing mesh/wire changes.

## Deployment

| Piece | Where | How it deploys |
|-------|-------|----------------|
| Desktop site | GitHub Pages → `gifos.app` | **Automatic** on every push to `main` ([`.github/workflows/pages.yml`](.github/workflows/pages.yml) publishes `site/` only) |
| Relay | Cloudflare Worker → `relay.gifos.app` | **Manual**: `cd relay && npx wrangler deploy` |
| Subdomain mirror | Cloudflare Worker → `0.gifos.app` … `9.gifos.app` + the named computers | **Manual**: `cd mirror && npx wrangler deploy` |
| CORS proxy | Cloudflare Worker → `cors-proxy.gifos.app` | **Manual**: `cd cors-proxy && npx wrangler deploy` |

The Workers do not auto-deploy — after changing `relay/` or `mirror/`, run `wrangler deploy` from that directory.

**Releases**: `gifos.app/` serves the current release; every past build is archived under `/versions/<x.y.z>/` and users can pin one in deep Settings ([`scripts/archive-version.sh`](scripts/archive-version.sh) cuts a release). Gate and cut from `~/release-process/gifos` at the freeze tag, not from the development clone.

## Project Status

**Live and tested end-to-end** (250+ test scripts across twelve suite directories — unit, sim, relay, browser, drills, behavior and more):

- ✅ Persistent desktop: folders, grid-snap drag (mouse + touch), Trash, rename, resize, cross-tab sync
- ✅ GIF filesystem codec: deflate-compressed `GIFOS1.0` extension block inside a real animated GIF; `repack()` swaps data without touching artwork
- ✅ Hand-drawn animated sticker icons per app — transparent-background GIFs (real GIF transparency) that float on any wallpaper
- ✅ Hardened app sandbox: opaque origin + injected CSP + neutered WebRTC + per-icon DB namespacing
- ✅ Multiplayer: every share is a mesh ROOM (one runtime — docs/one-runtime.md): P2P DataChannels, owner-signed state, deterministic succession in resilient rooms, Save/Steal snapshots
- ✅ Deployed: GitHub Pages (`gifos.app`), Cloudflare relay (`relay.gifos.app`) with server-side bandwidth guard + mesh peer routing, numbered-subdomain mirror
- ✅ P2P Meeting: host-less rooms with no link expiry, no-root **stadium mesh** (Section 1 = 25 uniform seats, bounded degree, greeter-only relay), mesh media, adaptive quality, quiet joins, sender-enforced blur, attributed group moderation, occupant-held room passwords — relay-refuses-media by design
- ✅ Meeting safety: unblurred video requires a room password (plus unanimous consent in plain rooms / a connected admin); personal GLOBAL vote-off lists (majority-of-devices boot, no forgeable ban list); who-is-here address transparency
- ✅ IRL party games: secret roles, hidden ballots, and simultaneous reveals dealt to each player's own phone; the drama happens in the room
- ✅ Provenance signatures: sign app GIFs by domain (Ed25519) or email (OpenPGP — Ed25519 or RSA keys); verified against real gpg in CI
- ✅ Scale-hardened relay: WebSocket hibernation (idle sessions cost nothing), zero persistence, per-IP and per-session abuse guards
- ✅ Computer images: whole-desktop backup GIFs that **boot** in isolated namespaces, recursively
- ✅ Version pinning: archived builds under `/versions/`, update bar, additive-only data migrations
- ✅ End-to-end encrypted sessions: every content frame is AES-256-GCM sealed under keys derived from the link secret ("derive, don't send") — the relay routes on a separate derivation and only ever carries ciphertext

**Next ideas**: snapshot merge (git-style), SharedWorker hosting so sessions survive tab close.

## Architecture

- [docs/architecture.md](docs/architecture.md) — the desktop, the GIF filesystem format, execution model, sandbox security, computer images, versioning.
- [docs/cors-and-networking.md](docs/cors-and-networking.md) — browser-as-server, the transport ladder (P0/P1/P2), the relay bandwidth guard, mesh signaling, video, and the external-API bridge.
- [docs/threat-model.md](docs/threat-model.md) — what GifOS defends against and what it deliberately doesn't: trust boundaries, adversaries, mitigations, and non-goals.
- [mirror/README.md](mirror/README.md) — how numbered subdomains are served.

**The meeting mesh** (the no-root, no-server-in-the-middle stadium):

- [docs/meeting.md](docs/meeting.md) — the map: what a participant sees and does, and how the four planes below fit together.
- [docs/healing-laws.md](docs/healing-laws.md) — the control plane: the greeter registry, seating, and the self-healing laws (canonical).
- [docs/media-plane.md](docs/media-plane.md) — the three media channels (Row, Stage, Stadium) and how composites fan up and down the tree.
- [docs/meet-security.md](docs/meet-security.md) — the door lock, signed admin authority, and sponsor-forwarded signaling.
- [docs/app-mesh.md](docs/app-mesh.md) — apps as mesh sessions: sharing app state over the same tree (shipped 2026-08-01).

## License

GifOS is licensed under the [Apache License 2.0](LICENSE) — permissive use,
modification, and distribution, with an explicit patent grant from contributors
(Apache-2.0 §3) and a patent-retaliation clause. See [`NOTICE`](NOTICE) for
attribution.

Bundled apps under `apps/<slug>/` carry their **own** licenses, which govern
those subtrees and the App GIFs built from them (Apache-2.0 does not relicense
them):

every `apps/<slug>/listing.json` declares its license (mostly MIT and
Apache-2.0 ports, credited to their upstream authors), and the copyleft ones
vendor their notices — e.g.
[`apps/chess-grandmaster`](apps/chess-grandmaster) — GPL-3.0-or-later
(bundles Stockfish; see
[`COPYING-stockfish.txt`](apps/chess-grandmaster/COPYING-stockfish.txt)) and
[`apps/offline-tts`](apps/offline-tts) — GPL-3.0 (eSpeak).

Contributions are accepted under Apache-2.0 (License §5, inbound = outbound).
"GifOS" and its logo are trademarks and are not licensed by the code license
(Apache-2.0 §6).
