The book lives in the app, works on a plane, and one invite is follow-along — that is why you would use this instead of Apple Books, Koodo, or the epub.js demo.

## Bars

- **ONE:** Apple Books / Koodo / the epub.js demo — paginated type, contents, a real book on screen.
- **TWO:** the file is saved inside the GIF; nothing is uploaded; Invite shares the page and an optional pointer.

## Rounds

1. **Engine in the sandbox.** epub.js 0.3.93 Book + JSZip. Rendition's iframe is impossible (`frame-src 'none'`), so chapters paginate in a div with CSS columns; images are `data:` URLs; chapter CSS is inlined.
2. **A book on first run.** Public-domain four-spine “Paper Boats” so the empty drop zone is not the first impression.
3. **Contents, swipe, type size, find.** Phone turns pages with a swipe; Contents lists chapters; A− / A+ reflow; find lights matches in the chapter.
4. **Follow-along.** Host’s file is `read-only` for guests. Cursor (chapter + fraction + pointer) is `lead`-able. Last file is private. Point is a toggle so Find / select still work.
5. **Face.** Icon is an open book whose right page turns with a travelling highlight. Cover is chapter “The Water” mid-read, Contents open, pointer on “WHY IT GLIDES”.

## Remaining gap

Fixed-layout / pre-paginated EPUBs are treated as reflow. Embedded fonts become `data:` only when the chapter CSS names them; a book that relies on an obfuscated font will fall back to Georgia. Find is per-chapter, not whole-book. Files over 8 MB open but are not kept in the app.
