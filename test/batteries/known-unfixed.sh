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
# A PARTITIONED HALF MAY FREEZE (decided: Nathan, 2026-07-21) — CLOSED 2026-09-17.
# The 20-seed measurement that lived here went 20/20 clean (2/20 frozen when
# decided; 18/20 in healing-laws § Partition), so per this file's own rule it
# was promoted into a real gate: test/sim/repro-partition.sh, globbed by the
# release battery with every other repro-*.sh. It is not re-measured here.

# (The C=2/C=3 tiny-section split-brains the first C-sweep found were FIXED —
# an isolated S1 fragment now uses its relay re-knock to requeue, commit 2e7aa18
# / docs/healing-laws.md § split-off fragment. c-sweep.sh is strict at all C and
# green, so there is no low-C entry to keep here. If it ever regresses, that
# battery — not this graveyard — is where it shows.)

# N=5000 MASS-JOIN STALLS (decided: cut 0.9.3 without it, 2026-08-05) —
# CLOSED 2026-09-17. T7 spread-after-NOROOM is ON in both twins, with its
# evidence GRADED BY DEPTH (a NOROOM counts only from a seat at depth >= 4):
# the plateau's NOROOMs come from the depth wall, a shrinking room's from
# depths 0-2, and that grade is what dissolved the compaction trade (leg 1 is
# green with spread on; it was red at grade 0 because spread opened sections
# under sibling columns that chain-local compaction can never reach). N=5000
# converges at 3840 ticks, N=20000 on three seeds, dups=0 throughout. The
# N=50000 dup family underneath was then found and closed the same night
# (healing-laws V7, the deep-row ledger): N=5000 now converges at 1408 ticks
# and N=50000 at 2176 with dups=0 (was 8512 with 18).
# scale-frontier.sh was renamed test/sim/repro-scale.sh per the covenant and
# the release battery globs it. Nothing is re-measured here.

# ----------------------------------------------------------------- browsers --
if [ "$BROWSERS" = 1 ]; then
  export MEET_CHROME="${MEET_CHROME:-/opt/google/chrome/chrome}"
  run_suite(){ timeout 900 node "$1" >/tmp/known-unfixed-$(basename "$1" .js).log 2>&1; }

  # LATE JOINERS ADOPT A RUNNING APP UNRELIABLY (decided: kept as guards) —
  # CLOSED 2026-09-17. The race was real and reproduced here (1 of 3 pristine
  # runs timed out at 45 s); the hole was in the PULL, not the lanes: the
  # snapshot/app pull asked only the STRUCTURAL sga neighbours and gave up
  # after 30 tries (60 s), and nothing ever restarted it. run.html now widens
  # the ask to every open channel after three structural tries and never
  # gives up while a subscriber wants the sid. e2e-meeting-app.js carries a
  # DETERMINISTIC guard (a joiner with its structural set isolated must still
  # mount; the negative control with widening disabled fails it at 50 s), so
  # the suites below are ordinary gate members again, not graveyard entries.

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
