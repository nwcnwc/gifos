# Piano Trainer

Scales, chords, fifths, a quiz. Home row or tap.

An unofficial port of
**[Piano Trainer](https://github.com/ZaneH/piano-trainer)**
by Zane Helton (MIT). Upstream is a React + Tauri desktop app that
loads a soundfont from the network. **That stack stays behind.** Notes
play from oscillators in this tab.

```
index.html
style.css
theory.js           scales, triads, sevenths, fifths, quiz
sound.js            oscillator piano
app.js              keyboard, modes, optional MIDI
icon.mjs
build.mjs
vendor/COPYING-piano-trainer.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Last key/mode/score (`save`, private) and a shared prompt (`room`). |
| `multiplayer` | Practice together. Invite is OS chrome. |

No `network`. `minBuild` is **947**.

## Building

```bash
node apps/piano-trainer/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
