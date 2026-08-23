# Thinktank

Two sides, red and blue. Destroy the house in the other tinted corner.

Red home is top-left, blue home is bottom-right. Red goes first. On your turn you do **one** thing: place a piece, move one already out, or turn a tank. You may not leave your own pieces in harm's way — a move that would get one of yours shot, stolen, or blown up is refused.

## Controls

There is no keyboard play. Tap or click.

- **Place** — tap a piece in the tray, then a **gold** square around your home. Those gold squares are your spawn ring. You cannot place on the house itself.
- **Move** — tap a piece already on the board, then a gold square it can reach.
- **Turn a tank** — tap the tank, then a facing (Up / Right / Down / Left). It shoots the way it points. **Cyan** marks a tank you can turn this way. The beam lights up when a tank is selected.
- **Undo** (computer or two-here only) takes back your last action, and the computer's reply if you are playing the computer.
- **New game** returns to the setup screen.

## Pieces

Each side starts with a **base** in its home, plus a hand: 3 shields, 5 tanks, 2 orthogonal infiltrators (`+`), 2 diagonal infiltrators (`×`), 1 mine.

- **Shield** — stops the other side's shots. Friendly tanks fire through it. Moves 1 square any way. Can be stolen, not shot.
- **Tank** — fires in a straight line to the edge. Moves 1 square across or down (not diagonal).
- **Infil +** — steals a tank or shield standing next to it. Moves 1 across or down. Cannot be stolen.
- **Infil ×** — same steal, on the diagonal. Moves 1 diagonal.
- **Mine** — blows up anything next to it except a shield, including itself. Moves up to 2 squares and can jump. Do not set it where it would hit your own pieces.
- **Base** — the house. It may step 1 square inside its own home. Destroy the other one and you win.

Shot pieces return to their owner's hand. A steal keeps the piece on the board and changes who owns it. Pieces cannot enter a home except a base staying in its own.

After your action, in order: steal, then shots and explosions. A side whose base is gone has lost.

## Solo vs a live friend

**Computer** — you pick red or blue. It thinks on this device and only plays legal moves.

**Two here** — pass the phone. Red goes first.

**Play a friend** — opens the shared board. Press **Invite** in the bar above the app and send the link. First arriver sits red, second sits blue. Extra people watch. **Resign** concedes. After a win or a resign, a new game starts in a few seconds.

Invite is OS chrome — this app does not draw a share button.

## What is saved

A local game (computer or two-here) auto-saves in this file. Close it and you come back to the same board. A live friend game lives in the room while people are connected; it is not the local save.

Unofficial port of [Thinktank](https://github.com/averycrespi/thinktank) by averycrespi.
