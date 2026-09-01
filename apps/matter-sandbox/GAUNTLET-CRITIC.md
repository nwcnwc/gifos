# Matter Sandbox — gauntlet critic

Blind A/B against **https://brm.io/matter-js/demo/#slingshot** (Liam Brummitt’s official Matter.js slingshot demo — 48 examples behind the dropdown, wireframe + angle ticks, MouseConstraint). Bar TWO is the pile in the GIF and one Invite as the same room. Played the packed GIF (`site/apps/matter-sandbox/matter-sandbox.gif`, 263 KB) from `/?run=matter-sandbox` → `run.html#id=`, desktop 1280×800 and phone 390×844. Listing read on `/store.html#app=matter-sandbox`. One Chromium. Guest Sam joined through one Invite link (Hana host, local relay). Packed `boot.js` has `persistNow`, `pagehide`, and the debounce that does not retrigger.

**winner:** OURS

**single biggest remaining gap:** The slingshot — the toy Bar ONE is — is still the worse hand, and restore makes it look broken. Same automated pull that launched the official rock into the upper pyramid and loaded a fresh one left ours sitting in the posts (`s3` at 149.9, 429, `flew` 0.99, still one poly). Grab on a brick peaked at speed **4.39** (a shove). After close/reopen and after the room remount, a taut band is painted from the shelf to the rock: `importScene` / `applyPoses` rebuild `sling.posts` from every `kind==='post'` toy, and the ledge is tagged `post`, so `paintBands` draws a clothesline through the room. First boot does not ( `addSling` caches only the two posts). The cover sells that same lying band.

**would a stranger who knows the original use this copy:** "I would send this one. I dropped two boxes, closed the GIF, they were on the floor when I opened it. Sam joined the Invite, landed on those 37 bodies, dropped a ball, and I had 38 — his name was on my canvas. brm.io is a tab we both have to open, and it forgets. I will still open the demo when I actually want to *shoot* the pyramid, because that pull fires there and here it does not, and after a save the elastic looks like a washing line. Fix the shot so restore looks like first boot and the rock leaves the posts; then I do not need the bookmark."

**HARD WALL:** catalog index still **fail to browse.** `site/apps/index.json` has 157 apps and no `matter-sandbox`. Store search for `matter` returned **Splat** (antimatter15), not this. `/store.html#app=matter-sandbox` paints the listing from `app.json`; `/?run=matter-sandbox` fetches `/apps/matter-sandbox/matter-sandbox.gif` without the index, so a pasted link works. A stranger browsing the grid cannot find it. `build.mjs` still refuses to run `build-app-catalog.mjs` (owned elsewhere). Not this round's product gap.

No CDN / no remote load: **pass.** After boot, origins were `http://127.0.0.1:8099` only; off-origin list empty. CSS is system-ui. Manifest has no `network`. `vendor/matter.min.js` 0.20.0 is packed. MIT notice packed as `COPYING-matter-js.txt`. `help.md` and `credits.json` packed. `minBuild` 947 is honest. Listing license MIT. The lead claims were testable this run and held.

## Face (always judged)

- **Icon (64px):** 14 frames, 100 ms. Colour pyramid, rock from the left, stack leans and collapses. At 64px it still reads as blocks being knocked over — the loop is the app. Comp has no animated icon. Structural win. `?run=` files it in Stolen Apps.

- **Store art:** `screenshot.png` / `cover.jpg` is a procedural drawing of a stepped world (ragdoll seated, rock on a clothesline to the pyramid, SLING selected, “2 IN ROOM”). Not first-boot, not GifOS chrome. At hero (~678×407) it sells “physics toy.” At card and on the phone listing the toolbar labels mush; the taut band is the only readable gesture. Honesty: live first-boot is the official silhouette with the rock *in* the posts, no ragdoll, no friend chrome. The clothesline the cover invents is exactly what restore then draws for real (see gap).

- **Listing copy (read on the rendered store page):** Tagline *A 2D physics toy box. The pile lives in the GIF; one invite is the same room.* Description leads with close-and-keep / one invite / no account / plane, then the toys, then “The Matter.js demos are a page you visit.” Right shape. Author Liam Brummitt, porter GifOS, unofficial, MIT, 263 KB, abilities Saves-in-the-icon + Multiplayer. Every mechanical claim that was testable was true this run, including the lead one the last critic failed it on.

## Product notes (not the gap, but they sit on the table)

- **Slingshot arena.** First-boot is the official silhouette: posts + rock, 8×7 pyramid, ledge pyramid, two balls. **35** bodies, gravity 1, sling present (`post:3 poly:1 ball:2 box:29`). Comp is the same scene in Matter.Render wireframe with the example inspector (World / Composites / Bodies) and a 48-example dropdown (Air Friction, Cloth, Car, Ragdoll, Reverse Gravity, Stress…). Ours is a coloured toy box with Grab / Box / Ball / Ragdoll / Sling / Stack / Pause / Reset / gravity −2…2. Combined room is the right unification. Comp still has the rest of the book.

- **Pile in the GIF — closed.** Dropped two boxes (35 → 37), waited 1.6 s: `gifos.db('save')` wrote **37**, `dirty` false. `pagehide` flush 37. Reloaded the same `run.html#id=`: restored **37** at gravity 1.0, kinds `box:31` — extras on the floor in the reopen screenshot, not a count lie. Last critic’s 800 ms debounce retrigger is gone in the packed `boot.js`.

- **Actually stacking.** Stack 37 → 53. Ragdoll 53 → 63 (10 bodies, flops). Box and ball tap-spawn. Reverse gravity at −1 lifted the ragdoll and loose boxes; sleeping balls sat on the floor (`y≈572, vy:0`) — `enableSleeping` does not wake on a gravity flip. Comp has a dedicated Reverse Gravity example that does.

- **Invite same room — closed.** Invite minted a `/run.html#j=…` room in place (hash replaced, `you host it`). Host remounts through **Opening…** (the iframe is torn down onto the room lane — a black beat). Guest Sam booted `owner:false`, `live:true`, roster Hana + Sam both sides, **37** bodies (the extras survived the remount). Guest ball: **37 → 38 on host and guest.** Chrome: “2 in the room — same pile, everyone drops and grabs.” Sam’s named cursor on the host canvas, Hana’s on the guest. Join is real; guest pose rate is still 10 Hz (`WORLD_HZ`). Friend-bar still tells you to “Press **Invite** in the bar above” while Sam is already on the roster; the OS share sheet sat on the host pile; the gravity slider cuts the sling.

- **Phone (390×844).** Tools wrap to two rows, “Share the room” truncates to Share, `#how` / `.foot` hide, canvas **368×276**, no horizontal page scroll. Tap dropped a box; airplane mode still dropped a ball (36 → 37). Playable. OS bar + two tool rows steal the pile. Comp at the same width is the 800×600 demo letterboxed with the inspector.

The last critic’s leave condition was the two boxes still there after close. They are. The invite is the same pile. The run can leave on that stranger-reason. It should not leave until pulling the rock knocks the pyramid over the way brm.io does, and a restored scene does not draw a clothesline from the shelf.
