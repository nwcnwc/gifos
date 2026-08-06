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
time — because a parent owns a link to its row head and to no other child.
The seeker walks the column-0 spine because that is the only edge it can
traverse first-hand. Every fix so far has been a better *policy* for choosing
among candidates, and there is nothing to choose.

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

So: a parent can FILL any cell of its child row (`firstFreeInRoster` scans all
C), but it can only DESCEND into column 0. The subtrees hanging under columns
1..C-1 are effectively undescendable — capacity that exists and cannot be
reached by a seeker. That is the plateau: the spine runs out of room while the
room's free space sits in sibling subtrees no FIND can be delivered into.

This is also why all four fixes failed identically. Each was a better rule for
choosing among candidates; 88.8% of the time there is one candidate.

## The fix this points to — NOT BUILT, and it is a design decision

A row HEAD owns row-links to all its mates. It is therefore the one seat that
can legally hand a FIND sideways into a sibling subtree WITHOUT teleporting
(the sim halts on a teleport, deliberately). Today `serveFind` at a head only
ever considers its own child row. A head that cannot satisfy a FIND could
offer it along its row, opening the other C-1 subtrees to descent.

Reasons this is not a heuristic tweak to land quietly:

- it is a protocol change on the seating path, so BOTH twins move together;
- it needs loop discipline — a FIND could ping-pong along a row (TTL alone is
  not obviously enough; a visited-set or a strict left-to-right rule may be);
- it interacts with the healing layer's admission story and with Q2
  compaction, which already walks rows for a different reason;
- the two-pass liveness guarantee must survive intact.

Measure it before building it. The instrument already reports what a fix has
to move: `DESCSPINE`, `DESCEND` (how FINDs terminate), and the hop histogram.

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
