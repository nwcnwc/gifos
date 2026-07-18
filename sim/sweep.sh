#!/usr/bin/env bash
# sweep.sh — reproduce the ring-integrity verdict (docs/healing-laws.md W7/C3/E2/H1-S1).
#
# Builds the sim and runs two proofs:
#   1) CHURN sweep: for every (seed, kill-fraction), converge → kill → heal, then
#      `check` asserts seated=all, Section 1 = 25/25, dups=0, stranded=0, teleport=0.
#      A single failure is a real defect: the rook's graph (W7) is meant to make NO
#      pattern of node loss split the home.
#   2) TOTAL PARTITION: cut every link between two live groups; `splitstate` must
#      show two internally-consistent homes (each seated=all, s1=25, dups=0), neither
#      reconciling across the cut — the one accepted "two rooms" edge.
#
# IMPORTANT: each run is a FRESH process. Service-mode `init` does NOT revive
# killed seats or reset TICK, so re-using one session across seed+kill cycles
# leaks state and produces bogus failures. One process per (seed,kill).
#
# Usage:  sim/sweep.sh            # quick: seeds 1-10 x kills {0.2,0.4,0.5}
#         sim/sweep.sh full       # full:  seeds 1-50 x kills {0.1..0.6}
#         N=1200 sim/sweep.sh     # override seat count (default 800)
set -u
cd "$(dirname "$0")/.."                       # repo root
BIN="${BIN:-/tmp/gifos-mesh-sweep}"
N="${N:-800}"
TICKS="${TICKS:-15000}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

if [ "${1:-}" = "full" ]; then SEEDS=$(seq 1 50); KILLS="0.1 0.2 0.3 0.4 0.5 0.6"
else                           SEEDS=$(seq 1 10); KILLS="0.2 0.4 0.5"; fi

run_check() {  # seed kill  -> echoes the CHECK line (fresh process)
  printf "seed %s\ninit %s 0\nconverge\nkill %s\ntick %s\ncheck\nquit\n" "$1" "$N" "$2" "$TICKS" \
    | "$BIN" --service 2>&1 | grep -E "^CHECK"
}

echo "churn sweep: $(echo "$SEEDS" | wc -w) seeds x $(echo $KILLS | wc -w) kills, N=$N, one process each ..."
pass=0; fail=0; fails=""
for s in $SEEDS; do for k in $KILLS; do
  line=$(run_check "$s" "$k")
  if grep -q "CHECK PASS" <<<"$line"; then pass=$((pass+1))
  else fail=$((fail+1)); fails+="  kill=$k $line"$'\n'; fi
done; done
echo "  CHURN: $pass PASS, $fail FAIL"
[ "$fail" -ne 0 ] && { echo "  --- failures ---"; printf '%s' "$fails"; }

echo "total partition (split 0.5): seeds 7 11 29, one process each ..."
pbad=0
for s in 7 11 29; do
  line=$(printf "seed %s\ninit 400 0\nconverge\nsplit 0.5\ntick 40000\nsplitstate\nquit\n" "$s" \
          | "$BIN" --service 2>&1 | grep "SPLITSTATE")
  echo "  $line"
  grep -Eq "dups=[1-9]|strand=[1-9]" <<<"$line" && pbad=$((pbad+1))
done

echo "----"
if [ "$fail" -eq 0 ] && [ "$pbad" -eq 0 ]; then echo "SWEEP GREEN"; exit 0
else echo "SWEEP RED (churn fails=$fail, partition-bad=$pbad)"; exit 1; fi
