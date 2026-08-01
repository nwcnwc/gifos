# The ladder was landscape and the phone was not — 3.2x the pixels, for years

**Measured on a g24, before and after, in the same room at the same blur level:**

```
before:  res 320x568@6   =  181,760 px/frame
after:   res 180x320@6   =   57,600 px/frame     (3.16x fewer)
```

57,600 is *exactly* what the 180p rung always budgeted. The phone had been
paying 3.2x that on every frame, on every sender, for as long as the ladder has
existed.

## What was wrong

Two independent places assumed a landscape source.

**1. `adapt()` asked for the rung literally.** Every rung is written 16:9 —
`180p = 320x180`. A phone held upright captures 9:16, so `height:{ideal:180}` is
unsatisfiable; the camera honours the WIDTH and returns `320x568`.

**2. The blur pipe capped WIDTH.** `const w = Math.min(capW, sw)` — with
`sw = 320` already at the cap, *nothing was scaled at all*, and the canvas kept
the sensor's full 568 height.

The second is the one that mattered, and it is why fixing only the first changed
nothing measurable. **With blur on, the outbound track is the blur pipe's canvas,
not the camera** — so `adapt()`'s camera constraints never reach the encoder.
Blur is the privacy steady state on phones, so that canvas *is* the phone's
camera path. The first census after the `adapt()` fix still read `320x568`; that
is what sent me to the right place.

## The fix

Scale by the LONG side, not the width:

```js
const long = Math.max(sw, sh), sc = Math.min(1, capW / Math.max(1, long));
const w = Math.max(2, Math.round(sw * sc)), h = Math.max(2, Math.round(sh * sc));
```

```
320x568  cap320 -> 180x320   px=57,600    (portrait: 3.16x less)
568x320  cap320 -> 320x180   px=57,600    (landscape: unchanged)
640x480  cap480 -> 480x360                (landscape: unchanged)
1280x720 cap480 -> 480x270                (landscape: unchanged)
```

Every landscape case is bit-for-bit what it was. Only the portrait case moves,
and it moves onto the budget the rung always intended.

`adapt()` also transposes the rung for a portrait sensor now, which fixes the
non-blurred path (raw camera senders) by the same argument.

## Why it matters more than its own size

Encode cost tracks pixels x frames. Everything downstream of that canvas got
3.2x cheaper at once: the mip-pyramid blur, the canvas paint, the encoder input,
the radio. And it compounds with every earlier rung decision — **every
resolution cut this ladder has ever made was landing at a third of its intended
effect on exactly the devices the ladder exists for**, including the sub-240p
rungs added specifically to give phones somewhere to go and the on-battery tier
fix from the same night.

## How it was found, and the lesson

`test/tools/phone-encoder-census.js`, on a phone force-seated into row 0 so its
camera actually fanned to row-mates. The tool was built to answer a *different*
question (is the MediaCodec ceiling real?) and answered this one on the way,
because it printed the encoder's ACTUAL output resolution next to the rung the
client believed it was on. Those two numbers had never been printed side by side.

**Print what the hardware actually did next to what the code intended.** The
rung said 180p, `powTier()` agreed, `quality()` agreed, every client-side
surface agreed — and the encoder was doing something 3.2x bigger. No amount of
reading the ladder would have shown it.

## And the encoder-fan question, now CLOSED — do not collapse it

The first census read `impl: "libvpx"`, `codec: "video/VP8"` — software encode,
three sessions at once — which looked like hard evidence for the "one-encoder
fan" lever. **It was a measurement artifact.** Headless Chromium ships without
H264, so the bots forced the negotiation down to VP8 and the phone dutifully ran
software encoders. Nothing about the phone.

Re-run against REAL browsers, two ways.

**Two phones as row-mates** (no bots at all):

```
impl NdkVideoEncodeAccelerator(c2.mtk.avc.encoder)  codec video/H264
softwareFallbacks 0   CEILING_HIT false
```

**The full fan** — phone force-seated into row 0 beside four bots launched with
`MEET_CHROME=/usr/bin/google-chrome` (real Chrome 143, which has H264), all four
senders live:

```
4x NdkVideoEncodeAccelerator(c2.mtk.avc.encoder)  video/H264  180x320@8  limit none
senderCount 4   softwareFallbacks 0   cpuLimited 0   CEILING_HIT false
```

**A g24 runs the whole C-1 = 4 fan in hardware, with no fallback and no CPU
limitation.** The premise — "the g24 has a real MediaCodec ceiling" — is false at
the width the mesh actually uses. Collapsing the fan would mean architectural
surgery on the media plane (row-mates render DIRECT tiles; a phone that stops
sending to them shows black, and there is no automatic fall-back to the head's
composite) in exchange for no measured gain. **Do not do it.**

Note also what the same run confirms: all four senders sit at `180x320` — the
portrait fix holding across a full fan, 57,600 px each instead of 181,760.

### The methodological trap, worth more than the answer

Bot fleets are not neutral instruments. `MEET_CHROME` pointed at Playwright's
Chromium silently changes the CODEC the system under test negotiates, and every
downstream number — encoder implementation, CPU, power — changes with it. A
whole architectural lever was nearly justified on it. **When measuring anything
codec- or hardware-adjacent, launch bots with real Chrome, or use real devices.**

## ADDENDUM 2026-08-01 — the adapt() half is REVERTED; only the pipe half stands

The `adapt()` transpose ("ask for the rung TRANSPOSED on a portrait sensor")
caused a three-round orientation regression and is GONE. What it actually did
in the field: Chromium satisfies a transposed constraint on a landscape capture
by CENTER-CROPPING (a zoomed-in face); reading the orientation back from
`getSettings()` fed back into the next ask (self-view flipping every ~2s); and
the follow-up attempts (transposed getUserMedia ask + corrective re-grab,
then a canvas center-crop) produced sideways frames on one device, multi-second
freezes, and a double-zoom. Every phone's camera pipeline already rotates the
capture with the device — commanding orientation from JS only ever fought it.

The rule now (guarded by `test/browser/e2e-cam-orientation.js`): **ask the rung
literally, never transpose, never react to rotation, never restart the camera.
The frame's shape belongs to the camera.**

The BLUR-PIPE half of this fix — cap the canvas by the LONG side, not the
width — is untouched and remains the real budget win: blur is the phone's
steady state, so the pipe is the encode path that matters, and the long-side
cap is shape-agnostic. The raw path may again spend up to ~3.2x the rung on a
portrait phone; that is the accepted price of never fighting the camera.
