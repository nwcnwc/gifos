# Queens

Hundreds of tap puzzles as a GifOS app. Close it, come back — you are still
on the board. Invite is the room.

An unofficial port of **[Queens](https://github.com/samimsu/queens-game)** by
samimsu (MIT). The Vite / React / Vercel / Giscus / Patreon stack is gone.
Levels are the community boards, extracted to a classic script. The board is
a rewrite of `gameLogic.ts` so the iframe can inline it.

```
vendor/levels.js    GENERATED. 768 community boards. Never edit; rerun vendor.mjs.
vendor.mjs          rebuilds levels.js from the pin
game.js             win / clash / auto-X
app.js              picker, board, save, invite
```

`minBuild` is **947**. No wasm, no network.

```bash
QUEENS_SRC=/path/to/queens-game node apps/queens/vendor.mjs   # only to move the pin
node apps/queens/build.mjs
```
