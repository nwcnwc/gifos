# Hexahedral

Push every block down. Thirty Global Game Jam 2016 levels. Close it, come back — your progress is still there.

An unofficial port of **[Hexahedral](https://github.com/mminer/hexahedral)** by mminer (MIT). Upstream is webpack + Redux + virtual-dom. **That shell stays behind.** The thirty jam levels and the toggle-tile rules are the port.

```
index.html          menu, isometric field, progress, overlay
style.css           destack of main.css (no postcss color())
levels.js           the thirty jam puzzles
game.js             move, win/lose, bests, isometric drag
app.js              field, phone slide, private save
icon.mjs            isometric cube icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/hexahedral/hexahedral.gif
vendor/COPYING-hexahedral.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Progress (`save`, private): current level, furthest reached, best moves. |

No `wasm`. No `network`. No `multiplayer`. `minBuild` is **947**.

## Building

```bash
node apps/hexahedral/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

Hexahedral — MIT, Copyright (c) 2018 Matthew Miner. See
[`vendor/COPYING-hexahedral.txt`](vendor/COPYING-hexahedral.txt).
