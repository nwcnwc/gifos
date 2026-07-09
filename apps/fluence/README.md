# Fluence — spontaneous-speech coach (GifOS app)

A port of the [fluence](https://github.com/nwcnwc/fluence) project to a single
GifOS app GIF. Speak off the cuff to a prompt; get honest, evidence-grounded
coaching on how you actually spoke.

This is the **first GifOS-certified app** (see `../README.md`): first-party,
built here, **not** seeded as a default. Download `../fluence.gif` and drop it on
any GifOS desktop to run it. It's a **full port** — every pipeline stage the
original had.

## What it does

1. **Pick a drill** — freestyle by default, or open the catalog and choose from
   **nine drill types** (see below). After a take, the coach suggests the next
   drill that targets your top weakness, one tap to start it.
2. **Record a take** — `gifos.recordAudio()`. GifOS captures the clip behind its
   own visible recorder; the app never holds the live mic. The record length is
   the drill's own duration (60–120s).
3. **Transcribe** — `gifos.api('deepgram')` → Deepgram **nova-3** with
   `filler_words=true`, so we get **per-word timestamps, confidence, and filler
   tagging**. That word-level richness (which a plain Whisper endpoint doesn't
   give) is the whole reason for Deepgram, and the reason the generic
   third-party-API capability exists.
4. **Extract features** — `features.js` (ported verbatim, pure JS, no LLM):
   pace/articulation rate, pauses & long-pause moments, fillers, hedges,
   adjacent-repeat restarts, lexical diversity (TTR) & vocabulary reach, ASR
   confidence, sentence structure. The honest, comparable-across-takes signal.
5. **Coach** — one `gifos.ai.chat({ model:'smartest' })` pass with the full
   **drill-type-aware grading rules**, so listing tasks are graded on item count
   (not TTR/fillers), picture description on coverage vs. the answer key, topic
   switching on clean pivots at the 30s/60s marks, and so on. Returns candid
   strengths / weaknesses / timestamped moments + a suggested next drill.
6. **Weekly review** — `gifos.ai.chat({ model:'smartest' })` over your last 7
   days finds patterns the per-take coach can't see (improving / worsening /
   flat), breakthroughs, and one focus for next week.
7. **Remember** — takes in `gifos.db('takes')`, weekly reviews in
   `gifos.db('reviews')`, benchmarks in `gifos.db('benchmarks')`. Data lives on
   your device, inside the app's GIF.

## The four tabs

- **Practice** — the drill card, record, coaching, the drill catalog.
- **Stats** — trend charts for six metrics (fillers/min, words/min with a
  140–170 sweet spot, TTR, vocabulary reach, long pauses, hedges/min) with
  now / avg / best and a sparkline, over a 7 / 30 / 90-day / all window
  (connected-speech takes only — listing tasks would distort them). The weekly
  review lives here too.
- **History** — every take grouped by month; tap one to read its transcript.
- **Benchmarks** — a fixed set of prompts you re-record over time; each shows a
  fillers/min trend across its runs. "Same prompt, same conditions" is the
  cleanest progress signal, controlling for prompt difficulty. Seed three
  starters, add your own, or save any take's prompt as a benchmark from its
  coaching card.

## Drill types (drills.js)

| Type | What it trains | Generation |
|------|----------------|------------|
| **Freestyle** | baseline connected speech | local prompt list |
| **Semantic fluency** | lexical retrieval under time pressure | `gifos.ai.chat` (category) |
| **Letter fluency** | phonemic search (FAS-style) | templated, no LLM |
| **Forced substitution** | deliberate word choice, filler reduction | `gifos.ai.chat` (banned words) |
| **Bridging** | forward planning, pause reduction | `gifos.ai.chat` (start/end sentences) |
| **Recast** | re-deliver a past stumble cleanly | `gifos.ai.chat` (seeded from history) |
| **Bullet points** | outline-to-prose, transitions | `gifos.ai.chat` (4 bullets; accepts your topic) |
| **Picture description** | narrative cohesion, specificity | `gifos.ai.chat` scene + **`gifos.ai.image`** render |
| **Topic switching** | set-shifting under articulation | `gifos.ai.chat` (3 contrasting topics) |

Drill generation uses the **cheapest** AI role (fast/creative); coaching and the
weekly review use **smartest**; picture scenes render with the **image** role.
Interactive/timed drills (semantic, letter, topic-switch, picture) show their
constraints up front — the runtime's recorder overlay covers the app during
capture, so the plan is studied before you start and the coach still grades the
timing from the word timestamps.

## Setup (the app tells you exactly what's missing, and where)

- **Deepgram** (transcription) — GifOS Settings → **Third-party APIs** → add one
  named `deepgram`: base URL `https://api.deepgram.com`, auth **Token**, your
  key, and tick **Route through a CORS proxy** (Deepgram's REST API blocks direct
  browser calls). A key with free credit comes with a new deepgram.com account.
- **Smartest text** (coaching + weekly review) — GifOS Settings → **AI models**.
- **Cheapest text** (drill generation) — GifOS Settings → **AI models**. Falls
  back to Smartest-style handling; only needed for generated drills.
- **Text → image** (only for picture-description drills) — GifOS Settings →
  **AI models**.

Any OpenAI-compatible endpoint + key works for the AI roles. Keys stay in the
GifOS computer (per-origin localStorage, excluded from a shared backup GIF); the
app only ever receives results.

## Capabilities used

`db`, `microphone` (`gifos.recordAudio`), `ai` (`gifos.ai.chat` + `gifos.ai.image`),
`api: ["deepgram"]` (`gifos.api`). See `manifest.json`.

## Layout & build

```
apps/fluence/
  index.html      ← shell; <script src> siblings are inlined by the runtime
  wordlists.js    ← ported word lists (window.FL.*)
  features.js     ← ported deterministic feature extractor (FL.extractFeatures)
  coach.js        ← full drill-type-aware coach prompt (FL.buildCoachUser)
  drills.js       ← drill catalog + generation (FL.DRILL_TYPES, FL.generateDrill)
  weekly.js       ← weekly-review prompt + generation (FL.generateWeekly)
  app.js          ← UI: catalog → drill → record → transcribe → features →
                     coach → suggest-next → db; weekly review; history
  style.css
  manifest.json
  build.mjs       ← packs ../fluence.gif with the repo's own codec
  screenshot.png  ← a take, rendered
```

Rebuild the GIF after editing any source file:

```bash
node apps/fluence/build.mjs   # → apps/fluence.gif
```

## Parity with the original

Full port of the fluence pipeline: all nine drill types, drill-type-aware
grading, drill generation (LLM + templated letter fluency), picture-description
scene + image generation, the suggested-next-drill loop, and the weekly review.
The server-only bits that don't apply in a keys-in-your-browser app are dropped:
provider-call cost logging, multi-user accounts/auth, and the SQLite store (its
role is played by `gifos.db`, per-device).

## Tests

`test/e2e-fluence.js` mounts the built GIF on a real GifOS desktop and drives the
whole thing against a fake Deepgram (`test/fake-keyapi.js`) and a fake AI
(`test/fake-ai.js`, which returns drill/coach/weekly/scene JSON): boot → record →
transcribe → features → coach → history → catalog → generated drill (banned
words) → picture-description image → weekly review. `test/shot-fluence.js`
regenerates `screenshot.png`.
