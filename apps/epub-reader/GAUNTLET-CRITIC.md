# EPUB Reader — gauntlet critic

Bar ONE: Apple Books, and the live [epub.js reader](https://futurepress.github.io/epubjs-reader/) (Moby-Dick). Bar TWO: the book lives in the GIF; Invite is follow-along. Distinct from bible (one corpus, verses) and pdf-reader (PDFs). Judged on the packed GIF in the real sandbox (`/?run=epub-reader` → `run.html#id=`), desktop 1280×800 and phone 390×844, Gutenberg *Alice* (137 KB, 14 spine items) opened through Open, store listing at `/store.html#app=epub-reader`, icon frames from `site/apps/epub-reader/epub-reader.gif`. One Chromium. Invite was not two-tabbed.

**Winner: COMP**

**Single biggest remaining gap:** A page is not a page. CSS columns + `translateX(pageI × paperWidth)` miss the column stride (JS sets `column-width` to `#paper.clientWidth`, padding shrinks the content box), so Next lands *between* columns. Packed GIF, Alice ch 3 page 5/6: left edge is the tail of the drink-me paragraph (`id Alice; “I must be shutting up like a telescope.”`), right edge is the *next* page, and the ASCII rabbit is torn down the middle. The same bleed is on Chapter III (1/8), Find `rabbit` (1/16), and the 390 phone (1/26). epub.js’s demo paints one clean Moby-Dick title page in an iframe. Apple Books never shows two pages mashed together. Until a page is a page, this is a demo of Paper Boats, not a reader.

**Stranger-reason:** I know Apple Books / the epub.js demo. I would open this one when the file is the book — close it on “The water”, reopen, still there — and when Invite puts a friend on the same page with nothing uploaded. That persist actually ran. I will not leave the demo, let alone Books, while turning a page tears the column.

**HARD WALL:** catalog index. `site/apps/epub-reader/{epub-reader.gif,app.json,cover.jpg}` exist (GIF 347 KB, signed as gifos.app). `site/apps/index.json` has 156 apps and does **not** list `epub-reader` (bible is there; pdf-reader is not). Store search for `epub` paints “Nothing matches that.” `#app=epub-reader` and `?run=epub-reader` still work. The grid — the face — is missing.

Held: no CDN / webfont / remote at load. Packed files are `vendor/epub.min.js` 0.3.93, `vendor/jszip.min.js` 3.10.1, sample, viewer, boot, net, touch. App-origin only. Manifest has no `network`. `COPYING-epubjs.txt` (FuturePress BSD) and `COPYING-jszip.txt` (MIT) ride in the GIF. `minBuild` 947. Invite is OS chrome (`#appinvite` 55px, no in-app Invite button). Last file is `gifos.db` `save` / `last`. Listing license BSD-2-Clause, unofficial, FuturePress / epub.js, porter GifOS.

---

## Face (always judged)

- **Icon (64px):** 12 frames, 100 ms. Dark sticker, open book, spine, cream pages, a gold highlight travelling down the right leaf, the right edge curling. At 64px it still reads “book.” The loop demonstrates a page turn, it does not wiggle. Comp has no Home Screen icon. Structural win. `?run=` files it in Stolen Apps.

- **Store art — COMP.** `screenshot.png` / `cover.jpg` is a 5×7 pixel poster: CONTENTS, THE WATER, a yellow run on “WHY IT GLIDES”, a gold pointer. Mid-use, no shell toolbar, `coverCrop.top` 0. The *idea* is right. The picture is a lie about the product. Live type is Georgia on cream; live Paper Boats is a title page with ornaments, not a toy ROM. Chess Grandmaster and Bible covers are photographs of the thing you get. This is the same drawing trick as pdf-reader’s “FOLDING A DART.” At card size the CONTENTS/POINT story still reads; at hero size it is a different app.

- **Listing copy — right shape, twin of pdf-reader.** Rendered on `/store.html#app=epub-reader`. Tagline *The book lives in the app. Invite a friend onto the same page — nothing is uploaded.* Description leads with close-it-come-back, then Invite, then swipe / Contents / A± / Find-in-the-chapter, then the sample, then unofficial-epub.js. That is how a port’s store page should read. Persist and “Find jumps to every match in the chapter” were true of this build. “Turn a page, they turn” was not two-tabbed here. The page is otherwise a clone of pdf-reader’s card with EPUB swapped for PDF — bible’s listing is a different product; this one is not, on the grid, if it were on the grid.

## Product

**A real EPUB paginates. Yes.** Gutenberg *Alice’s Adventures in Wonderland* (noimages, 137 KB) replaced Paper Boats in 452 ms through Open, in the packed GIF and in the unpacked viewer. Status: `Alice's Adventures in Wonderland · ch 1 of 14`. Spine 14. Cover JPEG inlined as `data:` and painted. Contents lists every chapter through the license. Chapter I is 6 pages in the GIF (7 unpacked, wider paper); Chapter III is 8; A+ three times makes Chapter IV 12; phone 390×844 makes it 26. Next walks 1/8 → 8/8 inside a chapter, then into the next spine item. That is not a fake pager on a four-page sample.

Then it loses, in order:

1. **The page tears.** See the gap. `#paper { flex: 1 1 auto; width: min(720px, …) }` also grows to the full iframe (1280×624 in the GIF, 1100×656 unpacked), so the “book” is a slab, not a page. Combined with the column-width/padding mismatch, you always see the next column. Apple Books’ page is a page. The epub.js demo’s iframe is a page.

2. **First-run is a pamphlet that does not turn.** Paper Boats is four short chapters. On the 1280 slab each is `1 / 1`. Next skips a chapter, not a page. A− / A+ to 22px finally made a chapter `1 / 2` — so the engine can split, the sample just never needs to. Apple Books still feels like pages on a short essay. Ours feels like a scrolled letter until you Open Alice.

3. **Find is a highlighter of this chapter.** `glide` on Paper Boats → `1 / 1`, the word (not the paragraph) lit gold. `rabbit` in Alice ch 6 → `1 / 16` marks. Next/Prev hop the marks. Comp (Books, the demo) searches the book. Listing is honest that it is “in the chapter.” Honest and not enough.

4. **No library, bookmarks, highlights, notes, dictionary, themes, two-page, page-curl, progress percent, whole-book search.** Apple Books is that suite. The epub.js demo still has TOC + bookmarks + settings + fullscreen around a clean page. We are a chip bar (Open / Contents / ‹ 5 / 6 › / A− A+ / Point / Find) over a cream div.

5. **Phone (390×844).** Chips wrap to two rows, Find bar is a third, paper 374×670, 26 pages of Chapter IV, next-page glyphs leaking off the right. Meet hint correctly hidden. Swipe is wired (`touch.js`, 60px / 700 ms). Usable. Not a phone reader. Books on an iPhone is the whole glass.

6. **Follow-along — chrome is there, the room was not two-tabbed.** OS Invite / Save / Help are real. Point is a toggle (`aria-pressed`, class `on`); hold painted the gold halo; Find/select still work when it is off. `lead` names `follow/cursor`. Guest path untested this run (box at load 18, one Chromium). Listing’s “they turn” is an unproven claim, not a wall break.

7. **Book in the GIF — OURS, and it held.** Next ×2 on Paper Boats landed `ch 3 of 4 · The water`. Reload of the same `run.html#id=` restored that chapter. Comp’s demo fetches Moby-Dick from the network and forgets you. Books keeps an iCloud library. Ours keeps the bytes in the icon, under 8 MB.

8. **Chapter CSS and images do arrive.** Alice cover painted. Headings came through brown from Gutenberg’s sheet (inlined, `url()` rewritten to `data:`). That is the engine working. It is also why Alice does not look like Paper Boats’ Georgia/ink, and why a book that needs an obfuscated font will fall back. Fixed-layout / pre-paginated not opened; treated as reflow per GAUNTLET.md.

Wasm consent is not in play. No worker. epub.js Book only — Rendition’s iframe is correctly refused (`frame-src 'none'`).

## Distinctness

bible is 139 translations and a verse apparatus. pdf-reader is pdf.js on a PDF. This Open’d a `.epub` and showed Alice’s cover. The *engine* is distinct. The *chrome* is pdf-reader with the file type swapped (same chip bar, same Point, same 8 MB, same pixel cover, same listing skeleton). A stranger browsing Utilities should not have to read the tagline twice to tell them apart — and right now they cannot browse this one at all.

## A/B

Put a stranger who knows Apple Books, or who has opened the epub.js Moby-Dick demo, in front of both.

Comp: one page of paper, the next page is the next page, Contents, a bookmark, the type is the book’s. Books adds a library, a curl, a highlight, a dictionary.

Ours: Paper Boats on a full-bleed slab; Open Alice and the cover is real; turn a page and you see two; close it and “The water” is still there; Invite sits in the bar above.

They will use the demo, or Books. The file-is-the-save is why they would come back *after* a page is a page, the cover is a photograph of that page, and the grid actually lists the app. Until then, COMP.
