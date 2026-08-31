# jsnes

A Nintendo Entertainment System in this file. Two homebrew games are already on the cart. You can drop your own dump.

This is not Nintendo. No commercial NES game ships here. If you own a dump, drop the `.nes` file onto the screen.

## Games that come with it

- **Concentration Room** — flip two cards, keep the pairs. One player, versus the computer, or **two players** taking turns. That last one is what Invite is for.
- **Lawn Mower** — cut every blade of grass before the tank is empty. Pick up fuel. A or B makes the mower go faster.

Open **Games** to pick one, or to drop a dump of your own. The last game you played opens next time.

## Controls

**On a computer**

- **Player 1:** arrows to move. **X** or **K** is A. **Z** or **J** is B. **Enter** is Start. **Right Shift** is Select.
- **Player 2** (same keyboard): numpad **8 / 2 / 4 / 6** to move, **7** A, **9** B, **1** Start, **3** Select.
- **P** pauses. **R** resets. **M** mutes. **F5** saves a state, **F7** loads it. **1 / 2 / 3** pick the slot.

**On a phone**

A pad sits under your thumbs: the plus on the left, **B** and **A** on the right (B is the left-hand circle, the way a NES pad is), **Select** and **Start** above them so Start is never under B. Slide on the plus — diagonals work.

A USB or Bluetooth gamepad is player 1.

## A friend on the other pad

Press **Invite** in the bar above the app and send the link. You stay **player 1**. They are **player 2**, on their own phone or computer. They play whatever cart you have loaded. A third person who opens the link can watch.

When they join, pick **Concentration Room → 2 Players** and sit at the table. Lawn Mower is one player; the second pad does nothing there.

## What is saved

**Where you were** stays in this file, per game. Close it, open it: still there. The two homebrew carts packed here have no battery chip; the save is a snapshot, not SRAM. Drop a cart that does have a battery (iNES flags6 bit 1) and that RAM is kept too. Quick states (F5 / F7, three slots) are extra.

Reset starts the game over. Sharing the GIF shares the carts; the saves live in this icon.
