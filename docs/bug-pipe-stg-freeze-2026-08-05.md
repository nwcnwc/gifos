# BUG: the staged feed bright-freezes at every receiver when the pipe lane is ON


> **STILL ALIVE as of 2026-08-06 (ce294be).** Re-verified against the tree: `e2e-pipe`
> remains in `test/batteries/quarantine.txt` with the entry naming THIS
> dossier as the cause of leg 3, and no fix commit exists. The suite came up
> GREEN in the 0.9.4 gate — that is the entry's documented nondeterminism,
> not a fix. Nothing else guards it: the guard IS the quarantined leg.
> Still one investigation with mirror-drill and redun-drill.
>
> **RE-MEASURED 2026-08-06 EVENING, and the shape is now specific — see
> "What it actually is" below.** Three runs on clawbox (Chrome 151, lane live,
> idle box): leg 3 red in 3/3. The detector was also over-reporting, and that
> is fixed in `cd2efeb` — the freeze is smaller than it looked, and much more
> pointed than it looked.

**Found** 2026-08-05, chasing a gate red. **Status: OPEN, unfixed, not a regression
from anything landed that day.** Filed separately on purpose — it is a media-plane
bug, and the work that surfaced it (a test-only engine fix) is unrelated to it.

## The observable

`test/browser/e2e-pipe.js` LEG 3 — "THE FREEZE SHAPE: no stg/sgs feed
bright-stalls >=12s at any seat over 36s" — fails whenever the encoded-passthrough
lane is actually running. One staged feed's decoded-frame counter stops advancing
at **four or five receiving seats simultaneously**, for ≥12s, while the track at
each of those seats is `live`, unmuted, and has non-zero width — a BRIGHT freeze,
not a torn-down track.

    FAIL — THE FREEZE SHAPE ... {"stalls":[
      {"seat":"P3","key":"stg:k_8b359440","stuckMs":12831},
      {"seat":"P1","key":"stg:k_8b359440","stuckMs":12706},
      {"seat":"P0","key":"stg:k_8b359440","stuckMs":12719},
      {"seat":"P5","key":"stg:k_8b359440","stuckMs":12755}]}

Same feed key at every stalled seat. Meanwhile the producer is provably still
encoding — the very next assertion passes:

    PASS — the stager is still encoding its stg feed  [{"slot":"out:stg:k_731c...","fenc":102,"kenc":20}]

So this is not the stager going quiet. It is one copy of one feed dying on the way
out, for everyone downstream of it, at once.

That is precisely the signature `87f57e6` describes as the ORIGINAL 2026-08-04 stg
freeze ("every receiver of every copy bright-frozen at once, recurring"), which
that commit fixed with hop-local `sendKeyFrameRequest` plus a sender-side jiggle
fallback. Leg 3 is the guard it left behind. The guard is now failing again, under
conditions the guard could not previously reach.

## Why it was invisible until now

The gate pins `MEET_CHROME` to chromium-1193 = **Chrome 140, which has no
`RTCRtpScriptTransform` at all**. `mesh-pipe.js supported()` requires it, so under
the pin the lane silently disables itself, every forward falls back to transcode,
and leg 3 exercises a code path the lane never touches. It passed for that reason,
not because the freeze was absent.

`ec168b4` made `e2e-pipe` resolve its own engine (`findChrome({ignorePins:true})`),
because a suite testing an API newer than the pin was reporting the browser's age
as a product defect. With a real engine the other 17 assertions go green and the
lane is measurably live (`jobs:16`, `wrote:165`, `deny:0`) — and leg 3 starts
failing. **The engine fix did not cause the freeze; it made the freeze reachable.**

## The measurement

The obvious confound is CPU: `e2e-pipe` runs six browsers, the lane costs real work,
and a starved box freezes video for reasons that have nothing to do with the
protocol. So it was run as an INTERLEAVED A/B on ONE box (clawbox, 6 cores),
ABABAB, varying only the lane:

| round | arm | engine | pipe lane | leg-3 freeze | loadavg |
|-------|-----|--------|-----------|--------------|---------|
| 1 | A | Chrome 140 | OFF | no  | 5.78 |
| 1 | B | Chrome 151 | ON  | YES | 11.18 |
| 2 | A | Chrome 140 | OFF | no  | 7.80 |
| 2 | B | Chrome 151 | ON  | YES | 9.09 |
| 3 | A | Chrome 140 | OFF | no  | 9.79 |
| 3 | B | Chrome 151 | ON  | YES | 11.74 |

**0/3 with the lane off, 3/3 with it on.** Interleaved because a sequential A/B has
lied about exactly this before (see `docs/`/memory on load drift reversing a stage-feed
verdict).

The load column is the reason to trust it. The B arm does run hotter — the lane is
not free — so "B fails because B is heavier" had to be excluded. It is excluded by
**round 3 A passing at load 9.79 while round 2 B failed at 9.09**: the lane-off arm
survived *more* load than a lane-on arm that failed. Load does not order the
outcomes; the lane does.

Independently reproduced 2/2 in ad-hoc runs before the A/B, same signature.

## What it actually is (measured 2026-08-06, clawbox, Chrome 151, idle)

Leg 3 was instrumented to run its own rule and a container-aware one side by
side, and to record, at the instant a stall fires, the slot's inbound BYTES
across the freeze plus that flow's `framesDecoded`/`keyFramesDecoded`.

**1. Two thirds of the reported stalls were the detector, not the product.**
`feedsInfo().frames` is the ELEMENT's `totalVideoFrames`, and a claim swap
(failover, failback, or an announcer re-shipping a new container) installs a
NEW `<video>` whose counter restarts at zero. The old rule waited for the fresh
element to climb past the dead one's total — tens of seconds — and called that
a bright freeze. Run 1: 3 stalls reported, 2 of them exactly this, at seats
that were decoding fine on a new container. Fixed in `cd2efeb`; the assertion
is untouched.

**2. What remains is real, and it is not a quiet pipe.** With the baseline
keyed by container, every one of the three runs still reds, and the surviving
stalls all have the same signature:

| run | stalls | bytes arriving during the 12-13s freeze | frames decoded, whole 36s | stager |
|---|---|---|---|---|
| 1 | 1 (P0) | 50.7 kB | 15 | fenc 36, kenc 21 |
| 2 | 3 (P0,P1,P5) | 25.6 / 24.9 / 28.7 kB | 9 / 11 / 4 | fenc 44, kenc 19 |
| 3 | 1 (P0) | 25.0 kB | 4 | fenc 59, kenc 22 |

So: **bytes keep arriving (2-4 kB/s) while the decoder produces nothing**, the
producer is encoding keyframes throughout (`kenc` 19-22), and the piped copy
decodes single-digit frame counts over a 36-second window. This is not "the
feed freezes occasionally" — on the pipe lane the forwarded stg copy barely
runs at all. The freeze is a decoder starved of a decodable frame while its
pipe is delivering, which is the keyframe-starvation shape `87f57e6` described
and fixed for the transcode path.

**3. And the claim churns underneath it.** In run 1 the stg claim swapped
containers 7 times in 36s across 4 seats (P4 flipping A→B→A), run 3 four
times, run 2 not at all. Run 3's stall record carries the producer-side
reason, from `mosaic().reship`: `why: 'sig-change'`, the stager's own sent
video track alternating between two ids (`54094d3f` -> `98308cec` ->
`54094d3f`) with `blur: 1, pipe: true` and a CONSTANT `camId`. That is the
blur pipe's track and the raw camera track taking turns: each flip re-mints
`mySelfStream()`, which re-ships every stg job with a new container, which
tears down every downstream decoder. Note the arm that showed it had clicked
`blur-none` (e2e-pipe does, on every page) and still reported `blur: 1` — a
room/guest blur outranking the user's own "none" is the obvious suspect for
what makes the level oscillate. A separate probe with blur left at its default
2 showed ONE `selfMemo` entry, no re-ships, and stg feeds advancing at every
seat.

That gives the next session two threads that may be one: the source-side
identity flip-flop (why does the sent track alternate?), and the
keyframe-starved piped copy (why does a hop with bytes never decode?).

## What is NOT yet known

- **Duration.** `stuckMs` is bounded by the detector: leg 3 polls every 2s, fires the
  moment a stall crosses 12s, and sets `rec.hit` so that record never reports again.
  Every number it can print is ~12-14s by construction. A 12.3s blip and a 120s
  freeze are indistinguishable in this output. Do not read "12.3s" as "mild" — that
  misread cost triage time already. Measuring real duration needs the detector
  changed to keep sampling after the first hit. (2026-08-06: the FRAME COUNTS
  answer the spirit of it anyway — 4 to 15 decoded frames in 36 seconds means
  the copy is not blipping, it is barely running.)
- **Mechanism.** Narrowed 2026-08-06, not closed — and the first reading with
  the receiver's own decode counters attached says it is NOT simply "no
  keyframe ever arrived". The first stall the corrected leg 3 caught on the
  committed suite reads:

      {"seat":"P0","key":"stg:k_18d8638b","stuckMs":12612,"frames":21,
       "via":"k_372e3c","sid":"858a8fa1","bytesDuringStall":50787,
       "kf":{"fdec":4,"kdec":3}}

  **Three of the four frames that flow ever decoded were KEYFRAMES**, while
  50.8 kB arrived during the freeze. So key content does reach this hop and is
  decodable; what never decodes is everything BETWEEN the keyframes. That
  points away from "the hop-local `sendKeyFrameRequest` never fires" and toward
  the delta frames arriving unusable at this hop — a passthrough/dependency
  problem in the worker's swap, or a receiver re-shipped onto a container mid
  GOP often enough (8 claim swaps in that same 36s window) that it only ever
  survives to the next keyframe. `deny:0` still says no job fell back to
  transcode. The piece still missing is the pipe worker's own counters
  (`wrote/dropped/kdrop/nkDrop/swapErr`) at the FORWARDING hop at that instant,
  which nothing captures yet.
- **Whether real users hit it.** Chrome 140 has no `RTCRtpScriptTransform`, so every
  browser older than ~141 runs with the lane off and cannot see this. How much of the
  real audience is on an engine new enough to turn the lane on — and therefore new
  enough to freeze — is a question for §9a, not for this document.

## Reproducing

    # any box with a Chrome >= 141 installed (verified on 149 and 151)
    python3 -m http.server 8099 -d site &
    node test/servers/relay-local.js &
    node test/browser/e2e-pipe.js        # prints its engine + capability on line 1

The suite states the engine it got and refuses up front if that engine cannot host
the API, so an `unsupported` run can never again be mistaken for a product failure.

## Related

- `87f57e6` — the original stg freeze, decomposed across 5 devices and fixed. Leg 3 is its guard.
- `c955344` — ENCODED PASSTHROUGH, the lane itself (roadmap §9a).
- `ec168b4` — the engine fix that made this reachable.
- `docs/media-plane.md`, roadmap §9a — where the fix, when it exists, belongs.

**Next step is not a patch.** Per the standing rule that one box cannot tell a bug
from a busy kernel, the honest next move is to rebuild this shape across DEVICES
(`test/swarm/meet.js`, one or two clients per box) with the lane on, and capture
`kfStats`/`feedsInfo` at the moment of the stall — the A/B above proves the lane
owns the failure, but not yet why.
