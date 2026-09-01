# Blockly Games — gauntlet critic

Bar ONE is [blockly.games](https://blockly.games) as Google shipped it: the path of eight games, Puzzle / Maze / Turtle with Pegman, animal photos, the faint turtle square, level dots that become **stars**, 50+ languages. Driven live (home, `/maze`, `/puzzle`, `/turtle`).

Bar TWO is the platform: offline; solved levels and stacked blocks in the GIF; one Invite opens the same game, level, and XML.

Judged on the packed GIF in `run.html#id=` (desktop 1100×800), the unpacked tree, `/store.html#app=blockly-games`, Home Screen at 64px, and blockly.games in the same headless Chromium. One Chromium. GIF filesystem decoded with `GifOS.gif.decode`.

**Winner: COMP**

**Single biggest remaining gap:** The packed GIF does not load Blockly. `run.html` unpacks the scripts into the sandbox iframe; `blockly_compressed.js` throws **`missing ) after argument list`** (the build inlines `sprites.png` as a data URL three times into the minified file). Then `Cannot read properties of undefined (reading 'Msg')` and `(reading 'Blocks')`. `window.Blockly` is undefined. `window.BG` is never assigned because `go()` dies on `BGBlocks.initCommon()`. The home screen is static HTML. Tapping Maze focuses the card and does nothing. Until Maze 1 shows Pegman walking to the flag *inside the GIF*, this is not Blockly Games.

**Stranger-reason:** I know blockly.games. I would use this copy if close-on-Maze-7 still had my blocks, with no account, and an Invite landed a friend on the same level. I cannot say that back from *using* the GIF. The listing’s stars, progress, and invite are reasons I can recite. They are not reasons I can demonstrate. The website still plays.

**Wall breaks:**

- **The GIF does not run Blockly.** Page errors on every open. Home is a poster. Puzzle / Maze / Turtle are not playable in the sandbox. This is the product.
- **Catalog (broken).** `site/apps/blockly-games/{blockly-games.gif,app.json,cover.jpg}` exist (555 KB, signed). `site/apps/index.json` has 156 apps and does **not** list `blockly-games`. Store search for “blockly” is “Nothing matches that.” Deep-link `#app=blockly-games` still renders.
- **No CDN at load (held, vacuously).** App iframe: zero requests off origin. Scripts are inlined. Packed `vendor/blockly_compressed.js` still contains the default `https://blockly-demo.appspot.com/static/media/` string; `boot.js` sets `media: ''`, which is falsy, so a live Blockly would have fetched zoom/delete sprites from appspot. It never gets that far. Unpacked play (Blockly actually injects) made no off-origin requests.
- **Licences packed (held).** `COPYING-blockly-games.txt`, `COPYING-blockly.txt` in the GIF. Apache-2.0. Blessed false.
- **Stars in the file (listing overclaim).** There is no star UI. Home cards say “One puzzle” / “10 paths” / “10 pictures”. Level buttons get `.done` (green ring) in code; the original fills circles with 1–3 stars after a win. Tagline: “your stars live in the file.” Failed round.

---

## Pieces

### Packed GIF — COMP, and dead

Probe after install + `run.html#id=`:

- Scripts present: blockly_compressed, msg-en, assets, blocks, maze, turtle, puzzle, net, boot (all inline).
- Globals: `MazeGame` / `TurtleGame` / `PuzzleGame` / `Net` / `BGBlocks` / `gifos` are objects. `Blockly` undefined. `BG` undefined.
- Invite in OS chrome: `display: flex`. Help / Save present.
- Click `#card-maze`: green outline, still on home. `play` stays `hidden`.

`build.mjs` rewrites `sprites.png` → data URL in the compressed Blockly before packing. That rewrite is what does not parse in the sandbox. The source `vendor/blockly_compressed.js` still parses — unpacked is a different app.

### Unpacked Maze — COMP, unplayable for a second reason

Maze chrome appears: Games / Maze / levels 1–10 / Run / flyout of **move forward / turn left / turn right**. The board is a **black rectangle**. Pegman never draws. `maze.js` declares `ctx` and never assigns `canvas.getContext('2d')`. `paint()` throws `Cannot set properties of undefined (setting 'fillStyle')` from `mount` → `resetPos`. Blockly.inject still ran, so the toolbox is there; `loadXml` of the default move-forward never runs because `mount` threw. `MazeGame.run` hits the same paint. **Games (back)** calls `engine().reset()` → paint → throw, so you cannot leave Maze. Comp’s Maze 1 is beige isometric tiles, Pegman, yellow path, flag, a move-forward already on the workspace.

Puzzle/Maze/Turtle “actually playable?” **Maze: no.** Not in the GIF, not in the tree.

### Unpacked Turtle — tied on the picture, not in the GIF

Level 1: black 400×400, faint square, turtle (circle + heading), toolbox move / turn / repeat, stacked `repeat 4 { move 100; turn 90 }` on the workspace. Looks like blockly.games/turtle with the intro modal skipped. Run was started; the Chromium died during the draw (box load), so a win modal was not captured. Source walks the tree (no eval). This is the one game that *looks* like the original. The GIF never reaches it.

### Unpacked Puzzle — OURS on the pieces, not in the GIF

Duck / cat / bee / snail photos, green animal blocks, picture puzzle pieces, traits (Beak, Honey, Slime…). Check on the shuffle: “16 blocks are incorrect.” Slime highlighted. Same animals as Google. After Check, a **Run** button appears (`resultOf` unhides `#run` even on Puzzle) — chrome bug, not the gap. GIF never reaches it.

### Stars + progress in the GIF — not a win

Bar TWO asked for stars and progress in the file. Home progress text is counts, not stars. `solved.maze` is an array of level numbers; original awards 1–3 stars from remaining blocks. Invite XML exists in `net.js` (last-writer `seq`). Unreachable while Blockly is dead. Listing “close it on Maze 7… still on 7, still with the blocks” is an overclaim of this build.

### ICON — weak OURS

64px dark rounded sticker, two blocks (green + purple) on a Home Screen next to Camera. Reads as “blocks,” not as Maze/Pegman. Comp has no icon; the original *index* is a illustrated path (Puzzle piece, Pegman, bird, turtle…). The loop is two blocks snapping in `icon.mjs`; a still does not demonstrate a game.

### Cover — COMP, and a lie about ours

Pixel poster of a beige-tile maze with REPEAT UNTIL / MOVE FORWARD / RUN. Not Pegman, not Blockly chrome, not a frame of the running app (the running GIF is three emoji cards; the running unpacked Maze is a black square and purple blocks). Comp’s maze screenshot *is* Pegman on the yellow path.

### Listing copy — right lead; claims not true of this build

Rendered `/store.html#app=blockly-games`:

- Tagline: “Puzzle, Maze, Turtle — offline, your stars live in the file, an invite opens the same level.”
- Description leads with plane / Maze 7 / Invite / no account, then the three games, unofficial port of Google.
- Unofficial-port pill. Apache-2.0. 555 KB.

Every play claim sits next to a GIF whose Blockly does not parse. Stars do not exist as UI. Invite cannot open a level that cannot open. Catalog grid is empty for this name.

### Missing games — not the gap

Bird, Movie, Music, Pond Tutor, Pond, and 50+ locales are on the original path and not in this GIF. The brief was Puzzle / Maze / Turtle. None of those three play in the GIF; Maze does not play in the tree. Locales and the rest of the path can wait.

---

COMP still wins because the original plays. The stranger-reason is the file and the invite, and they are theoretical until Blockly parses in the sandbox, `ctx` is a real 2D context, Pegman walks Maze 1, and a filled level is a star that survives reopen.
