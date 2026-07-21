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

echo "=== E) vertical: kill down-child then owner — LEFT-PACK heals without long drain ==="
# Need a live down-child under /0.0 (0/0.0). N=80 keeps a dense home so
# column-0 always has a vertical heir after three-state seating (N=50 could
# leave 0/0.0 empty while other columns held the deep seats).
outE=$(run "seed 2" "init 80 0" "converge 20000" \
  "find 0/0.0" "find /0.0" \
  "killat 0/0.0" "tick 30" \
  "killat /0.0" "tick 400" \
  "find /0.0" "state")
fChild=$(grep 'FIND 0/0.0' <<<"$outE" | head -1)
fOwner0=$(grep 'FIND /0.0' <<<"$outE" | head -1)
fOwner1=$(grep 'FIND /0.0' <<<"$outE" | tail -1)
sE=$(grep '^STATE' <<<"$outE")
echo "   before: $fOwner0 | $fChild"
echo "   after dual leave +400: $fOwner1"
echo "   $sE"
# Precondition: must have had a live vertical healer
if grep -q 'FIND 0/0.0 -> seat -1' <<<"$fChild"; then
  echo "   E FAIL — precondition: no down-child at 0/0.0 (room too sparse)"; fail=1
elif grep -Eq 'FIND /0.0 -> seat [0-9]+' <<<"$fOwner1" && ! grep -q 'FIND /0.0 -> seat -1' <<<"$fOwner1"
then echo "   E PASS (owner hole refilled after vertical healer died)"
else echo "   E FAIL — /0.0 not healed after down-child+owner leave (stale childOf?)"; fail=1; fi

echo "=== F) S1 column-clique: kill rightward row then /0.1 — column-mate heals fast ==="
# N=7 fills /0.0..4 + /1.0 + /1.1. Kill /0.4,/0.3,/0.2 so the row-right
# chain of /0.1 is empty; then kill /0.1. Without column devolution the
# hole waits RING_HOLD (~220) for the head s1Fill backstop. With it, the
# column-mate at /1.1 heals on the LEAVE reactive path (~tens of ticks).
outF=$(run "seed 3" "init 7 0" "converge 8000" \
  "find /0.1" "find /1.1" \
  "killat /0.4" "tick 20" "killat /0.3" "tick 20" "killat /0.2" "tick 20" \
  "killat /0.1" "tick 40" \
  "find /0.1" "state")
fPre=$(grep 'FIND /0.1' <<<"$outF" | head -1)
fCol=$(grep 'FIND /1.1' <<<"$outF" | head -1)
fPost=$(grep 'FIND /0.1' <<<"$outF" | tail -1)
sF=$(grep '^STATE' <<<"$outF")
echo "   pre: $fPre | col-mate $fCol"
echo "   after right-clear + kill /0.1 +40: $fPost"
echo "   $sF"
if grep -q 'FIND /0.1 -> seat -1' <<<"$fPre" || grep -q 'FIND /1.1 -> seat -1' <<<"$fCol"; then
  echo "   F FAIL — precondition: need /0.1 and /1.1 occupied before kills"; fail=1
elif grep -Eq 'FIND /0.1 -> seat [0-9]+' <<<"$fPost" && ! grep -q 'FIND /0.1 -> seat -1' <<<"$fPost" \
   && grep -q 'dups=0' <<<"$sF"
then echo "   F PASS (column-mate healed /0.1 within 40 ticks)"
else echo "   F FAIL — /0.1 empty after 40 ticks (column-clique did not engage)"; fail=1; fi

echo "----"
if [ "$fail" -eq 0 ]; then echo "H-CHAIN GREEN"; exit 0
else echo "H-CHAIN RED"; exit 1; fi
