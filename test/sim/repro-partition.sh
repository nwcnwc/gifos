#!/usr/bin/env bash
# repro-partition.sh — a TOTAL PARTITION leaves neither half frozen.
#
# Promoted out of test/batteries/known-unfixed.sh on 2026-09-17, the day its
# 20-seed measurement went 20/20 clean (it read 2/20 frozen when the freeze
# was accepted on 2026-07-21, and 18/20 clean in healing-laws § Partition).
# The mechanism it guards against: the half confirms the far side dead and
# erases those occ entries; a home row is left with no live member; H7's
# dense-fill gate then refuses every later row and every seeker is NOROOM'd
# forever. Whatever closed it (the V4 admission-evidence waves and the
# devolution narrowing are the candidates — nobody flipped a switch for this),
# it must stay closed: both halves seat everyone they have, with ZERO
# duplicate seats (no split-brain — that half was always a real invariant,
# asserted in sweep.sh as well).
#
# Usage: test/sim/repro-partition.sh            # seeds 1..20
#        PARTITION_SEEDS="1 2 3" test/sim/repro-partition.sh
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-partition}"
SEEDS="${PARTITION_SEEDS:-$(seq 1 20)}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

frozen=0; dups=0; n=0
for s in $SEEDS; do
  n=$((n+1))
  line=$(printf "seed %s\ninit 400 0\nconverge\nsplit 0.5\ntick 40000\nsplitstate\nquit\n" "$s" | "$BIN" --service 2>&1 | grep "SPLITSTATE")
  echo "   seed=$s $line"
  grep -Eq "strand=[1-9]" <<<"$line" && { frozen=$((frozen+1)); echo "   FAIL: a half froze (seed $s)"; }
  grep -Eq "dups=[1-9]" <<<"$line" && { dups=$((dups+1)); echo "   FAIL: SPLIT-BRAIN (seed $s)"; }
done
echo "----"
echo "   $n seeds: frozen halves=$frozen, split-brain=$dups"
if [ "$frozen" -eq 0 ] && [ "$dups" -eq 0 ]; then echo "PARTITION GREEN"; exit 0
else echo "PARTITION RED"; exit 1; fi
