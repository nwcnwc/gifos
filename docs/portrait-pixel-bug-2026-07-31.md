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

## Still open from the same census

`impl: "libvpx"`, `codec: "video/VP8"` — SOFTWARE encode, three to four sessions
at once. So lever 3's premise ("the g24 has a real MediaCodec ceiling") is not
what is happening: the phone never *reaches* MediaCodec, because it never gets
hardware H264. That may be an artifact of headless-Chromium bots lacking H264 in
the negotiation rather than a real-world result. **Confirm with a real-browser
peer before touching codec preference or collapsing the encoder fan** — a
software-VP8 fan and a hardware-H264 fan are completely different problems.
