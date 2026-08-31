# PDF Reader

A PDF viewer for GifOS. Mozilla's **[pdf.js](https://github.com/mozilla/pdf.js)**
(Apache-2.0, the 2.16 legacy UMD build) is the engine; this directory is the
GifOS surface around it: the file lives in `gifos.db`, first-run ships a short
public-domain sample, and Invite is follow-along (shared page + optional pointer).
Nothing is uploaded.

pdf-tables extracts tables. pdf-tables-ocr OCRs. tesseract is OCR. This is the
reader.

```
index.html      chrome, stage, find bar
style.css       dark shell, white paper, phone layout
vendor/         pdf.js 2.16 legacy + Apache-2.0 notice (never fetched)
viewer.js       open / render / zoom / search / password
net.js          save + follow-along (doc + cursor)
touch.js        swipe pages, pinch zoom
boot.js         mount, keys, Back, wiring
sample.mjs      public-domain 3-page sample, packed as sample.js
icon.mjs        turning-page sticker + 1200×720 cover
build.mjs       packs site/apps/pdf-reader/pdf-reader.gif
```

## Why 2.16, not 4.x

4.x uses dynamic `import()`, and the app CSP has no `blob:` in `script-src`.
2.16 is classic scripts. The app runs it with **`isEvalSupported: false`** so
its `new Function`/`eval` fast-paths (which the CSP forbids) are never taken,
and hands pdf.js a **real `Worker` built from a `blob:` URL** via `workerPort`
— `worker-src blob:` is the `capabilities.wasm` hatch. Setting only `workerSrc`
would send pdf.js down its fake-worker path, which injects a `<script src="blob:">`
that `script-src` refuses. Same recipe as `apps/pdf-tables`.

## capabilities

| capability | why |
|---|---|
| `db` | Last file + page in a `private` collection; the shared PDF in a `read-only` one the host writes; the follow cursor in a `read-write` one. |
| `wasm` | Blob worker for pdf.js. No `.wasm` file; the hatch is the worker. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

`lead` names the follow cursor so the host can flip communal / leading in the OS
chrome. Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/pdf-reader/build.mjs   # -> site/apps/pdf-reader/pdf-reader.gif
```

## Licence

Apache-2.0 (pdf.js). The notice is packed **inside the GIF** as
`COPYING-pdfjs.txt` as well as living in `vendor/`.
