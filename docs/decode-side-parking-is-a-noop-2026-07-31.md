# Decode-side parking is a NO-OP — measured, then reverted

> **RE-VERIFIED 2026-08-06 (ce294be) — NOT a bug doc: this is the record that
> stops three re-proposals.** `dpark` / `offscreenMain` are absent from
> `site/` and `test/` (the revert held). Do not confuse this with the
> SENDER-side vis-park machinery, which is live and gated by
> `e2e-vis-park.js`. All three verdicts stand: decode-side parking is a
> no-op, pixel overdraw is refuted, and "a phone should not be a HEAD" is
> still UNCONFIRMED — it needs a randomized repeated ABAB design, and acting
> on it is flag-day-sized.

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

---

# Two more theories the phones killed the same night

## Pixel overdraw — DEAD

Theory: a phone decodes big frames into tiny tiles, paying for pixels no eye
gets. `phone-pixel-waste.js` measures it directly — `videoWidth/Height` (what
the decoder produced) against `getBoundingClientRect() x devicePixelRatio`
(what is drawn).

Measured, 7-participant room, both phones: **every `overdraw` is ≤ 1**
(0.1, 0.3, 0.5, 0.7). The phone decodes SMALLER frames than it displays and
upscales them. There is no thrown-away detail to reclaim. The tool is kept —
it is the right instrument, the answer here is simply "no waste".

Note the trap inside the tool: a PARKED stream keeps its last `videoWidth`, so
a zero-size element can look like "decoding while invisible" when no bytes are
arriving at all. Always cross-check against flowing bytes
(`phone-decode-probe.js`), never against frame dimensions alone.

## "A phone should not be a HEAD" — NOT CONFIRMED (reversal failed)

`iAmHead = c.i === 0` is purely positional and completely power-blind: whoever
lands in seat 0 composites the whole row (`prodPack`) and the stadium
(`sdPack`) — two extra canvases and two extra encoders — regardless of whether
it is a plugged laptop or a phone on battery. Verified structurally: a head
reports `prodStream:true, sdStream:true` and 7 shipping jobs; the same phone at
`i=3` reports `false/false` and 1 job.

It reads like an obvious win. **The measurement does not support it.**

Two phones in one 7-person room, phone A held as head throughout as a drift
control, phone B moved head → non-head → head:

```
phoneA HEAD throughout (CONTROL)    P1 96.2 | P2 95.9 | P3 97.1
phoneB head -> NONhead -> head      P1 74.7 | P2 62.4 | P3 63.1
```

The A→B step looks like a −12.3 point win. The reversal says otherwise: putting
phone B **back** on the head seat left it at 63.1, not back at ~74.7. If
headship cost 12 points, P3 would have returned to P1. Headship's own cost here
is under a point.

So the −12.3 was real but one-way: the P1 baseline was contaminated. Phone B had
been force-seated earlier in the session and was carrying state — extra links,
stale jobs — that the first move cleaned up. **P1 was not a baseline, it was a
mess.**

Also note phone A sat at ~96% CPU as a head while phone B sat at ~63% as a head.
Both heads, 33 points apart. Whatever dominates a phone's CPU in a meeting, it
is not headship — A was landscape with a wider viewport and more painted tiles.

### What this costs to get right

A one-way A→B step is not a measurement, it is a hypothesis. Anything that
cannot be reversed on the same device, in the same room, in the same minute,
has not been measured. That is what caught this, and it is the same discipline
that retracted the −21% claim.

The head question is still OPEN and still worth answering — but with a
randomized, repeated ABAB design on a clean baseline, not one step. And note
that acting on it would need a two-party seat SWAP: `promoteInto`/`doMove` only
move into a hole and only left/up, so a phone cannot walk right out of seat 0.
That is flag-day-sized; do not start it on a one-way number.
