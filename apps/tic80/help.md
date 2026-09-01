# TIC-80

A tiny computer for making and playing pixel games. 240×136, sixteen colours, four buttons, Lua or JavaScript. Two carts come with it. You can drop your own.

## First minute

It boots into **HELLO WORLD**. Arrows move the little computer. **Z** is button A, **X** is B.

During play, **Escape** is the game menu (RESUME / RESET / CLOSE GAME). **CLOSE GAME** is the console — type commands here, the way a real TIC-80 does:

- `run` — play the cart that is loaded (or just press **Enter** / **Ctrl+R**)
- `load fire` — the fire demo
- `load hello` — back to HELLO WORLD
- `new lua` — a blank Lua cart
- `new js` — a blank JavaScript cart
- `save mygame` — writes `mygame.tic` on this computer's disk
- `dir` — list carts
- `edit` or **Alt+1** … **Alt+5** — code, sprites, map, sfx, music

**CLOSE GAME** leaves a running cart and returns to the console. **Ctrl+S** saves.

## Carts that come with it

- **hello** — the default cart. Walk the sprite. Read the Lua. Change a colour, press Enter, it runs.
- **fire** — a handful of particles. No sprites; the code is the picture.

Open **Carts** (top left) to pick one, or to drop a `.tic`, `.lua`, `.js`, `.gif` or `.png` cart of your own. GIF carts are a TIC-80 thing: the picture is the cartridge.

## On a phone

A pad sits under your thumbs: the plus on the left, **B** and **A** on the right, **Esc** and **Run** in the middle. The computer's own on-screen editors still work with a finger on the canvas.

## A friend

Press **Invite** in the bar above. They land on this same desk — the carts you have saved are there, and a cart you drop shows up for them. They play on their own phone or computer. No account.

## What is saved

Every cart you `save`, and every file you drop, stays in this file. Close it, open it: still there. Sharing the GIF shares the computer and those carts.
