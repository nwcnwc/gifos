# JS Paint

Classic MS Paint, running as an ordinary sandboxed GifOS app. Pencil, brush,
eraser, fill, airbrush, text, select, shapes, undo that keeps every branch.
The picture auto-saves on this device, inside the app.

The engine is **[JS Paint](https://github.com/1j01/jspaint)** by Isaiah Odhner
— MIT, a pixel-faithful MS Paint remake. This directory is the GifOS port: a
local-only shell around it. Upstream talks to Imgur, Firebase, speech servers
and update checks; this copy does none of that.

```
index.html          the shell: about-box markup, script order
boot.js             localStorage stand-in over gifos.db
src/app-state.js    GENERATED. Upstream's classic-script state.
src/app-localization.js  GENERATED. English-only localizer.
vendor/*            GENERATED. Pinned upstream as classic scripts + CSS.
vendor.mjs          rebuilds vendor/ from the pin. The only step needing net.
build.mjs           packs all of the above into site/apps/jspaint/jspaint.gif
icon.mjs            the procedural app icon
```

## Why this app can exist at all

JS Paint already runs in a browser with no build step for the web app itself.
The GifOS work is: one IIFE (the runtime drops `type="module"`), assets as
data URLs (the sandbox has no files to fetch), and persistence through
`gifos.db` (the sandbox has no `localStorage`). `connect-src 'none'` then
costs it nothing, because every network extras menu is gone.

## capabilities

| capability | why |
|---|---|
| `db` | The canvas backup and theme/settings in private collections. |

No `network`. No `wasm` (gif.js workers and pdf.js are not shipped). Save As
GIF/PNG/JPEG uses the canvas encoder and UPNG/BMP libraries bundled as plain
JS.

## What is kept between launches

The current picture (`gifos.db('canvas')`) and a handful of prefs (`theme`,
window sizes) in `gifos.db('prefs')`. History is not kept — same as upstream's
honest warning. File > Save As is how you take a copy with you.

## Honest limits

- **Local only.** No Load from URL, no Imgur, no multi-user session, no
  speech recognition (that path sent audio to Google), no head tracker.
- **Classic Light and Classic Dark.** The other skins (Modern, Winter,
  Occult, Bubblegum) need image sets this copy does not ship.
- **No CHM help viewer.** Help > Help Topics tells you so. The tools are the
  MS Paint tools; they work the way they always did.
- **No PDF open, no animated-history GIF.** Those needed a worker and a
  13 MB pdf.js. Open a PNG.

## Building

```bash
node apps/jspaint/vendor.mjs      # only when moving the upstream pin (needs net)
node apps/jspaint/build.mjs       # -> site/apps/jspaint/jspaint.gif
```

## Licence

MIT, Isaiah Odhner. The notice is packed **inside** the GIF as
`COPYING-jspaint.txt` as well as living here, because a copy of this app that
someone was handed is a distribution of that work.
