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

## Licensing

wllama/llama.cpp are MIT (`COPYING-wllama.txt`); BitNet b1.58 2B-4T weights
are MIT (Microsoft Research). The self-test model is generated in-repo.

## Rebuild

```bash
node apps/offline-llm-bitnet/build.mjs   # packs site/apps/offline-llm-bitnet/offline-llm-bitnet.gif
node scripts/build-app-catalog.mjs       # refresh the store catalog
```
