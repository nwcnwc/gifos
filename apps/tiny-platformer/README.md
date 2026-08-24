# Tiny Platformer

Jake Gordon's minimal canvas platformer, running as a sandboxed GifOS app.
Solo it is the original cave: a yellow square, gold, grey patrols. This copy
adds on-screen jump/left/right and keeps the best run in the file.

The engine is
**[javascript-tiny-platformer](https://github.com/jakesgordon/javascript-tiny-platformer)**
by Jake Gordon — MIT, a few hundred lines of rectangles. Upstream is keyboard
only and loads `level.json` with XHR.

```
index.html              canvas, HUD, touch markup
style.css               dark stage, thumb buttons
boot.js                 gifos.db high score, HUD
touch.js                LEFT / RIGHT / JUMP → player.left/right/jump
icon.mjs                jumping square + 1200×720 cover
vendor.mjs              rebuilds vendor/ from the pinned commit
build.mjs               packs site/apps/tiny-platformer/tiny-platformer.gif
vendor/platformer.js    original loop, camera + no XHR
vendor/level.js         the Tiled map as TINY_LEVEL
```

## capabilities

| capability | why |
|---|---|
| `db` | Best coins/stomps in a `private` `prefs` collection. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.
No `multiplayer` — there is nothing to sync. Invite is OS chrome.

## Building

```bash
node apps/tiny-platformer/vendor.mjs   # only when moving the pin (needs net)
node apps/tiny-platformer/build.mjs    # -> site/apps/tiny-platformer/tiny-platformer.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

MIT, Jake Gordon. The notice is packed **inside the GIF** as `COPYING.txt`.
