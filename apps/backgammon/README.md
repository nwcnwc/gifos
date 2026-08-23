# Backgammon

Fifteen checkers, two dice, a wooden table. Against the computer, or a friend.

An unofficial port of **[backgammonjs](https://github.com/quasoft/backgammonjs)**
by quasoft (MIT). The rules are his general table (`RuleBgCasual` — standard
backgammon without a doubling cube). The Node server, socket.io client, jQuery
and Bootstrap UI stay behind. Classic scripts so the GifOS runtime (which drops
`type=module`) can boot it. Upstream has no computer; the one here searches the
same legal moves on this device.

```
index.html               setup / local game / play a friend
style.css                mahogany table chrome
board.js                 snapshot, roll, move, confirm, undo
app.js                   game loop, canvas board, multiplayer
icon.mjs                 procedural table icon + 1200×720 cover
vendor/model.js          quasoft's model, classic-script wrap
vendor/rule.js           base Rule
vendor/RuleBgCasual.js   general / standard
vendor/ai.js             computer on the same legal moves
build.mjs                packs the GIF into site/apps/backgammon/backgammon.gif
```

## What you can play

- **Computer** — you pick white or black. White goes first. It thinks on this
  device; there is no server.
- **Two here** — pass the device. White goes first. Roll, tap a point, confirm.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  White and black seats, turns. Each person writes only their own row. The
  host of the board (lowest live id) is the only writer of the board row: a
  player publishes an intended roll, move, confirm or undo, the host applies
  it if it is legal.

A game in progress auto-saves in the icon. Hit a blot, it goes to the bar.
Bear all fifteen and you win. Doubles are four moves.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: the AI is plain JavaScript. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/backgammon/build.mjs
```

Writes `site/apps/backgammon/backgammon.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

backgammonjs — MIT, Copyright (c) 2015 quasoft. See
[`vendor/COPYING-backgammonjs.txt`](vendor/COPYING-backgammonjs.txt).
