#!/bin/bash
# behavior.sh — the BEHAVIOR battery gate: real meetings, real phone realities,
# no monitors. Runs test/behavior/scenarios/ SERIALLY (each scenario is 2-6
# browsers; parallel runs would starve a small box and invent failures).
#
#   test/batteries/behavior.sh            # everything (several hours)
#   test/batteries/behavior.sh --core     # the CORE set (~1.5h)
#   test/batteries/behavior.sh 01 08a     # only scenarios matching prefixes
#
# Engines: roles are chromium unless a scenario says otherwise (25a runs one
# firefox phone; it SKIPs where firefox is not installed). BEHAVIOR_ENGINE
# re-engines the whole battery (=firefox) or one role (=maya=firefox).
# Boxes: with a BEHAVIOR_HOSTS file the actors spread over the farm by ssh —
# test/README "The BEHAVIOR battery in FLEET mode". The battery itself is
# unchanged either way; only where the browsers live changes.
#
# Stack: scenarios auto-spawn site:8099 + relay-local:8790 if idle. Start
# test/servers/relay-dev.sh yourself to include the [relay-dev] deploy
# scenarios (04b, 16b; 20a runs its deploy act opportunistically) — without
# it they SKIP loudly.
#
# Output: one PASS/FAIL/SKIP line per scenario + a final tally; full logs in
# /tmp/behavior-battery/<scenario>.log, per-role forensics in /tmp/behavior/.
# Exit: 1 if anything failed, 4 if nothing failed but something rendered NO
# VERDICT (an actor's browser died — see the exit-4 branch below), 0 otherwise.
# (The one-time KNOWN-REDs are history:
# 04b/16b — the post-deploy WHOHOME stall — went green with the fork
# false-positive fix 95ca143 and stay in as its regression guards.)
set -u
cd "$(dirname "$0")/../.."

# 25a is in CORE deliberately: "every real room is one browser" is the kind of
# assumption that rots silently, and it is a 3-minute scenario. On a box with no
# playwright firefox it prints one SKIP line naming the install command — loud,
# and never a red pretending to be a product bug.
# 26a is in CORE for the same reason 25a is: it is the ONLY place the three
# steering schemes are driven at once, and "the tilt option still works" is
# exactly the kind of claim that rots without anybody noticing — it breaks for
# whichever player chose it while the other two are fine.
CORE="00 01a 01b 01c 02a 03a 04a 04b 05a 06a 07a 08a 09a 10a 11a 12a 14a 16a 17a 18a 20a 21a 24a 25a 26a"
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

# Reap leftover browsers BETWEEN scenarios, exactly as release.sh does between
# suites. Scenarios are 2-6 browsers each and this battery is the LAST tier of
# the gate, so it inherits whatever the drills tier leaked — mirror-drill alone
# launches 8. Measured 2026-08-02: 08a-techsupport-reload-mash run straight
# after six back-to-back mirror-drill runs failed in 423s with "Target page,
# context or browser has been closed", then passed in 43s and 71s on a clean
# box. A scenario that dies of the PREVIOUS scenario's residue reports as a
# product regression, which is the one thing this battery must never do.
# Both binaries, both bracketed — see the note in release.sh's reap_browsers.
# A non-chromium actor is invisible to the chromium patterns, so the sweep is
# ALSO engine-neutral: every actor browser carries BB_ACTOR=1 in its process
# environment (meet.js sets it in drive mode; children inherit it), which is
# the one marker that works for chromium, firefox AND webkit at once. A missed
# firefox is not harmless — it holds the relay socket and the seat.
reap_browsers() {
  for p in $(pgrep -f '[c]hrome-linux/chrome' 2>/dev/null) \
           $(pgrep -f '[h]eadless_shel' 2>/dev/null); do
    kill -9 "$p" 2>/dev/null
  done
  for d in /proc/[0-9]*; do
    grep -qz 'BB_ACTOR=1' "$d/environ" 2>/dev/null && kill -9 "${d##*/}" 2>/dev/null
  done
  return 0
}

pass=0; fail=0; skip=0; failed=""; nov=0; novlist=""; fleet=0; fleetlist=""
for f in test/behavior/scenarios/*.js; do
  name=$(basename "$f" .js)
  match "$name" || continue
  log="$LOGDIR/$name.log"
  reap_browsers; sleep 2
  start=$(date +%s)
  node "$f" >"$log" 2>&1
  rc=$?
  secs=$(( $(date +%s) - start ))
  if grep -q '^SKIP:' "$log"; then
    skip=$((skip+1)); echo "SKIP  $name (${secs}s) — $(grep '^SKIP:' "$log" | head -1 | cut -c6-)"
  # EXIT 4 = NO VERDICT (cast.js "THE CASUALTY GATE"): an actor's BROWSER died,
  # so the scenario refused to render a verdict instead of reporting a room that
  # is genuinely short a member as a mesh defect. Never retried — the box does
  # not get roomier on the second run — and never counted as a product red.
  # It still blocks a cut: a scenario nobody could run is a guard nobody has.
  elif [ $rc -eq 4 ]; then
    nov=$((nov+1)); novlist="$novlist $name"
    echo "NOVER $name (${secs}s) — $(grep -m1 'CASUALTY:' "$log" | sed 's/^ *CASUALTY: *//' | cut -c1-110)"
  elif [ $rc -eq 3 ]; then
    # The scenario declared it needs isolated machines (needFleet). Not a
    # product red — and not a skip that looks like silence. release.sh maps
    # this to NEEDS-FLEET, which still blocks a cut until the fleet run exists.
    fleet=$((fleet+1)); fleetlist="$fleetlist $name"
    echo "FLEET $name (${secs}s) — NEEDS-FLEET; log: $log"
  elif [ $rc -eq 0 ]; then
    pass=$((pass+1)); echo "PASS  $name (${secs}s)"
  else
    fail=$((fail+1)); failed="$failed $name"
    echo "FAIL  $name (${secs}s) — $(grep -c '✘' "$log" 2>/dev/null || echo '?') red; log: $log"
    grep '✘' "$log" | head -4 | sed 's/^/        /'
  fi
done

echo
echo "BEHAVIOR BATTERY: $pass passed, $fail failed, $skip skipped, $nov no-verdict, $fleet needs-fleet"
[ -n "$failed" ] && echo "failed:$failed"
[ -n "$novlist" ] && echo "no-verdict:$novlist"
[ -n "$fleetlist" ] && echo "needs-fleet:$fleetlist"
# A red outranks a no-verdict: if something actually failed, that is the news.
[ $fail -ne 0 ] && exit 1
[ $nov -ne 0 ] && exit 4
[ $fleet -ne 0 ] && exit 3
exit 0
