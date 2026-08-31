# Hydra

A live-coded video synth. You write a short chain of sources and effects; the picture is the result. Time moves. A finger on the picture is `mouse`.

## The loop

1. Tap a named patch under the picture — **Osc**, **Kaleid**, **Modulate**, **Shape**, **Voronoi**, **Feedback**, **Spin**, or **Finger**.
2. The recipe appears in the box. Change a number, a colour, or a count of kaleidoscope sides.
3. Press **Run** (or Ctrl+Enter / Cmd+Enter). The picture becomes yours.
4. **Patch** hides or shows the recipe so the picture can fill the screen. On a phone the recipe starts closed.

The name in the top-right is the patch you are on, or **Yours** once the recipe no longer matches one of the eight.

## The dialect

A patch is a chain. It starts with a source, then effects, and ends with `.out()`:

- **Sources:** `osc(freq, sync, offset)`, `noise(scale, offset)`, `voronoi(scale, speed, blending)`, `shape(sides, radius, smoothing)`, `gradient(speed)`, `solid(r, g, b, a)`, `src(o0)` (the last frame — feedback).
- **Colour:** `.color(r, g, b)`, `.hue()`, `.saturate()`, `.invert()`, `.contrast()`, `.brightness()`, `.colorama()`, `.posterize()`.
- **Geometry:** `.rotate(angle, speed)`, `.scale()`, `.kaleid(sides)`, `.repeat(x, y)`, `.pixelate()`, `.scroll()`, `.scrollX()`, `.scrollY()`.
- **Mix:** `.blend(other)`, `.mult(other)`, `.add(other)`, `.diff(other)`, `.modulate(other)`, `.modulateRotate(other)`, `.modulateScale(other)`, `.layer(other)`, `.mask(other)`.

A number in parentheses can be a function of time: `() => time * 0.2`. `mouse.x` and `mouse.y` follow a finger on the picture. Arrays such as `[1, 2, 3].fast(0.5)` step through values.

This copy has no camera and no microphone. `s0.initCam()` and friends will say so. Use a generated source instead.

## A live friend

Playing alone is the original synth. The last patch stays in this file.

Want a friend on the same picture? Press **Jam together** (if you do not already see the friend bar), then **Invite** in the bar above the app, and send the link. You both start from this patch. When anyone presses **Run** or taps a named patch, everyone gets it.

**← Solo** puts you back on the original toy with the patch you left.

## What is saved

The last patch lives in this file. Close it, come back, the picture is still that recipe. A live jam is the room for that invite, not a second save.
