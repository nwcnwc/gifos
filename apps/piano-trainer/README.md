# Piano Trainer

Scales, chords, fifths, a quiz. Home row or tap. Progress stays in the file.

An unofficial port of
**[Piano Trainer](https://github.com/ZaneH/piano-trainer)**
by Zane Helton (MIT). Upstream is a React + Tauri desktop app that
loads a soundfont from the network. **That stack stays behind.** Notes
play from a local piano bank in this tab (Web Audio, no remote samples).

```
index.html
style.css
theory.js           scales, triads, sevenths, fifths, quiz, chord names
sound.js            local piano bank (AudioBuffers)
app.js              keyboard, modes, optional MIDI, phone pointers
icon.mjs
build.mjs
vendor/COPYING-piano-trainer.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Last key/mode/score/rounds (`save`, private) and a shared prompt (`room`). |
| `multiplayer` | Practice together. Invite is OS chrome. |

No `network`. `minBuild` is **947**. `launch.mode` / `launch.key` open onto a drill.

## Building

```
node apps/piano-trainer/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
