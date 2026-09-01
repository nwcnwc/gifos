# Smartcrop — gauntlet critic

Bar ONE is Jonas Wagner’s [smartcrop.js testbed](https://29a.ch/sandbox/2014/smartcrop/examples/testbed.html) (drop a photo, width/height, red crop rectangle, debug heatmap, optional face-api / opencv.js from unpkg) **and** a photographer’s crop: a real face kept in a Twitter-size frame, JPEG you would actually post. Distinct from `apps/mini-photo-editor` (drag-handle crop / rotate / filters — store search for `mini-photo-editor` finds that one).

Bar TWO is the platform: the crop runs in the GIF, the original and the frame live in the file, Take photo is a still, nothing is uploaded.

Judged on the packed GIF in `run.html#id=`, the unpacked app, desktop 1100×800 and phone 390×844, `/store.html#app=smartcrop`, Home Screen at 64px, JPEG download, and the testbed in the same headless Chromium. One Chromium. Comp inspected live.

**Winner: COMP**

**Single biggest remaining gap:** The running window is not a crop of a photograph. The testbed’s default is a full-bleed Unsplash face with a red 250×250 box and a real heatmap of skin. Ours boots a 480×320 cartoon, draws it as a postage stamp in the corner of `#stage`, paints **six cyan “face-like” boxes** (the sun is one of them), and on **3:1 Banner** the gold box cuts the head off. Status still says “6 face-like regions kept in frame.” A photographer would not post that banner. Until a real photo fills the stage and the gold box keeps the face on every Twitter chip, COMP wins the thing smartcrop is for.

**Stranger-reason:** I know the testbed. I would open this one when I want a JPEG that actually downloads, a still from Take photo, and the last picture still in the file tomorrow — no CDN, no opencv.js. I would still open the testbed (or drag handles in Mini Photo Editor / Lightroom) when the crop has to be right. File-is-the-save is a reason. A decapitated banner is not.

**Wall breaks:**

- **Catalog (broken).** `site/apps/smartcrop/{smartcrop.gif,app.json,cover.jpg}` exist (197 KB, signed). `site/apps/index.json` has 156 apps and does **not** list `smartcrop`. Store search for “smartcrop” paints “Nothing matches that.” Deep-link `#app=smartcrop` still loads the listing. The grid a stranger browses does not.
- **No CDN (held).** Packed GIF decode: `index.html`, `app.js`, `vendor/smartcrop.js`, `COPYING-smartcrop.txt`, `help.md`. Zero `http://` / `https://` / `googleapis` / `cdn` in the payload except credits URLs. Unpacked play: app requests stay on origin. Comp loads `unpkg.com/opencv.js@1.2.1` and a Haar cascade on first paint, plus face-api.js, jquery, underscore.
- **gifos.db persist (code yes; GIF session died before reopen).** `pic` private holds the original JPEG; `save` holds aspect / minScale / thirds. Unpacked has no `gifos` — expected. Listing claim is about the GIF.
- **Camera is a still (held in the GIF).** First `run.html` open is the OS grant: “Take photos and short videos” — “the finished shot, not a live camera feed.” Unpacked Take photo is honest: “Open this inside GifOS to take a photo.” Manifest `capabilities.camera`, no `getUserMedia` in the app.
- **Solo (held).** No `multiplayer`. Invite is OS chrome and unused. Picture stays private.

---

## Pieces

### tester+crop — COMP

Blind, same job (put the person in a square, then a banner):

- Comp: Unsplash portrait, red rectangle on the face, heatmap of the face, width/height in pixels, All Crops scored down the page. No download.
- Ours: Sample is the procedural cartoon from `demoImage()`. Overlay 480×320. Result canvas 320×320 for 1:1, 480×160 for 3:1, 180×320 for 9:16. Four runner-up thumbs with scores (504 / 449 / 367 / 256). Hold-to-compare really does swap to the cropped JPEG (`stage.comparing`). Download wrote `smartcrop.jpg` 9347 bytes — a real file, the person in a square. No crop handles (`handles: false`).

1:1 keeps the person. 9:16 keeps the person. **3:1 Banner is a chest-and-house strip that chops the skull.** Default Keep more 1.0 is the largest cut that fits, which is the opposite of “jump to the faces” on a wide frame. The library’s killer app was Twitter avatar/banner. The banner fails.

### Face boosts — COMP, and a listing lie

“6 face-like regions” on a one-person cartoon. Cyan boxes on the head **and** the sun. Skin-channel blobs are what the code has (`skinBlobs` on the library’s own skin channel, cap 6). The testbed can turn on tiny-face / opencv; even with Face Detection Off, its default photo is a face. Ours’ copy says faces stay in the frame. The banner and the sun box say otherwise.

### Overlay chrome — COMP

`#stage` does not fill with the photo. The source sits as a stamp in the top-right; the result JPEG sits under a gold rule. Comp’s photo *is* the page. Phone 390×844: no horizontal overflow, 44px buttons, chips wrap — chrome is usable, the stamp is worse.

### Camera still — OURS (in the GIF)

Grant dialog, then Take photo is `gifos.takePhoto({ facing: 'environment' })`. Comp has Choose File. Mini Photo Editor also takes a still; this app does not grow handles after the shot. Distinct.

### Picture-in-GIF — OURS on paper

`picDb.put({ id: 'src', jpg })` under 900k. Aspect in `save`. Comp has no save. Not re-proven this pass after the sandbox Chromium died mid-reopen; the write path is in `persist`/`flush`.

### ICON — OURS (on a Home Screen)

64px: gold crop box on a landscape with a person on the left. Reads as “this finds the person.” Comp has no Home Screen icon. (A bad cell in one install stacked it on Welcome — test placement, not the frames.)

### Cover — COMP on honesty

Listing hero is a pixel poster of the cartoon with a gold 1:1 on the face, cyan face box, Avatar chip, Download JPEG — the right *story*. The live window is system-ui, a postage-stamp overlay, and six face-like boxes. At card size the poster sells “smart crop”; at hero you can tell it is a drawing of a cleaner app than you get. Comp’s marketing *is* the live Unsplash crop.

### Listing copy — OURS on the page, absent from the grid, soft-overclaim on faces

Rendered `/store.html#app=smartcrop`:

- Tagline: “Content-aware crop on this device — faces stay in the frame.”
- Leads with on-device / take a still / nothing uploaded / not a manual crop tool / last picture in the file. Names Jonas Wagner. Unofficial-port pill. MIT. Distinct from Mini Photo Editor in the body (“You do not drag the handles”).
- “the box jumps to the faces” is **not true of 3:1 on this sample**. An overclaim is a failed round.
- Catalog hole: Creativity browse never sees it.

---

COMP still wins the crop of a photograph. The stranger-reason is real and unfinished: JPEG-out and the still are done; the picture, the faces, and the banner are not.
