# DigitalJS

A teaching-focused digital circuit simulator, running as an ordinary sandboxed
GifOS app. Solo it is Marek Materzok's DigitalJS. The netlist lives in the
file; send the invite and a friend sits at the same bench.

The engine is **[DigitalJS](https://github.com/tilk/digitaljs)** by Marek
Materzok — BSD-2-Clause, a JointJS schematic over a three-valued logic
simulator. This directory is the GifOS port: a classic-script shell, sample
circuits (counter, add/sub, full adder, LFSR, latch), pan/zoom on a phone,
and the shared bench. Upstream is a page you open on the web.

```
index.html           toolbar, paper, pins, JSON sheet
style.css            dark bench
vendor/digitaljs.js  pinned 0.14.2 IIFE. Never fetch it at runtime.
circuits.js          sample netlists
touch.js             pan / pinch / wheel
net.js               private save + invite bench
boot.js              mount, Play/Pause/Step, load
icon.mjs             four lamps counting, and the 1200×720 cover
build.mjs            packs site/apps/digitaljs/digitaljs.gif
vendor.mjs           rebuilds the IIFE from npm (offline after that)
```

## Why this can run as a GifOS app

Upstream is JSON in, a JointJS paper out, no network of its own once the
bundle is built. ELK's worker and the optional worker engine are stubbed;
layout is dagre on the main thread. `connect-src 'none'` then costs it
nothing. Buttons, lamps and the I/O panel are the original widgets.

## capabilities

| capability | why |
|---|---|
| `db` | Last netlist in a `private` collection; the meeting copy in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/digitaljs/vendor.mjs   # only to move the pin
node apps/digitaljs/build.mjs    # -> site/apps/digitaljs/digitaljs.gif
```

## Licence

BSD-2-Clause, Marek Materzok. The notice is packed **inside the GIF** as
`COPYING-digitaljs.txt`, with JointJS (MPL-2.0), jQuery and jQuery UI (MIT)
beside it, because a copy of this app that someone was handed is a
distribution of that work.
