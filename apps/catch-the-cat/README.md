# Catch the Cat

Tap the dots. Wall the cat in before it reaches the edge.

An unofficial port of **[Catch The Cat](https://github.com/ganlvtech/phaser-catch-the-cat)** by ganlvtech (MIT, Phaser 3). Solo it is the original honeycomb chase; send the invite and everyone plays the same starting board — fewest taps to pen the cat wins.

```
index.html        shell: board, status, roster, undo / new board
style.css         dark, phone-first, tap targets
net.js            presence + the shared round, each player writes only their row
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

No `network`. Nobody writes anybody else's row: each player owns one record in `players` (clicks, whether they won or the cat ran, which round they are on). The shared board is a seed on those rows, so everyone who opens the link rebuilds the same starting walls locally.

## Building

```bash
node apps/catch-the-cat/vendor.mjs   # only when moving a pin (needs net)
node apps/catch-the-cat/build.mjs    # -> site/apps/catch-the-cat/catch-the-cat.gif
```

## Licences

Both notices are packed **inside the GIF** as well as living here:

- Catch The Cat — MIT (`vendor/COPYING-catch-the-cat.txt`)
- Phaser — MIT (`vendor/COPYING-phaser.txt`)
