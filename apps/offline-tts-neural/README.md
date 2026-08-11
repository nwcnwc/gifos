# Offline Neural Text to Speech

A Provider app (docs/providers.md) that serves the computer's **Text → speech**
role with a neural voice, entirely on-device. The design decision — which model,
what rides where, and what we refuse to claim — is docs/tts-neural.md.

It is the **second** tts provider, not a replacement. `apps/offline-tts` (eSpeak,
1.6 MB, instant, robotic) stays exactly as it is; the user picks between them in
Settings → AI models.

## The pin

| | |
|---|---|
| Model | `KittenML/kitten-tts-nano-0.8-int8` → `kitten_tts_nano_v0_8.onnx` |
| Bytes | 24,369,971 |
| sha256 | `f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc` |
| Licence | Apache-2.0 |
| Output | 24 kHz mono |

Downloaded and hashed here on 2026-08-11 — the sha256 above is of the exact
hosted bytes, not a value copied from a model card. The OS verifies it on every
install and refuses a mismatch, so the host can break *new* installs but can
never serve *different* bytes.

`voices.npz` (3,278,902 bytes, sha256
`8aa7cee235abb0739cb51e6559685f65a4dacd95568833d05699b1633f519b3f`) is NOT
pinned: at 3.3 MB it is under `build-app-catalog.mjs`'s 8 MB asset floor, so by
doctrine it rides inside the GIF. It is committed as `vendor/voices.f32`
(unpacked from the npz — see below).

## What rides where

| Piece | Size | Where |
|---|---|---|
| `kitten_tts_nano_v0_8.onnx` | 24 MB | **asset pin** |
| onnxruntime-web (bundle build + its wasm) | 11.7 MB raw | in-GIF |
| espeak-ng phonemizer (`phonemizer.js`) | 1.3 MB | in-GIF |
| 8 style tables (`voices.f32`) | 3.3 MB | in-GIF |
| self-test model, vocabulary | ~4 KB | in-GIF |

Built GIF: **12.4 MB**. The three offline LLMs are 10.2 MB each, so this is the
same shape the repo already ships; the extra is the style tables, which do not
compress (see below).

## Licences

- **KittenTTS Nano** — Apache-2.0.
- **ONNX Runtime Web** — MIT (`vendor/LICENSE-onnxruntime.txt`).
- **espeak-ng**, embedded inside `phonemizer.js` — **GPLv3**
  (`COPYING-espeak-ng.txt`). The npm package's own metadata says Apache-2.0 and
  that is true *of the wrapper* (`vendor/LICENSE-phonemizer.txt`); a
  repackaging cannot relicense the engine it embeds. Both notices ship in the
  GIF. Same posture as `apps/offline-tts`, which already carries espeak GPLv3.

Note this qualifies docs/tts-neural.md's "Apache-2.0 is cleaner than what we
ship today": the *model* is permissive, the *phonemizer* is still GPLv3.

## Four things that were measured, not assumed

**1. Our existing eSpeak cannot be the phonemizer.** docs/tts-neural.md hoped we
could drive `apps/offline-tts`'s vendored eSpeak to emit IPA and save 2.6 MB. It
*can* — `-q --ipa --phonout=file` writes clean IPA into the emscripten FS. But
that build is eSpeak **1.45.04** (2011), and it drops the final vowel of every
`-ly` word:

```
            1.45.04          espeak-ng
quickly     kwˈɪkl           kwˈɪkli
entirely    ɛntˈaɪəɹl        ɛntˈaɪɚli
usually     jˈuːʒuːəLl       jˈuːʒuːəli     <- and a literal capital L
```

11 of 12 `-ly` words differed; `-x` (ASCII) shows the same loss, so it is the
phoneme analysis, not the IPA rendering. `happy`/`baby`/`city` are fine, so it
is specifically the suffix rule. Feeding that to a neural model trained on
espeak-ng phonemes would systematically mispronounce one of English's commonest
endings, and the capital `L` is *in* the vocabulary, so it tokenizes as a letter
rather than being dropped. Hence the npm `phonemizer` (real espeak-ng).

**2. espeak-ng drops punctuation; the model needs it.** The reference uses
`phonemizer(preserve_punctuation=True)`, which is wrapper behaviour and not an
espeak flag — it splits the text around the marks, phonemizes the spans and puts
the marks back. `app.js` does the same. The marks are in the model's vocabulary
and its prosody was trained with them.

**3. The style vectors must stay float32.** `voices.f32` is 3.3 MB that deflates
by 8%, and halving it to float16 is the obvious win. It is not: rounding the
style vector to fp16 changes the input by 0.097% and the output waveform by
**5.1 dB SNR** (peak difference 0.80 on a ±1 signal). The model is extremely
sensitive to this input. Do not "optimize" it.

**4. Speed is not quotable, and it sets the whole feel of the app.** Measured
warm, one thread, on a 4-core desktop: **0.80× real time** — the doc's 2–3×
came from someone else's desktop demo.

That ratio is the reason for everything in the next section, because it is
almost exactly linear in how much text is asked for at once:

| chars in one call | audio out | wait before ANY sound |
|---|---|---|
| 150 | 14.7 s | 19.4 s |
| 400 | 37.4 s | 47.3 s |
| 600 | 55.1 s | 67.9 s |
| 1200 | 108.8 s | 133.4 s |

## Starting to talk before it has finished thinking

A neural voice cannot begin speaking until the passage it is working on is
finished, so **the wait before the first sound is just however much audio was
asked for in one go**. Ask for 600 characters and that is 68 seconds of silence,
which is indistinguishable from a hang. This is the single thing that most
affects how the app feels, and it is not fixed by making the model faster.

Two places deal with it, and they are different problems:

- **This app's own page** synthesises passage by passage and starts playing the
  first while the second is still being made. It is not going through the
  broker, so nothing stops it. Time-to-first-sound stops depending on the length
  of the text at all: measured 5.9 s for 150 characters, 6.0 s for 600, and
  5.9 s for 1800.
- **A consumer app cannot be helped from in here.** A provider handler must
  return one finished WAV — the OS's tts contract has no audio channel to stream
  down (`ctx.delta` is text; docs/providers.md). So the bite size is the
  CONSUMER's decision, and Reader now measures the voice that answers and sizes
  its passages accordingly (`sample-apps.js`, guarded by
  `test/unit/reader-chunking.js`). Reading a 1800-character article through
  Reader: first sound at **16.3 s** instead of ~79 s, 11 s of that being the
  one-time engine load. The formant provider is untouched by the change — 1.7 s
  to first sound, back to full 600-character passages by the third.

What this does NOT fix: at 0.80× real time the voice generates slower than it
plays, so a long article still pauses between passages. Sizing them small turns
one 14-second hole into short even ones; nothing short of a faster model removes
them. Synthesis also blocks the app's main thread, so the page is unresponsive
while a passage is being made (audio playback is unaffected — it runs off-thread,
which is what makes the overlap real).

## Two sandbox traps, both paid

- **ORT's small build cannot work here.** `ort.wasm.min.js` (49 KB) loads its
  emscripten glue with a dynamic `import()` of `ort-wasm-simd-threaded.mjs` —
  in an opaque origin with no network that is a CSP refusal *and* a failed
  fetch. We ship `ort.bundle.min.mjs` (468 KB), which inlines the glue, rewrite
  its ESM exports to `window.ort`, and replace `import.meta.url` (module-only
  syntax, a SyntaxError in a classic inline script) with a URL that parses and
  is never fetched. The wasm binary itself still arrives as bytes via
  `env.wasm.wasmBinary`.
- **Two minified bundles share one script scope.** ORT and phonemizer both
  declare a top-level `const ne`; injected as sibling inline scripts the second
  dies with `Identifier 'ne' has already been declared`, which surfaces as the
  useless "The pronunciation engine failed to load." Each is wrapped in an IIFE
  by `build.mjs`.

Threads stay off (`numThreads = 1`, `proxy = false`): SharedArrayBuffer needs
cross-origin isolation this opaque origin will never have, and the int8 graph is
a CPU/WASM one by construction anyway — `MatMulInteger` / `DynamicQuantizeLSTM`
have no WebGPU kernels.

## When the weights are missing

The provider **fails with a fixable message** rather than falling back to the
self-test tone. A consumer app handed a beep instead of speech cannot tell the
difference, and the user would hear a defect instead of an instruction. The
self-test runs only when asked for by name — the reserved voice `self-test`,
which is how `e2e-providers` proves the whole pipeline on a machine that has
never downloaded the weights.

**It is not a button, deliberately.** The page had one and it was removed
(2026-08-11): the app already lets you hear the engine by picking any of the
eight voices and pressing Speak, so a second button only added a thing to
explain. It was also *wrong* — `ensureEngine` reused the cached session
whenever `loadedKind === 'kitten' || wantSelftest`, so once the real weights
were warm the Self-test button handed back the real engine and answered in the
real voice. A check that silently stops checking is worse than no check; the
cache is now keyed on the kind that was actually requested.

## Building

```sh
node apps/offline-tts-neural/build.mjs        # -> site/apps/offline-tts-neural/*.gif
node scripts/build-app-catalog.mjs            # refresh the store catalog
```

Regenerating the committed vendor data (needs network / extra packages):

```sh
python3 tools/gen-vendor-data.py                     # vocab.json, voices.f32
python3 -m venv venv && ./venv/bin/pip install onnx numpy
./venv/bin/python tools/make-selftest-model.py       # vendor/selftest.onnx
```

`vocab.json` is extracted from KittenTTS's own `onnx_model.py` rather than
retyped: the symbol list contains duplicates (`'` and `"`), and Python's build
loop means the LAST occurrence wins, so 178 positions collapse to 175 keys.
Retyping it by eye shifts token ids silently.
