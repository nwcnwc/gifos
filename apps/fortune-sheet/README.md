# Fortune Sheet

A local Excel-like spreadsheet that runs as an ordinary sandboxed GifOS app.
The engine is **[FortuneSheet](https://github.com/ruilisi/fortune-sheet)** by
ruilisi — MIT, a TypeScript rewrite of Luckysheet. This directory is the GifOS
port: the shell around it, and the persistence. Their collaboration backend is
not here.

```
index.html                 the shell: bar, sheet mount, localStorage stub
style.css                  the GifOS bar; FortuneSheet styles its own grid
app.js                     our entry: gifos.db, demo sheet, New workbook
icon.mjs                   the procedural app icon
vendor.mjs                 rebuilds the IIFE from the npm pin (needs net)
vendor/fortune-sheet.js    GENERATED. Pinned engine + React as one IIFE.
vendor/fortune-sheet.css   GENERATED. Engine CSS.
build.mjs                  packs all of the above into the App GIF
```

## Why this shape

Upstream is React ESM (`@fortune-sheet/react`). GifOS inlines `<script src>`
and drops `type="module"`, so the tree is bundled to one classic IIFE that
exposes `window.FortuneSheet = { React, createRoot, Workbook }`. The GIF
carries that bundle and the CSS; there is no CDN and no `network` capability.

Their `onOp` path is how they talk to a server. We never pass `onOp`. Edits
go to `gifos.db('workbook')` as a sparse `celldata` snapshot, on this device,
inside the icon. `connect-src` stays `'none'`.

The sandbox is an opaque origin, so `localStorage` throws. `index.html`
installs an in-memory stub before the engine runs; that stub dies with the
tab. The workbook that comes back next launch is the one `gifos.db` kept.

`minBuild` is **947** — the store itself. The app uses `gifos.db` and nothing
newer.

## capabilities

| capability | why |
|---|---|
| `db` | The workbook, in a `private` collection. |

No `network`. No `wasm` (plain JS + canvas). No `multiplayer` — a guest would
not see the private collection, and we are not wiring their collab protocol.

## Building

```bash
node apps/fortune-sheet/vendor.mjs     # only when moving the pin (needs net)
node apps/fortune-sheet/build.mjs      # -> site/apps/fortune-sheet/fortune-sheet.gif
```

Do **not** run `scripts/build-app-catalog.mjs` from this work — the catalog
index is shared. `build.mjs` writes `site/apps/fortune-sheet/{fortune-sheet.gif,app.json,cover.jpg}`.

## Licences

MIT, and the notices are packed **inside** the GIF as well as living here:
`vendor/COPYING-fortune-sheet.txt` (FortuneSheet) and `vendor/COPYING-react.txt`
(React / ReactDOM). The bundle also contains immer, lodash, and a formula
parser, all MIT, pulled in by the pin.
