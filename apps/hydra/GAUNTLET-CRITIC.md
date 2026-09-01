# Hydra — gauntlet critic

Bar ONE is [hydra.ojack.xyz](https://hydra.ojack.xyz) (Olivia Jack): fullscreen live-coded video synth, CodeMirror on the picture, Ctrl+Enter a line / Ctrl+Shift+Enter the sketch, camera / mic / WebRTC video nodes, gallery sketches, URL as save. Driven live. Distinct from `apps/css-doodle` (generative CSS in a square, not a live video synth — store search for `doodle` finds that one).

Bar TWO is the platform: the patch lives in the GIF, one Invite jams the same synth, offline, no account.

Judged on the packed GIF in the real GifOS sandbox (`run.html#id=`), desktop 1280×800 and phone 390×844, `/store.html#app=hydra`, Home Screen at 64px next to Welcome / Camera / App Store, persist across reopen, hydra.ojack.xyz in the same Chromium. One Chromium. Invite two-tab did not finish (the host browser died after minting jam chrome).

**Winner: COMP**

**Single biggest remaining gap:** The picture is not the page. hydra.ojack.xyz is a fullscreen WebGL synth you type *on* — canvas 1280×800, CodeMirror overlay, a gallery sketch already running (`voronoi(50,1).luma(0.5)…blend(o0).out()`), welcome modal over the video. This copy is a kiosk: rounded stage under Jam / Patch / Run, eight named chips, a `textarea` of system mono, Ctrl+Enter runs the *whole* patch. First-boot Kaleid is a red/blue oscillator tunnel in a 1100×464 box, not the original's edge-to-edge livecoding surface. A stranger who knows hydra.ojack.xyz still opens the website to type. Until the picture is the window and a line evals, “as good as” is losing, and we are not even there.

**Stranger-reason:** I know hydra.ojack.xyz. I would open this one on a plane, and because close-and-reopen left me on `osc(7, 0.1, 1.4).kaleid(6).color(0.1, 0.9, 0.4).out()` — Yours, green, no account. I will not, while I cannot find it by searching the store for “hydra”, the editor is a box under the picture instead of on it, and Invite’s “you both run this patch” was not shown to a guest this pass. That is not a reason to leave hydra.ojack.xyz. Put the synth on the glass, land a friend on this recipe, list it in the catalog; then the file-is-the-save line is enough.

**Wall breaks:**

- **Catalog (broken).** `site/apps/hydra/{hydra.gif,app.json,cover.jpg}` exist (GIF 223 KB / 228377 bytes, signed by gifos.app). `site/apps/index.json` has 156 apps and **does not list `hydra`**. Store search for “hydra” paints “Nothing matches that.” Search for “doodle” finds **CSS Doodle** (and One Stroke). Deep-link `#app=hydra` still loads `app.json` and the listing. The grid a stranger browses — Creativity, where css-doodle already sits — does not. Catalog-regenerate wall.
- **AGPL-3.0 (held).** Packed GIF contains `COPYING.txt` (33056 bytes, “GNU AFFERO GENERAL PUBLIC LICENSE”, Olivia Jack / hydra-synth). Listing fact is AGPL-3.0. `vendor/hydra-engine.js` and the GLSL tables carry the AGPL header. `listing.basedOn.blessed` is false; unofficial-port pill is on the page. Corresponding source is the JS in the GIF. `credits.json` and `help.md` ride along.
- **No CDN (held).** Phone app-frame requests: zero off `127.0.0.1:8099` (plus blob/data). Packed payload has no `cdn.` / `jsdelivr` / `unpkg` / `googleapis` / `gstatic`, no `eval(` / `new Function(`, no `fetch(` / `WebSocket`. Comp loaded 30 requests from `hydra.ojack.xyz`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `raw.githubusercontent.com`, `api.hydrasynth.xyz`, `cdn.glitch.com`.
- **gifos.db persist (held).** Typed a unique patch, `save.get('patch')` wrote `{id:'patch', code:'osc(7, 0.1, 1.4)\n  .kaleid(6)\n  .color(0.1, 0.9, 0.4)\n  .out()', snippet:'yours'}`. Closed the tab, reopened the same `fileId`: recipe, “Yours”, green kaleid. Status of the claim: the last patch is still there.
- **Invite is OS chrome (held).** No in-app Invite button. `#appinvite` is the bar above the app (55×23, “Invite”). Jam together opens the friend bar and tells you to press **Invite** up there.

Listing line “You both run this patch. When anyone presses Run, everyone sees it.” was **not proven this pass** (guest context died). `mp.js` `enter()` publishes the joiner’s current recipe at round 1; a guest who boots Kaleid can overwrite the host’s live patch the way Carbon / RegExr did. Treat as unfinished, not as a green.

---

## Pieces

### livecoding surface — COMP

Blind, same job (type a chain, the picture moves):

- Comp: fullscreen canvas, CodeMirror, gallery sketch already on, welcome “LIVE CODING VIDEO SYNTH / Close this window / Change some numbers / Type Ctrl + Shift + Enter.” Languages. Camera, streams, P5/Tone/THREE in the copy. Line eval is the instrument.
- Ours: `#stage` 1100×464 on desktop (370×681 on a 390 phone with the recipe closed). `textarea#recipe`, no CodeMirror. Eight chips (Osc, Kaleid, Modulate, Shape, Voronoi, Feedback, Spin, Finger). **Run** / Ctrl+Enter applies the whole string through a restricted interpreter (`sketch.js`, no `eval`). Two statements `osc(4).out();\nshape(3).out();` + Ctrl+Enter left a white triangle — last `.out()` wins, not the line under the cursor.

The engine is hydra-synth 1.4.0 GLSL on raw WebGL. Oscillator bands, noise modulate, cyan `shape().repeat().kaleid()`, magenta voronoi, colorama spin, `src(o0)` feedback (Feedback chip continued the previous voronoi frame — correct), `[10,30,50].fast(0.5)` and `() => Math.sin(time)` ran without error. `s0.initCam()` printed the honest block: *needs a live camera, a video file, or the network — this copy is offline.* That is a sandbox law, not a gap to “fix” by fetching a camera. It is still why COMP wins the thing Hydra is for.

### patch-in-GIF — OURS

Proven. Comp’s save is the URL / a sketch_id on hydrasynth.xyz; close the tab without copying and the gallery moves on (`?sketch_id=rangga_2` this load). Ours wrote `gifos.db('save')` and came back. Launch key `go.patch` exists in the manifest (untested this pass).

### invite jam — not a win yet

Comp’s jam is WebRTC video nodes between browsers (a signalling server, camera, `initStream`). Ours is a shared *recipe string* — a different, honest product if a guest actually gets this patch.

Jam together chrome is real: friend bar, “Waiting for a friend… Invite sends the link. You can still edit the patch.”, You / jamming, ← Solo, unique green still on the stage, Invite still OS. Two-tab join did not complete here. Until a guest *lands on this recipe* and a Run on either side updates both, the listing’s “hydra.ojack.xyz cannot do that” is a capability we have not finished — and it is not the original’s jam anyway.

### phone — OURS on the kiosk, COMP on the instrument

390×844: recipe starts closed (`sheetOpen: false`, `#how` / `.foot` `display:none`). Stage 370×681. No horizontal page overflow (`scrollWidth` 390). Jam together / Patch / Run are 40px; chips 36px and scroll (`Voron` clipped — the row is the designed overflow). Kaleid fills the glass; Spin and Voronoi fill it; airplane mode still switched Voronoi. Comp on 390 is the welcome modal over a fullscreen sketch and a tiny CodeMirror — the original never designed a thumb.

OS chrome eats a row (`on this d…`). The picture is still the hero. That is the one place this port is more usable than the website, and it is a kiosk of eight patches, not livecoding.

### ICON — OURS (on a Home Screen)

64×64 sticker next to Welcome / Camera: dark rounded card, five-fold kaleid, magenta/cyan/gold. 12 frames. The loop is the synth, not a wiggle. At phone Home Screen size it still reads “kaleid card,” not a generic square. Comp has no Home Screen icon to beat.

### Cover — COMP, and a drawing of a louder app

Listing hero is `cover.jpg` at 680×409 (390: still the kaleid + pixel recipe + RUN). Mid-use, not empty first-boot, no GifOS shell — the right *moment*. It is a procedural pixel poster of a 5-fold tunnel, not a frame of the running window (live Kaleid is a red/blue osc rectangle in system-ui). It looks more like **Spin** than first-boot Kaleid. Comp’s marketing *is* the live fullscreen synth. At card size the poster still sells “video synth”; at hero you can tell it is a drawing.

### Listing copy — OURS on the page, absent from the grid

Rendered `/store.html#app=hydra`:

- Tagline: “The patch lives in the GIF. Invite jams the same synth — no account, no server.”
- Leads with file-is-the-save / Invite / generated-only / unofficial. Names Hydra / Olivia Jack. Unofficial-port pill. AGPL-3.0, signed by gifos.app, 223 KB, abilities Saves-in-the-icon + Multiplayer, minBuild 947 / release 0.9.0. Honest about no camera / no mic.
- Persist and offline were true of this build. The jam sentence was not shown to a guest.
- Distinct from css-doodle on the page (video synth vs “a little pattern toy”). A stranger browsing Creativity never sees Hydra; they do see CSS Doodle.

The copy is the reason. The grid hole means a stranger searching the name of the original never sees it.

---

COMP still wins the thing Hydra is for. The stranger-reason is real and unfinished: file-is-the-save is done; the livecoding surface, the catalog card, and the Invite landing are not.
