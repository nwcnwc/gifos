# shapez.io

A playable **first-belt / cutter / painter** slice of
[shapez](https://github.com/tobspr-games/shapez.io) by tobspr Games
(GPL-3.0), running as an ordinary sandboxed GifOS app. The factory lives
in the GIF; one invite is co-op on the same floor.

Upstream is a multi-megabyte TypeScript + PIXI webpack build that cannot
run in the sandbox (localStorage, workers, a CDN-shaped asset pipeline).
This directory is an original-engine reimplementation of the opening
hours — extractors, belts, cutter, rotator, painter, trash, hub — using
the published shape codes (`CuCuCuCu`, `----CuCu`, …) and the published
colour hexes. It is not the 26-level campaign, not wires, not stackers.

```
index.html   canvas, HUD, toolbar
style.css    overlay chrome
shapes.js    codes, cut / rotate / paint, drawing
game.js      map, simulation, hub levels
draw.js      floor, machines, items
net.js       co-op cells + host-sim flow
ui.js        pan / pinch / belt-draw / hotkeys
boot.js      gifos.db wiring
icon.mjs     sticker animation + 1200×720 cover
build.mjs    packs site/apps/shapez/shapez.gif
COPYING.txt  GNU GPL v3 (packed inside the GIF)
```

## capabilities

| capability | why |
|---|---|
| `db` | Factory in `cells` (read-write) and hub progress in `world` (host writes). Camera in private `prefs`. |
| `multiplayer` | Invite is OS chrome. Both players place; the host simulates items. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/shapez/build.mjs   # -> site/apps/shapez/shapez.gif
```

## Licence

GPL-3.0, tobspr Games (the original game) and this reimplementation.
`COPYING.txt` is packed **inside the GIF**. A copy of this app that
someone was handed is a distribution of that work.
