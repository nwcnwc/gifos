# Primitive — fresh-eyes gauntlet critic

Comp inspected: [ondras.github.io/primitive.js](https://ondras.github.io/primitive.js/) (the named floor). Distinct from Pixel It (pixel blocks / palette snap, not triangles one at a time). One Chromium. **Packed GIF** `site/apps/primitive/primitive.gif` (204 326 B, 31 Aug, persist-bytes rebuild) installed onto a real Home Screen and opened through `run.html` — not the source tree, not a mock `gifos.db`.

## Winner

**OURS**

The 2016 demo is still a mediocre floor: Google Fonts, a CORS URL box, no Stop, no phone empty state, forgets the tab. That is not a ceiling. The persist hole that made the listing a lie is closed on the path a stranger actually uses. Choose a picture, Quick-run, close the app, open the same GIF: the original is a `data:image/png` and the triangles are still there. The original never could say that. Phone chrome, Stop, Take photo, no CDN — those are real. Beating a weak demo is not the same as finishing the category picture, which is still the remaining debt.

## Single biggest remaining gap

**Original and result are not on screen together, and first-run Quick is a smear.** Comp’s whole demo is that comparison: same chosen portrait, default 50 shapes, original sitting next to a readable low-poly face (39 of 50, 93.06% similar when I stopped it). Ours first-run is Quick 20 — a muddy pile, no likeness — and the original is gated behind hold-to-peek. Classic 50 on a phone *does* grow eyes and a mouth (50 shapes · 94.06% similar, 11.7 s), but the landscape stage crops the portrait and you still cannot see the source without holding. The store cover still sells a pixel-font mask the running app does not produce.

## Close / reopen (the persist proof)

Chosen image — **not** Try a sample. A 480×640 portrait PNG via `#file`. Packed `app.js` encodes through `FileReader` → `data:image/` and refuses a `blob:` on restore (`isDurableSrc` / `pickRestoreUrl`; unpacked GIF matches source).

| moment | `pic/src` | `pic/out` | UI |
|---|---|---|---|
| boot | empty | empty | “No photo yet” |
| after Choose | `data:image` 18 686 B (`data:image/png;base64,iVBORw0K…`) | — | original on stage, “Press Start to redraw.” |
| after Quick | same `data:image` 18 686 B | `data:image` 46 870 B, 20 steps, similar 0.101 | “20 shapes · 89.86% similar.” |
| **reopen same fileId** | **same `data:image` 18 686 B** | **same `data:image` 46 870 B** | **“Last reconstruction is still here.”** empty hidden, triangles painted, hold still shows the original |

Take photo shares `loadBlob`; not separately driven (headless has no camera clip). Comp on the same PNG forgets everything the moment you leave.

## Stranger-reason

Asked “you know primitive.js — why this one?” the card answers: *close it, the triangles are still there, nothing is sent, it runs on this device.*

After using it: that sentence is now true of a chosen photo. I can say the file-is-the-save back without lying. I cannot yet say “a photograph becoming triangles you can still see beside the original” — that is still Comp’s page, not ours.

## Wall breaks

- **Save-in-GIF (primary path).** **PASS.** Chosen-photo bytes persist as `data:image/`. Close and reopen is the same picture plus the last triangles. Listing claim is no longer an overclaim.
- **No CDN / MIT.** Packed `COPYING-primitive.txt` (Ondřej Žára, Michael Fogleman). App load is local. Comp pulls Lato from `fonts.googleapis.com` / `fonts.gstatic.com`.
- **Catalog search.** Still a stranger hole, not a sandbox wall: `site/apps/index.json` has no `primitive` (156 apps). Store search “primitive” is “Nothing matches that.” Direct `/store.html#app=primitive` works via `app.json`.

---

### Icon

OURS. 12 frames: three big triangles become a face (hair, skin, mouth, eyes). Reads at 64px; at 32px it is still a portrait. Distinct from Pixel It’s pixel-house loop. Comp’s mark is a low-poly “JS” on yellow — it says JavaScript, not photo-to-triangles. The animation earns the loop. On a busy Home Screen the dark card can sit on top of Welcome; the glyph itself is not the problem.

### Cover / listing art

COMP’s category (a real photograph mid-reconstruction), not this JPEG. `screenshot.png` / `cover.jpg` is a pixel-font mock of chrome the running app does not use (`system-ui` in `style.css`). Invented “50 OF 50  91.20% SIMILAR.” No `coverCrop`. Beside Pixel It’s cover they are twins: same bitmap type, same “PHOTO TO X.”, same “HOLD TO SEE THE ORIGINAL”, same button row. Classic on a portrait is a face; Quick is not that mask.

### Listing copy

Leads with the platform reason, distinct from Pixel It (“triangles”, not “pixel art”), honest about unofficial. The save sentence is now true of Choose a picture. Tagline is a card-sized line. Rendered listing matches `listing.json`. Search will not find it until the catalog index lists it.

### Actually reconstructing a photo

The engine works. Same algorithm as the floor.

- Sample (three circles, prior run): 20 triangles in ~1.5 s, 89% similar.
- Chosen portrait, Quick 20: 2.2 s, 89.86% similar — a smear. Hold swaps to the original.
- Chosen portrait, Classic 50 on 390×844: 11.7 s, 94.06% similar — a face (hair, eyes, mouth).
- Comp on the **same** PNG: original and result side by side the whole time; at 39 of 50 it already reads as a low-poly portrait.

Hold-to-peek is still a demotion of the core loop. Quick is what a first run hits.

### Phone

Empty state is the one place we clearly beat the form wall: 328×44 stacked actions, copy that fits a thumb, no overflow. After a run the stage is a short strip under two rows of buttons plus chips plus slider; hits stay ≥40px, no horizontal overflow. Comp on a phone is a long numbered form and a Let’s go. Ours is usable. The picture is still not the star.

### MIT / no CDN

Packed and labelled. App load is local. Comp is not.
