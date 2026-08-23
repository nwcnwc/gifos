# BesoGo

A Go board. Two seats. Tap to place a stone.

An unofficial port of **[BesoGo](https://github.com/yewang/besogo)** by yewang
(MIT). The board, the stones, and the rules (captures, ko, suicide) are his.
The jQuery-free UI is already classic scripts; this surface adds two seats
over Invite. Realistic stone photographs from upstream are not shipped — they
are Creative Commons, not MIT — so the SVG stones and the flat wood fill are
used instead.

```
index.html              setup / two here / play a friend
style.css               wooden board chrome
app.js                  seats, turns, touch place, multiplayer
icon.mjs                procedural goban icon + 1200×720 cover
vendor/js/              yewang's engine and board, unmodified
vendor/css/             besogo.css + board-flat.css
build.mjs               packs the GIF into site/apps/besogo/besogo.gif
```

## What you can play

- **Two here** — pass the device. Black goes first. Tap an empty point.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Black and white seats, turns. Each person writes only their own row. The
  host of the board (first seated / lowest id) is the only writer of the
  board row: a player publishes an intended place or pass, the host applies
  it if it is legal. Undo of the stone you just put down if the other person
  has not answered yet; further than that, both have to tap Undo.

9×9, 13×13, or 19×19. Two passes in a row end the game. A game in progress
auto-saves in the icon.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: BesoGo is plain JavaScript. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/besogo/build.mjs
```

Writes `site/apps/besogo/besogo.gif` (~213 KB). The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

BesoGo — MIT, Copyright (c) 2015-2018 Ye Wang. See
[`vendor/COPYING-besogo.txt`](vendor/COPYING-besogo.txt).
