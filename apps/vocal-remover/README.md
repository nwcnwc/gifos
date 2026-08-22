# Vocal Remover

**Ultimate Vocal Remover**'s MDX-Net separation path, transcribed to JavaScript
and run entirely inside a GifOS app sandbox. Hand it a song, get the vocal and
the backing as separate WAVs; ask for more and the karaoke model splits the
vocal again into lead and backing.

Upstream: [ultimatevocalremovergui](https://github.com/Anjok07/ultimatevocalremovergui)
by Anjok07 and aufr33, MIT. Licence and the credit it asks for:
[`COPYING-uvr.txt`](COPYING-uvr.txt), which rides **inside** the GIF.

## What was ported, exactly

| upstream | here |
|---|---|
| `separate.py` → `SeperateMDX.demix` / `.run_model` / `.initialize_model_settings` | `mdx.js` `demix()` |
| `lib_v5/tfc_tdf_v3.py` → `class STFT` (forward + inverse) | `mdx.js` `chunkToTensor` / `tensorToChunk` |
| `gui_data/constants.py` → `DEFAULT_DATA` | the settings it runs at (below) |
| `models/MDX_Net_Models/model_data/model_data.json` | `models.js`, recorded in `MODEL-PINS.json` |

It runs at UVR's **shipped defaults**, and those defaults are load-bearing:

- `overlap_mdx` is `"Default"`, which in `demix()` means
  `step = chunk_size - n_fft` — not a fraction of the chunk. A 4-minute track is
  ~31 model chunks, not 120.
- `mdx_segment_size` 256, `mdx_batch_size` 1.
- `is_denoise` off (so one model call per chunk, not the `-model(-x)/2 + model(x)/2` pair).
- `is_invert_spec` off, so the secondary stem is a plain subtraction.
- **`is_match_frequency_pitch` ON**, which is the one people miss. The main
  model's primary stem is `Instrumental`, which is in `MDX_NET_FREQ_CUT`, so the
  Vocals stem is `demix(mix, is_match_mix=True) - primary` — the mix **put
  through the same STFT/iSTFT with no model in it**, so the residual does not
  hand back the band above `dim_f` that the model never saw. That second pass
  runs at a fixed 256-frame segment whatever the model's segment size is
  (`chunk_size = self.hop * (256-1)`, hardcoded in `demix`).

**Not ported:** the VR Architecture and Demucs paths, MDX23C, ensembles,
secondary models, denoise/deverb, pitch shifting, and the desktop GUI.

## Why there is an FFT in here

None of UVR's `n_fft` values is a power of two:

```
5120 = 2^10 · 5      6144 = 2^11 · 3      7680 = 2^9 · 3 · 5
```

so a radix-2 butterfly cannot transform any of them, and Bluestein would cost
three padded transforms per frame. `fft.js` splits by the odd factor once
(decimation in time), runs radix-2 on the power-of-two part, and combines:
`X[k] = Σ_r W_N^(rk) · X_r[k mod P]`. Twiddles come from a table, not from an
accumulated recurrence — the recurrence has drifted noticeably by the time it
has walked 3072 butterflies, and a spectrogram is not somewhere a slow phase
error announces itself.

At `n_fft` 6144 it is 0.27 ms a transform, about 0.3 s per chunk for both
directions and both channels — against 10–20 s of model inference for the same
chunk. It is not the bottleneck and was not optimised as if it were.

## The models

Two, and only two, on purpose. The asset tier downloads **every** pinned asset
at install (the sandbox has no network of its own, so there is no "fetch that
one if the user picks it"), which makes each extra model a mandatory download
for everybody. The line drawn was: one that does the split everyone wants, and
one that does a job the first cannot do at all. A third flagship vocal model
would have been a 67 MB quality knob.

| | UVR-MDX-NET Inst HQ 3 | UVR-MDX-NET Karaoke 2 |
|---|---|---|
| bytes | 66,759,214 | 52,786,726 |
| sha256 | `317554b0…dddf9adc` | `bf32e151…07cbf5f4` |
| UVR hash | `55657dd70583b0fedfba5f67df11d711` | `1d64a6d2c30f709b8c9b4ce1366d96ee` |
| n_fft / dim_f / compensate | 6144 / 3072 / 1.022 | 5120 / 2048 / 1.065 |
| stems | Instrumental (primary), Vocals | **Backing** Vocals (primary), Lead Vocals |
| frequency cut | yes | no |

The karaoke model's primary output being the **backing** side is not a guess:
its `primary_stem` in `model_data.json` is `Instrumental` (not `Vocals`), and
`UVR.py` turns that into `BV_VOCAL_STEM` —
`primary = LEAD_VOCAL_STEM if primary_stem_native == VOCAL_STEM else BV_VOCAL_STEM`.
Its stem is also not in `MDX_NET_FREQ_CUT`, so no match-mix pass runs for it.

### ⚠ The pin needs one verification this session could not do

The sha256s above are computed from the **authoritative UVR release bytes**,
downloaded and hashed here, and cross-checked against `model_data.json` through
UVR's own model hash. What could *not* be checked is the **host**: the session
that wrote this app had `huggingface.co` blocked by policy (403 at the egress
proxy), so the mirror the manifest points at could not be confirmed to serve
those exact bytes.

Run this on any machine that can reach it, before the app ships:

```bash
python3 apps/vocal-remover/tools/verify-pins.py
```

It checks all three things that can be wrong, and they fail differently:
the **bytes** (sha256 + length), the **CORS header** without which a browser
cannot read the download at all, and the **UVR model hash**, which is what
catches a mirror serving a re-export or a different revision — same name, same
job, different `n_fft`/`compensate`, and the app would run it at the wrong
settings and merely sound worse.

GitHub's own release URLs are not an option, and this is worth writing down
because it looks like it should work: `github.com/TRvlvr/model_repo/releases/
download/…` sends **no `Access-Control-Allow-Origin`** on either hop, so the OS
fetch is refused by the browser before a byte arrives.

## What rides where

| piece | size | where |
|---|---|---|
| the two UVR models | 120 MB | **asset pin** |
| onnxruntime-web (WebGPU bundle + JSEP wasm) | ~22 MB raw | in-GIF |
| the app + the ported pipeline | ~60 KB | in-GIF |
| self-test model | 4 KB | in-GIF |

Built GIF: **~12.5 MB**.

The ORT bytes are read from `apps/offline-tts-kokoro/vendor/` at build time
rather than copied. That app exists *because* it needs the WebGPU-capable JSEP
pairing; this one needs exactly the same pairing, and a private copy would be
22 MB twice in every clone and two versions that drift. `build.mjs` asserts the
bundle's export shape, so a vendor bump that changes it fails there rather than
in a player's browser.

## Speed, said plainly

Separation is real work. Measured single-threaded on this box's CPU, one 5.78 s
chunk of Inst HQ 3 takes 7.7 s natively; ORT-web's wasm is slower still, and it
is single-threaded by construction (`SharedArrayBuffer` needs cross-origin
isolation, which an opaque-origin app frame does not have). On WebGPU it is far
faster. So:

- **with a GPU**: roughly the length of the track.
- **on the processor**: several times the length of the track.

The app says which one it is on, measures a real ETA from the first chunk, has
a Stop button, and offers "first 30 seconds" so nobody commits a quarter of an
hour to find out whether they like the result.

Memory is the other honest limit. Everything is float32 (as UVR has it), but a
4-minute stereo track still means a ~60 MB array several times over, plus the
ONNX session. Desktop is fine; a phone on a long track is not guaranteed.

## How it is guarded

This is the shape of port that fails **quietly**. A reflect pad that repeats the
edge, `np.hanning` swapped for `torch.hann_window` (UVR uses both, one line
apart in `demix`), a transposed real/imag plane — every one of those still
produces audio, just worse. Nobody A/Bs a four-minute stem. So:

**`test/unit/vocal-remover.js`** — the arithmetic, against a numpy reference
(`tools/mdx_ref.py`) transcribed from UVR line by line. Five chunking cases
(radix 3, 5 and 15; a `T` that divides `gen_size` exactly; a final chunk short
enough to leave a hole in `divider`; the real 6144/1024 geometry; the match-mix
path), every sample matching to float32 precision. Plus the FFT against a naive
DFT, the two windows being genuinely different arrays, `reflectPad` against
numpy's documented output, an STFT→tensor→iSTFT round-trip, the model tables
against `MODEL-PINS.json`, and the WAV writer.

**`tools/check-torch.py`** — holds `mdx_ref.py` itself to **torch's** `stft` /
`istft`. Without it the JS could match the reference perfectly and both be
wrong together. Not in the gate (torch is ~900 MB); run it whenever `mdx_ref.py`
is touched, then re-run `gen-fixture.py`.

**`test/browser/e2e-vocal-remover.js`** — the real GIF in the real sandbox. The
in-GIF self-test model is an **identity** of the same `[1,4,dim_f,256]` shape,
which makes the whole pipeline assertable by arithmetic: feed it a 440 Hz tone
and the pass-through stem must come back *as that tone*, sample-aligned and at
the same level (measured: correlation 0.9999992, rms 0.35355 against a
theoretical 0.35355), while the residual — the frequency-cut mix minus it —
must come back at −95 dBFS. It also counts the app frame's network requests:
**zero**.

The 120 MB of real weights are deliberately **not** downloaded in the gate. A
suite that needs a third-party host to be up goes red for reasons that have
nothing to do with the code. Pin health is `verify-pins.py`, out of band.

## The self-test model

`vendor/selftest.onnx` (4 KB, `tools/make-selftest-model.py`) is a `Mul` by a
broadcast row of ones — a real kernel over a real `4 × 1024 × 256` tensor, not
an `Identity` that ORT would fold away. When the pinned weights are not on the
computer the app runs this instead, shows a banner saying so, and names its
output `Pass-through` / `Residual`. It is never presented as separation, and the
store listing does not mention it as a feature.

## Build

```bash
python3 apps/vocal-remover/tools/make-selftest-model.py   # only if it is missing
node apps/vocal-remover/build.mjs                         # → site/apps/vocal-remover/vocal-remover.gif
node scripts/build-app-catalog.mjs                        # refresh the store catalog
node apps/vocal-remover/tools/shoot.js                    # regenerate screenshot.png
```

Regenerating the unit fixture (only when `mdx_ref.py` changes):

```bash
python3 apps/vocal-remover/tools/check-torch.py           # needs torch
python3 apps/vocal-remover/tools/gen-fixture.py
```
