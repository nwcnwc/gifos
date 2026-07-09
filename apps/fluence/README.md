# Fluence — spontaneous-speech coach (GifOS app)

A port of the [fluence](https://github.com/nwcnwc/fluence) project to a single
GifOS app GIF. Speak off the cuff to a prompt; get honest, evidence-grounded
coaching on how you actually spoke.

This is the **first GifOS-certified app** (see `../README.md`): first-party,
built here, **not** seeded as a default. Download `../fluence.gif` and drop it on
any GifOS desktop to run it.

## What it does

1. **Record a take** — `gifos.recordAudio()`. GifOS captures the clip behind its
   own visible recorder; the app never holds the live mic.
2. **Transcribe** — `gifos.api('deepgram')` → Deepgram **nova-3** with
   `filler_words=true`, so we get **per-word timestamps, confidence, and filler
   tagging**. That word-level richness (which a plain Whisper endpoint doesn't
   give) is the whole reason for Deepgram, and the reason the generic
   third-party-API capability exists.
3. **Extract features** — `features.js` (ported verbatim, pure JS, no LLM):
   pace/articulation rate, pauses & long-pause moments, fillers, hedges,
   adjacent-repeat restarts, lexical diversity (TTR) & vocabulary reach, ASR
   confidence, sentence structure. This is the honest, comparable-across-takes
   signal.
4. **Coach** — one `gifos.ai.chat({ model:'smartest' })` pass, grounded in those
   features + the transcript, returning candid strengths / weaknesses / moments
   as JSON.
5. **Remember** — every take is saved in `gifos.db('takes')`, so the coach can
   note trends over time. Data lives on your device, inside the app's GIF.

## Setup (the app tells you if either is missing)

- **Deepgram** — GifOS Settings → **Third-party APIs** → add one named
  `deepgram`: base URL `https://api.deepgram.com`, auth **Token**, your key, and
  tick **Route through a CORS proxy** (Deepgram's REST API blocks direct browser
  calls). A key with free credit comes with a new deepgram.com account.
- **A coach model** — GifOS Settings → **AI models** → set up **Smartest text**
  (any OpenAI-compatible endpoint + key).

Keys stay in the GifOS computer (per-origin localStorage, excluded from a shared
backup GIF); the app only ever receives results.

## Capabilities used

`db`, `microphone` (`gifos.recordAudio`), `ai` (`gifos.ai.chat`),
`api: ["deepgram"]` (`gifos.api`). See `manifest.json`.

## Layout & build

```
apps/fluence/
  index.html      ← shell; <script src> siblings are inlined by the runtime
  wordlists.js    ← ported word lists (window.FL.*)
  features.js     ← ported deterministic feature extractor (window.FL.extractFeatures)
  coach.js        ← the coach system/user prompt (lean v1: free speaking)
  app.js          ← record → transcribe → features → coach → db orchestration
  style.css
  manifest.json
  build.mjs       ← packs ../fluence.gif with the repo's own codec
  screenshot.png  ← one take, rendered
```

Rebuild the GIF after editing any source file:

```bash
node apps/fluence/build.mjs   # → apps/fluence.gif
```

## Scope (v1) and what's next

Lean v1 covers the connected-speech coaching loop. Deliberately left for later
(they're in the original fluence): the **drill types** (semantic/letter fluency,
forced substitution, bridging, picture description, topic switch), **drill
generation**, **image generation** for picture-description drills, and the
**weekly review** role. The feature extractor and the drill-type-aware grading
rules from the original port straight across when we add them.

## Tests

`test/e2e-fluence.js` mounts the built GIF on a real GifOS desktop and drives the
full pipeline against a fake Deepgram (`test/fake-keyapi.js`) and a fake coach
(`test/fake-ai.js`): record → transcribe → features → coach → history.
