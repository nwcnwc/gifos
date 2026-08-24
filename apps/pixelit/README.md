# Pixel It

Turn a photo into pixel art on this device. Drop a picture or take one.
Nothing is uploaded.

An unofficial port of **[Pixel It](https://github.com/giventofly/pixelit)** by
José Moreira / giventofly (MIT).

```
index.html      drop, take photo, sliders, palette, canvas
style.css       dark chrome around the converter
app.js          gifos.db save + pic, takePhoto clip, palettes
icon.mjs        procedural pixel-photo icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/pixelit/pixelit.gif
vendor/         pinned dist/pixelit.js + MIT notice + UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Last settings and last picture, private. |
| `camera` | `gifos.takePhoto` for a still. Never a live stream. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/pixelit/build.mjs   # -> site/apps/pixelit/pixelit.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

Pixel It is MIT, José Moreira, 2019. The notice is packed **inside the GIF**
as `COPYING-pixelit.txt`.
