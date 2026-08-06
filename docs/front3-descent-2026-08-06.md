# FRONT 3 — the descent, measured (2026-08-06)

> **LIVE as of 2026-08-06.** The mechanism below is CONFIRMED and the four
> candidate fixes are REFUTED; nothing here is fixed or guarded yet, so this
> doc stays alive under the standing rule. The instrument is on `main`
> (`test/sim/mesh.cpp`, `MESH_DESC=1` + the `descstat` verb) and is inert when
> off — the instrumented binary reproduces the N=3000 det baseline exactly
> (`converged@6976 moves=29387 evict=4569 dups=0`), with MESH_DESC both unset
> AND set.

## The one-line answer

**The descent has no choice to make.** At 88.8% of pass-0 descents there is
exactly ONE eligible candidate, and it is the child-row HEAD 92.4% of the
time — because the head is the parent's owned `down` link and therefore the
only child it hears first-hand, and because pass 0 is swept in full before
pass 1 is tried at all. The seeker walks the column-0 spine because the pass
ORDERING hands it that hop every time. Every fix attempted so far has been a
better *policy* for choosing among candidates, and there is nothing to choose.

(The siblings are reachable — `emit` routes to a non-linked seat rather than
teleporting. The barrier is the ordering, not the topology. See the correction
below; I got this wrong on the first pass and it changes the fix.)

## AT THE PLATEAU (N=5000 det, 60k cap) — this IS the plateau

Everything below was measured at N=3000, which CONVERGES. The stalled regime
says the same thing far more starkly. Seated 3076/5000 — the known plateau,
reproduced exactly.

| | N=3000 (converges) | N=5000 (plateaus) |
|---|---|---|
| descents | 150,118 | **31,012,955** |
| FINDs ending at the DEPTH WALL | 1,612 | **2,439,260** (96% of terminations) |
| deep admits | 18,485 | 55,849 |
| hop histogram | spread over 0-12 | flat ~15k at 0-11, then **2,441,209 at exactly 12** |
| descents by depth | decays 27.7k -> 1.7k | **flat: 2.69M at d0 … 2.45M at d11** |
| chose shallowest branch | 6.3% | **0.2%** |
| dmin chosen / best | 5.88 / 4.86 | 8.49 / **6.89** |

Read the hop and depth histograms together: **essentially every seeker walks
all twelve levels down and NOROOMs at the wall**, and the per-depth counts
barely decay, so a FIND that starts descending almost never finds a home on
the way. 31 million descents for 1,924 unseated seekers.

**And the room is not full.** `FREEDEPTH` at the plateau: **11,259 admissible
frontier cells** — 327 at depth 2, ~1,000 at every depth from 3 to 12 — unused
while seekers grind the wall 2.4 million times. Those cells are in rows under
columns 1-4. The seekers are pinned to column 0 and never see them.

So the plateau is not a contest-cost problem (front 1, correctly retired), not
a digest-routing problem, and not capacity-blindness. **The seeker is handed
the same single edge at every hop, walks it to the depth wall, and retries
forever, while the room's free space sits one column over.**

### The plateau STEADY STATE — zero choices, exactly twelve hops

Measured separately: `converge 20000`, then `descstat reset` and `tick 3000`,
so the join-storm transient is excluded and only the stalled steady state is
counted (seated 3023, unchanged over those 3000 ticks).

    DESCSPINE chosenColumn=0:1632036,1:1162,2:1150,3:1206,4:1172  (col0=99.7%)
      pass0CandidatesByColumn = 0:1632036, 1:0, 2:0, 3:0, 4:0
      reachOnlyByColumn       = 0:0, 1:1636726, 2:1636726, 3:1636726, 4:1636726
      pass0DescentsWithExactlyOneCandidate = 1632036/1632036 (100.0%)
    DESCEND admitDeep=35 noroomWall=134392 meanHops=12.00

- columns 1-4 are pass-0 eligible **exactly ZERO times**;
- column 0 is reachable-only **exactly ZERO times**;
- columns 1-4 are reachable-only at **EVERY** descent (1,636,726 = all of them);
- **100.0%** of pass-0 descents offer exactly one candidate;
- `meanHops` is **exactly 12.00** — every FIND walks the full spine to the wall;
- 1.6 million descents produced **35** deep admissions.

The 4,690 hops that did reach columns 1-4 are precisely the pass-1 descents
(1162+1150+1206+1172 = 4690), which fire only when pass 0 has NO candidate.

At N=3000 the picture was statistical (col0 92.4%, single-candidate 88.8%)
because the room is still churning and the `live[]` window keeps re-opening.
At the plateau the room is quiescent, nothing re-opens, and the descent
degenerates into a deterministic walk down column 0. That is the plateau.

(Note: this run reports dups=3 at tick 20000/23000. That is a mid-flight
transient with 33-35 leases outstanding, not a settled duplicate — the 60k-cap
run above settles to dups=0. It does not bear on the descent numbers.)

## Why the seed's hypothesis was wrong

The standing hypothesis (docs/handoff-2026-08-06-fallback.md, front 3) was
that `firstHandLive` is a chatter proxy: a BUSY subtree chatters more, so
pass 0 returns on a full branch and the seeker walks the fullest spine. It is
code-grounded and it is wrong — in sign, twice over.

Split into the two claims that have to BOTH hold, N=3000 det, seed 20260714:

**(a) does the filter discriminate at all?** Yes — on 85.1% of descents at
least one candidate is reachable-only. So the filter is live, not a no-op.

**(b) is the excluded set roomier than the chosen one?** No, the reverse:

| on the 126,890 descents where pass 0 excluded someone | |
|---|---|
| mean free space of the branch CHOSEN | **182.1** cells |
| mean free space of the branches FILTERED OUT | **13.3** cells |
| chosen roomier / fuller / tied | 118,617 / 5,917 / 2,356 |

`firstHandLive` is a LIVENESS filter and it works. The branches it drops are
mostly stale occ entries for cells with no live subtree — descending there
finds nothing. Confirmed not to be that artifact either: only **1.6%** of
candidates have an empty subtree, and removing them moves the numbers not at
all (182.1 -> 184.1 chosen, 13.3 -> 13.5 filtered).

## The four refutations, in order

1. **"pass 0 favours busy-and-full branches"** — REFUTED, sign inverted
   (above). Stable across seeds 20260714 / 7 / 101 / 2029.
2. **"the descent is capacity-blind"** — REFUTED. With 2+ candidates it takes
   the roomiest **89.6%** of the time, mean regret 3.3 free cells out of 176.
3. **"prefer childless children (`kidful`)"** — REFUTED BEFORE BUILDING. It
   looked free: `m.kids=hasChildren()` is already on every PHONE, so a parent
   knows first-hand which children are childless, and a childless child's own
   row is entirely free. All three legs fail — `kidful` is UNKNOWN for 78% of
   candidates; the descent already takes the childless one 71.5% of the time
   it is offered; and the premise is false: childless nodes are shallow
   relative to THEMSELVES but sit deep in ABSOLUTE tree depth (that is why
   they have no children yet), so meanDmin childless=5.60 vs hasKids=5.67.
4. **"prefer shallowest room via the digest's `dmin`"** — REFUTED ON THE
   HONEST CEILING. Raw dmin discriminates at ~91% of hops and the descent
   picks the shallowest only 6.3% of the time, which looks damning — but that
   counts candidates only pass 1 could reach, and pass 0's liveness guarantee
   is NOT tradeable (surrendering it re-opens the split-room starvation it was
   built to stop: healing-laws, the two-pass note in `serveFind`). Restricted
   to what a fix may actually reorder — the pass-0 eligible set:

   | seed | reorderable hops | of all 2+-candidate hops | already shallowest |
   |---|---|---|---|
   | 20260714 | 10,279 | 7.6% | 57.8% |
   | 7 | 9,237 | 8.6% | 57.3% |
   | 101 | 10,188 | 9.7% | 57.6% |

   Ceiling: ~4,300 hops of 150,118 improved by one level. Under 3% of
   descents. A rounding error.

## The mechanism, CONFIRMED

Read off `topo.h`: a parent's owned links are `rowMates + cross? + up? + down`,
and `down(s) = {childPath(pc,i), r, 0}` — the HEAD of its child row and
**nothing else**. The other C-1 children of that row link to the head, not to
the parent. The measurement says exactly that:

    DESCSPINE chosenColumn=0:135916,1:3364,2:2585,3:2578,4:2693  (col0=92.4%)
      pass0CandidatesByColumn = 0:145947, 1:8404, 2:7737, 3:7877, 4:7583
      reachOnlyByColumn       = 0:0,      1:117848, 2:120758, 3:122096, 4:124348
      pass0DescentsWithExactlyOneCandidate = 129841/146273 (88.8%)

**`reachOnlyByColumn` for column 0 is ZERO.** Not rare — never. Column 0 is
the owned `down` link, so it is heard first-hand every time it is a candidate.
Columns 1-4 are reachable-but-unheard 118k-124k times each and pass-0 eligible
only ~8k times; that residual is the 60-tick `live[]` window right after the
parent ADMITTED them, before it decays.

**What this does NOT mean — a wrong reading I published first and am
correcting here.** It is tempting to conclude the sibling subtrees are
UNREACHABLE. They are not. `Seat::emit` does not teleport to a non-linked
seat: when the target is not on an owned link it ROUTES the frame over the
mesh (`route(st->coord,-1,m)`), and the sim's teleport guard never fires. The
measurement shows the deliveries happening — pass 1 reaches columns 1-4 863
times, and pass 0 reaches them ~10,357 times during the `live[]` window. A
parent can descend into ANY column; it costs extra hops, not a new link.

So the barrier is not the link topology — it is the PASS ORDERING. Pass 0 is
tried exhaustively across all C cells before pass 1 is tried at all, and
column 0 is the only child that is reliably `firstHandLive`. Pass 0 therefore
almost always succeeds, at column 0, and returns before pass 1 is ever
consulted: pass0=146,273 vs pass1=863. The seeker walks the column-0 spine
because the ordering hands it that hop every time, while the room's free space
sits in sibling subtrees a FIND could perfectly well have been routed into.

This is also why all four fixes failed identically. Each was a better rule for
choosing among candidates; 88.8% of the time there is one candidate.

## T7 SPREAD-AFTER-NOROOM — BUILT, IT WORKS, AND IT IS OFF BY DEFAULT

Built 2026-08-06 (sim verb `spreadon 0|1`, **default OFF**). It solves the
plateau outright and it is not shippable as it stands. Both halves are real.

**The change.** On a FIND whose seeker has already been told NOROOM *to its
face*, a reachable-but-unheard sibling may compete in pass 0:

    pass==0 ? (firstHandLive(rk) || (mm.spread && admitterReachable(rk)))
            : admitterReachable(rk)

`spread` is set only by an EXPLICIT NOROOM (`case NOROOM`), never by a
timeout. That distinction is the whole safety argument: **the plateau fails
LOUD** (2.44M delivered NOROOMs) while **a split fails SILENT** (the FIND is
swallowed, the seeker times out on a different code path). So a partitioned
seeker can never set the flag, and pass 0's deliverability preference is
untouched exactly where it is load-bearing. The hop also stays strictly
DOWNWARD into the child row, so depth increases monotonically and no cycle is
possible — this needs no loop discipline, unlike shape 3.

**What it buys** (det, `converge` under cap, dups=0 and CHECK PASS throughout):

| | baseline | T7 |
|---|---|---|
| N=5000 seed 20260714 | TIMEOUT 3076/5000 | **converged@3200, 5000/5000** |
| N=5000 seed 7 / 101 / 2029 | TIMEOUT 3076/5000 | **3264 / 3392 / 3392, all 5000/5000** |
| N=10000 | (never attempted — 5000 stalled) | **converged@3776, 10000/10000** |
| N=20000 | " | **converged@4480, 20000/20000** |
| N=3000, four seeds | 6976 / 4096 / 4160 / 4480 | **2624 / 2752 / 2560 / 2816** |
| N=5000 moves / evictions | 113,061 / 11,022 | **20,687 / 3,739** |

Every seed improves — no sign flip, which is precisely what killed T6b. The
scaling is sub-linear: 6.7x the seats for 1.7x the ticks.
`test/sim/scale-frontier.sh` reports **SCALE GREEN** with the flag on.
Split-room legs stay green: repro-headless-row A/B/**C**, repro-hchain E/F.

**Why it is OFF.** It costs TREE COMPACTNESS. Spreading seekers across the
child row opens more sections and lone rows than compaction can collapse, and
`repro-compaction` leg 1 reds. Clean A/B on the same tree:

| | leg 1 (gradual shrink) |
|---|---|
| baseline | **COMPACTION GREEN** |
| T7 | **RED** — `sections grew past the floor allowance (seed 2: 23 > 16+1)`, `aggregate lone-rows not reduced (35 !< 32)` |

Legs 2 (oscillation) and 3 (adversarial mass-kill) stay green, and correctness
is never in question — CHECK PASS, dups=0, no teleport. What regresses is the
shape of the tree, and **the fix and that assertion are in direct tension by
construction**: T7 exists to spread breadth-wise, leg 1 asserts the tree
collapses toward a minimal section count.

Raising the evidence bar does NOT separate them (measured, not assumed):

| threshold | N=5000 | compaction leg 1 |
|---|---|---|
| 1 NOROOM | converged@3200 | RED, 5 failures |
| 2 NOROOMs | converged@3904 | RED, 8 failures |

So the trade is inherent to spreading, not an artifact of an over-eager
trigger. **ON is not a superset of OFF**, which is exactly why the default
must stay OFF and why this is not a shim: `spreadon` is an A/B toggle in the
same idiom as `compacton` and `digeston`, and default-off is byte-identical to
baseline (N=3000 det: converged@6976, moves=29387, evict=4569).

**The remaining work is the trade, not the mechanism.** Open questions, in the
order I would take them: does compaction simply need longer / a higher rate
limit to collapse a wider tree (leg 1's allowance is a floor+1, and a spread
tree may legitimately need more passes)? Should the spread be depth-gated, so
it only fires below the depth where fragmentation stops mattering? Or is a
wider, shallower tree actually the BETTER shape — in which case leg 1's floor
is the thing that is wrong, and that is an argued change to the compaction
law, not a test tweak. NOTE the JS twin does NOT have T7: the twins diverge
here deliberately, exactly as they already do for the digest, until this is
resolved.

## The three shapes this pointed to — for the record

The lever is the PASS ORDERING in `serveFind`, not the link structure and not
the choice rule. Today:

    for(pass=0;pass<2;pass++)
      for(q:shufCols())
        if(pass==0 ? firstHandLive(rk) : admitterReachable(rk)) -> descend

Pass 0 sweeps all C cells before pass 1 is considered, and column 0 is the
only reliably-live child, so the spine wins ~92% of hops.

**Why the ordering cannot simply be deleted.** It is load-bearing, and the
reason is in the comment above it: to my own evidence, a peer across a
partition and a SILENT-BUT-REAL head are indistinguishable — `split` cuts
delivery with no transport event, so no TRANSLOST ever arrives. Pass 0 exists
so the starved half of a split room descends only into demonstrably
deliverable hops (seed 8: side A seated 16/200 and NOTHING deeper when the
forward used raw occ). Pass 1 exists because a silent-but-real head must still
be usable (headless-row leg C, hchain D). Both legs are guarded. Any change
here has to keep both.

Candidate shapes, cheapest first — all measurable with the existing instrument
before a line is written:

1. **Break the tie only when pass 0 is a singleton.** At the 88.8% of hops
   where pass 0 offers exactly ONE candidate, that is not a liveness CHOICE,
   it is a default. Allowing a reachable sibling to be considered alongside it
   in that specific case costs nothing on the split-room legs, because on
   those legs the reachable siblings are the unreachable ones and lose anyway.
2. **Spread on repeat, not on first contact.** A seeker that has already
   NOROOM'd once has evidence the spine is full; let its RETRY prefer a
   sibling. This keeps first-contact behaviour byte-identical, which is the
   property the split-room drills actually assert.
3. **Let the head spread.** A row head owns row-links to all its mates and can
   hand a FIND sideways with a real link rather than a route. More invasive:
   needs loop discipline (TTL alone is likely not enough — a visited set or a
   strict left-to-right rule), and it interacts with Q2 compaction, which
   already walks rows for a different reason.

Whichever shape: BOTH twins move together, and the numbers a fix has to move
are `DESCSPINE`, `DESCEND` (how FINDs terminate) and the hop histogram — not
convergence time on the default seed alone.

## Reproducing

    g++ -O2 -std=c++17 -o /tmp/mesh test/sim/mesh.cpp
    printf 'det on\ninit 3000\nconverge 30000\ndescstat\nquit\n' \
      | MESH_DESC=1 /tmp/mesh --service

`descstat` prints DESCSTAT / DESCFILTER / DESCHH / DESCREGRET / DESCHHLIVE /
DESCDMIN / DESCDMINFHL / DESCKID / DESCSPINE / DESCEND / DESCDEPTH / DESCHOPS.
Ground truth is a global-observer snapshot rebuilt every 25 ticks using
`freemap`'s notion of free (a free cell whose down-child is also free), folded
up the ownership chain — no seat could compute it, which is the point.

**Sweep seeds.** 20260714 is the sim's DEFAULT and an OUTLIER on convergence
time (6976 ticks where 7/101/2029 land 4096-4480). The ratios above are stable
across all four; convergence-time deltas measured on the default seed alone
are not.
