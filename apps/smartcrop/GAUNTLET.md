# Smartcrop gauntlet

**Win:** A stranger who knows the smartcrop.js testbed uses this copy because the crop actually happens here — Twitter-size frames, faces kept in, JPEG out, and the last picture lives in the file — instead of a red box on a page that talks to CDNs.

## Bars

- **ONE** — [smartcrop.js testbed](https://29a.ch/sandbox/2014/smartcrop/examples/testbed.html): drop a photo, width/height sliders, a red crop rectangle, debug heatmap, optional face-api / opencv.js from a CDN. Twitter-style auto-crop (avatar / banner) is the job people actually hired it for.
- **TWO** — the crop runs on this device; the original and the frame stay inside the GIF; Take photo is a still; nothing is uploaded.

## Pieces always in the gauntlet

| piece | verdict |
|---|---|
| ICON | Gold crop box slides off-centre onto a face; the rest dims. Reads at 64px as "this finds the person". |
| STORE ART | Mid-use: portrait left, landscape right, gold 1:1 on the face, cyan face box, Avatar chip on, Download JPEG. |
| LISTING COPY | Leads with on-device + faces stay in frame. Names the job (not a manual crop tool). |

## Rounds

1. Vendor smartcrop.js 2.0.5 (main `0e207ed`, MIT). Scaffold like Pixel It.
2. Product: drop / take / paste / sample, Twitter aspect chips, two-pass skin-blob face boosts, runner-up thumbs, heatmap, JPEG out, last original + frame in the file.
3. Cover, icon, listing, help. Build-time 1:1 crop of a wide synthetic face lands at x=0 (left), not the empty half.
4. Critic: the original demo only draws a red rectangle — always show the cropped JPEG under the overlay (hold still goes full-size). Face on the cover was a hair blob; redrawn with eyes. Silent My Media put removed. Keep-more help was backwards; fixed.

## Remaining gap

Real viola-jones / tiny-face is still heavier than the GIF; skin-channel blobs are the honest face stand-in the library already computes.
