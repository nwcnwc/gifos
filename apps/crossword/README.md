# Crossword

An unofficial port of **[crosswords-js](https://github.com/dwmkerr/crosswords-js)**
by Dave Kerr (MIT). The player plus one complete baked puzzle. Progress in
the file. Invite shares the grid.

![screenshot](screenshot.png)

Upstream is an npm module. GifOS inlines the committed UMD build
(`dist/crosswords.umd.cjs`). The sample Guardian/Alberich puzzles are not
shipped — `vendor/puzzle.json` is an original 4×4 word square.

```
index.html      grid, clues, pad, tools
style.css       dark wrap around upstream CSS
app.js          controller, save, room, pad
icon.mjs        grid filling in + 1200×720 cover
build.mjs       packs site/apps/crossword/crossword.gif
vendor/         UMD, CSS, puzzle, MIT notice
```

## Building

```bash
node apps/crossword/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
