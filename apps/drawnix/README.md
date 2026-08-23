# Drawnix

An all-in-one whiteboard that runs as an ordinary sandboxed GifOS app: mind
maps, flowcharts and freehand on one infinite canvas. The board auto-saves
inside the app, on this device. There is no cloud.

The engine is **[Drawnix](https://github.com/plait-board/drawnix)** by
plait-board — MIT, built on the Plait drawing framework (React + Slate). This
directory is the GifOS port: the persistence layer, the packing, and the
sandbox seams. Upstream auto-saves with localforage (IndexedDB); a GifOS
frame is an opaque origin, so that storage does not exist here.

```
index.html          the shell: #root, dark page, the two script tags
boot.js             gifos.db-backed store hung on window.__GIFOS_STORE
icon.mjs            the procedural app icon
vendor/drawnix.js   GENERATED. The pinned upstream app as one IIFE. Never edit.
vendor/drawnix.css  GENERATED with it.
vendor.mjs          rebuilds the vendor bundle from the pin. The only net step.
build.mjs           packs all of the above into site/apps/drawnix/drawnix.gif
```

## Why this app can exist at all

Upstream is already a local-first whiteboard. The SaaS at drawnix.com is a
hosted wrapper around the same canvas; the canvas itself does not need a
server. Vendoring it as one classic IIFE is the same shape as FPS Simple:
GifOS's runtime inlines `<script src>` and drops `type="module"`, so the ESM
graph has to become one file before it can run in a GIF.

## capabilities

| capability | why |
|---|---|
| `db` | The board, the tool, and the language/theme prefs. Private. |

No `network`. No `wasm`. Mermaid conversion is parsed on the main thread; if
a future mermaid build starts needing a worker, that feature degrades and the
board itself still draws.

`minBuild` is **947**, the App Store itself. The only OS feature this app
needs is `gifos.db`, which is older than the store.

## What is kept between launches

Everything the person drew, the viewport, the theme, the current tool, and
the language / transparency prefs — one private `gifos.db('board')`
collection, written from `boot.js` with a short debounce so a stroke does
not rewrite the icon on every pointer move. Rendered from that collection
on the next open. Nothing is shared over an invite: this is a local board.

## Honest limits

- **Local only.** Upstream's hosted collaboration is not here. The listing
  does not claim it.
- **No Google Fonts, no analytics.** drawnix.com loads Umami and Mermaid may
  try to pull Manrope; both are stripped or overridden so the sandbox CSP
  (`connect-src 'none'`, `font-src data:`) is not a console of failures.
- **File pickers.** Open / Save go through the browser's own file UI
  (`allow-downloads`). The File System Access API is not granted to an
  opaque-origin frame; the library's input/download fallback is what runs.
- **Images live in the board JSON.** A few photos are fine. A board full of
  photographs is a large record in the icon; keep it lean.

## Building

```bash
node apps/drawnix/vendor.mjs      # only when moving the upstream pin (needs net, Node 20.19+)
node apps/drawnix/build.mjs       # -> site/apps/drawnix/drawnix.gif
```

`vendor.mjs` clones the pin and runs upstream's Vite 8; that needs Node 20.19+
(or 22.12+). `build.mjs` is offline and runs on Node 18.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Drawnix is MIT. The notice is packed **inside** the GIF as well as living
here (`vendor/COPYING-drawnix.txt`), because a copy of this app that someone
was handed is a distribution of that work. Plait, React, Slate, mermaid and
markdown-to-drawnix ride inside the same bundle and are MIT as well.
