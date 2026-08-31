# Blockly Games

Google's [Blockly Games](https://blockly.games) — Puzzle, Maze, and Turtle —
running as a sandboxed GifOS app. Progress lives in `gifos.db`. An invite
opens the same game and level, with the same blocks.

Upstream is Apache-2.0: the games from
[google/blockly-games](https://github.com/google/blockly-games) and the editor
from [Blockly 10.4.3](https://github.com/RaspberryPiFoundation/blockly). Both
licences ride inside the GIF.

```
index.html      home + play chrome
style.css       dark workspace, fat phone flyout
blocks.js       Puzzle / Maze / Turtle block types
maze.js         ten maps, pegman, no eval
turtle.js       ten drawings, pixel-compare
puzzle.js       animals, pictures, traits
net.js          invite shares game + level + blocks
boot.js         gifos.db, launch, back
vendor/         Blockly 10.4.3 + pegman + puzzle photos
icon.mjs        blocks snapping, a turtle stroke
build.mjs       packs site/apps/blockly-games/blockly-games.gif
```

## Why this can run as a GifOS app

The sandbox has no `eval` and no network. Blockly Games originally compiled
blocks to JavaScript and ran them in JS-Interpreter. This port walks the
Blockly tree itself — move, turn, repeat, if — so generated code never runs.
Sprites and animal photos are data URLs. `connect-src 'none'` costs it nothing.

## capabilities

| capability | why |
|---|---|
| `db` | Solved levels and stacked blocks in a `private` save; presence + shared blocks in a `read-write` `players` collection. |
| `multiplayer` | Invite is OS chrome. A guest lands on the host's game and level. |

Needs nothing newer than the App Store, so `minBuild` is **947**. A `launch`
block lets a link open `puzzle`, `maze`, or `turtle` at a level; older GifOS
ignores it and the app opens on the saved game.

## Building

```bash
node apps/blockly-games/build.mjs   # -> site/apps/blockly-games/blockly-games.gif
```

## Licence

Apache-2.0, Google LLC (Blockly Games) and the Blockly authors. Notices packed
inside the GIF as `COPYING-blockly-games.txt` and `COPYING-blockly.txt`.
