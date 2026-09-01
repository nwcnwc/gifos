# Trianglify Studio — gauntlet critic

Blind A/B against **[trianglify.io](https://trianglify.io)** (Quinn Rohlf’s GUI, same 4.1.1 generator). Played the packed GIF `site/apps/trianglify-studio/trianglify-studio.gif` in the real sandbox (`run.html#id=`), desktop 1100×820 and phone 390×844. Listing at `/store.html#app=trianglify-studio`. Home Screen icon next to Camera / Welcome. Persist across reopen. PNG + SVG actually downloaded. Host pressed Share the wallpaper and OS Invite minted `#j=`. Guest join died with the host browser on this box — not scored as a product red. Comp in the same Chromium. Distinctness checked against ui-gradients, texgen, css-doodle.

**Winner: COMP**

A stranger who uses trianglify.io would not switch. The original is a wallpaper studio: the picture is the page, width and height are numbers, palettes are a grid, Export is a sheet. Ours is a settings form with a 480 px preview. The listing’s reason is a free full-size PNG. The file that arrived was **300×150**.

## Stranger-reason

Asked: you know trianglify.io — why would you use this one?

The listing’s answer: *it works on a plane, the last palette and seed stay in the file, a friend who opens your invite is looking at the same one, PNG and SVG download at wallpaper size, no account.*

After a cold run:

| claim | this build |
| --- | --- |
| plane / no tab on the internet | true — app-frame requests stayed on origin |
| close it, same wallpaper | true — Spectral · `harbor-17` survived reopen in `gifos.db('save')` row `wallpaper` |
| friend on the same seed | host path is real (friend bar, OS Invite, `#j=` link). A second screen was not measured |
| PNG at wallpaper size | **false** — `trianglify-Spectral-harbor-17.png` is 300×150, top-left crop |
| SVG at wallpaper size | true — `width='1920' height='1080'`, 1022 `<path>`s, 110 KB |
| no account | true |

The original’s reason is still the one a wallpaper person can say: the picture is huge on the page, I can type 1440×900, I can copy a shareable link. Ours took the PNG they would actually set as a desktop and returned a postage stamp.

## Single biggest remaining gap

**`downloadPng` never sizes the canvas.**

```js
var canvas = document.createElement('canvas'); // 300×150
pattern.toCanvas(canvas, { scaling: false, applyCssScaling: false });
```

trianglify’s `toCanvas` only writes `canvas.width` / `canvas.height` when `scaling` is truthy. Probe in the running GIF:

- empty canvas + `{scaling:false}` → **300×150**
- empty canvas + default scaling → 1920×1080
- pre-sized canvas + `{scaling:false}` → 1920×1080

The downloaded PNG is the top-left of Spectral, magenta-to-orange, not the rainbow on screen. Status still said a wallpaper came out. The cyan **PNG** button is the product. Until it writes HD/QHD/4K/phone, Bar TWO is a lie, and the listing’s lead sentence about trianglify.io’s paid high-res is pointing at a file we do not ship.

SVG already does the job (`toSVGTree` uses pattern width/height). PNG is the button a phone taps.

After that is fixed, the glance still loses: the wallpaper is a rounded thumbnail over a dock, not the page.

## Wall breaks

- **Catalog index (fail to ship).** `site/apps/trianglify-studio/{trianglify-studio.gif,app.json,cover.jpg}` exist (GIF 246 KB, signed gifos.app 2026-08-31). `site/apps/index.json` has 156 apps and does **not** list `trianglify-studio`. Store search for `trianglify` paints **Nothing matches that.** `#app=trianglify-studio` still loads `app.json`. Creativity already lists css-doodle, texgen, ui-gradients. A stranger browsing the grid cannot find this.
- **Listing truth (failed round).** “Download a PNG or SVG at wallpaper size” — SVG yes, PNG no. Overclaim, not a style note.
- **No CDN / remote load (held).** App source has no `https://`, `localStorage`, `eval`. Comp loads Typekit, Google Analytics, Stripe (`use.typekit.net`, `www.google-analytics.com`, `js.stripe.com`).
- **gifos.db persist (held).** Private `save` row `wallpaper` wrote seed/palette/cell/variance/look/fill/sizeId. Reopen screenshot is Spectral · harbor-17, not first-boot YlGnBu · sunset-42.
- **GPL-3 inside the GIF.** Packed as `COPYING.txt` + `COPYING-trianglify.txt` (build.mjs). Unofficial, `blessed: false`, bugs to GifOS. Honest.
- **Invite is OS chrome (held).** `#appinvite` is the sandbox bar, not an in-app sheet. **Share the wallpaper** only enters the room, then tells you to press Invite. Correct shape.
- **minBuild 947 / no `network` cap.** Honest on paper.

## Face

### Icon — OURS

12 frames, 128², 120 ms, loop. A rounded card of real triangles; the mesh holds still while the wash cycles YlGnBu → Spectral → YlOrRd → RdPu. At Home Screen size (~64 px) next to Camera it still reads as triangle wallpaper, not a decoration. The loop earns its keep. Comp is a website with no icon.

Install landed on top of Welcome.gif at (48,48) because this critic stuffed `putItem` instead of `saveItem` — that is the harness, not the store. The ornament itself is the win.

### Cover — COMP

`cover.jpg` / listing hero is a 1200×720 pixel-font poster: full-bleed Spectral, `SUNSET-42`, PNG / SVG / SHARE overlay, `SPECTRAL  HD 1920×1080`. It is not a frame of the running app.

- Live UI is system-ui, a 854×480 preview in a rounded stage, dock **under** the picture (Seed, unnamed chips, Mesh/Scatter). PNG/SVG sit below the fold on a 1100×820 desktop until you scroll.
- First boot is **YlGnBu · sunset-42**, not Spectral. Cover is the mid-use it claims; the chrome is invented.
- Listing hero (680-wide): triangles and SUNSET-42 read. Grid card (240×150): SVG becomes mud (`SU8`), SHARE becomes `SHRRE`, SPECTRAL HD dies. The triangles still say “low-poly wallpaper.”

trianglify.io’s marketing *is* the live generator. Ours does not look like the app you get when you tap Install.

### Listing copy — COMP (overclaim)

Rendered listing matches `listing.json`. Tagline is a card line: *Low-poly triangle wallpapers. The seed lives in the file. One invite shares it.* Description leads with trianglify.io’s tab + paid download, then the GIF, then how to click. Credits are honest (Quinn Rohlf, unofficial, GPL-3.0, 246 KB, signed).

The PNG sentence is false of this build. Search will not find it until the catalog lists the slug.

## Distinct from ui-gradients / texgen / css-doodle

Same store-art family (pixel type, SHARE, a coloured field). Different products:

| | field | what you take home |
| --- | --- | --- |
| ui-gradients | named CSS ramp (`Loody Mary`) | copy the recipe |
| texgen | XOR / noise layers, 256² tile | PNG of a texture stack |
| css-doodle | CSS-grid snippet; cover happens to be right-triangles | a recipe square |
| this | Colorbrewer + Delaunay mesh + seed | wallpaper PNG/SVG |

Live, they do not collide: no CSS textarea, no layer stack, no copy-CSS. The css-doodle cover is the one glance that could confuse a grid card — geometric tiles vs an organic mesh. The running window does not.

## Play

### Generator chrome — COMP

Same library (`trianglify@4.1.1`, pin `f3a15f4b…`). Worse room.

trianglify.io (1280×800): left rail Width / Height **as numbers**, Color Pattern Gradient / Sparkle / Shadows, Pattern Intensity, Triangle Variance, Cell Size, Randomize, Palette Colorbrewer **grid** + Custom, one 1440×900 canvas as the page, Export at the bottom of the picture.

Ours: 27 Colorbrewer chips as a horizontal strip with **no names** (YlGn…RdYlGn; ~13 visible, last one clipped). Seed is a word-number (`sunset-42` / `harbor-17`) — that is ours, and it is better than a hash. Mesh 24–180 and Scatter 0–1 match the library. Linear / Sparkle / Shadows / Wire exist. Size is six presets (HD/QHD/4K/phone/square/wide), not a typed pixel. No custom colours, no independent `yColors`, no pattern-intensity bias (hardcoded `interpolateLinear(0.5)`).

The picture is 960×540 internally, painted at 854×480, letterboxed in `#stage`. ScrollHeight 1009 / client 788: Looks peek the fold, PNG/SVG do not, until you scroll. Comp’s picture is the product. Ours is a form that happens to preview.

**Wire is a slogan.** `fill:false` / `aria-pressed=true` / gold chip all flipped. `#wall` is not cleared; `toCanvas` draws strokes on the previous fill. Sparkle and Wire screenshots are the same filled mesh.

Shuffle palette keeps the seed (RdPu · sunset-42). New seed / typed seed / Spectral chip all paint. The generator works. The studio around it is the original’s leftover controls in a column.

### PNG — COMP (ours is not a wallpaper)

Downloaded `trianglify-Spectral-harbor-17.png`: **300×150**, 18 KB, top-left of the Spectral field. Preview on screen was the full rainbow at HD. Comp’s live canvas is already 1440×900; Export then offers Download PNG / Download SVG / Copy Shareable Link. Stripe scripts are on the page; I did not finish a download, so I will not swear the 2022 $8 gate is still in front of the file. I will swear their *on-screen* picture is already a wallpaper, and ours is not.

### SVG — OURS

`trianglify-Spectral-harbor-17.svg`: `width='1920' height='1080'`, xmlns, 1022 paths, status `SVG 1920×1080 downloaded.` Free, no account, no Stripe. This is the one export that keeps the listing’s promise.

### Wallpaper-in-GIF — OURS

Proven. Set Spectral · harbor-17, wait the 250 ms debounce, reopen the same `run.html#id=`: HUD, seed box, selected chip, and `gifos.db('save').get('wallpaper')` all still harbor-17 / Spectral / cell 75. Comp forgets the tab (unless their shareable link is the save — that is a URL, not this file).

### Invite shares the seed — not a win yet

**Share the wallpaper** enters friend mode: Share hides, bar reads *Press Invite (GifOS menu)… Waiting for a friend… they start from this wallpaper.* `TFMp.busy()` true. OS **Invite** minted `run.html#j=aagtsfyv49&relay=ws://127.0.0.1:8790`. The host then vanished (box, not the app) before a guest mounted. Comp has Copy Shareable Link — a serialized recipe, one person at a time, no live roll. Ours is the right shape and was not finished as a two-screen fact this run. Do not print “they get the roll” as scored.

### Phone — OURS on chrome, COMP on the picture

390×844: wallpaper is a 364×205 strip. Seed, six chips, Mesh/Scatter, Linear/Sparkle/Shadows, Wire, Size, PNG, SVG, and the how-line all fit without a horizontal overflow (scrollHeight 910 / 812). Shuffle wraps a row. That is a usable phone form. It is not a wallpaper. Comp’s phone still puts the mesh in the middle of the screen.

### No Typekit / Analytics / Stripe — OURS (wall held)

Required, and held. Comp is a SaaS page. The cost of no webfont is nothing here — both are system/UI chrome plus triangles.

## Bar check

Bar ONE is not mediocre. trianglify.io is the author’s GUI: live mesh, typed size, Colorbrewer grid, Sparkle/Shadows, Export, shareable link. “As good as” would already lose on a port. This is worse on the picture, and the free PNG that was supposed to beat the paywall is a 300×150 crop.

Bar TWO is why this should have won. Persist is done. SVG is done. Offline is done. PNG is not. Invite was not a second screen. Until PNG is actually the size on the picker, a stranger who came from trianglify.io still has no reason they can say back without lying.
