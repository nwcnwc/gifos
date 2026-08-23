# Tic-Tac-Toe

Three in a row, against the computer or a friend.

An unofficial port of **[Colyseus Tic-Tac-Toe](https://github.com/colyseus/demo-tic-tac-toe)**
(MIT, Endel Dreyer / Colyseus). Upstream is a turn-based demo that **needs a
Colyseus Node server** — `server/` *is* the room (schema, lock at two clients,
10-second auto-move) and the browser client is PixiJS talking to it over
`colyseus.js`. **This copy has no game server.** The Colyseus room, the Node
process, and every socket path stay behind. The GifOS meeting is the room.

```
index.html          setup / local game / play a friend
style.css           paper board, X and O
rules.js            3×3, three in a line, perfect-play CPU
app.js              game loop, seats, multiplayer
icon.mjs            X and O placing, a win line; 1200×720 cover
build.mjs           packs the GIF into site/apps/tic-tac-toe/tic-tac-toe.gif
COPYING.txt         upstream MIT notice (also packed inside the GIF)
```

## What you can play

- **Computer** — perfect play on this device (minimax; it does not lose).
  X or O; X goes first.
- **Two here** — pass the device. X goes first.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Two seats, turns. Each person writes only their own row. The host of the
  board (first seated / lowest id) is the only writer of the board row: a
  player publishes an intended move, the host applies it if it is legal.

A game in progress auto-saves in the icon. Wins, draws and losses against the
computer or a friend stay on this device.

## Why this is a rewrite, not a vendor of the Pixi stack

Upstream is TypeScript modules: a PixiJS stage, JennaSue webfonts, a PNG
board, and Colyseus.js for the wire. GifOS's runtime inlines `<script src>`
and **drops `type="module"`**, so that graph cannot run in a GIF as-is, and
the Node server cannot come along at all (`connect-src` is `'none'`; the
manifest declares **no `network` capability**). The playable thing — a 3×3,
X and O, three in a line — is small enough to draw in classic scripts.

The invite button is **OS chrome**. This app never draws one.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, stats, and the shared board. |
| `multiplayer` | The room. |

No `wasm`. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/tic-tac-toe/build.mjs
```

Writes `site/apps/tic-tac-toe/tic-tac-toe.gif`. Do not run
`scripts/build-app-catalog.mjs` from this change — `index.json` is owned
elsewhere.

## Licence

Colyseus Tic-Tac-Toe — MIT, Copyright (c) 2016-2018 Endel Dreyer. See
[`COPYING.txt`](COPYING.txt). The notice rides **inside the GIF** as well,
because a copy of this app that someone was handed is a distribution of
that work.
