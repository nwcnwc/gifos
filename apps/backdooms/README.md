# Backdooms

A DOOM + Backrooms microgame, running as an ordinary sandboxed GifOS app.
Solo it is Kuber Mehta's QR-sized corridor. Send the invite and extra people
appear in the same halls.

The engine is **[Backdooms](https://github.com/Kuberwastaken/backdooms)** by
Kuberwastaken — MIT, a 320×240 raycaster that originally fitted in a QR code.
This directory is the GifOS port: a classic-script shell around it, analog
thumb look/move, a best-score Continue, and the extra bodies. Upstream has
no networking.

```
index.html          canvas, the gate, touch markup
style.css           overlay chrome
game.js             the original raycaster, as a classic script
net.js              extra bodies — presence in the halls
touch.js            left stick walks, right drag looks, FIRE
boot.js             the gate, prefs, pointer lock
icon.mjs            procedural yellow hall + shotgun icon and the 1200×720 cover
build.mjs           packs site/apps/backdooms/backdooms.gif
```

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
```

## Licence

MIT, Kuber Mehta. The notice is packed **inside the GIF** as
`COPYING-backdooms.txt` as well as living here.
