# Matter Sandbox

A 2D physics toy box running as an ordinary sandboxed GifOS app. Solo it
is the Matter.js demo playground: grab pieces, drop boxes and balls, toss
a ragdoll, pull a slingshot at a pyramid, slide gravity. The pile is
saved in the file. Send the invite and a friend lands in the same room.

The engine is **[matter.js](https://github.com/liabru/matter-js)** by
Liam Brummitt — MIT, a JavaScript 2D rigid-body engine. This directory
is the GifOS playground around it: tools, a saved scene, thumb-sized
buttons, and the shared room. Upstream is a demo page you visit; this
copy is a file you keep.

```
index.html              shell: tools, canvas, gravity, friend strip
style.css               dark toy box
physics.js              engine, ragdoll, sling, scene I/O, paint
app.js                  tools, pointer, loop
net.js                  host-simulated world, own-row hands
boot.js                 last scene in gifos.db, wiring
icon.mjs                collapsing-stack icon + 1200×720 cover
build.mjs               packs site/apps/matter-sandbox/matter-sandbox.gif
vendor/matter.min.js    matter-js 0.20.0. Never fetched at runtime.
vendor/COPYING-*.txt    Liam Brummitt's MIT notice, packed inside the GIF
```

## Why this can run as a GifOS app

Upstream is one script and a canvas. No network, no workers, no fonts.
`connect-src 'none'` costs it nothing. The scene is a JSON snapshot of
bodies and joints, small enough to live in `gifos.db` and to publish
when a friend joins.

## capabilities

| capability | why |
|---|---|
| `db` | Last scene in a `private` collection; the live pile in a `read-only` one the host writes; each pair of hands in a `read-write` row. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## The shared room

The host simulates. Each person writes only their own `players` row
(taps, drags, gravity). The host applies those hands and publishes
poses on `world`. A guest who goes quiet for a few seconds drops off
the list.

## Building

```bash
node apps/matter-sandbox/build.mjs   # -> site/apps/matter-sandbox/matter-sandbox.gif
```

## Licence

MIT, Liam Brummitt and contributors. The notice is packed **inside the
GIF** as `COPYING-matter-js.txt` as well as living here, because a copy
of this app that someone was handed is a distribution of that work.
