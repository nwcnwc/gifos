#!/bin/bash
# release.sh — THE RELEASE GATE. Green here (and nothing skipped) or we do not cut.
#
#   test/batteries/release.sh                    # the whole gate
#   test/batteries/release.sh --behavior=full    # ...with the FULL behavior battery
#   test/batteries/release.sh --behavior=skip    # behavior owned by another box/agent
#   test/batteries/release.sh --list             # show what would run, run nothing
#   test/batteries/release.sh --only=unit,drills # iterate on a tier (never a green gate)
#
# WHY THIS EXISTS. Before it, no single command ran the release gate, and the
# per-area batteries (join/mesh-churn/c-sweep) deliberately don't cover browser/
# or most of drills/. So a guard could sit in NO battery and never run: that is
# exactly how e2e-meet-app-guest-perms.js — the guard for the app-in-a-meeting
# case that broke a live demo — was written pointing at a chromium path that did
# not exist and never executed once. This script therefore DISCOVERS every file
# in each tier rather than naming them, so a new suite is gated the day it lands.
#
# THE DEAD STATE. A suite that exits non-zero having produced ZERO assertions did
# not fail — it never ran. That looks like silence and is the most dangerous
# result there is, so it gets its own verdict (DEAD) and blocks the gate exactly
# like a RED. Never "fix" a DEAD suite by deleting it.
#
# NOT GATED, on purpose:
#   test/swarm/    — defaults to PRODUCTION; a scale/load tool, not pass/fail.
#   test/tools/    — utilities, no assertions.
#   batteries/known-unfixed.sh — the graveyard, expected RED end to end, only shrinks.
set -u
cd "$(dirname "$0")/../.."
REPO=$(pwd)

BEHAVIOR=core           # core | full | skip
ONLY=""
LIST=0
for a in "$@"; do
  case "$a" in
    --behavior=*) BEHAVIOR="${a#*=}" ;;
    --only=*)     ONLY="${a#*=}" ;;
    --list)       LIST=1 ;;
    -h|--help)    sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

LOGDIR=/tmp/release-gate
RESULTS=$LOGDIR/results.tsv
mkdir -p "$LOGDIR"; : > "$RESULTS"

want() { [ -z "$ONLY" ] && return 0; case ",$ONLY," in *",$1,"*) return 0;; esac; return 1; }

green=0; red=0; dead=0; skipped_tiers=""

# ---- servers -----------------------------------------------------------------
stop_all() {
  pkill -f "http.server 8099" 2>/dev/null
  pkill -f relay-local.js 2>/dev/null
  pkill -f fake-ai.js 2>/dev/null
  pkill -f fake-keyapi.js 2>/dev/null
  pkill -f fake-cors-proxy.js 2>/dev/null
  sleep 1
}
start_site_relay() {
  nohup python3 -m http.server 8099 -d "$REPO/site" >/dev/null 2>&1 &
  nohup node test/servers/relay-local.js >/dev/null 2>&1 &
  sleep 2
}
start_fakes() {
  nohup node test/servers/fake-ai.js >/dev/null 2>&1 &
  nohup node test/servers/fake-keyapi.js >/dev/null 2>&1 &
  nohup node test/servers/fake-cors-proxy.js >/dev/null 2>&1 &
  sleep 2
}
trap stop_all EXIT

# ---- one suite ---------------------------------------------------------------
# Verdict from BOTH the exit code and whether the suite actually asserted
# anything, because "exited 1 with no output" and "one assertion failed" are
# completely different problems and only one of them is a test failure.
run_one() {
  local f="$1" to="$2" tier="$3"
  local name; name=$(basename "$f" .js)
  local log="$LOGDIR/${tier}_${name}.log"
  [ "$tier" = browser ] || [ "$tier" = drills ] && { pkill -f "chrome-linux/chrome" 2>/dev/null; sleep 1; }
  local start; start=$(date +%s)
  timeout "$to" node "$f" > "$log" 2>&1
  local rc=$? secs=$(( $(date +%s) - start ))
  local pass fail verdict reason
  pass=$(grep -cE '^ *PASS' "$log"); fail=$(grep -cE '^ *FAIL' "$log")
  if [ "$rc" -eq 0 ]; then
    verdict=GREEN; reason="${pass} assertions"; green=$((green+1))
  elif [ "$pass" -eq 0 ] && [ "$fail" -eq 0 ]; then
    verdict=DEAD
    reason="exit ${rc}, ZERO assertions — never ran :: $(grep -m1 -oE "[A-Za-z]+Error[^\"]{0,80}|[a-zA-Z._]+ is not a function|executable doesn't exist[^ ]*" "$log" | head -1)"
    dead=$((dead+1))
  elif [ "$rc" -eq 124 ]; then
    verdict=RED; reason="TIMEOUT ${to}s (${pass} passed, ${fail} failed first)"; red=$((red+1))
  else
    verdict=RED; reason="${fail} failed / ${pass} passed :: $(grep -m1 -E '^ *FAIL' "$log" | sed 's/^ *FAIL *— *//' | cut -c1-80)"; red=$((red+1))
  fi
  printf '%s\t%s\t%s\t%s\n' "$verdict" "$tier/$name" "${secs}s" "$reason" >> "$RESULTS"
  printf '%-5s %-38s %6s  %s\n' "$verdict" "$tier/$name" "${secs}s" "$reason"
}

run_tier() {  # tier, timeout, glob...
  local tier="$1" to="$2"; shift 2
  echo; echo "===== TIER: $tier ====="
  local any=0
  for f in "$@"; do [ -e "$f" ] || continue; any=1
    if [ "$LIST" = 1 ]; then echo "  would run  $f"; else run_one "$f" "$to" "$tier"; fi
  done
  [ "$any" = 1 ] || echo "  (no suites found)"
}

echo "RELEASE GATE — $(date '+%Y-%m-%d %H:%M')  @ $(git rev-parse --short HEAD 2>/dev/null)"
[ -n "$ONLY" ] && echo "!! --only=$ONLY : a partial run can NEVER satisfy the gate"

# ---- tier 1: unit (nothing needed) -------------------------------------------
want unit && run_tier unit 300 test/unit/*.js

# ---- tier 2: mesh + relay ----------------------------------------------------
# relay-owned.js (8792) and relay-device-dedupe.js (8791) hardcode ports that
# COLLIDE with fake-keyapi/fake-ai, so the fakes must be down for this tier.
if want mesh || want relay; then
  [ "$LIST" = 1 ] || { stop_all; start_site_relay; }
  want mesh  && run_tier mesh 900 test/mesh/*.js
  want relay && run_tier relay 600 test/relay/*.js
fi

# ---- tier 3: browser (site + relay + the fake upstreams) ---------------------
if want browser; then
  [ "$LIST" = 1 ] || { stop_all; start_site_relay; start_fakes; }
  echo; echo "===== TIER: browser ====="
  for f in test/browser/*.js; do
    [ -e "$f" ] || continue
    name=$(basename "$f" .js)
    if [ "$LIST" = 1 ]; then echo "  would run  $f"; continue; fi
    case "$name" in
      # spawns its OWN server on 8791 — fake-ai must be down for it, up after
      e2e-fetch-bridge) pkill -f fake-ai.js; sleep 1; run_one "$f" 600 browser
                        nohup node test/servers/fake-ai.js >/dev/null 2>&1 & sleep 2 ;;
      e2e|e2e-away-holdover|e2e-vis-park|e2e-meet-mod|e2e-pip) run_one "$f" 1200 browser ;;
      *) run_one "$f" 900 browser ;;
    esac
  done
fi

# ---- tier 4: drills (self-contained: each spawns its own relay + site) -------
if want drills; then
  [ "$LIST" = 1 ] || stop_all      # they bring their own; keep the ports clear
  run_tier drills 900 test/drills/*.js
fi

# ---- tier 5: the mesh LAWS (C++ reference; needs g++) ------------------------
if want sim; then
  echo; echo "===== TIER: sim ====="
  if ! command -v g++ >/dev/null 2>&1; then
    echo "DEAD  sim — g++ not installed; the reference sim cannot build"; dead=$((dead+1))
    printf 'DEAD\tsim/toolchain\t0s\tg++ missing\n' >> "$RESULTS"
  elif [ "$LIST" = 1 ]; then
    echo "  would run  test/sim/repro-*.sh + test/batteries/c-sweep.sh"
  else
    for s in test/sim/repro-*.sh test/batteries/c-sweep.sh; do
      [ -e "$s" ] || continue
      n=$(basename "$s" .sh); start=$(date +%s)
      bash "$s" > "$LOGDIR/sim_$n.log" 2>&1; rc=$?; secs=$(( $(date +%s) - start ))
      if [ $rc -eq 0 ]; then v=GREEN; green=$((green+1)); else v=RED; red=$((red+1)); fi
      printf '%s\t%s\t%s\t%s\n' "$v" "sim/$n" "${secs}s" "exit $rc" >> "$RESULTS"
      printf '%-5s %-38s %6s  exit %s\n' "$v" "sim/$n" "${secs}s" "$rc"
    done
  fi
fi

# ---- tier 6: BEHAVIOR — real meetings, real phone realities ------------------
# Slowest and closest to a user. Gated like everything else; skipping it is
# allowed (it may be owned by another box) but can NEVER produce a green gate.
if want behavior; then
  echo; echo "===== TIER: behavior ====="
  if [ "$BEHAVIOR" = skip ]; then
    echo "SKIP  behavior — NOT RUN HERE. Confirm it is green on the owning machine."
    skipped_tiers="$skipped_tiers behavior"
  elif [ "$LIST" = 1 ]; then
    echo "  would run  test/batteries/behavior.sh $([ "$BEHAVIOR" = full ] || echo --core)"
  else
    # relay-dev.sh (the REAL Worker under wrangler) drives the deploy scenarios;
    # without it 04b/16b SKIP loudly rather than pretending to pass.
    ss -lnt 2>/dev/null | grep -q ':8794 ' || echo "  note: relay-dev not on :8794 — deploy scenarios (04b/16b) will SKIP"
    start=$(date +%s)
    if [ "$BEHAVIOR" = full ]; then bash test/batteries/behavior.sh > "$LOGDIR/behavior.log" 2>&1
    else bash test/batteries/behavior.sh --core > "$LOGDIR/behavior.log" 2>&1; fi
    rc=$?; secs=$(( $(date +%s) - start ))
    tail -1 "$LOGDIR/behavior.log" | grep -q 'BEHAVIOR BATTERY' && tally=$(tail -1 "$LOGDIR/behavior.log") || tally="see $LOGDIR/behavior.log"
    if [ $rc -eq 0 ]; then v=GREEN; green=$((green+1)); else v=RED; red=$((red+1)); fi
    printf '%s\t%s\t%s\t%s\n' "$v" "behavior/$BEHAVIOR" "${secs}s" "$tally" >> "$RESULTS"
    printf '%-5s %-38s %6s  %s\n' "$v" "behavior/$BEHAVIOR" "${secs}s" "$tally"
    grep -E '^FAIL' "$LOGDIR/behavior.log" | head -8 | sed 's/^/        /'
  fi
fi

# ---- verdict -----------------------------------------------------------------
echo
echo "=================== RELEASE GATE ==================="
printf '  GREEN %d   RED %d   DEAD %d\n' "$green" "$red" "$dead"
if [ "$red" -gt 0 ] || [ "$dead" -gt 0 ]; then
  echo
  echo "  BLOCKING:"
  awk -F'\t' '$1=="RED"||$1=="DEAD" {printf "    %-5s %-34s %s\n", $1, $2, $4}' "$RESULTS"
fi
[ -n "$skipped_tiers" ] && echo "  NOT RUN HERE:$skipped_tiers"
[ -n "$ONLY" ] && echo "  PARTIAL RUN (--only=$ONLY)"
echo "  full logs: $LOGDIR   machine-readable: $RESULTS"
echo "===================================================="

if [ "$LIST" = 1 ]; then exit 0; fi
if [ "$red" -gt 0 ] || [ "$dead" -gt 0 ]; then
  echo "DO NOT CUT — the gate is red."; exit 1
fi
if [ -n "$skipped_tiers" ] || [ -n "$ONLY" ]; then
  echo "GATE NOT SATISFIED — everything run was green, but not everything ran."; exit 2
fi
echo "GATE GREEN — clear to cut."; exit 0
