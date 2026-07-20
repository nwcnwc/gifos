#!/bin/bash
# join-battery.sh — EVERYTHING that must still be true about JOINING.
#
#   test/join-battery.sh            # the full battery
#   test/join-battery.sh --quick    # skip the slow browser ladders
#
# Run this before pushing anything that touches how a seat is admitted or how
# a frame is carried — site/js/mesh-wire.js, site/js/mesh.js, site/meet.html,
# sim/mesh*.  site/ AUTO-DEPLOYS on push, so an untested change to those files
# is a change to production; this script exists so that is never an excuse.
#
# It covers joining at three levels, because a bug can hide at any one of them:
#   the brain   — the C++ sim, every arrival pattern, seating AND shape
#   the port    — mesh.js against the sim's own scenarios at N=500/1000
#   real life   — actual browsers, real relay, and the bar is LINK COMPLETENESS
#                 (every neighbour the mesh names is a peer we are connected to)
#                 plus ONE room (distinct coords, agreeing population).
#
# Fastest on the 8-core box; a weak host produces false failures around N>=10
# purely from its own exhaustion, so prefer:
#   ssh nvidia-laptop 'cd ~/projects/gifos && test/join-battery.sh'
set -u
cd "$(dirname "$0")/.."
QUICK=0; [ "${1:-}" = "--quick" ] && QUICK=1
export MEET_CHROME=${MEET_CHROME:-/opt/google/chrome/chrome}
export SWARM_CHROME=${SWARM_CHROME:-/opt/google/chrome/chrome}
pass=0; fail=0; results=""
run() {                     # run <label> <cmd...>
  local label="$1"; shift
  echo; echo "═══ $label"
  if "$@" 2>&1 | tail -12; then
    # tail eats the exit code, so re-check via PIPESTATUS on the subshell above
    :
  fi
  local rc=${PIPESTATUS[0]:-0}
  if [ "$rc" = 0 ]; then pass=$((pass+1)); results="$results\n  PASS  $label"
  else fail=$((fail+1)); results="$results\n  FAIL  $label"; fi
}

# ── the brain: every arrival pattern, seating AND H7 row-major shape ────────
run "sim — 7 arrival patterns x 13 sizes (burst/serial/batch/window)" \
    ./sim/repro-join-patterns.sh

# ── the port: mesh.js replaying the sim's scenarios at scale ────────────────
run "mesh.js — harness (JOIN N=1000, 50% kill, s1row, s1all, D5)" \
    node test/mesh/mesh-harness.js
run "mesh.js — genesis flood (20 nodes, one synchronous burst)" \
    node test/mesh/flood.js
run "wire — mesh<->wire over a real relay and real sealing" \
    node test/mesh/e2e-mesh-wire.js

# ── real life: browsers, real relay, link completeness ─────────────────────
if [ $QUICK = 0 ]; then
  run "browsers — serial arrivals (one at a time), links complete" \
      ./test/swarm/join-ladder.sh serial 2 3 5 6 7
  run "browsers — burst arrivals (all at once), links complete" \
      ./test/swarm/join-ladder.sh burst 5 9 11 16
fi

# ── adversaries: one bad participant must not poison the room ──────────────
run "adversary — dark peers cannot block seating, wiring or admission" \
    node test/drills/adversary-room.js
run "late join — wiring to socketless seats via the sponsor door" \
    node test/drills/e2e-latejoin.js

echo; echo "════════════════════════════════════════"
printf '%b\n' "$results"
echo "  $pass passed, $fail failed"
[ $fail = 0 ] && echo "  JOINING IS SOUND" || echo "  DO NOT PUSH site/ UNTIL THESE ARE GREEN"
exit $([ $fail = 0 ] && echo 0 || echo 1)
