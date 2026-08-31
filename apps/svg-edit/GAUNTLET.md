# SVG-Edit gauntlet

**Win:** A stranger who knows SVG-Edit (or Boxy SVG) would use this copy because the drawing lives in the GIF, works offline, and one Invite is a shared SVG with no account.

## Bars

- **ONE:** SVG-Edit 7 (svgedit.netlify.app / the npm editor) and Boxy SVG. Drawing tools, path editing, layers, source, export. "As good as" the original is losing — we took their work into a new home.
- **TWO:** Offline; state in the GIF so the file is the save; Invite is a shared SVG; no account.

## Rounds

1. **Vendor.** SVG-Edit 7.4.2 IIFE + 274 toolbar/jgraduate images as data URLs. No CDN. Default extensions dropped (they `import()` files the sandbox cannot fetch). Drawing + undo + layers + source stay in the IIFE.
2. **Persistence / invite.** `gifos.db('doc')` is the SVG (read-write). Prefs private. Open / Save SVG / PNG in a strip that does not depend on `ext-opensave`. Last-write-wins if two people grab the same shape.
3. **Face.** Icon: a vector pen drawing a star then a circle. Cover: mid-use artboard (sun, hills, star, layers). Listing leads with the GIF-is-the-save / invite reason.
4. **Theme.** Dark chrome so it does not look like 2010 grey next to Boxy SVG, without rewriting the editor.

## Remaining gap

Shape libraries, connectors, and grid from the extension suite are not in this copy — they `import()` files the sandbox cannot fetch. Path editing, layers, and SVG/PNG export are. Last-write-wins on the whole SVG, not per-shape OT.

## Honest limits

- Last-write-wins on the whole SVG, not per-shape OT.
- Embedded photographs live in the SVG string; a page full of them makes the icon heavy.
- Upstream's homepage link is hidden (`capabilities.links` is off).
