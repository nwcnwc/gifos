#!/bin/bash
# behavior.sh — the BEHAVIOR battery gate: real meetings, real phone realities,
# no monitors. Runs test/behavior/scenarios/ SERIALLY (each scenario is 2-6
# browsers; parallel runs would starve a small box and invent failures).
#
#   test/batteries/behavior.sh            # everything (several hours)
#   test/batteries/behavior.sh --core     # the CORE set (~1.5h)
#   test/batteries/behavior.sh 01 08a     # only scenarios matching prefixes
#
# Stack: scenarios auto-spawn site:8099 + relay-local:8790 if idle. Start
# test/servers/relay-dev.sh yourself to include the [relay-dev] deploy
# scenarios (04b, 16b; 20a runs its deploy act opportunistically) — without
# it they SKIP loudly.
#
# Output: one PASS/FAIL/SKIP line per scenario + a final tally; full logs in
# /tmp/behavior-battery/<scenario>.log, per-role forensics in /tmp/behavior/.
# Exit: non-zero if anything failed. KNOWN-RED until their bugs are fixed:
# 04b/16b (post-deploy WHOHOME stall #1) — a red there is the repro working.
set -u
cd "$(dirname "$0")/../.."

CORE="00 01a 01b 01c 02a 03a 04a 04b 05a 06a 07a 08a 09a 10a 11a 12a 14a 16a 17a 18a 20a"
LOGDIR=/tmp/behavior-battery
mkdir -p "$LOGDIR"

pick=()
if [ "${1:-}" = "--core" ]; then
  for p in $CORE; do pick+=("$p"); done
elif [ $# -gt 0 ]; then
  pick=("$@")
fi

match() { # does scenario basename $1 match any requested prefix?
  [ ${#pick[@]} -eq 0 ] && return 0
  local b; for b in "${pick[@]}"; do case "$1" in "$b"*) return 0;; esac; done
  return 1
}

pass=0; fail=0; skip=0; failed=""
for f in test/behavior/scenarios/*.js; do
  name=$(basename "$f" .js)
  match "$name" || continue
  log="$LOGDIR/$name.log"
  start=$(date +%s)
  node "$f" >"$log" 2>&1
  rc=$?
  secs=$(( $(date +%s) - start ))
  if grep -q '^SKIP:' "$log"; then
    skip=$((skip+1)); echo "SKIP  $name (${secs}s) — $(grep '^SKIP:' "$log" | head -1 | cut -c6-)"
  elif [ $rc -eq 0 ]; then
    pass=$((pass+1)); echo "PASS  $name (${secs}s)"
  else
    fail=$((fail+1)); failed="$failed $name"
    echo "FAIL  $name (${secs}s) — $(grep -c '✘' "$log" 2>/dev/null || echo '?') red; log: $log"
    grep '✘' "$log" | head -4 | sed 's/^/        /'
  fi
done

echo
echo "BEHAVIOR BATTERY: $pass passed, $fail failed, $skip skipped"
[ -n "$failed" ] && echo "failed:$failed"
[ $fail -eq 0 ]
