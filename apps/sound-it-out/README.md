# Sound It Out — GifOS app

A full port of the [sound-it-out](https://github.com/nwcnwc/sound-it-out)
desktop app (0.4.x, the **sentence-library** design) to a sandboxed GifOS app.
Made for a boy with Down syndrome learning to read: calm looping videos where
every word is built up from its sounds, sentences grow word by word, and the
line ends in the parent's own read with the highlight following her voice.

The desktop app needed PyInstaller, onnxruntime, espeak-ng, rubberband and
ffmpeg — exactly what was failing on the family's old Intel Mac. This port
needs a browser tab. Everything native was either deleted or moved to build
time.

## The shape (upstream 0.4.x, mirrored here)

Two screens. **Sentences**: one list holds everything that gets read — a
single letter (plays its sound from the phoneme bank, nothing to record), a
single word (sounded out when `decodable()` says the letter rules can honestly
say it, shown whole when they cannot), a sentence (each word met on its own,
the line grown word by word, then the whole read as a karaoke read-along).
Starter packs — Paw Patrol lines, VeggieTales, God's world, Around home, plus
the skill packs (letter sounds, the building-up ladder, nonsense practice,
letter teams, first sentences) — are one tap that adds ordinary entries.
Each entry has a tick (include in the video), its recording state, and a
Record walk-through. The video's length is **told, not asked for** ("About 6
minutes long"). **Setup**: the 42-sound session, the shared word bank, and
the backup story.

Rules ported exactly: the absolute highlight rule (colour = "being said right
now"; the grey dim is gone; long pads show the text neutral —
`NEUTRAL_PAD 0.35s`), magic-e onset+rime buildup (`c + ase`), the voiced-s
lexicon (is/his/has/as), `IRREGULAR_WORDS` shown whole, the 50ms approach
floor, function-word-discounted read-along timing (`word_spans`), and clip
loudness levelling (`loud()`, RMS 0.09) with a master gain + limiter standing
in for the encoder's `loudnorm` −14 LUFS.

## How the port replaces the native stack

| Desktop | GifOS port |
| --- | --- |
| Kokoro-82M ONNX + espeak-ng g2p at runtime (340 MB) | deleted outright — the port ships no synthetic voice at all (see the policy below) |
| the shipped starter voice (42 human phoneme wavs) | same clips, transcoded into the GIF — and the ONLY bundled audio: a buildup must never be two voices, so nothing synthetic ships. When the author records the pack words/sentences upstream (assets/starter-voice/words/, sentences/), regeneration packs them with no code change |
| AudioWorklet mic capture + Python scoring | brokered `gifos.recordAudio` clips, scored in-app by the ported detector (schwa, clipping, SNR, length classes) |
| headless-Chromium PNG frames + ffmpeg MP4 encode | the storyboard renders **live** on a canvas; "save as a file" is a realtime `MediaRecorder` WebM capture of the same renderer |
| voice cloning (Chatterbox, 3 GB) | dropped, along with every synthetic tier — see the voice policy below |
| wordlists/sentences.txt on disk | `gifos.db`: `library`, `prefs`, `recordings` (+ `recmeta`, the word bank's catalog) — all **private**; recordings never enter the shipped GIF; `gifos.save()` is the backup |

**The two-voice policy** (stricter than upstream's tiering, at the author's
direction): **her recording** (verbatim, levelled) → **the starter voice**
(the author's recordings) → honestly MISSING. No Kokoro, no text-to-speech: a
buildup where the sounds and the word are different voices is jarring enough
to not be worth doing. Entries with unsayable clips are left out of the video
(named in an honest note), and a word whose sounds are not all available —
a magic-e rime outside the 42, say — is shown whole rather than half-built.

## Source layout

- `curriculum.js` — word mechanics (graphemes, magic-e, lexicon, irregulars,
  `decodable`, `wordParts`) + the library segment builders (`approach`,
  `oneWord`, `library`). Guarded segment-by-segment against `gen/levels.py`
  by `test/unit/sound-it-out.js` via `tools/curriculum-fixture.json`.
- `library.js` — port of `gen/sentences.py`: entry kinds, the db-backed
  library, walk-through items, starter packs, the length estimate,
  `wordSpans` read-along timing.
- `dsp.js` — measurement + scoring ports, WSOLA stretch.
- `voice.js` / `storyboard.js` — the two voice tiers + `loud()` + the
  buildup coherence gate; neutral-pad frame expansion, read-along slicing.
- `frames.js` / `player.js` / `exporter.js` — themes (two colours only),
  canvas auto-fit renderer, playback engine, mastering chain, WebM export.
- `studio.js` / `ui.js` / `app.js` — scoring flow over `gifos.recordAudio`,
  the two screens.
- `fonts-data.js` — GENERATED: Andika Bold woff2 (SIL OFL), base64.
- `clips-data.js` — GENERATED: the starter voice, and nothing else. See below.

## Regenerating the bundled voices

Needs a checkout of the sound-it-out desktop repo with its venv:

```bash
cd ~/projects/sound-it-out && .venv/bin/python \
    ~/projects/gifos/apps/sound-it-out/tools/gen-clips.py
```

That rewrites `clips-data.js` (whatever exists under the upstream repo's
`assets/starter-voice/{phonemes,words,sentences}`, transcoded to mp3 and
levelled — nothing synthesised) and `tools/curriculum-fixture.json` (the
parity fixture). Both are generated-but-committed. **No family recording is
ever bundled** — the starter voice is the author's own, shipped publicly in
the upstream repo. `tools/starter-recording-list.md` was the recording
checklist; upstream 0.5.0 covered all of it.

Then rebuild and refresh the catalog:

```bash
node apps/sound-it-out/build.mjs
node scripts/build-app-catalog.mjs
```

## In the store

Published 2026-08-08, against upstream 0.5.0 (the release that shipped the
complete starter voice: 102 sounds including every magic-e rime, 124 pack
words, 39 lines — all the author's own). To re-sync after an upstream change:

```bash
cd ~/projects/sound-it-out && .venv/bin/python \
    ~/projects/gifos/apps/sound-it-out/tools/gen-clips.py
node test/unit/sound-it-out.js                           # parity must be green
node apps/sound-it-out/build.mjs
node scripts/build-app-catalog.mjs
```

(sign at site/sign.html if it should read "signed by gifos.app".)

## Tests

`test/unit/sound-it-out.js` (release gate, unit tier): segment-exact parity
with the Python library builder, the word-mechanics vectors (magic-e,
lexicon, irregulars), bundle completeness across every pack (a missing
phoneme is a silently mute letter), read-along span tiling, the estimate,
and the DSP ports on synthetic audio. Browser e2e still needs a gate host
with working Chromium.

## Capabilities used

`db` (all collections private) and `microphone` (`gifos.recordAudio` per
take). No AI, no network: the app runs entirely offline, and no voice in it
is ever synthetic.
