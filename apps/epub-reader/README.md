# EPUB Reader

An ebook reader for GifOS. FuturePress's **[epub.js](https://github.com/futurepress/epub.js)**
(BSD-2-Clause, 0.3.93) parses the book; this directory is the GifOS surface
around it: the file lives in `gifos.db`, first-run ships a short public-domain
sample, and Invite is follow-along (shared page + optional pointer). Nothing
is uploaded.

bible is one book. tesseract is OCR. pdf-reader is PDFs. This is the EPUB
reader.

```
index.html      chrome, paper, contents, find bar
style.css       dark shell, cream paper, phone layout
vendor/         epub.js 0.3.93 + JSZip 3.10.1 + licences (never fetched)
viewer.js       open / paginate / font / search  (div, not iframe)
net.js          save + follow-along (doc + cursor)
touch.js        swipe pages
boot.js         mount, keys, Back, wiring
sample.mjs      public-domain "Paper Boats" EPUB, packed as sample.js
icon.mjs        turning-page sticker + 1200×720 cover
build.mjs       packs site/apps/epub-reader/epub-reader.gif
```

## Why a div, not Rendition

epub.js Rendition paints each chapter in an iframe. The GifOS app CSP has
`frame-src 'none'` and the sandbox is opaque, so those frames never load and
`contentDocument` is unreachable. The app uses **Book / Archive / Navigation /
CFI** from the same library and paginates the chapter HTML with CSS columns
in a div. Images become `data:` URLs; chapter CSS is inlined — no blob fetch,
no network.

JSZip is a classic script loaded first (epub.js UMD expects `window.JSZip`).

## capabilities

| capability | why |
|---|---|
| `db` | Last file + page in a `private` collection; the shared EPUB in a `read-only` one the host writes; the follow cursor in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

`lead` names the follow cursor so the host can flip communal / leading in the OS
chrome. Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/epub-reader/build.mjs   # -> site/apps/epub-reader/epub-reader.gif
```

## Licence

BSD-2-Clause (epub.js) and MIT (JSZip). Both notices are packed **inside the GIF**
as `COPYING-epubjs.txt` and `COPYING-jszip.txt`.
