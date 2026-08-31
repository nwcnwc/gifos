# Grid Garden — gauntlet critic

Blind A/B against https://cssgridgarden.com (Thomas Park). Played the original in Chromium and this port from `apps/grid-garden/` (local server, gifos.db mocked). One browser. Desktop 1280 and phone 390 / 360.

**winner:** COMP

**single biggest remaining gap:** The garden sprites do not tile. Original CSS sizes the carrot / weed / water / dirt sheets to one cell (`background-size: calc(10vw - 4px)` on `.plot`, `.plant .bg`, `.treatment .bg`) so a spanned bed is a *field* of carrots. This port sets `background-size: 100% 100%`, so the whole 2000×2000 sheet stretches across the treatment. Level 1 (one cell) looks like Grid Garden. Level 16 (`grid-area: 1 / 2 / 4 / 6`) is two giant carrots over a stretched puddle instead of twelve pairs in a watered bed. Level 28 is the same failure at harvest scale. The puzzle still greets Next — the geometry check is fine — but the picture that *is* the game is wrong from the first span, which is most of the 28 levels.

**would a stranger who knows the original use this copy:** "I would use the GifOS one on a plane, or to sit a friend on the same plot from one link — the original is a tab and a localStorage key, this is the file. I will not, while watering a row turns into two huge carrots. That is not Grid Garden. Fix the bed so it looks like cssgridgarden.com and then the offline + invite reason is enough; until then I stay on the original."

**HARD WALL:** none. No CDN / webfont / remote fetch at load (zero requests off the app origin). No `localStorage`. `COPYING.txt` (MIT) and `COPYING-images.txt` (CC BY 3.0) ride in the tree and the GIF. Catalog claims that were checked are true: 28 English levels, unofficial, Thomas Park, offline, Invite shares level+CSS, harvest copy is still Froggy's cake. English-only is a product gap versus the original's ~40 languages, not a lie; the listing just does not say it.

## Face (always judged)

- **Icon (64px):** A 5×5 dirt checkerboard, one cell filling with water. The loop demonstrates the mechanic, it does not wiggle. At real Home Screen size the carrot is a speck — it reads "tiny garden," not "Grid Garden." Original has no animated icon, so this is a small structural win that does not yet earn the slot.
- **Store art:** `screenshot.png` / `cover.jpg` is a pixel mockup of level 16 (diamond carrots, 5×5 checker, fake editor). It matches neither the original's real OG screenshot (Thomas Park's carrots, Autour One, the actual editor) nor this port's running window (which, at 16, is the stretched-carrot bug). Beside the catalog's best covers (2048, Flexbox Froggy) it looks like a different, cheaper game. Crop is full-bleed, no shell toolbar. Hero on `/store.html#app=grid-garden` and the phone listing both show this fake. A shopper who knows cssgridgarden.com would not recognise the product.
- **Listing copy (read on the rendered store page):** Tagline *Write CSS grid, grow carrots — offline, and one invite shares the garden.* Description leads with file-is-the-save and Invite, then the 28 levels, then unofficial. That is the right shape, and every claim is true of the build. It is better store copy than the original's one-liner ("A game for learning CSS grid layout"). Not enough to win the A/B while the cover and the garden disagree with it.

## Product notes (not the gap, but they sit on the table)

- 28 levels, English instructions, property underlines, Next-when-match, shake on a wrong Next, level dots, Reset — the lesson sequence is the original's.
- Phone stack (garden on top, no `min-width: 600px`) is strictly better than the original, which still clamps the board at 300px. Ours filled ~359px on a 390-wide viewport and did not spill sideways.
- Solo chrome always shows "Press Invite in the bar above…" — extra noise the original does not have, and it steals a row on a phone.
- Title is Georgia, not Autour One; editor is system mono, not Source Code Pro. Acceptable without webfonts; the garden tiling is what actually breaks the look.
- Invite / gifos.db persist are in the code (`net.js` plot+players, `boot.js` private `save`). Not two-tabbed here (one Chromium). Geometry of the shared plot was not the failure.
- Win copy still shills Flexbox Froggy and Codepip with no in-app links.

The run is not done. Tile the sheets to a cell, then retake the cover from the real window at level 16. Until a stranger looks at that bed and says "that's Grid Garden," bar two does not matter.
