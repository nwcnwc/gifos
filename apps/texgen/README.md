# TexGen

Procedural textures, live. Stack layers, download a PNG. The file holds
the recipe. Nothing is uploaded.

An unofficial port of **[texgen.js](https://github.com/mrdoob/texgen.js)** by
mrdoob (MIT). Generators run as `fill()` functions — the original compiled
strings with `new Function`, which the sandbox CSP refuses. The GifOS
surface is a complete editor (named recipes, presets from the original
examples, PNG out), not a library demo.

```
index.html      canvas, presets, layer list, params
style.css       dark chrome, sticky canvas, 44px taps
app.js          stack editor, gifos.db save, PNG download
icon.mjs        procedural XOR-sine icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/texgen/texgen.gif
vendor/         no-eval texgen.js + orig pin + MIT notice
```

## capabilities

| capability | why |
|---|---|
| `db` | Last stack and named recipes, private. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/texgen/build.mjs   # -> site/apps/texgen/texgen.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

texgen.js is MIT, texgen.js authors, 2015. The notice is packed **inside the GIF**
as `COPYING-texgen.txt`.
