# Primitive — fresh-eyes gauntlet critic

Comp inspected: [ondras.github.io/primitive.js](https://ondras.github.io/primitive.js/) (the named floor). Distinct from Pixel It (pixel blocks / palette). One Chromium. App run from `apps/primitive/` with a `gifos.db` stub; listing at `/store.html#app=primitive`; cover and icon judged at store-card, listing-hero, 64px and 32px.

## Winner

**COMP**

The 2016 demo is a mediocre floor — Google Fonts, a CORS URL box, no Stop, no phone, no empty state, forgets the tab. Beating that by a hair is still shipping something weak. This port has the right chrome (empty state, Quick/Classic/Fine, Stop, Take photo, fat 44px controls, no CDN) and the algorithm does run. It does not yet beat the *category* bar, which is a photograph becoming triangles you can still see beside the original, and it does not deliver the platform reason it prints on the card.

## Single biggest remaining gap

**Choose a picture / Take photo do not save the original.** `loadFromUrl(blobUrl, false)` encodes a data URL, then the second `onload` does `srcDataUrl = url` and persists the dead `blob:` string (63 chars: `blob:http://127.0.0.1:8194/…`). Close and reopen is first boot — empty stage, “No photo yet” — even though `pic/out` held a 40 KB reconstruction. Try a sample is the only path that keeps a real data URL.

That is the listing’s lead sentence, and it is false for the path a stranger actually uses.

## Stranger-reason

Asked “you know primitive.js — why this one?” the card answers: *close it, the triangles are still there, nothing is sent, it runs on this device.*

After using it: the reconstruction **does** run here, offline, with a camera clip and a Stop button the original never had. That is a real reason. I cannot say the file-is-the-save back without lying, because a chosen photo does not come back. Until that is true, the stranger’s answer is a shrug plus “nicer phone chrome.”

## Wall breaks

- **Save-in-GIF (primary path).** Current-version data for a chosen / camera picture does not load after close. Reconstruction bytes are written; restore prefers the dead `src` blob and `onerror`s into the empty state. Sample-only persist is not the claim. Listing overclaim: *“The photo and the reconstruction live in this file. Close it, open it later, the triangles are still there.”*
- **No other load-time walls.** MIT notice is packed as `COPYING-primitive.txt` (Ondřej Žára, Michael Fogleman) and shown on the listing. No CDN, no webfont, no remote request while the app ran. Comp loads Lato from `fonts.googleapis.com` / `fonts.gstatic.com`. Leftover `Canvas.original` still assigns `img.src = url` and alerts CORS — dead, not called at boot.

Not a sandbox wall, still a stranger hole: `site/apps/index.json` has no `primitive`. Search “primitive” on the store is “Nothing matches that.” Direct listing URL works via `app.json`.

---

### Icon

OURS. 12 frames, 100 ms: three big triangles become a face (hair, skin, mouth, eyes). Reads at 64px; at 32px it is still a portrait, not a landscape. Distinct from Pixel It’s pixel-house loop. Comp’s mark is a low-poly “JS” on yellow — it says JavaScript, not photo-to-triangles. The animation earns the loop.

### Cover / listing art

COMP’s category (a real photograph mid-reconstruction), not this JPEG. `screenshot.png` is a pixel-font mock of chrome the running app does not use (`system-ui` in `style.css`). Invented “50 OF 50  91.20% SIMILAR.” No `coverCrop`. At 240×150 (store `16/10`, top-center) the title and a clip-art face survive; the chrome is noise. Beside Pixel It’s cover they are twins: same bitmap type, same “PHOTO TO X.”, same “HOLD TO SEE THE ORIGINAL”, same button row. The running app at Quick on a portrait is a muddy smear, not that mask.

### Listing copy

Leads with the platform reason, distinct from Pixel It (“triangles”, not “pixel art”), honest about unofficial. Then it overclaims the save (failed round, not a style note). Rendered listing matches `listing.json`. Tagline is a card-sized line. Search will not find it until the catalog index lists it.

### Actually reconstructing a photo

The engine works. Sample (three circles) → triangles in ~1.5 s at Quick, 89% similar; hold swaps to the original. A portrait PNG → 20 triangles in ~1.3 s, 93% similar — a face-shaped pile, not a likeness. Classic/Fine exist; Quick is what a first run hits, and it does not look like the cover. Comp keeps original and result side by side the whole time. Hold-to-peek is a demotion of the core loop.

### Phone

Empty state is the one place we clearly beat the form wall: 328×44 stacked actions, copy that fits a thumb. After a run the stage is a 362×260 strip under two rows of buttons plus chips plus slider; no horizontal overflow, 44px hits. Comp on 390px is a long numbered form and a Let’s go. Ours is usable. The picture is not the star.

### MIT / no CDN

Packed and labelled. App load is local. Comp is not.
