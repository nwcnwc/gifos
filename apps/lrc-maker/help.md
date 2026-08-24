# LRC Maker

Load a local song, tap lyric timings, export an .lrc file. The audio never leaves this device.

## The loop

1. Press **Song** and pick an audio file from this computer.
2. Paste the unsung lyrics in the box at the bottom (one line each). They become the list.
3. Press **Play**. When a line is sung, press **Stamp** (or **Space**). The time lands on that line and the next line is selected.
4. Missed one? Tap the line in the list to select it, then Stamp again, or **Backspace** to clear the stamp.
5. **Export LRC** downloads the file.

You can also drop an existing .lrc into the lyrics box — times already in square brackets are kept.

## Keys

- **Space** — stamp the current line
- **↑ / W / J** — previous line
- **↓ / S / K** — next line
- **← / A** — skip back 5 seconds
- **→ / D** — skip forward 5 seconds
- **Ctrl+Enter** (⌘↩ on a Mac) — play / pause
- **Backspace / Delete** — clear the stamp on the current line

On a phone, the Stamp and Play buttons are the whole loop.

## A live friend

Working alone is the original tool. The lyrics and stamps stay on this device. The song stays in memory until you pick another file.

Want a friend looking at the same sheet? Press **Play together**, then **Invite** in the bar above the app. They get the words and times, not the audio file. Each person opens their own song.

**← Solo** puts you back on the original tool.

## What is saved

Lyrics and timestamps live in this file. The song is not stored — pick it again when you come back. A live share is the room for that invite, not a second save.

## Credit

Unofficial port of [lrc-maker](https://github.com/magic-akari/lrc-maker) by magic-akari. Timing format is theirs (`@lrc-maker/lrc-parser`).
