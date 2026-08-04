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
| 5000 | **INCOMPLETE** — 2113/5000 seated at the 210k-tick cap (48 min) |
| 10000 | **INCOMPLETE** — 2352/10000 seated at the 360k-tick cap |

S1 fills (25/25), roughly the first ~2k seat, then admission grinds while
thousands of entrants burn tens of millions of bootstrap frames at the
door. **Pre-existing, not the entry-resume change** — a paired A/B at
N=5000 stalls both arms (baseline 2113 vs resume 1907; the ~10% single-
seed gap is noted, unproven either way). Invisible until now because the
gates stop at N=800 (`sweep.sh`) / N=1000 (JS harness). Cliff bisection
(N=3000/4000) in progress. Suspects, unverified: admission funnel
serialization at the frontier, FIND ttl vs tree depth under contention,
retry-storm congestion at the door.

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
2. **Resurrect hierarchical aggregation** for what the flood was carrying:
   per-section rollups (count, consent bitmap, liveness digest) flowing up
   the tree, signed at each level, O(C) per node per level, O(log N) depth.
   The unanimous-consent gate becomes "my section's AND, AND'd upward" —
   same UX, tree-shaped truth. This is the deck machinery reborn on the
   mesh tree.
3. **Gate the dial set**: seated → row ∪ mosaic up/down ∪ S1-duty;
   unseated or small-room → door-adjacency (preserves the 2-person and
   plane behaviors exactly). Cap `statusOf` with eviction.
4. **V4 first, though**: fix directions for the others are moot if the
   mesh cannot seat 5000. Diagnose the stall (state histogram of the
   unseated at the cap, admission-frontier occupancy over time), then gate
   the sim at N=5000+ so the ceiling can never re-creep. The gates-stop-at-
   N=800 lesson is the release-gate lesson again, at scale: an untested N
   is a dead suite wearing a green badge.

## Guardrails to add with any fix

- Sim gauges: per-node frames/tick and peak per-node state, asserted O(C)
  under the churn sweep at N≥5000.
- A browser-side unit pin: dial-set size with a synthetic 10k-entry
  `statusOf` stays ≤ the row+duty bound.
- This doc's law line belongs in `healing-laws.md` once the rollup design
  is argued there.
