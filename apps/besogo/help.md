# BesoGo

A Go board. Black and white take turns putting a stone on an empty point. Surround a group so it has no liberties, and it comes off the board. **Black goes first.** Suicide is refused. A ko recapture is refused.

There is no computer opponent. There is no territory count at the end. Two passes in a row just end the game.

## Board size

On **New game**, pick **9×9**, **13×13**, or **19×19** (the default). The board fills a square that fits the window — about as wide as the phone. There are **no coordinates** on the grid, no zoom, and no pan. 19×19 points are small on a phone; use 9×9 if you want bigger stones.

## Two here

**Start game** is pass-the-device. Tap an empty point to place. **Pass** skips your turn. **Undo** takes back the last stone (as far as you like). **New game** returns to the size picker.

Captures are listed under the board as **Taken**.

## A friend

**Play a friend**, then press **Invite** in the bar above the app. There is no game server. The first two people to open the link sit black and white (black is seated first). Anyone else watches.

Tap an empty point on your turn. **Pass**, **Undo**, and **Resign** appear once both seats are filled.

- Undo of the stone **you** just put down works at once, if they have not answered yet.
- Undo further than that: both of you press **Undo**.
- After a result (two passes, a resign, or someone leaving), the next game starts on its own in a few seconds.

The board size is whatever the host had selected when the room opened.

## Rules this board actually enforces

Legal place, capture, suicide, and ko. It does **not** score Japanese or Chinese territory, does not add komi, and does not do handicap stones. “Both passed” means the game is over, not that the app counted the board.

## What is saved

A two-here game in progress is saved in the file (size and every stone). A finished local game is not restored. A friend game lives in the room, not in the file.
