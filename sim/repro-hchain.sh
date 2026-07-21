#!/usr/bin/env bash
# repro-hchain.sh — H-CHAIN designation chain (healing-laws H-CHAIN).
#
# When the designated admitter / right-neighbour healer is ALSO gone, duty
# devolves along the row clique (col 1 → 2 → …). Single-step col-1 devolution
# closed the headless-row admission gap (repro-headless-row.sh). This pins the
# multi-level walk + "never hand FIND to a corpse" hand-off.
#
#   A) HEAL chain: 4-person room, LEAVE head then col-1. Col-2 must act as
#      the H-CHAIN rightward healer so the home does not strand (dups=0).
#   B) ADMISSION chain: same dual LEAVE, then a newcomer after LEAVE has
#      cleared. Col-2 (or later) is the devolved admitter → joiner in row 0.
#   C) CONTROL: head-only leave (seed from headless-row B) still seats in
#      row 0 — no regression of single-step devolution.
#   D) CONTROL: silent head death stays ring-hold-conservative (headless C).
#
# Usage: sim/repro-hchain.sh
set -u
cd "$(dirname "$0")/.."
BIN="${BIN:-/tmp/gifos-mesh-hchain}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
fail=0

echo "=== A) heal: head+col1 LEAVE → row rebuilds without strand (H-CHAIN left-pack) ==="
outA=$(run "seed 4" "init 4 0" "converge 8000" \
  "killat /0.0" "tick 8" "killat /0.1" "tick 200" "state")
sA=$(grep '^STATE' <<<"$outA")
echo "   $sA"
if grep -q 'dups=0' <<<"$sA" && grep -qE 'seated=2' <<<"$sA" && ! grep -qE 'stranded=[1-9]' <<<"$sA"
then echo "   A PASS"
else echo "   A FAIL — dual leave left the home sick"; fail=1; fi

echo "=== B) admission: dual LEAVE then joiner seats in row 0 via devolved admitter ==="
# Longer gap between kills so LEAVE clears occ before the next death; then
# settle before spawning so H-CHAIN walks vacated seats only.
outB=$(run "seed 6" "init 4 0" "converge 8000" \
  "killat /0.0" "tick 30" "killat /0.1" "tick 40" \
  "spawn 1" "tick 120" "where 4" "state")
wB=$(grep '^WHERE 4' <<<"$outB" | tail -1); sB=$(grep '^STATE' <<<"$outB")
echo "   $wB"
echo "   $sB"
if grep -Eq 'state=3 coord=/0\.[0-9]' <<<"$wB"
then echo "   B PASS (joiner in home row)"
else echo "   B FAIL — joiner not in row 0 after dual leave + H-CHAIN admit"; fail=1; fi

echo "=== C) control: head-only leave (headless-row seed 6) still seats in row 0 ==="
outC=$(run "seed 6" "init 3 0" "converge 6000" "spawn 1" "tick 8" "killat /0.0" "tick 12" "where 3" "tick 48" "where 3" "state")
wC=$(grep '^WHERE 3' <<<"$outC" | tail -1); sC=$(grep '^STATE' <<<"$outC")
echo "   $wC"
echo "   $sC"
if grep -Eq 'state=3 coord=/0\.[0-9]' <<<"$wC"
then echo "   C PASS"
else echo "   C FAIL — head-only leave regression"; fail=1; fi

echo "=== D) control: silent head death stays conservative then settles (headless C) ==="
outD=$(run "seed 1" "init 2 0" "converge 6000" "spawn 1" "tick 10" "killat /0.0 silent" "tick 150" "bad" "tick 250" "where 2" "state")
bD=$(grep '^BAD' <<<"$outD"); wD=$(grep '^WHERE 2' <<<"$outD"); sD=$(grep '^STATE' <<<"$outD")
echo "   at +150: $bD"
echo "   at +400: $wD"
okD=1
grep -q 'BAD unseated=1' <<<"$bD" || { echo "   D FAIL — silent death fast-tracked past ring-hold"; okD=0; }
{ grep -Eq 'state=3 coord=/0\.[0-9]' <<<"$wD" && grep -q 'dups=0' <<<"$sD"; } || { echo "   D FAIL — did not settle in row 0 after ring-hold"; okD=0; }
[ "$okD" -eq 1 ] && echo "   D PASS"
[ "$okD" -eq 0 ] && fail=1

echo "----"
if [ "$fail" -eq 0 ]; then echo "H-CHAIN GREEN"; exit 0
else echo "H-CHAIN RED"; exit 1; fi
