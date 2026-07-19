#!/usr/bin/env bash
# repro-compaction.sh — Q2 COMPACTION (roadmap §3, healing-laws law T).
#
# A settled deep LEAF that a fresh probe would place STRICTLY SHALLOWER walks its
# own ALIVE up-chain and joins the nearest strictly-shallower OCCUPIED row
# (densify) via an atomic law-T move. depth is a monotone-decreasing potential,
# so MOVES provably SETTLE; the move empties lone-row deep sections into their
# ancestors' rows (the sdn-mirror no-route payoff, docs/media-plane.md).
#
# The gate asserts, against a compaction-OFF control on the SAME seed/scenario:
#   1) CORRECTNESS — CHECK PASS (seated=all, s1=25, dups=0, stranded=0,
#      teleport=0, transitStale=0), never broken by compaction, in BOTH a
#      gradual-shrink and an adversarial mass-kill scenario.
#   2) PACKING — a gradually-shrunk room packs to MINIMAL depth (maxDepth==
#      minDepth) and STRICTLY fewer lone-row deep sections than the control.
#   3) SETTLING — cMoves is stable across a long final idle window (no slosh).
#
# Usage: sim/repro-compaction.sh
set -u
cd "$(dirname "$0")/.."
BIN="${BIN:-/tmp/gifos-mesh-compact}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
field(){ sed -nE "s/.* $2=([0-9-]+).*/\1/p" <<<"$1" | tail -1; }   # field "<line>" name
fail=0

# The gradual-shrink scenario (the realistic production case): grow, then repeated
# small departures each followed by a settle, then a long compaction window. Each
# element is ONE service command (arrays keep multi-word commands intact).
SHRINK=(init 300 0)
SHRINK=("init 300 0" "converge 6000"
        "kill 0.15" "converge 4000" "kill 0.15" "converge 4000"
        "kill 0.15" "converge 4000" "kill 0.15" "converge 4000")

echo "=== 1) gradual shrink — compaction ON vs OFF (seed 2) ==="
onL=$(run "seed 2" "${SHRINK[@]}" "tick 12000" "compact" "check" | grep -E '^(COMPACT|CHECK)')
offL=$(run "seed 2" "compacton 0" "${SHRINK[@]}" "tick 12000" "compact" "check" | grep -E '^(COMPACT|CHECK)')
onC=$(grep '^COMPACT' <<<"$onL");  onCk=$(grep '^CHECK' <<<"$onL")
offC=$(grep '^COMPACT' <<<"$offL"); offCk=$(grep '^CHECK' <<<"$offL")
echo "   ON : $onC"
echo "   ON : $onCk"
echo "   OFF: $offC"
onMax=$(field "$onC" maxDepth);  onMin=$(field "$onC" minDepth);  onLone=$(field "$onC" loneRowDeepSections); onSec=$(field "$onC" occSections)
offMax=$(field "$offC" maxDepth); offLone=$(field "$offC" loneRowDeepSections); offSec=$(field "$offC" occSections)
echo "   -> ON maxDepth=$onMax (min=$onMin) lone=$onLone sections=$onSec | OFF maxDepth=$offMax lone=$offLone sections=$offSec"
ok=1
grep -q 'CHECK PASS' <<<"$onCk" || { echo "   FAIL: compaction broke convergence"; ok=0; }
grep -q 'CHECK PASS' <<<"$offCk" || { echo "   FAIL: control did not converge (bad scenario)"; ok=0; }
[ "$onMax" = "$onMin" ] || { echo "   FAIL: not packed to minimal depth ($onMax != $onMin)"; ok=0; }
[ "$onMax" -le "$offMax" ] 2>/dev/null || { echo "   FAIL: compaction did not reduce maxDepth"; ok=0; }
[ "$onLone" -lt "$offLone" ] 2>/dev/null || { echo "   FAIL: compaction did not reduce lone-row sections"; ok=0; }
[ "$ok" = 1 ] && echo "   PASS" || fail=1

echo "=== 2) MOVES settle (no oscillation) over a long idle window ==="
set2=$(run "seed 2" "${SHRINK[@]}" "tick 20000" "compact" "tick 30000" "compact")
m1=$(field "$(grep '^COMPACT' <<<"$set2" | sed -n 1p)" cMoves)
m2=$(field "$(grep '^COMPACT' <<<"$set2" | sed -n 2p)" cMoves)
echo "   cMoves @+20k=$m1  @+50k=$m2  (delta=$((m2-m1)))"
if [ $((m2-m1)) -le 3 ]; then echo "   PASS (settled)"; else echo "   FAIL: MOVES kept growing — possible oscillation"; fail=1; fi

echo "=== 3) adversarial mass-kill — compaction must not break correctness (seeds 1-4, kill 0.5) ==="
mk=0
for s in 1 2 3 4; do
  c=$(run "seed $s" "init 800 0" "converge" "kill 0.5" "tick 15000" "check" | grep '^CHECK')
  echo "   seed=$s: $c"
  grep -q 'CHECK PASS' <<<"$c" || mk=1
done
[ "$mk" = 0 ] && echo "   PASS" || { echo "   FAIL: mass-kill broke with compaction on"; fail=1; }

echo "----"
if [ "$fail" -eq 0 ]; then echo "COMPACTION GREEN"; exit 0
else echo "COMPACTION RED"; exit 1; fi
