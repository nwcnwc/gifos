#!/usr/bin/env bash
# known-unfixed.sh — THE GRAVEYARD. Every check in here is EXPECTED TO FAIL.
#
# These are behaviours we looked at, understood, and DECIDED NOT TO FIX — because
# the fix is too hard, not worth the cost, or would require changing a rule we
# want to keep. They are NOT flakes, NOT environment problems, and NOT unknowns:
# each entry below records what breaks, why we walked away, and what a fix would
# actually cost.
#
# This script is NOT a gate. Nothing runs it in CI, and no battery calls it.
# Run it for exactly one reason: WE CHANGED OUR MIND and want to try again.
#
#   test/batteries/known-unfixed.sh            # sim entries (fast, no browsers)
#   test/batteries/known-unfixed.sh --browsers # + the browser entries (slow)
#
# RED is the expected, correct outcome. A GREEN entry is the interesting event:
# it means someone fixed it, on purpose or by accident. When that happens,
# promote the check back into its real gate and delete the entry from here.
#
# Do NOT "fix" a red here by softening the assertion. Either fix the product or
# leave it red.
set -u
cd "$(dirname "$0")/../.."
BROWSERS=0; [ "${1:-}" = "--browsers" ] && BROWSERS=1
BIN="${BIN:-/tmp/gifos-mesh-known}"
still=0; fixed=0

hdr(){ printf '\n═══ %s\n' "$1"; }
why(){ printf '    why unfixed: %s\n' "$1"; }
cost(){ printf '    a fix costs: %s\n' "$1"; }
red(){ printf '  RED  (expected) — %s\n' "$1"; still=$((still+1)); }
green(){ printf '  GREEN (!!) — %s\n' "$1"; fixed=$((fixed+1)); }

echo "building sim -> $BIN"
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || { echo "BUILD FAILED"; exit 2; }

# ---------------------------------------------------------------- partition --
hdr "A PARTITIONED HALF MAY FREEZE  (decided: Nathan, 2026-07-21)"
why "a total partition is rare and the room recovers when the network heals"
cost "either let the scan skip a confirmed-dead unfillable cell — which costs
                 row density, and the media near-field is row-scoped — or let another seat
                 admit into a memberless row, which reintroduces a healer race (\"don't
                 devolve\"). Both rejected. See docs/healing-laws.md § Partition."
echo "    what breaks: the half confirms the far side dead and erases those occ"
echo "                 entries; a home row is left with NO live member, so nobody can"
echo "                 admit into it; H7's dense-fill gate then refuses to open any"
echo "                 later row, and every remaining seeker gets NOROOM forever."
echo "    NOTE: no-split-brain (dups=0) is a REAL invariant and is asserted in"
echo "          test/sim/sweep.sh, which must stay green. Only the FREEZE lives here."
echo "    measuring across 20 seeds (the 3 seeds pinned in sweep.sh pass on luck) ..."
frozen=0; dups=0
for s in $(seq 1 20); do
  line=$(printf "seed %s\ninit 400 0\nconverge\nsplit 0.5\ntick 40000\nsplitstate\nquit\n" "$s" \
          | "$BIN" --service 2>&1 | grep "SPLITSTATE")
  grep -Eq "strand=[1-9]" <<<"$line" && { frozen=$((frozen+1)); echo "      seed=$s FROZEN $line"; }
  grep -Eq "dups=[1-9]" <<<"$line" && { dups=$((dups+1)); echo "      seed=$s SPLIT-BRAIN(!) $line"; }
done
echo "    result: $frozen/20 seeds froze a half   (baseline when decided: 2/20)"
[ "$dups" -ne 0 ] && echo "  *** SPLIT-BRAIN APPEARED — that is NOT accepted. Fix it, and check sweep.sh. ***"
if [ "$frozen" -eq 0 ]; then green "no half froze in 20 seeds — partition recovery is total now"
else red "$frozen/20 splits froze a half"; fi

# (The C=2/C=3 tiny-section split-brains the first C-sweep found were FIXED —
# an isolated S1 fragment now uses its relay re-knock to requeue, commit 2e7aa18
# / docs/healing-laws.md § split-off fragment. c-sweep.sh is strict at all C and
# green, so there is no low-C entry to keep here. If it ever regresses, that
# battery — not this graveyard — is where it shows.)

# ----------------------------------------------------------------- browsers --
if [ "$BROWSERS" = 1 ]; then
  export MEET_CHROME="${MEET_CHROME:-/opt/google/chrome/chrome}"
  run_suite(){ timeout 900 node "$1" >/tmp/known-unfixed-$(basename "$1" .js).log 2>&1; }

  hdr "LATE JOINERS ADOPT A RUNNING APP UNRELIABLY  (decided: kept as guards)"
  why "app STATE rides the structural-neighbour sga flood while presence rides
                 meshNode.gossip, so whether a newcomer gets the retained snapshot is a
                 RACE, not a flat no. Unifying the two lanes is a design change."
  cost "one control plane for app state + presence (docs/app-mesh-unification.md)"
  echo "    MEASURED 2026-07-27 (8-core box, 3 runs each; the pi is too weak to judge):"
  echo "                 e2e-meeting-app  2/3 GREEN     e2e-mymedia-meet  1/3 GREEN"
  echo "                 So this is intermittent, and the entry above used to claim a"
  echo "                 newcomer NEVER adopts. It sometimes does. Whoever picks up"
  echo "                 app-mesh-unification should know they are closing a race, not"
  echo "                 building a missing path — and that a single green run here"
  echo "                 proves nothing."
  for s in test/browser/e2e-meeting-app.js test/browser/e2e-mymedia-meet.js; do
    if run_suite "$s"; then green "$s now passes"; else red "$s"; fi
  done

  hdr "FAILOVER WAKE MISSES THE ≤5s GRACE BOUND  (decided: Nathan, 2026-07-28 — cut 0.8.6, fix by design)"
  why "the wake is DETECTION-bound, not wake-bound: Chrome reports a killed
                 peer's transport down in ~5-9s (DC close never fires on a context
                 kill; ICE 'failed' is Chrome's mood), and the standby then flows ~1s
                 later. Measured 2.9-13.3s across 7 runs; the PIPE-DARK fix (5e577e9)
                 removed the 12s announce-ageing tail but cannot beat ICE."
  cost "a receiver-side RTP-silence watchdog (inbound bytes flat >700ms on a
                 claimed primary => speculative demand-wake; make-before-break makes a
                 false alarm harmless). Design task filed 2026-07-28. The GATE keeps
                 asserting wake CORRECTNESS (completes, claim survives, via switches,
                 re-parks) via redun-drill's default mode — only the latency BOUND
                 lives here."
  if REDUN_STRICT=1 run_suite test/drills/redun-drill.js; then green "redun-drill strict wake bound now passes"; else red "redun-drill REDUN_STRICT=1 (wake > 5s grace)"; fi

else
  printf '\n(skipping browser entries — pass --browsers to include them)\n'
fi

# ------------------------------------------------------------------ verdict --
printf '\n════════════════════════════════════════\n'
echo "  still unfixed (RED, expected): $still"
echo "  NOW PASSING (promote + delete):  $fixed"
if [ "$fixed" -gt 0 ]; then
  echo "  ^ move any GREEN check back into its real gate and drop it from this file."
fi
echo "  This script is not a gate. Non-zero exit just means the graveyard is not empty."
[ "$still" -eq 0 ] && exit 0 || exit 1
