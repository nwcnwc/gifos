# shapez.io — gauntlet critic

Blind A/B against **shapez.io** (tobspr Games, the named original; Factorio is the genre ceiling). Played the shipped GIF `site/apps/shapez/shapez.gif` (253 018 bytes, 247 KB) in the real GifOS sandbox (`run.html#id=` after injecting the GIF, desktop 1280×800). Listing read on `/store.html#app=shapez` at desktop and **390×844**. Store search, icon frames, cover at card (240) and hero (680). One Chromium. Invite was not two-tabbed — the factory never accepted a click.

**Winner: COMP**

A stranger who knows shapez.io does not have a reason to use this copy. They cannot place the first belt.

## Stranger-reason

Asked: you know the original — why would you use this one?

The listing’s answer is “the factory lives in the GIF” and “one invite, and a friend is on the same belts.” After a cold run, both are sentences about a game that does not boot.

shapez.io’s reason is still the one a factory player can say: the floor is there, the hub is hungry, drag a belt. This GIF’s first paint is a black iframe with HTML chrome. The floor, the patches, and the hub exist in the renderer — a critic-forced `SZDraw.render` after `bind()` paints them — and they are not what opens.

## Single biggest remaining gap

**`SZUI.init` throws before the loop, the pointers, and `fit()`. You cannot place the first belt.**

`SZDraw.bind()` (the only assignment of `TILE` / `DX` / `DY`) runs from `render()`, not from boot. `paintTools()` immediately calls `drawToolbarIcon` → `drawBelt` → `incomingDirs` → `DX[d]` while `DX` is still `undefined`. `init` dies on that toolbar pass. It never reaches `addEventListener` on the canvas, never `fit()`s the bitmap, never `requestAnimationFrame`s.

Measured on the packed GIF:

- App-frame console, first seconds: `Cannot read properties of undefined (reading 'childNodes')` (net `paintTools` before `init` sets `toolsEl`), `Cannot set properties of undefined (setting 'hidden')` (`paintRoster` / `rosterEl`), `Cannot read properties of undefined (reading '1')` (`DX[1]` in `incomingDirs`).
- Canvas bitmap stays the HTML default **300×150** while CSS is 1280×768. HUD zoom label stays the HTML default `100%` (the game’s `zoom` is 0.72; `paintHud` never ran). Goal-shape canvas stays empty grey. Hint never appears.
- `#map` pointer listeners are not bound. Clicks and belt-drags wrote **zero** `cells` rows.
- Forcing `bind()` + `SZDraw.render` on a new `SZGame` paints the real opening: checker floor, 3×3 hub with an uncolored circle and `0 / 20`, grey circles west, rectangles east, red north, blue SW, green SE, stars NE. That is the first-belt picture. It is in the GIF. It is not the first paint.

Until `bind()` happens before any `drawBelt` / `drawMachine`, and `init` actually finishes, every other piece is chrome around a dead floor.

## Piece judgements

### Icon — OURS

14 frames, 128² sticker: yellow extractor, belt, cutter, painter, blue hub; a circle rides the belt, splits, turns red, enters the hub. At Home Screen size the row of machines still reads “factory,” not a decoration. The loop is the product. Comp is a website with no icon. This is the one piece that already wins.

### Cover — COMP

`cover.jpg` / `screenshot.png` is a 1200×720 *pixel-font illustration* of Level 7 RED CIRCLES, 28/40, `2 BUILDING`, items on belts, a friend implied. It is not a frame of the running app.

- Listing hero (680×409): sells “shape factory.” Honest as a poster, toy-like next to a real mid-use screenshot (shapez.io’s own floor, or Piskel / 2048 in this catalog).
- Grid card (240×150): HUD and `2 BUILDING` die; coloured blobs on a checker remain.

Worse: first boot is a black void. A cover that shows a mid-game factory the GIF cannot open is a lie about the first minute. Comp’s store art *is* the live floor.

### Listing — COMP (overclaim = failed round)

Rendered `/store.html#app=shapez` matches `listing.json`. Tagline is a good card line. Description leads with the platform reason, then the opening machines, then unofficial / GPL-3.0 / bugs to GifOS. Credits are honest (`blessed: false`, tobspr Games, porter GifOS). Size 247 KB, signed by gifos.app, abilities Saves-in-the-icon + Multiplayer, minBuild 947.

Every lead claim is false of the build that ships beside that copy:

| claim | running GIF |
| --- | --- |
| “close it, come back, every belt and machine is where you left it” | no belt can be placed; `cells` stayed `[]` |
| “Send Invite and a friend builds on that same floor” | OS Invite button is visible; the floor is dead, so co-op is a button over a black iframe |
| “This is the opening of shapez — extractor, belt, cutter…” | the opening does not open |
| “it works on a plane” | no network cap, true as a wall; irrelevant until the loop runs |

Store search for `shapez` on this clone’s catalog paints **Nothing matches that.** `site/apps/index.json` has 156 apps and does not list the slug. Deep-link `#app=shapez` still loads `app.json`. The grid a stranger browses does not.

shapez.io’s own page (“build factories, automate shapes”) is still the better listing because it describes a game that starts.

### First-belt feel — COMP

Bar ONE is not mediocre. Placing the first extractor on a grey circle and dragging a belt into the hub *is* the product.

- **OURS, as shipped:** black iframe, HTML HUD (`Level 1 / Uncolored circles / 0 / 20`), eight dark tool chips with labels and almost no glyphs (the create-loop of `paintTools` finished; the icon pass threw on Belt). Extractor is not selected. Cutter / Rotator / Painter are not locked (the lock pass never ran). Keys line is visible. Nothing on the floor.
- **OURS, renderer only (forced `bind` + `render`):** this *does* feel like a baby shapez. Checker `#d5d9e2`, published uncolored-circle / rectangle / colour / star patches, hub with the goal shape in the middle. Toolbar icons then draw (Belt chevron, yellow extractor, locked-looking later machines). That is the slice GAUNTLET.md asked for. It is one function call away and it is not the boot path.
- **COMP:** PIXI floor, belt drag with auto-corners, extractor-only-on-patch, hub that eats, 26-level campaign, upgrades, balancers, stackers, wires. Factorio is still above both.

247 KB is not the original webpack+PIXI tree. It is an original-engine reimplementation of levels 1–8 (`CuCuCuCu` → `RbRb----`, then freeplay). Codes and hexes match upstream (`#aaaaaa` / `#ff666a` / `#66a7ff`). That would have been an honest opening **if it booted.** As shipped it is a toy that does not play. Distinct from `tower-defense` (different listing, different verbs, forced paint is a factory around a hub, not a path of creatures).

### Factory-in-GIF — COMP

`gifos.db('cells'|'world'|'flow'|'prefs'|'cursors')` is declared and `SZNet` subscribes on boot — the subscribe is part of what throws. No factory was ever written. Reopen was not meaningful. Comp’s save is a browser download / Steam file that actually contains belts.

### Invite co-op — COMP

OS chrome: `#appinvite` is `display:flex`, label Invite. The app does not draw that button. That half of the wall is held. The other half is the product: a guest cannot land on “this same floor” when the host cannot build on it. Not two-tabbed. Comp has no multiplayer — that was the intended win.

### Phone (390) — COMP

Listing at 390×844 renders the same poster + tagline; cover crops hard (`2 BUILDING` gone). In-app 390 was the same srcdoc; the TypeError is not viewport-dependent. CSS already hides `#keys` under 720px and shrinks tools to 56px — a phone layout for a loop that never starts. shapez.io on a phone is still a factory.

### No CDN — OURS (wall held)

App-frame requests stayed on `127.0.0.1:8099` + `blob:`. No webfont, no jsdelivr. Fonts are `ui-sans-serif, system-ui`. Manifest has no `network`. Comp is a hosted PIXI bundle.

## Wall breaks

- **No remote load.** Held.
- **GPL-3 packed.** Held. Decode of `shapez.gif`: 13 files including `COPYING.txt` (GNU GPL v3), `vendor/UPSTREAM.txt`, `help.md`, `credits.json`, the six scripts. Listing license fact is GPL-3.0. Corresponding source *is* the JS in the GIF. `blessed: false`.
- **minBuild 947 / unofficial / no network cap.** Honest on paper.
- **Catalog index.** Broken. `site/apps/shapez/{shapez.gif,app.json,cover.jpg}` exist and are signed. `index.json` does not list `shapez`. Search is empty. Catalog-regenerate wall.
- **Saved data in gifos.db.** The collections are declared; nothing playable is written. Not a version-compat break — a boot break.
- **Listing truth.** Failed round. Overclaim, not a style note.
- **Invite is OS chrome.** Held as chrome. Irrelevant until the floor lives.

## Bar check

Bar ONE (shapez.io / Factorio feel) is the floor. “As good as” would already lose on a port; this is not as good as, because it does not start. The forced-paint frame shows the slice is *aimed* at the first belt. Aimed is not shipped.

Bar TWO is why this should have won: the factory is the file, one invite is co-op, GPL packed, no account. GPL packed is the only half that is true in play.

The run can leave on the stranger-reason the moment cold boot paints the checker, the hub, and the west circles, Extractor is selected, a drag lays a belt, and a circle actually moves. Until then COMP wins, and 247 KB is a poster plus a crash.
