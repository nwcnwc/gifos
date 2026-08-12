# Offline Neural TTS (Kokoro, GPU)

A **Provider app** (docs/providers.md) that serves the computer's **Text → speech**
role with a higher-quality neural voice — and runs it on the **GPU** where the
device has one. The design decision and the split of what-rides-where is
docs/tts-neural.md; this app is the **GPU sibling** of `apps/offline-tts-neural/`
(KittenTTS).

It is the **third** tts provider, not a replacement. `apps/offline-tts` (eSpeak,
1.6 MB, instant, robotic) and `apps/offline-tts-neural` (KittenTTS int8, 12 MB,
CPU-only) both stay exactly as they are; the user picks one in Settings → AI
models.

## Why a third one — the WebGPU point

The KittenTTS provider is int8-quantized, and its `MatMulInteger` /
`DynamicQuantizeLSTM` ops have **no WebGPU kernels** — so it is CPU-by-
construction and declares no GPU ability. Kokoro-82M is an **fp16 transformer**
whose ops **do** have WebGPU kernels. So this app declares `capabilities.gpu`
(the WebGPU allow-policy hatch, docs/architecture.md) and asks ONNX Runtime Web
for `['webgpu', 'wasm']`: it runs on the device's GPU where one exists and falls
back to the CPU (WebAssembly) where it doesn't. Same voice either way; a real
GPU just makes it think faster. `app.js` records which execution provider
actually ran and the page says so ("Spoken on your GPU" / "on the CPU").

## The pin

| | |
|---|---|
| Model | `onnx-community/Kokoro-82M-v1.0-ONNX` → `onnx/model_fp16.onnx` |
| Bytes | 163,234,740 |
| sha256 | `ba4527a874b42b21e35f468c10d326fdff3c7fc8cac1f85e9eb6c0dfc35c334a` |
| I/O | `input_ids` [1,N] int64, `style` [1,256] f32, `speed` [1] f32 → `waveform` |
| Output | 24 kHz mono |
| Licence | Apache-2.0 |

The OS verifies the sha256 on every install and refuses a mismatch, so the host
can break *new* installs but can never serve *different* bytes.

## What rides where

| Piece | Size | Where |
|---|---|---|
| `model_fp16.onnx` | 163 MB | **asset pin** |
| onnxruntime-web (WebGPU bundle + its JSEP wasm) | ~22 MB raw | in-GIF |
| espeak-ng phonemizer (`phonemizer.js`) | 1.3 MB | in-GIF |
| 8 style tables (`voices.f32`, 8×510×256 f32) | 4.2 MB | in-GIF |
| self-test model, vocabulary | ~4 KB | in-GIF |

Built GIF: **~18.5 MB**. The engine is the **JSEP** ORT build
(`ort-wasm-simd-threaded.jsep.wasm` + `ort.webgpu.bundle.min.mjs`), the only
pairing that can place ops on a GPU. The CPU-only build the KittenTTS app ships
cannot — it was the wrong engine for this model, which is why the two apps carry
different ORT bytes.

## The pipeline (replicated from kokoro-onnx)

```
text -> espeak-ng IPA (punctuation + stress preserved) -> token ids ->
ONNX (input_ids=[0,…ids,0], style=voice[len(ids)], speed) -> waveform -> RIFF WAV
```

The tokenizer is a plain char→id map over the 114-entry Kokoro vocab (spaces are
token 16), the style vector is indexed by **token count**, and the ids are
pad-0-bracketed — matching `kokoro_onnx`'s `create()` exactly. Punctuation is
preserved by the same split-phonemize-reinsert trick the KittenTTS app uses,
because the JS espeak wrapper drops marks.

## Voices

Eight: Heart, Bella, Nicole, Sarah (American female), Michael, Fenrir (American
male), Emma (British female), George (British male). Extracted from
`voices-v1.0.bin` at build time into `voices.f32`. The OpenAI names (nova,
shimmer, fable, echo, onyx, alloy) map on top so cloud-written apps work
unchanged.

## Licences

- **Kokoro-82M** — Apache-2.0.
- **ONNX Runtime Web** — MIT (`vendor/LICENSE-onnxruntime.txt`).
- **espeak-ng**, embedded inside `phonemizer.js` — **GPLv3**
  (`COPYING-espeak-ng.txt`); the `phonemizer.js` wrapper is Apache-2.0.

## Build

```bash
node apps/offline-tts-kokoro/build.mjs        # → site/apps/offline-tts-kokoro/offline-tts-kokoro.gif
node scripts/build-app-catalog.mjs            # refresh the store catalog
```

`test/browser/e2e-providers.js` guards it: the reserved voice `self-test` returns
a real RIFF WAV from the in-GIF stand-in model, proving the JSEP ORT bundle,
espeak-ng, the vocab/style table and the WAV encoder all run in the sandbox
(on the CPU fallback path, since headless Chromium has no WebGPU).
