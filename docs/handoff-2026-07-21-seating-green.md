# Handoff — 2026-07-21 (five seating/churn bugs fixed; both batteries green)

Written cold. Supersedes `handoff-2026-07-21-compaction-depth.md` (its one open
item, compaction depth, is now fixed). **Tip of main:** `11d2bef` — deployed.

---

## One-sentence headline

`mesh-churn.sh --quick` is **14/14 green** and `join.sh --quick` is green on
every sim/JS suite; five real bugs are fixed, and the one remaining partition
gap is a **known, accepted** limitation recorded in the laws.

---

## Start here

The previous session's battery had never been run to completion. Run cold it was
**RED, 12/14**. Do not trust "it was green when I wrote it" — run the battery.

```bash
ssh nvidia-laptop        # 8 cores. Do NOT run batteries on penguin (4 cores).
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd ~/projects/gifos && git pull
test/batteries/mesh-churn.sh --quick     # seating/healing changes
test/batteries/join.sh --quick           # join/admit changes
```

---

## What was fixed

| Commit | Bug |
|---|---|
| `a1a3f43` | **Vacated row read as a corpse.** After a cascade, left-pack empties the last row; `serveFind` took the RESURRECTION branch, whose admitters are the row *below* — never live in a shrinking room. Newcomers past the frontier searched forever. Gate on `rowHeld[t]`: resurrection is for a row whose stale occ still blocks admission; a drained row holds no reservation and is simply the frontier. |
| `d0639c5` | **A mover evicted a live neighbour it could hear.** Every S1 pack move (left along the row, up the column) targets a ROOK NEIGHBOUR, so the mover is directly linked to the occupant. A head severed from its row-mate confirms it dead via D5 (correct from ITS vantage) and hands the hole to a neighbour that hears the occupant fine; the id tie-break then takes the INCUMBENT. Guard on `heldRightNow`. |
| `56e54ed` | **A reservation without a claimant.** `cellReserved` counted a bare `firstHandLive(k)` with no occ entry. `live` is keyed by coord and LEAVE only clears it when the leaver is attributable, so a vacated cell answered "live" with nobody in it — home looked full and seekers were pushed DEEP. This, not compaction, was the compaction density regression. |
| `f88ae45` | **FIND forwarded into the void.** The deep-descent forward used raw occ with no liveness test (the S1 hand-off right above it uses `admitterReachable`). A greeter emitted the FIND at a peer across a partition, where it vanished; the seeker burned its whole timeout and retried forever. |
| `11d2bef` | Laws + gate for the accepted partition freeze (below). |

### The threshold that makes the mover guard work

`firstHandLive` is a **60-tick decay window**; the D1 rook heartbeat is every
**8 ticks**. So a CRASHED occupant still satisfies `firstHandLive` through its
first 7 missed beats. Guarding a move on it blocks legitimate heals after a mass
kill (churn seed 5, split 7, D5 crash leg all broke). `heldRightNow` (3 beats,
`HELD_BEATS=24`) means "still answering me", which a corpse stops doing fast.
**Do not widen this back to `firstHandLive`.**

### Two traps I fell into — do not repeat

1. **Guarding only the column.** `eba4803` narrowed the mover guard to
   column-pack on the theory that left-pack movers are not linked to the
   occupant. **False** — row-mates are rook neighbours. The real variable was
   the threshold, not the direction. Fixed in `d0639c5`.
2. **`s1Servable`.** I made NOROOM fall through to the deep path when home's
   free cells looked orphaned. It **fast-tracks silent death past H1-S1
   ring-hold** — `repro-headless-row` leg C caught it, and took H-CHAIN and D5
   vanish down too. It also bought nothing: isolating the halves showed the
   partition gain is entirely from the reachable forward (18/20 either way).
   **The NOROOM bounce must stay unconditional.**

---

## KNOWN + ACCEPTED: a partitioned half may freeze

**Nathan's call, 2026-07-21 — accepted, do not re-litigate.** Full mechanism in
`docs/healing-laws.md` § "Partition: one half may FREEZE".

- Correctness always holds: **no duplicate seats, no split-brain**, both sides.
  That is the hard invariant and `sweep.sh` still fails on it.
- ~**1 split in 6** leaves one half frozen at ~16 of 200 seated. Measured over
  20 seeds: **18/20 clean** (17/20 before this session — it is long-standing,
  not new).
- Rejected remedies: skipping a confirmed-dead unfillable cell (costs row
  density, and the media near-field is row-scoped); letting another seat admit
  into a memberless row (healer race — "don't devolve").

`sweep.sh`'s partition leg now **hard-fails on dups only** and reports a
stranded half as a MEASURE. Rationale: the freeze is chosen behaviour, and a
gate that can never go green masks the next real regression. The 3 pinned seeds
pass/fail on luck — the true rate lives in the laws.

**Wide-seed partition measurement** (not in the battery; run when touching
partition/heal code):

```bash
# /tmp/psweep.sh <binary> <label> — 20 seeds instead of the pinned 3
for s in $(seq 1 20); do
  printf "seed $s\ninit 400 0\nconverge\nsplit 0.5\ntick 40000\nsplitstate\nquit\n" | ./mesh --service
done
```

---

## Still open

1. **Untested fault knobs.** `lat`, `qual`, `spine`, `relayk` are exercised by
   **no repro at all**. `spine=0` is the interesting one — it lets the subnet
   fabric genuinely partition, whereas `repro-adversary` only ever runs with the
   connected spine. Every timing constant assumes ~1-tick delivery, so `lat`
   would stress them. A probe script was drafted but never run.
2. Browser flakes, both pre-existing: `adversary-room` population-within-2
   (**fails identically on baseline** `0b97bf0` — 0 reachable dups, 0
   non-founder MINT) and `e2e-latejoin` `conn:true,vid:false` (**3/3 green on
   re-run** — media/transport, not seating).
3. Roadmap leftovers: x402, e2e-video "via Hub" flake, sharded greeters, door
   verbs off relay, scale release.

---

## Operating notes earned this session

- **Batteries on nvidia, never penguin.** The quick battery includes an N=800
  sweep.
- `pkill -f "chrome-linux/chrome"` over ssh **kills your own ssh session** (the
  pattern matches the command line carrying it). Use `"chrome-linu[x]/chrome"`.
- To gate `site/js/mesh.js` before it hits auto-deploying `main`: push a temp
  branch, `git reset --hard` nvidia onto it, run batteries, then fast-forward
  `main`. `git am` onto nvidia failed; the branch route is clean.
- `sim/repro-*.sh` honour `BIN=` for the OUTPUT path but always rebuild from
  `sim/mesh.cpp` — to test a variant you must swap the source in the checkout,
  not point `BIN` at a prebuilt binary. This silently invalidated one A/B run.
- The battery caught a bad fix of mine that every single-purpose repro missed.
  Run it cold before believing any seating/healing change.
