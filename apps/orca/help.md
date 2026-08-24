# Orca

A livecoding sequencer. The canvas is a grid of letters. Each letter is an operator. There is no account; the grid stays on this device.

## Type a program

Click a cell and type a letter. Lowercase is a silent operator (it only runs when a neighbour bangs it). Uppercase is always awake. `.` is empty.

Press **Space** to play or pause. The frame counter at the bottom walks while it plays. `>` and `<` change speed.

A tiny starter: type `D4` then `:*` to the right of it — `D` is a clock that bangs every 4 frames, `*` is a bang, `:` is a MIDI note. Without a MIDI device you still see the bangs fire.

Press **Ctrl/Cmd+G** to show or hide the operator guide on the canvas.

## Move around

- **Arrows** move the cursor. **Shift+arrows** grow a selection.
- **Alt+arrows** drag the selection.
- **Ctrl/Cmd+I** insert mode (Space then types a space instead of play/pause).
- **Ctrl/Cmd+Z** undo. **Backspace** erases.
- **Ctrl/Cmd+K** commander (type `bpm:140`, `frame:0`, `find:D`…).
- **Ctrl/Cmd+O** open a `.orca` file. **Ctrl/Cmd+S** export one.

On a phone, tap a cell then type with the keyboard. Two-finger pinch is not a zoom — use **Ctrl/Cmd+=** / **-**.

## MIDI, OSC, UDP

If this browser can see a MIDI device, Orca talks to it (`:` comments a note, `;` a CC). OSC and UDP from the desktop app are silent here.

## A live friend

Press **Invite** in the bar above the app. A friend who opens the link sits with you. Each of you has a grid on your own device.

## What is saved

The whole grid, the zoom, and the tempo stay on this device, inside the file. Close it, come back, they are still there.

Unofficial port of [Orca](https://github.com/hundredrabbits/Orca) by Hundredrabbits.
