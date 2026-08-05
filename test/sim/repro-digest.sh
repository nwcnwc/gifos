#!/usr/bin/env bash
# repro-digest.sh — the V1 ROLLUP DIGEST gate (docs/healing-laws.md § G).
#
# The digest exists to kill the O(N)-per-node status flood (scale-audit V1) by
# folding the room along the tree that already exists: every seat publishes ONE
# digest to its aggregator each pulse period and receives at most C, the C^2
# Section-1 seats fold the room between themselves, and the fold rides back down.
# Nothing new is routed — the payload rides PHONE (up), its PONG (down) and
# S1SYNC (the Section-1 table).
#
# SIM-ONLY BY DESIGN. site/js/mesh.js does NOT have this yet; the twins diverge
# here on purpose until these gates are green at scale AND small-room e2e is
# byte-identical (scale-audit sequencing step 4). Do not "fix" the divergence.
#
# THE LEGS, each pinned to the law it guards:
#   1) TRUTH        — root n converges to the TRUE seated count at EVERY
#                     observer, at N=300..2000 det, and RE-converges after a 20%
#                     churn inside the staleness bound O(depth x period).
#   2) REFUSALS     — G3: refusal counts propagate exactly and unanimously; a
#                     loss BLURS (partial/refuse rise) and then clears. The
#                     failure direction is always toward more blur.
#   3) O(C) GAUGES  — the V1 law itself: frames per node per tick and peak
#                     per-node digest state must be FLAT in N, at N=300 vs
#                     N=2000, under churn. A number that grows with N is the
#                     flood.
#   4) NEVER EVICT  — G0/G1: digests ON vs OFF is TRAJECTORY-IDENTICAL (same
#                     converge ticks, moves, evictions) across join, a targeted
#                     kill and the heal. A killed seat's eviction comes from the
#                     existing laws, not from digest divergence. If the digest
#                     ever actuated anything, this equality breaks.
#   5) LYING AGGR.  — G4: a suppressing aggregator is refuted by EXACTLY the
#                     structurally-designated checkers (its down-child and the
#                     row-mates whose contribution it altered) and by nobody
#                     else; its corruption is CONFINED to its own subtree; and
#                     G5 holds — nothing is evicted, CHECK still passes.
#
# Usage: test/sim/repro-digest.sh          (auto-gated by the release battery's
#                                           test/sim/repro-*.sh glob)
set -u
cd "$(dirname "$0")/../.."
BIN="${BIN:-/tmp/gifos-mesh-digest}"

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 1; }

run(){ printf '%s\n' "$@" "quit" | "$BIN" --service --det 2>&1; }
fld(){ sed -nE "s/.* $2=(-?[0-9.]+).*/\1/p" <<<"$1" | tail -1; }
pass=0; fail=0
ok(){   pass=$((pass+1)); echo "PASS  $1"; }
bad(){  fail=$((fail+1)); echo "FAIL  $1"; }
chk(){  if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 — expected $3, got $2"; fi; }

# ---------------------------------------------------------------------------
echo
echo "=== 1) TRUTH — the root fold equals the room, at every observer ==="
# Section 1 alone (N=20, one-level tree) through a deep multi-section room. The
# small end is G8's "small rooms degrade to today": rollup and flood coincide.
for N in 20 300 2000; do
  out=$(run "det on" "seed 3" "init $N 0" "converge 60000" "tick 400" "digest" "check")
  d=$(grep '^DIGEST' <<<"$out"); c=$(grep '^CHECK' <<<"$out")
  true_=$(fld "$d" true); rmin=$(fld "$d" rootMin); rmax=$(fld "$d" rootMax)
  exact=$(fld "$d" rootExact); obs=$(fld "$d" obs); noroot=$(fld "$d" noroot)
  part=$(fld "$d" partial); mism=$(fld "$d" mismatch)
  grep -q 'CHECK PASS' <<<"$c" && ok "N=$N mesh converged" || bad "N=$N mesh: $c"
  chk "N=$N every seat holds a root digest" "$noroot" "0"
  chk "N=$N root n == true seated ($true_) at ALL $obs observers" "$exact" "$obs"
  chk "N=$N observers UNANIMOUS (min==max)" "$rmin" "$rmax"
  chk "N=$N settled fold is complete (partial=0)" "$part" "0"
  chk "N=$N no refutations in an honest room" "$mism" "0"
done

echo
echo "--- staleness bound: RE-convergence after a 20% churn ---"
# The bound is O(depth x period): up-leg + down-leg, ~8 ticks a level, and the
# tree a storm leaves is deep (maxDepth 12 measured). 400 ticks is well inside
# it and well outside the noise; the mesh's OWN heal is completed first
# (converge + CHECK) so this measures the DIGEST's lag, not the mesh's.
out=$(run "det on" "seed 3" "init 2000 0" "converge 60000" "kill 0.2" "converge 60000" \
          "check" "tick 400" "digest")
d=$(grep '^DIGEST' <<<"$out")
grep -q 'CHECK PASS' <<<"$(grep '^CHECK' <<<"$out")" && ok "post-churn mesh healed" || bad "post-churn mesh: $(grep '^CHECK' <<<"$out")"
chk "post-churn root n == true at ALL observers" "$(fld "$d" rootExact)" "$(fld "$d" obs)"
chk "post-churn fold complete again (partial=0)" "$(fld "$d" partial)" "0"
chk "post-churn no refutations" "$(fld "$d" mismatch)" "0"

# ---------------------------------------------------------------------------
echo
echo "=== 2) REFUSALS — G3: exact, unanimous, and failing toward BLUR ==="
out=$(run "det on" "seed 3" "init 600 0" "converge 60000" "refuse frac 0.10" "tick 400" "digest" \
          "refuse all 1" "tick 400" "digest" "refuse all 0" "tick 400" "digest")
mapfile -t dl < <(grep '^DIGEST' <<<"$out")
tr1=$(fld "${dl[0]}" trueRefuse); rn1=$(fld "${dl[0]}" refuseMin); rx1=$(fld "${dl[0]}" refuseMax)
[ "$tr1" -gt 0 ] && ok "some seats refuse ($tr1)" || bad "refuse frac set nothing"
chk "partial refusal propagates EXACTLY" "$rn1" "$tr1"
chk "…and unanimously (min==max)" "$rn1" "$rx1"
chk "unanimous refusal == n" "$(fld "${dl[1]}" refuseMin)" "$(fld "${dl[1]}" true)"
chk "…unanimously" "$(fld "${dl[1]}" refuseMin)" "$(fld "${dl[1]}" refuseMax)"
chk "consent restored -> refuse 0" "$(fld "${dl[2]}" refuseMax)" "0"

echo
echo "--- a LOSS blurs, then clears (the fail-safe direction) ---"
# A mass silent kill: the fold must go PARTIAL (=> blurred badge) while the room
# does not know what happened, and recover once the heal completes. Blur-then-
# clear is the whole of G3; a loss that read as consent would be the bug.
# The blur is a TRANSIENT, so sample the whole window rather than one instant —
# pinning a single tick would make this leg a timing coin-flip the first time an
# unrelated horizon moves. The claim is "somewhere in the loss the room blurs,
# and refusals NEVER fall below the truth anywhere in it".
out=$(run "det on" "seed 4" "init 600 0" "converge 60000" "tick 200" "digest" \
          "kill 0.2 silent" \
          "tick 20" "digest" "tick 20" "digest" "tick 20" "digest" \
          "tick 40" "digest" "tick 40" "digest" "tick 60" "digest" \
          "converge 60000" "tick 400" "digest" "check")
mapfile -t dl < <(grep '^DIGEST' <<<"$out")
last=$(( ${#dl[@]} - 1 ))
chk "before the kill: nothing partial" "$(fld "${dl[0]}" partial)" "0"
maxPart=0; dropped=0
for i in $(seq 1 $((last-1))); do
  p=$(fld "${dl[$i]}" partial); r=$(fld "${dl[$i]}" refuseMin); t=$(fld "${dl[$i]}" trueRefuse)
  [ "$p" -gt "$maxPart" ] && maxPart=$p
  [ "$r" -lt "$t" ] && dropped=$((dropped+1))
done
[ "$maxPart" -gt 0 ] && ok "during the loss the fold goes PARTIAL (peak $maxPart observers blurred)" \
                     || bad "a silent mass death never blurred the room"
chk "refusals NEVER fell below the truth anywhere in the loss" "$dropped" "0"
chk "after the heal the blur clears" "$(fld "${dl[$last]}" partial)" "0"
chk "…and the count is true again" "$(fld "${dl[$last]}" rootExact)" "$(fld "${dl[$last]}" obs)"
grep -q 'CHECK PASS' <<<"$(grep '^CHECK' <<<"$out")" && ok "mesh healthy after the silent kill" || bad "mesh: $(grep '^CHECK' <<<"$out")"

# ---------------------------------------------------------------------------
echo
echo "=== 3) O(C) GAUGES — flat in N, under churn (the V1 law itself) ==="
# The bound that matters is N-INDEPENDENCE, so this is a RATIO test between a
# small room and a 6.7x larger one, plus absolute C-derived caps. Digest state
# is bounded by C^2+2C+4 (the Section-1 table plus a child row plus a handful of
# scalars) and never sees N at all. framesPerTick is EVERY frame a node
# receives, not just digests — the honest subject of the V1 law — so its
# residual drift is the mesh's own O(log N) routing transit, not the rollup;
# ON/OFF identity (leg 4) proves the digest adds none of it.
gauge(){  # N -> "max p50 dstate bound"
  local out; out=$(run "det on" "seed 3" "init $1 0" "converge 60000" "refuse frac 0.05" \
                       "kill 0.1" "converge 60000" "digest reset" "tick 400" "digest")
  local g; g=$(grep '^DIGGAUGE' <<<"$out")
  echo "$(fld "$g" framesPerTick_max) $(fld "$g" framesPerTick_p50) $(fld "$g" digState_max) $(fld "$g" bound)"
}
read -r sMax sP50 sD sB <<<"$(gauge 300)"
read -r bMax bP50 bD bB <<<"$(gauge 2000)"
echo "  N=300  frames/node/tick max=$sMax p50=$sP50  digState=$sD"
echo "  N=2000 frames/node/tick max=$bMax p50=$bP50  digState=$bD  (bound $bB)"
awk -v a="$sMax" -v b="$bMax" 'BEGIN{exit !(b <= a*2.0)}' \
  && ok "frames/node/tick MAX is flat in N (${sMax} -> ${bMax} over 6.7x N; O(N) would be 6.7x)" \
  || bad "frames/node/tick max grew with N: $sMax -> $bMax"
awk -v a="$sP50" -v b="$bP50" 'BEGIN{exit !(b <= a*2.0)}' \
  && ok "frames/node/tick p50 is flat in N (${sP50} -> ${bP50})" \
  || bad "frames/node/tick p50 grew with N: $sP50 -> $bP50"
[ "$bD" -le "$bB" ] && ok "peak digest state $bD <= the C-derived bound $bB" \
                    || bad "digest state $bD exceeded its bound $bB"
chk "digest state does not see N at all" "$bD" "$sD"

# ---------------------------------------------------------------------------
echo
echo "=== 4) NEVER EVICT — G0/G1 trajectory identity, digests ON vs OFF ==="
# The strongest statement available: the rollup adds no frame, no timer and no
# decision, so the seating trajectory must be IDENTICAL. Any divergence means
# something in the digest actuated — which is the one thing § G forbids. The
# scenario includes a TARGETED kill so the leg also answers the "did a digest
# ever evict?" question directly: the heal that follows must be the same heal.
traj(){ run "digeston $1" "det on" "seed $2" "init 600 0" "converge 60000" "state" \
            "killat /0.0" "killat /1.0" "kill 0.15" "converge 60000" "state" "check" "dups" \
        | grep -E '^STATE|^CHECK|^DUPS' | sed 's/inflight=[0-9]*//'; }
for sd in 7 11; do
  A=$(traj 1 $sd); B=$(traj 0 $sd)
  if [ "$A" = "$B" ]; then ok "seed $sd: digests ON == OFF, tick-for-tick through join+kill+heal"
  else bad "seed $sd: digests CHANGED the trajectory"; diff <(echo "$A") <(echo "$B") | head -8; fi
  grep -q 'CHECK PASS' <<<"$A" || bad "seed $sd: mesh not healthy after the targeted kills"
done

# ---------------------------------------------------------------------------
echo
echo "=== 5) THE LYING AGGREGATOR — G4/G5 ==="
# `lie <coord> 1` publishes folds AND echoes with the refusals stripped: the
# strongest suppressor, and the ONE dangerous direction (deflating refusals can
# unblur a room). What must hold:
#   - it is REFUTED, and only by the structurally-designated checkers: its
#     DOWN-CHILD (already its C3-designated healer, and the sole author of its
#     subtree claim's only input) and the ROW-MATES whose own contribution it
#     altered. No votes, no bystanders.
#   - the corruption is CONFINED to its own subtree.
#   - G5: nothing is evicted. CHECK still passes, dups stay 0.
LIAR=1/0.0
out=$(MESH_DIGLOG=1 run "det on" "seed 1" "init 600 0" "converge 60000" "refuse frac 0.10" \
          "tick 400" "digest" "digest reset" "lie $LIAR 1" "tick 400" "digest" "check" "dups")
mapfile -t dl < <(grep '^DIGEST' <<<"$out")
honest=$(fld "${dl[0]}" refuseMax); lied=$(fld "${dl[1]}" refuseMax); truth=$(fld "${dl[1]}" trueRefuse)
lieCoord=$(sed -nE 's/^OK lie .*coord=([^ ]+).*/\1/p' <<<"$out")
echo "  liar at $lieCoord: room-wide refusals $honest (honest) -> $lied (lied), truth $truth"
chk "the honest fold was exact" "$honest" "$truth"
[ "$lied" -lt "$truth" ] && ok "the suppression LANDS (that is why it needs a checker)" \
                         || bad "the adversary knob did nothing — the leg proves nothing"
mism=$(fld "${dl[1]}" mismatch)
[ "$mism" -gt 0 ] && ok "the lie is REFUTED ($mism refutations raised)" \
                  || bad "a suppressing aggregator went unrefuted — G4 is not holding"
# Every refuter must be a designated checker of the aggregator it accuses.
# aggregator (P,R,I); legal refuters: same section+row with i>0 (a row-mate), or
# the down-child cell of (P,R,I), which is section childPath(P,I) row R col 0.
badref=$(grep '^DIGMISMATCH' <<<"$out" | sed -nE 's/.*me=[0-9]+\(([0-9]+)\/([0-9]+)\.([0-9]+)\).*aggregator=[0-9]+\(([0-9]+)\/([0-9]+)\.([0-9]+)\).*/\1 \2 \3 \4 \5 \6/p' \
  | awk '{ mp=$1; mr=$2; mi=$3; ap=$4; ar=$5; ai=$6;
           rowmate = (mp==ap && mr==ar && mi>0 && ai==0);
           downkid = (mp==ap*6+ai+1 && mr==ar && mi==0);
           if(!rowmate && !downkid) print }' | sort -u)
if [ -z "$badref" ]; then ok "every refuter is a DESIGNATED checker (row-mate or down-child) — no votes, no bystanders"
else bad "a non-designated seat refuted:"; echo "$badref" | head -5; fi
nref=$(grep -c '^DIGMISMATCH' <<<"$out")
naccused=$(grep '^DIGMISMATCH' <<<"$out" | sed -nE 's/.*aggregator=([0-9]+).*/\1/p' | sort -u | wc -l)
chk "exactly ONE aggregator is accused (the liar)" "$naccused" "1"
echo "  ($nref refutation frames from $(grep '^DIGMISMATCH' <<<"$out" | sed -nE 's/.*me=([0-9]+).*/\1/p' | sort -u | wc -l) distinct victims)"
grep -q 'CHECK PASS' <<<"$(grep '^CHECK' <<<"$out")" \
  && ok "G5: the lie evicted NOTHING — mesh still fully seated, s1=25, dups=0" \
  || bad "the lying aggregator changed the seating: $(grep '^CHECK' <<<"$out")"
chk "…and no duplicate cells" "$(grep '^DUPS' <<<"$out" | awk '{print $2}')" "0"

# ---------------------------------------------------------------------------
echo
echo "=================================================================="
echo "repro-digest: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
