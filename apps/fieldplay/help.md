# Field Play

Drop particles onto a plane of arrows. They follow the flow. Remix a named field, or type your own recipe.

## The loop

1. Tap a named field under the picture — **README 2**, **Secret door**, **Four cogs**, **Best vortex**, **Black hole**, and the rest.
2. Particles stream along the arrows. Drag the picture to pan. Scroll or pinch to zoom.
3. The recipe is the little program that says, for every point, which way the arrow points. Change a number or a `sin` to a `cos` and press **Apply**.
4. **Reset** pours the particles again. **Pause** freezes the flow.

You do not need to know the language. Changing a number in a snippet is enough.

The recipe is a `get_velocity` function: `p` is the point, `v` is the arrow at that point. `cursor` is where you last tapped (xy) and where the pointer is now (zw). `frame` counts up while the field runs. `snoise` is a smooth noise helper.

## Buttons and knobs

- **Play together** — start a shared square (see below).
- **Apply** — paint the recipe in the box.
- **Pause / Play** — freeze or continue.
- **Reset** — new random particles, same arrows.
- **Step** — how far a particle moves each tick. Smaller is slower and smoother.
- **Fade** — how long a trail lingers. Lower makes shorter streaks.
- **Drop** — chance a particle restarts somewhere else, so the picture does not freeze.
- **Colour** — **Uniform** is one colour; **Speed** tints fast particles warmer.

There is no extra keyboard command. On a phone, tap; on a computer, click. Drag with one finger.

## A live friend

Playing alone is the original toy. The last field stays on this device.

Want a friend looking at the same flow? Press **Play together**, then **Invite** in the bar above the app, and send the link. You both start from this recipe. When anyone presses **Apply** or picks a named field, everyone gets the new flow.

**← Solo** puts you back on the original toy with the field you left.

## What is saved

The last recipe, the camera, and the knobs live in this file. Close it, come back, the field is still there. A live share is the room for that invite, not a second save.

## Credit

Unofficial port of [Field Play](https://github.com/anvaka/fieldplay) by anvaka. The fields and the particle idea are theirs.
