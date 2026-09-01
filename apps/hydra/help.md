# Hydra

A live-coded video synth. The picture is the window. You type a chain of sources and effects on it. Time moves. A finger on the picture is `mouse`.

## The loop

1. A gallery sketch is already running. Change a number in the overlay.
2. **Ctrl+Enter** (or Cmd+Enter) runs the line under the cursor. **Alt+Enter** runs the block. **Ctrl+Shift+Enter** or **Run** runs the whole sketch.
3. Tap a named patch along the bottom — **Osc**, **Kaleid**, **Modulate**, **Shape**, **Voronoi**, **Feedback**, **Spin**, or **Finger** — to load that recipe.
4. **Code** (or Ctrl+Shift+H) hides or shows the overlay so the picture is alone. The synth keeps running.

The name next to **hydra** is the patch you are on, or **Yours** once the recipe no longer matches one of the eight.

## The dialect

A patch is a chain. It starts with a source, then effects, and ends with `.out()`:

- **Sources:** `osc(freq, sync, offset)`, `noise(scale, offset)`, `voronoi(scale, speed, blending)`, `shape(sides, radius, smoothing)`, `gradient(speed)`, `solid(r, g, b, a)`, `src(o0)` (the last frame — feedback).
- **Colour:** `.color(r, g, b)`, `.hue()`, `.saturate()`, `.invert()`, `.contrast()`, `.brightness()`, `.colorama()`, `.posterize()`, `.luma()`.
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
