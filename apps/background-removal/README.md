# Background Removal

Cut a photo’s background on this device with IMG.LY’s in-browser IS-Net.
Nothing is uploaded. The last picture and the last cut live in the file.

An unofficial port of
**[@imgly/background-removal](https://github.com/imgly/background-removal-js)**
1.7.0 by IMG.LY GmbH (AGPL-3.0). The inference path in `engine.js` is a
classic-script transcription of `packages/web/src/inference.ts` +
`utils.ts` (resolution 1024, mean 128, std 256, keepAspect false). The
ONNX weights are IMG.LY’s `bundle/models` files, hash-pinned.

```
index.html      empty state, stage, colour chips, model picker
style.css       dark chrome, checkerboard stage, fat phone sliders
engine.js       IS-Net cut + composite (feather, shadow, invert)
models.js       small / medium / large → gifos.assets paths
app.js          gifos.db, takePhoto clip, download PNG/JPEG
icon.mjs        procedural cut-out icon + 1200×720 cover
build.mjs       packs the GIF; ORT from offline-tts-kokoro/vendor
MODEL-PINS.json exact bytes + GitHub media URLs
COPYING.txt     AGPL-3.0, packed inside the GIF
```

## capabilities

| capability | why |
|---|---|
| `db` | Last settings, last picture, last cut. Private. |
| `camera` | `gifos.takePhoto` for a still. Never a live stream. |
| `wasm` | ONNX Runtime Web, wasm bytes inlined. |
| `gpu` | WebGPU when the device has a real adapter. |

`minBuild` is **1381**: optional asset pins (the three models download
only when that size is first used) plus `capabilities.gpu` (1250).

## Building

```bash
node apps/background-removal/build.mjs   # -> site/apps/background-removal/background-removal.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree. Do not sign here.

## Licence

@imgly/background-removal is AGPL-3.0, IMG.LY GmbH. The notice is packed
**inside the GIF** as `COPYING.txt`. ONNX Runtime Web is MIT (Microsoft);
`LICENSE-onnxruntime.txt` rides beside it.
