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

Scenario suites: test/sim/sweep.sh (churn + partition verdict),
test/sim/repro-headless-row.sh (the headless-row admission gap, roadmap §3),
test/sim/repro-atomic-move.sh (the mover's lease, law T: mover death mid-transit,
lease-window death, cascade scooches, churn during transit).

Files: topo.h (topology arithmetic), mesh.cpp (fabric + run/service),
mesh_seat.inc (the seat protocol).
