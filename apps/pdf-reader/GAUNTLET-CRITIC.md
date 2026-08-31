# PDF Reader — fresh-eyes critic

Bar ONE: Firefox’s built-in PDF viewer (pdf.js, the actual upstream) / Adobe Acrobat. Bar TWO: GifOS (offline, state in the icon, one invite is follow-along, no account). Inspected the shipped GIF in the real sandbox (`run.html#id=`), desktop 1100×820 and phone 390×844, store listing at `/store.html#app=pdf-reader`, Home Screen at 64px. One Chromium.

**Winner: COMP**

**Single biggest remaining gap:** Open does not open a PDF. A 954-byte one-page Helvetica file (`test/fixtures/rate-table.pdf` — the same file the sibling PDF Tables app reads instantly) left the spinner up for ten-plus seconds, twice, with the bundled sample still on screen and no error. Until a stranger’s own file appears, this is a demo of a three-page note, not a reader, and Firefox/Acrobat win by default.

**Stranger-reason-to-use-this:** Invite a friend onto the same page — they get the file, they turn when you turn, Point puts a red dot on their copy — with nothing uploaded and no Adobe account. That path actually ran (guest landed on `paper-planes.pdf`, host Next moved both to page 2, meet line became “Host is reading with you”). I would not use it instead of Firefox until Open works and the page does not look like a failed render.

**Wall break:** none. Worker is a packed `blob:` (`GET blob:null/…` only). `cMapUrl` / `standardFontDataUrl` default to null — no Mozilla CDN. No `localStorage` in the app. Apache-2.0 notice is inside the GIF as `COPYING-pdfjs.txt`. `listing.license` is Apache-2.0. No wasm bytes fetched from the network.

---

## Icon

Home Screen, 64px, next to Camera / Meeting / Welcome.

A dark rounded sticker, a cream page, a red header bar, grey text lines. It reads “document” at a glance. The loop earns its keep: the right edge curls red (a page turning) and a gold highlight travels down the lines. That is Find + a page turn, not a wiggle.

Not a wow against the best stickers in this catalog (the dino, the chessboard). Fine. Not why this round loses.

## Store art

Listing hero is `cover.jpg` (from `screenshot.png`). Mid-use: page 2, Find on “GLIDE”, a yellow run, a red pointer on the throw line. The *idea* of the cover is right.

The picture is a lie about the product. It is pixel-font black type on cream (“FOLDING A DART”). The running app is Helvetica, and every glyph of the sample is **red**. Chess Grandmaster and Bible covers are photographs of the thing you get. Chrome Dino’s pixels are honest because the game is pixels. This cover looks like a toy ROM. At card size the FIND/POINT story still reads; at hero size it is a different app.

`coverCrop.top` is 0 — there is no GifOS shell in the frame, correct. The crop is not the problem. The drawing is.

## Listing copy

Rendered on `/store.html#app=pdf-reader`. Tagline: “The PDF stays in the app. Invite a friend onto the same page — nothing is uploaded.” Description leads with close-it-come-back, then Invite, then swipe/Find/password, then the sample, then the unofficial-pdf.js honesty. Porter/basedOn/blessed:false/Apache-2.0 all show. That is how a port’s store page should read, and the Invite claims are true of the build that shipped beside them.

The first verb is still “Open a PDF.” Open did not. An overclaim is a failed round, not a style note. 8 MB “kept in the app” is in Help, not on the card — fine as omission, not as a save.

Search on this store for `pdf` listed the two table extractors and not this app; `reader` painted “Nothing matches that.” The listing URL itself renders. Discoverability is at least a store-index smell; it is not the gap that decides the A/B.

## Product

First boot is the public-domain “Paper Planes” note. Pages 1–3, Width / Page / 100% / 209% zoom, Find `glide` → `3 / 4` then `4 / 4`, Point paints a red halo, Help is the real `help.md`. Keyboard and chrome exist. That surface is a reader.

Then it loses, in order:

1. **The sample is red.** Fill colour for the header bar is never reset to black, so body, italic, and footer all render 0.86 0.18 0.18. Firefox would show the same bytes as red too — we authored the first-run file that way. A stranger’s first impression is “the engine is broken.” The cover, with black type, contradicts the boot.

2. **Open hangs.** Spinner, sample stays, no status, no password sheet. Same 1-page Helvetica PDF the tables app consumes. Firefox opens it in a blink. A PDF reader that cannot take a second file is not competing with Acrobat.

3. **Find is a highlighter of whole text runs**, not of the word. `glide` lights the entire paragraph (and the title on another hop). Current vs other matches are a pale gold vs a pinker gold. No scroll-to-match (page 3’s diagram sat under the fold). Firefox finds the glyph.

4. **No sidebar, outline, thumbnails, print, rotate, forms, annotations, two-page, continuous scroll.** Firefox’s toolbar is the floor for a pdf.js port; “as good as” is losing. Acrobat is a suite on top of that. We are a pager with Find.

5. **Phone (390×844).** OS Invite/Save/Help/Abilities plus a wrapping two-row chip bar (Open / pager / zoom, then Point / Find). Letter page at fit-width is a small red block over a black desert. Meet hint is correctly hidden. Find bar is thumbable. Usable, not a phone reader.

6. **Offline.** In-session Next still turned the page with the network cut. Reload of `run.html` while offline did not remount (blank GifOS shell). “On a plane” is true of the already-running GIF, not of a refresh. State-in-the-icon was not re-proved after a clean relaunch in this pass.

7. **Follow-along works.** That is the only place we beat the bar. Guest received the host’s file; host Next moved both to page 2; Point is a real toggle (selection still possible when it is off). Communal/Leading is OS chrome, correctly not redrawn. Guest who Opens a different file is documented as local-only — untested here because Open hung.

8. **CJK / CID.** No CMap pack. Those pages will be tofu. Firefox ships CMaps. Not the biggest gap only because Open never got that far.

Wasm consent (“Run a compiled engine”) is the platform hatch for the blob worker, not a wall break. It is a confusing first sheet for a reader.

## A/B

Put a stranger who knows Firefox’s viewer in front of both.

Firefox: drop any PDF, thumbnails, outline, find the word, print, forms, it looks like paper.

Ours: a red sample, a spinner if they press Open, a pixel-art store card that does not match the window, and — if they stay — a genuinely new trick, one Invite, same page, a pointer, no upload.

They will use Firefox. The trick is why they would come back *after* Open paints their file in black ink, the cover is a photograph of that, and Find lights the word. Until then, COMP.
