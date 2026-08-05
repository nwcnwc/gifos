# Scale audit — the 1M law vs the code (2026-08-04)

**The law this doc serves:** GifOS scales to a million participants and
beyond — the whole Earth on one call. Operationally: **no per-node cost —
messages, memory, or connections — may grow with room size N.** Per-node
budgets are O(C), O(C²), or O(log N); never O(N).

This audit came out of the plane incident
([seating-under-flap-2026-08-04](seating-under-flap-2026-08-04.md)):
explaining how a video pc existed without a seat forced a precise read of
what is local and what is not. Four violations surfaced. Nathan's reaction —
"I didn't know these flaws crept in" — is the point of writing them down
with their birth certificates: each crept in as the honest fix to a real
small-room bug, and each is invisible below a few thousand nodes.

## What already honors the law (measured, not assumed)

| plane | per-node cost | evidence |
|---|---|---|
| occ map / seating state | O(C²): min 3, p50 6, max 31 @ N=1000 | harness measurement; S1 seats hold exactly ~30 |
| routing | O(log₆ N) hops, no tables | `nextHopCoord` greedy over owned links |
| healing | O(1) designated healer per hole | C3 fixed designation |
| chat | O(1) per message per node | GSP flood, dedup'd; every reader reads every message — irreducible |
| video pixels | O(C) pcs carry composites | track fan is row-scoped (`run.html` "row-mates only; parked while staged"); Stadium/Stage composites ride the tree (§9 passthrough work) |

## The violations

### V1 — the status pulse floods the whole room  ❌ the root flaw

Every participant's heartbeat (`{kind:'status', …}` — camera state, blur,
consent, sid, mod table) goes through `fanOut()`, which DC-sends to the
local directory **and** calls `meshNode.gossip(...)` — the room-wide GSP
flood. Every node receives every participant's pulse every few seconds:
**O(N) frames per node per period.**

It is LOAD-BEARING, in the code's own words (`knownTotal`): *"statuses
flood the whole room, so every live participant shows a fresh pulse — a
corpse echo … must not hold the count."* Room-wide status currently
underpins: the participant count, roster liveness (the 15s rule), ghost /
corpse suppression, and the unanimous-consent clear-video gate.

Birth certificate: the room-wide re-broadcast was the fix for real
split-view bugs ("one lost message used to split the room's view of
reality forever — half the phones believing consensus, half not; mixed
clear/blurred tiles"). Correct at 20 people. A ceiling at 10⁶.

The fossil that shows the scalable answer existed: `knownTotal`'s comment
— *"the deck aggregation machinery died with the deck model; a deep
stadium's total becomes a media-plane concern."* Hierarchical rollups were
deleted, and room-wide flood quietly took over their job.

### V2 — `statusOf` / the directory grow to O(N)  ❌ follows from V1

`statusOf` stores every status heard; with V1 flooding, that is every
participant. `renderFromOcc` then unions it into the directory:

```js
for (const v of s.occ.values())  … ids.add(v);        // seated view, O(C²)
for (const [pid] of statusOf)    … ids.add(pid);      // gossip strangers, O(N)
```

### V3 — the pc dial set is directory-scoped  ❌ follows from V2

The reconcile loop makes a peer record + RTCPeerConnection for every
directory member (id-order initiator; newcomer-dials exception). Track
*fan* is row-scoped, so heavy media stays O(C) — but pc/DC establishment
is O(directory) → with V1+V2, O(N) connection attempts per node.

This is also the precise mechanism of the plane incident's "video without
a seat": an unseated joiner's door announce lands a fresh status on a few
greeters (deliberate, see "kept" below), enters their directory, and gets
dialed. **In a 2-person room this is exactly right** — media before the
seating dance settles. The flaw is only that the same rule, unbounded,
meets an unbounded directory.

### V4 — mesh JOIN itself has a convergence ceiling ≥ N≈5000  ❌ found today

The C++ sim (`--det`, join only, no churn):

| N | result |
|---|---|
| 2000 | converges @ 5,504 ticks (76s) |
| 3000 | **INCOMPLETE** — 1915/3000 at the 150k-tick cap |
| 4000 | **INCOMPLETE** — 2010/4000 at the 180k-tick cap |
| 5000 | **INCOMPLETE** — 2113/5000 at the 210k-tick cap (48 min) |
| 10000 | **INCOMPLETE** — 2352/10000 at the 360k-tick cap |

**Diagnosis revised (same day, sim REPL forensics):** the earlier
"congestion collapse" framing was wrong — the root is a CORRECTNESS
failure under concurrent admission, in three stacked defects:

1. **Duplicate seats mint immediately, even shallow.** By tick 500 of an
   N=3000 join, 122 cells hold two occupants (consecutive arrivals 142,143
   both seated at depth-2 cell 20/1.0). Peaks at 597 dups by tick 1000.
   Eliminated as causes: compaction (OFF still mints 308) and arrival
   pacing (slow batches still mint 161).
2. **Contention converts into depth.** Dup locations over time: depth 2-5
   at t500, 6-10 at t1000, 12-13 by t2000 and stable there. When the
   frontier looks taken (sitting reservations + stale views + dup wars),
   the admission walk falls THROUGH to child sections instead of waiting —
   a room that fits in depth 3 seats people at depth 12.
3. **The depth-13 wall is a uint32 overflow.** The sim's section path is
   pc = pc*6+digit in a uint32; 6^12 fits, 6^13 does not. Distinct deep
   paths silently alias to the same cell, poisoning occupancy — and the JS
   twin (plain Numbers) has no such wall, so THE TWINS DIVERGE exactly
   where the storm goes.

**The mint — first hypothesis RETRACTED, race narrowed:** the deep path's
`firstFreeInRoster() -> admit()` is NOT a free-for-all — `rosterCells()`
shows each seat admits only into the ONE child row it owns
(`childPath(pc, i)`), so per-cell admission authority is structurally
unique. The surviving suspects for two PLACEs naming one cell, to be
pinned EMPIRICALLY with a temporary conflict printf in the sim (log when
a CLAIM or take lands on an occupied cell: both ids, placer, tick):
(a) sitting-expiry double-PLACE — the owner's soft reservation expires
    after SIT_TTL=90 without the seeker's CLAIM registering, and the cell
    is re-placed while the first seeker still holds it;
(b) law-T dual-hold — a mid-move owner briefly holds two cells and both
    old and new occupants of the parent cell serve the same child row;
(c) cascade — a duplicated PARENT cell gives two seats the same owned
    child row (this one amplifies but cannot be first).
The depth clamp for the uint32 wall stands regardless of which mints.

**Experiment log (2026-08-05, morning) — the call-site ledger lands:** every
admit() now records its call-site (ADMIT_SITE/ADMIT_LOG, printed by DUPMINT),
and the 03c knock-is-evidence clears log as KNOCKCLR/PHANTOMCLR. N=3000 det,
converge 600:

  DUPMINT 1791   KNOCKCLR 46   PHANTOMCLR 5
  site histogram: deep-firstFree 1772, s1-designated 17, s1-headless-soft 2

Two verdicts. (1) The knock-is-evidence suspect is REFUTED — 5 clear-then-
admits cannot drive 1791 mints. (2) The mint has the two-stage shape the
cascade hypothesis predicted: the FIRST mints are all s1-designated — e.g.
t=27 cell 0/1.4, incumbent seated@16 by placer 0, re-admitted@19 by placer 5:
TWO LIVE ADMITTERS for one cell, because the H-CHAIN DEVOLUTION arm fires on
a propagation-lagged read (the designated admitter's cell looks empty/phantom
to a peer for a few ticks) while the designated admitter also serves. The S1
seed pair then duplicates the PARENT cells, and deep-firstFree amplifies 100x
— each duplicated parent hands the same owned child row to two seats. The
next experiment: log WHICH guard let the devolution arm fire (the
cellReserved read on the admitter's cell at devolution time) and whether the
seed pair is always devolution-vs-designated or ever designated-vs-designated
across a healTry window.

**Experiment log (2026-08-04, evening):** MESH_DUPLOG take()-conflict
instrumentation landed (env-gated, kept). First mints are ORDINARY
admission with two different placers (t=27 cell 0/1.4 placers 5 vs 0;
t=40 0/2.1 placers 7 vs 5) — not resurrection, not packs. Three
S5-strict gates (resurrection requires a fully-lived row; never resurrect
into sitting/fresh; packs only into ever-seen holes) were tried and
REVERTED: early dups got WORSE (344 vs 155 at t600), equilibrium only
marginally better. Next suspect, untested: stale in-flight FINDs meeting
the 03c knock-is-evidence phantom clearing — a seeker's forwarded FIND
that arrives AFTER it seated makes a greeter clear the seeker's own
fresh occ entry as phantom and re-admit its cell. Next experiment: tag
each PLACE with its admit call-site, and log the phantom-clear events
alongside DUPMINT to correlate.

The steady state: dup races -> E2 eviction wars -> evicted seats rejoin
the storm -> frontiers look full -> deeper descent -> overflow aliasing ->
more dups. Seated flatlines (~1,900) while internal moves churn at ~2,600
per 1,000 ticks, forever. Progress-crawl and the N-independent plateau are
this equilibrium, not queueing.

The original (superseded) framing, kept for the record:
the signature LOOKED like a congestion collapse, not a capacity bound. The
seated plateau sits near ~2,000 regardless of N (1915, 2010, 2113, 2352
across a 3.3× range), progress never stops — it CRAWLS (~200 seats per
100k ticks) — and the sharpest fact is this pair:

- N=2000 entrants → **2000 seated**, converged in 5,504 ticks
- N=3000 entrants → **1915 seated** in 150,000 ticks

More seekers produce FEWER filled seats in 27× the time. The tree itself
holds 3,900 through depth 3 (25 + 125 + 625 + 3,125), and N=2000 happily
seats 1,225 of its members into depth 3 — so depth is not the wall.
Unadmitted-seeker CONTENTION is: every waiting entrant retries into the
same S1 funnel every ~20 ticks, and past some seeker-to-admitter ratio
the funnel spends its throughput on NOROOMs and re-walks instead of
admissions. Classic queueing collapse. (Suspects for the mechanism inside
the funnel: designation-chain re-walks from S1 per retry, frontier
serialization, retry pacing with no backoff under contention. FIND
ttl=200 is not binding at these depths.) **Pre-existing, not the
entry-resume change** — a paired A/B at N=5000 stalls both arms (baseline
2113 vs resume 1907; the ~10% single-seed gap is noted, unproven either
way). Invisible until now because the gates stop at N=800 (`sweep.sh`) /
N=1000 (JS harness), below the collapse threshold.

## Deliberate and KEPT — the relay bootstrap path

The relay carrying sealed first-contact signaling (offer/answer/ICE pre-DC,
the newcomer's announce to a FEW doors, the 'hi' history sync for
P2P-blocked guests) is **not** a violation: it is bootstrap-only, sealed
under the room key (R2 intact — the relay routes opaque ids it cannot
read), pushed off to DCs the moment a pair connects, and O(doors) per
newcomer. S1 absorbing join traffic is inherent to S1 being the admission
funnel. Keep it.

## Fix directions (design decisions, not yet scheduled)

V1–V3 collapse together if the pulse is fixed:

1. **Scope the status pulse**: unicast/DC to row + up/down + door-adjacent;
   remove the GSP ride. O(C) per period.
2. **Resurrect hierarchical aggregation** for what the flood was carrying —
   the ROLLUP design, sketched in full below.
3. **Gate the dial set**: seated → row ∪ mosaic up/down ∪ S1-duty;
   unseated or small-room → door-adjacency (preserves the 2-person and
   plane behaviors exactly). Cap `statusOf` with eviction.
4. **V4 first, though**: fix directions for the others are moot if the
   mesh cannot seat 5000. Diagnose the stall (state histogram of the
   unseated at the cap, admission-frontier occupancy over time), then gate
   the sim at N=5000+ so the ceiling can never re-creep. The gates-stop-at-
   N=800 lesson is the release-gate lesson again, at scale: an untested N
   is a dead suite wearing a green badge.

## The rollup design (sketch)

The deck machinery reborn on the mesh tree: every fact the room-wide flood
carries today becomes either **near-field first-hand** (row-scoped, already
O(C)) or a **per-section digest** aggregated along the up/down links that
already exist. Nothing new is routed; only new payloads ride old edges.

### The digest

Each seat that owns a down-link maintains, for its subtree:

```
digest = {
  n:        live participants in my subtree (me + my rows + children's n)
  consent:  count of n whose camera-consent is TRUE (the clear-video gate)
  epoch:    max lock-epoch seen (the §LOCK floor already gossiped today)
  at:       tick of computation
  sig:      S4 signature by the aggregating seat
}
```

Fixed size — a few dozen bytes — regardless of subtree population.

### The flow

- **Up**: every pulse period, a seat folds its own row's FIRST-HAND state
  (the E2 signals that already exist: PHONE/PONG/HELLO ages, DC liveness)
  with its children's latest digests and sends ONE digest up. Per node per
  period: C row observations + up to C child digests in, one digest out —
  **O(C)**, N never appears.
- **Down**: S1 folds the root digest and floods it DOWN the tree — one
  tiny frame per period per node. Every seat then knows the global count
  and the global consent verdict at staleness O(depth × period): at 1M
  (depth ≈ 8, period ≈ 5s) the global number is ≤ ~40s stale — fine for a
  count; the near field it gates hardest (your own row's tiles, your
  consent) stays first-hand and real-time.

### Who migrates where (every current consumer of the flood)

| today's consumer of room-wide status | after |
|---|---|
| participant count (`knownTotal`) | root digest `n`, flooded down |
| clear-video consent gate | `consent == n` at the root — same UX, tree-shaped truth; my own ROW's consent stays first-hand so local UI reacts instantly |
| roster liveness / 15s rule | near-field only: tiles are row ∪ mosaic partners ∪ composites, all first-hand or carried by the composite pipe |
| ghost / corpse suppression | local: E2 evicts the seat; the digest's `n` drops one level per period — no global gossip needed to un-count a corpse |
| mod table re-gossip | signature-authorized already (§9); distribute on CHANGE via tree flood, not per-heartbeat |
| chat | unchanged — irreducible per-message, already O(1)/node |

### Laws it must not bend

- **E2 untouched**: digests inform DISPLAY and COUNTS, never evict, never
  resurrect — the exact rule S1SYNC gossip already obeys ("informs
  routing, NEVER evicts"). A wrong digest can misreport a number; it can
  never take a seat.
- **R2 untouched**: digests ride mesh edges, sealed like everything else;
  the relay never sees one.
- **Small rooms degrade to today**: below C² participants everyone is in
  Section 1, the tree has one level, near field = the whole room — rollup
  and flood coincide, UX byte-identical. The 2-person room and the plane
  guest behave exactly as they do now.

### The honest open problem: a lying aggregator

A section head signs its digest, so a forge is attributable — but a head
can still MISREPORT its subtree (inflate n, fake consent). Mitigations in
the same spirit as existing laws, none yet argued to the healing-laws bar:
row-mates of the aggregating seat see the same children and can cross-
check (C3-style fixed designation of ONE checker avoids vote chaos);
consent inflation is the dangerous direction (it can unblur cameras) so
the consent bit specifically may need to stay unanimous-by-construction —
e.g. carry a count of REFUSALS instead, where lying can only keep the room
MORE blurred, making the failure mode safe. This needs its own law in
`healing-laws.md` before implementation.

**RESOLVED 2026-08-05 — see `healing-laws.md` § G (G0-G8), and note the
refutation.** The refusal-count argument as written above is WRONG: a plain
integer sum is symmetric, so an aggregator can drive a refusal count DOWN as
easily as up, and renaming consent to refusal creates no asymmetry. The
asymmetry is elsewhere, in three parts that are only sufficient together —
(G3) fail-closed defaults, so loss/silence/staleness read as refusal;
(G4) every author of a digest input is directly LINKED to the aggregator that
folds it and receives the published fold back on a frame that already exists,
so the only dangerous direction (suppression) is refutable by its own victim
at a fixed, unique, structural checker — the down-child, which is already the
C3-designated healer — never by a vote; and (G1) actuation is always local and
first-hand, so the worst a fully-complicit path achieves is a wrong BADGE, not
a released camera. `epoch` is REMOVED from the digest (an inflated max is a
lockout, not a fail-safe direction). Built in the sim (`repro-digest.sh`);
browser port deliberately deferred.

### Sequencing

1. V4 diagnosed and the sim gated at N≥5000 (nothing above matters if
   seating stalls at 5k).
2. Sim grows the digest machinery + gauges (per-node frames/tick asserted
   O(C) at N≥5000 under churn) — the design proves itself where failure is
   cheap and deterministic.
3. `healing-laws.md` gets the digest law (including the lying-aggregator
   argument) — the same path every structural mechanism has taken.
4. Browser lands it behind a flag; the flood is removed only when the
   digest's gates are green at scale AND small-room e2e is byte-identical.

## Guardrails to add with any fix

- Sim gauges: per-node frames/tick and peak per-node state, asserted O(C)
  under the churn sweep at N≥5000.
- A browser-side unit pin: dial-set size with a synthetic 10k-entry
  `statusOf` stays ≤ the row+duty bound.
- This doc's law line belongs in `healing-laws.md` once the rollup design
  is argued there.
