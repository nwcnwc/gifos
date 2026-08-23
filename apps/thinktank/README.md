# Thinktank

Two sides. Place, move, or turn a tank. Destroy the other base.

An unofficial port of **[Thinktank](https://github.com/averycrespi/thinktank)** by
averycrespi (MIT). The original is a boardgame.io + React client that talks to
a Node match server. This rewrite is classic scripts so the GifOS runtime
(which drops `type=module`) can boot it, and so one GIF is the save. There is
no game server. The computer is ours: a legal-move search that runs on this
device and never cheats.

```
index.html          setup / local game / play a friend
style.css           dark board, 15×18 grid, hand tray
board.js            averycrespi's rules, transcribed
app.js              game loop, seats, multiplayer
icon.mjs            procedural board icon + 1200×720 cover
vendor/ai.js        on-device computer (original has none)
build.mjs           packs the GIF into site/apps/thinktank/thinktank.gif
```

## Rules (faithful)

15×18. Red home top-left, blue home bottom-right. Each home is 3×4 with a
spawn ring around it. Each side starts with a **base** in the home centre
and a hand: 3 shields, 5 tanks (four facings grouped), 2 orthogonal
infiltrators, 2 diagonal infiltrators, 1 mine.

On a turn, one of: **place** (own spawn, empty cell), **move** (piece steps:
shield any-1, tank ortho-1, + infiltrator ortho-1, × infiltrator diag-1,
mine chebyshev-2 and may jump, base any-1 inside home), or **rotate** a tank.
Place and move are refused if they leave any of your own pieces in danger
(shot, stolen, or exploded) — mines may explode themselves but not friends.

Turn end, in order: steal (infiltrator adjacent to an enemy tank or shield —
once per piece), then mark shot / exploded / self-exploding mines, then
return destroyed pieces to their owner's hand. A side whose **base** is in
their hand has lost.

Pieces cannot enter a home except a base staying in its own. Friendly
shields stop enemy tank fire; shots pass through everything else.

## What you can play

- **Computer** — you pick red or blue. Red goes first. It thinks on this
  device; there is no server. It only plays legal moves.
- **Two here** — pass the device. Red goes first. Tap a named piece in the
  tray, then a gold square around your home, to place. Tap a piece already
  out, then a gold square, to move. Tap a tank, then a facing, to turn it
  (it shoots the way it points — the beam lights up). Cyan marks a tank
  you can turn.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Red and blue seats, turns. Each person writes only their own row. The
  host of the board (lowest live id) is the only writer of the board row: a
  player publishes an intended action, the host applies it if it is legal.

A game in progress auto-saves in the icon.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: the computer is plain JavaScript. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/thinktank/build.mjs
```

Writes `site/apps/thinktank/thinktank.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Thinktank — MIT, Copyright (c) 2020 Avery Crespi. See
[`vendor/COPYING-thinktank.txt`](vendor/COPYING-thinktank.txt).
The on-device computer is original to this port.
