# Catch the Cat

Tap the dots. Wall the cat in before it reaches the edge.

An unofficial port of **[Catch The Cat](https://github.com/ganlvtech/phaser-catch-the-cat)** by ganlvtech (MIT, Phaser 3). Solo it is the original honeycomb chase; send the invite and everyone plays the same starting board — fewest taps to pen the cat takes the round, and the room keeps a running score.

```
index.html        shell: board, status, roster, undo / new board
style.css         dark, phone-first, tap targets
net.js            presence, the shared round, and the series — each player writes only their row
boot.js           sizes the board, starts Phaser, talks to net.js
icon.mjs          procedural hex+cat icon and 1200×720 cover
vendor.mjs        rebuilds vendor/phaser.js + vendor/game.js from the pins
build.mjs         packs site/apps/catch-the-cat/catch-the-cat.gif
vendor/phaser.js  GENERATED. Phaser 3.16.1, classic IIFE. Never edit.
vendor/game.js    GENERATED. Pinned upstream as one IIFE. Never edit.
```

## Why Phaser is inside the GIF

GifOS inlines every `<script src>` and drops `type="module"`, and the sandbox has `connect-src 'none'`. A CDN copy of Phaser would never load. `vendor.mjs` downloads the pinned `phaser.min.js` and bundles the TypeScript game (cat SVGs included) as a classic IIFE that expects `window.Phaser`. Both ride inside the GIF, with their MIT notices.

## capabilities

| capability | why |
|---|---|
| `db` | Player rows for the race. |
| `multiplayer` | The room. The invite is OS chrome — this app never draws an Invite button. |

No `network`. Nobody writes anybody else's row: each player owns one record in `players` — clicks, whether they won or the cat ran, which round they are on, and their running tally (wins, rounds played, best board, streak). The shared board is a seed on those rows, so everyone who opens the link rebuilds the same starting walls locally.

The series is therefore **self-scored**, and that holds because the rule is deterministic: when every live player on the current round has finished, the fewest taps takes it, ties share it, and each client increments only its OWN row. Two screens cannot disagree unless they saw different rows. Rows heartbeat, because the collection is the host's stored state and a closed tab leaves its row behind forever — a player who goes quiet ages out of the roster instead of hanging the round. The last player standing scores nothing: a win by attrition would make quitting worth a point.

Guarded by `test/unit/catch-the-cat.js` (two real clients, one collection, the scoring rule) and `test/browser/e2e-ctc-race.js` (the standings, the finished-board lock, the verdict, and name escaping).

## Building

```bash
node apps/catch-the-cat/vendor.mjs   # only when moving a pin (needs net)
node apps/catch-the-cat/build.mjs    # -> site/apps/catch-the-cat/catch-the-cat.gif
```

## Licences

Both notices are packed **inside the GIF** as well as living here:

- Catch The Cat — MIT (`vendor/COPYING-catch-the-cat.txt`)
- Phaser — MIT (`vendor/COPYING-phaser.txt`)
