# Backdooms

A DOOM + Backrooms shooter, running as an ordinary sandboxed GifOS app.
Send the invite and extra people appear in the same halls.

The game is **[Backdooms](https://github.com/Kuberwastaken/backdooms)** by
Kuberwastaken — MIT, a 320×240 raycaster that originally fitted in a QR code.
This directory is the GifOS port.

```
index.html          canvas, HUD, the gate, touch markup
style.css           HUD and overlay chrome
art.js              every texture and sprite, COMPUTED — no image ships
render.js           the raycaster: DDA walls, cast floor/ceiling, sprites, gun
game.js             the simulation — level, movement, the shotgun, the things
net.js              extra bodies — presence in the halls
touch.js            floating stick, look surface, FIRE
boot.js             the gate, prefs, pointer lock, HUD, synthesised sound
icon.mjs            the icon animation (its own small raycaster) + cover art
build.mjs           packs site/apps/backdooms/backdooms.gif
```

## What the port changes, and why

Upstream is a 2.5 KB stunt and a good one — but the things it could not afford
inside a QR code are exactly the things that make a corridor read.

| upstream | here |
|---|---|
| walls `rgb(g,g,g)` on black; no floor, no ceiling | textured wallpaper with a chair rail and skirting, cast carpet and acoustic tiles, fluorescents in the ceiling |
| flat brightness only | DOOM's model — N/S vs E/W fake contrast, per-cell sector light, diminishing to true black |
| enemies are two nested rectangles | sprite figures with a silhouette, walk cycle, hit flash and a death |
| the gun is a `#444` rectangle | a foreshortened pump shotgun: pellets, spread, falloff, line-of-sight, pump animation, muzzle flash that lights the hall |
| `noise < 0.05` pillars on an open plain | a lattice of halls with rooms, pillar halls, partitions and solid mass |
| `f(~~nx, ~~ny)` — walks through walls at negative coordinates, point-sized player | `Math.floor`, a body radius, per-axis sliding |
| closes at 0.13 m/s — can never reach you | about a third of your pace, and it staggers when hit |
| a 4.7 MB mp3 the QR edition never carried | shotgun, pump and room tone synthesised in ~80 lines |
| no save, no networking | best score in the file; one invite link is the same maze |

The whole visual case is in `render.js`'s header comment; the honest research
that motivated it is in `docs/gauntlet-backdooms.md`.

## capabilities

| capability | why |
|---|---|
| `pointer` | Pointer lock. A sandboxed frame is refused it outright. Needs build **1285**. |
| `fullscreen` | A landscape fill on a phone. Needs build **1314**, which is what `minBuild` records. |
| `db` | Look speed / best score in a `private` collection; players in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

## Building

```bash
node apps/backdooms/build.mjs
node test/unit/backdooms.js
```

`screenshot.png` is a REAL captured frame of the running game, not a drawing —
see `docs/gauntlet-backdooms.md`.

## Licence

MIT, Kuber Mehta. The notice is packed **inside the GIF** as
`COPYING-backdooms.txt` as well as living here.
