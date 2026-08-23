# NxN Cube

A colourful n×n cube you drag to turn. Scramble it, put it back, or send the
invite and race the same shuffle. First to solved wins.

An unofficial port of **[rubiks-cube](https://github.com/pengfeiw/rubiks-cube)**
by pengfeiw (MIT). Not branded as a trademarked puzzle: the toy is NxN Cube,
and 2×2 is a Pocket Cube.

```
index.html      shell: size picker, scramble / restore, race board
style.css       dark chrome around a dedicated drag surface
boot.js         GifOS layer: prefs, seeded scramble race
gifos/          overlays applied by vendor.mjs before the bundle
icon.mjs        procedural cube icon + 1200×720 cover
vendor.mjs      rebuilds vendor/cube.js from the pinned upstream
build.mjs       packs the GIF into site/apps/nxn-cube/nxn-cube.gif
vendor/cube.js  GENERATED. three.js + the cube as one IIFE. Never edit.
```

## Why a bundle

Upstream is TypeScript ES modules importing `three` by bare specifier. GifOS's
runtime inlines `<script src>` and **drops `type="module"`**, so one classic
IIFE is what actually runs. `vendor/cube.js` exposes `NXN.Rubiks`.

## The port

Upstream's scramble button was a stub (`disorder()` is empty). This copy
implements a seeded shuffle so every peer in a room can build the identical
mixed cube from one number. Drag uses pointer events on the canvas (with
`setPointerCapture`) so a finger in the sandbox iframe actually turns a face;
`touch-action: none` lives only on `#stage`, not the whole page.

Invite is GifOS chrome — there is no in-app Invite button. Each player writes
only their own `players` row (move count + solved). The scramble seed rides on
a single `race` record, the same shape as Anyroad's shared world hop.

## capabilities

| capability | why |
|---|---|
| `db` | Private size prefs; `players` and `race` for the shared shuffle. |
| `multiplayer` | The room. Needs nothing newer than the App Store, so `minBuild` is **947**. |

No `network`, no `wasm`, no `pointer` (this is canvas pointer events, not pointer lock). WebGL already works in the sandbox.

## Building

```bash
node apps/nxn-cube/vendor.mjs      # only when moving the pin (needs net)
node apps/nxn-cube/build.mjs       # -> site/apps/nxn-cube/nxn-cube.gif
```

## Licences

Both notices are packed **inside the GIF** as well as living here:

- rubiks-cube — MIT (`vendor/COPYING-rubiks-cube.txt`)
- three.js — MIT (`vendor/COPYING-three.txt`)
