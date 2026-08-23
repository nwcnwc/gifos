# One Stroke

A blank page that teaches the stroke. Each person draws exactly one line —
a curve, a scribble, a secret — then sends it, and the turn passes. After a
round the table names the picture. It plays back as a loop of the strokes
arriving, in order.

This is not a whiteboard. Excalidraw and Drawnix already cover that. One
Stroke is the constraint: the picture can only exist because several people
opened the same file. The invite is the studio.

```
index.html          setup / solo doodle / play with friends
style.css           dark paper, gold turn chrome
game.js             turns, host apply, playback order, titles
app.js              pointer pad, solo save, room, vote, loop
icon.mjs            a line drawing itself + 1200×720 cover
build.mjs           packs the GIF into site/apps/one-stroke/one-stroke.gif
```

## What you can play

- **Solo** — lands on the page. A ghost line draws itself until you do.
  One stroke at a time, a stack of lines, playback. The doodle lives in
  this file (`gifos.db('save')`, private).
- **With friends** — send the invite (top bar; that button is OS chrome).
  Seats around the page. Whose-turn sits on the paper. You cannot draw
  when it is not your turn. Each person writes only their own row. The
  host of the page (lowest live id) is the only writer of the picture
  row: a player publishes an intended stroke, the host appends it if it
  is legal. After a round, a title vote, then the loop.

A stroke is a compact list of `{x,y}` in `0..1` plus a palette colour and a
width. No bitmaps go in the hot collection.

On a phone, a finger draws one line until pointerup; that is the stroke.
Undo only clears the in-progress stroke before you send.

## capabilities

| capability | why |
|---|---|
| `db` | Solo doodle, and the shared picture. |
| `multiplayer` | The room. |

No `wasm`. No `network`. No `pointer` (ordinary pointer events; the canvas
sets `touch-action: none`). `minBuild` is **947**.

Collections: `save` private, `room` read-write. The picture row id is
`picture`. Player rows use `me.id`.

## Building

```bash
node apps/one-stroke/build.mjs
```

Writes `site/apps/one-stroke/one-stroke.gif` and `apps/one-stroke/screenshot.png`.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

MIT. First-party GifOS.
