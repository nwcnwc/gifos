# SkiFree

Race a ghost from one link. On a phone you drag or tilt. Playing alone is
SkiFree; a ghost of your best run skis with you next time. Send the invite
and a friend is a ghost on your slope — farthest down the mountain wins.

An unofficial port of **[SkiFree.js](https://github.com/basicallydan/skifree.js)**
by basicallydan (MIT). Upstream is a solo canvas ski, with Hammer.js for a
finger on the piste. This directory is the GifOS wrap: persistence, thumb ski
and tilt without those libraries, and the ghosts. The invite button is OS
chrome — the app never draws one.

```
index.html          canvas, hidden sprite <img>s, race HUD, boost button
style.css           white slope, phone, the race bar
boot.js             load, high score, keyboard, replay without a page reload
mp.js               each skier's own row, ghosts, the race
touch.js            drag on the piste, tilt, double-tap / boost
icon.mjs            racing icon + mid-run cover from the real sprites
vendor.mjs          rebuilds vendor/* from the pin. The only net step.
build.mjs           packs the GIF into site/apps/skifree/skifree.gif
vendor/             GENERATED. Classic engine IIFE + sprite PNGs. Never edit.
COPYING.txt         MIT (SkiFree.js)
NOTICE              unofficial-port addendum
```

## Why this can run as a GifOS app

Upstream is ESM that esbuild bundles with Hammer.js and Mousetrap. GifOS's
runtime inlines `<script src>` and drops `type=module`, so `vendor.mjs` strips
the imports and emits one classic IIFE. Image paths in JS would 404 inside a
srcdoc iframe, so the sheets ride as PNGs referenced from hidden `<img>` tags
the runtime rewrites. High score used `localStorage`; a sandbox has none, so
`boot.js` keeps it in `prefs`. Replay is in-place — a GifOS app cannot reload.

## capabilities

| capability | why |
|---|---|
| `db` | High score and best-run tape in `prefs` (private). Live ghost state in `room` (read-write). |
| `multiplayer` | The room. The invite link is the race. |
| `motion` | Phone tilt steers. Optional — keys and a finger still work. |

No `network`. Tilt degrades to drag on a build that does not broker motion, so
`minBuild` stays **947**.

## The race

There is no server. Each player writes only their own row: map position, pose,
metres, lives left. A ghost is that row drawn on your slope. First to run out
of skiers is waiting; farthest when everyone is out wins. Playing alone never
waits on a room — a ghost of your best run skis with you instead.

## Building

```bash
node apps/skifree/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/skifree/build.mjs    # -> site/apps/skifree/skifree.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere. Do not bump `GIFOS_VERSION`.

## Licences

MIT, Daniel Hough, 2013. The notice is packed **inside the GIF** as
`COPYING.txt` and `NOTICE` as well as living here, because a copy of this
app that someone was handed is a distribution of that work. Sprites: Wing
Wang Wao / Spriters Resource, as credited upstream. Original SkiFree is
Chris Pirih, 1991. No upstream PR: this is an unofficial port.
