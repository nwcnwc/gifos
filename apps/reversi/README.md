# Reversi

Flip the disks. Get more of your colour. Against the computer, or a friend.

An unofficial port of **[Reversi](https://github.com/alex-berson/reversi)** by
Alexander Berson (MIT). The computer is his Monte-Carlo tree search, running
on this device. The service worker, PWA chrome and App Store badge stay
behind. Classic scripts so the GifOS runtime (which drops `type=module`) can
boot it.

```
index.html          setup / local game / play a friend
style.css           green board, darkslate frame
board.js            8×8, place, flip, pass, winner
app.js              game loop, seats, multiplayer
icon.mjs            procedural board icon + 1200×720 cover
vendor/ai.js        Berson's MCTS, wrapped as a classic script
build.mjs           packs the GIF into site/apps/reversi/reversi.gif
```

## What you can play

- **Computer** — you pick black or white. Black goes first. It thinks on this
  device; there is no server. The first four black replies are his opening
  book; after that the search runs for a second and a half, same as upstream.
- **Two here** — pass the device. Black goes first. Tap a square to place.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Black and white seats, turns. Each person writes only their own row. The
  host of the board (lowest live id) is the only writer of the board row: a
  player publishes an intended place, the host applies it if it is legal.

A game in progress auto-saves in the icon. If you cannot place, the turn
passes back. When neither of you can, the one with more disks wins.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: the AI is plain JavaScript. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/reversi/build.mjs
```

Writes `site/apps/reversi/reversi.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Reversi — MIT, Copyright (c) 2022-2024 Alexander Berson. See
[`vendor/COPYING-reversi.txt`](vendor/COPYING-reversi.txt).
