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

# Portable port probe: ss where present, else curl (a container without ss must
# not read every port as closed — that is how the behavior tier refused on a
# box where wrangler was LISTENING with a 200).
port_up() {
  if command -v ss >/dev/null 2>&1; then ss -lnt 2>/dev/null | grep -q ":$1 "
  else curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/" 2>/dev/null; fi
}

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

green=0; red=0; dead=0; skipped_tiers=""; quar=0; escaped=""; flaky=0; flakes=""; needfleet=0; needlist=""

# ---- quarantine ---------------------------------------------------------------
# The ONLY reds the gate tolerates: behaviours deliberately not fixed, listed in
# quarantine.txt (the machine-readable half of known-unfixed.sh). A quarantined
# red is reported and does not block. A quarantined suite that goes GREEN DOES
# block, on purpose — someone fixed it, so it must be promoted back into the gate
# and struck from the list. A stale quarantine entry silently un-guards working
# code, which is how the app-in-a-meeting drills rotted in the first place.
QFILE="$REPO/test/batteries/quarantine.txt"
is_quarantined() {
  [ -f "$QFILE" ] || return 1
  grep -qE "^[[:space:]]*$1([[:space:]]|$)" "$QFILE"
}
# An entry may declare itself NONDETERMINISTIC. For those, ESCAPED is never
# raised: a best-of-N cannot distinguish "somebody fixed it" from "it came up
# heads N times" on a coin-flip suite, and a false ESCAPED blocks the release
# outright. Measured the hard way on mirror-drill (2026-08-02): ~10/17 green, it
# passed a best-of-3 by luck, I promoted it, and it red-twice in the next gate.
# Promotion for these is a HUMAN call against the rate recorded in the entry.
# Deterministic entries keep the full ESCAPED behaviour — that is the check that
# stops a stale entry silently un-guarding fixed code, and it still works for
# every suite whose red is reproducible.
is_nondet() {
  [ -f "$QFILE" ] || return 1
  grep -qE "^[[:space:]]*$1[[:space:]].*NONDETERMINISTIC" "$QFILE"
}

# ---- servers -----------------------------------------------------------------
# We only ever tear down servers WE started. An earlier version trapped EXIT
# unconditionally and pkill'd the shared ports even on a --list dry run, which
# silently killed a long browser sweep already running in another shell — every
# suite after that point reported ERR_CONNECTION_REFUSED and scored DEAD. A gate
# that invents 16 failures by knifing someone else's stack is worse than no gate.
OWNED=0
RELAYDEV_PID=""
stop_all() {
  # relay-dev is torn down ONLY if THIS run started it — someone else's wrangler
  # on :8794 is theirs to keep (same rule as the ports above: never knife a
  # stack we did not bring up).
  if [ -n "$RELAYDEV_PID" ]; then
    # Signal the whole GROUP (see setsid at the start site). Guarded: never
    # signal our own group, or the gate would kill itself mid-teardown.
    _pg=$(ps -o pgid= -p "$RELAYDEV_PID" 2>/dev/null | tr -d ' ')
    _mypg=$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')
    if [ -n "$_pg" ] && [ "$_pg" != "$_mypg" ]; then
      kill -TERM "-$_pg" 2>/dev/null; sleep 1; kill -KILL "-$_pg" 2>/dev/null
    fi
    kill -9 "$RELAYDEV_PID" 2>/dev/null
    # Belt and braces: anything still on :8794 is ours by construction, and an
    # orphaned workerd holds the port hard enough that the NEXT run would see a
    # relay-dev it did not start and correctly refuse to touch it forever.
    for _p in $(ss -lntp 2>/dev/null | grep ':8794 ' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
      kill -9 "$_p" 2>/dev/null
    done
    RELAYDEV_PID=""
  fi
  [ "$OWNED" = 1 ] || return 0
  pkill -f "http.server 8099" 2>/dev/null
  pkill -f relay-local.js 2>/dev/null
  pkill -f fake-ai.js 2>/dev/null
  pkill -f fake-keyapi.js 2>/dev/null
  pkill -f fake-cors-proxy.js 2>/dev/null
  sleep 1
}
start_site_relay() {
  OWNED=1
  nohup python3 -m http.server 8099 -d "$REPO/site" >/dev/null 2>&1 &
  # RELAY_DEV=1: the shared gate relay serves EVERY browser suite from ONE
  # address — the production per-IP cap of 8 silently starved every ≥9-client
  # suite (e2e-handq meshed exactly 8/10, forever). The caps themselves are
  # still asserted: e2e-relay spawns its OWN bare relay for that section.
  # RELAY_HOST=0.0.0.0: the behavior battery runs in FLEET mode — remote hosts
  # dial THIS box at its tailnet address, and fleet mode never spawns a stack
  # of its own. relay-local binds loopback by default (deliberate), so the
  # whole battery died before its first scenario with "stack unreachable",
  # taking all 8 scenarios AND the self-test with it. The site server already
  # binds every interface; the relay must match or the gate can never run
  # behavior. (This is the "gate relay config" red from the 0.8.6 triage,
  # recurring — hence a comment rather than a silent flag.)
  RELAY_DEV=1 RELAY_HOST=0.0.0.0 nohup node test/servers/relay-local.js >/dev/null 2>&1 &
  sleep 2
}
start_fakes() {
  OWNED=1
  nohup node test/servers/fake-ai.js >/dev/null 2>&1 &
  nohup node test/servers/fake-keyapi.js >/dev/null 2>&1 &
  nohup node test/servers/fake-cors-proxy.js >/dev/null 2>&1 &
  sleep 2
}
# Refuse to run alongside anything holding OUR ports, rather than fight for them.
# All five matter, not just 8099: relay-owned.js hardcodes 8792 and
# relay-device-dedupe.js hardcodes 8791, the same ports fake-keyapi and fake-ai
# use. A leftover fake server therefore makes relay-owned fail 7 of 9 checks —
# including "a wrong secret is rejected", which reads like the signed-adminship
# door being broken wide open when in truth nothing was listening to the test.
# We must not kill servers we did not start, so refuse loudly instead.
if [ "$LIST" != 1 ]; then
  busy=""
  for p in 8099 8790 8791 8792 8793; do
    port_up "$p" && busy="$busy $p"
  done
  if [ -n "$busy" ]; then
    echo "!! ports already in use:$busy — another sweep, a dev stack, or leftover fakes." >&2
    echo "   Stop them first; this gate manages its own servers and a stray one on" >&2
    echo "   8791/8792 silently corrupts the relay tier." >&2
    exit 3
  fi
fi
# ---- the toolchain must be able to RUN the suites ----------------------------
# A `node` without a global WebCrypto turns every crypto-touching suite into the
# DEAD state this gate exists to make loud — and it does it from the ENVIRONMENT,
# so the tree is clean, the diff is empty, and nothing points at the cause.
# Measured 2026-08-01: node 18.20.4 leaves `globalThis.crypto` undefined in FILE
# context (it is present under `node -e`, which is how it fools a quick check),
# so unit/meet-seal — the pin on the whole greeter-registry seal, healing-laws
# R2/R3/R6 — died with "Cannot read properties of undefined (reading
# 'getRandomValues')" while the identical code passed under node 22. Refuse to
# run rather than report an environment as a product red.
if [ "$LIST" != 1 ]; then
  # The probe MUST run from a FILE. `node -e` exposes globalThis.crypto on 18
  # even though a required module does not see it, so an -e probe passes on
  # exactly the toolchain this is meant to reject.
  _cryptochk=$(mktemp /tmp/gate-cryptochk-XXXXXX.js)
  printf 'process.exit(globalThis.crypto && globalThis.crypto.subtle ? 0 : 1)\n' > "$_cryptochk"
  if ! node "$_cryptochk" 2>/dev/null; then
    rm -f "$_cryptochk"
    echo "!! this node ($(node -v 2>/dev/null)) has no global WebCrypto in file context." >&2
    echo "   Every seal/sign suite would score DEAD from the environment alone." >&2
    echo "   Use node >= 22, e.g.  PATH=\"\$HOME/.nvm/versions/node/v22.23.1/bin:\$PATH\"" >&2
    exit 3
  fi
  rm -f "$_cryptochk"
fi
trap stop_all EXIT

# ---- one suite ---------------------------------------------------------------
# Verdict from BOTH the exit code and whether the suite actually asserted
# anything, because "exited 1 with no output" and "one assertion failed" are
# completely different problems and only one of them is a test failure.
# Reap BOTH browser binaries. Suites run under MEET_CHROME launch
# `chrome-linux/chrome`; suites that take Playwright's default channel launch
# `chrome-linux/headless_shell` instead. This script only ever hunted the
# former, so on a gate run every headless_shell leaked and ACCUMULATED across
# ~104 suites — the load-induced timing flakiness the retry logic exists to
# paper over is partly self-inflicted. (Measured mid-run: 12 chrome vs 2
# headless_shell alive at once.) CLAUDE.md has warned about exactly this
# pattern; the gate itself was still using the old one.
# Every pattern is bracketed so pgrep/pkill cannot match this script's own
# command line — see the pgrep self-match note in CLAUDE.md.
reap_browsers() {
  # NEVER reap a RESIDENT service's browser. Measured 2026-08-06 on the pi:
  # this loop kill -9'd the MonitorBot's chrome at every suite boundary (13
  # times in one drills run — the bot self-healed each time, cutting its 23h
  # session over and over). A resident (the monitor's run.sh) exports
  # GIFOS_RESIDENT=1, which meet.js passes into the browser's environment.
  # ONLY that marker is exempt — BB_ACTOR (drive-mode fleet actors) stays
  # reapable on purpose: stale crashed actors are exactly the pile-up this
  # reaper exists for.
  for _p in $(pgrep -f '[c]hrome-linux/chrome' 2>/dev/null) \
            $(pgrep -f '[h]eadless_shel' 2>/dev/null); do
    if tr '\0' ' ' < "/proc/$_p/environ" 2>/dev/null | grep -q 'GIFOS_RESIDENT=1'; then continue; fi
    kill -9 "$_p" 2>/dev/null
  done
}

# WAIT FOR THE KERNEL TO CALM DOWN before handing the next suite a stopwatch.
#
# reap_browsers kills the processes; it does not wait for the box to recover
# from having run them. run_one then slept ONE SECOND and started the next
# suite, so a drill asserting a SIX SECOND bound could begin with loadavg still
# in double digits from eight browsers that were alive a moment ago. That is the
# gate measuring latency on a machine that cannot currently measure latency —
# CLAUDE.md's "one box cannot tell a bug from a busy kernel", inside the gate
# itself.
#
# Measured 2026-08-10: e2e-vanish-browser's "gone from every survivor" leg
# (design target <=3s, asserted <=6s for CI headroom) came in at 6.68s during
# the drills tier and 42s-clean on a freshly booted box. Nothing about the
# product changed between those two runs.
#
# This is deliberately a CEILING, not a barrier: it waits up to ~60s for the
# 1-minute load to fall under the core count, then proceeds regardless. A gate
# that could be blocked forever by a busy box is worse than a slow one, and the
# suites still have their own timeouts. ~$(nproc) is the right bar rather than a
# fixed number: 2.0 is idle on a 16-core box and hopeless on a Pi.
settle_box() {
  local cores; cores=$(nproc 2>/dev/null || echo 4)
  local i l
  for i in $(seq 1 20); do
    l=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo 0)
    awk -v l="$l" -v c="$cores" 'BEGIN{exit !(l+0 < c+0)}' && return 0
    sleep 3
  done
  echo "  (settle: load still $l on ${cores} cores after 60s — proceeding anyway)"
  return 0
}

run_one() {
  local f="$1" to="$2" tier="$3"
  local name; name=$(basename "$f" .js)
  local log="$LOGDIR/${tier}_${name}.log"
  if [ "$tier" = browser ] || [ "$tier" = drills ]; then reap_browsers; sleep 1; settle_box; fi
  local start; start=$(date +%s)
  # -k: escalate to SIGKILL 45s after SIGTERM. Plain `timeout` only sends TERM
  # and then waits FOREVER if the child ignores it — a Playwright suite holding
  # five chromiums does exactly that, and one hung suite stalled this gate for
  # 50 minutes past its own deadline with no output. A gate that cannot
  # guarantee forward progress is the failure mode it exists to prevent.
  timeout -k 45 "$to" node "$f" > "$log" 2>&1
  local rc=$? secs=$(( $(date +%s) - start ))
  # Reap anything the suite leaked, or the next suite inherits its browsers.
  reap_browsers
  local pass fail verdict reason flaked=0
  pass=$(grep -cE '^ *PASS' "$log"); fail=$(grep -cE '^ *FAIL' "$log")
  # ONE retry for a red/dead browser-class suite. This is a DIAGNOSTIC, not a
  # licence: it separates "deterministically broken" (fails twice, blocks the
  # gate absolutely) from "lost a timing lottery" (FLAKY, named in the summary).
  #
  # It is NOT a reason to leave a flake alone. Every FLAKY line is a BUG with a
  # known address, and the fix is nearly always one of two things: a wall-clock
  # deadline standing in for a correctness claim (assert the state change, not
  # the stopwatch), or a locator/sample taken at one instant of a process that
  # is only eventually consistent. Both are fixable in the suite, and fixing
  # them is the work — not tuning this retry.
  # EXIT 3 = NEEDS-FLEET (test/lib/fleet.js): the suite REFUSED to render a
  # verdict because it was not given the isolated machines its assertions
  # require. Never retried — running it again on the same one box is the same
  # lie twice — and never dressed up as a product red.
  if [ "$rc" -eq 3 ]; then
    verdict=NEEDSFLEET
    reason="$(grep -m1 -E '^NEEDS-FLEET' "$log" | cut -c1-120)"
    needfleet=$((needfleet+1)); needlist="$needlist $tier/$name"
    printf 'NEEDS-FLEET\t%s\t%s\t%s\n' "$tier/$name" "${secs}s" "$reason" >> "$RESULTS"
    printf '%-5s %-38s %6s  %s\n' FLEET "$tier/$name" "${secs}s" "$reason"
    return
  fi
  if [ "$rc" -ne 0 ] && ! is_quarantined "$name"; then
    reap_browsers; sleep 1
    timeout -k 45 "$to" node "$f" > "$log.retry" 2>&1
    local rc2=$?
    reap_browsers
    if [ "$rc2" -eq 0 ]; then
      flaked=1; rc=0
      pass=$(grep -cE '^ *PASS' "$log.retry"); fail=0
    fi
  fi
  if [ "$rc" -eq 0 ] && [ "$flaked" -eq 1 ]; then
    verdict=FLAKY; reason="${pass} assertions on RETRY — first run red ($(grep -m1 -E '^ *FAIL|Error' "$log" | cut -c1-60)); fix the wait"; flaky=$((flaky+1)); flakes="$flakes $tier/$name"
  elif [ "$rc" -eq 0 ]; then
    verdict=GREEN; reason="${pass} assertions"; green=$((green+1))
  elif [ "$pass" -eq 0 ] && [ "$fail" -eq 0 ]; then
    verdict=DEAD
    reason="exit ${rc}, ZERO assertions — never ran TWICE :: $(grep -m1 -oE "[A-Za-z]+Error[^\"]{0,80}|[a-zA-Z._]+ is not a function|executable doesn't exist[^ ]*" "$log" | head -1)"
    dead=$((dead+1))
  elif [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    verdict=RED; reason="TIMEOUT ${to}s TWICE (${pass} passed, ${fail} failed first)"; red=$((red+1))
  else
    verdict=RED; reason="RED TWICE: ${fail} failed / ${pass} passed :: $(grep -m1 -E '^ *FAIL' "$log" | sed 's/^ *FAIL *— *//' | cut -c1-80)"; red=$((red+1))
  fi
  # Reclassify against the quarantine list before recording the verdict.
  #
  # ESCAPED means "somebody fixed it — promote it". The old test was "green on
  # ANY attempt", which assumed every quarantined suite is DETERMINISTICALLY
  # red. mirror-drill is not: its own quarantine entry says "roughly 2-4 runs in
  # 6 are green", and measured 2026-08-02 on an idle 8-core box it was 3/6. So a
  # single lucky green raised ESCAPED, ESCAPED blocks the gate, and the gate
  # therefore COULD NOT GO GREEN — not because anything was broken, but because
  # a coin-flip suite was on a list that assumes coins have one face.
  #
  # Re-roll until it lands red is not an option; that is gaming the gate. So
  # implement the bar quarantine.txt already states in words — "promote when E
  # RELIABLY claims B primary + F standby" — and require CONSISTENTLY green:
  # best-of-3, all three green. One red in three and it is still the known
  # nondeterministic behaviour, reported as QUAR and not blocking.
  # This does not soften a product assertion: the suite's own checks are
  # untouched, and a genuinely fixed suite (3/3) still blocks until promoted.
  if is_quarantined "$name" && is_nondet "$name" && { [ "$verdict" = GREEN ] || [ "$verdict" = FLAKY ]; }; then
    # Declared nondeterministic: a green proves nothing, so report and move on.
    [ "$verdict" = GREEN ] && green=$((green-1)) || flaky=$((flaky-1))
    quar=$((quar+1))
    printf 'QUAR\t%s\t%s\t%s\n' "$tier/$name" "${secs}s" "known-unfixed (quarantined), NONDETERMINISTIC :: GREEN this run — not proof of a fix; promote only on the measured rate in quarantine.txt" >> "$RESULTS"
    printf '%-5s %-38s %6s  %s\n' QUAR "$tier/$name" "${secs}s" "known-unfixed, NONDETERMINISTIC :: green this run, not proof of a fix"
    return
  fi
  if is_quarantined "$name" && { [ "$verdict" = GREEN ] || [ "$verdict" = FLAKY ]; }; then
    confirm_green=1
    for _try in 2 3; do
      reap_browsers; sleep 1
      timeout -k 45 "$to" node "$f" > "$log.q$_try" 2>&1 || { confirm_green=0; break; }
    done
    reap_browsers
    if [ "$confirm_green" = 0 ]; then
      # Still nondeterministic — the quarantine entry stands.
      [ "$verdict" = GREEN ] && green=$((green-1)) || flaky=$((flaky-1))
      verdict=QUAR; quar=$((quar+1))
      reason="known-unfixed (quarantined), NONDETERMINISTIC :: green once, red again on a best-of-3 re-check — entry stands"
      printf '%s\t%s\t%s\t%s\n' "$verdict" "$tier/$name" "${secs}s" "$reason" >> "$RESULTS"
      printf '%-5s %-38s %6s  %s\n' "$verdict" "$tier/$name" "${secs}s" "$reason"
      return
    fi
  fi
  if is_quarantined "$name"; then
    if [ "$verdict" = GREEN ] || [ "$verdict" = FLAKY ]; then
      [ "$verdict" = GREEN ] && green=$((green-1)) || flaky=$((flaky-1))
      verdict=ESCAPED; escaped="$escaped $name"
      reason="QUARANTINED SUITE IS GREEN 3/3 — fix confirmed; promote it back into the gate and delete it from quarantine.txt"
    else
      [ "$verdict" = RED ] && red=$((red-1)) || dead=$((dead-1))
      verdict=QUAR; quar=$((quar+1))
      reason="known-unfixed (quarantined) :: $reason"
    fi
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
      # e2e-anyroad is the heaviest suite in the gate — 218 checks over TWO full
      # browser boots (the second is the HILLS CODA: a fresh context, a
      # re-install of the App GIF, and up to 50s waiting for a hilly world to
      # build). It went GREEN under a 700s budget on this box on 2026-08-09
      # (~/gate-logs/anyroad-verify7.log) and then GREW — street names, the
      # flare, the tile-map report, the satellite forest classifier — so at 600s
      # the gate killed it mid-run TWICE at 208/218 checks with ZERO failures
      # and called that a product red. Nothing here softens an assertion: every
      # check still has to pass, the suite just gets the clock the other heavy
      # suites already have. If it outgrows 900s too, SPLIT THE CODA into its
      # own file rather than raising this again — the tier discovers files, so a
      # new suite is gated the day it lands.
      # e2e-anyroad-mp joins the 900s list for the same reason its sibling did,
      # and it earned it the same way: it TIMED OUT TWICE at 600s with 68
      # passed and 0 failed — no assertion in trouble, just a suite doing TWO
      # full doors (a meeting showing an app, then the app AS the room) with
      # THREE browsers each over a software rasteriser, plus a steering block
      # that must wait for real frames. Nothing here softens an assertion. The
      # standing answer for both anyroad suites is the same: SPLIT THE DOORS
      # rather than raise this again.
      e2e|e2e-anyroad|e2e-anyroad-mp|e2e-away-holdover|e2e-vis-park|e2e-meet-mod|e2e-pip) run_one "$f" 900 browser ;;
      *) run_one "$f" 600 browser ;;
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
    # THE STACK MUST BE UP HERE. The drills tier runs stop_all ("they bring
    # their own; keep the ports clear") and nothing restarts it — so behavior,
    # two tiers later, found NOTHING listening and every scenario AND the
    # self-test died with "stack unreachable" before running a single
    # assertion. That is a gate bug, not a product red, and it reported as 8
    # identical FAILs which reads exactly like a real regression.
    { port_up 8099 && port_up 8790; } || start_site_relay
    # The drills tier just ran mirror-drill (8 browsers) and friends. Behavior
    # scenarios are the longest, most timing-sensitive things in the gate and
    # they run LAST, so start them from a clean box rather than on top of the
    # previous tier's residue. behavior.sh also reaps between its own scenarios.
    reap_browsers; sleep 2
    # relay-dev.sh (the REAL Worker under wrangler) drives the deploy scenarios;
    # without it 04b/16b SKIP loudly rather than pretending to pass. And a SKIP
    # is NOT free here: behavior.sh exits non-zero when anything skipped, so the
    # tier scores RED and THE GATE CAN NEVER GO GREEN. Every run before
    # 2026-08-01 hit exactly this — "RED behavior/core 7228s" after two hours,
    # with a log underneath reading "21 passed, 0 failed, 1 skipped", which
    # reads like a product regression and is nothing of the kind. So START it
    # rather than narrate its absence. Booting it makes 04b PASS in ~82s.
    if ! port_up 8794; then
      echo "  relay-dev not on :8794 — starting it (a SKIP here scores the tier RED)"
      # setsid: `npx wrangler` is a THREE-deep tree (npx shim -> node cli.js ->
      # workerd) and the middle node re-parents to init, so neither the pid nor
      # a descendant walk is a reliable handle — measured, the orphaned cli.js
      # kept respawning workerd after every kill. A session of its own makes the
      # whole tree one process GROUP we can signal atomically.
      setsid bash test/servers/relay-dev.sh >"$LOGDIR/relay-dev.log" 2>&1 &
      RELAYDEV_PID=$!
      for _i in $(seq 1 40); do port_up 8794 && break; sleep 2; done
      if port_up 8794; then
        echo "  relay-dev up on :8794"
      else
        # Do not spend two hours to report an avoidable SKIP as a product red.
        echo "!! relay-dev did not come up on :8794 (see $LOGDIR/relay-dev.log)." >&2
        echo "   wrangler needs node >= 22. The behavior tier would SKIP 04b/16b and" >&2
        echo "   score RED, which can never satisfy the gate — refusing instead." >&2
        exit 3
      fi
    fi
    start=$(date +%s)
    if [ "$BEHAVIOR" = full ]; then bash test/batteries/behavior.sh > "$LOGDIR/behavior.log" 2>&1
    else bash test/batteries/behavior.sh --core > "$LOGDIR/behavior.log" 2>&1; fi
    rc=$?; secs=$(( $(date +%s) - start ))
    # ONE RETRY, of the FAILED SCENARIOS ONLY — the same diagnostic every other
    # tier gets, and behavior needs it most, being the most timing-sensitive
    # thing in the gate. It does not excuse a flake. Retrying the whole
    # battery would cost another ~50 minutes, and behavior.sh already takes
    # scenario prefixes, so re-run just the names it reported.
    #
    # A scenario that fails on an IDLE box is reported LOUDLY as FLAKY — a
    # standing work queue — not silently absorbed, and not allowed to block a
    # release on a coin flip either.
    #
    # The example this rule was written for was 08a-techsupport-reload-mash,
    # measured 8/12 green on 2026-08-02 at loadavg 0.58: the open fast-rejoin
    # race (#2), reproducing identically from the 0.8.8 cut commit's own tree.
    # RE-MEASURED 2026-08-11 on two idle boxes: 8 of 8 green, 8 assertions
    # each, including both fragment checks and the final one-tree census. Under
    # the old rate eight straight greens land about 4% of the time, so the race
    # is very likely dead — killed somewhere in the container-identity campaign
    # and the claimRedun first-claim fix, both of which landed after the old
    # measurement. Not declared fixed on 8 runs alone; if it reds again, it is
    # that race and the number to beat is 8/8.
    behretry=0
    if [ $rc -ne 0 ]; then
      failed_scen=$(grep -m1 '^failed:' "$LOGDIR/behavior.log" | cut -d: -f2-)
      if [ -n "$failed_scen" ]; then
        echo "  behavior: retrying only:$failed_scen"
        reap_browsers; sleep 2
        # shellcheck disable=SC2086
        bash test/batteries/behavior.sh $failed_scen > "$LOGDIR/behavior-retry.log" 2>&1
        if [ $? -eq 0 ]; then rc=0; behretry=1; fi
        secs=$(( $(date +%s) - start ))
      fi
    fi
    tail -1 "$LOGDIR/behavior.log" | grep -q 'BEHAVIOR BATTERY' && tally=$(tail -1 "$LOGDIR/behavior.log") || tally="see $LOGDIR/behavior.log"
    if [ $rc -eq 0 ] && [ $behretry -eq 1 ]; then
      v=FLAKY; flaky=$((flaky+1)); flakes="$flakes behavior/$failed_scen"
      tally="GREEN on RETRY of$failed_scen — first pass red ($tally); fix the race"
    elif [ $rc -eq 0 ]; then v=GREEN; green=$((green+1)); else v=RED; red=$((red+1)); fi
    printf '%s\t%s\t%s\t%s\n' "$v" "behavior/$BEHAVIOR" "${secs}s" "$tally" >> "$RESULTS"
    printf '%-5s %-38s %6s  %s\n' "$v" "behavior/$BEHAVIOR" "${secs}s" "$tally"
    grep -E '^FAIL' "$LOGDIR/behavior.log" | head -8 | sed 's/^/        /'
  fi
fi

# ---- verdict -----------------------------------------------------------------
echo
echo "=================== RELEASE GATE ==================="
printf '  GREEN %d   FLAKY %d   RED %d   DEAD %d   QUARANTINED %d   NEEDS-FLEET %d\n' "$green" "$flaky" "$red" "$dead" "$quar" "$needfleet"
if [ "$flaky" -gt 0 ]; then
  echo
  echo "  FLAKY — red once, green on the immediate retry (NOT blocking, but each is a"
  echo "  wait to fix; a growing list here is the gate rotting):"
  awk -F'\t' '$1=="FLAKY" {printf "    %-34s %s\n", $2, $4}' "$RESULTS"
fi
if [ "$red" -gt 0 ] || [ "$dead" -gt 0 ]; then
  echo
  echo "  BLOCKING:"
  awk -F'\t' '$1=="RED"||$1=="DEAD" {printf "    %-5s %-34s %s\n", $1, $2, $4}' "$RESULTS"
fi
if [ "$needfleet" -gt 0 ]; then
  echo
  echo "  NEEDS-FLEET — these REFUSED to render a verdict on one box, on purpose."
  echo "  Their assertions are about timing or a simulation, and one machine cannot"
  echo "  tell a product bug from a busy kernel. Run them on the fleet; a guard"
  echo "  nobody ran is a guard nobody has, so this BLOCKS a cut:$needlist"
  awk -F'\t' '$1=="NEEDS-FLEET" {printf "    %-34s %s\n", $2, $4}' "$RESULTS"
fi
if [ -n "$escaped" ]; then
  echo
  echo "  BLOCKING — quarantined suites that now PASS (promote them, delete from quarantine.txt):$escaped"
fi
if [ "$quar" -gt 0 ]; then
  echo
  echo "  known-unfixed (not blocking, may only ever shrink):"
  awk -F'\t' '$1=="QUAR" {printf "    %-34s %s\n", $2, $4}' "$RESULTS"
fi
[ -n "$skipped_tiers" ] && echo "  NOT RUN HERE:$skipped_tiers"
[ -n "$ONLY" ] && echo "  PARTIAL RUN (--only=$ONLY)"
echo "  full logs: $LOGDIR   machine-readable: $RESULTS"
echo "===================================================="

if [ "$LIST" = 1 ]; then exit 0; fi
if [ "$red" -gt 0 ] || [ "$dead" -gt 0 ] || [ -n "$escaped" ]; then
  echo "DO NOT CUT — the gate is red."; exit 1
fi
if [ "$needfleet" -gt 0 ]; then
  echo "DO NOT CUT — $needfleet suite(s) never ran: they need isolated machines."; exit 1
fi
if [ -n "$skipped_tiers" ] || [ -n "$ONLY" ]; then
  echo "GATE NOT SATISFIED — everything run was green, but not everything ran."; exit 2
fi
echo "GATE GREEN — clear to cut."; exit 0
