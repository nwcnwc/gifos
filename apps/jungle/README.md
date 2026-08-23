# Jungle

Jungle chess, the Chinese animal game (Dou Shou Qi). Our engine of the
traditional public-domain rules — not a wrap of FlyAnt16/doushouqi, not
boardgame.io, not React. Classic scripts so the GifOS runtime (which drops
`type=module`) can boot it.

```
index.html     setup / local game / play a friend
style.css      dark #0a0a0f, green board, river
board.js       7×9, ranks, traps, dens, water, jumps
ai.js          minimax + alpha-beta, depth 2–3, legal moves only
app.js         game loop, seats, host-authority multiplayer
icon.mjs       procedural board icon + 1200×720 cover
build.mjs      packs the GIF into site/apps/jungle/jungle.gif
```

## Board

7 columns × 9 rows. Blue sits the top of the array and moves first. Red sits
the bottom. Each side has a **den** in the centre of its back rank, three
**traps** beside and in front of that den, and two **rivers** in the middle
(two 3×2 water rectangles: rows 3–5, columns 1–2 and 4–5).

Starting setup is the standard Jungle layout, Red at the bottom, Blue the
180° rotation so each animal faces its counterpart:

| | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| 0 | Tiger | | trap | **den** | trap | | Lion |
| 1 | | Cat | | trap | | Dog | |
| 2 | Elephant | | Wolf | | Leopard | | Rat |
| 3–5 | land | water | water | land | water | water | land |
| 6 | Rat | | Leopard | | Wolf | | Elephant |
| 7 | | Dog | | trap | | Cat | |
| 8 | Lion | | trap | **den** | trap | | Tiger |

Rows 0–2 are Blue, 6–8 are Red.

## Ranks

Elephant 8, Lion 7, Tiger 6, Leopard 5, Wolf 4, Dog 3, Cat 2, Rat 1.

Higher rank captures lower. Equal rank captures equal.

- **Rat captures Elephant** (from land). **Elephant cannot capture Rat.**
- A piece in an *opponent* trap has rank 0 and can be captured by anything.
  Own traps do not affect your pieces.
- Land and water cannot take each other: a rat in the water is only taken by
  a rat in the water, and cannot take the elephant from the water.

## Movement

Orthogonal, one square. Never into your own den. Entering the opponent’s den
wins. Capturing the last opposing animal also wins, as does leaving them with
no legal move.

- Only the **Rat** may enter water.
- **Lion** and **Tiger** jump straight across water (horizontally or
  vertically) onto empty or capturable land. A rat of either colour sitting
  on any square of the jump path blocks it.

## Computer

`ai.js` is minimax with alpha-beta pruning, depth 2 while the board is full
and depth 3 once pieces have come off. The evaluation is material (the rat
priced up because it swims, takes the elephant, and blocks a jump), distance
to the enemy den, and a penalty for sitting in a trap. Every candidate is
taken from `legalMoves()` and applied with `play()` — the computer does not
cheat.

## Multiplayer

Play a friend uses one `room` collection. Each person writes **only** their
own row (`id = me`), publishing an intended `{kind:'move', fr, fc, tr, tc,
seq}`. The host (lowest live id) is the only writer of the `board` row: it
replays the move list, applies the intent if `play()` accepts it, and bumps
`seq`. Invite is OS chrome — this app does not draw a share button.

A local game auto-saves in the private `save` collection. The file is the
save.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm`: the AI is plain JavaScript. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/jungle/build.mjs
```

Writes `site/apps/jungle/jungle.gif`. Do not run `scripts/build-app-catalog.mjs`
from this change — `index.json` is owned elsewhere.

## Licence

MIT. The rules of Jungle / Dou Shou Qi are traditional and public domain.
This implementation is original to GifOS.
