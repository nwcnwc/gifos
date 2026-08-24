# JPG Glitch

Databend a still on this device. Drop a picture or take one. Save the glitch.
Nothing is uploaded.

An unofficial port of **[jpg-glitch](https://github.com/snorpey/jpg-glitch)**
by Georg Fischer / snorpey (MIT).

```
index.html      drop, take photo, four sliders, canvas
style.css       dark chrome
app.js          gifos.db save + pic, takePhoto clip
icon.mjs        procedural glitch icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/jpg-glitch/jpg-glitch.gif
vendor/         glitch-canvas (no worker) + MIT notice + UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Last settings and last picture, private. |
| `camera` | `gifos.takePhoto` for a still. Never a live stream. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/jpg-glitch/build.mjs   # -> site/apps/jpg-glitch/jpg-glitch.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

jpg-glitch is MIT, Georg Fischer, 2015. The notice is packed **inside the GIF**
as `COPYING-jpg-glitch.txt`.
