# SVGOMG

Make SVG pictures smaller, on this device. Nothing is uploaded.

An unofficial port of **[SVGOMG](https://github.com/jakearchibald/svgomg)** by
jakearchibald (MIT, 1.17.0), powered by **[SVGO](https://github.com/svg/svgo)**
v4.0.0. Drop an SVG, toggle the clean-up steps, download.

```
index.html      shell: drop / paste / demo, image vs markup, settings
style.css       indigo toolbar, checkerboard preview
app.js          classic IIFE UI; SVGO.optimize on the main thread
icon.mjs        procedural shrinking-star icon
vendor.mjs      rebuilds vendor/* from the pinned SVGOMG + SVGO sources
build.mjs       packs the GIF into site/apps/svgomg/svgomg.gif
vendor/svgo.js  GENERATED. SVGO 4.0.0 browser bundle, wrapped as an IIFE.
```

## Why this can run as a GifOS app

SVGOMG's engine is already in-browser (SVGO's `svgo/browser` bundle). The
original website loads Google Analytics, registers a service worker, and
spins the optimizer in a Worker. A sandboxed app cannot register a service
worker, and workers are blocked unless the app also asks for WASM — which
this one does not need. So this port:

- takes SVGO's browser bundle and wraps it as a **classic IIFE** on
  `window.SVGO`
- runs `optimize()` on the main thread (a typical SVG is a few milliseconds)
- compares gzipped size with the browser's own `CompressionStream('gzip')`
- strips tracking, the service worker, and every network path

The picture never leaves the tab. `connect-src` stays `'none'`.

Upstream is a website. This is not their UI. We take the engine and the
plugin names from `src/config.json` and write our own shell.

## capabilities

| capability | why |
|---|---|
| `db` | Last clean-up steps / precision in `prefs`. Private. |

No `network`, no `wasm`. Needs nothing newer than the App Store itself, so
`minBuild` is **947**.

## Building

```bash
node apps/svgomg/vendor.mjs      # only when moving a pin (needs net)
node apps/svgomg/build.mjs       # -> site/apps/svgomg/svgomg.gif
```

Do **not** run `scripts/build-app-catalog.mjs` from this work — the catalog
index is shared. `build.mjs` writes
`site/apps/svgomg/{svgomg.gif,app.json,cover.jpg}`.

## Licences

Both notices are packed **inside the GIF** as well as living here:

- SVGOMG — MIT (`vendor/COPYING-svgomg.txt`)
- SVGO — MIT (`vendor/COPYING-svgo.txt`)
