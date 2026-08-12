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

hdr "N=5000 MASS-JOIN STALLS  (decided: cut 0.9.3 without it, 2026-08-05)"
why "a 5000-seat single-storm join plateaus (~3076 seated at the 60k-tick cap).
                 No release has ever converged N=5000. Real rooms sit orders of magnitude
                 below the pathology; every real-shape gate is green."
cost "DIAGNOSED AND SOLVED-BUT-UNSHIPPABLE as of 2026-08-06 — read
                 docs/front3-descent-2026-08-06.md before touching this. The cause is NOT
                 the heal layer: at the plateau 100% of pass-0 descents offer exactly ONE
                 candidate (the child-row head, the only child a parent hears first-hand),
                 every FIND walks that spine 12 levels to the wall (2.44M NOROOMs, meanHops
                 exactly 12.00) and 11,259 free cells sit under columns 1..C-1 unreached.
                 T7 spread-after-NOROOM FIXES IT — sim verb \`spreadon 1\`, DEFAULT OFF:
                 N=5000 converges 5000/5000 on all 4 seeds (~3200-3400 ticks), N=10000 in
                 3776, N=20000 in 4480, dups=0, evictions 11022 -> 3739, and the split-room
                 legs (headless-row C, hchain D) stay green.
                 IT IS OFF FOR TWO REASONS, AND THE FIRST IS CORRECTNESS.
                 (1) T7 MINTS DUPLICATE SEATS: N=50000 gives seated=49986/50000
                 with DUPS 18 and CHECK FAIL, while N=100000 is clean (dups=0) —
                 non-monotonic, so a race whose window depends on topology, not a
                 threshold. Inferred cause: pass 0's firstHandLive filter was also
                 selecting an admitter whose occ view is FRESH; a reachable-but-
                 unheard admitter can admit into a cell already taken. Fixing that
                 belongs beside the V4/V5 evidence waves.
                 (2) IT COSTS TREE COMPACTNESS: spreading opens more sections
                 and lone rows than compaction can collapse, and repro-compaction leg 1
                 reds (clean A/B: baseline GREEN, T7 RED). Raising the evidence bar to 2
                 NOROOMs does not separate them (still converges, 8 failures instead of 5),
                 so the trade is inherent to spreading, not a trigger artifact. Resolving
                 that trade is the remaining work; the covenant below still stands."
echo "    running test/sim/scale-frontier.sh (~20 min of sim compute) ..."
if bash test/sim/scale-frontier.sh > /tmp/known-scale.log 2>&1; then green "N=5000 converges — RENAME scale-frontier.sh to repro-scale.sh NOW"; else red "N=5000 mass-join stalls ($(grep -oE 'seated=[0-9]+/5000' /tmp/known-scale.log | tail -1))"; fi

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

  hdr "FAILOVER WAKE MISSES THE ≤5s GRACE BOUND  (decided: Nathan, 2026-07-28; campaign landed 2026-08-08)"
  why "The SENDER-SIDE CAMPAIGN LANDED 2026-08-08 (container identity
                 across reships + the carry guarantee after 'w' + the husk-cycle
                 announce expiry + born-parked explicit negotiation) and both of
                 the 2026-08-07 sender faces are DEAD AS CLASSES: no reship storm
                 (sids are per-job constants, a kill renegotiates NOTHING on
                 surviving hops) and no zombie-parked-pipe (a wake can no longer
                 be sid-mismatch-ignored, and a husk stops being a candidate).
                 Measured that day, <behavior-box> + gate host, 17 drill runs: typical
                 post-kill resumes 0.8-2.4s — INSIDE the bound — including sdn
                 multi-hop at loadavg 10.7. What still misses ≤5s, and why this
                 entry stays:
                 (a) the QUALIFICATION WINDOW / ICE lottery, unchanged from
                 2026-08-07: a kill landing on a never-qualified pipe still
                 resumes at 6.0-6.1s (2-of-4 strict redun runs);
                 (b) the ANNOUNCE-EXPIRY CASCADE when a kill husks multiple
                 carrier rings at once: bounded now (19s and 58s measured, was
                 NEVER-RESUMED), but far over grace — each ring costs husk-grace
                 (5s) + announce ageing (12s);
                 (c) small-box delivery starvation at loadavg >12 (mechanism
                 fires end to end — demand, wake, swap, first frame — and the
                 decoder starves; a box problem wearing a product label).
                 The wall-clock qualification remains REFUTED (2026-08-08 ABAB:
                 2400ms and 7200ms both raised the zombie rate) — do not rebuild
                 it before wake cycling is safe."
  cost "the RECEIVER-SIDE RTP-SILENCE WATCHDOG (offered 2026-08-07): react
                 to media-stopped-arriving instead of claim/announce machinery —
                 it collapses (a) outright and shortcuts (b)'s ring walk. Then
                 the ≤5s bound is honestly met and all four asserts promote
                 together. The GATE keeps asserting wake CORRECTNESS (completes,
                 via switches, re-parks) via both drills' default modes — the
                 latency BOUNDS and their claim-continuity twins live here."
  if REDUN_STRICT=1 run_suite test/drills/redun-drill.js; then green "redun-drill strict wake bound now passes"; else red "redun-drill REDUN_STRICT=1 (wake > 5s grace)"; fi
  if MIRROR_STRICT=1 run_suite test/drills/mirror-drill.js; then green "mirror-drill strict wake bound passed THIS run (16/18 at idle — green here proves nothing; only the RTP-silence watchdog retires this entry)"; else red "mirror-drill MIRROR_STRICT=1 (multi-hop wake vs 5s grace; measured 5.6-6.1s on its misses)"; fi

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
