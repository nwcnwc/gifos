# TIC-80

The [TIC-80 tiny computer](https://github.com/nesbox/TIC-80) (Vadim Grigoruk / nesbox, MIT) as an ordinary sandboxed GifOS app. Solo it is the real engine — Lua and JS carts, the editors, the console. Send the invite and the friend sits at the same desk.

Upstream is a download or a tab that forgets the disk. This copy keeps every cart you save in `gifos.db`, so the file is the computer.

```
index.html          canvas, start overlay, carts sheet, thumb pad
style.css           sweetie-16 chrome
vendor/tic80.js     official 1.1.2837 HTML glue. Never fetched at runtime.
vendor/tic80.wasm   official 1.1.2837 engine (5.7 MB, packed under .assets/)
vendor/carts/       hello.lua + fire.lua (MIT demos from the same tag)
tic80-start.js      generated: glue wrapped as window.TIC80_START
carts.js            generated: those two demos as .tic bytes
fs.js               IDBFS → gifos.db; the disk is the file
touch.js            plus-shaped d-pad, A/B, Esc/Run
net.js              the desk over a meeting — carts you save show up for them
boot.js             wasm via gifos.assets, tap to start, launch.cart
icon.mjs            the little computer walks; cover is HELLO WORLD mid-play
build.mjs           packs site/apps/tic80/tic80.gif
```

The engine is the v1.1.2837 HTML export (`tic80-v1.1-html.zip`). Sample carts are the official demos, not commercial PICO-8 carts.

## capabilities

| capability | why |
|---|---|
| `wasm` | The engine is Emscripten. Bytes come from `.assets/tic80.wasm` via `gifos.assets()` — `connect-src` stays blob/data. |
| `db` | The emulated disk (`--fs=/work`) is snapshotted into a `private` collection. The live desk is `read-write`. |
| `multiplayer` | The room. Invite is OS chrome. |
| `fullscreen` | TIC-80's own F11 / Alt+Enter. |

`minBuild` is **1178** — packed `.assets/` files served by `gifos.assets()`. The wasm is 5.7 MB, under the 8 MB pin floor, so it rides inside the GIF.

## Building

```bash
node apps/tic80/build.mjs   # -> site/apps/tic80/tic80.gif
```

## Licence

MIT, Vadim Grigoruk. The notice rides **inside the GIF**.
