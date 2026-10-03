# Offline Captions (Whisper)

A **Provider app** (docs/providers.md) that serves the computer's **Speech → text**
role with OpenAI's Whisper, entirely on the device. Born from the first customer
meeting on GifOS (2 Oct 2026): the browser's own speech engine listened in ONE
fixed language with no way to detect it, wrote two-word fragments without
punctuation, could not learn the company's product names, and could not
translate. Whisper does all four.

## What rides where

| | |
|---|---|
| IN THE GIF | onnxruntime-web 1.20.1 (MIT; the same JSEP build `offline-tts-kokoro` vendors — this build script reads that copy), `whisper-core.js` (the log-mel front end, the byte-level BPE tokenizer, greedy KV-cached decoding, language detection, the translate task, prompting — dependency-free), the multilingual tokenizer vocab + merges (1.5 MB) |
| BY ASSET PIN | the ONNX exports from onnx-community, int8-quantized, all `optional` (fetched on first use, never at install): tiny encoder 10.1 MB + decoder 30.7 MB; base encoder 23.2 MB + decoder 53.7 MB |

The OS verifies each sha256 and refuses a mismatch. The app itself has no network path.

## The pins

| model | file | bytes | sha256 |
|---|---|---|---|
| tiny | `onnx/encoder_model_quantized.onnx` | 10,124,990 | `2af4a414…b84d19` |
| tiny | `onnx/decoder_model_merged_quantized.onnx` | 30,719,241 | `25e807a9…faddd3` |
| base | `onnx/encoder_model_quantized.onnx` | 23,201,314 | `58629933…974dd46` |
| base | `onnx/decoder_model_merged_quantized.onnx` | 53,693,315 | `fa3ef990…dc090b` |

Full hashes are in `manifest.json`. Decoder geometry (needed to shape the empty
first-pass cache): tiny 6 heads × 64, base 8 heads × 64.

## The request

`gifos.ai.stt({ bytes, mime, language, task, prompt, model })` → `{ text, language, raw }`

- `bytes` + `mime`: any audio the browser can decode (`audio/webm`, `audio/mp4`,
  `audio/wav`…), OR raw PCM as `audio/pcm;rate=16000;bits=32` (little-endian
  float32, mono) — the meeting sends this, straight off its echo-cancelled mic.
- `language`: a code (`en`, `ru`, `en-US`…) or `auto` / empty to detect.
- `task`: `transcribe` (default) or `translate` (write English).
- `prompt`: names and words to prefer — becomes Whisper's prompt.
- `model`: `tiny` | `base`; default tiny on a phone, base elsewhere.

Audio longer than 30 s is transcribed in 30 s windows. Silence returns `""`
without touching the model. Calls are serialized — one engine, one thread.

## Why CPU only (for now)

The int8 exports use `MatMulInteger` / `DynamicQuantizeLinear`, which have no
WebGPU kernels, so this app declares `capabilities.wasm` only and runs
single-threaded WebAssembly everywhere. On the Jetson (Node, multi-thread) an
11 s clip takes ~3 s with tiny; a browser tab is slower. An fp16 WebGPU variant
is the obvious next step and would reuse everything here but the pins.

## Testing

- `node test/unit/whisper-core.js` — the mel front end, the tokenizer (decode,
  encode, BPE), the loop guard, and the manifest pins, with no model.
- `node test/tools/whisper-smoke.js` — downloads the tiny pair into
  `~/.cache/gifos-whisper/`, transcribes the JFK sample, and asserts the text.
  Needs the network; not a gate.

Build: `node apps/offline-stt-whisper/build.mjs`, then `node scripts/build-app-catalog.mjs`.
