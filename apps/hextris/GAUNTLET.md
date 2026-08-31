The critic picked COMP because initialize threw (`$(window).resize is not a function`), so keys, the pad, Play a friend, and a real pause control never bound.

A stranger who knows hextris.io would use this copy because the high score lives in the GIF and one invite is a same-seed race — hextris.io is solo, online, and forgets you.

## Bars

- **ONE** — the pinned upstream (`3f4847dc`). hextris.io is NXDOMAIN; GitHub Pages 301s to it.
- **TWO** — GifOS: offline; top-three scores in `gifos.db` so the file is the save; Invite is a same-seed race (or vs on score), no account.

## Rounds

1. License gate: GPL-3.0 — proceed. Vendored `js/` at `3f4847dc`, dropped CDNs / analytics / phone-home.
2. Solo play: original rules, native keys, tap-sides, LEFT/RIGHT/FAST on a phone, scores in the GIF.
3. Race: shared seed, own rows, last-one-stacking, ghost hex of the friend.
4. Icon: a hex piece landing and a 3-match flash. Cover: mid-game stacks + a race strip.
5. **Boot throw (critic COMP).** `jq.js` had no `.resize`; `$(window).resize(scaleCanvas)` aborted initialize before `addKeyListeners` / Touch / friend. Shim now binds resize. Pause/help/back `attr('src', './images/…')` now resolve to packed `data:` URLs (srcdoc has no file path). HOW TO PLAY credits Logan Engstrom & Garrett Finucane again. Proved in a srcdoc frame: boot without throw, ArrowLeft rotates, LEFT pad rotates, pause paints a resume hex from `data:`.

## Remaining gap

The friend’s hex is a compact ghost, not a second full-size field — a phone cannot honestly hold two hextris boards.

## One-sentence win

The original is a brilliant solo arcade in a browser tab; this is that game with the score inside the file and a fair race from one link.
