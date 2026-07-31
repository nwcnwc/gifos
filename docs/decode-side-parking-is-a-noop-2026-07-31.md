# Decode-side parking is a NO-OP — measured, then reverted

**Verdict: the "biggest untouched win" does not exist.** A phone does not decode
main video for tiles it never paints, because the SENDER already refuses to send
it. Measured on two Motos, then reverted. Do not re-propose this.

## The theory (ranked #1 in the 2026-07-30 handoff)

> Decode-side parking — nothing parks RECEIVERS, so a phone decodes full streams
> into tiles a few pixels wide while the stadium composite already carries the
> room. The wire already supports it (`{k:'vis',park}` is per-peer).

It is a good theory. `reconcileGrid()` really does put `display:none` on every
non-row-mate, and a `display:none` `<video>` really does keep decoding. The
inference — that those mains are arriving and being decoded for nothing — is
the part that is false.

## Why it is false

```js
const camPeer = (pid) => isRowMate(pid);                       // site/meet.html
const cam = camPeer(p.id) && !staged;  // structural link OR staged ⇒ no raw camera encode
if (!cam || !vt || p.remoteParkMain) { if (p.mainV.track) p.mainV.replaceTrack(null); }
```

Raw camera goes **only** to row-mates. A non-row-mate is a structural link and
its main sender is parked at `replaceTrack(null)` from the start. So the set
"tiles I hide" and the set "mains I receive" are already disjoint:

- row-mate  ⇒ main flows, tile SHOWN, painted. Nothing to reclaim.
- non-row-mate ⇒ tile hidden, and **no main was ever sent**. Nothing to reclaim.
- stager ⇒ tile hidden, main parked by their own step-up. Nothing to reclaim.

The Stadium/Stage composites read the aux `sd`/`sgs` streams, which is exactly
why the mains were never needed and never sent.

## The measurement

Both phones in one room, camera on and verified live (`camOff()===false`,
`camTrackLive()===true`), forced into different rows with `forceSeat` so each
was the other's non-row-mate — the precise case the theory is about.

The mechanism itself worked. Phone B (knob on) asked, phone A obeyed:

```
phone B  visParkAsked: ["k_3d8345"]   tile: hidden      (asked A to park)
phone A  visParked:    ["k_2cf49f"]   v: "parked"       (obeyed)
phone A  visParkAsked: []                               (control, as shipped)
```

And it bought nothing, because there was nothing to buy — `phone-decode-probe.js`
over a 25s window, both phones:

```
inboundMainVideo: { paintedKbps: 25.7, UNPAINTED_kbps: 0, UNPAINTED_fps: 0 }   # A
inboundMainVideo: { paintedKbps: 0,    UNPAINTED_kbps: 0, UNPAINTED_fps: 0 }   # B
```

`UNPAINTED_kbps: 0`. Not small — zero. The conclusion is structural, not a
small-room artifact: `camPeer` is unconditional, so no room size can make a
non-row-mate main flow.

## What was reverted

`99b3113` (the `dpark` knob and `offscreenMain()`), reverted here. It shipped
OFF, so nothing in production ever changed. Keeping it would have left dead
complexity that reads like a win.

## Where the decode actually is

A phone's video decode is only ever:

1. **row-mate mains** — painted, legitimately paid for; and
2. **composites** (`in:<rk>` — `sdrow:`/`sd:`/`sub:` mosaics).

So the decode-side question is not "am I decoding mains I hide" (no) but
**"am I subscribed to composites I do not display?"** `stadiumShown()` exists as
a distinct accessor from the subscription state, which is the hint worth
chasing: if a phone keeps claiming `sdrow:`/`sd:` while the stadium is collapsed
or off-screen, that is real decode with no viewer — and unlike the mains, no
existing rule stops it.

## Method note

The claim was checkable by reading `camPeer` in one grep, before any code was
written. The phones then made it unarguable. Measure the premise, not just the
delta.
