#!/usr/bin/env bash
# v5-sweep.sh <seed>... — the V5 regime A/B: N=20000, spreadon 1, settled window.
# Arms: A=today (compaction on, unlimited climb)  B=problvl 2  C=problvl 2 + offeron 1  D=compaction off (floor)
# Counters are CUMULATIVE: the driver prints the pre-window and post-window
# `compact` lines; diff them, never compare cumulative to windowed.
set -u
cd "$(dirname "$0")"
BIN=${BIN:-/tmp/gifos-mesh-v5sweep}
g++ -O2 -std=c++17 -o "$BIN" mesh.cpp || { echo BUILD FAILED; exit 2; }
run(){ printf 'seed %s\nspreadon 1\n%sinit 20000 0\nconverge 40000\ntick 3000\ndigest reset\ncompact\ntick 6000\ncheck\ndigest\ncompact\nquit\n' "$1" "$2" | "$BIN" --service 2>/dev/null; }
for sd in "$@"; do
  for arm in A B C D; do
    case $arm in
      A) verbs="";;
      B) verbs='problvl 2
';;
      C) verbs='problvl 2
offeron 1
';;
      D) verbs='compacton 0
';;
    esac
    t0=$(date +%s)
    out=$(run "$sd" "$verbs")
    t1=$(date +%s)
    echo "=== seed=$sd arm=$arm secs=$((t1-t0))"
    grep -E "OK converged|CHECK" <<<"$out"
    grep "COMPACT " <<<"$out" | sed '1s/^/PRE  /; 2s/^/POST /'
    grep "DIGGAUGE" <<<"$out"
  done
done
