# Dante

A little red devil catching thirteen lost souls in Hell, running as an
ordinary sandboxed GifOS app. Solo it is Salvatore Previti's Dante. Send
the invite and extra Dantes appear in the same circles, as ghosts.

The engine is **[Dante](https://github.com/SalvatorePreviti/js13k-2022)** by
SalvatorePreviti — MIT, first prize at js13k 2022 (overall and mobile).
Music by Ryan Malm after Beethoven. This directory is the GifOS port: a
classic-script shell around it, a thumb LEVER, and the optional ghosts.
Upstream has no networking.

```
index.html              canvases, menu, roster, touch markup
style.css               original hell chrome + overlays
vendor/game.js          GENERATED. Upstream dist/1-build, patched. Never edit.
vendor.mjs              rebuilds vendor/ from the pin. The only net step.
storage.js              localStorage stand-in over gifos.db('prefs')
net.js                  extra Dantes — presence, interpolated ghosts, the board
touch.js                LEVER writes KeyE; walk/look stay on the canvas
boot.js                 roster, wiring
icon.mjs                procedural devil + soul icon and the 1200×720 cover
build.mjs               packs site/apps/dante/dante.gif
```

## Why this can run as a GifOS app

Upstream is one WebGL2 canvas, a collision canvas, and a classic Vite
bundle with the ground SVG and the shaders already inlined. There is no
fetch. `connect-src 'none'` then costs it nothing. Save used
`localStorage`; a sandbox has none, so `storage.js` keeps it in `prefs`.
Restart reloaded the page; a GifOS app cannot, so the vendor patch drops
the player back at the boat instead.

## capabilities

| capability | why |
|---|---|
| `pointer` | First-person look. A sandboxed frame is refused the lock outright. Needs build **1285**. |
| `fullscreen` | The original Play button asks for it. Needs build **1314**, which is what `minBuild` records. |
| `db` | Save in a `private` collection; ghosts in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

## Optional ghosts

Each player owns one row and only ever writes that row. Pose, look, and
souls caught ride on that row. A ghost is that row drawn with the local
player mesh after the colour pass. Playing alone never waits on a room.

## Building

```bash
node apps/dante/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/dante/build.mjs    # -> site/apps/dante/dante.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere. Do not bump `GIFOS_VERSION`.

## Licences

MIT, Salvatore Previti, 2022. Music by Ryan Malm after Beethoven's Piano
Sonata No. 14. Sounds via a modified SoundBox player (zlib, Marcus
Geelnard). The notices are packed **inside the GIF** as
`COPYING-dante.txt`, `COPYING-soundbox.txt` and `NOTICE` as well as
living here, because a copy of this app that someone was handed is a
distribution of those works.
