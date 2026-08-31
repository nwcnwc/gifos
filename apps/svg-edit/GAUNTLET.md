# SVG-Edit gauntlet

**Win:** A stranger who knows SVG-Edit (or Boxy SVG) would use this copy because the drawing lives in the GIF, works offline, and one Invite is a shared SVG with no account.

## Bars

- **ONE:** SVG-Edit 7 (svgedit.netlify.app / the npm editor) and Boxy SVG. Drawing tools, path editing, layers, source, export. "As good as" the original is losing — we took their work into a new home.
- **TWO:** Offline; state in the GIF so the file is the save; Invite is a shared SVG; no account.

## Rounds

1. **Vendor.** SVG-Edit 7.4.2 IIFE + 274 toolbar/jgraduate images as data URLs. No CDN. Default extensions dropped (they `import()` files the sandbox cannot fetch). Drawing + undo + layers + source stay in the IIFE. `new Editor()` survives `about:srcdoc`: boot.js wraps `URL` so a relative base of `about:srcdoc`/`about:blank` resolves against `gifos://app/`, and vendor.mjs pins `extPath` to `./extensions` (the constructor used to throw `Failed to construct 'URL': Invalid URL`).
2. **Persistence / invite.** `gifos.db('doc')` is the SVG (read-write). Prefs private. Open / Save SVG / PNG in a strip that does not depend on `ext-opensave`. `#tool_rect` draws a `<rect>`; that string round-trips through `doc` (put applies live; reload restores it). Last-write-wins if two people grab the same shape.
3. **Face.** Icon: a vector pen drawing a star then a circle. Cover: live window, mid-use (red rectangle + selected ellipse, tools, rulers, palette), GifOS shell cropped. Listing leads with the GIF-is-the-save / invite reason. Distinct from SVGOMG (the optimiser).
4. **Theme.** Dark chrome so it does not look like 2010 grey next to Boxy SVG, without rewriting the editor.

## Remaining gap

Shape libraries, connectors, and grid from the extension suite are not in this copy — they `import()` files the sandbox cannot fetch. Path editing, layers, and SVG/PNG export are. Last-write-wins on the whole SVG, not per-shape OT. Catalog listing (`site/apps/index.json`) is owned elsewhere.

## Honest limits

- Last-write-wins on the whole SVG, not per-shape OT.
- Embedded photographs live in the SVG string; a page full of them makes the icon heavy.
- Upstream's homepage link is hidden (`capabilities.links` is off).
