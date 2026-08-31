# Matter Sandbox — gauntlet critic

Blind A/B against **https://brm.io/matter-js/demo/#slingshot** (Liam Brummitt’s official Matter.js slingshot demo — the original this tree vendors) and **Algodoo** (algodoo.com / iPad: draw, fluids, gears, 50k-scene Algobox). Played ours from the packed GIF in the real GifOS sandbox (`/?run=matter-sandbox` → `run.html#id=`), desktop 1280×800 and phone 390×844. Listing read on `/store.html#app=matter-sandbox`. One Chromium. Guest joined through one Invite link (Hana host, Sam guest, local relay).

**winner:** COMP

**single biggest remaining gap:** The pile does not live in the GIF. Dropped two boxes (35 → 37 bodies), waited 1.6s, reloaded the same `run.html#id=`. Restored **35** at gravity 1.0 — first-boot slingshot, extras gone. `boot.js` `persist()` is an 800 ms debounce that `onTick` retriggers on every dirty frame (`if (MSPhysics.isDirty()) persist()`), and `markClean` only runs inside that timeout, so the write never fires while the world is dirty. Listing lead line is therefore false.

**would a stranger who knows the original use this copy:** "I would send the GifOS one to a friend because one Invite is the same pile — Sam’s cursor was on my canvas, roster said 2 in the room, the demo is a tab we both have to open. I will not keep it for myself while closing the GIF forgets the stack it advertised. Fix the save so the file is actually the save; then the offline + invite reason is enough. Until then I stay on brm.io/matter-js/demo for the toy and Algodoo if I want a scene I can keep."

**HARD WALL:** catalog index **fail to ship.** `site/apps/matter-sandbox/{matter-sandbox.gif,app.json,cover.jpg}` exist and `#app=matter-sandbox` paints the listing. `site/apps/index.json` has no `matter-sandbox`. Store search for `matter` returned **Splat** (antimatter15), not this. A stranger browsing the grid cannot find it. `build.mjs` refuses to run `build-app-catalog.mjs`.

No CDN / no remote load: **pass.** After boot, app-origin requests were `127.0.0.1:8099` + `blob:`; off-origin list was empty. CSS is system-ui. Manifest has no `network`. `vendor/matter.min.js` 0.20.0 is packed. MIT notice is packed as `COPYING-matter-js.txt` (Liam Brummitt). `minBuild` 947 is honest. Listing license fact is MIT. Overclaim of “the stack is still there” is a failed round, not a style note.

## Face (always judged)

- **Icon (64px):** 14 frames, 100 ms. Colour pyramid, rock flies in from the left, stack leans and collapses. At 64px it still reads as blocks being knocked over — the loop is the app, not a wiggle. Comp has no animated icon. Structural win. `?run=` files it in Stolen Apps, so it was not judged next to Welcome.gif / Camera.gif on the Home Screen this run; the frames themselves are the ornament.

- **Store art:** `screenshot.png` / `cover.jpg` is a procedural drawing of a stepped world (ragdoll seated, rock on a clothesline to the pyramid, SLING selected, “2 IN ROOM”). Not first-boot, not GifOS chrome — no `coverCrop` needed. At hero (678×407 on the listing) it sells “physics toy.” At card (240×144) it is mostly empty dark: toolbar labels mush, ragdoll a blob, the taut band is the only readable gesture. Beside 2048 (“RACE A FRIEND FROM ONE LINK”) and Fluid (a swirl that fills the card) it looks empty. Honesty nick: the band is still attached to a rock already at the stack (`icon.mjs` removes the elastic then still paints posts→rock). Live first-boot is the official slingshot silhouette with the rock *in* the posts, no ragdoll.

- **Listing copy (read on the rendered store page):** Tagline *A 2D physics toy box. The pile lives in the GIF; one invite is the same room.* Description leads with close-and-keep / one invite / no account / plane, then the toys, then “The Matter.js demos are a page you visit.” Right shape. Author Liam Brummitt, porter GifOS, unofficial, MIT, 263 KB, abilities Saves-in-the-icon + Multiplayer. Every mechanical claim that was testable was true **except the lead one** (the stack is not still there). “Invite in the bar above” is true in the running app.

## Product notes (not the gap, but they sit on the table)

- **Slingshot arena.** First-boot is the official silhouette: posts + rock, 8×7 pyramid, ledge pyramid, two balls. 35 bodies, gravity 1, sling present. Comp is the same scene in Matter.Render wireframe with the example inspector (World / Composites / Bodies). Ours is a coloured toy box with Grab / Box / Ball / Ragdoll / Sling / Stack / Pause / Reset / gravity −2…2. Combined room is the right unification. Comp still has dozens of other examples (ragdoll, mixed, cloth, car, wrecking ball) behind a dropdown; ours is one arena.

- **Actually stacking.** Stack added a 16-body pyramid onto the live pile (47 → 63). Ragdoll is 10 bodies and flops. Box and ball tap-spawn. Grab registered (maxV 0.49 on a pyramid brick — a nudge, not a throw; MouseConstraint on the original still feels like the better hand). Automated sling pull did not launch the rock (it stayed at the posts); the sling is in the scene and the hint is correct. Reverse gravity at −1 lifted the free balls; sleeping stacks did not wake, so the pyramids sat on the floor while the balls went to the ceiling.

- **Invite shared world.** Invite minted a `/run.html#j=…` room in place. Guest Sam booted `owner:false`, `live:true`, roster Hana + Sam, 35 bodies. Host chrome: “you host it”, friend-bar “2 in the room — same pile, everyone drops and grabs,” Sam’s named cursor on the canvas. Guest drop/grab was not finished (host page closed under the share modal). Join is real. Guest pose rate is still 10 Hz in `net.js` (`WORLD_HZ`); not the gap.

- **Phone (390×844).** Tools wrap to 44 px thumbs, “Share the room” truncates to Share, `#how` / `.foot` hide, canvas 368×276, no horizontal page scroll. Tap dropped a box; airplane mode still dropped a ball. Playable. OS bar + two tool rows steal the pile; Algodoo on an iPad is the whole glass.

- **Algodoo.** Category ceiling, not the port. Draw, fluids, gears, motors, optics, Algobox. Ours is a rigid-body toy with six tools. Beating Algodoo is not this round; beating the demo *and* keeping a scene is. Algodoo’s scenes save. Ours currently do not.

The run can leave on the stranger-reason (one link is a room, it runs on a plane) the moment close-and-reopen still shows the two boxes you dropped. Until then the listing is selling a file that forgets, and the original demo wins the A/B.
