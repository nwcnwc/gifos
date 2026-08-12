# PDF Tables → Excel

Drop a **born-digital** PDF, get an `.xlsx` of its tables — one sheet per page —
entirely in the app sandbox, with **no network access**. Built for **SERFF**
insurance rate/rule filings (the ones the `serff-scraper` project pulls), which
are exported from actuarial software, so their tables are real text with real
positions and can be reconstructed **exactly** — no OCR, no guessing.

## How it works

```
PDF bytes -> pdf.js getTextContent (each run's x/y/width)
          -> cluster runs into rows (by y) and columns (by recurring left-x)
          -> 2-D grid per page
          -> SheetJS workbook (one sheet per page) -> .xlsx
```

The row/column reconstruction (`app.js`) derives its tolerances from the
document's own median glyph height and width, so it scales with the filing's
font size rather than a magic constant. A **scanned** (image-only) PDF has no
text runs — the app says so plainly instead of exporting an empty sheet.

## Why these library choices (the sandbox constraints)

Everything rides **in the GIF** — no asset pin, no network:

- **pdf.js 2.16 legacy** (Apache-2.0), NOT 4.x. 4.x uses dynamic `import()`, and
  the app CSP has no `blob:`/host in `script-src`, so it cannot load. 2.16 is
  classic scripts. The app runs it with **`isEvalSupported: false`** so its
  `new Function`/`eval` fast-paths (which the CSP also forbids) are never taken,
  and hands pdf.js a **real `Worker` built from a `blob:` URL** via `workerPort`
  — `worker-src blob:` is exactly what `capabilities.wasm` opens, and doing it
  ourselves avoids pdf.js's fake-worker path, which tries to load the worker as
  a `<script>` (blocked by `script-src`).
- **SheetJS** (`xlsx`, Apache-2.0), pure JS — writes the real `.xlsx`.

So the app declares only `capabilities.wasm` (for the blob worker) — no network,
no assets, no GPU. The PDF you drop and the Excel that comes out never leave the
browser.

## Scope

Phase one: **born-digital** PDFs — the large majority of SERFF filings, read
exactly. A **scanned** page needs OCR; that path is a separate build on top of
`capabilities.gpu` (WebGPU document OCR → table structure → SheetJS) and reports
"scanned" for now. Merged/nested cells are reconstructed as an aligned grid, not
a spanning layout.

## Build & test

```bash
node apps/pdf-tables/build.mjs        # → site/apps/pdf-tables/pdf-tables.gif (~1.25 MB)
node scripts/build-app-catalog.mjs    # refresh the store catalog
node test/browser/e2e-pdf-tables.js   # mounts the GIF, drops test/fixtures/rate-table.pdf,
                                      # checks the extracted grid + a round-tripped .xlsx
```

`e2e-pdf-tables.js` is the guard: it proves pdf.js loads and runs under the app
CSP (the CSP-compatible recipe above), the grid reconstruction is exact, and
SheetJS serialises a real workbook — all in the sandbox.

## Licences

- **pdf.js** — Apache-2.0 (`vendor/LICENSE-pdfjs.txt`).
- **SheetJS (xlsx)** — Apache-2.0 (`vendor/LICENSE-sheetjs.txt`).
