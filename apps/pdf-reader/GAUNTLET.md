The PDF lives in the app, works on a plane, and one invite is follow-along — that is why you would use this instead of Firefox’s viewer or Acrobat.

## Bars

- **ONE:** Firefox’s built-in PDF viewer / Adobe Acrobat — pages, zoom, find, a real document on screen.
- **TWO:** the file is saved inside the GIF; nothing is uploaded; Invite shares the page and an optional pointer.

## Rounds

1. **Engine in the sandbox.** pdf.js 2.16 legacy, a fresh blob `PDFWorker` per open, `isEvalSupported: false`. Reusing `workerPort` after `destroy()` hung the second file.
2. **A document on first run.** Public-domain three-page “Paper Planes”, fill reset to black after the red header bar.
3. **Find, swipe, pinch, password.** Phone turns pages with a swipe; find lights matches; a locked file gets a box.
4. **Follow-along.** Host’s file is `read-only` for guests. Cursor (page + pointer) is `lead`-able. Last file is private. Point is a toggle so Find / select still work.
5. **Face.** Icon turns a page with a travelling highlight. Cover is page 2 mid-find with a pointer on the throw line.
6. **Open actually opens.** Fresh-eyes critic: `rate-table.pdf` left the spinner up, sample still on screen. Cause: reused `workerPort` after `destroy()`. Fix: a new `PDFWorker` per file, teardown capped at 1.5s, 15s timeout so a miss is an error not a hang. Sample fill reset to black.

## Remaining gap

CJK / CID fonts have no CMap pack, so those pages may show missing glyphs. Find matches inside a text run, not across a line-break. Print and a thumbnail rail are not here. Files over 8 MB open but are not kept in the app. Cover is still a pixel drawing, not a photograph of the running reader.
