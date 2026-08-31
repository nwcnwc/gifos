# Primitive

Redraw a **photo** using only triangles, rectangles, ellipses or smileys. One shape at a time until a picture appears.

This is a converter, not a drawing app. You start from a picture.

## Load a picture

- **Take photo** opens the camera for a still. You get one frame, not a live stream.
- **Choose a picture** opens a JPEG, PNG or WebP already on this device.
- **Try a sample** loads three coloured circles so you can run the algorithm without bringing a photo.

First open, with nothing saved, is an empty stage. The picture stays on this device.

## Redraw

- **Start** begins adding shapes. This is slow on purpose — each shape is chosen to make the picture more like the photo.
- **Stop** keeps whatever has been drawn so far.
- **Quick / Classic / Fine** pick how many shapes and how hard each one is searched. Classic is the original demo. Quick is faster. Fine takes longer and usually looks closer.
- Tick **Triangles**, **Rectangles**, **Ellipses** or **Smileys**. At least one stays on.
- **Shapes** is how many primitives to add (1–500). More is closer, and slower.
- **More options** holds opacity, background fill, computation size, viewing size, and how hard each shape is searched — the same knobs as the original demo.

The canvas updates as shapes land. **Hold the picture** to see the original; let go to return to the reconstruction.

**Raster** is the painted bitmap. **Vector** is the same picture as shapes you can scale.

## Save

**Download PNG** writes the bitmap. **Download SVG** writes the shapes.

The last **original** photo and the last **reconstruction** stay **in this app file**. Close it, open it later, they are still there — not redrawn from scratch. They do not leave this device.

## Phone

A thumb works on the sliders and the chips. Take photo is the easy path on a phone. Hold the picture to compare. Back stops a run that is still going.

Unofficial port of [primitive.js](https://github.com/ondras/primitive.js) by Ondřej Žára, itself a port of [primitive.lol](https://primitive.lol).
