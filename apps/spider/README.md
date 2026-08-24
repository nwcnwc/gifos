# Spider

One-suit Spider patience. The file is the tableau.

An unofficial port of **[spider-solitaire](https://github.com/lklynet/spider-solitaire)** by lklynet (MIT). Upstream is React + Zustand + Vite. **That shell stays behind.** This copy destacks the engine (deal, moves, undo) to classic scripts.

```
index.html          ten piles, stock, foundations, controls
style.css           dark felt, CSS rank cards
engine.js           destack of deck.ts / moves.ts / replay.ts
app.js              tap-to-move, undo, private save
icon.mjs            procedural icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/spider/spider.gif
vendor/COPYING-spider.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | The tableau (`save`, private). |

No `wasm`. No `network`. No `multiplayer`. `minBuild` is **947**.

## Building

```bash
node apps/spider/build.mjs
```

Writes `site/apps/spider/spider.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

spider-solitaire — MIT, Copyright (c) 2025 Lee Kelly. See
[`vendor/COPYING-spider.txt`](vendor/COPYING-spider.txt).
