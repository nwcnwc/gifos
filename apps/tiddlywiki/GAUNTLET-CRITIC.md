# Gauntlet critic — TiddlyWiki

Bar ONE is tiddlywiki.com / TiddlyWiki 5.4.1 (the empty HTML file). Bar TWO is GifOS (the file is the save; Invite is a shared wiki; offline). This is a port, so “as good as” is losing.

**Winner: COMP**

A stranger who knows the original can say why this copy *should* win. They cannot yet *use* it as a notebook without walking into a red modal.

## Winner

**COMP.** The original’s plus button opens a tiddler and you type. This copy boots, persists through `gifos.db`, and Invite actually syncs tiddlers — then the first real write from the UI throws:

`Uncaught SecurityError: Failed to read a named property 'document' from 'Window': Blocked a frame with origin "null" from accessing a cross-origin frame.`

A red “Internal JavaScript Error” sheet covers the editor (“restart TiddlyWiki by refreshing your browser”, plus “download tiddlers as json”). GettingStarted tells you to press plus. Plus is what a stranger will press. That path is broken in the GifOS sandbox. The original does not do this.

Platform wins below are real. They do not outweigh a broken write.

## Pieces

### Icon — OURS

Stacked cream cards on a dark rounded tile; a third card slides in and ink lines draw. At 64px it reads as a notebook, not a generic wobble, and the loop earns the frames. On a Home Screen next to the seeded emoji icons it is the only “pages” glyph — glanceable, a little generic (could be any notes app), but honest.

### Cover — COMP

`screenshot.png` / `cover.jpg` is a pixel mock, not the running app.

- Real app: vanilla/snowwhite, **sidebar on the right**, white tiddler cards, navy titles, actual GettingStarted sentences.
- Cover: dark Nord-ish chrome, **sidebar on the left**, “TOMATO NOTES” / “PACKING LIST”, body text as grey bars, `GETTINGSTARTED` with no space.

Judged at listing-hero and phone-hero: it is a wireframe of a wiki, not mid-use with real content. tiddlywiki.com’s HelloThere is full of sentences. Even other catalog pixel covers (Nullboard, JS Paint) put readable words in the frame. This one does not. A stranger opening the listing and then the app will think they installed a different product.

### Listing — OURS on copy, COMP on presence

Rendered at `store.html#app=tiddlywiki`:

- Tagline: “The wiki is the GIF — close it, hand it over, or invite someone in.” Sells the reason in one card line.
- Description leads with file-is-the-wiki and Invite; names the download dance and that it is gone; credits Jeremy Ruston & UnaMesa; `Unofficial port` pill; `blessed: false`; license BSD-3-Clause with the copyright line.
- That is how a port listing should read, and it is better than tiddlywiki.com’s philosophy lede at doing the *this-version* job.

Soft overclaims, judged against the build it sits beside:

- “the dance is gone” — HTML download did not fire, but the **red unsaved Save** in the wiki’s page controls is visible on first boot, before the user has typed anything.
- “On a phone the sidebar tucks away” — not what 390×844 measured (sidebar `display:block`, width 390).
- “Core plugins to actually write notes” — Markdown is in the GIF; the plus-button write path throws.

The store **grid** does not list it. `site/apps/index.json` has 156 apps and zero `tiddlywiki`. Search for “tiddlywiki” renders “Nothing matches that.” Deep link works; browsing the store does not. A listing the grid cannot find is not a listing.

### Actually writing tiddlers — COMP

- Empty wiki boots. GettingStarted and HelloThere paint. Plus is labelled “Create a new tiddler”.
- `wiki.addTiddler` from inside the frame works: “Gauntlet Note” landed in `gifos.db('tiddlers')` and survived reload.
- Pressing plus (in-page click, same handler a finger uses) opens a draft **and** the SecurityError modal. Typing into that editor then hits `Cannot read properties of undefined (reading 'setText')`. The leftover `Draft of 'New Tiddler' by Ada` persists and, worse, **rides Invite to the guest**.
- Markdown was not observed rendering; the error sheet was still up.

The original: plus, title, body, tick. This copy: plus, red sheet. COMP.

### Save-in-GIF (no download-html dance) — OURS on the pipe, COMP on the chrome

- No download event fired while writing, reloading, or hitting in-wiki Save.
- A no-op saver is installed; a “Saved wiki” toast can appear without a file landing in Downloads.
- `gifos.db` held “Gauntlet Note” across a full `run.html` reload. Close it, it is still there. That is the thesis, and it works.
- The red Save in `.tc-page-controls` is still **visible** (the hide tiddler is in the store; the button is on screen anyway), already dirty at first boot — likely `$:/status/UserName` from `gifos.me()` marking the wiki dirty against HTML that this port never rewrites. A TW user reads that as “you have not saved.” The dance is gone; the **tells** of the dance are not.

OS Save in the GifOS bar is the snapshot control. Fine. The in-wiki red badge is the problem.

### Invite wiki — OURS

One Chromium, two contexts, local relay. Host pressed Invite; guest opened the link; guest wiki booted; host wrote “Shared Tomato”; guest `tiddlerExists('Shared Tomato')` with the same text. No account, no server. The original cannot do this.

Caveat, not a reason to flip the piece: drafts live in the shared `tiddlers` collection, so Ada’s broken empty draft appeared on Bea’s machine as a red banner. Story river stayed private (guest did not auto-open the host’s tabs). That split is correct; drafts should have been private too.

### Phone — COMP (claim not held)

- Tap targets on page/tiddler controls measure 40×40. That part is done.
- At 390×844 the sidebar did not tuck: `.tc-sidebar-scrollable` stayed `display:block` with width 390. Listing and GettingStarted both promise it hides.
- Back is wired (cancel draft → close tiddler → hide sidebar). A leftover shared draft made Back cancel the draft first — right order, bad state.
- Editor 16px (no iOS zoom) was not observed: the help sheet and then the error sheet covered the phone viewport before an edit started.

The original’s empty file on a phone is cramped but writable. This copy’s phone claims are ahead of the build.

### BSD notice — OURS

- Full BSD-3-Clause text is packed **inside the GIF** as `COPYING.txt` (Jeremy Ruston; UnaMesa Association; all three clauses).
- Listing: `license: BSD-3-Clause`, copyright line, `blessed: false`, “Unofficial port” on the rendered page, donate points at Open Collective not GifOS.
- GettingStarted and help.md name Jeremy Ruston and the UnaMesa Association.
- The running wiki does not surface the full notice as a tiddler a user can open; the packed file plus the listing copyright satisfy binary redistribution. Names are not used to endorse.

## Single biggest remaining gap

**The plus-button / new-tiddler path throws a sandbox `SecurityError` (opaque-origin iframe vs `document` on another Window), so a stranger cannot write a tiddler the way the app itself instructs.** Persistence and Invite are proven; the verb is not.

Until plus opens an editor and the tick keeps a note *with no red sheet*, this is not the best TiddlyWiki that has ever existed.

## Stranger-reason

“The notebook *is* the GIF — close it and the tiddlers are still there — and one Invite is a shared wiki with no server, no HTML-download dance.”

That sentence is true of the pipe (db persist and guest sync both measured). It is not yet true of the product a stranger will touch: they will press plus, as GettingStarted tells them to, and get a crash sheet. I would not switch from the HTML file until that is gone. When it is gone, I would.

## Wall breaks

- **Catalog wall, broken.** `site/apps/tiddlywiki/{app.json,cover.jpg,tiddlywiki.gif}` exist; `site/apps/index.json` does not mention the slug. Grid search is empty. Deep link is not a store.
- **Sandbox wall, not met for the editor.** The GIF itself does not fetch a CDN, does not keep `Function("return "+code)`, declares no `network` capability, and ships `COPYING.txt`. The framed/new-tiddler UI then reaches across the opaque origin and dies. An app that cannot write inside the sandbox is not a legal improvement over one that can.
- No other walls observed: `minBuild` 947, data in `gifos.db`, vendor HTML is the packed `index.html`, Markdown plugin is inside the GIF. `$:/plugins/` is excluded from persist, so a user-imported plugin will not survive — a product gap, not a wall.

Cover, listing-grid, dirty-Save chrome, draft-on-invite, and phone sidebar are the next gaps after the write path. None of them is the reason this round loses. Plus is.
