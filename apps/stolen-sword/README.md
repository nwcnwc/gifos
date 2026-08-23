# Stolen Sword

A one-finger action platformer that runs as an ordinary sandboxed GifOS app.
Solo it is chiaogu's js13k chase. Send the invite and extra swordsmen appear
in the same grove, flying their own lines.

The game is **[Stolen Sword](https://github.com/chiaogu/stolen-sword)** by
chiaogu — MIT, the 2020 js13kGames entry. This directory is the GifOS port:
a classic-script shell around it, a page that does not scroll under a thumb,
and the extra bodies. Upstream has no networking.

```
index.html          canvas, the press hint, scoreboard
style.css           overlay chrome
vendor/game.js      GENERATED. Original ESM, flattened to one IIFE. Never edit.
boot.js             localStorage stand-in over gifos.db('prefs')
mp.js               ghost swordsmen — pose publish, same-land draw
icon.mjs            procedural grove + sword icon and the 1200×720 cover
vendor.mjs          rebuilds vendor/ from the pin. The only net step.
build.mjs           packs site/apps/stolen-sword/stolen-sword.gif
```

## Why this can run as a GifOS app

Upstream is already a canvas game with no fetches, no workers, no wasm. The
only thing it stored was a land index in `localStorage`, which a sandboxed
frame does not have. `boot.js` hangs a Storage-shaped object on window and
flushes the same keys into `gifos.db('prefs')`. `connect-src 'none'` then
costs it nothing.

The sources are ES modules. GifOS inlines `<script src>` and drops
`type=module`, so `vendor.mjs` concatenates the pin in dependency order and
strips import/export.

## capabilities

| capability | why |
|---|---|
| `db` | Land / tutorial flag in a `private` collection; player pose in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

No `network`, no `pointer`. Needs nothing newer than the App Store itself, so
`minBuild` is **947**.

## Extra bodies

Each player owns one row and only ever writes that row. Remote players are
the same skeleton, tinted, drawn at their published pose if they are on the
same land. There is no shared sim — everyone fights their own grove. Solo is
the original campaign unchanged.

## Building

```bash
node apps/stolen-sword/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/stolen-sword/build.mjs    # -> site/apps/stolen-sword/stolen-sword.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere. Do not bump `GIFOS_VERSION`.

## Licence

MIT, chiaogu / Ian Chiao, 2020. The notice is packed **inside the GIF** as
`COPYING-stolen-sword.txt` as well as living here, because a copy of this
app that someone was handed is a distribution of that work. Sounds via zzfx
as bundled by upstream.
