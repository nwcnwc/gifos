# gifos mesh simulator — C++ engine

The mesh-scale simulator, ported to C++ for compiled speed + shared-memory
threading (Node tops out ~thousands of seats/sec; goal is billions — everyone
on Earth). Faithful port of the NO-ROOT topology + all healing laws
(P, D1-D4, H1-H7, C1-C3, W1-W5, E1-E3, R1-R4) from test/mesh-scale.js.

    g++ -O2 -std=c++17 -o mesh sim/mesh.cpp
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
      quit

Scenario suites: sim/sweep.sh (churn + partition verdict),
sim/repro-headless-row.sh (the headless-row admission gap, roadmap §3).

Files: topo.h (topology arithmetic), mesh.cpp (fabric + run/service),
mesh_seat.inc (the seat protocol).
