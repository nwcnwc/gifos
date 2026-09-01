# Background Removal — gauntlet critic

Blind play of **OURS** (shipped `site/apps/background-removal/background-removal.gif` in the GifOS sandbox, store listing at `/store.html#app=background-removal`, icon frames, packed filesystem) against **COMP** ([remove.bg](https://www.remove.bg)). Unpacked `apps/background-removal/` was used only to paint the work panel after the 12 MB GIF's inlined ORT wasm OOMed later boots on this box — same `index.html` / `style.css` / `app.js` the GIF carries. Models are optional pins (44 / 88 / 176 MB); none were cached; a live IS-Net cut did not finish. Distinct from Squoosh (compress), mini-photo-editor (crop / rotate / filter), Pixelit (pixel-art convert): this is the cut-out.

**Winner: COMP**

A stranger who knows remove.bg does not switch. The listing's reason is three clauses — the photo never leaves, no account or watermark, last cut still in the file — and they cannot say all three back after using the build that ships.

## Stranger-reason

Asked: you know remove.bg — why would you use this one?

The listing's answer is on-device, no account, no watermark, and "Close it and come back: the last picture and the last cut are still here, inside the file."

- Photo never uploaded: **true**. No `fetch` / XHR / WebSocket / `getUserMedia` in `app.js`+`engine.js`. Manifest has no `network`. Sandbox CSP is `connect-src blob: data:` (wasm hatch). The picture has no path out. Model weights are optional `gifos.assets` pins fetched by the OS, hash-checked, never the user's photo. `capabilities.multiplayer` is refused at pack time. Invite is OS chrome; the app does not draw it.
- No account, no watermark, full-resolution PNG: **true**, and it is the one place this beats the named bar today. remove.bg's free download is a 0.25 MP preview (~625×400); HD is credits (about $9 / 40, ~$0.13–0.23/image) and an account. Ours has no credit, no queue, no resolution gate.
- Last cut in the file: **false for the pictures the empty state asks for.** `persistSrc` writes a JPEG data URL only if `url.length < 900000` (`SRC_CAP`). `MAX_EDGE` is 4096, so a dropped phone photo is kept at camera size, then the save silently no-ops. `persistOut` uses the same cap on a PNG. `persistMask` doubles it and still `.catch`es into the void. Take-photo clips (often 640–1280) might fit; "Choose a picture" / drop of a 12 MP still does not. Reopen therefore restores a sample blob, not the headshot you protected.

remove.bg's reason is still the one a stranger can say: drop a real photo, five seconds, hair is right, Magic Brush if it isn't. This port took the upload away and did not replace it with a save that survives a camera still, or a brush when IS-Net is wrong.

## Single biggest remaining gap

**The GifOS save is a thumbnail trap, and the first minute is an 88 MB download of a cartoon.**

`SRC_CAP = 900000` was copied from Pixelit, where `MAX_EDGE` is 800 and every picture fits. Here the edge is 4096. The listing still claims the file is the save. That is an overclaim, not a style note.

Worse, the model picker lives in `#work`, which is hidden until a picture exists, and the default is Medium. The first cut always queues ~88 MB. You cannot pick Small first. "Try a sample" is `sampleImage()`: ellipses on a red gradient, the same blob as the icon and the cover. remove.bg's empty state is a real photograph. Ours demonstrates a cut of nothing a stranger would protect.

Until a dropped photo actually comes back inside the GIF, and the first thing you try is a photograph whose model size you chose, the privacy win is a sentence on the listing.

## Piece judgements

### Icon — OURS

12 frames, 128², 120 ms, loop. Head-and-shoulders on a coral wall that dissolves into checkerboard. At Home Screen size (~64–96px) next to Camera / Meeting / App Store it still reads as a cut, not a generic portrait. The loop earns it: the background goes away. Tiny. COMP is a website with a wordmark.

### Cover — COMP

`cover.jpg` is a 1200×720 pixel-font poster of the same blob person on checkerboard, TAKE PHOTO / CHOOSE / DOWNLOAD PNG, colour chips, "CUT ON THIS DEVICE." It is not a frame of the running app and it is not a cut of a photograph. Listing hero (680×409): readable as "background removal," toy-like next to remove.bg's real-hair product shots. Grid-card size, the blob survives; "HOLD TO SEE THE ORIGINAL" dies. A cover that shows a drawing the first sample also is, loses to the original's honest photograph.

### Listing — COMP (overclaim + invisible)

Deep link `/store.html#app=background-removal` renders `app.json`. Tagline is the card line the gauntlet asked for. Body leads with no upload / no account / no watermark / no queue, then names the unofficial IS-Net port and the honest 44 / 88 / 176 MB pins. "Unofficial port" chip is correct (`blessed: false`). Signed by gifos.app. 12 MB download · extra files later. Abilities: saves in the icon, camera, wasm, GPU, extra files.

Two failures:

| claim | running build |
| --- | --- |
| "the last picture and the last cut are still here, inside the file" | `persistSrc` / `persistOut` drop any data URL ≥ 900k chars; a 12 MP drop never writes |
| Search "background" on `/store.html` | **"Nothing matches that."** Slug is absent from `site/apps/index.json` (156 listed apps; Squoosh / Pixelit / mini-photo-editor are in). Grid cannot find it. `?run=background-removal` still resolves by filesystem path, so a link works and browsing does not. |

LICENSE line on the listing is `AGPL-3.0 · Copyright (C) 2007 Free Software Foundation, Inc.; Copyright (c) Microsoft Corporation` — the AGPL preamble and ORT, not IMG.LY. Packed `credits.json` repeats it.

### Product UI — COMP against remove.bg, OURS against a library demo

The empty state is a real product: Take photo / Choose a picture / Try a sample, lead line "The picture never leaves this browser," footer names the unofficial AGPL port. Phone 390×844 stacks the three actions; desktop 1100×820 puts them in a row. OS abilities sheet on first GIF boot asks for camera, wasm, GPU, extra files (~294 MB if you take every pin) — Confirm & Save, not buried. Engine line in the GIF was honest on this box: `navigator.gpu` exists, adapter is a software fallback, so "Cuts run on the processor."

After a picture, the work panel is the right shape: colour chips (transparent / white / black / studio / green / blue / custom / picture), feather 0–12, soft shadow, invert, Small/Medium/Large with byte honesty, Download PNG / JPEG, "Hold to see the original."

It is not the version you actually use instead of remove.bg:

- **Sample is a cartoon.** First click is not a photo. Hold-hint is shown as soon as `showWork(true)`, before a mask exists, so the overlay lies during the first cut.
- **`#bgImageBtn` ("Use another picture as the background") is dead.** Click does not open `#bgfile`. The Picture chip does (`$('bgfile').click()`). Duplicate chrome, one wired.
- **No Magic Brush.** Feather is a box blur on the mask. Invert keeps the background. There is no add/remove stroke. remove.bg's named product is the one-click cut *plus* the brush for the hair it still misses. IS-Net at 1024, `keepAspect false`, is the library default — hair and semi-transparent objects still lose, and this UI cannot recover them. Not measured live this session (model uncached; GIF unpack OOM'd a second boot). The gap is the missing tool, not a guessed PSNR.
- **Downloads sit enabled in markup** until `runCut` flips them. Hidden while empty; visible and clickable in the race between `adoptSrc` and the first `running = true`.
- **Custom colour** is always on screen, not only when Custom is selected.

Phone after sample: stage + chips fit; invert + model cards need a scroll. Fine. remove.bg's phone web app is still the faster path to a real cut.

### Cut-in-GIF / last-cut restore — COMP

Implemented, then capped to death. Sample 720×960 JPEG at 0.72 would fit and would restore. A dropped camera still would not. The gauntlet WIN's third clause is the one a GifOS app is supposed to have over a website. It is the clause that fails.

### No upload path — OURS (wall held)

App-frame network from the GIF boot: nothing off origin from app code. Picture never posted. ORT's vendored `fetch(` / `XMLHttpRequest` count (4 / 2 in packed `ort.js`) is the inlined wasm loader; `wasmBinary` is set from `BR_ORT_WASM_B64`; CSP would kill an `https://ort.invalid/…` fallback. Models, when asked for, leave through `gifos.assets` in the trusted parent, URL and sha256 baked in `manifest.json` / `MODEL-PINS.json`, `optional: true`. That is a pin, not an upload of the photo.

### AGPL packed? — yes

GIF filesystem (13 files): `COPYING.txt` (33 KB) is the full GNU AGPL v3 plus an IMG.LY unofficial-port notice and the GitHub tree URL; `LICENSE-onnxruntime.txt` (MIT) rides beside it; `UPSTREAM.txt` names `@imgly/background-removal` 1.7.0 @ `12f56cc`; `help.md` is inside. `build.mjs` refuses to pack without the AGPL text, `basedOn.blessed === false`, and `listing.license === 'AGPL-3.0'`. The weights are not in the GIF (optional pins). Source that corresponds is the packed scripts + this tree.

## Wall breaks

- **No remote load of the picture.** Held.
- **unsafe-eval.** Held (`'unsafe-inline' 'wasm-unsafe-eval'` for the wasm hatch). GIF boot of the empty UI did not throw.
- **Saved data in gifos.db.** Promised; written only under `SRC_CAP`. A real drop is a silent miss. Listing overclaim.
- **Store catalog.** Broken: `site/apps/index.json` does not contain `background-removal`. Cover, GIF, and `app.json` are on disk. Search cannot find it. `build.mjs` says not to run `build-app-catalog.mjs` from this tree — and nobody else did.
- **minBuild 1381 / optional assets / gpu / unofficial / AGPL inside the GIF.** Honest on paper.
- **Invite is OS chrome.** Correctly not drawn. Photos stay private.

## Bar check

Bar ONE (remove.bg) is not mediocre. Instant cloud cut, hair, Magic Brush, batch, API, Photoshop plugin, 1B+ images/year. Free is a preview on purpose. "As good as" would already lose on a port of the in-browser library; this is the library's inference path with a product chrome around it, and the chrome still cannot fix a mask or remember a 12 MP still.

Bar TWO is why this should have won: photo never leaves, no account, no watermark, last cut in the GIF. Two of those are true. The third is the GifOS reason, and it is the one that does not survive a dropped photo.

Squoosh / mini-photo-editor / Pixelit are different verbs (smaller / crop-filter / pixelate). This is not a clone of those. It is an unfinished remove.bg.

## What I actually opened

- COMP: remove.bg marketing, pricing, help ("100% free for low-resolution images up to 0.25 megapixels"), 2026 reviews of the credit gate.
- OURS: shipped 12.0 MB GIF (ORT wasm inlined ~28 MB as JS; IS-Net not packed). Sandbox boot: empty DOM, abilities sheet, `window.gifos.{db,assets,takePhoto}` present, `ort` object present, engine line on processor, CSP `connect-src blob: data:`. Store detail (cover 1200×720, tagline, unofficial chip, 12 MB + extra files). Store search "background" empty. Icon 12 frames. Packed `COPYING.txt` / `credits.json` / `manifest.json`. Work panel from the same files at 1100×820 and 390×844 after Sample (cartoon 720×960, Medium selected, dead background-image button, hold hint on an uncut picture). Live cut not completed: model uncached, later GIF boots died unpacking ORT on a loaded 4-core box.
