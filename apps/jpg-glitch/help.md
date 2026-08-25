# JPG Glitch

Corrupt a **still photo** so it looks glitched. The tears, the colour bands, the broken blocks — that is the picture.

## Load a picture

- **Take photo** opens the camera for a still. You get one frame, not a live stream.
- **Choose a picture** opens a JPEG, PNG or WebP already on this device.
- **Try a sample** loads a small gradient so the sliders have something to smash.

First open, with nothing saved, is an empty stage — not a blank canvas. The picture never leaves this device.

## Sliders

These are the same four from the original tool:

- **Amount** — how hard each smash hits (0–99).
- **Seed** — where in the file the smash lands (0–100). Same seed, same tear.
- **Iterations** — how many smashes (0–100). More iterations, more wreckage.
- **Quality** — JPEG quality used before the smash (1–99). Lower quality, chunkier damage.

**Mild / Classic / Heavy / Melt** set all four at once. **Random seed** keeps the other sliders and picks a new tear. Drag any slider. The canvas updates. If a combination decodes as a grey smear, change the seed.

**Hold the picture** to see the original; let go to return to the glitch.

## Save

**Download JPEG** writes the glitched still to this device.

The last **original** picture and the last slider values stay **in this app file**. Close it, open it later, they are still there — smashed again with the same recipe, not glitched twice.

## Phone

A thumb works on the sliders. The track is fat enough to drag. Take photo is the easy path on a phone.

Unofficial port of [jpg-glitch](https://github.com/snorpey/jpg-glitch) by Georg Fischer (snorpey).
