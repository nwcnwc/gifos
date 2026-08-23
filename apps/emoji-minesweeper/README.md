# Emoji Minesweeper

An unofficial port of **[emoji-minesweeper](https://github.com/muan/emoji-minesweeper)**
by muan (MIT). Minesweeper, drawn in emoji, with a race: the same seed, two
boards, first to clear wins.

```
index.html      shell: board, settings, race strip
style.css       dark card UI
game.js         the board — port of upstream game.js
net.js          race transport over gifos.db (own row only)
app.js          prefs, settings, race wiring
icon.mjs        procedural mine icon + 1200×720 screenshot
build.mjs       packs the GIF into site/apps/emoji-minesweeper/emoji-minesweeper.gif
COPYING.txt     upstream MIT notice (also packed inside the GIF)
```

## What changed from upstream

- **No service worker.** `sw.js` is dropped; a sandboxed app cannot register one.
- **Native emoji.** Upstream's twemoji path fetched images; the sandbox has
  nowhere to fetch them from. Native emoji is the original's other mode.
- **No analytics, no webfont, no GitHub link.** Nothing leaves the tab.
- **Classic scripts.** No modules. GifOS inlines `<script src>`.
- **Long-press flags.** Upstream listed Mobile as a TODO and only wired hold
  on iPhone. A long-press flags on every touch device, and the click that
  follows is swallowed so a flag is not also a step. Right-click still flags.
- **Race.** Solo is the original (random board, first click is safe). Send
  **Invite** from the GifOS menu and both players get the same seeded board.
  First-click-safe is off in a race — that restart would reshuffle. Live times
  and progress ride on each player's own row. Nobody writes anybody else's.

Invite is OS chrome. This app never draws an invite button.

## capabilities

| capability | why |
|---|---|
| `db` | Last board size (private). Player rows and the race deal (read-write). |
| `multiplayer` | The room. |

`minBuild` is **947**, the App Store itself. `gifos.db` is older than that.

## Building

```bash
node apps/emoji-minesweeper/build.mjs
```

Writes `site/apps/emoji-minesweeper/emoji-minesweeper.gif`. Do not run
`scripts/build-app-catalog.mjs` from this change — `index.json` is owned
elsewhere.

## Licence

MIT, Mu-An Chiou. The notice is packed **inside the GIF** as `COPYING.txt`
as well as living here. No upstream PR: this is an unofficial port.
