# LRC Maker

Load a local song, tap lyric timings, export an .lrc file. The audio never leaves this device. The song and the lyrics live in this file, so you can close it and come back still mid-song (a song larger than about 8 MB is kept in memory only — pick it again next time).

## The loop

1. Press **Song** and pick an audio file from this computer.
2. Press **Edit lyrics** and paste the unsung words (one line each). They become the list. You can also press **Open LRC** to load an existing file — times already in square brackets are kept.
3. Press **Play**. When a line is sung, press **Stamp** (or **Space**). The time lands on that line and the next line is selected.
4. Missed one? Tap the line in the list to select it, then Stamp again, or **Backspace** to clear the stamp.
5. Drag the seek bar to jump. **Export LRC** writes the file.

During playback the line being sung lights up.

## Keys

- **Space** — stamp the current line
- **↑ / W / J** — previous line
- **↓ / S / K** — next line
- **← / A** — skip back 5 seconds
- **→ / D** — skip forward 5 seconds
- **Ctrl+Enter** (⌘↩ on a Mac) — play / pause
- **Backspace / Delete** — clear the stamp on the current line

On a phone, **Stamp** sits under your thumb. That is the whole loop.

## A live friend

Working alone is the original tool. The lyrics, stamps and the song stay on this device.

A friend looking at the same sheet: press **Look together**, then **Invite** in the bar above the app. They get the words and times, not the audio file. Each person opens their own song.

**← Solo** puts you back on the original tool. Back closes the lyrics editor first, then leaves a shared sheet.

## What is saved

Lyrics, timestamps and the song (when it fits) live in this file. A live share is the room for that invite, not a second save.

Unofficial port of [lrc-maker](https://github.com/magic-akari/lrc-maker) by magic-akari. Timing format is theirs (`@lrc-maker/lrc-parser`).
