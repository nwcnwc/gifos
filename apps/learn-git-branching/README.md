# Learn Git Branching

A GifOS port of [Learn Git Branching](https://github.com/pcottle/learnGitBranching) by Peter Cottle (MIT). Type git; watch the commit graph. Progress lives in the GIF. Invite puts two people on the same lesson.

The original engine is Backbone + Raphael + React and talks to `localStorage`. This copy vendors the English lesson corpus and a headless reimplementation of the git simulator (`vendor/git-engine.js`) that speaks the same tree JSON. Every official `solutionCommand` replays to the matching goal tree.

```
index.html          graph, goal, command box, lesson sheets
style.css           dark LGB-ish chrome, phone stack
vendor/git-engine.js  commit-graph engine + tree compare + command parser
vendor/levels.js    36 English lessons extracted from upstream src/levels/
vis.js              SVG painter (newest high)
net.js              same-lesson race
app.js              shell, gifos.db, undo, slides
icon.mjs            sticker graph that grows a branch
build.mjs           packs site/apps/learn-git-branching/learn-git-branching.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Solved lessons and the in-progress tree in a `private` `save` collection. |
| `multiplayer` | A `players` collection: same lesson, first to match the goal. Invite is OS chrome. |

`minBuild` is **947**. `launch.level` opens a named lesson.

## Building

```bash
node apps/learn-git-branching/build.mjs
```

## Licence

MIT, Peter Cottle. The notice is packed inside the GIF as `COPYING.txt`.
