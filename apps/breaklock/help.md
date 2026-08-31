# BreakLock

A hybrid of Mastermind and the Android pattern lock. Link the dots. Find the secret.

## Objective

A hidden pattern runs through four, five or six of the nine dots. Draw a guess of the same length. After every try the game tells you how close you were, with pegs under the miniature of what you drew:

- **Filled peg** — that many dots are in the pattern *and* in the right order.
- **Empty peg** — that many dots occur in the pattern, but in another order.
- A dim ring is a miss: that dot is not in the secret at all.

The pegs are not lined up with particular dots. They are a count, the way Mastermind's black and white pegs are.

Draw the exact secret and the lock goes teal. That is a win.

## Difficulty

Easy is **4** dots, medium is **5**, hard is **6**. Swiping through a dot in a straight line (corner to corner, or across a side) picks up the one in the middle, the way a phone lock does. You cannot reuse a dot.

## Modes

- **Practice** — unlimited tries. The counter goes up.
- **Challenge** — ten tries. Miss them all and the lock beats you.
- **Countdown** — one minute, as many tries as you can fit.

ABORT in the corner throws the current lock away and goes back to the menu. After a win or a loss you can start a new game, ask for the **solution** (it is stacked in the history), or go home.

The snark at the end is the original's. It is not personal.

## Controls

This is a pattern lock: **draw** on the 3×3 with a finger or a mouse. Hold, visit the dots in order, lift. A short buzz on a phone marks each new dot.

There is no keyboard. There is nothing to tap on the grid itself except the drawing.

## A live friend

Press **Invite** in the bar above the app. You draw a secret they cannot see. They have to crack it. You watch their tries land in the history — the same pegs, the same miniatures. First to match the secret wins. **YOUR TURN_** hands them the next secret to set.

Two of you on one phone: pass it after you have set the lock.

## What is saved

Your win/loss record, current streak, best streak, and fewest tries on each difficulty. A practice or challenge lock in progress is kept too — close it and you are still on the same secret, with the same history. A countdown is not kept (the minute would be a lie). A live match is the room, not the file.

Unofficial port of [BreakLock](https://github.com/maxwellito/breaklock) by maxwellito.
