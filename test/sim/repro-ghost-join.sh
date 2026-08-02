#!/usr/bin/env bash
# repro-ghost-join.sh — GHOST CHURN: joiners killed mid-placement must not
# poison seating for the next real arrival (the 0.9.0 blocker, 2026-08-02).
#
# The production shape: a phone tab is killed ~700ms into a join — after the
# admitter wrote its soft sitting-down mark and sent PLACE, before the joiner
# ever took the seat or was heard from again. Six of those in a row walled off
# the whole home row for SIT_TTL (90t): the H7 "previous row fully reserved"
# gate then seated every real newcomer into an EMPTY row 1 — an isolated
# fragment with zero live links, unable to pull snap or app from anyone.
# Measured pre-fix here: reals landed /1.0 /1.1 behind six ghost sits.
#
# The laws under test (all admitter-local, no relay involvement):
#   CHECK-BACK   — a sitting-down vouch whose joiner was NEVER heard frees at
#                  SIT_RECHECK (25t), not SIT_TTL (90t), healTry cleared.
#   HARD H7 GATE — a newcomer is seated past row t-1 only when that row is
#                  fully OCCUPIED; all-soft rows answer NOROOM (honest retry).
#   FREED=FRESH  — freeing a cell clears its healTry admission cooldown.
#
# Kill window: spawn → tick 9 lands the joiner at state 2 with its FIND served
# (sit-mark written, PLACE in flight); `crash <id> quiet` is the blackhole
# death — no LEAVE, no transport event, exactly a killed tab that never wired.
#
# Usage: test/sim/repro-ghost-join.sh
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-ghost}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

fail=0
# emit the command stream for: founder, then N ghosts (ids first..), then the tail
scenario(){ local nghost=$1; shift
  printf 'seed 1\ninit 1\nconverge 400000\n'
  local g; for ((g=1; g<=nghost; g++)); do printf 'spawn 1\ntick 9\ncrash %d quiet\n' "$g"; done
  printf '%s\n' "$@" 'quit'
}

echo "=== A) 6 ghosts, then 3 real guests — all reals must seat IN THE HOME ROW ==="
outA=$(scenario 6 "spawn 3" "converge 4000" "state" "dups" "where 7" "where 8" "where 9" | "$BIN" --service 2>&1)
sA=$(grep '^STATE' <<<"$outA" | tail -1)
echo "   $sA"
grep '^WHERE' <<<"$outA" | sed 's/^/   /'
okA=1
tail -n +2 <<<"$(grep -E 'converged|TIMEOUT' <<<"$outA")" | grep -q 'TIMEOUT' && { echo "   converge TIMED OUT"; okA=0; }
grep -qE 'seated=4' <<<"$sA" && grep -q 'dups=0' <<<"$sA" && ! grep -qE 'stranded=[1-9]' <<<"$sA" || okA=0
for id in 7 8 9; do
  grep -qE "WHERE $id state=3 coord=/0\.[0-9]" <<<"$outA" || { echo "   real $id NOT in the home row"; okA=0; }
done
if [ $okA = 1 ]; then echo "   A PASS — reals seat in row 0 behind six ghosts"
else echo "   A FAIL — ghost sits still poison the home row"; fail=$((fail+1)); fi

echo "=== B) real guest arrives WHILE the ghosts' sits are still held — never row 1+ ==="
# The hard H7 gate: with row 0 all-soft, the honest answer is NOROOM + retry,
# never a seat in an empty row. The real spawns immediately after the last
# ghost (its sits are at most a few ticks old, far inside SIT_RECHECK).
outB=$(scenario 4 "spawn 1" "converge 4000" "state" "dups" "where 5" | "$BIN" --service 2>&1)
sB=$(grep '^STATE' <<<"$outB" | tail -1)
echo "   $sB"
grep '^WHERE' <<<"$outB" | sed 's/^/   /'
okB=1
grep -qE 'seated=2' <<<"$sB" && grep -q 'dups=0' <<<"$sB" || okB=0
grep -qE "WHERE 5 state=3 coord=/0\.[0-9]" <<<"$outB" || { echo "   real 5 NOT in the home row"; okB=0; }
if [ $okB = 1 ]; then echo "   B PASS — mid-churn arrival waits honestly, seats in row 0"
else echo "   B FAIL"; fail=$((fail+1)); fi

echo "=== C) control: ordinary serial join stays green and DENSE after the law change ==="
outC=$(printf 'seed 1\njoinmode serial 8\ninit 6 0\nconverge 80000\nstate\ndups\nfind /0.0\nfind /0.1\nfind /0.2\nfind /0.3\nfind /0.4\nfind /1.0\nquit\n' | "$BIN" --service 2>&1)
sC=$(grep '^STATE' <<<"$outC")
echo "   $sC"
okC=1
grep -qE 'seated=6' <<<"$sC" && grep -q 'dups=0' <<<"$sC" || okC=0
for c in '/0.0' '/0.1' '/0.2' '/0.3' '/0.4' '/1.0'; do
  grep -qE "^FIND $c -> seat [0-9]" <<<"$outC" || { echo "   $c unexpectedly empty"; okC=0; }
done
if [ $okC = 1 ]; then echo "   C PASS — dense H7 row-major fill intact"
else echo "   C FAIL — the hardened gate broke ordinary joining"; fail=$((fail+1)); fi

echo
if [ $fail = 0 ]; then echo "ALL PASS"; else echo "$fail FAILED"; fi
exit $fail
