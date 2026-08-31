# RAWGraphs

A grammar-of-graphics chart builder. The dataset is the save. Nothing is uploaded.

An unofficial port of **[RAWGraphs](https://github.com/rawgraphs/rawgraphs-app)**
by DensityDesign Lab, Calibro and INMAGIK (Apache-2.0). Same load → map → draw
loop and the same visual-variable names (`bars`, `steps`, `hierarchy`, `size`).
The React GUI and the full `@rawgraphs/rawgraphs-charts` catalogue are not
vendored: lodash/d3 UMD builds call `Function()` at load, which the sandbox
refuses. This copy reimplements a working set of those models as SVG.

```
index.html     shell: paste/choose CSV, gallery, mapping, the picture
style.css      dark chrome around a paper-coloured SVG card
csv.js         CSV/TSV parse + type inference
charts.js      twelve visual models → SVG strings
sample.js      baked prize-films table
app.js         mapping UI, private last dataset
mp.js          play-together: shared table + mapping
icon.mjs       procedural alluvial icon and the 1200×720 cover
build.mjs      packs the GIF into site/apps/rawgraphs/rawgraphs.gif
```

## Why this can run as a GifOS app

Upstream is a React app that talks to no server for the data, but it still
loads as a website. The GifOS port keeps the table **inside the GIF**, so
closing the app and opening it again restores the last dataset and the last
mapping. Invite is live collab on that same document. `connect-src` stays
none.

## capabilities

| capability | why |
|---|---|
| `db` | Last CSV + chart + mapping in a `private` collection. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. Shared `room` is `read-write`. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/rawgraphs/build.mjs   # -> site/apps/rawgraphs/rawgraphs.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

The Apache-2.0 notice rides **inside the GIF** as `COPYING.txt`.
