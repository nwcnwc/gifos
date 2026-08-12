# Scanned PDF Tables → Excel

Drop any PDF — text **or scanned** — and get an `.xlsx` of its tables, one sheet
per page, entirely on the device. Built for SERFF insurance rate and rule
filings, which mix born-digital rate tables with scanned exhibits bound in from
a photocopier.

This is the GPU sibling of [`pdf-tables`](../pdf-tables). That app stays the
small, exact, text-only one (1.2 MB); this one is a superset that adds real OCR.

## What it does, per PAGE

The choice is made per page, not per document, because a mixed filing is the
common case — page 3 is a text rate table and page 4 is a photocopy of one.

| Page has… | Path | Fidelity |
| --- | --- | --- |
| a real text layer (≥ 8 runs) | pdf.js `getTextContent` → row/column clustering | **exact** — the numbers are read, not guessed |
| no text layer | render to canvas → OCR | a reading, reported as such |

Sheets are named `Page 3` or `Page 4 (OCR)`, so an OCR reading is never mistaken
for an exact one after the file leaves here.

## The OCR pipeline

Three ONNX models on ONNX Runtime over **WebGPU**, falling back to the CPU
(WebAssembly) where the device exposes no adapter. Which one actually ran is
reported on screen.

1. **Detection** — `en_PP-OCRv3_det` (DBNet, 2.4 MB) emits a per-pixel text
   probability map. Post-processing is plain JavaScript, because the sandbox has
   no OpenCV and no network to fetch one: threshold → connected components →
   convex hull → min-area rectangle by rotating calipers → "unclip" (grow the box
   back out, since DB shrinks its training targets).
2. **Recognition** — `en_PP-OCRv3_rec` (SVTR-LCNet, 9.0 MB) reads each crop at
   height 48; CTC greedy decode over 97 classes (blank + 95 `en_dict` entries +
   space).
3. **Table structure** — `en_ppstructure_mobile_v2.0_SLANet` (7.7 MB) sees the
   whole page at 488×488 and emits up to 501 steps of (30-way HTML token,
   4-value cell box). The `<tr>`/`<td>` stream lays out into a real grid with
   `colspan`/`rowspan`, and the recognized text is matched into cells by box
   overlap.

If the structure model finds no usable grid — a page of prose, a form, a table
whose rules it cannot see — the app falls back to clustering the OCR boxes by
position, which is the same algorithm the born-digital path uses. The preview
says which of the two produced the grid.

## Two things that will bite whoever touches this next

**The models cannot travel in the app document.** `buildAppHtml` inlines every
`<script src>` and rewrites any `src`/`href` naming a packed file into a `data:`
URL. Referencing the weights from `index.html` therefore put 54 MB of base64 into
a single `srcdoc` attribute, and the renderer **crashed** before a line of app
code ran (measured: `srcdocLen` 56,876,416, then the tab died). The models ride
under `.assets/` instead, where `gifos.assets(path)` hands them over as a
zero-copy `ArrayBuffer` transfer — same GIF, still no network, `srcdoc` back down
to 2.6 MB. `build.mjs` fails the build if `index.html` references a packed file
by `src`/`href`, so this cannot come back by accident.

**The structure dictionary is not the file on disk.** PaddleOCR's
`TableLabelDecode` rewrites it before indexing whenever
`merge_no_span_structure` is set, and this export's own `inference.yml` sets it:
`<td>` comes out, the merged `<td></td>` goes on the end. The class count is 30
either way, so getting it wrong is silent — every token past `<td>` resolves one
entry off, the model's perfectly good output decodes as fluent nonsense, and the
app quietly falls back to positional clustering with output that still looks
right on a simple table. `build.mjs` asserts the file is still the pre-merge
form, and the e2e requires the grid to come from the structure model.

## Build

```bash
node apps/pdf-tables-ocr/build.mjs      # -> site/apps/pdf-tables-ocr/pdf-tables-ocr.gif
node scripts/build-app-catalog.mjs      # refresh the store catalog
```

43.6 MB raw packs to a 27.9 MB app. Everything is in-GIF: pdf.js 2.16 (legacy
UMD — 4.x uses dynamic `import()`, which the sandbox CSP cannot load), SheetJS,
the ORT WebGPU bundle, the JSEP wasm, all three models and both dictionaries.
There is no asset pin and no network path at all.

The build asserts the **decoder contract** against the model files themselves, by
reading output shapes out of the ONNX protobuf: the recognition head must be 97
classes and the structure head 30, with a 4-wide box head. A model swapped for
one with a different vocabulary would otherwise decode into convincing garbage
instead of failing.

## Test

```bash
python3 -m http.server 8099 -d site
node test/browser/e2e-pdf-tables-ocr.js
```

Drives both fixtures through the real sandbox. `rate-table.pdf` must still be
read exactly — this app is a superset and that path must never regress — and
`rate-table-scanned.pdf` (the same table rasterized at 200 DPI and wrapped as a
DCTDecode image XObject: one page, no font, no text-showing operator) must come
back with all 12 cells, laid out by the structure model. It also asserts
`allow="webgpu"` is on the app iframe, since `capabilities.gpu` is one attribute
whose absence just means "silently slower".

A real scanned SERFF filing is the quality test this cannot be: a fixture with
known-correct expected text is the only way to assert cell-for-cell in a gate.

## Licences

pdf.js (Apache-2.0), SheetJS (Apache-2.0), ONNX Runtime (MIT), PaddleOCR models
and dictionaries (Apache-2.0) — full texts in `vendor/`, and all of them packed
into the GIF alongside the code.
