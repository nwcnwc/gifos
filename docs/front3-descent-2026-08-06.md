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

## The fix this points to — NOT BUILT, and it is a design decision

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
