# Field Play

Particles follow the arrows at every point on the plane. Remix a named field, or type your own recipe.

## The loop

1. Tap a named field under the picture — **README 2**, **Secret door**, **Four cogs**, **Best vortex**, **Black hole**, **Follow the finger**, and the rest.
2. Particles stream along the arrows. **Tap the picture to pour more** at your finger. Drag to pan. Pinch or scroll to zoom.
3. The recipe is the little program that says, for every point, which way the arrow points. Open **Recipe**, change a number or a `sin` to a `cos`, press **Apply**.
4. **Reset** pours a fresh cloud. **Pause** freezes the flow.

You do not need to know the language. Changing a number in a snippet is enough.

The recipe is a `get_velocity` function: `p` is the point, `v` is the arrow at that point. `cursor` is where you last tapped (xy) and where the pointer is now (zw). `frame` counts up while the field runs. `snoise` is a smooth noise helper.

## Buttons and knobs

- **Play together** — start a shared square (see below).
- **Pause / Play** — freeze or continue.
- **Reset** — new random particles, same arrows.
- **Recipe** — show or hide the program and the knobs. On a phone it starts hidden so the field can fill the screen.
- **Apply** — paint the recipe in the box. Ctrl+Enter does the same.
- **Step** — how far a particle moves each tick. Smaller is slower and smoother.
- **Fade** — how long a trail lingers. Lower makes shorter streaks.
- **Restart** — chance a particle restarts somewhere else, so the picture does not freeze.
- **Colour** — **Uniform** is one colour; **Speed** tints fast particles warmer; **Angle** tints by the way they are heading.
- **Cloud** — **Lite / Medium / Fine**. Lite is kinder to a warm phone.

There is no extra keyboard command. On a phone, tap; on a computer, click. Drag with one finger. Two fingers pinch to zoom.

If a recipe cannot run, the previous field stays up and a red note says why. An empty box will not wipe the field.

## A live friend

Playing alone is the original toy. The last field stays on this device.

Want a friend looking at the same flow? Press **Play together**, then **Invite** in the bar above the app, and send the link. You both start from this recipe. When anyone presses **Apply** or picks a named field, everyone gets the new flow.

**← Solo** puts you back on the original toy with the field you left. Back closes the recipe sheet first, then leaves a shared square.

## What is saved

The last recipe, the camera, the knobs, and the cloud size live in this file. Close it, come back, the field is still there. A live share is the room for that invite, not a second save.

## Credit

Unofficial port of [Field Play](https://github.com/anvaka/fieldplay) by anvaka. The fields and the particle idea are theirs.
