# Pivot

Drag-and-drop pivot grid. The table is the save. Nothing is uploaded.

An unofficial port of **[PivotTable.js](https://github.com/nicolaskruchten/pivottable)**
by Nicolas Kruchten (MIT). Same `pivotUI()`, English only. Chart add-ons that
need C3 / D3 / Google Charts are not shipped.

```
index.html              shell: paste/drop CSV, the pivot surface
style.css               dark compact chrome around upstream's table CSS
app.js                  Papa Parse, pivotUI, private last table
icon.mjs                procedural grid icon and the 1200×720 cover
build.mjs               packs the GIF into site/apps/pivot/pivot.gif
vendor/jquery.min.js    jQuery 3.6.0, MIT, pinned
vendor/jquery-ui.min.js jQuery UI 1.13.2 (sortable/draggable), MIT, pinned
vendor/jquery.ui.touch-punch.min.js
vendor/papaparse.min.js PapaParse 5.4.1, MIT, pinned
vendor/pivot.js         nicolaskruchten/pivottable dist/pivot.js
vendor/pivot.css
vendor/export_renderers.js
vendor/sample.js        baked Canadian MPs CSV (upstream examples/mps.csv)
```

## Why this can run as a GifOS app

Upstream examples load jQuery from a CDN and send pageviews. The GifOS port
vendors the same libraries, strips analytics, and keeps the CSV in a **private**
collection. Drop / paste / the baked sample never leave this device.

## capabilities

| capability | why |
|---|---|
| `db` | Last CSV + pivot arrangement in a `private` collection. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/pivot/build.mjs   # -> site/apps/pivot/pivot.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Notices are packed **inside the GIF** as well as living here:

- PivotTable.js — MIT (`vendor/COPYING-pivottable.txt`)
- jQuery — MIT (`vendor/COPYING-jquery.txt`)
- jQuery UI — MIT (`vendor/COPYING-jquery-ui.txt`)
- PapaParse — MIT (`vendor/COPYING-papaparse.txt`)
- jquery-ui-touch-punch — MIT (`vendor/COPYING-touch-punch.txt`)
