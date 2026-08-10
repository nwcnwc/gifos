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

## The weights pin (DONE — 2026-08-09)

`manifest.json` pins a **community TQ1_0 conversion** of
`microsoft/bitnet-b1.58-2B-4T`, and the app prefers it over the self-test model
on every boot:

```
url    https://huggingface.co/ihtesham0345/bitnet-b1.58-2B-4T-llamakind
       /resolve/main/bitnet-b1.58-2B-4T-tq1_0.gguf
sha256 db8852edfaa08476ab8476052c7777990cf73df16f2618604115a2c954e06f3a
bytes  1105874048        # ~1.03 GiB, TQ1_0 ternary, well under wllama's 2 GB
```

We host nothing. Hugging Face serves that file anonymously with
`access-control-allow-origin: *`, which is all the OS download needs. (GitHub
**Release assets send no CORS header at all** — checked; they cannot be used
for this.)

### Why we trust someone else's conversion

The pin is a supply-chain decision, so it is argued rather than asserted. We
independently converted `microsoft/bitnet-b1.58-2B-4T-bf16` ourselves and
compared the two files:

- **The weights are bit-for-bit the same model.** Dequantizing three layers
  (`blk.0.ffn_down`, `blk.15.attn_q`, `blk.29.ffn_gate` — 42M weights) from
  each file gives **sign agreement 1.000000, correlation 1.000000** against our
  own conversion of Microsoft's official checkpoint. Ternary weights ARE their
  signs, so this is an identity check, not a similarity score.
- All **332 tensor names and shapes match exactly**; the `chat_template` is
  identical; its `general.name` records the same official bf16 source.
- It **loads and chats coherently** in mainline llama.cpp b10333 — the step-2
  proof, done before pinning.

Residual risk, stated plainly: it is a third-party repo that could disappear,
which would break new installs. It can never serve *different* bytes — the
sha256 is enforced by the OS and a mismatch refuses the download.

### Reproducing the conversion (the recipe in git history did NOT work)

Stock `convert_hf_to_gguf.py` cannot convert this checkpoint. Two independent
failures, both needing patches:

1. `ValueError: Can not map tensor 'model.layers.0.mlp.ffn_sub_norm.weight'` —
   2B-4T names its sub-norms `attn_sub_norm` / `ffn_sub_norm`, while
   `tensor_mapping.py` only knows the 1bitLLM spellings `inner_attn_ln` /
   `ffn_layernorm`.
2. `conversion/bitnet.py` calls `_set_vocab_sentencepiece()`, but 2B-4T ships a
   Llama-3 **BPE** `tokenizer.json` and no `tokenizer.model`; it needs
   `_set_vocab_gpt2()`.

Our conversion (TQ2_0, 1203563584 bytes) is **not** what ships — it exists only
as the reference the community file was checked against.

### The engine: BitNet's FFN is squared-ReLU, and mainline gets it wrong

The vendored wasm is **no longer stock wllama**. Mainline's bitnet graph
hardcodes `LLM_FFN_SILU`, but this model is squared-ReLU (`hidden_act: relu2`).
That is not a crash — it is quietly wrong output (upstream measured wikitext
ppl **99.8 vs 17.1**): right answers to trivia, but wrong arithmetic, wrong
science, prose instead of haiku, and repetition instead of stopping.

`vendor/wllama.wasm` + `vendor/wllama-esm.js` are rebuilt from wllama 3.5.1's
own Docker/Emscripten recipe against its pinned llama.cpp (`dd4623a`) plus a
local patch, and stamp themselves **`b9642-c987960`** (not stock
`b9640-dd4623a`). The patch:

- teaches the activation table `relu2`, and reads `<arch>.hidden_activation`;
- **defaults by shape** — bitnet with 30 layers x 2560 embd IS 2B-4T, so it
  gets relu² even when the GGUF is silent, which is the case for every
  community conversion including the one we pin. An explicit declaration in
  the file still wins, and other bitnet models keep SwiGLU.

Measured on the pinned file, same binary, `--temp 0`:

| | shipped default | forced SiLU |
|---|---|---|
| 3 apples, eat 1 | `You have 2 apples left.` | `3 apples are left.` |
| why is the sky blue | Rayleigh scattering | "a reflection of the ocean's color" |

Rebuilding the bundle is verified faithful: regenerating it from stock sources
reproduced the vendored file to **within 8 bytes** (the version string), with
the Emscripten glue byte-identical — so nothing but the engine changed.

Upstream: the hardcode fix is ggml-org/llama.cpp#25885 (closed unmerged, it
would break 1bitLLM models) and the config-driven one is #26751 (open). Nothing
was submitted upstream from here — llama.cpp's AGENTS.md forbids agent-authored
PRs and exempts private forks.

### One more bug this shook out

`e2e-providers.js` was RED on main with `Invalid typed array length:
1163217991`. Two stacked bugs: `wllama_action()` returns nullptr when the C++
throws but writes the output length only on success, and the worker never
checked the pointer — so it read the length out of the untouched *input* buffer
(`0x45554c47` = `"GLUE"`) and asked for 1.16 GB. Patched in
`src/workers-code/llama-cpp.js` to surface the real error. What was throwing:
llama.cpp's structured chat parser on the self-test model's deliberate token
soup — so `app.js` now loads with `skip_chat_parsing: true`, since this
provider returns plain text and never wants tool-call parsing.

**Note:** GitHub Pages cannot set COOP/COEP and the site sets neither, so
`crossOriginIsolated` is false in production and wllama runs **single-threaded**.
A 2B model is correspondingly slow on weak hardware; that is a property of the
deployment, not of this fix.

## Licensing

wllama/llama.cpp are MIT (`COPYING-wllama.txt`); BitNet b1.58 2B-4T weights
are MIT (Microsoft Research). The self-test model is generated in-repo.

## Rebuild

```bash
node apps/offline-llm-bitnet/build.mjs   # packs site/apps/offline-llm-bitnet/offline-llm-bitnet.gif
node scripts/build-app-catalog.mjs       # refresh the store catalog
```
