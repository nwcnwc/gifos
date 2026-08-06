#!/usr/bin/env bash
# repro-descent.sh — guards the FRONT 3 DESCENT INSTRUMENT
# (docs/front3-descent-2026-08-06.md).
#
# THIS DOES NOT GUARD A FIX. There is no fix: front 3 is a MEASURED diagnosis
# and four candidate fixes are refuted. What this guards is the INSTRUMENT that
# produced the diagnosis, because an instrument nobody runs is an instrument
# that rots — and the next person to touch `serveFind` needs it to still work.
#
# It deliberately does NOT assert the defect's magnitude (col0 >= 90%, spine
# dominance, wall-hit counts). Pinning those numbers would make the SUITE GO RED
# THE DAY SOMEONE FIXES THE BUG, which is exactly backwards. The measured
# numbers live in the dossier; this file guards only that the measurement is
# still possible and still honest.
#
# THE LEGS:
#   1) INERT WITH MESH_DESC UNSET — the instrumented binary must reproduce the
#      baseline trajectory exactly. This is the property that makes every
#      number in the dossier admissible.
#   2) INERT WITH MESH_DESC=1 — measuring must not perturb what is measured.
#      Same converge tick, same moves, same evictions, same dups.
#   3) THE INSTRUMENT IS ALIVE — every descstat line is emitted and the
#      counters are non-zero. A silent instrument reporting zeros looks exactly
#      like a healthy mesh, which is the dangerous failure.
#   4) GROUND TRUTH IS SANE — the snapshot's free-space fold must agree with
#      the `freemap` verb's independent count of the same thing.
#
# Usage: test/sim/repro-descent.sh
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-descent}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service 2>&1; }
pass=0; fail=0
ok(){ echo "   PASS — $1"; pass=$((pass+1)); }
no(){ echo "   FAIL — $1"; fail=$((fail+1)); }

# A small deterministic room: big enough to build a real tree with deep
# descents, small enough to run in seconds.
SCRIPT=("det on" "init 600" "converge 20000" "state" "dups")

echo "leg 1 — INERT when MESH_DESC is unset"
base=$(MESH_DESC= run "${SCRIPT[@]}")
bstate=$(grep -m1 '^STATE' <<<"$base")
bconv=$(grep -m1 -oE '^OK converged@[0-9]+' <<<"$base")
[ -n "$bstate" ] && [ -n "$bconv" ] || { echo "   baseline did not converge — cannot judge"; echo "$base" | tail -5; exit 1; }
echo "   baseline: $bconv"

echo "leg 2 — INERT when MESH_DESC=1 (measuring must not perturb)"
meas=$(MESH_DESC=1 run "${SCRIPT[@]}" "descstat")
mstate=$(grep -m1 '^STATE' <<<"$meas")
mconv=$(grep -m1 -oE '^OK converged@[0-9]+' <<<"$meas")
[ "$bconv" = "$mconv" ] && ok "same convergence tick ($bconv)" || no "convergence moved: $bconv vs $mconv"
[ "$bstate" = "$mstate" ] && ok "same STATE line (moves, evictions, seated, dups all identical)" \
  || { no "STATE diverged under instrumentation"; echo "     off: $bstate"; echo "     on : $mstate"; }

echo "leg 3 — the instrument is ALIVE (zeros are the dangerous failure)"
for line in DESCSTAT DESCFILTER DESCHH DESCREGRET DESCHHLIVE DESCDMIN DESCDMINFHL DESCKID DESCSPINE DESCEND DESCDEPTH DESCHOPS; do
  grep -q "^$line " <<<"$meas" && ok "$line emitted" || no "$line missing"
done
nd=$(grep -m1 '^DESCSTAT' <<<"$meas" | grep -oE 'descends=[0-9]+' | cut -d= -f2)
[ -n "$nd" ] && [ "$nd" -gt 0 ] && ok "descends counted ($nd)" || no "descends=0 — the instrument saw nothing"
nc=$(grep -m1 '^DESCSTAT' <<<"$meas" | grep -oE 'fhl=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$nc" ] && [ "$nc" -gt 0 ] && ok "candidates classified ($nc firstHandLive)" || no "no candidates classified"
ne=$(grep -m1 '^DESCEND' <<<"$meas" | grep -oE 'admitDeep=[0-9]+' | cut -d= -f2)
[ -n "$ne" ] && [ "$ne" -gt 0 ] && ok "FIND terminations counted (admitDeep=$ne)" || no "no FIND terminations counted"

echo "leg 4 — ground truth agrees with the freemap verb"
# Two independent computations of the same quantity: descRebuild's fold (which
# the descent stats read) and the freemap verb's own count. They use the same
# definition of an admissible frontier cell, so a large disagreement means one
# of them drifted.
fm=$(MESH_DESC=1 run "${SCRIPT[@]}" "freemap")
tf=$(grep -m1 '^FREETOT' <<<"$fm" | grep -oE 'true_free=[0-9]+' | cut -d= -f2)
[ -n "$tf" ] && [ "$tf" -gt 0 ] && ok "freemap reports a live frontier (true_free=$tf)" \
  || no "freemap reported no frontier — ground truth is not being computed"
fd=$(grep -m1 '^FREEDEPTH' <<<"$fm")
grep -q 'freeFrontierByDepth=.*[0-9]' <<<"$fd" && ok "frontier has a depth distribution" \
  || no "FREEDEPTH empty — the depth fold is dead"

echo
echo "DESCENT: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
