#!/bin/bash
# repro-join-patterns.sh — JOINING under every ARRIVAL PATTERN.
#
# A room does not fill one way. People trickle in one at a time; a class or a
# conference call arrives in clumps; everyone hits the link at the top of the
# hour. Each stresses admission differently — serial arrivals exercise the
# seed/handshake path with no concurrency to hide behind, batches put several
# admitters on the same frontier at once, and a burst hits genesis and the whole
# C1 frontier simultaneously. The sim's default (uniform random over an N-scaled
# window) is only ONE of those, and not the hard ones, so it was possible for
# joining to be "tested" and still have a pattern nobody had ever run.
#
# Asserts BOTH halves of a correct join:
#   1. everyone seats, no dups, no stranded
#   2. the SHAPE is H7 row-major and DENSE — row 0 fills before row 1, no holes.
#      Shape matters on its own: a 2-person meeting seated as column-mates
#      instead of row-mates is "converged" by any count-based check and wrong
#      by the media plane, whose near field is row-scoped.
set -u
cd "$(dirname "$0")/.."
BIN=${MESH_BIN:-/tmp/mesh-jp}
g++ -O2 -std=c++17 -o "$BIN" sim/mesh.cpp || exit 9

MODES=("burst" "serial 1" "serial 8" "batch 5 1" "batch 5 20" "batch 12 3" "window 0")
SIZES=(1 2 3 5 6 7 9 11 25 26 30 100 500)
fail=0

# The dense row-major prefix of length n: /0.0 /0.1 .. /0.4 /1.0 ..
expected() {
  local n=$1 out="" r=0 i=0 k=0
  while [ $k -lt "$n" ] && [ $r -lt 5 ]; do out="$out /$r.$i"; k=$((k+1)); i=$((i+1))
    if [ $i -ge 5 ]; then i=0; r=$((r+1)); fi; done
  echo "$out" | sed 's/^ //'
}

for n in "${SIZES[@]}"; do
  for m in "${MODES[@]}"; do
    q=""; for r in 0 1 2 3 4; do for i in 0 1 2 3 4; do q="$q\nfind /$r.$i"; done; done
    out=$(printf "joinmode %s\ninit %d\nconverge 400000\nstate\nbad\ndups$q\nquit\n" "$m" "$n" \
          | "$BIN" --service 2>/dev/null)
    seated=$(echo "$out" | grep -m1 '^STATE' | grep -oE 'seated=[0-9]+' | cut -d= -f2)
    unseat=$(echo "$out" | grep -m1 '^BAD'   | grep -oE 'unseated=[0-9]+' | cut -d= -f2)
    dups=$(  echo "$out" | grep -m1 '^DUPS'  | grep -oE '[0-9]+' | head -1)
    occ=$(echo "$out" | grep '^FIND' | grep -v -- '-> seat -1' | awk '{print $2}' | tr '\n' ' ' | sed 's/ $//')
    ok=1
    [ "${seated:-0}" = "$n" ] || ok=0
    [ "${unseat:-1}" = "0" ]  || ok=0
    [ "${dups:-1}" = "0" ]    || ok=0
    # shape only pinned while the room fits Section 1 (deeper rooms spill by design)
    if [ "$n" -le 25 ]; then [ "$occ" = "$(expected "$n")" ] || ok=0; fi
    if [ $ok = 1 ]; then
      echo "PASS  N=$n  joinmode='$m'  seated=$seated dups=$dups"
    else
      echo "FAIL  N=$n  joinmode='$m'  seated=${seated:-?}/$n unseated=${unseat:-?} dups=${dups:-?}"
      [ "$n" -le 25 ] && { echo "        want: $(expected "$n")"; echo "        got : $occ"; }
      fail=$((fail+1))
    fi
  done
done

echo
[ $fail = 0 ] && { echo "ALL PASS — joining is correct under every arrival pattern"; exit 0; }
echo "$fail FAILED"; exit 1
