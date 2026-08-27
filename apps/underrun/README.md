# Underrun

A corridor shooter that runs as an ordinary sandboxed GifOS app. Solo it is
Dominic Szablewski's Underrun. Send the invite and extra soldiers drop into
the same halls. Close it, come back — your best floor is still there.

The engine is **[Underrun](https://github.com/phoboslab/underrun)** by
phoboslab — MIT, the 2018 js13kGames entry. Music by Andreas Lösch. This
directory is the GifOS port: a classic-script shell around it, twin-stick
touch, and the extra soldiers. Upstream has no networking.

```
index.html                  canvas, terminal, scoreboard, touch markup, packed PNGs
style.css                   overlay chrome
vendor/*.js                 UNMODIFIED upstream source. Never edit; run vendor.mjs.
vendor/m/*.png              the three floors and the sprite atlas
net.js                      extra soldiers — presence, shot/cpu claims, the board
touch.js                    left stick walks, right stick aims and fires
boot.js                     load_image, audio unlock, wiring
icon.mjs                    procedural corridor icon and the 1200×720 cover
build.mjs                   packs site/apps/underrun/underrun.gif
```

## Why this can run as a GifOS app

Upstream is one WebGL canvas, a handful of classic scripts, four tiny PNGs,
and music synthesised in-tab by a reduced Sonant-X. There is no fetch. The
PNGs cannot be loaded from a JS-built `m/l1.png` path inside the srcdoc
sandbox (`img-src data: blob:`), so they sit as `<img src>` tags in
`index.html` and GifOS rewrites those to data URLs; `boot.js` points
`load_image` at them.

## capabilities

| capability | why |
|---|---|
| `db` | Best floor in a `private` collection (the HUD reads it); soldiers in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**. No
`network`, no `wasm`, no `pointer` (the original aims with an unlocked mouse).

## Extra soldiers

Each player owns one row and only ever writes that row. Pose, a short ring
of shots, and the computers they rebooted ride on that row. A shot you see
on their row is spawned locally and simulated here — their plasma hits YOUR
spiders. A computer they walk into comes back on your floor too.

Enemies stay local. There are too many spiders to snapshot cheaply, and the
floors themselves are the same PNG plus the same seed, so the map is already
shared. Spiders chase the nearest soldier they can see.

## Building

```bash
node apps/underrun/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/underrun/build.mjs    # -> site/apps/underrun/underrun.gif
```

## Licences

MIT, Dominic Szablewski (phoboslab). Music by Andreas Lösch. A reduced
Sonant-X (zlib) is bundled as shipped upstream. The notices are packed
**inside the GIF** as `COPYING-underrun.txt` and `COPYING-sonantx.txt` as
well as living here, because a copy of this app that someone was handed is
a distribution of those works.
