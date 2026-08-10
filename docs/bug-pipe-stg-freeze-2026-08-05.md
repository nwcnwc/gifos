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

---

## 2026-08-10: KEYFRAME STARVATION IS REFUTED, and the churn thread is dead

Leg 3 now records the receiving seat's own pipe-worker counters at the instant a
stall fires (`__gifosVideo.pipeStats()` — the worker has carried them all along
and nothing read them here). Two runs on clawbox, `clawbox-brain` stopped,
Chrome 151, lane live: **RUN1 green (17/17), RUN2 red (16/1)** — the entry's
documented nondeterminism, but a better rate than the 0/4 of 2026-08-06.

**1. The churn thread is GONE.** `container swaps during the 36s window: 0` in
BOTH runs, against 7 and 4 in the 2026-08-06 runs. The container-identity
campaign (f7db0f5..2ff6e2a) closed it, exactly as predicted. Everything below is
the OTHER thread, alone and unobscured.

**2. The lane is not starving for keys.** This was the leading hypothesis and it
is now refutable from the source as well as the data. `mesh-pipe.js` already
fires BOTH levers on every ask — hop-local `sendKeyFrameRequest` for the RTCP
side and the `mx-kf` DC walk for piped hops (SKR cannot cross those: Chromium
will not latch a PLI into a demand-minted carrier) — rate-limits each, and
re-asks every 2s for a tap receiving nothing. The counters agree with the code.
At P0's stalled feed, the pipe that was actually writing shows:

    needKey: false   dropped: 0   nkDrop: 0   kdrop: 0   swapErr: 0
    mime: video/VP8  tmplMime: video/VP8   wrote: 10   sinceWriteMs: 6249

Nothing is being discarded for want of a key, and the payload swap is clean.

**3. The decoder is not refusing content — it is barely being given any.**
`kf: {fdec: 5, kdec: 3}` over the whole window. **Three of the five frames the
decoder produced were KEYFRAMES.** So the dossier's framing above — "a decoder
starved of a decodable frame" — is wrong in an important way: keys ARE arriving
and decoding, and almost nothing arrives between them. Against a producer at
`fenc 57, kenc 19`, roughly a sixth of the keyframes and essentially none of the
deltas are landing. The 26 kB that crosses during a 12.7s stall is about the
weight of one or two keyframes, which is consistent.

**4. The machinery is healthy for other feeds AT THE SAME INSTANT.** At P1,
while the stg feed is frozen, a different source is writing normally through the
same worker: `x2>k_0721…  wrote: 68, dropped: 1, needKey: false, sinceWriteMs: 15`.
So this is not the worker, the transform, or the carrier being broken.

**5. THE SHAPE THAT IS LEFT.** At both stalled seats, every pipe carrying this
stg feed toward the seat's claimed `via` is **parked and has never written a
frame** — `paused: true, wrote: 0, mime: null`. A paused pipe clears its queue
and is explicitly skipped by the 2s re-ask timer
(`if (!p.paused && p.needKey && p.srcId)`), so it neither forwards nor asks.
Meanwhile the tap on the seat's own inbound copy goes silent for 6.2s while
bytes keep arriving on the wire.

**THE NEXT MEASUREMENT, and it is one hop away.** These counters are the stalled
seat's OUTBOUND forwards; they cannot say what the seat's UPSTREAM was doing.
The trickle-not-starvation shape points at the hop feeding it. Capture
`pipeStats()` at the seat named by `via` for the same feed at the same instant —
pipe id `stg:<feed>><thisSeat>` — and the question becomes a fact:

  * upstream's pipe to us `paused: true` or `wrote` flat -> the forward was
    parked while we still demanded it (a demand/park bookkeeping bug, and the
    same `paused`-skips-the-re-ask hole would explain why it never recovers)
  * upstream `wrote` climbing while our `fdec` stays at 5 -> the loss is on the
    carrier between the two hops, not in either worker

Until that is measured, do not patch the keyframe path — it is demonstrably not
the lever. The entry stays in `quarantine.txt` and leg 3 stays red.

### The upstream answer, same day: THE FORWARD IS FINE

Measured. At both stalls the seat named by `via` had its forward to the stalled
seat **paused: false, needKey: false, dropped: 0, swapErr: 0**, template mime
matching, with a write **15 ms** and **1280 ms** old. So the parked-forward
branch above is dead too: the upstream was actively forwarding while the
downstream sat frozen.

### THE CHAIN PROFILE — one leg is broken and its sibling is not

`wrote` is cumulative, so a low total cannot tell a starved pipe from a young
one. Leg 3 now samples every seat's pipes for the stalled feed twice, 2 s apart,
and reports each hop's write rate beside that seat's own decode count. One red
run (clawbox, brain stopped, Chrome 151, lane live), stager = P4 `k_403aba`,
feed `stg:k_403aba48`, stalled seat P0 `k_13ebf5` claiming via P2 `k_b12201`:

| hop | frames the sender WROTE | frames the receiver DECODED |
|---|---|---|
| P5 -> P2 | 33 | **33** |
| P2 -> P3 | 32 | **26** |
| P3 -> P1 | 8 | **5** |
| **P2 -> P0** | **32** | **1** (kdec 1) |

**P2 feeds two peers, from one worker, one source pipe, one feed — and one of
them works.** P3 decodes 26 of the 32 P2 wrote it. P0 decodes ONE of the 32 P2
wrote it, while 25 kB crosses the wire to P0 during the freeze.

That eliminates every remaining upstream explanation at once. The source is not
starved (P5->P2 is 33/33). The sender's worker is not broken (its other forward
is healthy at the same instant). The lane is not key-starved (needKey false,
dropped 0, all the way along). What is left is **one destination's carrier**:
frames are written into it, the bytes arrive, and the receiver decodes a single
keyframe and nothing after it — the signature of a decoder that cannot follow
the reference chain it is being handed.

**NEXT, and it is now a narrow question:** compare the WORKING carrier against
the BROKEN one from the same sender — `MPipe.chain(pipeId)` already reports
`{wants, mints}` per carrier. Capture that for `P2->P3` and `P2->P0` together,
plus the receiver-side inbound codec/resolution at each, at the same instant.
Two carriers minted by the same sender for the same content, one decodable and
one not, is a difference that has to be visible in the mint.

Do NOT go near the keyframe path or the demand/park bookkeeping first. Both are
measured innocent.

### The carrier answer: OVER-MINT IS A SYMPTOM, AND THE DRAINER IS INNOCENT

`__gifosVideo.pipeChain()` exposes `{wants, mints}` per destination carrier.
The first look was striking — at one stall, three legs of the same feed:

| leg | wants | mints | ratio | decoded |
|---|---|---|---|---|
| P5 -> P2 | 29 | 29 | **1.00** | 29 of 29 |
| P2 -> P3 | 31 | 32 | 1.03 | 15 of 31 |
| P2 -> P0 | 31 | 39 | **1.26** | 4 of 30 |

The only thing that mints beyond 1-for-1 demand is **the drainer** (frza11): a
33 ms tick that mints an extra delta template whenever a pipe reports a backlog.
Its comment claims an over-minted delta is "dropped free at the worker's
idle-queue gate" — but dropping it in the WORKER does not un-mint the canvas
frame, and Chrome still encodes and sends it carrying no swapped payload. That
is a textbook broken reference chain, and it matches the symptom exactly.

**It is not the cause.** `gifos_pipe_drain=off` disables the drainer;
`PIPE_DRAIN=off` sets it for the suite. Interleaved ABAB, three pairs, clawbox,
brain stopped, Chrome 151:

| arm | drainer | result |
|---|---|---|
| A1 | on | green |
| B1 | **off** | RED — 3 stalls, one at `fdec: 0` |
| A2 | on | RED |
| B2 | **off** | green |
| A3 | on | RED |
| B3 | **off** | RED |

**1 of 3 green in BOTH arms.** And the lever demonstrably works: in the B arm
EVERY carrier reported `mints == wants`, ratio 1.00 across the board, with the
A arm reproducing 1.04-1.23 in the same session. So the freeze happens with
over-minting entirely eliminated.

Over-mint therefore CO-VARIES with the freeze rather than causing it — a
backlogged pipe both over-mints and delivers badly, because the backlog is the
common cause. The correlation was real and the inference from it was wrong,
which is precisely what an interleaved A/B is for.

**Ruled out so far, each by measurement:** keyframe starvation, the parked
forward, container churn, and now carrier over-mint and the drainer. The
remaining shape is unchanged and still unexplained: one sender, one source
pipe, one feed, two destinations — bytes cross to both, one decodes and one
returns keyframes only. Next place to look is the RECEIVER side of the losing
leg (inbound codec/resolution and the decoder's own error counters), since
every sender-side explanation now has a measurement against it.

### The receiver side: NOTHING IS EVER REJECTED, and the headline number is wrong

`kfStats` gained `framesReceived` (frames the depacketizer completed) beside
`framesDecoded`, plus `packetsReceived`, freeze counters and
`framesAssembledFromMultiplePackets`. The result is unambiguous and it inverts
the dossier's reading:

| seat | fdec | frecv | pktRx | lost | drop |
|---|---|---|---|---|---|
| **P0 (stalled)** | 2 | **2** | **4** | 0 | 0 |
| P1 | 5 | 5 | 11 | 0 | 0 |
| P2 | 30 | 30 | 49 | 0 | 0 |
| P4 | 31 | 31 | 50 | 0 | 0 |

**`framesReceived == framesDecoded` at EVERY seat, in every run measured.** No
decoder anywhere rejects anything, drops anything, or loses a packet. The
"decoder starved of a decodable frame" framing at the top of this dossier is
wrong, and so is the keyframe-reference-chain theory that replaced it.

**The headline number is a measurement artifact.** "25-50 kB arriving during
each 12-13s freeze" cannot be reconciled with FOUR packets received on the same
flow — that would be ~6 kB per packet, far above MTU. The bytes come from
`avStats`'s slot attribution and the packets from the `inbound-rtp` row; they do
not describe the same thing. **Do not quote the byte figure again without
re-deriving it.**

### The whole path, end to end

Leg 3 now records, per forward: frames the worker WROTE, the carrier's mints,
the sender's `framesEncoded`/`keyFramesEncoded` for that destination, and the
receiver's `framesReceived`/`framesDecoded`.

| leg | wrote | fenc | kenc | fps | receiver frecv/fdec |
|---|---|---|---|---|---|
| P2 -> P4 | 34 | 37 | 14 | 2 | 19 / 19 |
| P2 -> P0 | 35 | 35 | 12 | 2 | 10 / 10 |

- **Writes become encoded frames** (`fenc ≈ wrote`), so the carrier and encoder
  are doing their job. `qlim: none` — no bandwidth or CPU limitation. `48x48` is
  the carrier's own size, as designed.
- **The lane runs at ~2 fps with a THIRD to a HALF of frames as keyframes** —
  and this is true in PASSING runs too (the producer measured `fenc 42/kenc 17`
  in a red run and `fenc 47/kenc 23` in a green one). So the keyframe fraction
  is this lane's normal operating point on this box, not the fault. It was worth
  checking and it is not the discriminator.
- **What remains unexplained is a deficit**: 37 frames encoded toward a seat,
  19 received, with zero loss and no limitation.

### The next lead is ATTRIBUTION, and it is a different bug

In the last red run the stalled seat claimed `via: k_c41489` — and that id
appears NOWHERE among the peers forwarding that feed. Earlier stalls had a via
that did match a real forwarder. If a seat can hold a claim pointing at a peer
that is not the one actually sending it, then "the feed is frozen" is the
symptom of a claim aimed at the wrong place, everything measured above is
consistent (the real sender's numbers look fine because it is feeding SOMEONE
ELSE), and the deficit is an artifact of comparing a sender to a receiver that
were never paired.

**Check that first**: assert, at every seat, that `claimVia[rk].via` is a peer
with a live forward of that feed to this seat, and dump both sides when it is
not. It is cheap, and if it holds it removes the last reason to distrust the
numbers above.

Note also the standing caveat: all of this is six browsers on one Jetson. Every
quantity here is real, but the RATE at which the freeze appears is not a product
number until it is rebuilt across devices.

### ACROSS DEVICES (2026-08-10) — it does not reproduce on a second box

The standing caveat, discharged. Same suite, same tree, a DIFFERENT machine:

| box | engine | cores | runs | leg 3 |
|---|---|---|---|---|
| clawbox (Jetson) | Chrome 151 | 6 | many | freezes ~1 in 2 at load 7-11 |
| **raspberrypi** | **Chrome 149** | **4** | **4** | **3 GREEN + 1 DNF, at load 21-24** |

The Pi ran the identical six-browser suite at **twice to three times clawbox's
load** and leg 3 never fired once. The DNF is not a verdict — every leg failed
including "the stager is still encoding" returning `[]`, which is fleet death.

**So the freeze is not simply CPU contention** — the more starved box is the one
that does not show it. What differs is the box AND the engine (Chrome 151 on an
aarch64 Jetson vs 149 on a Pi), and either could own it. That is now the sharpest
question about this bug, and it is cheap to split: run the suite on a THIRD
engine/box pair, or pin clawbox to an older chromium revision and re-measure.
Until then, do not describe this as a general product freeze — it is a freeze
observed on one box with one engine.

### A separate thing DEBUG mode showed, worth its own hunt

While building the cross-device room (`test/swarm/meet.js --mesh-c 2`, four seats
split across clawbox and raspberrypi, then a fifth and sixth), the census came
back structurally clean but with occupancy knowledge SPLIT and staying split:

    === MESH CENSUS: 6 seats replied ===
    0/0.0 CB1  occ=4  links=2 conn=2      0/1.1 RP2  occ=6  links=3 conn=3
    0/0.1 RP1  occ=4  links=2 conn=2      2/1.0 STG  occ=3  links=2 conn=1
    0/1.0 CB2  occ=4  links=2 conn=2      2/1.1 CEN  occ=3  links=2 conn=0
    totals: 6 replied · 0 unseated · 0 dup-coords · 0 orphaned refs

Three seats believe the room holds 4, one believes 6, section 2 believes 3 —
for 100+ seconds, with `FORK[split]` firing and section 2's seats at `conn=1`
and `conn=0`. No dup coords, no orphans, so the TREE is sound; what diverges is
what each seat knows is in it. Seen only across devices; not investigated.

### The demand/park trap is RULED OUT, and the deficit is real after all

A seventh hypothesis, and it was worth testing because a sibling of it turned
out to be a genuine bug elsewhere (`claimRedun`'s first-claim deadlock, fixed
2026-08-10): `mx-idle` runs `setJobActive(false)`, which `replaceTrack(null)`s
every sender AND `pausePipe()`s the worker — and a paused pipe is skipped by
the 2s key re-ask loop. Total blackout with the track still `live` and `vw>0`
from the last frame, which is exactly this leg's bright-freeze shape. And the
hot set only keeps a primary demanded while `inCand(pri)` holds, so a claim
that momentarily stops resolving would be demanded idle and could never
recover.

**Measured at a real stall: it is not that.** The stalled seat is demanding its
own claim HOT:

    STALL P0  claimed=true  fdec=17  stuck=15451ms
    demands: [ …|a2154bca…=w , …|1f08557e…=w ]

(Two hot entries is make-before-break — a wake was armed — not a ONE-PIPE
violation.)

**What the same record DOES establish, with clean attribution on both sides:**

    upstream P2 -> P0:  wrote=33  paused=false  sinceWrite=337ms
    P0 (stalled):       frecv=17  fdec=17  pkt=46   recv/s=0
    P2 (itself):        frecv=34  fdec=34

The worker's `wrote` is per-pipeId and the receiver's row is per-inbound-slot,
so unlike the earlier retracted figure neither side is a conflated label. P2
decoded 34 frames of this feed and wrote 33 toward P0; P0 assembled 17, while
P2's forward to it is unpaused and wrote 337 ms ago.

**So the question is now exactly one thing: where do frames written into an
ACTIVE forward's carrier go, between `writer.write()` returning and the
receiver's depacketizer completing a frame?** Everything either side of that
is measured healthy — no rejection, no loss, no congestion, no park, no key
starvation, no churn, no over-mint. The next instrument is the sender's own
`outbound-rtp` for THAT pipe's m-line specifically (resolved by transceiver,
not by the `out:key>to6` label, which conflates senders of one job — the trap
that produced the earlier retracted deficit).
