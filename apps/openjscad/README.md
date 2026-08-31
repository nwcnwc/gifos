# OpenJSCAD

Write JavaScript, get a 3D solid. The script lives in the file.

An unofficial port of **[OpenJSCAD](https://github.com/jscad/OpenJSCAD.org)**
(JSCAD Organization, MIT). The modeling engine is `@jscad/modeling` 2.13.0,
vendored as a classic IIFE. Ace, the OpenSCAD translator, and remote examples
are not shipped — the sandbox has no network path.

```
index.html                  split editor + WebGL view; phone Model/Script tabs
style.css                   dark studio UI
engine.js                   require('@jscad/modeling') shim, main(), mesh, STL
viewer.js                   orbit / pinch / grid / wire
samples.js                  cube (CSG hole) and gear
net.js                      Invite shares the host's script, read-only
boot.js                     private last script, params, Back
icon.mjs                    spinning gear sticker + 1200×720 cover
build.mjs                   packs site/apps/openjscad/openjscad.gif
vendor/jscad-modeling.min.js
```

## Why this can run as a GifOS app

Upstream is a website that fetches examples and talks to a worker. This copy
runs `main()` in the page with a `require` that only resolves
`@jscad/modeling`, tessellates the solids, and draws them with WebGL that
never fetches. The last script is a **private** collection. Press **Invite**
(OS chrome) and a guest watches the same design. On a phone, Model is the
default so one-finger orbit and Run are reachable without the keyboard.

## capabilities

| capability | why |
|---|---|
| `db` | Last script in a `private` collection. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**. No
`wasm` — CSG is JavaScript.

## Building

```bash
node apps/openjscad/vendor.mjs   # only when the modeling pin moves
node apps/openjscad/build.mjs    # -> site/apps/openjscad/openjscad.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

MIT, JSCAD Organization. The notice is packed **inside the GIF** as
`COPYING-jscad.txt` as well as living here. Modeling also includes MIT
work from Evan Wallace / Joost Nieuwenhuijse (CSG), glMatrix, and Quickhull
— see `vendor/UPSTREAM.txt`.
