# Q1K3

A tiny Quake-like, running as an ordinary sandboxed GifOS app. Solo it is
Dominic Szablewski's js13k homage. Send the invite and extra people appear
in the same halls.

The engine is **[Q1K3](https://github.com/phoboslab/q1k3)** by phoboslab —
MIT, two maps, five enemy types, three weapons, generated textures, and a
chiptune from Andy Lösch. This directory is the GifOS port: a classic-script
shell around it, analog thumb look/move, a Continue for the map you reached,
and the extra bodies. Upstream has no networking.

```
index.html          canvas, the gate, touch markup, scoreboard
style.css           overlay chrome
vendor/game.js      GENERATED. The original scripts, concatenated. Never edit.
vendor/assets.js    GENERATED. Packed maps and models as Uint8Arrays.
vendor.mjs          rebuilds vendor/ from the pin. Needs net + gcc.
net.js              extra bodies — presence, hit claims, the scoreboard
remote.js           remote players as grunt / enforcer / zombie bodies
touch.js            left stick walks (analog), right drag looks, FIRE / JUMP / GUN
boot.js             the gate, prefs, pointer lock, wiring
icon.mjs            procedural hall + shotgun icon and the 1200×720 cover
build.mjs           packs site/apps/q1k3/q1k3.gif
```

## Why this can run as a GifOS app

Upstream is already classic scripts and already generates its textures at
load. The only thing it fetched was two tiny packed files — the maps and
the models — which now ride inside the GIF as `vendor/assets.js`.
`connect-src 'none'` then costs it nothing. No CDN, no workers, no wasm.

## capabilities

| capability | why |
|---|---|
| `pointer` | Pointer lock. A sandboxed frame is refused it outright, and without the declaration the game mounts, renders, and silently cannot aim. Needs build **1285**. |
| `fullscreen` | The original fullscreen button, and a landscape fill on a phone. Needs build **1314**, which is what `minBuild` records. |
| `db` | Mouse speed / invert in a `private` collection; players in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

## Extra bodies

Each player owns one row and only ever writes that row. Remote players are
the existing humanoid models with the brain removed and the transform fed
from the wire, pushed onto `game_entities_enemies` so local shots already
hit them. The target applies its own damage. Solo is the original campaign
unchanged — the extra bodies only exist when someone opens the link.

## Building

```bash
node apps/q1k3/vendor.mjs   # only when moving the upstream pin (needs net + gcc)
node apps/q1k3/build.mjs    # -> site/apps/q1k3/q1k3.gif
```

## Licence

MIT, Dominic Szablewski. Music by Andy Lösch (no-fate.net). Sounds via a
modified Sonant-X (zlib). The notices are packed **inside the GIF** as
`COPYING-q1k3.txt` and `COPYING-sonant-x.txt` as well as living here,
because a copy of this app that someone was handed is a distribution of
those works.
