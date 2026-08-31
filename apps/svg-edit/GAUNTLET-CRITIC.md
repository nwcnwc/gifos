# SVG-Edit — gauntlet critic

Blind A/B against **SVG-Edit 7.4.2** (https://unpkg.com/svgedit@7.4.2/dist/editor/index.html; master at svgedit.netlify.app also paints) and **Boxy SVG** (https://boxy-svg.com/, the paid desktop bar the listing names). Distinct from SVGOMG (the optimiser already in this catalog). Played ours from the packed GIF in the real GifOS sandbox (`/?run=svg-edit` → `run.html#id=…`, desktop 1280×800 and phone 390×844). One Chromium. Listing at `/store.html#app=svg-edit`. Icon frames from `site/apps/svg-edit/svg-edit.gif`. Invite was not two-tabbed — there is no canvas to share.

**winner:** COMP

**single biggest remaining gap:** The editor never starts. `new Editor(#container)` throws `Failed to construct 'URL': Invalid URL` because the vendored IIFE does `new URL('./extensions/', document.baseURI)` and a GifOS sandbox is `about:srcdoc` (Node: that constructor throws on `about:srcdoc` / `about:blank`). After eight seconds the window is still the empty-state line “Opening editor…” with that error in `#g-status`. `window.Editor` is a function; `window.svgEditor` is undefined; `#tool_rect` / `#workarea` / `#svgcontent` are not in the tree. You cannot draw, save, or invite a picture that was never created. Guard that URL (or pin a dummy `baseURI`) so `new Editor()` returns, then the rest of the gauntlet can even begin.

**would a stranger who knows the original use this copy:** “I know SVG-Edit. The copy on unpkg opens: select, pencil, path, rect, ellipse, text, image, shape library, star, eyedropper, a paper, a storage prompt. This GIF is a dark hole that says Opening editor… and Failed to construct 'URL'. I would not use it. The file-is-the-save / one-invite story is a reason I *would* switch — after it actually draws.”

**HARD WALL:**

- **Catalog (broken).** `site/apps/svg-edit/{svg-edit.gif,app.json,cover.jpg}` exist (GIF 1.4 MB, signed by gifos.app). `site/apps/index.json` has 156 apps and **does not list `svg-edit`**. Store search for “svg” returns **only SVGOMG**. A shopper looking for an SVG editor lands on the optimiser. `#app=svg-edit` still loads `app.json` and the listing. Catalog-regenerate wall.
- **Overclaim (failed round).** Listing copy describes a working editor, auto-save in the GIF, Invite as a shared SVG, Open / Save SVG / PNG, “works on a plane.” None of that is true of a build whose constructor throws before `init()`. An overclaim is a failed round, not a style note.
- **No CDN / no remote load (held).** App origin is the sandbox iframe. Manifest has no `network`. The IIFE never reached `import()` of extensions because construction failed first. Packed files are html/css/js + images map + COPYING. Comp 7.4.2 fetches `ext-shapes`, `ext-connector`, `ext-grid`, `ext-opensave`, … from unpkg.
- **MIT inside the GIF (held).** `COPYING.txt` (MIT, SVG-edit authors 2009–2022), `COPYING-Apache-2.0.txt` (jGraduate), `AUTHORS.txt`, `help.md` decode from the GIF. Listing license line matches.
- **gifos.db / Invite (not reached).** `app.js` writes `gifos.db('doc')` `{id:'drawing', svg, rev, by}` and subscribes; Invite is OS chrome (`#appinvite` visible on the solo bar). Last-write-wins on the whole SVG is documented. None of it ran: there is no SVG string to put.

---

## Face (always judged)

- **Icon (64px):** 12 frames, 100 ms, a dark card holding a white artboard where a pen draws a star then a circle. The loop *means* to demonstrate. At real Home Screen size the card is a 7 px rim, the paper is the icon, and an early frame is a white rounded square with a tiny orange tick — it reads “sticky note,” not “SVG-Edit.” Comp has no animated icon. Structural win that does not earn the slot.
- **Store art:** `screenshot.png` / `cover.jpg` is a procedural pixel poster (sun, hills, selected star, fake LAYERS, fake `OPEN SAVE SVG PNG` strip). Mid-use, not empty first boot. No GifOS shell toolbar (`coverCrop` absent — the strip is the app’s own `#g-bar`, drawn in). At grid-card (240×150) the landscape still reads; at listing hero (678×407 on `/store.html#app=svg-edit`) it is a different, cheaper product than the live window, which is a black void. Boxy’s marketing is a real editor: selected path, fill panel, `Paint.svg`. 2048’s catalog card sells the race in one look. Ours sells a poster of an app that does not open.
- **Listing copy (read on the rendered store page):** Tagline *Draw SVG on this device — the file is the save, and one invite is a shared canvas.* Description leads with “not a whiteboard and not an optimiser,” then GIF-is-the-save, Invite, Open/export, unofficial MIT port, Boxy as the paid bar. That is the right *shape*, and it correctly separates this slug from SVGOMG. Every mechanical claim is false of the build that ships beside it. Unofficial-port pill is honest. Grid card could not be judged: the slug is missing from `index.json`.

## Product notes (not the gap, but they sit on the table)

- **COMP SVG-Edit 7.4.2** actually boots. Left tools include the ones this port dropped with `noDefaultExtensions: true` (connector, shapes, star/polygon, eyedropper, panning). Grey 2010 chrome, localStorage consent dialog on first load, rulers, palette. Dated, and it is an editor. “As good as” that original is already losing — we took their work into a new home — and we are not even there.
- **COMP Boxy SVG** is the feel bar: clean web-app chrome, path node editing, fill inspector, `LAUNCH APP`. Paid, account-shaped. The listing is right that travelling as a file is how we beat it, if we draw.
- **Phone 390×844.** Same dead editor. `#g-bar` wraps (Open / Save SVG / PNG + truncated `Failed to construct 'URL': I…`). There are no tools to miss-hit. Help.md’s “tool strip is tight; rotate to landscape” is a note about a UI that never appeared.
- **Save SVG / PNG / Open** are three buttons on a strip that does not depend on `ext-opensave`. They no-op without a canvas (`currentSvg()` is `''`).
- **Theme.** Dark CSS variables are in `style.css`. They never paint over SVG-Edit’s grey because SVG-Edit never paints.
- **Help.** Packed, ≥400 chars, describes drawing, Invite last-write-wins, phone. The OS Help control is there; the editor crash is the thing a stranger sees first.

The run is not done. Make `new Editor()` survive `about:srcdoc`, then actually draw a rectangle with `#tool_rect`, prove the SVG round-trips through `gifos.db('doc')`, and retake the cover from that live window with the shell cropped. Until a stranger looks at the paper and says “that’s SVG-Edit,” bar two does not matter.
