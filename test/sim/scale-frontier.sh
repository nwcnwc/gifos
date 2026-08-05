#!/usr/bin/env bash
# scale-frontier.sh — the N>=5000 convergence target (scale-audit 2026-08-04, V4).
#
# *** NOT YET A GATE — deliberately named OUTSIDE the release battery's
# *** test/sim/repro-*.sh glob. THE COVENANT: the day this script goes green,
# *** rename it repro-scale.sh in the same commit as the fix, and the battery
# *** gates it forever. Until then it is tracked expected-RED in
# *** test/batteries/known-unfixed.sh ("N=5000 MASS-JOIN STALLS").
#
# The V4 admission-evidence waves (2026-08-05) took N=2000 det from 5504-tick
# convergence to ~2600 and N=3000 from 1915-stuck-at-150k to a clean 6976-tick
# convergence, dups=0. N=5000 still plateaus (~3076 at the 60k cap): the join
# storm builds lone-row spines to the depth wall and the heal/compaction layer
# bucket-brigades seats up them while war-loser requeues NOROOM at the wall —
# a third defect family (heal-promotion exclusivity + spine re-absorption),
# diagnosed with MESH_FINDLOG in the 2026-08-05 handoff.
#
#   N=5000, det on, single join storm (window join), converge under a tick cap
#   -> seated=5000/5000, s1=25/25, dups=0, stranded=0, teleport=0.
#
# Usage: test/sim/scale-frontier.sh
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-scale}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
fail=0

echo "N=5000 det join storm (this takes a few minutes)"
out=$(run "det on" "init 5000" "converge 60000" "state" "dups" "check")
echo "$out" | grep -E '^(OK converged|TIMEOUT|STATE|DUPS|CHECK)' | sed 's/^/   /'
grep -q '^OK converged@' <<<"$out" || { echo "   FAIL — did not converge under the cap"; fail=1; }
grep -q '^DUPS 0' <<<"$out" || { echo "   FAIL — duplicate seats at convergence"; fail=1; }
grep -q 'CHECK PASS' <<<"$out" || { echo "   FAIL — check invariants"; fail=1; }

if [ "$fail" -eq 0 ]; then echo "SCALE GREEN (N=5000 converges, dups=0)"; else echo "SCALE RED"; exit 1; fi
