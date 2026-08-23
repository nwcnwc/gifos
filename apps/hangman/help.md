# Hangman

A programming language is hiding. Guess letters before the drawing is finished.

## Objective

Fill in every letter of the word. You may be wrong **six** times. The counter is wrong guesses over six. Each miss adds a part to the figure on the gallows.

The words are the original fourteen: `python`, `javascript`, `mongodb`, `json`, `java`, `html`, `css`, `c`, `csharp`, `golang`, `kotlin`, `php`, `sql`, `ruby`.

## Controls

- Tap a letter on the **QWERTY** pad at the bottom.
- On a computer, type the letter on the keyboard.
- Used letters lock: green if they were in the word, red if not.
- **New word** starts another round after a win or a loss.

There is nothing to drag. A letter you already tried does nothing.

## Scoring

Wins and losses sit in the corner once you have any. Six wrong letters on one word is a loss, even if some letters were right.

## A live friend

Press **Invite** in the **bar above the app** — this game does not draw its own share button. Both of you get the **same** word.

- **Race** — each of you has your own rope. You never see their letters, only how many wrong guesses they have used. First to finish the word wins.
- **Share** — one rope. Every letter anyone tries is on it. You sink or swim together.

Switch Race / Share between words (the person who opened the room sets it). You cannot switch in the middle of a word. **Play again** when the word is over; the next one starts when both of you are ready.

## What is saved

A solo game in progress, plus your win/loss record, stay in the file. Close it and come back: the same word and the letters you already tried are still there. A live match is the room, not the file.

Unofficial port of [Vanilla Javascript Hangman Game](https://github.com/simonjsuh/Vanilla-Javascript-Hangman-Game) by simonjsuh.
