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
g++ -O2 -std=c++17 -o "$BIN" sim/mesh.cpp || { echo "BUILD FAILED"; exit 2; }

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
echo "          sim/sweep.sh, which must stay green. Only the FREEZE lives here."
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

  hdr "LATE JOINERS DO NOT ADOPT A RUNNING APP  (decided: kept as guards)"
  why "app STATE rides the structural-neighbour sga flood while presence rides
                 meshNode.gossip, so a newcomer learns an app is running but never gets
                 the retained snapshot. Unifying the two lanes is a design change."
  cost "one control plane for app state + presence (docs/app-mesh-unification.md)"
  for s in test/browser/e2e-meeting-app.js test/browser/e2e-mymedia-meet.js; do
    if run_suite "$s"; then green "$s now passes"; else red "$s"; fi
  done

  hdr "e2e-fluence — the Deepgram pipeline  (decided: long-standing, kept as guard)"
  why "third-party pipeline; not worth chasing until the feature is revisited"
  cost "re-doing the Fluence/Deepgram integration"
  if run_suite test/browser/e2e-fluence.js; then green "e2e-fluence now passes"; else red "e2e-fluence"; fi
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
