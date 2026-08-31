# Chrome Dino

Chromium's offline T-Rex, running as an ordinary sandboxed GifOS app. Solo it
is chrome://dino. Send the invite and a second dino appears in the same desert.

The engine is **[t-rex-runner](https://github.com/wayou/t-rex-runner)** by
wayou — a BSD extraction of Chromium's `offline.js` (The Chromium Authors,
BSD-3-Clause). This directory is the GifOS port: a classic-script shell around
it, JUMP / DUCK on a phone, the high score in the file, and the side-by-side
run. Upstream has no networking and does not persist a high score.

```
index.html          canvas host, sprites, sounds, touch markup
style.css           original light desert + race chrome
vendor/game.js      Chromium runner, vanilla. Never fetch it at runtime.
net.js              extra dinos — presence, shared seed, ghosts, the race bar
touch.js            JUMP / DUCK, written into the same key handlers
boot.js             mount, high score, wiring
icon.mjs            running dino from the real sprite sheet, and the cover
vendor.mjs          rebuilds vendor/ from the pinned commit
build.mjs           packs site/apps/chrome-dino/chrome-dino.gif
```

## Why this can run as a GifOS app

Upstream is one canvas, a sprite sheet, and three tiny sounds already inlined
as data URLs. The sandbox cannot fetch, so the sheets and sounds ride as files
the packer inlines. `connect-src 'none'` then costs it nothing. The original
kept the high score only in memory; this copy writes it to the file.

## capabilities

| capability | why |
|---|---|
| `db` | High score in a `private` collection; runners in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Extra dinos

Each runner owns one row and only ever writes that row. A shared obstacle seed
means the cacti and birds match. A guest who is ahead or behind is drawn as a
ghost on this canvas. Clouds stay random so they cannot desync the course.

## Building

```bash
node apps/chrome-dino/vendor.mjs   # only when moving the pin (needs net)
node apps/chrome-dino/build.mjs    # -> site/apps/chrome-dino/chrome-dino.gif
```

## Licence

BSD-3-Clause, The Chromium Authors and wayou. Both notices are packed
**inside the GIF** as `COPYING-chromium.txt` and `COPYING-t-rex-runner.txt`.
