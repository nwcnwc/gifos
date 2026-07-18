# Split-brain in the sim — what prevents it, and the one case that is real

This note documents the mechanics the C++ reference sim (`mesh.cpp` +
`mesh_seat.inc` + `topo.h`) uses to keep a meeting to ONE home under node loss,
and the single case (a genuine transport partition) where two homes is the
correct, expected outcome. It names the healing laws each mechanic implements;
the laws themselves live in `docs/healing-laws.md` (the human owns that file).

A "split-brain" here means a **divergent home**: two Section-1 rings, under the
same genesis key, each healing itself whole — two rooms where there should be
one. Because everything *below* the home re-seats into the one home (E1 + W5),
divergence can only arise from the HOME (Section 1) itself splitting. So all the
work is at Section 1.

## W7 — Section 1 is the 5×5 ROOK'S GRAPH (the load-bearing change)

`topo.h ownedLinks(pc==0)` = every seat's whole ROW (C-1) + whole COLUMN (C-1) +
its down-link = **uniform degree 9**. Heads are not special (they get
column-mates too — the old dynamic head cross-link F1 is retired). This is the
5×5 rook's graph: **8-edge-connected**, every pair of rows shares **C
independent links**. Deep sections (`pc!=0`) are unchanged — sparse transpose
cross-link, `C+1` bound. `MAXLINKS = 2C-1`.

Everything that assumed the single sparse cross-link was rebuilt on the rook for
`pc==0`: `nextHopCoord` (row/column hop), `nextHopToward` fallback (any live
row/column mate), `s1Sync` (sync the whole row+column), cousins-in-PONG (teach
the column heirs so a promote-up lands pre-wired), and the cross-link heal
(re-ping every vacant column-mate). `topo_test.cpp` asserts degree 9 + the exact
rook structure + symmetry for `pc==0`.

Consequence, verified in the sweep below: **no pattern of node loss splits the
home.** A split would show up as a Section-1 duplicate (two seats at one home
coord); the sweep shows 0 across every seed and kill fraction.

## E2 — first-hand liveness only (echo-immune)

`live[]` is set ONLY by direct contact — a PHONE I answered (`onPhone`), a PONG
from a seat I phoned, a HELLO/CLAIM its occupant sent me. GOSSIP (`S1SYNC`)
never sets it. `firstHandLive()` is the ONLY signal that may evict or tie-break.

Why this matters: a **phantom** — a stale gossip echo of a seat that has moved
or died — is not first-hand live, so it can never yield a live healer out of a
hole, and gossip can never *resurrect* it over a first-hand truth. Concretely:
- `HELLO` yields only between first-hand-live claimants (lower id wins). A
  phantom prev is silently replaced, so a promoted healer survives.
- `S1SYNC` updates the roster HINT (occ/s1seen) only — it never requeues a seat
  and never overwrites a first-hand-live cell. (The old gossip-requeue and
  gossip-YIELD were phantom weapons: an echo could evict a live seat.)

Before this, the rook's richer gossip paths kept phantoms alive indefinitely and
they evicted every healer out of a hole — the JOIN itself couldn't fill 25/25.

## C3 / S5 + H1-S1 — ring-heal conservatism (probe-gated)

A home cell is refilled only after its occupant is unreachable via **ALL** rook
paths for a settled window (`RING_HOLD`, much longer than the deep-tree 60).
`ringConfirmDead(h)` implements this: if not first-hand live, actively **PROBE**
the cell (`routeTo` walks every redundant path); a live-and-reachable occupant
answers with a HELLO and becomes first-hand next round (so it is NOT healed); a
true hole / phantom / genuinely-partitioned occupant stays silent, and only after
the full window is it declared dead. Holding a coord as a temporary hole is a
recoverable dip; duplicating it is an unrecoverable divergence — so the ring
always chooses the hole. This is exactly what makes a plain kill converge to one
home while a true partition (below) correctly yields two.

The Section-1 refill machinery, all probe-gated:
- **Rook D1 heartbeat** (`s1Heartbeat`): a home seat phones every live row+column
  neighbour each beat, so first-hand liveness spans all redundant paths and
  phantoms decay (no heartbeat ⇒ not first-hand ⇒ probed and cleared).
- **Head backstop** (`s1Fill`): the head refills each of its row cells.
- **Left-pack** (probe-gated): when a row has NO first-hand-live head, it rebuilds
  leftward, cell by cell, toward the head — this is what recovers an
  all-heads-dead column-0.
- **Vertical** heal into a Section-1 owner waits the full `RING_HOLD`.
- `heal()` diversifies leaf-sources (own subtree + kidful row-mates + other
  Section-1 subtrees), so a broken/stale deep chain no longer silently swallows
  every FINDLEAF and strands a home hole.

The relay-greeter ring bridge / max-id cross-partition reconciliation (old E5,
commit f29e2ef) is deliberately NOT present. A torn home is two rooms; there is
no P2P reunion and no relay tie-break.

## The one real case — a TOTAL network partition

`split [fracB]` (service command) cuts EVERY P2P link between two live
seat-groups while keeping every seat ALIVE (distinct from `kill`, which removes
seats). The relay registry stays shared. This is the only thing that can produce
two homes, and doing so is CORRECT (two real rooms — E3 detects, but with no
shared link there is no safe P2P reunion). Each side independently rebuilds a
complete Section-1 ring; measured with `splitstate` (per-side seated / distinct
s1 cells / dups / stranded).

R6 stranding is recoverable: a stranded seat retries after a backoff (the
client's manual retry), so once its side's greeter pool stabilises it re-seats.

## Success criteria — the sim asserts them (`check [strict]`)

`check` fails LOUDLY on any stranded seat, surviving duplicate, teleport>0, or
non-convergence (Section 1 ≠ 25, seated ≠ N). A teleport is independently fatal
(`teleportExplode` aborts). Sweep harness: `sim/sweep.sh` (quick, or `full`).
NOTE: service-mode `init` does NOT revive killed seats or reset `TICK`, so each
(seed, kill) must run in its OWN process — the sweep does exactly this. Reusing
one `--service` session across seed+kill cycles leaks state and reports bogus
failures. The port's test harness must respect the same reset boundary.

### Verified (this sim, C=5, N=400 unless noted)
- **Node loss, seeds 1..50 × kill {0.1,0.2,0.3,0.4,0.5,0.6} = 300/300 PASS**:
  every run converges to ONE home — full seating, Section 1 = 25/25, 0
  duplicates, 0 stranded, teleport 0. Extreme kills 0.7/0.8 (seeds 1..15) and
  N=1500 (kill 0.4/0.5) also pass. The sparse graph left dups=64 / s1=23 here.
- **Total partition (`split 0.5`, seeds 1,3,7,11,13,21,29,37,45)**: exactly TWO
  internally-consistent homes — each side seated=all, Section 1 = 25/25, dups=0,
  stranded=0 — neither reconciling across the cut.
