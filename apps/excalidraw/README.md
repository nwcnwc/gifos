# Excalidraw

A local whiteboard that runs as an ordinary sandboxed GifOS app. Sketch
boxes, arrows, handwriting and diagrams the way Excalidraw always has — the
rough ink, the infinite canvas, undo, export to PNG or SVG or the open
`.excalidraw` file. What you draw is saved on this device, inside the app.
There is no account and no cloud.

The engine is **[Excalidraw](https://github.com/excalidraw/excalidraw)** —
MIT. This directory is the GifOS port: the shell around it, and the
persistence. Their collaboration cloud (Firebase, live rooms, the public
library CDN) is not here.

```
index.html                 the shell: #root, CSS, script order
style.css                  GifOS bar + a few hidden collab/CDN chrome bits
shim.js                    in-memory localStorage so upstream does not throw
app.js                     our entry: gifos.db, boards list, no collab
icon.mjs                   the procedural app icon
vendor.mjs                 rebuilds the IIFE from the npm pin (needs net)
vendor/excalidraw.js       GENERATED. Pinned engine + React as one IIFE.
vendor/excalidraw.css      GENERATED. Engine CSS.
build.mjs                  packs all of the above into the App GIF
```

## Why this shape

Upstream is React ESM (`@excalidraw/excalidraw`). GifOS inlines `<script src>`
and drops `type="module"`, so the tree is bundled to one classic IIFE that
exposes `window.ExcalidrawLib = { React, createRoot, Excalidraw, … }`. Fonts
ride as `data:` URLs (the sandbox `font-src` is `data:` only; the esm.run
CDN is never contacted). There is no `network` capability.

The sandbox is an opaque origin, so `localStorage` throws. `shim.js`
installs an in-memory stub before the engine runs; that stub dies with the
tab. The drawing that comes back next launch is the one `gifos.db` kept.

`minBuild` is **947** — the store itself. The app uses `gifos.db` and nothing
newer.

## capabilities

| capability | why |
|---|---|
| `db` | Boards (elements, viewport, theme, pasted images) in a `private` collection. |

No `network`. No `wasm`. No `multiplayer` — a guest would not see the private
collection, and we are not wiring their collab protocol.

## What is kept between launches

Every board, its viewport and theme, images you paste, and the local
library items — one private `gifos.db('drawings')` collection, written from
`app.js` with a short debounce so a stroke does not rewrite the icon on
every pointer move. Close the window, open it later, the canvas is where
you left it.

## Honest limits

- **Local only.** No share-link, no live room, no libraries.excalidraw.com.
  The listing does not claim otherwise.
- **Font subsetting on export** uses a worker + WASM upstream; the sandbox
  has neither. Export still writes PNG / SVG / `.excalidraw`; inlined
  subsetted font faces in the SVG may fall back to the system font.
- **CJK is the system font.** Xiaolai (the hand-drawn CJK fallback, ~12 MB
  of unicode-range slices) is not packed. Latin faces — Excalifont, Virgil,
  Comic Shanns, Cascadia, Nunito, Lilita — are inlined as `data:` URLs.
- **Images live in the board JSON.** A few photos are fine. A board full of
  photographs is a large record in the icon; keep it lean.

## Building

```bash
node apps/excalidraw/vendor.mjs     # only when moving the pin (needs net)
node apps/excalidraw/build.mjs      # -> site/apps/excalidraw/excalidraw.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

MIT, and the notices are packed **inside** the GIF as well as living here:
`vendor/COPYING-excalidraw.txt` (Excalidraw) and `vendor/COPYING-react.txt`
(React / ReactDOM).
