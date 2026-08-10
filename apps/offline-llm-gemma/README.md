# Offline Cheap Text LLM Gemma

A **Provider app** (docs/providers.md) that serves the computer's **Cheapest
text LLM** AI role from inside the sandbox — llama.cpp compiled to
WebAssembly, answering every `gifos.ai.chat({model:'cheapest'})` on-device.

This is the **second** provider for that role, and the reason the naming leaves
room: `apps/offline-llm-bitnet/` is the sibling. Same engine, different brain,
same `provides.ai: ["cheapest"]`. Installing both is fine — GifOS never
auto-assigns a role, so the user picks one in **Settings → AI models** and can
switch whenever.

| | this app | Offline Cheap Text LLM BitNet |
|---|---|---|
| weights | Gemma 3 1B Instruct, Q4_K_M | BitNet b1.58 2B-4T, TQ1_0 ternary |
| download | 806,058,240 B (~769 MiB) | 1,105,874,048 B (~1.03 GiB) |
| licence | **Gemma Terms of Use** (not open source) | MIT |
| source | `ggml-org/gemma-3-1b-it-GGUF` | a community conversion, verified |

## What's in the GIF (~10 MB)

Byte-identical engine to the BitNet sibling — `vendor/wllama-esm.js`,
`vendor/wllama.wasm` (`b9644-daa5ed9`, see that app's README for what is
patched in it and why) and the same `vendor/demo-model.gguf` self-test model.
The two apps deliberately carry their own copy rather than share one: an App
GIF is a single self-contained file, and that is the whole distribution story.

## The weights pin

```
url    https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF
       /resolve/main/gemma-3-1b-it-Q4_K_M.gguf
sha256 8ccc5cd1f1b3602548715ae25a66ed73fd5dc68a210412eea643eb20eb75a135
bytes  806058240
```

We host nothing. Hugging Face serves it anonymously with
`access-control-allow-origin: *`.

**Why this repo:** `ggml-org` is the llama.cpp organisation itself, so it is
the closest thing to a first-party GGUF and the least likely to drift from what
mainline can load. Google's own `google/gemma-3-1b-it-qat-q4_0-gguf` is
**gated** (`gated: manual` — it needs an accepted licence and a logged-in
token), which makes it unusable for an anonymous install-time download. That is
a mechanical reason, not a preference.

**Verified before pinning** (the same bar the sibling had to clear): loaded in
mainline llama.cpp b10333 and chatted — `3 apples, eat 1` → "2.", the sky
question → correct scattering answer, and a real 5-7-5 haiku, each with
`finish_reason: stop`. The exact hosted bytes were hashed here after download.

## Licensing — read this before shipping anything derived from it

The app and the engine are MIT. **The weights are not.** Gemma is distributed
under the [Gemma Terms of Use](https://ai.google.dev/gemma/terms), which is not
an open-source licence: it carries use restrictions that follow the model and
its outputs, and those terms bind anyone who receives them. GifOS neither hosts
nor redistributes the weights — the OS downloads them from Hugging Face onto
the user's own device — but the listing says so plainly rather than burying it,
because "MIT" on the app must not be read as "MIT" on the brain.

The self-test model is generated in-repo; wllama/llama.cpp are MIT
(`COPYING-wllama.txt`).

## Prompt format

Gemma 3 uses turn markers, not BitNet's `User:`/`Assistant:` lines:

```
<start_of_turn>user
…<end_of_turn>
<start_of_turn>model
```

`app.js` builds that itself and takes a RAW completion (`createCompletion`)
rather than `createChatCompletion` — the chat path runs llama.cpp's PEG chat
parser, which demands the output begin with the generation-prompt literal and
throws when it doesn't. Gemma has **no system role**, so a system message is
folded into the first user turn, which is what Google's own template does.

## Rebuild

```bash
node apps/offline-llm-gemma/build.mjs   # packs site/apps/offline-llm-gemma/offline-llm-gemma.gif
node scripts/build-app-catalog.mjs      # refresh the store catalog
```
