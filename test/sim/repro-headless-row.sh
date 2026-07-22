#!/usr/bin/env bash
# repro-headless-row.sh — pin the HEADLESS-ROW ADMISSION GAP (docs/roadmap.md §3,
# diagnosed by the H7 row-fill work; live repro: e2e-video "room survives its
# creator" leg).
#
# The gap: when a Section-1 row HEAD departs and a newcomer's FIND races the
# survivor's heal, the row has no live designated admitter —
#   - cell (0,t,j>0) is admitted by its row head (H7), which is gone;
#   - the head cell's own admitter is the head of the row above (wrapped),
#     which in a young room never existed;
# so the FIND either dies at the corpse (silent drop -> the newcomer's 60-tick
# retry cadence) or falls through the whole home scan and seats the joiner
# DEEP / in the WRONG ROW. Three deterministic legs (seeds fixed, one process
# per leg, sweep.sh style):
#
#   A) 2-person room, graceful LEAVE, kill at spawn+10 (FIND in flight):
#      the lone survivor's own row goes s1seen-stale (>120 ticks alone), its
#      OWN row trips the H7 resurrection branch, and it admits the joiner at
#      (0,1,0) — a COLUMN-mate, permanently. A 2-person meeting with no
#      row-scoped media, forever. ASSERT: joiner must end in row 0.
#   B) 3-person room, graceful LEAVE, kill at spawn+8 (FIND lands inside the
#      survivor's FINDLEAF heal window, when the head cell is cleared but not
#      yet refilled): the home scan finds no admissible cell (every admitter
#      cell is vacant) and falls through DEEP — the joiner seats at 1/0.0
#      under the survivor and stays there ~300 ticks (rides the ring-hold
#      cadence, not the seconds-scale admit path). ASSERT: joiner is in row 0
#      within 60 ticks of the departure.
#   C) SILENT death (control, both before and after any fix): with no LEAVE
#      the head cell holds a corpse; admission must stay behind the H1-S1
#      ring-hold confirmation (~220 ticks) — a fix for A/B must NOT fast-track
#      silent death (severance-immunity). ASSERT: joiner still unseated at
#      +150, seated correctly in row 0 by +400.
#
# Usage: test/sim/repro-headless-row.sh
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-repro}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
fail=0

# ---- leg A: 2p graceful, FIND races the LEAVE -> permanent column-mates ----
outA=$(run "seed 1" "init 2 0" "converge 6000" "spawn 1" "tick 10" "killat /0.0" "tick 600" "where 2" "state")
wA=$(grep '^WHERE 2' <<<"$outA"); sA=$(grep '^STATE' <<<"$outA")
echo "A) 2p LEAVE @spawn+10:   $wA"
echo "                         $sA"
if grep -Eq 'state=3 coord=/0\.[0-9]' <<<"$wA" && grep -q 'seated=2 s1cells=2/2 dups=0' <<<"$sA"
then echo "   A PASS (joiner is a row-mate)"
else echo "   A FAIL — joiner is NOT in row 0 (column-mates / not settled): headless-row admission gap"; fail=1; fi

# ---- leg B: 3p graceful, FIND inside the heal window -> seats DEEP ----
outB=$(run "seed 6" "init 3 0" "converge 6000" "spawn 1" "tick 8" "killat /0.0" "tick 12" "where 3" "tick 48" "where 3" "state")
wB1=$(grep '^WHERE 3' <<<"$outB" | head -1); wB2=$(grep '^WHERE 3' <<<"$outB" | tail -1); sB=$(grep '^STATE' <<<"$outB")
echo "B) 3p LEAVE @spawn+8:    at +20: $wB1"
echo "                         at +68: $wB2"
echo "                         $sB"
if grep -Eq 'state=3 coord=/0\.[0-9]' <<<"$wB2"
then echo "   B PASS (joiner is in the home row within 60 ticks)"
else echo "   B FAIL — joiner seated DEEP under the survivor (home scan fell through): headless-row admission gap"; fail=1; fi

# ---- leg C: 2p SILENT death (control: conservatism must be preserved) ----
outC=$(run "seed 1" "init 2 0" "converge 6000" "spawn 1" "tick 10" "killat /0.0 silent" "tick 150" "bad" "tick 250" "where 2" "state")
bC=$(grep '^BAD' <<<"$outC"); wC=$(grep '^WHERE 2' <<<"$outC"); sC=$(grep '^STATE' <<<"$outC")
echo "C) 2p SILENT @spawn+10:  at +150: $bC"
echo "                         at +400: $wC"
echo "                         $sC"
okC=1
grep -q 'BAD unseated=1' <<<"$bC" || { echo "   C FAIL — silent death was fast-tracked past the H1-S1 ring-hold (severance-immunity broken)"; okC=0; }
{ grep -Eq 'state=3 coord=/0\.[0-9]' <<<"$wC" && grep -q 'seated=2 s1cells=2/2 dups=0' <<<"$sC"; } || { echo "   C FAIL — joiner did not settle correctly after the ring-hold"; okC=0; }
[ "$okC" -eq 1 ] && echo "   C PASS (silent death stays ring-hold-conservative, then settles in row 0)"
[ "$okC" -eq 0 ] && fail=1

echo "----"
if [ "$fail" -eq 0 ]; then echo "REPRO GREEN (gap closed)"; exit 0
else echo "REPRO RED (headless-row admission gap present)"; exit 1; fi
