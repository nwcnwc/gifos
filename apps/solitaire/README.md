# Solitaire

Klondike. The file is the tableau. Tap-to-move on a phone.

An unofficial port of **[js-solitaire](https://github.com/rjanjic/js-solitaire)** by rjanjic (MIT). Upstream is a webpack/SCSS page with a card sprite and Win95 chrome. **The sprite is a placeholder in that repo.** This copy destacks to classic scripts, draws the cards in CSS, and keeps the tableau in the file.

```
index.html          felt, stock, waste, foundations, seven columns
style.css           dark felt, CSS cards
klondike.js         rules, undo, draw 1/3, snapshot (tests play this)
app.js              tap-to-move, drag, hint, auto-complete, private save
icon.mjs            procedural ace icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/solitaire/solitaire.gif
vendor/COPYING-solitaire.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | The tableau (`save`, private). |

No `wasm`. No `network`. No `multiplayer` — this is a one-player patience. `minBuild` is **947**.

## Building

```bash
node apps/solitaire/build.mjs
```

Writes `site/apps/solitaire/solitaire.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

js-solitaire — MIT, Copyright (c) 2021 Radovan Janjic. See
[`vendor/COPYING-solitaire.txt`](vendor/COPYING-solitaire.txt).
