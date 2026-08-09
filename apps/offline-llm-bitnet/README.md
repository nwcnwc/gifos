# Offline Cheap Text LLM BitNet

A **Provider app** (docs/providers.md) that serves the computer's **Cheapest
text LLM** AI role from inside the sandbox — llama.cpp compiled to
WebAssembly, answering every `gifos.ai.chat({model:'cheapest'})` on-device.
The seeded **Ask AI** app (Tools) is its first consumer; so is Chat's
"✨ AI draft". The name leaves room for siblings — other engines/weights can
ship as their own "Offline Cheap Text LLM …" providers.

This is the app the **install-time assets gigabyte tier** exists for
(gifos-assets.js): the GIF carries the *engine*; the *weights* — Microsoft
Research's **BitNet b1.58 2B-4T**, ternary (−1/0/+1) — arrive as a
hash-pinned download cached in the computer's Blob store, far too big to
ride in any GIF.

## What's in the GIF (~10 MB)

- `wllama-lib.js` — [wllama](https://github.com/ngxson/wllama) 3.5.1 (MIT,
  `COPYING-wllama.txt`), llama.cpp's wasm binding, from `vendor/wllama-esm.js`
  with two build-time rewrites (`build.mjs`): the ESM export block becomes
  `window.WllamaLib`, and its blob-URL worker goes **module → classic** —
  Chromium refuses a `{type:'module'}` blob worker in an opaque-origin
  (sandboxed) frame, firing a silent `onerror`, while a classic worker runs
  the identical code (which contains no module-only syntax; the build
  asserts this stays true).
- `wllama-wasm.js` — llama.cpp as wasm (7.7 MB, base64; **TQ1_0/TQ2_0
  ternary quants compiled in**). The app mints a `blob:` URL from these
  bytes — the wasm hatch's `connect-src blob:` exists for exactly this.
- `demo-model-data.js` — the ~4.9 MB **self-test model**: a real llama SPM
  tokenizer (from llama.cpp's own vocab fixture) around 2 layers of tiny
  DETERMINISTIC random weights, built by `make-demo-model.py` (needs
  `pip install gguf numpy` + `models/ggml-vocab-llama-spm.gguf` from the
  llama.cpp repo). It produces token soup **by design**; the app labels it
  a self-test and never lets it masquerade as answers. It exists so the
  whole pipeline — worker, wasm, tokenize, generate, the provider serve
  loop — is provable instantly, offline, and in the release gate.

## Finalizing the BitNet pin (NOT DONE YET — why this app is unpublished)

The manifest's `assets` pin needs the real weights' SHA-256, and this build
environment cannot reach huggingface.co to compute it. From any
unrestricted machine:

1. Obtain a **mainline-llama.cpp-compatible ternary GGUF** of
   `microsoft/bitnet-b1.58-2B-4T`. The official `ggml-model-i2_s.gguf` is
   bitnet.cpp-only (mainline rejects it); convert with
   `convert_hf_to_gguf.py <hf-checkpoint> --outtype tq2_0` (~700 MB, 2.06
   bpw) — or `tq1_0` — and **verify it loads and chats in a mainline
   llama.cpp no older than the vendored build** (`b9640`, see
   `LIBLLAMA_VERSION` in wllama). Under wllama's 2 GB per-file ceiling
   either fits; host it at a stable, CORS-served https URL (a HF repo).
2. `sha256sum` the file, note its exact byte size.
3. Add to `manifest.json`:
   `"assets": [{ "url": "https://…/bitnet-2b-4t-tq2_0.gguf",
   "sha256": "<hex>", "path": "model.gguf", "bytes": <n> }]`
4. `node apps/offline-llm-bitnet/build.mjs && node scripts/build-app-catalog.mjs`
5. Install on a real desktop, confirm the badge flips from self-test to
   "BitNet weights loaded" and answers are coherent; then
   `mv listing.unpublished.json listing.json`, regenerate the catalog, and
   commit — that's the publish.

The app already prefers `gifos.assets('model.gguf')` over the self-test
model on every boot, so the pin is the only missing piece.

### BLOCKED at step 5: the vendored engine computes BitNet's FFN wrong

**Measured 2026-08-09 on an unrestricted machine (aarch64). Do not pin until
this is resolved — a pin would ship a green "BitNet weights loaded" badge over
incoherent answers, which is worse than the honest self-test label.**

The weights convert fine and the GGUF is good. The *engine* is wrong: mainline's
BitNet graph hardcodes **SiLU** in the FFN, but `bitnet-b1.58-2B-4T` declares
`hidden_act: relu2` (squared-ReLU) in its `config.json`. The vendored wasm is
stock upstream `b9640-dd4623a` = commit `dd4623a74f0c`, whose
`src/models/bitnet.cpp:132` is `LLM_FFN_SILU, LLM_FFN_PAR` — the bug is in the
bytes we ship. It is still `LLM_FFN_SILU` on upstream master at `b10333`.

Controlled A/B, same GGUF, same `llama-server`, same prompts, `--temp 0`; the
only difference is that one token changed to `LLM_FFN_RELU_SQR`:

| Prompt | stock (SiLU) — what we would ship | patched (relu²) |
|---|---|---|
| capital of France | right answer, then repeats it 8× until `max_tokens` cut it off | `The capital of France is Paris.` + clean stop |
| why is the sky blue | "because it is a reflection of the ocean's color" (**wrong**), repeats | Rayleigh scattering, correct, clean stop |
| write a haiku | prose, not a haiku, repeats verbatim | a real 5-7-5 haiku |
| 3 apples, eat 1 | "**3** apples are left" (**wrong**) | "You have 2 apples left." |

Every stock answer ran to `max_tokens` in a repeat loop instead of ending; the
patched build returned `finish_reason: stop` on all four. So under SiLU an Ask
AI answer is looping text, truncated wherever the token budget runs out.
Upstream measured the same defect as perplexity: wikitext **99.8 (SiLU) vs
17.1 (relu²)**
— PR ggml-org/llama.cpp#25885 (closed unmerged) and its successor #26751
(`bitnet: honor relu2 hidden_activation from GGUF`, still **open**).

**To unblock**, one of:
- land/backport the relu² fix and **re-vendor `wllama.wasm` from a llama.cpp
  that carries it** (then re-verify in-browser, not just in `llama-server`); or
- ship a different engine/weights pairing under the "Offline Cheap Text LLM …"
  name, which the app's naming already leaves room for.

### Also wrong in step 1 above: the convert command does not work as written

Stock `convert_hf_to_gguf.py` cannot convert `microsoft/bitnet-b1.58-2B-4T`.
Two independent failures, both needing local patches to llama.cpp:

1. `ValueError: Can not map tensor 'model.layers.0.mlp.ffn_sub_norm.weight'` —
   this checkpoint names its sub-norms `attn_sub_norm` / `ffn_sub_norm`, while
   `gguf-py/gguf/tensor_mapping.py` only knows the older 1bitLLM spellings
   `inner_attn_ln` / `ffn_layernorm`. Both names must be added.
2. `conversion/bitnet.py` calls `_set_vocab_sentencepiece()` unconditionally,
   but 2B-4T ships a Llama-3 **BPE** `tokenizer.json` and no `tokenizer.model`;
   it needs the `_set_vocab_gpt2()` path.

So "convert it yourself" is **not** a stock one-liner, and any future pin must
say exactly which patched converter produced the bytes.

For the record, the artifact those patches produce (correct, and coherent the
moment the engine is fixed — but **not hosted and not pinned**):

```
bitnet-b1.58-2B-4T-tq2_0.gguf
sha256 8c71a6beca657b7028f3210959fdec11f14885ed845c30d731dd3204bc2b3d28
bytes  1203563552          # 1.2 GB, NOT the ~0.7 GB estimated above:
                           # tied token_embd stays F16 (~656 MB of the total)
ftype  TQ2_0 - 2.06 bpw ternary (210 ternary tensors)
from   microsoft/bitnet-b1.58-2B-4T-bf16, converted + verified against
       llama.cpp b10333 (tag commit 0865990)
```

`tokenizer.chat_template` **is** present in that GGUF, but note llama.cpp's own
template matcher rejects it (`this custom template is not supported, try using
--jinja`) — worth re-checking against wllama's `createChatCompletion` before any
future pin, since the app relies on it.

### Separately: e2e-providers.js is RED on main, in the self-test chat path

Found while running the gate for this work; **reproduced on pristine `main`
(c8261a8) with no local changes**, twice, byte-identical — a hard red, not a
flake, and it predates this investigation:

```
FAIL — Ask AI never got the self-test answer; the app shows:
       ⚠ Invalid typed array length: 1163217991
```

Root cause is in the vendored wllama worker (`LLAMA_CPP_WORKER_CODE`, the
`wllama.action` branch). It sends the action, then reads the output length
back out of **the first 4 bytes of the *input* buffer**, which the C++ side is
expected to overwrite:

```js
const outputLen = new Uint32Array(getHeapU8().buffer, Number(inputPtr), 1)[0];
const outputBuffer = new Uint8Array(outputLen);   // ← RangeError
```

When the action fails, nothing overwrites those bytes, so the worker reads the
stale encoded-message header `47 4C 55 45` (ASCII `GLUE`) = 1163217991 and asks
for a 1.16 GB array. The trigger is llama.cpp's chat parser rejecting the
self-test model's deliberate token soup (`Failed to parse input at pos 0: …`),
so **the failure path itself is what's broken** — any action error surfaces as
this nonsense RangeError instead of the real message.

Note this lands in the same vendored engine that the relu² bug does, so
**re-vendoring `wllama.wasm` + `wllama-esm.js` is the single fix that could
clear both** — which is an argument for doing it once, deliberately, rather
than patching around either.

## Licensing

wllama/llama.cpp are MIT (`COPYING-wllama.txt`); BitNet b1.58 2B-4T weights
are MIT (Microsoft Research). The self-test model is generated in-repo.

## Rebuild

```bash
node apps/offline-llm-bitnet/build.mjs   # packs site/apps/offline-llm-bitnet/offline-llm-bitnet.gif
node scripts/build-app-catalog.mjs       # refresh the store catalog
```
