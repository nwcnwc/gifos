# Breakout gauntlet

**Win:** A stranger who knows Atari Breakout / Jake Gordon’s demo uses this one because the high score lives in the file and one invite link puts a second paddle on the same wall — no install, no account, no server.

## Bars

- **Bar ONE:** Atari Breakout / the upstream demo at jakesgordon.com/games/breakout/ — orange paddle, colourful brick walls, ready/set/go, three lives. Floor, not ceiling: the original is a 2011 tutorial with localStorage, soundmanager MP3s, and one paddle.
- **Bar TWO:** High score in the GIF (`gifos.db`); invite is two paddles on a shared brick field.

## Rounds

1. **Vendor + license.** MIT (Jake Gordon). Freesound samples are CC-BY-ND — not shipped; hits are Web Audio. Paving.jpg and up/down PNGs replaced with CSS.
2. **Solo game.** Unmodified `game.js` / `breakout.js` / `levels.js`. Drag paddle, keys, level picker, high score in the file.
3. **Extra paddle.** Host simulates ball + bricks on `world`; guest writes only their paddle `x`. Cyan paddle, shared lives/score. A third opener watches.
4. **Face.** Icon: ball pops a brick. Cover: mid-wall, two paddles, a brick just broken. Listing leads with the file-is-the-save and the extra paddle.

## Remaining gap

Host-authoritative physics: a delayed guest paddle can look like it met a ball the host already called a miss. Friends on a link, not a tournament.
