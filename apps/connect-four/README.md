# Connect Four

Drop a disc. Connect four. Against the computer, or a friend.

An unofficial port of **[c4](https://github.com/kenrick95/c4)** by kenrick95
(MIT). The computer is his minimax with alpha-beta pruning, running on this
device. The Vite / TypeScript UI is rewritten as classic scripts so nothing is
loaded from a CDN, and so the GifOS runtime (which drops `type=module`) can
boot it.

```
index.html          setup / local game / play a friend
style.css           grey board chrome
board.js            6×7, drop, four in a line
app.js              game loop, canvas board, multiplayer
icon.mjs            procedural grid icon + 1200×720 cover
vendor/ai.js        kenrick95's AI, transcribed to a classic script
build.mjs           packs the GIF into site/apps/connect-four/connect-four.gif
```

## What you can play

- **Computer** — you drop red, it drops blue. Depth 4, same evaluation as
  upstream. It thinks on this device; there is no server.
- **Two here** — pass the device. Red goes first. Tap a column to drop.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Red and blue seats, turns. Each person writes only their own row. The
  host of the board (lowest live id) is the only writer of the board row: a
  player publishes an intended drop, the host applies it if it is legal.

A game in progress auto-saves in the icon. A disc falls with gravity and a
bounce. The winning four is a gold line. Whose turn is the two coloured
seats, not just a sentence. On a phone, the whole column is the hit target
— any height of the board, not just a hole.

Store cover is a Playwright shot of the live board (`tools/shoot.js`).
`build.mjs` will not clobber `screenshot.png`.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: the AI is plain JavaScript. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/connect-four/build.mjs
```

Writes `site/apps/connect-four/connect-four.gif`. The MIT notice rides inside
the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

c4 — MIT, Copyright (c) Kenrick. See
[`vendor/COPYING-c4.txt`](vendor/COPYING-c4.txt).
