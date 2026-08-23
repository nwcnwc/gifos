# Regexper

Regex railroad diagrams on this device.

An unofficial port of **[Regexper](https://github.com/javallone/regexper-static)**
by javallone (Jeffrey Avallone, MIT). Type a regular expression, get a picture
of what it matches. Nothing is uploaded.

```
index.html          shell: input, Display, download SVG/PNG
style.css           original green / tan chrome, no webfont
app.js              opens on a small example when the hash is empty
icon.mjs            procedural railroad icon + 1200×720 cover
vendor.mjs          rebuilds vendor/regexper.js from the pinned upstream
build.mjs           packs the GIF into site/apps/regexper/regexper.gif
vendor/regexper.js  GENERATED. javallone's parser + renderer as one IIFE.
```

## Why this can run as a GifOS app

Upstream is ES modules (webpack 3, Snap.svg, lodash, a canopy PEG grammar) and
the live site loads a Google font. GifOS inlines `<script src>` as classic
scripts and the sandbox has no network, so `vendor.mjs` compiles the grammar
and emits one IIFE. The Bangers webfont is not loaded; the header uses a
local heavy sans. Analytics, Sentry, changelog and documentation pages are
dropped. Same diagrams.

## capabilities

None. Plain JavaScript, no database, no network, no wasm. `minBuild` is **947**.

## Building

```bash
node apps/regexper/vendor.mjs    # only when moving the upstream pin (needs net)
node apps/regexper/build.mjs     # -> site/apps/regexper/regexper.gif
```

Catalog is owned elsewhere — do not run `build-app-catalog.mjs` from this tree.

## Licences

Notices ride **inside the GIF** as well as living under `vendor/`:

- Regexper — MIT (`vendor/COPYING-regexper.txt`)
- lodash — MIT
- Snap.svg / eve — Apache-2.0
- canopy — MIT
- Open Iconic — MIT
