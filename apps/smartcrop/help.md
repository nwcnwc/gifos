# Smartcrop

Content-aware crop on this device. The box jumps to the **faces** and the interesting bits — not a centred slice of empty sky. Nothing is uploaded.

This is not a manual crop tool. You do not drag handles. The picture tells it where to cut.

## Load a picture

- **Take photo** opens the camera for a still. You get one picture at a time — there is no live viewfinder inside the app.
- **Choose a picture** opens a JPEG, PNG or WebP already on this device.
- **Try a sample** loads a small portrait so you can see the box move before bringing your own photo.

Put a picture on the window, or paste one.

## Frames

Tap a frame. Each one is a real size people actually use:

- **1:1 Avatar** — a profile square
- **3:1 Banner** — a wide header
- **16:9 Wide** — a landscape still
- **4:3 Photo**
- **4:5 Portrait**
- **9:16 Story**
- **2:1 Card**

**Keep more** — leave it at the right for the largest cut that still fits the frame. Slide left to let the box zoom in on a face.

**Rule of thirds** (on by default) prefers eyes and detail on the thirds, not dead-centre.

**Heatmap** paints the score: skin in red, edges in green, colour in blue. Cyan boxes are skin regions treated as faces. The gold box is the crop.

## Pick a runner-up

Under the picture, the top-scoring cuts appear as thumbs. The gold one is the winner. Tap another if you like that frame better.

## Save

**Download JPEG** writes the cropped picture on this device. That file is yours.

The last **original** picture and the last frame stay **in this app file**. Close it, open it later, they are still there — cropped again, not cropped twice.

## Phone

A thumb works on the frame chips and the thumbs. Take photo is the easy path.

Unofficial port of [smartcrop.js](https://github.com/jwagner/smartcrop.js) by Jonas Wagner.
