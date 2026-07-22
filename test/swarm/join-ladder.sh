#!/bin/bash
# join-ladder.sh — REAL-LIFE joining, measured the way the sim measures it.
#
#   test/swarm/join-ladder.sh [burst|serial|group] [N...]
#
# test/sim/repro-join-patterns.sh proves the control plane seats everyone, in H7
# row-major order, under every arrival pattern. This is the same ladder run in
# actual browsers against a real relay — because "the sim is fine" and "a
# meeting works" are different claims, and the gap between them is where every
# bug this month has lived.
#
# It asserts LINK COMPLETENESS, not just seating. A room can report every seat
# filled while almost none of its DataChannels exist — that was true in
# production for months, and the relay fallback hid it by carrying the
# heartbeats that the missing channels should have carried. The bar here is
# want == have: every neighbour the mesh names is a peer we are actually
# connected to.
#
# Arrival patterns, mirroring the sim's joinmode:
#   burst   every bot launched with no stagger (thundering herd)
#   serial  one bot at a time, each given time to settle first
#   group   clumps arriving together
set -u
cd "$(dirname "$0")/../.."
MODE=${1:-serial}; shift || true
SIZES=${*:-"2 3 5 6 7 11 16"}
BASE=${BASE:-http://127.0.0.1:8099}
RELAY=${RELAY:-ws://127.0.0.1:8790}
CHROME=${SWARM_CHROME:-/opt/google/chrome/chrome}
CTRL=/tmp/ctrl_ladder; LOG=/tmp/sw_ladder.log
case "$MODE" in
  burst)  RAMP=0    ;;
  group)  RAMP=250  ;;
  serial) RAMP=5000 ;;
  *) echo "usage: $0 [burst|serial|group] [N...]"; exit 2 ;;
esac

fail=0
for n in $SIZES; do
  pkill -f "swar[m].js" 2>/dev/null; sleep 3
  rm -f "$CTRL" "$LOG"
  SWARM_CHROME="$CHROME" nohup node test/swarm/swarm.js --room "lad${MODE}${n}$$" --n "$n" \
    --ramp "$RAMP" --lite --base "$BASE" --relay "$RELAY" --ctrl "$CTRL" > "$LOG" 2>&1 &
  # settle: the ramp itself, plus room to seat and wire up
  sleep $(( 30 + n * (RAMP / 1000) + n ))
  echo links > "$CTRL"; sleep 12
  up=$(grep -E 'up=' "$LOG" | tail -1)
  lk=$(grep 'LINKS' "$LOG" | tail -1)
  seated=$(echo "$lk" | grep -oE 'seated=[0-9]+' | cut -d= -f2)
  comp=$(echo "$lk" | grep -oE 'complete=[0-9]+/[0-9]+' | cut -d= -f2)
  chan=$(echo "$lk" | grep -oE 'channels=[0-9]+/[0-9]+' | cut -d= -f2)
  ok=1
  [ "${seated:-0}" = "$n" ] || ok=0
  [ "${comp:-0/1}" = "$n/$n" ] || ok=0
  [ -n "${chan:-}" ] && [ "${chan%/*}" = "${chan#*/}" ] || ok=0
  if [ $ok = 1 ]; then echo "PASS  $MODE N=$n  seated=$seated complete=$comp channels=$chan"
  else
    echo "FAIL  $MODE N=$n  seated=${seated:-?}/$n complete=${comp:-?} channels=${chan:-?}"
    echo "      $up"
    grep -A6 'LINKS' "$LOG" | grep 'missing' | head -6 | sed 's/^/      /'
    fail=$((fail+1))
  fi
done
pkill -f "swar[m].js" 2>/dev/null
echo
[ $fail = 0 ] && { echo "ALL PASS — $MODE arrivals: every seat filled, every named link connected"; exit 0; }
echo "$fail FAILED"; exit 1
