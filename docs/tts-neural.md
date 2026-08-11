# A second, higher-quality Text → speech provider

**Status: BUILT and in the catalog** — `apps/offline-tts-neural/`, 2026-08-11.
Researched and built the same day. This document is the design record; the
build notes, the pin, and the four things that turned out differently from the
plan are in that app's README.md. The corrections are folded in below, marked
**BUILT:**, rather than left to read as though they were still open questions.

## The question

The shipping `offline-tts` provider is eSpeak: 1.6 MB in the GIF, instant, zero
download, and unmistakably a robot. It is honest about that ("it is not a neural
voice — it is the honest, robotic, instant kind"). The ask: if we spend
15–25 MB instead of 3, can we get something **just as fast** and much better?

**Yes.** And it should be a SECOND provider, not a replacement — the same shape
the `cheapest` role already has with three offline LLMs. eSpeak stays as the
tiny, instant, no-download option; the user picks in Settings → AI models.

## What to use: KittenTTS Nano

| | |
|---|---|
| Model | `kitten-tts-nano`, int8 (quantization-aware trained, not post-quantized) |
| Parameters | 15M |
| Size | ~24–25 MB (`.onnx`) |
| Output | 24 kHz |
| Voices | 8 named (Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki, Leo) |
| Licence | **Apache-2.0** |
| Runtime | ONNX Runtime Web, **WASM path** |
| Reference speed | ~2–3× real time in-browser for the 15M model (desktop) |

Three things make it the right pick rather than merely a possible one:

- **Apache-2.0 is cleaner than what we ship today.** The current eSpeak payload
  is GPLv3. A permissive voice is a straight improvement in what we are asking
  people to carry around in a file they own.
- **WebGPU is irrelevant, which is a feature.** The int8 model uses
  `MatMulInteger` / `ConvInteger` / `DynamicQuantizeLSTM`, which ORT-Web's
  WebGPU execution provider does not support — so this runs on CPU/WASM *by
  construction*. We never end up depending on a GPU path that varies by device,
  and we never ship a fast path that silently isn't.
- **It is not the LLM situation.** The offline LLMs are slow because generation
  is autoregressive: minutes of token-by-token work on one thread. TTS is a
  bounded forward pass per sentence. And `Reader` already synthesises in
  sentence chunks with one chunk of lookahead, so even at 2–3× real time the
  speech starts fast and never stutters. The architecture that makes this
  tolerable is already built and already tested.

### What was rejected, and why

- **Piper** (VITS/ONNX, the obvious candidate). Bigger for the same job:
  `en_US` *low* voices come back around 63 MB and medium 30–80 MB. It is a
  fine engine; it is simply a worse size/quality point than KittenTTS Nano.
- **Kokoro-82M.** Better voice, ~80 MB class even quantized. Out of budget.
- **Web Speech API** (`speechSynthesis`). Zero bytes and often excellent — but
  the voice is whatever that device has, several platforms route it through the
  cloud, and it cannot travel inside a GIF. It is the opposite of the property
  this app exists to demonstrate. Worth having one day as a *separate* "use the
  system voice" provider; it does not answer this question.

## The size budget — and the honest correction

25 MB is the MODEL. The stack is:

| Piece | Size | Where it lives |
|---|---|---|
| `kitten-tts-nano` int8 `.onnx` | ~24–25 MB | **pinned asset** (downloaded at install, hash-verified) |
| voice embeddings | **3.3 MB**, not "small" | in-GIF (under the 8 MB asset floor) |
| `onnxruntime-web` WASM (MIT) | ~10–11 MB | in-GIF |
| espeak-ng phonemizer (`phonemizer`, npm) | ~2.6 MB packed | in-GIF |

So **~35–40 MB all in**, not 15–25. The reference browser demo quotes ~50 MB of
model files total. Say this plainly in the listing rather than quoting the
model size and letting the download surprise someone.

**BUILT: 12.4 MB GIF + 24 MB pinned model = ~37 MB, inside that estimate.** The
voice table is 8 x 400 x 256 float32 and deflates by only 8%, which is most of
why the GIF is 12.4 MB rather than the ~10 MB the three LLM providers weigh.
Halving it to float16 is the obvious saving and is **wrong**: a 0.097% change to
the style vector moves the output waveform by 5.1 dB SNR. Measured, not
reasoned about. Leave it alone.

The split follows `docs/providers.md` exactly as the three LLMs do: engine
in-GIF, weights pinned by URL + sha256. A ~10 MB GIF is a shape this repo
already ships three of.

## The one real unknown: phonemization

KittenTTS needs **espeak-ng phonemes (IPA)**, not text. We already ship eSpeak
compiled to JS inside `offline-tts` — but it is the meSpeak/speak.js build,
wrapped to `window.__ESpeak`, and it is there to make *audio*. Whether it can be
driven to emit phoneme strings instead is the question that decides the design:

- **If yes** — reuse ~5.6 MB we already vendor, and the new app gets smaller.
- **If no** — vendor `phonemizer` from npm (2.6 MB packed) and carry a second
  eSpeak. Note its npm metadata says Apache-2.0 while espeak-ng itself is
  GPLv3; that needs reading before shipping, not assuming. We already ship
  GPLv3 in `offline-tts` with `COPYING-espeak.txt`, so it is workable either
  way — it just has to be stated correctly.

Settle this first. It is cheap to test and it changes the app tree.

**BUILT: "yes, and it does not matter" — it is the second branch.** Our eSpeak
*can* emit IPA (`-q --ipa --phonout=<file>` writes it straight into the
emscripten FS, no stdout capture needed). But it is eSpeak **1.45.04**, and it
drops the final vowel of every `-ly` word — `quickly` -> `kwˈɪkl`, `entirely` ->
`ɛntˈaɪəɹl`, and `usually` -> `jˈuːʒuːəLl`, with a literal capital L that the
model's vocabulary happily tokenizes as a letter. 11 of 12 `-ly` words differed
from espeak-ng; `-x` shows the same loss so it is the phoneme analysis, not the
IPA rendering. Too common a suffix to feed a neural voice, so the app vendors
npm `phonemizer` (real espeak-ng, asm.js, data embedded — no wasm, no worker,
no fetch).

**BUILT: the licence question, answered.** The npm package is Apache-2.0 *for
the wrapper*; the espeak-ng it embeds is GPLv3 and a repackaging cannot
relicense it. Both notices ship in the GIF. This qualifies the "Apache-2.0 is
cleaner than what we ship today" claim above: the MODEL is permissive, the
PHONEMIZER is still GPLv3.

**BUILT: espeak-ng drops punctuation and the model needs it.** The reference's
`preserve_punctuation=True` is wrapper behaviour, not an espeak flag — split
the text around the marks, phonemize the spans, put the marks back. The marks
are in the model's vocabulary and its prosody was trained with them.

## Build outline

Mirrors `apps/offline-llm-*` almost exactly:

```
apps/offline-tts-neural/
  manifest.json     provides.ai = ["tts"], capabilities.wasm, assets[] pin
  listing.json      store copy (see the hedge below)
  index.html        the app's own page + a try box
  app.js            gifos.provider.serve({ tts: handler })
  build.mjs         packs engine + phonemizer + voices in-GIF
  icon.mjs          cover art
  vendor/           onnxruntime-web wasm, phonemizer
  README.md         the pin, and why this model
```

Then `node scripts/build-app-catalog.mjs`, and a guard in
`test/browser/e2e-providers.js` alongside the existing offline-tts case — it
already proves the whole brokered loop for `tts` (consumer sandbox → runtime →
hidden provider mount → real RIFF WAV back), so the new case is a copy with a
different GIF and a longer timeout.

**Streaming:** `ctx.delta` is a text channel and does not apply to TTS. What
does apply is `ctx.progress` — this provider must heartbeat while it loads the
model and while it synthesises, or the OS idle timeout is the thing the user
meets. The existing offline-tts and the LLMs both do this; copy that.

## Shipping: hedge, do not claim

Decided 2026-08-11: **the listing carries no speed number.** It says the voice
is much better than eSpeak's and noticeably slower to start, and leaves it
there. The 2–3× real-time figure is a desktop benchmark from a reference demo,
and the phone that took 362 seconds for one LLM answer is the reason we do not
repeat other people's desktop numbers as if they were ours.

If someone later times the first sentence on a real phone, that measured figure
can go in — the same way the LLM warnings now quote a measured 362 s instead of
an adjective.

**BUILT: the hedge was right, and the 2–3× was optimistic.** Measured warm, one
thread, on a 4-core desktop: **0.80× real time** — slower than real time, ~4x
off the reference figure. In the browser, first call including the 24 MB
download and session creation: 14.1 s of audio in 21.4 s. Still perfectly
usable behind Reader's chunked-with-lookahead playback, which is the point, but
nothing here is a number to put in a listing.

This app does **not** need the EXPERIMENTAL treatment the three LLMs just got.
A 25 MB download for a neural voice that starts talking in about a second is a
defensible everyday trade; six minutes for a paragraph is not.

## What blocked building it (resolved)

`huggingface.co` was refused by the egress proxy (403 on CONNECT), and the pin
cannot be guessed — `apps/offline-llm-gemma4/README.md` sets the rule: *"the
sha256 above is of the exact hosted bytes, downloaded and hashed here."*

**Resolved 2026-08-11:** huggingface.co answers 200 from this environment now.
The bytes were downloaded and hashed here; the pin is in
`apps/offline-tts-neural/manifest.json` and repeated in its README.

## Risks, stated plainly

- **Single-author hosting.** Same residual risk as the LLM pins: a repo can
  disappear and break *new* installs. It can never serve *different* bytes —
  the hash is enforced and a mismatch refuses the download.
- **Phone speed is unmeasured.** See the hedge. The chunked-with-lookahead
  reader is what makes a bad case survivable, not an assumption that it is fast.
- **ORT-Web is a big dependency** for one app, and its WASM is the largest
  in-GIF piece. If a second ONNX app ever appears, that is 10 MB carried twice —
  the moment to think about a shared engine, not before.
- **BUILT: two sandbox traps, both paid.** ORT's small 49 KB build loads its
  emscripten glue with a dynamic `import()` and cannot work in an opaque origin
  with no network; the app ships the bundle build and rewrites `import.meta.url`
  away, because module-only syntax is a SyntaxError in the inline classic
  script the runtime injects. And two minified bundles in one script scope both
  declare `const ne` — the second dies with "Identifier 'ne' has already been
  declared", so each is wrapped in an IIFE. Both are asserted in `build.mjs`
  rather than remembered.
