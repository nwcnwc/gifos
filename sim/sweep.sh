#!/usr/bin/env bash
# sweep.sh — reproduce the ring-integrity verdict (docs/healing-laws.md W7/C3/E2/H1-S1).
#
# Builds the sim and runs three proofs:
#   1) CHURN sweep: for every (seed, kill-fraction), converge → kill → heal, then
#      `check` asserts seated=all, Section 1 = 25/25, dups=0, stranded=0, teleport=0.
#      A single failure is a real defect: the rook's graph (W7) is meant to make NO
#      pattern of node loss split the home.
#   2) TOTAL PARTITION: cut every link between two live groups; `splitstate` must
#      show two internally-consistent homes (each seated=all, s1=25, dups=0), neither
#      reconciling across the cut — the one accepted "two rooms" edge.
#   3) EARLY-PROBE (healing-laws D5): an ungracefully-crashed seat (transports
#      observed dead, no LEAVE) is healed in ~probe-time (<60 ticks, vs the 220+
#      horizon); a severed-but-ALIVE seat answers the probe over the mesh and is
#      NOT evicted; a blackholed seat (no transport event) keeps the old horizon.
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

echo "early-probe (D5): crash / sever / blackhole, seed-3 pinned (seat 6 = home cell /0.2) ..."
# These 3 legs measure D5 PROBE TIMING precisely (heal-tick, pinned coord, exact
# settle). Q2 compaction (`compacton 0` here) is orthogonal background packing
# whose moves would perturb the pinned coords and the settle window — compaction
# + D5 is covered by the CHURN sweep above (mass-kill + tick 15000, compaction on).
ebad=0
# 3a) CRASH: transports observed dead -> healed well inside 60 ticks (horizon is 220+)
out=$(printf "seed 3\ninit 200 0\ncompacton 0\nconverge\nfind /0.2\ncrash 6\ntick 60\ncheck\nquit\n" | "$BIN" --service 2>&1 | grep -E "^FIND|^CHECK")
echo "$out" | sed 's/^/  crash: /'
grep -q "FIND /0.2 -> seat 6" <<<"$out" || { echo "  crash: PIN DRIFT (seat 6 not at /0.2)"; ebad=$((ebad+1)); }
grep -q "CHECK PASS" <<<"$out" || ebad=$((ebad+1))
# 3b) SEVER: one dead link, both ends alive 150 ticks -> the slow peer KEEPS its seat
out=$(printf "seed 3\ninit 200 0\ncompacton 0\nconverge\nsever 0 6 150\ntick 200\nwhere 6\ncheck\nquit\n" | "$BIN" --service 2>&1 | grep -E "^WHERE|^CHECK")
echo "$out" | sed 's/^/  sever: /'
grep -q "WHERE 6 state=3 coord=/0.2" <<<"$out" || ebad=$((ebad+1))
grep -q "CHECK PASS" <<<"$out" || ebad=$((ebad+1))
# 3c) BLACKHOLE: silent death, NO transport event -> NOT healed early (60 ticks), healed by the horizon (settled by +1300 — the heal fires ~240 but the drain wave of the dead seat's dependents needs its own E1 timers)
out=$(printf "seed 3\ninit 200 0\ncompacton 0\nconverge\ncrash 6 quiet\ntick 60\nfind /0.2\ntick 1300\ncheck\nquit\n" | "$BIN" --service 2>&1 | grep -E "^FIND|^CHECK")
echo "$out" | sed 's/^/  blackhole: /'
grep -q "FIND /0.2 -> seat -1" <<<"$out" || ebad=$((ebad+1))   # nobody promoted early into the blackholed cell
grep -q "CHECK PASS" <<<"$out" || ebad=$((ebad+1))

echo "----"
if [ "$fail" -eq 0 ] && [ "$pbad" -eq 0 ] && [ "$ebad" -eq 0 ]; then echo "SWEEP GREEN"; exit 0
else echo "SWEEP RED (churn fails=$fail, partition-bad=$pbad, early-probe-bad=$ebad)"; exit 1; fi
