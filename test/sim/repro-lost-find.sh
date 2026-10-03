#!/bin/bash
# repro-lost-find.sh — a lost FIND or PLACE costs a seeker one short retry, not
# the 60-tick state-2 window, in a room with two or more greeters (FINDACK +
# the admitter's PLACE replay; twin: test/mesh/find-retry.js for mesh.js).
#
# A room of 8 (all Section 1, so the seeker's roster has 7+ candidates) settles;
# then ONE seeker arrives and the fabric swallows its first FIND, or the first
# PLACE sent to it. Asserts per seed: seated within control + 24 ticks (the old
# window alone is 61), no duplicate cell, the room's shape stays the dense
# row-major prefix.
set -u
cd "$(dirname "$0")/../.."
BIN=${MESH_BIN:-/tmp/mesh-lf}
g++ -O2 -std=c++17 -o "$BIN" test/sim/mesh.cpp || exit 9
fail=0
# seat_time <seed> <lose: none|FIND|PLACE> -> "<ticks> <dups> <shape-ok>"
seat_time() {
  local seed=$1 lose=$2 cmd q=""
  cmd="seed $seed\njoinmode serial 8\ninit 8\nconverge 400000\ntick 300\nspawn 1\n"
  [ "$lose" != none ] && cmd="$cmd""losefirst $lose 8\n"
  for _ in $(seq 1 200); do cmd="$cmd""tick 1\nwhere 8\n"; done
  for r in 0 1; do for i in 0 1 2 3 4; do q="$q\nfind /$r.$i"; done; done
  local out; out=$(printf "${cmd}tick 300\ndups$q\nquit\n" | "$BIN" --service 2>/dev/null)
  local at; at=$(echo "$out" | grep '^WHERE 8 state=3' -m1 -n | cut -d: -f1)
  local first; first=$(echo "$out" | grep -n '^WHERE 8' -m1 | cut -d: -f1)
  local t=-1; [ -n "$at" ] && t=$(( (at - first) / 2 + 1 ))
  local dups; dups=$(echo "$out" | grep -m1 '^DUPS' | grep -oE '[0-9]+' | head -1)
  local occ; occ=$(echo "$out" | grep '^FIND' | grep -v -- '-> seat -1' | awk '{print $2}' | tr '\n' ' ' | sed 's/ $//')
  local ok=0; [ "$occ" = "/0.0 /0.1 /0.2 /0.3 /0.4 /1.0 /1.1 /1.2 /1.3" ] && ok=1
  echo "$t ${dups:-?} $ok"
}
for seed in 11 23 37 41 59; do
  read -r c cd cs <<<"$(seat_time $seed none)"
  for lose in FIND PLACE; do
    read -r t d s <<<"$(seat_time $seed $lose)"
    if [ "$t" -gt 0 ] && [ "$c" -gt 0 ] && [ "$t" -le $((c + 24)) ] && [ "$d" = 0 ] && [ "$s" = 1 ]; then
      echo "PASS  seed=$seed lost $lose: seated in $t ticks (control $c), dups=$d, shape ok"
    else
      echo "FAIL  seed=$seed lost $lose: seated in $t ticks (control $c, bound $((c + 24))), dups=$d, shape=$s"; fail=$((fail+1))
    fi
  done
done
echo
[ $fail = 0 ] && { echo "ALL PASS — a lost FIND or PLACE costs one short retry"; exit 0; }
echo "$fail FAILED"; exit 1
