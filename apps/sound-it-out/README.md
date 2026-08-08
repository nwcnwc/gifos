# Sound It Out — GifOS app

A full port of the [sound-it-out](https://github.com/nwcnwc/sound-it-out)
desktop app (Electron + Python sidecar) to a sandboxed GifOS app. Made for a
boy with Down syndrome learning to read: calm looping phonics videos in a big
literacy font, each grapheme highlighted as its sound plays, in the reading
order the Down syndrome research recommends (sight words first, phonics after
~50 confident words).

The desktop app needed PyInstaller, onnxruntime, espeak-ng, rubberband and
ffmpeg — which is exactly what was failing on the family's old Intel Mac. This
port needs a browser tab. Everything native was either deleted or moved to
build time.

## How the port replaces the native stack

| Desktop | GifOS port |
| --- | --- |
| Kokoro-82M ONNX + espeak-ng g2p at runtime (340 MB) | the curriculum is finite, so every clip it can request is synthesised **offline** by the real desktop pipeline and packed into the GIF (`clips-data.js`, ~mp3 per clip) |
| rubberband time-stretch (schwa shaping, slow words) | done offline for bundled clips; a small WSOLA stretch in `dsp.js` covers slowing the parent's own recordings at runtime |
| AudioWorklet mic capture + Python scoring | brokered `gifos.recordAudio` clips, scored in-app by the ported detector (schwa, clipping, SNR, length classes, steadiness) |
| headless-Chromium PNG frames + ffmpeg MP4 encode | the storyboard is rendered **live** on a canvas against the timeline (no frames, no encode); "save as a file" is a realtime `MediaRecorder` WebM capture of the same renderer |
| voice cloning (Chatterbox, 3 GB, separate venv) | dropped. Its niche (words nobody recorded) is covered by `gifos.ai.tts` — words and sentences only, **never** isolated phonemes |
| files on disk | `gifos.db`: `prefs`, `words`, `recordings` (+ `recmeta`), `ttscache` — all **private**; recordings never enter the shipped GIF, and `gifos.save()` is the backup story |

Voice resolution per item (port of `gen/voice.py`): **parent's recording**
(verbatim, with the /a/↔/æ/ alias table) → **bundled built-in clip** →
**text-to-speech** (words/sentences only) → silent-with-visual + an honest
"no voice yet for…" note after the build.

## Source layout

- `curriculum.js` — port of `gen/levels.py` + the 42-sound table from
  `gen/recordings.py`: all 12 levels, ladder, graphemes, successive-blending
  approach. Guarded segment-by-segment against the Python original by
  `test/unit/sound-it-out.js` via `tools/curriculum-fixture.json`.
- `openended.js` — port of `gen/openended.py` (pasted text, wordlist
  templates, the growing story).
- `wordlist.js` — the word-list format, default list included.
- `dsp.js` — measurement + scoring ports (`_schwa_tail`, `score_take`), plus
  the WSOLA stretch.
- `voice.js` / `storyboard.js` — clip resolution tiers; whole-item fitting
  (port of `gen/service.py`'s trim/repeat/level-6-stretch).
- `frames.js` / `player.js` / `exporter.js` — themes, canvas auto-fit renderer
  (never breaks a word), playback engine, WebM export.
- `studio.js` / `ui.js` / `app.js` / `index.html` / `style.css` — the four-tab
  UI, recording studio, review, script.
- `fonts-data.js` — GENERATED: Andika Bold woff2 (SIL OFL), base64.
- `clips-data.js` — GENERATED: the built-in voice. See below.

## Regenerating the built-in voice

Needs a checkout of the sound-it-out desktop repo with its venv (Kokoro model
+ ffmpeg with rubberband and libmp3lame):

```bash
node apps/sound-it-out/tools/enumerate-requests.mjs   # curriculum -> requests.json
cd ~/projects/sound-it-out && .venv/bin/python \
    ~/projects/gifos/apps/sound-it-out/tools/gen-clips.py
```

That rewrites `clips-data.js` (every clip, mp3, base64) and
`tools/curriculum-fixture.json` (the parity fixture). Both are
generated-but-committed, same doctrine as the store catalog. The generator
always runs with `prefer_recordings=False`: **no family recording is ever
bundled** — the shipped voice is Kokoro's, shaped by the desktop pipeline's
schwa-stripping and sustain.

Then rebuild and refresh the catalog:

```bash
node apps/sound-it-out/build.mjs
node scripts/build-app-catalog.mjs
```

## Tests

`test/unit/sound-it-out.js` (runs in the release gate's unit tier):
curriculum parity with the Python fixture, bundle completeness (every clip the
curriculum can request exists in `clips-data.js` — a missing phoneme is a
silently mute letter), word-list parsing, open-ended level invariants, the
fitting rules, and the DSP ports (schwa detector on synthetic audio, scoring,
stretch). Browser-level e2e (launch the GIF, build a plan, play) has not been
written yet — it needs a gate host with working Chromium.

## Capabilities used

`db` (all collections private), `microphone` (`gifos.recordAudio` per take),
`ai: ["tts"]` (optional — the app launches and works without it; it only reads
words nobody recorded). No network capability: the app runs entirely offline.
