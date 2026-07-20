#!/bin/bash
# repro-adversary.sh — JOINING UNDER HOSTILE NETWORK CONDITIONS.
#
# The browser drill (test/drills/adversary-room.js) proves a misbehaving
# participant cannot poison a real room, but it can only afford ~11 browsers on
# one box. The sim can ask the same question of hundreds of seats,
# deterministically, and with faults a browser cannot easily be made to have —
# so this is where the adversarial claim is actually established, and the drill
# becomes the confirmation that reality agrees.
#
# The fabric knobs (all set BEFORE init, mirroring the fault the real world
# supplies for free):
#   net loss=F        every message drops with probability F
#   net sever=F       links die at rate F and stay dead
#   net subnets=N density=D    N subnets, only a D fraction of subnet PAIRS can
#                     reach each other — i.e. peers that genuinely CANNOT
#                     connect, which is the dark-peer case
#   sever A B T       cut one specific link for T ticks; both ends observe the
#                     transport death, exactly as a closed DataChannel does
#
# THE DARK-SEAT LEG is the one that matters most. It severs a seated seat from
# every one of its neighbours — it holds its coord, answers nothing, and is
# unreachable in both directions — and then sends twenty newcomers at the room.
# They must all seat. That is the sim twin of an exhausted or hostile client,
# and the property under test is the same: a participant that will not
# cooperate must never stop anyone else from getting in.
set -u
cd "$(dirname "$0")/.."
BIN=${MESH_BIN:-/tmp/mesh-adv}
g++ -O2 -std=c++17 -o "$BIN" sim/mesh.cpp || exit 9
fail=0

# verdict <label> <expected-seated> <output>
verdict() {
  local label="$1" want="$2" out="$3"
  local seated unseat dups
  seated=$(echo "$out" | grep -m1 '^STATE' | grep -oE 'seated=[0-9]+' | cut -d= -f2)
  unseat=$(echo "$out" | grep -m1 '^BAD'   | grep -oE 'unseated=[0-9]+' | cut -d= -f2)
  dups=$(  echo "$out" | grep -m1 '^DUPS'  | grep -oE '[0-9]+' | head -1)
  if [ "${seated:-0}" = "$want" ] && [ "${dups:-1}" = "0" ]; then
    echo "PASS  $label  seated=$seated dups=$dups"
  else
    echo "FAIL  $label  seated=${seated:-?}/$want unseated=${unseat:-?} dups=${dups:-?}"
    fail=$((fail+1))
  fi
}

echo "── lossy fabric ──────────────────────────────────────────────"
for L in 0.02 0.05 0.10 0.20; do
  out=$(printf "net loss=%s\njoinmode burst\ninit 150\nconverge 600000\nstate\nbad\ndups\nquit\n" "$L" | "$BIN" --service 2>/dev/null)
  verdict "burst 150, packet loss $L" 150 "$out"
done

echo
echo "── links dying underneath the room ───────────────────────────"
for S in 0.005 0.02; do
  out=$(printf "net sever=%s\njoinmode burst\ninit 150\nconverge 600000\nstate\nbad\ndups\nquit\n" "$S" | "$BIN" --service 2>/dev/null)
  verdict "burst 150, link severance rate $S" 150 "$out"
done

echo
echo "── peers that genuinely cannot reach each other ──────────────"
for CFG in "subnets=4 density=0.80" "subnets=6 density=0.60"; do
  out=$(printf "net %s\njoinmode burst\ninit 150\nconverge 600000\nstate\nbad\ndups\nquit\n" "$CFG" | "$BIN" --service 2>/dev/null)
  verdict "burst 150, $CFG" 150 "$out"
done

echo
echo "── THE DARK SEAT: a seat that holds its cell and answers nothing ──"
# Seat a room, blind one Section-1 seat completely, then send newcomers at it.
# /0.0 is chosen deliberately: it is the designated admitter for the head of the
# row below (H7), so if a dark seat can wedge admission, this is where it shows.
for TARGET in "/0.0" "/1.0"; do
  ids=$(printf "init 30\nconverge 200000\nfind %s\nquit\n" "$TARGET" | "$BIN" --service 2>/dev/null \
        | grep '^FIND' | grep -oE 'seat [0-9]+' | awk '{print $2}')
  [ -z "${ids:-}" ] && { echo "SKIP  dark $TARGET (nobody seated there)"; continue; }
  # its neighbours, from the seat dump's trailing "coord=id" pairs
  nbrs=$(printf "init 30\nconverge 200000\nseat %s\nquit\n" "$ids" | "$BIN" --service 2>/dev/null \
         | grep '^SEAT' | grep -oE '[0-9]+_[0-9]+_[0-9]+=[0-9-]+|/[0-9]+\.[0-9]+=[0-9-]+' | cut -d= -f2 | grep -v '^-1$' | sort -u)
  sev=""; for n in $nbrs; do sev="$sev\nsever $ids $n 500000"; done
  out=$(printf "init 30\nconverge 200000%b\nspawn 20\nconverge 600000\nstate\nbad\ndups\nquit\n" "$sev" | "$BIN" --service 2>/dev/null)
  # the dark seat itself may be evicted and its cell healed — that is CORRECT
  # behaviour, not a failure. What must hold is that all 20 newcomers got in and
  # nobody ended up sharing a coord.
  seated=$(echo "$out" | grep -m1 '^STATE' | grep -oE 'seated=[0-9]+' | cut -d= -f2)
  dups=$(echo "$out" | grep -m1 '^DUPS' | grep -oE '[0-9]+' | head -1)
  if [ "${seated:-0}" -ge 49 ] && [ "${dups:-1}" = "0" ]; then
    echo "PASS  dark seat at $TARGET, 20 newcomers after it  seated=$seated/50 dups=$dups"
  else
    echo "FAIL  dark seat at $TARGET, 20 newcomers after it  seated=${seated:-?}/50 dups=${dups:-?}"
    fail=$((fail+1))
  fi
done

echo
[ $fail = 0 ] && { echo "ALL PASS — a hostile fabric and an uncooperative seat do not stop joining"; exit 0; }
echo "$fail FAILED"; exit 1
