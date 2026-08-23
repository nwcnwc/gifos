# Checkers

Play the computer on this device, or a friend from one link. No server.

Jump the other side. Crown a king. Against the computer, or a friend.

An unofficial port of **[Checkers](https://github.com/stroibot/Checkers)** by
stroibot (MIT). The computer is his random-legal player (kings preferred half
the time), running on this device. The emoji-css CDN, the background image and
the message-box chrome stay behind. Classic scripts so the GifOS runtime
(which drops `type=module`) can boot it.

```
index.html          setup / local game / play a friend
style.css           wood board, dark frame
board.js            10×10, step, jump, king, must-jump
app.js              game loop, seats, multiplayer
icon.mjs            procedural board icon + 1200×720 cover
vendor/ai.js        stroibot's AI, wrapped as a classic script
build.mjs           packs the GIF into site/apps/checkers/checkers.gif
```

## What you can play

- **Computer** — you pick white or black. White goes first. It thinks on this
  device; there is no server. The computer is the same one that shipped with
  the original: a legal move at random, a king preferred half the time, and a
  jump taken when the rules demand it.
- **Two here** — pass the device. White goes first. Tap a piece, then tap
  where it goes.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  White and black seats, turns. Each person writes only their own row. The
  host of the board (lowest live id) is the only writer of the board row: a
  player publishes an intended move, the host applies it if it is legal.

A game in progress auto-saves in the icon. You must jump when you can. A jump
can chain. Reach the far side and the man becomes a king.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: the AI is plain JavaScript. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/checkers/build.mjs
```

Writes `site/apps/checkers/checkers.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Checkers — MIT, Copyright 2018 stroibot. See
[`vendor/COPYING-checkers.txt`](vendor/COPYING-checkers.txt).
