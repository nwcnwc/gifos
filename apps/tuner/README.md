# Tuner

Record a note. See the pitch. Nothing is uploaded. No live microphone.

An unofficial port of **[PitchDetect](https://github.com/cwilso/PitchDetect)**
by Chris Wilson (MIT). Upstream holds getUserMedia; GifOS records a clip
with `gifos.recordAudio`, then runs the same autocorrelation.

```
index.html      record button, note, Hz, cents, wave
style.css       dark tuner chrome
app.js          recordAudio clip → detect, gifos.db last reading
icon.mjs        needle icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/tuner/tuner.gif
vendor/         ACF2+ pitch.js + MIT notice
```

## capabilities

| capability | why |
|---|---|
| `db` | Last reading, private. |
| `microphone` | `gifos.recordAudio` for a short take. Never a live stream. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/tuner/build.mjs   # -> site/apps/tuner/tuner.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

PitchDetect is MIT, Chris Wilson, 2014. The notice is packed **inside the GIF**
as `COPYING-pitchdetect.txt`.
