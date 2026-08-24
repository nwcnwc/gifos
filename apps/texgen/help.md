# TexGen

Build a **procedural texture** from stacked generators. Download a PNG. Nothing is uploaded. The stack lives in this file.

## Layers

A texture is a list of layers. Each layer is a generator plus an operation that folds it into the layers below.

**Add layer** picks a generator:

- **XOR / OR** — bitwise patterns
- **SinX / SinY** — sine stripes. Frequency and offset.
- **Noise / FractalNoise** — grain. Seed the noise to lock a look.
- **CheckerBoard / Rect / Circle** — shapes. Size, position, radius.
- **SineDistort / Twirl / Transform / Pixelate / Posterize** — filters that warp whatever is already there.
- **Number** — a flat tint, useful under other layers.

**Operation** is how the layer combines: `=` replace, `+` add, `-` subtract, `*` multiply, `/` divide, `&` and, `^` xor, min, max.

**Tint** is a colour multiplier on that layer (0–1 per channel).

Tap a layer to edit it. **↑ ↓** reorder, **Copy** duplicates, **Delete** removes it. Order is bottom to top.

Phone Back collapses the open layer.

## Presets and size

The chips above the stack are looks from the original examples (Classic XOR, Twirl, Checkers…). **128 / 256 / 512** is the working size. **Tile** repeats the texture so you can see it as a pattern.

An empty stack is allowed — add a generator, or tap a preset.

## Save

**PNG** writes the texture to this device.

**Keep recipe** stores the current stack under its name, in this file, next to the presets.

The last stack — generators, operations, tints, params, name, size — stays **in this app file**. Close it, open it later, the texture is still there.

Unofficial port of [texgen.js](https://github.com/mrdoob/texgen.js) by mrdoob.
