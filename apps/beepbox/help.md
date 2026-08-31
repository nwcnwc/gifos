# BeepBox

A chiptune song tracker. Click the grid, hear a note, build a loop. The song is saved inside this file — close it, come back, the notes are where you left them. Hand someone the file and they get the song.

## Make a tune

1. Turn the ringer up. Tap **Play** (or press **Space**).
2. Click or tap a grey row in the top grid to drop a note. Drag sideways to change how long it lasts. Click above or below a note to stack a chord.
3. The numbered boxes along the bottom are **patterns** — the bars of the song. Tap a box to edit that bar; tap the arrows on the selected box to swap which pattern plays there.
4. Several rows play at once. The bottom row is drums. The purple loop under the boxes is the part that repeats; drag the ends to cover the whole song.

Menus on the right pick the scale, key, tempo, and the instrument (chip, FM, noise, supersaw…). Tap a label for a short description of that control.

## Keyboard

- **Space** play / pause. **Shift+Space** play from the pointer.
- **Z** undo, **Y** or **Shift+Z** redo.
- **C / V** copy / paste the selected pattern.
- **0–9** assign a pattern number. **Arrows** move the selection.
- **[ ]** move the playhead. **F** jump to the first pattern.

## Phone

The grid is meant to be used with a finger. **+ / −** in the bar (or a two-finger pinch) zoom it; then pan. A long-press on the grid starts a selection, same as Shift-drag on a computer.

## Jam

Press **Invite** in the bar above the app and send the link. Whoever opens it lands on **this** song. Either of you can change notes, patterns, tempo; you both hear the same track.

## Export

File → Export Song writes WAV, MIDI, or JSON. MP3 is not in this copy (it needed a library fetched from the network).

Unofficial port of [BeepBox](https://github.com/johnnesky/beepbox) by John Nesky.
