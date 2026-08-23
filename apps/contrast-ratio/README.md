# Contrast Ratio

Check whether text can be read on a colour. Nothing is uploaded.

An unofficial port of **[contrast-ratio](https://github.com/siege-media/contrast-ratio)**
by siege-media (MIT), from the checker [Lea Verou](http://lea.verou.me/) first
wrote. Same two colours, same circle, same WCAG number.

```
index.html              shell: split page, two colour fields, the circle
style.css               checkerboard + the original split-screen look
app.js                  parse colours, paint the verdict, private last pair
icon.mjs                procedural split-card icon and the 1200×720 cover
build.mjs               packs the GIF into site/apps/contrast-ratio/contrast-ratio.gif
vendor/color.js         siege-media/contrast-ratio color.js, MIT, pinned
```

## Why this can run as a GifOS app

Upstream is a public website that never sends the colours. The GifOS port keeps
that: nothing is fetched. Tracking, GitHub buttons, the Siege Media advert, and
Incrementable (loaded from another host) are stripped. The last pair is stored
in a **private** collection.

The results panel is always on — a finger cannot hover the circle.

## capabilities

| capability | why |
|---|---|
| `db` | Last pair in a `private` collection. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/contrast-ratio/build.mjs   # -> site/apps/contrast-ratio/contrast-ratio.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

The notice is packed **inside the GIF** as well as living here:

- contrast-ratio — MIT, Copyright (c) 2013 Lea Verou (`vendor/COPYING-contrast-ratio.txt`)
