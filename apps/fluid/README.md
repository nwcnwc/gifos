# Fluid

Drag a finger through ink. Quality and dye settings stay in the file.

An unofficial port of **[WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)**
by Pavel Dobryakov (MIT). Same pointer/touch swirl. Promo, store badges, and
analytics are stripped. The dither texture is inlined as a data URL so nothing
is fetched.

```
index.html              canvas + hint
style.css               hint overlay
app.js                  private last panel settings
vendor/script.js        upstream script.js, patched (see UPSTREAM.txt)
vendor/dat.gui.min.js   dat.GUI, MIT, pinned
icon.mjs                procedural swirl icon and the 1200×720 cover
build.mjs               packs the GIF into site/apps/fluid/fluid.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Last quality/dye settings and a still of the swirl in a `private` collection. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/fluid/build.mjs   # -> site/apps/fluid/fluid.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.
