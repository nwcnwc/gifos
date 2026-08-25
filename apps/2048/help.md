# 2048

Slide every tile in one direction. Matching numbers merge. Get a **2048** tile.

## The board

A **4×4** grid — the same size as the original. Two tiles start the game (almost always 2s; sometimes a 4).

Every move slides **every** tile as far as it can go. When two tiles with the same number meet, they become one tile of twice the value. A 2 and a 2 become a 4. Only one merge per tile per move.

After a move that actually changed the board, a new 2 or 4 appears in a random empty cell. When the grid is full and nothing can merge, the game is over.

## Controls

- **Keyboard:** arrow keys. **WASD** and **HJKL** work too. **R** starts a new game.
- **Phone:** swipe up, down, left, or right. A swipe on the heading counts as well as a swipe on the grid.
- There is no click-to-move, and there is **no undo**.

## Score

You score the value of every new merged tile. The current score and your best sit at the top.

Reach 2048 and **Keep going** lets you chase 4096 and beyond. **New Game** deals a fresh board — it does **not** throw away the one you were on. That game moves into **Your games**, where you can pick it back up.

## Your games

Every game you play is kept. Press **Games** to see them, newest first, each with a small picture of the board as you left it, its highest tile, its score and when you last touched it.

- **Tap a game to sit back down at it.** The board comes back exactly as it was, and the game you were playing stays exactly as *it* was — switching is lossless in both directions.
- Finished games are kept too. The board you reached 4096 on is still there to look at years later.
- **Nothing but you removes a game.** There is no limit, no expiry, no "last 20". The trash button on a row deletes that one game, and it asks first.
- A board you never moved is not a game. Deal one, change your mind, and it leaves no trace.
- Deleting a game does **not** lower your best score. Best is all-time.

Opening the panel pauses the game underneath — arrow keys and swipes go to the list, not the board.

A race is not part of this. **Play a friend** rounds are never filed here, and playing one never disturbs your solo games.

## Play a friend

This is a **race**, not a shared board. Press **Play a friend**, then **Invite** in the bar above the app and send the link.

You both start from the **same two tiles**. Same moves give the same board; different moves, the boards diverge. Live scores sit in a strip above the grid.

- First to a 2048 tile wins.
- If a board fills first, that player is out. The others keep going.
- When every remaining board is stuck, **highest score** wins. A tie is a tie.

**Play again** starts the next round from a new pair of tiles. **Solo** puts you back on the game you had before the race.

A friend who joins mid-round starts from that round's **opening** tiles, not from your current board. They are racing, not watching.

## What is saved

The file keeps your **best score** and **every solo game you have played** — the one in progress and all the ones before it. Close it, come back, the board is where you left it and the rest are under **Games**. A race does not overwrite any of them.

All of it lives inside this file, on this device. Send the file, send the games.
