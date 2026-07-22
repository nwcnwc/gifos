#!/usr/bin/env bash
# c-sweep.sh — the multi-section confidence battery.
#
# At the production C=5 a full Section 1 is 25 seats, so a room needs >25 people
# to grow a SECOND section — out of reach for a cheap run. This battery rebuilds
# the sim at C in {2,3,4,5} (via -DGIFOS_C) and, at each C, drives rooms big
# enough to form DEEP multi-section trees, checking the invariants that must
# hold no matter how the tree branches: everyone seated, ZERO duplicate cells,
# zero stranded, a full Section 1, and — under a partition — no split-brain.
#
# The point: C=2/3/4 exercise cross-section seating, healing, compaction and
# partition with a handful of seats, which C=5 only reaches at large N. If the
# laws hold across C=2..5, confidence that they hold at C>=5 too goes up.
#
# Not a per-commit gate (it rebuilds the sim 4×). Run it when touching the
# control plane's cross-section behaviour, or to re-establish the multi-section
# confidence claim. Sim-only; fast (seconds per C).
#
# Usage: test/batteries/c-sweep.sh            # C = 2 3 4 5
#        CSWEEP_CVALUES="2 3" test/batteries/c-sweep.sh
set -u
cd "$(dirname "$0")/../.."
CVALUES="${CSWEEP_CVALUES:-2 3 4 5}"
SEEDS="${CSWEEP_SEEDS:-1 2 3 4 5}"
# STRICT at every C. The first run of this sweep found split-brain at C=2 and
# C=3 — a burst race seated a duplicate into an already-taken Section-1 cell,
# landing isolated (no links) so E2 could never yield it. That is now fixed:
# an isolated S1 fragment uses its relay re-knock to detect it is split off and
# requeue (the "E3 life-saver exception", commit 2e7aa18 / docs/healing-laws.md
# § split-off fragment). So the invariants hold at ALL of C=2..5 and any dup at
# any C is a real regression. Keeping the low C values in the sweep is the whole
# point: they exercise the sparse-rook regime where that bug lived, at trivial N.
fail=0

# N sized to ~10x a section (C*C) so the tree is several sections deep, capped
# so runtimes stay trivial. field <line> <key> pulls a COMPACT/STATE number.
field(){ sed -n "s/.*$2=\([0-9]*\).*/\1/p" <<<"$1"; }

for C in $CVALUES; do
  BIN="/tmp/gifos-mesh-c$C"
  echo "═══════════════════════════════════════════════════════════"
  echo "  C=$C   (section = ${C}x${C} = $((C*C)) seats)"
  echo "═══════════════════════════════════════════════════════════"
  g++ -O2 -std=c++17 -DGIFOS_C=$C -o "$BIN" test/sim/mesh.cpp || { echo "  BUILD FAILED at C=$C"; fail=1; continue; }
  SEC=$((C*C)); N=$((SEC*10)); [ "$N" -gt 300 ] && N=300; [ "$N" -lt 20 ] && N=20
  run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
  cok(){ grep -q 'CHECK PASS' <<<"$1" && ! grep -qE 'dups=[1-9]|stranded=[1-9]' <<<"$1"; }
  cP=0; cF=0
  leg(){ if [ "$2" = 1 ]; then echo "   PASS — $1"; cP=$((cP+1));
    else echo "   FAIL — $1${3:+  ($3)}"; cF=$((cF+1)); fail=1; fi; }

  # --- 1) ARRIVAL PATTERNS: every shape converges to a clean multi-section tree
  for jm in burst serial batch window; do
    out=$(run "joinmode $jm" "seed 3" "init $N 0" "converge 400000" "state" "check")
    st=$(grep '^CHECK' <<<"$out" | tail -1)
    ok=0; grep -q 'CHECK PASS' <<<"$st" && grep -qE "s1=$SEC " <<<"$st" && ! grep -qE 'dups=[1-9]|stranded=[1-9]' <<<"$out" && ok=1
    leg "arrival $jm N=$N → seated, s1=$SEC, dups=0, stranded=0" $ok "$st"
  done

  # --- 2) DEPTH: confirm we are genuinely testing a multi-section tree
  outd=$(run "joinmode burst" "seed 3" "init $N 0" "converge 400000" "compact")
  cl=$(grep '^COMPACT' <<<"$outd" | tail -1)
  md=$(field "$cl" maxDepth); os=$(field "$cl" occSections)
  leg "tree is multi-section (maxDepth=${md:-?} occSections=${os:-?})" "$([ "${md:-0}" -ge 2 ] && [ "${os:-0}" -ge 2 ] && echo 1 || echo 0)" "$cl"

  # --- 3) MASS-KILL + HEAL: kill 40%, the survivors re-form a clean tree
  for s in $SEEDS; do
    out=$(run "seed $s" "joinmode burst" "init $N 0" "converge 400000" "kill 0.4" "tick 40000" "state" "bad" "check")
    leg "mass-kill 40% + heal (seed $s)" "$([ "$(cok "$out" && echo 1)" ] && echo 1 || echo 0)" "$(grep '^CHECK' <<<"$out" | tail -1)"
  done

  # --- 4) CHURN MATRIX: repeated kills at several fractions, no dup ever
  for k in 0.15 0.30 0.45; do for s in $SEEDS; do
    out=$(run "seed $s" "joinmode burst" "init $N 0" "converge 400000" \
          "kill $k" "converge 40000" "kill $k" "converge 40000" "tick 20000" "state" "check")
    cok "$out" || { leg "churn kill=$k×2 (seed $s)" 0 "$(grep '^CHECK' <<<"$out" | tail -1)"; continue 2; }
  done; leg "churn kill=$k×2 (all seeds clean)" 1; done

  # --- 5) PARTITION: total split — the HARD invariant is no split-brain (dups=0)
  for s in $SEEDS; do
    out=$(run "seed $s" "joinmode burst" "init $((N>200?200:N)) 0" "converge 400000" "split 0.5" "tick 60000" "splitstate")
    line=$(grep '^SPLITSTATE' <<<"$out" | tail -1)
    leg "partition split 0.5: no split-brain (seed $s)" "$(grep -qE 'dups=[1-9]' <<<"$line" && echo 0 || echo 1)" "$line"
  done

  # --- 6) COMPACTION: gradual shrink — correctness (dups=0, all seated) holds
  outc=$(run "seed 2" "init $N 0" "converge 400000" "kill 0.15" "converge 40000" "kill 0.15" "converge 40000" "tick 40000" "compact" "check")
  leg "compaction under shrink: correct (dups=0, all seated)" "$([ "$(cok "$outc" && echo 1)" ] && echo 1 || echo 0)" "$(grep '^CHECK' <<<"$outc" | tail -1)"

  echo "   ---- C=$C: $cP passed, $cF failed ----"
done

echo "═══════════════════════════════════════════════════════════"
[ "$fail" -eq 0 ] && { echo "  C-SWEEP GREEN — every invariant holds across C=$CVALUES"; exit 0; }
echo "  C-SWEEP RED — an invariant regressed (a dup at low C = the split-off"
echo "  fragment bug is back; see docs/healing-laws.md § split-off fragment)"; exit 1
