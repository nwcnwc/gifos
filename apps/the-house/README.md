# The House

You're in a strange house. Tap to look. Find the way out.

An unofficial port of
**[The House](https://github.com/arturkot/the-house-game)**
by Artur Kot (MIT; artwork CC BY 3.0). Upstream is a static HTML/CSS/JS
point-and-click walking-sim: each room is a markup file, CSS paints the
isometric view, jQuery drives the walk and the inventory.

The rooms are **wrapped, not rewritten**. Packed GIF size is large on
purpose (~23 MB): art and sounds stay. They ride the GIF as raw
`.assets/` files and enter the sandbox at boot through `gifos.assets()`
as blob: URLs, behind a boot card whose progress bar moves by real
megabytes. They must NEVER be inlined as base64 script chunks again:
that made the app document 24 MB, and the vendor CSS preloader's regex
over the data-URI-baked CSSOM then backtracked catastrophically — the
measured cause of the old "assembling forever" hang (app.js
`patchPreloader` is the other half of that fix). Only the fonts stay
data-URIs (the sandbox CSP's font-src is data:-only).

The file is the save: inventory, the room you reached, and played scenes
live in `gifos.db('save')`. SoundManager 2 is HTML5 only (no Flash). A
phone tap is a click — jQuery UI 1.8 only listened to the mouse.

```
index.html          GifOS shell; original #the_game chrome
style.css           shell + phone intro/tap
boot.js             SM2 defer + in-memory store polyfill
patch.js            construct SoundManager (HTML5, hold onready)
app.js              room-HTML map, picture/sound remap, private save, tap
icon.mjs
build.mjs
vendor/             original game (rooms, css, js, images, sound, fonts)
vendor/COPYING-the-house.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Inventory and room progress (`save`, private). |

No `network`. No `fullscreen`. `minBuild` is **1206** (0.9.6, the first
runtime that serves packed `.assets/` into the sandbox). Walking-sim is solo;
Invite is OS chrome if you ever want someone watching. Do not fake a
second player.

## Building

```bash
node apps/the-house/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
