# Offline Cheap Text LLM Gemma 4

A **Provider app** (docs/providers.md) serving the computer's **Cheapest text
LLM** role — the **third** app to do so, alongside `offline-llm-bitnet` and
`offline-llm-gemma` (Gemma 3). Same engine, different brain. GifOS never
auto-assigns a role, so all three can be installed and swapped in
**Settings → AI models**.

| | this app | Gemma 3 sibling | BitNet sibling |
|---|---|---|---|
| weights | Gemma 4 E2B, QAT-mobile Q2_K_MIX | Gemma 3 1B Instruct, Q4_K_M | BitNet b1.58 2B-4T, TQ1_0 |
| download | 1,875,742,368 B (~1.75 GiB) | 806,058,240 B (~769 MiB) | 1,105,874,048 B (~1.03 GiB) |
| **licence** | **Apache-2.0** | Gemma Terms of Use | MIT |
| speed | slowest | **fastest** | middle |

**Pick this one for the licence; pick Gemma 3 for speed.** Apache-2.0 is a real
open-source licence with no use restrictions; Gemma 3's weights are not open
source. The cost is a download more than twice the size and noticeably slower
answers, because the engine runs single-threaded in the browser (GitHub Pages
cannot set COOP/COEP, so `crossOriginIsolated` is false — see the BitNet
README).

## The weights pin

```
url    https://huggingface.co/MonsieurTapir/gemma-4-E2B-it-qat-mobile-GGUF
       /resolve/main/gemma-4-E2B-it-qat-mobile-Q2_K_MIX.gguf
sha256 de2f55c97be54c774035fbb7ed7c37e56ad27d90a008cf30624b63e3738ae40f
bytes  1875742368
```

We host nothing; Hugging Face serves it anonymously with CORS.

### Why a 2-bit quant, and why this obscure repo

Because **nothing else fits.** wllama has a hard 2 GiB per-file ceiling and
GifOS enforces its own (`MAX_ASSET_BYTES`), and every mainstream Gemma 4 GGUF
is over it — **Google's own** `gemma-4-E2B-it-qat-q4_0-gguf` is 3.35 GB, and
the smallest `unsloth`/`ggml-org`/`lmstudio-community` build is 2.29 GB. A
sweep of 120 Gemma-4 GGUF repos turned up exactly one full model under the
ceiling: this one. (The other sub-2 GB hits are decoys — the `*-assistant` and
`dflash-*` files are speculative-decoding draft heads, not standalone models,
and one 0.54 GiB file is merely part 2 of a split.) No public split GGUF of
Gemma 4 exists, so the multi-part route — which wllama would support, since
`loadModel` takes an array of blobs — is not open either.

"E2B" is **effective** 2B: a MatFormer model whose file carries far more than
2B parameters (its BF16 is 9.3 GB), which is why even aggressive quants are
large.

What makes this file trustworthy despite the unknown author:

- it is a GGUF of **Google's own** `google/gemma-4-E2B-it-qat-mobile-transformers`
  checkpoint (verified to exist, Apache-2.0, ~12k downloads);
- the weights are **quantization-aware trained**, so a 2-bit mix is not the
  quality collapse a naive post-training Q2 would be. The card reports
  wikitext PPL 88.3 against the bf16 QAT reference's 80.6 (mean KLD 0.20), and
  mirrors the checkpoint's own per-module bit map: attention + layers 0–14 MLPs
  `Q4_0`, the 2-bit-trained modules `Q2_K`, per-layer gates `Q8_0`;
- **verified here before pinning**: loads in mainline llama.cpp b10333 and
  answers correctly — "3 apples, eat 1" → "2", the sky question → correct
  scattering answer, and a real 5-7-5 haiku, each `finish_reason: stop`;
- the sha256 above is of the exact hosted bytes, downloaded and hashed here.

Residual risk, stated plainly: a single-author repo with ~700 downloads could
disappear and break new installs. It can never serve *different* bytes — the
hash is enforced and a mismatch refuses the download.

## Prompt format — and why thinking is OFF

Gemma 4 does **not** use Gemma 3's `<start_of_turn>`. Its canonical template
renders (taken from llama.cpp's own `/apply-template`, not guessed):

```
<|turn>user
…<turn|>
<|turn>model
```

The default rendering also opens with a system turn holding `<|think|>`, which
switches on Gemma 4's reasoning mode. **This app deliberately runs without it**,
building the `enable_thinking=false` prompt instead. Two reasons, and token cost
is not one of them — the tokens are local and free:

1. **Time.** Single-threaded wasm means every reasoning token is wall-clock the
   user sits through.
2. **It can return nothing.** Measured here: a one-sentence question came back
   with **empty** content and `finish_reason: "length"`, because the thinking
   consumed the caller's entire `max_tokens` budget before any answer began.

`app.js` therefore formats the prompt itself and takes a RAW `createCompletion`
(which is also what the siblings do, to dodge llama.cpp's throwing PEG chat
parser).

## Rebuild

```bash
node apps/offline-llm-gemma4/build.mjs   # packs site/apps/offline-llm-gemma4/offline-llm-gemma4.gif
node scripts/build-app-catalog.mjs       # refresh the store catalog
```
