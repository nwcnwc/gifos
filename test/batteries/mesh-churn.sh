#!/bin/bash
# batteries/mesh-churn.sh — seating, healing, and recovery under DISRUPTION.
#
#   test/batteries/mesh-churn.sh            # full: sim + JS harness + wire vanish + browser drills
#   test/batteries/mesh-churn.sh --quick    # sim + harness only (no browsers)
#
# This is the regression gate for "people leave, crash, partition, drop packets,
# scoot, rejoin" — the patterns that keep finding density and phantom bugs.
# join.sh covers ARRIVAL; this covers DEPARTURE and MALFUNCTION.
#
# Prefer the 8-core box for anything with browsers:
#   ssh nvidia-laptop 'cd ~/projects/gifos && test/batteries/mesh-churn.sh'
set -u
cd "$(dirname "$0")/../.."
QUICK=0; [ "${1:-}" = "--quick" ] && QUICK=1
export MEET_CHROME=${MEET_CHROME:-/opt/google/chrome/chrome}
export SWARM_CHROME=${SWARM_CHROME:-/opt/google/chrome/chrome}
pass=0; fail=0; results=""

if ! node -e 'process.exit(typeof WebSocket === "function" ? 0 : 1)'; then
  echo "ABORT: this node ($(node -v)) has no global WebSocket."
  echo "  Use node >= 22: export NVM_DIR=\$HOME/.nvm; . \$NVM_DIR/nvm.sh; nvm use 22"
  exit 2
fi

STEP_TIMEOUT=${STEP_TIMEOUT:-900}
STEP_DIR=${STEP_DIR:-/tmp/mesh-churn-battery}
mkdir -p "$STEP_DIR"; step=0
run() {
  local label="$1"; shift
  step=$((step+1))
  local log="$STEP_DIR/$step.log"
  echo; echo "═══ $label"; echo "    (full output: $log)"
  local rc
  timeout "$STEP_TIMEOUT" "$@" >"$log" 2>&1; rc=$?
  tail -12 "$log"
  if [ "$rc" = 0 ]; then pass=$((pass+1)); results="$results\n  PASS  $label"
  elif [ "$rc" = 124 ]; then fail=$((fail+1)); results="$results\n  FAIL  $label  (TIMED OUT after ${STEP_TIMEOUT}s)"
  else fail=$((fail+1)); results="$results\n  FAIL  $label  (exit $rc)"; fi
}

echo "mesh-churn battery — tip $(git rev-parse --short HEAD 2>/dev/null || echo '?')  quick=$QUICK"

# ── SIM: leave / crash / loss / scoot / rejoin ─────────────────────────────
run "sim — join patterns (arrival shape; H7 density baseline)" \
    ./sim/repro-join-patterns.sh

run "sim — loss wedge (10% packet loss admission)" \
    ./sim/repro-loss-wedge.sh

run "sim — atomic move / dual-hold transit + cascade scooch" \
    ./sim/repro-atomic-move.sh

run "sim — H-CHAIN devolution (admit + left-pack + column + silent head)" \
    ./sim/repro-hchain.sh

run "sim — headless-row admission" \
    ./sim/repro-headless-row.sh

run "sim — Q2 compaction under mass-kill" \
    ./sim/repro-compaction.sh

run "sim — adversary fabrics + dark seat (hostile net)" \
    ./sim/repro-adversary.sh

run "sim — churn combos (loss+kill, cascade rejoin, sever, silent row wipe)" \
    ./sim/repro-churn-combos.sh

# sweep is the long churn matrix (seeds × kill fractions + partition + D5)
SWEEP_TIMEOUT=${SWEEP_TIMEOUT:-1800}
STEP_TIMEOUT=$SWEEP_TIMEOUT run "sim — sweep (churn matrix + partition + D5 early-probe)" \
    ./sim/sweep.sh

# ── JS PORT: same brain under Node ─────────────────────────────────────────
run "mesh.js — harness (JOIN, %kill, s1row/s1all, D5 crash/sever/blackhole)" \
    node test/mesh/mesh-harness.js

run "mesh.js — Q5 designation chain (row + column)" \
    node test/mesh/q5-designation.js

run "mesh.js — R5 fork pick-one (unit)" \
    node test/mesh/r5-fork-pick.js

run "mesh.js — D5 vanish over real wire stack" \
    node test/mesh/e2e-vanish.js

run "wire — mesh↔wire sealed relay (crash survivors)" \
    node test/mesh/e2e-mesh-wire.js

if [ "$QUICK" = 1 ]; then
  echo; echo "════════════════════════════════════════"
  printf '%b\n' "$results"
  echo "  $pass passed, $fail failed  (--quick: sim + JS only)"
  [ $fail = 0 ] && echo "  MESH CHURN IS SOUND (quick)" || echo "  MESH CHURN RED — do not ship seating/healing changes"
  exit $([ $fail = 0 ] && echo 0 || echo 1)
fi

# ── BROWSER: real WebRTC disruption rungs ──────────────────────────────────
DEV_PID=
listening() { (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; }
# Drills spawn their own stacks; still bring dev up for any that want 8099/8790.
if ! { listening 8099 && listening 8790; }; then
  echo "── bringing up the dev stack (site 8099 + relay 8790, RELAY_DEV=1) ──"
  RELAY_DEV=1 test/servers/dev.sh >/tmp/mesh-churn-dev.log 2>&1 &
  DEV_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do listening 8099 && listening 8790 && break; sleep 1; done
fi
trap '[ -n "$DEV_PID" ] && kill $DEV_PID 2>/dev/null' EXIT

run "browser — vanish / transport-loss (pagehide + dc close)" \
    node test/drills/e2e-vanish-browser.js

run "browser — dark peers cannot poison seating/wiring" \
    node test/drills/adversary-room.js

run "browser — late join socketless sponsor path" \
    node test/drills/e2e-latejoin.js

run "browser — E5 friend-relay reunion after ICE split" \
    node test/drills/e2e-peer-relay-reunion.js

run "browser — R5 fork pick-one (real modal)" \
    node test/drills/e2e-r5-fork-pick.js

run "browser — redundant path failover (redun-drill)" \
    node test/drills/redun-drill.js

run "browser — dormant mirror wake (mirror-drill)" \
    node test/drills/mirror-drill.js

echo; echo "════════════════════════════════════════"
printf '%b\n' "$results"
echo "  $pass passed, $fail failed"
[ $fail = 0 ] && echo "  MESH CHURN IS SOUND" || echo "  MESH CHURN RED — do not ship seating/healing changes"
exit $([ $fail = 0 ] && echo 0 || echo 1)
