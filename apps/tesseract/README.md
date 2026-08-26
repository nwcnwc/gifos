# Tesseract OCR

A photo or a page in, the words out. Unofficial port of
[Tesseract.js](https://github.com/naptha/tesseract.js) (naptha, Apache-2.0): the
Tesseract OCR engine compiled to WebAssembly, running entirely inside a GifOS
app sandbox. **Not** a table tool — that is
[`pdf-tables-ocr`](../pdf-tables-ocr), which recovers a spreadsheet grid.

## What rides where

| | where | bytes |
|---|---|---|
| Tesseract WASM (SIMD, LSTM-only) + glue | **in the GIF** under `.assets/` | 2.86 MB wasm |
| English (`tessdata_best`) | **optional** `gifos.assets` pin | 15,400,601 |
| OSD / other languages | not shipped | — |

The GIF stays small on purpose. English downloads the first time you read a
page, hash-verified by GifOS, and then lives on this device. The app has no
network of its own (`connect-src` is blob/data only, for the wasm hatch).

OSD is not here: orientation-and-script detection is a Legacy-engine feature,
and the Legacy core is a second wasm we chose not to carry. Crooked pages still
straighten from detected text lines (`FindLines` / `GetGradient`).

## Engine

Vendored `tesseract.js-core` **7.0.0**, the WASM Tesseract.js 7.0.0 loads:

- `vendor/tesseract-core-simd-lstm.js` — Emscripten glue (classic script)
- `vendor/tesseract-core-simd-lstm.wasm` — the engine

Instantiated from bytes via `Module.instantiateWasm` inside a blob worker
(`worker-src blob:`). The glue's `fetch` / `XMLHttpRequest` paths are never
taken. Pins and hashes: [`vendor/UPSTREAM.txt`](vendor/UPSTREAM.txt),
[`LANG-PINS.json`](LANG-PINS.json).

English is `tesseract-ocr/tessdata_best` at commit `9ddc24e`, LSTM-only, which
matches this core. The 8 MB asset-pin floor is why tessdata_fast (too small)
is not a pin, and why English is not packed in the GIF (the whole point of
the pin is that a shared GIF stays slim).

## Build

```bash
node apps/tesseract/vendor.mjs     # only when the core pin moves (needs net)
node apps/tesseract/build.mjs      # -> site/apps/tesseract/tesseract.gif
```

Do **not** run `scripts/build-app-catalog.mjs` from this work — the catalog
index is shared. `build.mjs` writes `site/apps/tesseract/{tesseract.gif,app.json}`
and expects `cover.jpg` beside them (from `screenshot.png`).

Not signed in this environment (no private key) — sign via `site/sign.html`
and re-commit the GIF to light the badge.

## capabilities

| capability | why |
|---|---|
| `wasm` | Instantiate the engine; blob worker so a page does not freeze the UI. |
| `db` | Last layout-mode / auto-straighten in `prefs`; recent readings in `history`. Both private. |

`minBuild` **1381** — optional assets. An older runtime would fetch every pin
on boot.

## Licences

Apache-2.0 for Tesseract OCR, tesseract.js, tesseract.js-core, and
tessdata_best. Full text in [`COPYING-tesseract.txt`](COPYING-tesseract.txt),
packed inside the GIF.
