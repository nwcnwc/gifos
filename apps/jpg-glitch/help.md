# JPG Glitch

Corrupt a **still photo** so it looks glitched. The tears, the colour bands, the broken blocks — that is the picture. Nothing is uploaded.

## Load a picture

- **Drop** a JPEG, PNG or WebP onto the dashed box, or tap the box to pick a file.
- **Take photo** opens the camera for a still. You get one frame, not a live stream.

A sample gradient is there when you first open, so the sliders have something to smash.

## Sliders

These are the same four from the original tool:

- **Amount** — how hard each smash hits (0–99).
- **Seed** — where in the file the smash lands (0–100). Same seed, same tear.
- **Iterations** — how many smashes (0–100). More iterations, more wreckage.
- **Quality** — JPEG quality used before the smash (1–99). Lower quality, chunkier damage.

Drag any slider. The canvas updates. If a combination decodes as a grey smear, change the seed.

## Save

**Download JPEG** writes the glitched still to this device.

The last picture and the last slider values stay **in this app file**. Close it, open it later, they are still there.

## Phone

A thumb works on the sliders. Take photo is the easy path on a phone.

Unofficial port of [jpg-glitch](https://github.com/snorpey/jpg-glitch) by Georg Fischer (snorpey).
