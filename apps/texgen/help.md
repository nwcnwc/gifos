# TexGen

Build a **procedural texture** from stacked generators. Download a PNG. Nothing is uploaded.

## Layers

A texture is a list of layers. Each layer is a generator plus an operation that folds it into the layers below.

**Add layer** picks a generator:

- **XOR / OR** — bitwise patterns
- **SinX / SinY** — sine stripes. Frequency and offset.
- **Noise / FractalNoise** — grain. Seed the noise to lock a look.
- **CheckerBoard / Rect / Circle** — shapes. Size, position, radius.
- **SineDistort / Twirl / Transform / Pixelate / Posterize** — filters that warp whatever is already there.

**Operation** is how the layer combines: `=` replace, `+` add, `-` subtract, `*` multiply, `/` divide, `&` and, `^` xor, min, max.

**Tint** is a colour multiplier on that layer (0–1 per channel).

Tap a layer to edit it. **Delete** removes it. Order is bottom to top.

## Size

256×256 is the working size. It is plenty for a tile.

## Save

**Download PNG** writes the texture to this device.

The last stack — generators, operations, tints, params — stays **in this app file**. Close it, open it later, the texture is still there.

## Phone

A thumb works on the sliders. The texture canvas stays on screen while you edit.

Unofficial port of [texgen.js](https://github.com/mrdoob/texgen.js) by mrdoob.
