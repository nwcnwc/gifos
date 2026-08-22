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

At `n_fft` 6144 it is 0.27 ms a transform, so about 0.3 s per chunk for both
directions and both channels — against the ~38 s the model itself takes for that
chunk in the browser (see the measurement below). Under 1% of the work: it is
not the bottleneck and was deliberately not optimised as if it were. (The
obvious trick — packing the two real channels into one complex transform, which
halves both directions — would buy about 0.4% and cost a second code path in
the one place a mistake is inaudible.)

## The models

Two, and only two, on purpose. Both pins are **optional**: they download when
you first run a job that needs them, not at install. The line is still one
model that does the split everyone wants, and one that does a job the first
cannot do at all. A third flagship vocal model would be a 67 MB quality knob
the user waits on the first time they pick it.

Knobs (overlap, denoise, invert-spec, frequency-cut residual) start at UVR's
shipped defaults. Segment size stays 256 — that is the ONNX input shape.

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

### The pin, and how it is checked — VERIFIED 2026-08-22

Both pins point at `huggingface.co/seanghay/uvr_models`, and both were verified
end to end on 2026-08-22 (on the pi, against the live host):

```
== inst-hq3.onnx
   PASS  CORS: Access-Control-Allow-Origin: *
   PASS  bytes: 66759214
   PASS  sha256: 317554b07fe1ea5279a77f2b1520a41ea4b93432560c4ffd08792c30fddf9adc
   PASS  UVR model hash: 55657dd70583b0fedfba5f67df11d711
== kara2.onnx
   PASS  CORS: Access-Control-Allow-Origin: *
   PASS  bytes: 52786726
   PASS  sha256: bf32e15105a09c0f7dddd2b67346146334d6f3ecb399ed7638eba2ab07cbf5f4
   PASS  UVR model hash: 1d64a6d2c30f709b8c9b4ce1366d96ee
```

Re-run it whenever a pin moves — it needs the network, which is why it is a
tool and not a gate suite:

```bash
python3 apps/vocal-remover/tools/verify-pins.py
```

It checks three things that fail differently, which is the reason it checks
them separately rather than just fetching and diffing:

- the **bytes** — sha256 and length, against the manifest;
- the **CORS header**, without which a browser cannot read the download at all
  even though the bytes are perfectly correct;
- the **UVR model hash** (md5 of the last 10 MB, `UVR.py get_model_hash`), which
  is the key into `model_data.json`. This is the one that earns its keep: a
  mirror can serve a file with the right *name* that is a re-export or a
  different revision, and then the sha256 catches it — but if somebody ever
  updates the pin to match such a file, only this check notices that
  `models.js` is now reading the wrong `n_fft`/`compensate` row. That failure
  does not crash; it just separates worse.

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
bundle's export shape — and rewrites two things in it: the ESM exports into a
`window.ort` global, and the WebGPU tensor upload off its mapped staging buffer
(see [what the GPU path does on a real phone](#what-the-gpu-path-does-on-a-real-phone)).
Both are guarded by assertions, so a vendor bump that moves either fails there
rather than in a player's browser.

## Speed, with the number actually measured

Separation is real work, and the number is worse than "a bit slow", so it is
written down here rather than rounded off in the copy.

**Measured, end to end, in the browser sandbox** (4-core VM, no GPU,
onnxruntime-web wasm, Inst HQ 3 with its frequency-cut pass):

```
12 s of audio  ->  155 s     ~13x realtime
```

For reference on the same box, the same model under Python's onnxruntime takes
7.7 s per 5.78 s chunk single-threaded (1.34× realtime) and 5.4 s on four
threads. So ORT-web's wasm is the expensive part, and it is single-threaded **by
construction**: `SharedArrayBuffer` needs cross-origin isolation, which an
opaque-origin app frame does not have, so `numThreads` above 1 only produces a
worker that fails.

So the honest statement, and the one the app makes, is **about ten times the
length of the track on the processor** — a four-minute song is most of an hour.
A faster desktop CPU will beat 13×; this box was also running the browser.

**WebGPU is not measured.** Headless Chromium here exposes no adapter, so the
GPU path has never been timed. MDX-Net is convolutions and ORT-web has WebGPU
kernels for all of them, so it should be much faster — but "much faster" is as
specific as anything here is allowed to be until somebody times it. The app
says which execution provider it got, and every estimate it shows is measured
live from its own first chunk rather than predicted, which is the part that
protects the user either way.

Alongside that: a Stop button that takes effect between chunks, and a "first 30
seconds" setting, so nobody commits an hour to find out whether they like the
result.

### What the GPU path does on a real phone

Chrome on Android, Inst HQ 3, dead at 1%:

```
Failed to execute 'createBuffer' on 'GPUDevice': createBuffer failed,
size (12582912) is too large for the implementation when mappedAtCreation == true
```

12,582,912 is not an arbitrary number: it is `4 × 3072 × 256 × 4` bytes — this
app's input tensor, uploaded once per chunk. ONNX Runtime Web stages every
CPU→GPU tensor through a buffer created with `mappedAtCreation: true`
(`GpuDataManager.upload()`), and Blink has to back that mapping with a shared
memory region allocated up front. There is exactly one such call site in the
whole bundle, and on a phone that allocation is a real thing to fail.

Taking it to a Moto G24 (Mali-G57, Bifrost, 4 GB, Chrome 151) turned up a
second failure underneath the first, and it was the worse of the two.

**One: the mapped staging buffer.** `build.mjs` rewrites that call site to fill
the staging buffer with `queue.writeBuffer`, whose staging chunks internally and
asks for no such region. The staging buffer and the encoder copy into the
tensor's storage buffer are both *kept*: that copy is what orders the upload
against the compute passes already recorded, and `writeBuffer` on its own would
run ahead of them. Writing into a buffer created one line earlier is safe to
reorder because nothing recorded before it can name it. Counted on the device by
wrapping `GPUDevice.prototype.createBuffer`, over one separation:

| | `createBuffer` calls | of those, `mappedAtCreation` | largest mapped |
|---|---|---|---|
| before | 543 | **221** | **12,582,912** |
| after | 543 | **0** | — |

The build asserts the site's shape and that no `mappedAtCreation` survives, so a
vendor bump fails there rather than on somebody's phone. `offline-tts-kokoro`
reads the same vendor bytes and is deliberately not patched — its tensors are a
few hundred KB and its results come back down the `mapAsync` path, which
allocates nothing at creation.

Worth knowing: on an **idle** Chrome that phone allocates a 12 MB
`mappedAtCreation` buffer without complaint (`maxBufferSize` is 256 MB there).
The original error came from a browser with 25 tabs open. It is memory pressure,
not a limit — which is exactly why it cannot be predicted and has to be removed.

**Two: the device dies, and nothing throws.** With the mapped buffers gone the
run got further and then hit the real ceiling. Session weights and activations
want a 160 MB buffer and a 128 MB buffer among the 543; a few hundred MB of GPU
allocation on a 4 GB phone loses the device outright:

```
Failed to execute 'mapAsync' on 'GPUBuffer':
A valid external Instance reference no longer exists.
```

The device loss itself is **not this app's doing and not the patch's** — the
unmodified build dies at the same point, in the same way. What matters is what
happened next, which is nothing at all. ORT's JSEP wraps `_OrtRun` in a global
marker cleared by `finally { Eb = null }`; a *clean* throw runs that finally and
the engine is reusable. A lost device is not clean — the operation never
returns, the marker stays set, and the wasm module stays suspended inside
Asyncify with nothing coming to resume it. Every promise ORT is holding simply
never settles. **The app sat on "Loading UVR-MDX-NET Inst HQ 3…" for as long as
anyone was willing to watch it**, with no error, no fallback, and 688% idle CPU.
The rescue session meant to catch it dies too, on `Session already started`.

So `app.js` watches for it and *restarts* rather than retrying, which is the
only thing that gets a working engine back:

- the device's own `lost` promise is the honest signal, and ORT publishes the
  device on `env.webgpu.device` as soon as its backend initialises — before the
  work that kills it — so it can be watched while the call that triggered it is
  still pending;
- a timeout is the backstop, for a driver that wedges without declaring a loss;
- either one reloads the frame for a fresh engine with the GPU switched off,
  remembered per computer, and says why on the way back in. A **Try the GPU
  again** button hands it back, because a driver update or a phone that was
  merely out of memory that day deserves another go.

Measured on the same phone, same track: **31 seconds** from pressing Separate to
the app having noticed, restarted itself and offered to carry on — against
indefinitely, before. The run that followed finished: 30 s of a real song into
Vocals and Instrumental, 5.3 MB each, in 18 minutes.

The ordinary create-time failure (an op with no GPU kernel) still throws
cleanly, so that one is still handled where it always was — in place, no
restart.

### Speed on a phone is worse than the headline

That 18 minutes is the other number worth writing down. 30 s of audio in 1088 s
is **~36× realtime** on the G24's CPU — nearly three times the 13× measured on
the 4-core VM above. A four-minute song on that phone is not "most of an hour",
it is closer to two and a half. The app's live estimate is measured from its own
first chunk and said "about 16 min left" within three minutes, so nobody is
misled for long; the static copy has been softened to match.

**Still not measured: a GPU path that survives.** No box here has a WebGPU
adapter at all — headless Chromium exposes none even with `--enable-unsafe-webgpu`
and a SwiftShader adapter forced — and the one real device to hand loses its
device to this model. So there is still no honest number for how fast MDX-Net
separates on a GPU, only the knowledge that a 4 GB phone is not where it will be
taken.

## Does it actually separate?

Yes, and to the same numbers as the Python original. A 12 s synthetic mix
(chords + bass + hats under a formant-shaped, vibrato'd melody) was separated
twice: once by `tools/mdx_ref.py` under Python's onnxruntime, once by the built
GIF in the sandbox. Correlation of each stem against the parts that went into
the mix:

| | reference (Python) | this app (browser) |
|---|---|---|
| Instrumental vs true instrumental | 0.875 | 0.875 |
| Instrumental vs true vocal | 0.275 | 0.272 |
| Vocals vs true vocal | 0.828 | 0.828 |
| Vocals vs true instrumental | 0.008 | 0.008 |

(the mix itself scores 0.714 / 0.701, so the separation is doing real work; the
0.275/0.272 gap is stereo-vs-left-channel in how the two were measured.)

That run is not in the gate — it needs the 120 MB of weights — but it is
reproducible: serve the two `.onnx` files from `site/`, point a throwaway build's
asset pins at them origin-relative, and run it.

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
