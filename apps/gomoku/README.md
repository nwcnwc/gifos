# Gomoku

Five in a row, against the computer or a friend.

An unofficial port of **[HTML5 Gomoku](https://github.com/yyjhao/HTML5-Gomoku)**
by yyjhao (MIT). The computer is his nega-scout worker, running on this device.
The jQuery Mobile UI is rewritten so nothing is loaded from a CDN.

```
index.html          setup / local game / play a friend
style.css           wooden board chrome
rules.js            15×15, five in a line, legal place / undo
app.js              game loop, canvas board, multiplayer
icon.mjs            fifth stone completing a line; mid-game fight cover
vendor/ai-worker.js yyjhao's AI, unmodified
build.mjs           packs the GIF into site/apps/gomoku/gomoku.gif
```

## What you can play

- **Computer** at novice, medium, or expert. Black or white. The first two
  stones follow his opening book (centre, then a neighbour); after that the
  worker searches.
- **Two here** — pass the device. Black goes first.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Black and white seats, turns. Each person writes only their own row. The
  host of the board (first seated / lowest id) is the only writer of the
  board row: a player publishes an intended move, the host applies it if it
  is legal. Undo of the stone you just put down if the other person has not
  answered yet; further than that, both have to tap Undo.

A game in progress auto-saves in the icon.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: the AI is plain JavaScript. If the sandbox allows a Worker, the
original worker runs as one; otherwise the same source runs on this thread
via a factory wrap at pack time. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/gomoku/build.mjs
```

Writes `site/apps/gomoku/gomoku.gif`. The MIT notice rides inside the GIF.

## Licence

HTML5 Gomoku — MIT, Copyright (c) 2013 Yao Yujian. See
[`vendor/COPYING-gomoku.txt`](vendor/COPYING-gomoku.txt).
