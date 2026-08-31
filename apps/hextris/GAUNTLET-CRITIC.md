# Hextris — fresh-eyes critic

Comp: the original Hextris (hextris.io). That host does not resolve (NXDOMAIN); GitHub Pages 301s to it. Played the pinned upstream (`3f4847dc`) locally so the floor is the real game, not a 404.

## Winner

**COMP**

The original is a game you can play. This copy is a title screen that throws on boot. Until a stranger can rotate the hex, the race, the GIF-save, and the listing copy are claims, not a product.

## Single biggest remaining gap

`jq.js` has no `.resize`. Vendored `initialization.js` calls `$(window).resize(scaleCanvas)` and throws (`$(...).resize is not a function`). Everything after that line never runs: `addKeyListeners`, tap-sides, `Touch.init` (LEFT / RIGHT / FAST), the `Play a friend` click handler, the `body.playing` interval. Arrow keys do nothing. The friend button is visible and dead. Pause/restart become a broken-image glyph on the field (`./images/btn_pause.svg` after the original toggle) while the original paints a real pause hex.

The race *logic* is in the GIF — forcing `HT.Mp.enter()` did open the strip (“Press **Invite** in the bar above… same blocks when they join”). A stranger never reaches it.

## Stranger-reason

Asked “you know the original — why would you use this one?”: no answer without prompting.

Would-be reasons (offline, top-three scores in the file, same-seed race from one Invite) are what the listing says. They are not what happens. hextris.io being dead DNS *would* be a reason to keep a copy — not this copy, not while it cannot be played.

## Wall breaks

- **Catalog.** `site/apps/hextris/` has the GIF, `app.json`, and cover, and `/store.html#app=hextris` renders. `site/apps/index.json` (156 apps) does not contain `hextris`. Store search for “hextris” is “Nothing matches that.” A stranger browsing the grid never sees it.
- **Boot throw inside the GIF.** Not a CDN fetch — the shim is incomplete, so the shipped app exceptions on every open.
- **Pause/resume assets.** `images/btn_pause.svg` and friends are packed; runtime writes `./images/…` and the sandbox serves a broken image. Asset vendored, path used at run time does not hit it.
- **Listing overclaim.** Tagline and body sell a same-seed race and phone LEFT / RIGHT / FAST. Both are unbound as shipped. An overclaim is a failed round.
- **Credits in the interactive help.** Original HOW TO PLAY ends with “By Logan Engstrom & Garrett Finucane”. This port cut that line. `COPYING.txt` and `COPYING-hextris.txt` *are* inside the GIF (GPL-3 text). Neither original nor this copy shows GPL in the UI; the original also does not. The missing author line is the notice that *was* on screen.

No CDN/webfont/phone-home remains in the packed JS. `gifos.db` and `HT.Mp` exist. Those walls are not the ones that broke.

## The rest, judged beside the bar

**Icon.** At 64px on the Home Screen next to Welcome it reads as a grey hex with coloured trapezoids — it says Hextris. Three frames 350ms apart looked the same; the fall-and-clear loop did not earn itself at icon size. Label is `Hextris.gif`.

**Cover / listing art.** Procedural pixel-font poster (HEXTRIS 1843, HIGH SCORE 10292, a toy ghost hex “LEE 960”). That is not a frame of the live canvas (Trebuchet/Segoe, anti-aliased blocks). Original OG art is a clean hex. At listing-hero size the poster is busy and a different game. At grid-card size it could not be judged: the app is not in the grid.

**Listing copy.** Card line is the right shape (“Race a friend from the same falling hexes — your high score lives in the GIF.”) and it leads with the reason. It is not true of the build it ships beside.

**Hex stacking feel.** Original: blocks fall, land, pause hex works, Exo on the title, field is the whole game. Ours: same light field and tutorial copy, then a blue slab slides in under a live `Play a friend` pill and a broken-image icon. Could not land a stack with keys. Driving `MainHex.rotate` from outside still did not produce a score. COMP on feel, by forfeit.

**Scoring.** Formula in `checking.js` is still n² × combo, top-three via `HT.ls*` / `gifos.db`. Never observed a point appear. Original also started at 0 and did score a landing. No combo, no game-over board, no persistence check.

**Same-seed race.** Invite from the OS bar minted a real link; a guest joined the app. `Play a friend` did not. Forced `enter()` showed the waiting strip and `You 0`. Did not get two live RNGs on the same seed, because the door the listing names does not open. Ghost hex (140×140) was never on screen.

**Phone.** Original: tap-sides copy, real pause control, playable. Ours: `settings.platform` became `mobile` (UA), tutorial says tap sides, no LEFT / RIGHT / FAST, friend pill on the falling lane, same boot throw. Listing’s thumb buttons are not there.

**GPL inside the GIF.** Packed: `COPYING.txt`, `COPYING-hextris.txt` (both GPL-3), vendor JS headers with “Modified 2026”. Not packed: `vendor/UPSTREAM.txt`, `vendor/PIN.txt`, `vendor/COPYING-gpl3.txt` (duplicate). In-game help has no licence and no authors. Distribution of the licence text is done; interactive credit is worse than the original.
