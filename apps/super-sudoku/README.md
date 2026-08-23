# Super Sudoku

An unofficial port of **[Super Sudoku](https://github.com/TN1ck/super-sudoku)**
by TN1ck (MIT). A full sudoku — notes, hints, undo, five difficulties — with
a race: the same puzzle, first to finish wins.

![screenshot](screenshot.png)

```
index.html      shell: board, number pad, race strip, settings
style.css       teal/cream board (upstream's look, no webfonts)
game.js         parse, solver, conflicts, notes — classic IIFE
mp.js           race transport over gifos.db (own row only)
app.js          pad, keys, save, race wiring
icon.mjs        procedural grid icon + 1200×720 screenshot
build.mjs       packs the GIF into site/apps/super-sudoku/super-sudoku.gif
vendor.mjs      rebuilds vendor/ from the pinned upstream commit
vendor/         pinned puzzle bank + MIT notice (packed inside the GIF)
```

## What changed from upstream

- **Classic scripts.** Upstream is React/Vite modules. GifOS inlines
  `<script src>` and drops `type=module`, so this tree is ordinary IIFE
  JavaScript. The puzzle files travel inside the GIF. Nothing is fetched.
- **No circle menu, no custom collections, no i18n, no share URL.** The
  number pad is the input — a finger can fill a square. Settings keep auto
  notes, wrong-entry highlight, conflicts and occurrence counts.
- **Save.** Upstream wrote `localStorage`. A GifOS app cannot. The game in
  progress goes into a private `save` collection, on this device, inside
  the app.
- **Race.** Solo is the original (your own puzzle, your own timer). Send
  **Invite** from the GifOS menu and both players get the same puzzle.
  Live times and fill progress ride on each player's own row. Nobody
  writes anybody else's.

Invite is OS chrome. This app never draws an invite button.

## capabilities

| capability | why |
|---|---|
| `db` | Solo save (private). Player rows and the race deal (read-write). |
| `multiplayer` | The room. Needs nothing newer than the App Store, so `minBuild` is **947**. |

No `network`. The puzzles are in the GIF.

## Building

```bash
node apps/super-sudoku/vendor.mjs   # only when moving the pin (needs net)
node apps/super-sudoku/build.mjs    # -> site/apps/super-sudoku/super-sudoku.gif
```

Writes `site/apps/super-sudoku/super-sudoku.gif`. Do not run
`scripts/build-app-catalog.mjs` from this change — `index.json` is owned
elsewhere.

## Licence

MIT, Tom Nick. The notice is packed **inside the GIF** as
`COPYING-super-sudoku.txt` as well as living at
`vendor/COPYING-super-sudoku.txt`. No upstream PR: this is an unofficial
port.
