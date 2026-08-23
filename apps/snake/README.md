# Snake

The classic game of Snake, running as an ordinary sandboxed GifOS app. Solo it
is the usual eat-and-grow board; send the invite and the same grid holds every
snake at once.

The game is an unofficial port of
**[JavaScript Snake](https://github.com/patorjk/JavaScript-Snake)** by patorjk
— MIT, the DOM snake at patorjk.com/games/snake. This directory is the GifOS
surface: canvas paint, swipe + a d-pad, persistence through `gifos.db`, and
multiplayer, none of which the original has as a room of snakes.

```
index.html      shell: board, welcome dialog, on-screen pad
style.css       patorjk's main theme — coral page, navy field
game.js         grid, growth, no-180, apple placement
app.js          paint, keys/swipe/pad, solo loop, the room
icon.mjs        procedural green-snake icon + 1200×720 cover
build.mjs       packs the GIF to site/apps/snake/snake.gif
COPYING.txt     patorjk's MIT notice (also packed inside the GIF)
```

## capabilities

| capability | why |
|---|---|
| `db` | High score in a private collection; snakes and the arena in shared ones. |
| `multiplayer` | The room. Invite is OS chrome — this app has no Invite button. |

No `network`. No `wasm`. Needs nothing newer than the App Store itself, so
`minBuild` is **947**.

## The room

Each player writes **only their own row** on `snakes` — heading, head, body,
alive. Nobody writes anybody else's snake. The elected host (lowest present
id) writes `arena` (seed, apple, tick) and resolves apples and the win: last
one still moving wins. Guests never write `arena`.

## Building

```
node apps/snake/build.mjs
```

That packs this source into `site/apps/snake/snake.gif` and writes
`screenshot.png`.

## Licence

MIT, Patrick Gillespie. The notice is packed **inside** the GIF as
`COPYING.txt` as well as living here, because a copy of this app that someone
was handed is a distribution of that work.
