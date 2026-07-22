#!/usr/bin/env bash
# repro-atomic-move.sh — adversarial scenarios for ATOMIC SEAT SWITCHING (the
# mover's lease, law T in docs/healing-laws.md). Deterministic seeds, one
# process per leg, sweep.sh style.
#
# Timeline being exercised (3p room, seed 1: head at /0.0, seats /0.1 /0.2):
#   killat /0.0        -> /0.1 heals via FINDLEAF; /0.2 is the promoted leaf
#   t+4..5             -> the mover is IN TRANSIT (took /0.0, still holds /0.2,
#                         no LEAVE sent — dual-hold; `transit` shows the move)
#   t+6                -> claim CONFIRMS (neighbour evidence); old seat vacated
#                         with LEAVE(mvd) + forwarding tombstone (lease)
#
# Legs:
#   A) mover dies mid-transit, GRACEFUL  -> ordinary death handling for both
#      coords; the room re-forms; a newcomer still seats in the home row.
#   B) mover dies mid-transit, SILENT    -> same, behind the ring-hold.
#   C) mover dies post-confirm (lease)   -> ordinary death at the NEW seat.
#   D) cascade scooches: three heads of a full home row die at once -> the
#      left-pack chain of concurrent transits converges, no dups.
#   E) churn during transit: overlapping mass-kills at N=800 -> CHECK PASS
#      (seated=all, s1=25, dups=0, stranded=0, teleport=0, transitStale=0).
# The admission-racing-a-move case is test/sim/repro-headless-row.sh (kept green).
#
# Usage: test/sim/repro-atomic-move.sh
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-atomic}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
fail=0

leg(){ # name expected-N out
  local name="$1" n="$2" out="$3"
  local w=$(grep '^WHERE' <<<"$out" | tail -1); local s=$(grep '^STATE' <<<"$out" | tail -1); local c=$(grep '^CHECK' <<<"$out" | tail -1)
  echo "$name"
  echo "   $w"
  echo "   $c"
  local ok=1
  grep -q "CHECK PASS" <<<"$c" || ok=0
  [ -n "$w" ] && { grep -Eq 'state=3 coord=/0\.[0-9]' <<<"$w" || ok=0; }
  if [ "$ok" -eq 1 ]; then echo "   PASS"; else echo "   FAIL"; fail=1; fi
}

# A) mover killed GRACEFULLY mid-transit (t+4: took /0.0, still holds /0.2)
outA=$(run "seed 1" "init 3 0" "converge 6000" "killat /0.0" "tick 4" "transit" "killat /0.0" "spawn 1" "tick 300" "where 3" "state" "check")
echo "A) mover dies mid-transit (graceful):  $(grep '^TRANSIT' <<<"$outA")"
leg "" 2 "$outA"

# B) mover killed SILENTLY mid-transit (ring-hold recovery)
outB=$(run "seed 1" "init 3 0" "converge 6000" "killat /0.0" "tick 4" "killat /0.0 silent" "spawn 1" "tick 700" "where 3" "state" "check")
leg "B) mover dies mid-transit (silent):" 2 "$outB"

# C) mover killed AFTER confirm, during the tombstone lease (ordinary death at the new seat)
outC=$(run "seed 1" "init 3 0" "converge 6000" "killat /0.0" "tick 7" "transit" "killat /0.0" "spawn 1" "tick 300" "where 3" "state" "check")
echo "C) mover dies post-confirm (lease):    $(grep '^TRANSIT' <<<"$outC")"
leg "" 2 "$outC"

# D) cascade scooches: kill three cells of the FULL home row 0 at once — the
# left-pack / vertical chain runs concurrent transits; must converge, no dups.
outD=$(run "seed 3" "init 12 0" "converge 8000" "killat /0.0" "killat /0.1" "killat /0.2" "tick 800" "state" "check")
echo "D) cascade (3 row-0 deaths at once):"
echo "   $(grep '^STATE' <<<"$outD" | tail -1)"
echo "   $(grep '^CHECK' <<<"$outD" | tail -1)"
if grep -q "CHECK PASS" <<<"$outD"; then echo "   PASS"; else echo "   FAIL"; fail=1; fi

# E) churn DURING transit: a second mass-kill lands while the first heal's
# transits are still in flight.
outE=$(run "seed 5" "init 800 0" "converge" "kill 0.3" "tick 30" "kill 0.3" "tick 15000" "state" "check")
echo "E) overlapping mass-kills (churn during transit):"
echo "   $(grep '^STATE' <<<"$outE" | tail -1)"
echo "   $(grep '^CHECK' <<<"$outE" | tail -1)"
if grep -q "CHECK PASS" <<<"$outE"; then echo "   PASS"; else echo "   FAIL"; fail=1; fi

echo "----"
if [ "$fail" -eq 0 ]; then echo "ATOMIC-MOVE GREEN"; exit 0
else echo "ATOMIC-MOVE RED"; exit 1; fi
