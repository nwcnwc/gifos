# gifos mesh simulator — C++ engine

The mesh-scale simulator, ported to C++ for compiled speed + shared-memory
threading (Node tops out ~thousands of seats/sec; goal is billions — everyone
on Earth). Faithful port of the NO-ROOT topology + all healing laws
(P, D1-D4, H1-H7, C1-C3, W1-W5, E1-E3, R1-R4) from test/mesh-scale.js.

    g++ -O2 -std=c++17 -o mesh test/sim/mesh.cpp
    ./mesh 100000 0            # batch: JOIN 100k, report convergence + ticks/s
    ./mesh 5000 0.5           # JOIN then 50% departure heal

## service mode (queryable daemon)
    ./mesh --service          # reads commands on stdin, answers on stdout
      init N [leaveFrac]      # set up a room
      converge [maxticks]     # run to full convergence, report
      tick [n]                # advance n ticks
      state                   # tick, seated, s1-full, moves, evictions, inflight
      seat <id>               # a participant's coord/state/occ/neighbours
      find <path>/<r>.<i>     # which seat holds a coord (e.g. find /0.0)
      bad                     # live non-seated seats
      dups                    # coords held by >1 seat (dedup health)
      kill <frac> [s1row|s1all]  # a departure / catastrophe
      killat <path>/<r>.<i> [silent]  # kill the occupant of ONE coord (deterministic scenarios)
      compact                 # Q2: tree depth, lone-row sections, frontier
      holes                   # heal-owed mid-tree holes
      quit

## the V1 rollup digest (healing-laws § G) — SIM ONLY

The room folded along the tree instead of flooded: <= C reports in and ONE out
per node per pulse period, riding PHONE / PONG / S1SYNC as payload (no new
frame). `site/js/mesh.js` does NOT have this — the twins diverge here on
purpose until the sim gates are green at scale and small-room e2e is
byte-identical (scale-audit sequencing step 4).

      digeston 0|1            # the A/B. ON must be TRAJECTORY-IDENTICAL to OFF.
      refuse <id|all|frac F> [0|1]   # a participant's own first-hand consent
      lie <id|path/r.i> <mode>       # 1 = SUPPRESS refusals (the dangerous
                                     #     direction), 2 = inflate n
      digest [reset]          # three gauge lines:
                              #   DIGEST   does the fold tell the truth
                              #   DIGGAP   who fail-closed, on which member
                              #   DIGGAUGE frames/node/tick + peak digest state
      MESH_DIGLOG=1           # name every G4 refutation, both sides

Gate: `test/sim/repro-digest.sh` (47 assertions).

## the descent instrument (FRONT 3) — MEASUREMENT ONLY

Off unless `MESH_DESC=1` is in the environment, and inert when off (verified:
the instrumented binary is byte-identical to the baseline on N=3000 det).
It answers whether `serveFind`'s two-pass descent steers seekers into branches
that are FULLER than the ones it passed over.

      MESH_DESC=1 ./mesh --service
      descstat [reset]

Five lines, and they are meant to be read in this order:

      DESCSTAT     descents, dead ends, pass-0 vs pass-1, candidate classes
      DESCFILTER   does the pass-0 firstHandLive filter DISCRIMINATE at all?
                   if ~0% of descents have a reach-only candidate, the filter
                   excludes nobody and the bias cannot live there
      DESCHH       the hypothesis head to head, on discriminating descents
                   only: chosen branch's free space vs the mean of the ones
                   pass 0 filtered out
      DESCREGRET   the capacity-blind measure: how often the descent picks the
                   ROOMIEST candidate on offer, and how much free space it
                   gives up when it does not
      DESCEND      how FINDs end (deep admit / S1 admit / NOROOM wall / dead
                   end / ttl) and the hop histogram

Ground truth is a global-observer snapshot (rebuilt every 25 ticks) using
`freemap`'s notion of free: a free cell whose down-child is also free is one
admissible frontier cell, folded up the ownership chain. No seat could compute
it — that is the point.

Scenario suites: test/sim/sweep.sh (churn + partition verdict),
test/sim/repro-headless-row.sh (the headless-row admission gap, roadmap §3),
test/sim/repro-atomic-move.sh (the mover's lease, law T: mover death mid-transit,
lease-window death, cascade scooches, churn during transit).

Files: topo.h (topology arithmetic), mesh.cpp (fabric + run/service),
mesh_seat.inc (the seat protocol).
