# Primitive

Redraw a photo as geometric primitives on this device. Take a still or open
a picture. Nothing is uploaded. The last original photo and the last
reconstruction live in the file.

An unofficial port of **[primitive.js](https://github.com/ondras/primitive.js)**
by Ondřej Žára (MIT), itself a JavaScript re-creation of
[primitive.lol](https://primitive.lol) by Michael Fogleman.

```
index.html      empty state, take photo, presets, canvas, vector
style.css       dark chrome, fat phone sliders, stage-first
app.js          gifos.db original + reconstruction, takePhoto clip, stop
icon.mjs        face emerging from triangles + 1200×720 cover
build.mjs       packs the GIF into site/apps/primitive/primitive.gif
vendor/         pinned js/src algorithm + MIT notice + UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Last settings, last photo, last reconstruction, private. |
| `camera` | `gifos.takePhoto` for a still. Never a live stream. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

Solo — invite would not make a sequential reconstruction better.

## Building

```bash
node apps/primitive/build.mjs   # -> site/apps/primitive/primitive.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

primitive.js is MIT, Ondřej Žára and Michael Fogleman, 2016. The notice is
packed **inside the GIF** as `COPYING-primitive.txt`.
