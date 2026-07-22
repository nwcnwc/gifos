#!/usr/bin/env bash
# repro-loss-wedge.sh — pin the ~10% packet-loss admission wedge
# (docs/handoff-2026-07-21.md § Loss wedge design — LOCKED).
#
# Under net loss=0.10, a PLACE can be lost after the admitter already wrote the
# cell as taken → permanent ghost → room stuck well below N. Healthy bursts
# must not regress once three-state sitting-down/seated lands.
#
# Usage: test/sim/repro-loss-wedge.sh
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-loss}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
fail=0

echo "=== A) control: healthy burst N=60 converges (no loss) ==="
outA=$(run "seed 1" "joinmode burst" "init 60 0" "converge 80000" "state" "bad")
sA=$(grep '^STATE' <<<"$outA"); bA=$(grep '^BAD' <<<"$outA" || true)
echo "   $sA"
echo "   $bA"
if grep -qE 'seated=60' <<<"$sA" && grep -q 'dups=0' <<<"$sA" && ! grep -qE 'stranded=[1-9]' <<<"$sA"
then echo "   A PASS"
else echo "   A FAIL — healthy burst must stay green"; fail=1; fi

echo "=== B) loss=0.10 burst N=60 — document the wedge (pre-fix) ==="
# Until three-state lands this may FAIL (phantom + forever-searching). The
# gate becomes: seated near 60, dups=0, no permanent searchers.
outB=$(run "seed 1" "net loss=0.10" "joinmode burst" "init 60 0" "converge 400000" "state" "bad" "seat 0" "seat 6")
sB=$(grep '^STATE' <<<"$outB"); bB=$(grep '^BAD' <<<"$outB" || true)
seat0=$(grep '^SEAT 0' <<<"$outB" || true); seat6=$(grep '^SEAT 6' <<<"$outB" || true)
echo "   $sB"
echo "   $bB"
echo "   $seat0"
echo "   $seat6"
seated=$(grep -oE 'seated=[0-9]+' <<<"$sB" | head -1 | cut -d= -f2)
if [ "${seated:-0}" -ge 55 ] && grep -q 'dups=0' <<<"$sB" && ! grep -qE 'stranded=[1-9]' <<<"$sB"
then echo "   B PASS (loss-tolerant seating ≥55/60 — three-state soft sit)"
else
  echo "   B FAIL — loss wedge still present (seated=${seated:-?} want ≥55)"
  fail=1
fi

echo "=== C) healthy burst N=100 still converges (no loss) ==="
outC=$(run "seed 2" "joinmode burst" "init 100 0" "converge 120000" "state")
sC=$(grep '^STATE' <<<"$outC")
echo "   $sC"
if grep -qE 'seated=100' <<<"$sC" && grep -q 'dups=0' <<<"$sC"
then echo "   C PASS"
else echo "   C FAIL — N=100 healthy burst regression"; fail=1; fi

echo "----"
if [ "$fail" -eq 0 ]; then echo "LOSS-WEDGE GREEN (three-state soft sit)"; exit 0
else echo "LOSS-WEDGE RED"; exit 1; fi
