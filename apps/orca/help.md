# Orca

A livecoding sequencer. The canvas is a grid of letters. Each letter is an operator. The grid is saved with the app.

## The one thing

Open it and a tiny program is already running:

- **D** with a **4** to its right bangs every 4 frames.
- `*` is a bang. It lasts one frame and wakes its neighbours.
- **:04C** is a MIDI note: channel 0, octave 4, note C.

You hear the C in this browser. MIDI hardware is optional. If the machine is silent, tap **Hear** once — the browser needs a tap before it will play.

Press **Space** to play or pause. `>` and `<` change speed.

## Type a program

Click or tap a cell and type a letter. Lowercase is a silent operator (it only runs when a neighbour bangs it). Uppercase is always awake. `.` is empty.

**Ctrl/Cmd+G** shows or hides the operator guide on the canvas.

## Move around

- **Arrows** move the cursor. **Shift+arrows** grow a selection.
- **Alt+arrows** drag the selection.
- **Ctrl/Cmd+I** insert mode (Space then types a space instead of play/pause).
- **Ctrl/Cmd+Z** undo. **Backspace** erases.
- **Ctrl/Cmd+K** commander (type `bpm:140`, `frame:0`, `find:D`…).
- **Ctrl/Cmd+O** open a `.orca` file. **Ctrl/Cmd+S** export one.

On a phone, the pad under the grid types the same operators. **Keyboard** opens the phone keyboard. **Hear** unlocks sound. Two-finger pinch is not a zoom — use **+** / **−** on the pad, or **Ctrl/Cmd+=** / **-**.

## MIDI, OSC, UDP

If this browser can see a MIDI device, Orca talks to it (`:` a note, `;` a CC). Without a device, notes still play here as square waves. OSC and UDP from the desktop app are silent here.

## What is saved

The whole grid, the zoom, and the tempo stay on this device, inside the file. Close it, come back, they are still there.

Unofficial port of [Orca](https://github.com/hundredrabbits/Orca) by Hundredrabbits.
