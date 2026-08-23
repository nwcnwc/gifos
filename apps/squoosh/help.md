# Squoosh

Drop a photo, pick a format, drag the quality — a smaller file comes back on this device. Nothing is uploaded. There is no account, no queue, and no path out to a server.

## Compress an image

1. Drop a picture on the page, or tap the box and choose one. JPEG, PNG, WebP, AVIF, GIF — anything this browser can open.
2. Pick a **format** on the right.
3. Drag **Quality**. Watch **Compressed** and **Saving** change next to a side-by-side of before and after.
4. Tap **Download** when the size looks right. **Another image** starts over.

The divider in the middle is a slider. Drag it (or tap the picture) to wipe between original and compressed. Arrow keys nudge it if the handle is focused.

## Quality vs size

Lower quality is a smaller file and a softer picture. Higher quality keeps more detail and costs bytes. There is no “correct” number — stop when the picture still looks good enough for where you will send it.

**Lossless** (WebP, and always-on for PNG and QOI) keeps every pixel. The file is often bigger than a lossy JPEG at a sensible quality.

**Resize** shrinks the picture before compressing. Turn it on, type width or height; **Keep proportions** is on by default.

**More options** is extra effort, not a second quality slider: progressive JPEG, WebP effort, AVIF speed, JPEG XL effort, PNG level. Higher effort is slower and a little smaller.

## Formats

- **MozJPEG** — ordinary JPEG, usually smaller than a typical export at the same quality. Ready immediately.
- **WebP** — a good default. Lossless is a checkbox.
- **AVIF** — usually the smallest. The first time you pick it on a phone can take a moment.
- **JPEG XL** — excellent, but not every app opens `.jxl` yet. This browser may not preview it; **Download** still works.
- **OxiPNG** — lossless PNG. Level is effort, not quality.
- **QOI** — simple lossless. Preview may be unavailable; download still works.

## What stays here

The picture you drop in never leaves this browser. **Invite** in the bar above the app shares the tool, not the photo. **Save** remembers format, quality, lossless, and resize — so the next photo starts where you left off. The image itself is not kept.

An unofficial port of [Squoosh](https://github.com/GoogleChromeLabs/squoosh) by GoogleChromeLabs. Same compressors, no tracking.
