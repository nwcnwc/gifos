#!/usr/bin/env bash
# repro-churn-combos.sh — seating/healing under COMBINED disruptions.
#
# Single-fault legs live in other repro-*.sh files. This pins the cases where
# two bad things happen together (or a leave-storm is followed by rejoin) —
# the patterns that have repeatedly found density, phantom, and rejoin bugs.
#
#   A) loss=0.05 + 40%-kill + heal — packet loss during mass recovery
#   B) triple front-row leave then 3 newcomers — rejoin after scoot storm
#   C) sever a live link during a healthy room — no eviction of either end
#   D) silent s1-row wipe (killat each cell silent) then settle — ring-hold
#      then re-fill without permanent unseated
#
# Usage: sim/repro-churn-combos.sh
set -u
cd "$(dirname "$0")/.."
BIN="${BIN:-/tmp/gifos-mesh-churn}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
fail=0

echo "=== A) loss=0.05 + 40%-kill + recover (N=120) ==="
outA=$(run "seed 4" "net loss=0.05" "joinmode burst" "init 120 0" "converge 120000" \
  "kill 0.4" "tick 20000" "state" "bad" "check")
sA=$(grep '^STATE' <<<"$outA" | tail -1)
cA=$(grep '^CHECK' <<<"$outA" | tail -1)
bA=$(grep '^BAD' <<<"$outA" | tail -1)
echo "   $sA"
echo "   $cA"
echo "   $bA"
if grep -q 'CHECK PASS' <<<"$cA" && grep -q 'dups=0' <<<"$sA" && ! grep -qE 'stranded=[1-9]' <<<"$sA"
then echo "   A PASS"
else echo "   A FAIL — loss+kill recovery broke"; fail=1; fi

echo "=== B) triple front-row LEAVE then 3 newcomers (seed 3, N=12) ==="
# Atomic-move D: survivors only. Late joiners must still seat after the scoot
# storm — and MORE of them than the one free hole the cascade left (/1.4), so
# the frontier has to re-open the row the left-pack drained (row 2). That row is
# "once-seen, now silent": it must NOT be mistaken for a whole-row corpse and
# handed to the row below (never live in a shrinking room) — see rowHeld in
# serveFind. Pinned at spawn 3 -> 12/12 since that fix.
outB=$(run "seed 3" "init 12 0" "converge 8000" \
  "killat /0.0" "killat /0.1" "killat /0.2" "tick 800" "state" "check" \
  "spawn 3" "tick 4000" "state" "bad" "check" \
  "find /0.0" "find /0.1" "find /0.2" "find /0.3" "find /0.4" "find /1.4" "find /2.0")
sB0=$(grep '^STATE' <<<"$outB" | head -1)
cB0=$(grep '^CHECK' <<<"$outB" | head -1)
sB=$(grep '^STATE' <<<"$outB" | tail -1)
cB=$(grep '^CHECK' <<<"$outB" | tail -1)
bB=$(grep '^BAD' <<<"$outB" | tail -1)
echo "   after cascade: $sB0 | $cB0"
echo "   after spawn+3: $sB | $cB"
if grep -q 'CHECK PASS' <<<"$cB0" && grep -qE 'seated=9' <<<"$sB0" \
   && grep -q 'CHECK PASS' <<<"$cB" && grep -qE 'seated=12' <<<"$sB" \
   && grep -q 'dups=0' <<<"$sB" && ! grep -qE 'unseated=[1-9]|stranded=[1-9]' <<<"$sB$bB"
then echo "   B PASS (cascade survivors + three late joiners past the frontier)"
else echo "   B FAIL — cascade rejoin left the room sick"; fail=1; fi

echo "=== C) sever one live S1 link 200 ticks — both ends stay seated ==="
outC=$(run "seed 5" "init 40 0" "converge 40000" \
  "find /0.1" "find /0.2" \
  "sever 1 2 200" "tick 250" \
  "where 1" "where 2" "state" "check")
w1=$(grep '^WHERE 1' <<<"$outC" | tail -1)
w2=$(grep '^WHERE 2' <<<"$outC" | tail -1)
cC=$(grep '^CHECK' <<<"$outC" | tail -1)
sC=$(grep '^STATE' <<<"$outC" | tail -1)
echo "   $w1"
echo "   $w2"
echo "   $cC"
if grep -q 'state=3' <<<"$w1" && grep -q 'state=3' <<<"$w2" \
   && grep -q 'CHECK PASS' <<<"$cC" && grep -q 'dups=0' <<<"$sC"
then echo "   C PASS (severed link did not evict either end)"
else echo "   C FAIL — sever caused eviction or broken check"; fail=1; fi

echo "=== D) silent wipe of front row then settle (N=20) ==="
# Kill /0.0../0.4 silently (no LEAVE) — ring-hold then heal; room must not strand.
outD=$(run "seed 7" "init 20 0" "converge 40000" \
  "killat /0.0 silent" "killat /0.1 silent" "killat /0.2 silent" \
  "killat /0.3 silent" "killat /0.4 silent" \
  "tick 150" "bad" \
  "tick 2500" "state" "bad" "check")
bD1=$(grep '^BAD' <<<"$outD" | head -1)
sD=$(grep '^STATE' <<<"$outD" | tail -1)
cD=$(grep '^CHECK' <<<"$outD" | tail -1)
bD2=$(grep '^BAD' <<<"$outD" | tail -1)
echo "   early: $bD1"
echo "   final: $sD"
echo "   $cD"
# Early: some unseated or still healing is OK; final must be clean among survivors.
# 20-5=15 live after silent kills (alive cleared without LEAVE — N drops).
if grep -q 'CHECK PASS' <<<"$cD" && grep -q 'dups=0' <<<"$sD" \
   && ! grep -qE 'stranded=[1-9]' <<<"$sD" && ! grep -qE 'unseated=[1-9]' <<<"$bD2"
then echo "   D PASS (silent row wipe recovered)"
else echo "   D FAIL — silent front-row wipe left permanent damage"; fail=1; fi

echo "----"
if [ "$fail" -eq 0 ]; then echo "CHURN-COMBOS GREEN"; exit 0
else echo "CHURN-COMBOS RED ($fail failed)"; exit 1; fi
