# Smartcrop

Content-aware crop on this device. Take a still or open a picture.
Faces stay in the frame. Nothing is uploaded. The last original picture
and the last frame live in the file.

An unofficial port of **[smartcrop.js](https://github.com/jwagner/smartcrop.js)**
by Jonas Wagner (MIT). Distinct from Mini Photo Editor (manual crop /
rotate / filter): this one finds the cut.

```
index.html      empty state, take photo, aspect chips, overlay + result
style.css       dark chrome, gold crop frame, fat phone chips
app.js          gifos.db original + settings, takePhoto clip, skin blobs as face boosts
icon.mjs        procedural crop-onto-a-face icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/smartcrop/smartcrop.gif
vendor/         pinned smartcrop.js + MIT notice + UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Last settings and last picture, private. |
| `camera` | `gifos.takePhoto` for a still. Never a live stream. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/smartcrop/build.mjs   # -> site/apps/smartcrop/smartcrop.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

smartcrop.js is MIT, Jonas Wagner, 2016–2018. The notice is packed
**inside the GIF** as `COPYING-smartcrop.txt`.
