# Scale audit — the 1M law vs the code (2026-08-06)

**The law this doc serves:** GifOS scales to a million participants and beyond —
the whole Earth on one call. Operationally: **no per-node cost — messages,
memory, or connections — may grow with room size N.** Per-node budgets are
O(C), O(C²), or O(log N); never O(N).

**Method.** This is a from-scratch re-audit against the tree at `b81f3fd`
(2026-08-06), superseding [scale-audit-2026-08-04](scale-audit-2026-08-04.md).
Every claim below was re-verified against the code as it is TODAY — the previous
audit asserted V3 against code that had already fixed it, and that failure mode
is what this rewrite exists to avoid. Every number is tagged **MEASURED** (I ran
it, command given) or **DERIVED** (read off the code, arithmetic shown).
Sim: `g++ -O2 -std=c++17 -o mesh test/sim/mesh.cpp` (md5 `4f83acec…`), service
mode, `--det`, **single-threaded** (see the harness caveat at the end). Runs
at N ≤ 5000 on penguin, N = 20000 on clawbox — identical source, identical
seeds, same numbers where they overlap.

**A moving-tree note:** while this audit ran, an uncommitted +213-line diff in
`site/js/mesh.js` was landing the § G digest port to the JS twin (`digOn()`,
`dgUp` on PHONE/PONG/S1SYNC, flag-gated `env.DIGEST`, default OFF). Statements
below about "the browser" mean the committed tree plus that in-flight port where
noted. `site/run.html` — the actual consumer of the flood — is untouched by it.

---

> **V5 SETTLED 2026-08-07 — the audit's attribution was RIGHT, and two fix
> attempts are refuted. Measured with a per-message-type instrument (branch
> `v5-mt-instrument`, a136ce3), N=20000, converged and settled, seed 20260714.**
>
> **What the hot node receives.** Seat 161 = `/4.0` (Section 1, row 4, col 0):
>
> | type | compaction ON | OFF |
> |---|---|---|
> | **FIND (tag=1 probes)** | **72,188 = 12.03/tick, 79.4%** | **0** |
> | PHONE / PONG / S1SYNC | 6,747 / 6,000 / 6,002 | 6,750 / 6,000 / 6,000 |
> | total | 90,955 = 15.159/t | 18,771 = 3.128/t |
>
> The ON-OFF delta is FIND TO THE FRAME at every N, and FIND is the only type
> that tracks N: 0.311 / 0.963 / 2.165 / 12.03 per tick at N=500/2k/5k/20k. The
> 3.13 "floor" is just the heartbeat+rook-sync duty of any S1 seat — all 25 sit
> at 3.128 in the OFF arm.
>
> **Why that seat: position, not role.** `up({pc,r,0}) = {parent,r,lastDigit}`
> maps every child-section "0" — the first-opened, biggest subtree — onto S1
> COLUMN-0 cells, and "only a row head decides" makes row-mates forward
> everything to the head. Measured: row-mates 12-17k FIND each, head 72k ~=
> their sum. It does ZERO work for them: cAdmits 412->412, cMoves 209->209
> across the window. Every arrival exists only to die there.
>
> **The "cost is the consequence of compaction" hypothesis is KILLED.**
> PHONE/PONG/S1SYNC are identical ON vs OFF at every N (room totals
> PHONE = PONG = 15,131,250 in both arms). Moves shift the depth histogram but
> change no per-node rate — links are C-bounded, so a moved seat carries its
> O(C) heartbeats rather than stacking them. The cost is the SEARCH.
>
> **TWO REFUTED FIXES — do not rebuild either as written.**
> 1. Exponential backoff on consecutive misses: no effect (15.159 vs 15.126).
> 2. NOROOMUP walk-down + node suppression (Nathan's design, my implementation):
>    a NET LOSS. Settled-window probes fell only 2.3% (244,632 vs 250,294) while
>    adding 210,415 NOROOMUP frames; S1 row-mates rose 39%. An earlier "97% cut"
>    reported against this was MY ERROR — a cumulative counter compared against a
>    run that never passed COMPACT_SETTLE.
>    The design is sound; the implementation was not: the non-head forward branch
>    never set `lastProbeFrom`, so the walk-down died at the first S1 non-head and
>    suppression never armed anywhere deep. The leaf handler also set
>    `compactAt = TICK + 6..12`, retrying SOONER than the normal 90-180.
>
> **THIRD ATTEMPT REFUTED 2026-08-07 — the dmin gate does nothing, and WHY is
> the finding.** Gating the probe on `rootDig.dmin < my depth` (option 1 below),
> measured, N=20000, settled, same seed:
>
> | arm | framesPerTick_max |
> |---|---|
> | compaction ON, gate OFF (today) | 15.1592 |
> | compaction ON, **gate ON** | **15.1672** |
> | compaction OFF (floor) | 3.1285 |
>
> Zero effect, and the same output says why: the settled room reports
> `frontier(d0=0, d1=0, d2=3..31)`. There genuinely ARE a few admissible cells at
> depth 2, so `rootDig.dmin` is ~2, and nearly every leaf sits at depth 4-5 —
> "is anything shallower than me free?" is TRUE FOR ALMOST EVERY LEAF. The gate
> never fires. Same shape that killed digest routing in front 3
> (`dmin_distinct=1`): a room-wide minimum says "somewhere there is room", which
> licenses everyone at once.
>
> **SO V5 IS A CONTENTION PROBLEM, NOT AN INFORMATION PROBLEM.** Each leaf is
> probing RATIONALLY — room really does exist shallower than it. There are just
> ~10,000 leaves competing for 3-31 cells (and the window's 412 admits / 209
> moves are those cells being won). No better information can fix a question
> whose answer is legitimately yes for everyone. What the numbers point at is
> ADMISSION CONTROL ON THE PROBE: let about as many leaves probe per window as
> there are frontier cells to win. The room already knows `rootDig.freeC` and its
> own size, so the ratio is computable — but that is a fourth design and it must
> be MEASURED before it is believed, like the three before it.
>
> **What a real fix must touch.** The cost is ARRIVALS AT 25 FIXED SEATS, so
> anything that answers, drops or caches AT THE TOP leaves the bill unpaid.
> Ranked by what the numbers support:
> 1. **Gate the probe on evidence that a shallower frontier exists.** The room
>    already computes the answer: `rootDig.dmin`/`freeC` reaches every seat via
>    the § G rollup, and the settled room has frontier d0=0, d1=0, d2=2-8 while
>    250k probes per window ask anyway. "Probe only if dmin < my depth" takes the
>    settled-room cost to ~0. DOCTRINAL COST: G1 says a digest decides nothing —
>    this lets it gate an optimisation probe (never admission, never liveness).
>    **That is Nathan's call, not ours.**
> 2. Repair the walk-down properly: breadcrumb on EVERY forwarding hop, arm
>    suppression at S1 heads on origination, leaf backoff >= COMPACT_PERIOD, and
>    cached re-answering rather than silent drops. Even then it costs one full
>    climb per subtree per window.
> 3. Turn compaction off in settled rooms — legitimate: in a fully settled
>    window it moved 0 seats for 2.23M frames, and its whole measured benefit is
>    ~3% fewer lone-row sections.
>
> **V5 RESOLVED 2026-08-07 — Nathan's design, measured, kills it to the floor.**
> The fix is NOT admission control and NOT any of the three refuted designs:
> **cap the probe's climb at 2 levels above the seeker** (`problvl 2`,
> mesh.cpp + mesh.js PROBLVL). The funnel was the climb — every unservable
> probe walking 12 levels to the S1 wall; capped, no node can receive more
> than its 2-level subtree's probes, so per-node arrivals stop being a
> function of N at all. N=20000, spreadon 1, settled 6000-tick window,
> framesPerTick_max, four seeds:
>
> | seed | today | problvl 2 | + offeron | floor (off) |
> |---|---|---|---|---|
> | 11 | 13.67 | 3.136 | 3.136 | 3.129 |
> | 12 | 12.70 | 3.143 | 3.143 | 3.129 |
> | 13 | 14.28 | 3.136 | 3.136 | 3.129 |
> | 20260714 | 15.15 | 3.143 | 3.136 | 3.129 |
>
> 99.8%+ of the excess above the floor is gone on every seed (the outlier seed
> reproduces this audit's 15.15 exactly); windowed S1 probe arrivals fell
> 866k -> 325 (cAtS1, a counter this work brought to life); settled-room
> compactness is equal or better than today's; CHECK PASS dups=0 everywhere.
> **THE DEFAULT DID NOT FLIP THIS RELEASE — one dominance question is open.**
> repro-compaction's deep-shrink leg reds at problvl 2 on SEED 2 ONLY
> (capped+offers 17 sections / 8 lone vs the OFF control's 14/4; seeds 3/4/5
> pass, several BETTER than control; aggregates dominate: 64 vs 78 sections,
> 21 vs 37 lone). Root-caused as far as the mechanism goes: at the shrink
> fixed point the remaining stragglers have FULL ancestor-chain rows while
> free cells sit in COUSIN branches — unreachable by probe or offer, capped
> or uncapped (both are chain-scoped by design), so the seed-2 delta vs
> uncapped (17 vs ~15) is move-order chaos at the battery's floor, the exact
> class its own history notes forced onto aggregate rules twice. Two walk
> bugs found and fixed on the way (offers dead-ending on childless
> non-rightmost seats; laterals emitted to corpse occ entries — the FINDLEAF
> first-hand-live discipline applied). NEXT CAMPAIGN: settle seed 2 with a
> replicated sweep (capped-vs-uncapped at N reruns, aggregate rules), then
> flip both twins — problvl 2 + offeron 1, or probeon 0 offers-instead if its
> shrink dominance also holds.
>
> **AND THE PROBE MAY NOT NEED TO EXIST AT ALL.** Nathan's insight: heal always
> worked owner-initiated (FINDLEAF pulls a leaf up into a confirmed-dead hole);
> compaction never had that side — the probe exists because of that missing
> symmetry. `offeron 1` builds it (a row head with a first-hand free densifying
> slot OFFERs it down its subtree; an eligible mover answers with a ttl=3
> targeted probe; the admit stays first-hand in serveCompact). Measured
> OFFERS-ONLY (`probeon 0 offeron 1`), same regime, all four seeds:
> **57-151 probes per window instead of 450,000-485,000** (a ~8,500x frame
> reduction), offer->move conversion up to 98%, framesPerTick_max = the floor
> to four decimals (3.1285-3.1357), cAtS1 = 0, CHECK PASS dups=0, compactness
> in the same band (mixed ±5% per seed vs today). Shipped default-OFF; the
> flip to offers-instead is a one-verb decision once compactness dominance is
> swept at repro-compaction's standard.

## The verdict, ranked by how much it actually blocks 1M

| # | violation | plane | status | blocks 1M at |
|---|---|---|---|---|
| 1 | **V1 — the status pulse floods the room** | status | **ALIVE in the browser**; sim rollup DONE + gauged; JS-twin port in flight (flag OFF); run.html not migrated | ~10⁴ (derived) |
| 2 | **V2 — statusOf and its satellite maps grow O(N)** | status/memory | ALIVE; follows from V1; lifecycle now gate-tested (no cap asserted) | ~10⁵ memory, ~10⁴ CPU (derived) |
| 3 | **V5 — the Q2 compaction probe funnels into Section 1, LINEARLY in N** | healing/Q2 | **FIX PROVEN 2026-08-07, default not yet flipped** — problvl 2 takes the hot seat to the floor on every seed (offers-instead floor-flat too); ships default-OFF pending the seed-2 shrink-dominance sweep (see the V5 blocks above) | ~10⁵–10⁶ until the flip; then none measured |
| 4 | **V4 — mass-join convergence ceiling** | seating | **SOLVED-BUT-UNSHIPPABLE**: T7 converges N=20000; ships OFF (compactness trade) | mass-join only; steady rooms unaffected |
| 5 | **V6 (NEW, named) — the front-door admission funnel** | relay/join | inherent serialization: 30 sockets/session + S1 admitters | wall-clock of a 1M mass join, not per-node cost |
| — | V3 (dial set O(N)) | transport | **DEAD — kill it.** Dial-out is `linkTo()`-gated everywhere. Stop re-auditing it. | — |

**The headline finding of this re-audit is V5**, because it is the only per-node
cost anywhere in the CONTROL mesh whose growth in N I could measure directly,
and because nobody was looking for it: the 2026-08-04 audit lists healing as
"O(1) designated healer per hole — FINE" and never examines compaction, which
is a different mechanism on a different clock.

---

## 1. Plane by plane

### 1.1 Seating / occ state — FINE (MEASURED)

Per-seat state is flat in N. Sim, converged rooms, det seed, `spreadon 1`,
`digeston 1`, gauge window = 500 ticks post-convergence:

| N | converged@ | occ_max | digState_max | digState_p50 | framesPerTick_p50 | framesPerTick_max |
|---|---|---|---|---|---|---|
| 500 | 960 | 30 | 27 | 3 | 0.126 | 3.44 |
| 2000 | 2176 | 30 | 27 | 3 | 0.126 | 4.07 |
| 5000 | 3200 | 30 | 27 | 3 | 0.126 | 5.26 |
| 20000 | 4480 | 30 | 27 | 3 | 0.126 | 15.13 |

`occ_max=30` and `digState_max=27` are exactly flat across a 40× range of N —
the occ map is O(C²) as designed (`bound=39` in the gauge is the asserted
ceiling). Root digest count was EXACT at every N (`rootExact=N`, `mismatch=0`,
`DIGGAP` all-zero at N=20000). The p50 frame rate is 0.126 at every N; the
`framesPerTick_max` column is the ONE number here that moves, and § 1.3 shows
by A/B that all of its movement is compaction (V5) — with compaction off it is
3.14 at N=20000, i.e. flat.
The browser twin's occ is the same structure (`site/js/mesh.js` `setOcc`/W5
S1SYNC is S1-scoped, ≤ C² entries; deep entries only for owned links).
**Verified, still true** — the 2026-08-04 audit's measurement (max 31 @ N=1000)
reproduces.

### 1.2 Routing — FINE (DERIVED)

`nextHopCoord` (`site/js/mesh.js:1357`) is greedy arithmetic over owned links —
no routing table exists anywhere. O(log_C N) hops, O(1) state. Unchanged.

### 1.3 Healing + compaction — healing FINE; compaction has a NEW finding (V5)

Healing: one designated healer per hole (C3), paced (`healTry` 45t,
`healAt` 12t) — O(1) per hole, verified at `mesh.js` `heal()`. FINE.

### V5 — the Q2 compaction probe funnels into Section 1, linearly in N (NEW, MEASURED)

**The mechanism.** `tryCompact()` (`site/js/mesh.js:2382`, sim
`mesh.cpp` COMPACTION) fires from every settled, childless, trailing-in-row deep
leaf every COMPACT_PERIOD..2× (90–180 ticks) and emits a FIND tag=1 that climbs
the up-chain. `serveCompact()` (`mesh.js:1106`) hands it head-ward and
level-ward until some row head finds a strictly-shallower densifying slot — **or
the probe reaches Section 1, where `ownerCoord()` is null and it simply dies**
(S1 never seats a compactor: "the chain climbs THROUGH S1 but never seats
there", by H1-S1 ring conservatism). The probe carries no evidence that a
shallower slot exists anywhere; in a DENSE settled room — exactly the 1M steady
state — essentially every probe walks its whole chain and dies at the top.
So the C² = 25 Section-1 seats absorb the dead-probe traffic of the entire
room: **O(N/C²) frames per S1 seat**, forever.

**MEASURED — a clean A/B at N=20000** (`compacton 0|1`, same seed 20260714,
same `spreadon 1`, same 500-tick gauge window after convergence, single-thread,
clawbox):

| N=20000 | converged@ | framesPerTick_max | framesPerTick_p50 | cProbes |
|---|---|---|---|---|
| compaction **ON** (production default) | 4480 | **15.126** | 0.126 | 123,911 |
| compaction **OFF** | 4288 | **3.140** | 0.126 | 0 |

**Compaction is 12 of the 15.1 frames/tick at the hottest node — 79% of it.**
Everything else in the mesh contributes a flat 3.1.

And that residue IS flat in N. The compaction-ON max across the ladder, against
the measured compaction-OFF baseline of ~3.1:

| N | framesPerTick_max (ON) | minus baseline ≈ 3.1 | ratio vs previous N |
|---|---|---|---|
| 500 | 3.436 | ~0.3 | — |
| 2000 | 4.074 | ~1.0 | N ×4 → ×3.3 |
| 5000 | 5.264 | ~2.2 | N ×2.5 → ×2.2 |
| 20000 | 15.126 | ~12.0 | N ×4 → ×5.5 |

The compaction component tracks N — roughly linearly, arguably slightly
superlinear at the top (tree depth grows). p50 is **0.126 at every N**, so this
is not a room-wide cost: it is a *funnel* onto the C² seats at the top, which is
precisely the shape the law forbids.

**Not a post-storm transient, and it does NO WORK — MEASURED in steady state.**
Gauged immediately after convergence and again after thousands of further
settled ticks:

| | N=5000 (+5,000 settled ticks) | N=20000 (+6,000 settled ticks) |
|---|---|---|
| framesPerTick_max, at convergence → settled | 5.264 → **5.294** | 15.126 → **15.016** |
| cProbes, at convergence → settled | 20,026 → 68,685 | 123,911 → **374,116** |
| sustained probe-hop rate | **9.7 / tick** | **38.5 / tick** |
| cAdmits over the settled window | 256 → 256 | 412 → **412** |
| cMoves over the settled window | 86 → 86 | 209 → **209** |

Two things fall out. (1) **The rate is exactly linear in N** — 4× the room,
4.0× the probe hops (9.7 → 38.5). (2) **250,205 probe hops at N=20000 produced
ZERO admissions and ZERO moves.** In a settled room the entire mechanism is
pure overhead, permanently. The probing does not decay: the quiescence gate
(COMPACT_SETTLE 300) *enables* probing once a room settles rather than damping
it, so the cost is at its maximum exactly when the room is doing nothing.

The concentration is severe as well as linear: the hottest node alone absorbs
~12 of the 38.5 hops/tick — about **31% of all compaction traffic in a
20,000-person room lands on one seat**. The funnel is structural, not a seed
artifact: `ownerCoordOf` returns false at `pc==0` (`test/sim/mesh_seat.inc:2`,
JS twin `mesh.js` `ownerCoordOf`), so a probe that finds no shallower slot
climbs until it reaches Section 1 and terminates there. Every dead chain in the
room ends on one of the C² = 25 home seats — and the gauge confirms it directly:
`framesPerTick_maxAt=161`, and `seat 161` resolves to coord **`/4.0` — a
Section-1 row head** (occ=30, the full rook degree). The settled N=20000 gauge
reproduced at 15.016 across two independent runs.

**DERIVED extrapolation to the law's target:** linear in N from the measured
12 frames/tick at N=2×10⁴ gives ~600 frames/tick at N=10⁶, i.e. **≈1,200
control frames/s arriving at a Section-1 seat**, in a completely idle room,
each one sealed and requiring a decrypt. That is a wall, not a nuisance. (Treat
the exact figure as an extrapolation over a 50× gap, not a measurement — the
load-bearing fact is the measured linearity and the zero useful work, not the
specific number at 10⁶.)

**Birth certificate.** Q2 compaction (healing-laws W7 "Keep the home DENSE",
Nathan 2026-07-20) was built to re-densify a tree after CHURN, in rooms where
"probe blindly, cheaply, on a slow clock, up a short chain" is exactly right —
and it is self-duty by design, which is the property that made it safe. The
small-room bug it fixed is real (a churned tree grows deep and sparse, and depth
is latency). Nobody ever ran that clock against a million settled leaves whose
chains all terminate at the same 25 seats. Invisible below a few thousand nodes:
at N=500 it is 0.3 frames/tick.

**Both twins, and ON in production.** `mesh-wire.js:242` sets
`COMPACTION: root.GIFOS_COMPACTION === false ? false : true` — default ON for
every real client. The sim default is also ON (`mesh.cpp:91`). So this is live
behaviour, not a sim artifact.

**Fix directions (sim-first, unbuilt).** All cheap, all local: (a) gate the
probe on the seat's own first-hand evidence that a shallower non-full row exists
(it already learns row occupancy from PONGs); (b) exponential backoff after
consecutive dead probes, reset by any observed churn — a settled room stops
probing entirely; (c) let the S1 terminator answer NOROOM-COMPACT so the prober
learns the tree is dense, rather than dying silently. Any of these restores
O(C). The A/B above is the ready-made gate: assert `framesPerTick_max` flat in N
with compaction ON.

### 1.4 Mass join (the old V4) — SOLVED-BUT-UNSHIPPABLE; the old audit's table is dead

The 2026-08-04 table (N=3000 INCOMPLETE 1915/3000 etc.) is **fully superseded**:
the V-laws (healing-laws § V, V1–V6) killed the dup-mint families, and **T7
spread-after-NOROOM (commit `32bd683`, 2026-08-06) kills the lone-spine descent
plateau**:

- MEASURED (this audit, det, single-thread, `spreadon 1`): N=2000 →
  2000/2000 @ 2176; N=5000 → 5000/5000 @ 3200, dups=0, s1cells 25/25.
  N=20000 mass join converges (commit `32bd683` records @4480 on this box;
  my digest-gauge re-run confirms the converged state — § 1.1 table).
- T7 is **OFF by default** because it trades tree compactness
  (repro-compaction leg 1 reds under it — the trade is inherent, measured in
  `32bd683`). With it off, N=5000 still plateaus (~3076 at the 60k cap) and
  `test/sim/scale-frontier.sh` is tracked expected-RED in
  `test/batteries/known-unfixed.sh` with the full covenant.

So the honest 2026-08-06 statement: **the mesh can seat 20000 in one storm,
deterministically, dups=0 — but only under a flag whose cost (a sprawling tree)
is unresolved.** The open work is the compactness trade, not the mint storm.
Do not re-diagnose the dup-mint families; they are closed and law-ised (§ V).

### 1.5 The status plane — V1: THE violation, ALIVE in the browser (VERIFIED)

`broadcastStatus()` (`site/run.html:1771`) builds
`{kind:'status', s: myStatus, conns: myConns(), sid, mod: modTable, modw, name, ip}`
(line 1798) and hands it to `fanOut()` (line 3801), which DC-sends to the
roster AND calls `meshNode.gossip(...)` (line 3806) — the room-wide GSP flood
(`mesh.js:1599`, fan ≤ links, dedup'd, spans the stadium). Cadence: `SCALE.HB`
= 4000 ms (`gifos-net.js:474`), 12 s hidden. So every node receives every
node's pulse every 4 s: **O(N) frames per node per period.**

DERIVED ceiling: at N=10⁴ that is ~2,500 sealed messages/s in, each AES-open +
JSON-parse + `takeStatus`, and each re-fanned over ≤C+1 links — a browser main
thread dies somewhere in 10³–10⁴. At 10⁶ it is 250k msg/s: five orders past the
law. This is the single violation that caps the product.

**What has moved since 2026-08-04 — the fix is real and staged:**

- The rollup digest (healing-laws § G, G0–G8) is BUILT AND GAUGED in the C++
  reference: MEASURED above — frames/node/tick p50 0.126 flat, digest state
  ≤ 27 flat, root count EXACT, at N up to 20000. `test/sim/repro-digest.sh` is
  the 47-assertion gate.
- The JS twin port is IN FLIGHT (uncommitted `mesh.js` diff, flag-gated
  `env.DIGEST`, default OFF; `mesh-wire.js` does not set the flag yet).
- `site/run.html` — every actual consumer of the flood — is NOT migrated.

**The consumer inventory (the real migration surface).** Healing-laws § G's
table lists count / consent / roster-liveness / ghost-suppression / mod-table /
chat. The code today carries MORE on the pulse, and every one of these needs a
digest-era answer before the flood can be removed
(all in `run.html` unless noted):

| flood consumer | where | digest-era story |
|---|---|---|
| participant count `knownTotal` | :1809 | root digest `n` (G2 label) — designed |
| clear-video consent gate | `freshConsent`/`allConsent` :2281 | G3/G4 refusals — designed |
| roster liveness (15 s rule) / ghost suppression | `stHold`, renderFromOcc :4523 | near-field first-hand — designed |
| mod table + admin `modw` re-gossip | :1798, `takeMod` | on-CHANGE tree flood (G6) — designed |
| **Stage membership + order (`stg` flag)** | `stageIds` :1598; docs/media-plane.md "membership rides phone-home" | **NO designed story** — Stage is room-global by definition; ≤C members' flags must reach everyone. Candidate: ride the Stage/strip meta that already fans down. |
| **Stage votes `vup`/`vdn` + tallies** | :1786, `stageVoteTallies` :1695 | docs/vote-scale.md V1–V4 fold — DESIGNED, sim-first, NOT built; shipped code has the honest scale guard (under-count votes, never the room) |
| **app ad (`st.app`) + `findSharedApp` + `stopRoomApp` drum** | :10744, :10704 | NO designed story — the room-wide app is discovered by scanning statusOf; the stop drum unicasts to `gossipIds()` ∪ ad-carriers, both O(N) sends from ONE node (:10730) |
| **conns lists (friend-relay discovery)** | `myConns` :1768 → `connsOf` :7173 | NO designed story; conns are only consumed for peers you'd relay for — could be neighbourhood-scoped trivially |
| names + ips | :4211-4212 | near-field + on-demand; only needed for tiles/panel you can actually see |
| cc (captions), sing, hand, away/power | :9627, :9392, :4104 | near-field for tiles; hands are room-global UX (banner) — needs a rollup or a cap |

The point of the inventory: **removing the flood is not one fix, it is a
migration of ~10 consumers**, three of which (Stage membership, app ads, stage
votes) have no written design yet. That is the actual remaining work of V1.

Birth certificate (unchanged, verified in the comments at :1818-1827): the
room-wide re-broadcast was the honest fix for split-view bugs at 20 people
("one lost message used to split the room's view of reality forever").

### 1.6 V2 — `statusOf` and its satellites: O(N) memory + O(N) scans (VERIFIED, one stamp corrected)

`statusOf` (`run.html:1538`) stores every status heard = every participant
under V1. Deleted only on tombstone/confirmGone (:4012, :4348) — live peers
accumulate without bound. The satellite maps grow with it:

- `connsOf` (:7173) — pid → their conns list: **O(N·C)**, the biggest one.
- `devOf`, `ipsOf` (:4727-4728), `rosterNames` (pruned to roster :4559, but the
  roster is O(N) — see below), `occFirstSeen` (synced to occ, bounded),
  `meshGone` (reaped at 60 s, :5264 — bounded, verified).
- `rosterIds` (:4541-4542) unions every fresh `statusOf` entry into the
  directory — the directory is O(N) by construction while the flood exists.

DERIVED constant: a statusOf entry (status obj + name + ip + conns + dev) is
roughly 0.5–1 KB retained → **~0.5–1 GB at N=10⁶**, and ~5–10 MB already at
N=10⁴. This is the "O(1)-per-entry, fatal-in-aggregate" shape the audit brief
warns about, live in the main map.

O(N) CPU scans over these maps, per beat or per render: `stageIds` (:1614
iterates `new Set([myId, ...rosterIds])` — 36 call sites, incl. `layout`,
`reconcileGrid`, `refreshOutbound` and the mosaic reconcile),
`stageVoteTallies` (:1714, cached 500 ms), `findSharedApp` (:10761, every
status tick), `knownTotal` (:1814, occ-scoped + roster union), `adCarriers`
(:10726).

Worth naming individually because it is worse than O(N): **`livePeerCount()`
(:3084) is O(C·N)** — it loops `peers` (O(C)) and calls
`rosterIds.includes(pid)`, a linear scan of the O(N) directory, inside the
loop. It feeds `leafCount` → `participantCount`, which is called from
`updateStatus` every beat, from `rung(n)`, and from `stageVoteTallies`.
An `includes` on an array was free when the roster was a room of twelve.
All of these collapse to O(C²)-scoped scans once the directory is near-field
plus digest — none of them needs its own fix, they need V1.

**Stamp corrected:** the 2026-08-04 header said V2 was "completely untested."
That is STALE — `test/browser/e2e-status-map.js` exists and is reachable from
the release gate (`release.sh` globs `test/browser/*.js`). It pins the
LIFECYCLE (an entry dies with its peer, never resurrects, negative control via
`_corruptStatus`) and honestly declines to assert a cap, because there is no
cap to assert. When eviction lands, that suite is where the cap assertion goes.

### 1.7 V3 — the dial set: DEAD. Kill it. (VERIFIED against today's code)

Every dial site is `linkTo()`-gated: `renderFromOcc` dials only
`linkTo(v)` occupants (:4536-4539) and `linkTo(pid)` roster members (:4547).
Media senders are row-scoped and stage-parked (`refreshOutbound` — "the raw
camera is CHANNEL R only"; `attachLocalTracks` :9995 "row-mates only; parked
while staged"). Honest per-node pc/DC degree is **O(C)**. The 2026-08-04
audit's own stamp already said this; it is still true; this audit says it
plainly so nobody reads the V3 section of the old doc again.

The narrow residual, verified still present (`run.html:4146`): an inbound OFFER
from a peer the mesh does not know yet is ACCEPTED
(`if (!linkTo(from) && meshKnows(from)) reject` — unknown ⇒ fall through to
`makePeer`). This is deliberate and small-room load-bearing (media before the
seating dance settles; the 2-person and plane-guest cases). It is not a scale
violation — honest peers only dial owned links — it is an adversary lever:
any admitted member can force a pc+DC onto every node it can name. Cost is
O(attackers), bounded by the sweeper retiring unwanted links. Noted in § 3.

### 1.8 Chat / files / app-state deltas — FINE by the law (VERIFIED)

- Chat: one GSP flood per message (:6611); every reader reads every message —
  irreducible O(1)/node/message. The `chat` Map grows with message count
  (room-size independent); the `hi` backfill is capped (500 chats / 300
  transcripts / metas, :6628). FINE.
- Files: metas gossip; BYTES are pull-only over existing DCs
  (`{k:'want'}` :7026-7031) — epidemic hop-by-hop, O(C) sources per node,
  never a room-wide byte fan. FINE.
- Shared-app state: deltas ride the same gossip lane (:5003) — same shape as
  chat. FINE per node. (The app STOP drum is the exception — § 1.5 table.)
- App BYTES in a meeting: peer-served over DCs since the star rip-out
  (docs/one-runtime.md step 6; the old `need-app` path is deleted). O(C). FINE.

### 1.9 The media plane — FINE, and the doc matches the code (VERIFIED, derived)

Degree ≤ C+1 always (`docs/media-plane.md` "Load & distribution", verified
against `refreshOutbound`/`camPeer` row+stage gating and the mesh link set).
Heads composite ONE fixed-budget canvas (COMP_W×COMP_H = 756×1344, 8 fps,
`gifos-net.js` SCALE) regardless of subtree depth — the 1M room costs a head
exactly what a 100-person room does; depth adds latency, never per-seat load.
The one-pipe redundancy law keeps standbys at zero bytes. Stage is capped at C
feeds + one strip. Stadium cap+densify pins the footprint at ~100 squares.
Nothing here grows with N. The Stadium's `stadiumTiny` threshold reads the
gossiped room size — a display input, G2-label-shaped, fine.

### 1.10 The relay / greeter registry — FINE per node and per room (VERIFIED)

`relay/src/relay.js`: a room session holds ONLY the greeter pool + knock churn —
`MAX_SOCKETS_PER_SESSION = C²+C = 30` (:123, enforced :420), sealed greeter
blobs ≤ 4 KB, TTL 250 s, `RELAY_CAP` 72 entries. Seated members hold no relay
socket. Per-room relay state is **O(C²)**; per-node relay traffic when seated
is E3 re-knocks for S1 seats only (~1/100 s each). R2 holds: the relay stores
`H(genesis)` + sealed blobs and arbitrates nothing. **Verified, still the
"deliberate and KEPT" bootstrap plane** of the old audit.

**V6 (new, named): the admission funnel is a wall-clock ceiling, not a per-node
cost.** A 1M mass join must serialize through (a) one DO with 30 concurrent
sockets and per-IP caps, and (b) the C² S1 admitters (R4/H7 — inherent to S1
being the door). DERIVED: at an optimistic 10–50 door-cycles/s, seating 10⁶
newcomers takes 6–28 hours. The sim's 20000-in-4480-ticks (≈37 min at the
500 ms production tick) models the MESH side only — the sim has no 30-socket
door. No law is violated (per-node cost stays flat), but "the whole Earth on
one call" has an untested, unmodelled front-door throughput story, and nobody
has ever measured a real door-cycle rate under load. Flagging it so it stops
being invisible.

### 1.11 Crypto (S4) — O(1) per frame; two named DoS levers; one growing constant

- Per-join: one keypair mint, one sign per occupancy-authoring frame
  (`mesh-wire.js:61` — FINDLEAF/PLACE/CLAIM/HELLO/SITPONG/SITXFER), verify on
  ingest (:288) via a TOFU pin store. O(1) per frame, O(C) frames per join
  event. FINE, including the vendored-signer fallback for old browsers
  (0.9.4 — same shape, slower constant).
- **DoS lever 1 (adversary-controlled per-join work):** `verifyChain` is a
  SERIALIZED promise queue (`gifos-net.js:444`); a member spamming forged
  signed frames at a greeter forces sequential Ed25519 verifies (~10³/s per
  browser core) and delays legitimate admission verifies behind them. Bounded
  by link/relay rate caps, but the queue has no per-sender budget. Noted, not
  fixed, not measured.
- **DoS lever 2:** knock churn at the relay is the classic one — per-IP socket
  and join-rate caps exist (:MAX_SOCKETS_PER_IP, MAX_JOINS_PER_IP_MIN,
  joinLog), so this is handled; a distributed attacker degrades the DOOR, not
  seated members (R2 keeps the room itself off the relay). Acceptable posture.
- **Growing constant:** the TOFU pin store (`mesh-identity.js:90`) never
  evicts. An S1 admitter pins every joiner it ever admits → O(admissions) over
  room life ≈ N/C² per admitter → ~4 MB at 10⁶. Not fatal; wants an eviction
  tied to the same horizon evidence uses everywhere else.

### 1.12 GSP flood mechanics — bounded, with one V1-coupled caveat (VERIFIED)

`mesh.js:1599-1630`: fan ≤ live links, `gseen` dedup with horizon GC (prune
>600 ticks when >4096 entries), `grecent` re-fan capped at 64 entries / 256
ticks. All bounded — EXCEPT that `gseen`'s working size is O(messages within
the 600-tick horizon), which under the V1 flood is O(N) (at 10⁶ and 4 s pulses:
~75M ids in the horizon — hundreds of MB of dedup keys alone). With the digest
in place, gseen scales with CHAT rate — fine. This is not a separate violation;
it is V1's shadow inside the mesh layer, recorded so nobody "fixes" gseen.

### 1.13 Service worker / storage / desktop — FINE (VERIFIED, briefly)

`site/sw.js` precaches the shell, versioned caches, no per-room or per-N state.
localStorage: identity, invite history (capped 50, :6063), pw+epoch — O(1).
The desktop/app planes (`desktop.js`, app rooms) are not room-N-coupled at all.

---

## 2. What is ALREADY FINE — do not re-audit

- **Occ/seating state**: O(C²), measured flat to N=20000 (§ 1.1).
- **Routing**: greedy coordinate arithmetic, zero tables (§ 1.2).
- **Healing designation**: one healer per hole, paced (§ 1.3). (Healing is
  fine; COMPACTION, audited here for the first time, is not — do not read the
  old audit's "healing: O(1) — FINE" row as covering it.)
- **The digest itself (sim)**: O(C) gauges flat, root-exact, 47-assertion gate
  (§ 1.1, § 1.5) — the design is proven where failure is cheap.
- **Dial-out / connection degree**: `linkTo()`-gated, O(C) (§ 1.7 — V3 is dead).
- **Chat / files / app bytes / app deltas**: O(1)/node/message, pull-based
  bytes (§ 1.8).
- **Media plane end to end**: fixed composite budget, row-scoped raw fan,
  one-pipe redundancy, capped Stage, capped Stadium footprint (§ 1.9).
- **Relay per-room and per-node cost**: O(C²) registry, greeters-only sockets,
  per-IP caps (§ 1.10).
- **Per-frame crypto**: O(1) sign/verify, mandatory, both signer backends
  (§ 1.11).
- **meshGone / occFirstSeen / grecent / chat-backfill caps**: all bounded,
  verified individually (§ 1.6, § 1.12, § 1.8).

## 3. Adversary-controlled per-join work (the DoS ledger)

A million-person room is a security surface; these are O(1)-amortised costs an
attacker can pump:

1. Forged signed frames → serialized Ed25519 verify queue at greeters
   (§ 1.11). No per-sender budget on `verifyChain`.
2. Inbound-offer acceptance from mesh-unknown peers (`run.html:4146`) → any
   member can force pc+DC formation on any node it can name (§ 1.7). Sweeper
   retires them; formation itself (ICE, DTLS) is the cost.
3. Knock churn at the door → per-IP caps + join-rate log already in place
   (§ 1.10). Residual: a botnet degrades ADMISSION only; seated members don't
   notice (R2).
4. The app STOP drum and any other O(N) unicast fan (`stopRoomApp`) — one
   member's action producing N sends from one node is also one ATTACKER's
   action producing N sends (§ 1.5 table). Migrates with V1.

## 4. Bad constants at 10⁶ (O(1)-per-entry, fatal in aggregate)

- `statusOf` + `connsOf` + `devOf` + `ipsOf` + `rosterNames`: ~0.5–1 GB
  (§ 1.6) — collapses with V1/V2.
- `gseen` dedup keys under flood: O(N) per horizon (§ 1.12) — collapses with V1.
- TOFU pin store at long-lived S1 seats: ~4 MB/seat at 10⁶ admissions
  (§ 1.11) — wants horizon eviction.
- DOM: tiles are peers-scoped O(C) (verified — `reconcileGrid` hides non-row);
  but any UI that renders `rosterIds` (hands banner queue, roster panel) is
  O(N) DOM the day the directory is real. Audit UI surfaces when V1 migrates.

## 5. Guardrails (what keeps this audit true)

Existing: `repro-digest.sh` (O(C) gauges + G-laws, sim), `e2e-status-map.js`
(statusOf lifecycle, in the browser tier glob), `scale-frontier.sh`
(known-unfixed covenant: the day it converges default-ON it becomes
`repro-scale.sh`), `known-unfixed.sh` T7 entry (the compactness trade).

Missing, in priority order:
1. **A gate on `framesPerTick_max` flat in N with compaction ON.** The gauge
   already exists (`digest`/DIGGAUGE); nothing asserts its max column, which is
   why V5 sat unseen through a whole audit cycle. The A/B in § 1.3 is the
   ready-made test: two runs at N=5000 and N=20000, `compacton 1`, assert the
   max does not grow. It fails today — write it with the fix, not before.
2. A browser unit pin: directory/dial-set size stays ≤ row+duty bound with a
   synthetic 10k-entry statusOf (the 2026-08-04 ask; still does not exist).
3. Any measurement at all of door-cycle throughput (V6) — even a 100-joiner
   drill against the local relay with the 30-socket cap engaged.

## 6. Harness caveat — `--threads` is BROKEN — **ANSWERED 2026-08-06: it is the harness**

> **RESOLVED — see [docs/sim-threads-2026-08-06.md](sim-threads-2026-08-06.md).**
> The open question below ("is lockstep hiding a real race?") was chased and
> settled: **reading (a), decisively.** Every teleport in every threaded run —
> 5,049 of them — was ADJACENT AT EMIT; not one was genuinely non-adjacent when
> the send was made. `classifyEmit` judges adjacency at FLUSH time for a send
> decided at EMIT time. Proved with concurrency removed entirely: the buffered
> path with ONE thread produces 2,155 teleports where the serial path produces
> 0. No product finding. Correctly-built parallel runs converge 2000/2000 with
> dups=0, so the protocol tolerates concurrency fine.
>
> Two harness defects came out of it, and the second is worse than the first:
> (1) the assertion's deferred read, above; (2) **`--threads=N` without
> `-fopenmp` — which is every build line in this repo — silently simulates only
> 1/N of the room** (N=2000 threads=4 seats exactly 500; ids not ≡0 mod N never
> tick). `--threads>1` is now REFUSED by the sim. Every number in this audit was
> single-threaded and is unaffected.

The original caveat, kept for the record:

`./mesh --service --threads=4` **core-dumps on the TELEPORT assertion** — a
YIELD frame routed to a seat the sender has no path to — at N=2000, tick 128,
deterministically. Reproduced on **two different machines** (penguin 4-core,
clawbox 6-core), with and without `--det`, with digests on and off: 5/5 crashes.
The identical seed converges **clean 5/5 single-threaded** (N=500 … 20000).
Every number in this audit is therefore single-threaded.

The comfortable reading is "a race in the sim's per-thread outbox merge"
(`mesh.cpp:229-237, 964-989`) — plausible, and the merge is explicitly the
newer, less-validated path. But the uncomfortable reading deserves recording,
because nobody has ruled it out: **the threaded fabric is the only mode in which
seats process concurrently, and concurrency is what real life does.** A routing
invariant that holds in lockstep and breaks under interleaving is exactly the
class of bug a single-threaded reference sim cannot see, and the sim is the
declared source of truth for the JS twin. No gate uses `--threads` (grepped:
zero references in `test/sim/*.sh`, `test/batteries/*.sh`, or the sim README),
so this has never been on anyone's gate.

Recommended: someone should determine which reading is true before the next
scale push. If it is the harness, fix and gate it; if it is the mesh, it is a
correctness finding that outranks everything in this document.

---

## 7. Sequencing (what actually unblocks 1M, in order)

1. **Land the JS digest twin + gate it** (in flight) — then migrate run.html's
   consumers one at a time, hardest three first because they are undesigned:
   Stage membership, app ads/stop, stage-vote fold (docs/vote-scale.md V2–V4,
   sim-first).
2. **Remove the GSP ride from `fanOut` for `kind:'status'`** only when every
   consumer in the § 1.5 table has a non-flood source and small-room e2e is
   byte-identical (G8).
3. **Cap/evict statusOf and satellites** to the near field + duty set; move
   the cap assertion into `e2e-status-map.js`.
4. **Resolve the T7 compactness trade** (the last mass-join blocker) — then
   rename `scale-frontier.sh` → `repro-scale.sh` per the covenant.
5. **Gate the compaction probe** (V5) sim-first: candidate-evidence or backoff;
   add the max-frames gate (§ 5.1). This one is cheap, local, fully measured,
   and has a clean A/B already — arguably it should go FIRST, ahead of the V1
   migration, purely because it is a day of work rather than a month.
6. **Measure the door** (V6): a real join-rate number under the 30-socket cap,
   then decide whether a 1M mass join needs door sharding or is simply a
   hours-long procession (which may be acceptable — argue it, don't assume it).
