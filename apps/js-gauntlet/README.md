# Gauntlet

Jake Gordon's HTML5 Gauntlet, as a sandboxed GifOS app. Solo it is the
original dungeon crawler. Send the invite and extra adventurers drop into
the same room — the original had no server.

The engine is
**[javascript-gauntlet](https://github.com/jakesgordon/javascript-gauntlet)**
by Jake Gordon — MIT. Music and Premium Beat SFX were licensed only for
that project and are not shipped; the dungeon is silent.

```
index.html                 canvas, scoreboard, touch pad
style.css                  dark shell, phone layout
boot.js                    gifos.db save, image wiring, Game.run
net.js                     extra adventurers (host sim, guest snapshot)
touch.js                   D-pad / FIRE / POTION
vendor.mjs                 pin + data-URI assets, strip licensed audio
build.mjs                  packs site/apps/js-gauntlet/js-gauntlet.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | High score / level in `prefs` (private); pilots in `players` (read-write); host dungeon snapshot in `world` (read-only). |
| `multiplayer` | The room. Invite is OS chrome. |

`minBuild` is **947**.

## Extra adventurers

Each player writes only their own row (class + input). The host simulates
the map, including extra Player objects, and publishes a compact snapshot
on `world`. A guest paints that snapshot and sends thumbs. Unique classes
first; a fifth friend watches.

## Building

```bash
node apps/js-gauntlet/vendor.mjs   # only when moving the pin
node apps/js-gauntlet/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

MIT, Jake Gordon, for the code. Notice inside the GIF as `COPYING.txt`.
Tiles from Ricardo Chirino / OpenGame Art (see upstream README).
