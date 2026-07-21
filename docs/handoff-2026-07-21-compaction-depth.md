# Handoff — 2026-07-21 (battery verified; 2 fixes landed; compaction depth OPEN)

Written cold. Continues `handoff-2026-07-21-churn-battery.md`.
**Tip of main:** `eba4803` — auto-deployed.

Do **not** re-litigate three-state loss-wedge, only-scoot-up join shape, or the
vacated-row frontier rule — those shipped and are pinned.

---

## One-sentence headline

`mesh-churn.sh --quick` was **never actually verified** by the previous session
(it wrapped mid-flight) — run cold it was **RED, 12/14**; two real bugs are now
fixed and landed (**13/14**), and the one remaining red — **Q2 compaction
lone-row density** — is bisected to `7207598` and characterised but NOT fixed.

---

## What shipped this session (on `main`)

| Commit | What |
|---|---|
| `a1a3f43` | **Vacated row is the frontier, not a corpse.** Closes churn-battery residual #1 (multi-newcomer after cascade). |
| `626373a` | Healer must not promote into a chair it can SEE is occupied (first form — too broad, see below). |
| `eba4803` | **Narrowed that guard to COLUMN-pack only.** Closes the sweep D5 sever regression. |

### 1. Multi-newcomer after cascade (`a1a3f43`)

Handoff #1 guessed "row-2 open lag / phantom free-seat". It was neither — it was
a **misclassification**.

After the cascade, left-pack scoots survivors up and legitimately empties the
last row. `serveFind` then read that row as "once-seen, now silent" and took the
**RESURRECTION** branch, whose designated admitters are the greeters of the row
*below* — which in a shrinking room is never live. The FIND fell through, no
admissible cell was found past the frontier, and every newcomer beyond the one
hole the cascade left searched forever.

Resurrection exists for a row that died **wholesale**: its stale `occ` lingers
because nobody is left to sweep it, and *that reservation* is what blocks
ordinary admission. A drained row holds **no reservation at all**.

Fix: gate the branch on `rowHeld[t]` (any cell still `cellReserved`). An
unreserved once-seen row falls through to ordinary admission by the head of the
row above — already proven full by the H7 dense-fill gate.

Pin **strengthened**: churn-combos B went from `spawn 1` (the workaround) to
`spawn 3 -> 12/12`.

### 2. Sweep D5 sever (`626373a` + `eba4803`)

Bisected cleanly to `7207598`. `sever 0 6` dropped the room to **197/200**.

Trace (tick granularity 6):
```
tick 786   WHERE 6 state=3 coord=/0.2   WHERE 3 state=3 coord=/1.2
tick 792   WHERE 6 state=3 coord=/0.2   WHERE 3 state=3 coord=/0.2   <- BOTH claim
tick 798   WHERE 6 state=1 coord=-      WHERE 3 state=3 coord=/0.2   <- incumbent evicted
```
Seat 0 (row head, severed from 6) confirms `/0.2` dead via the D5 early probe —
**correct from its blind vantage** — and hands the hole down. Seat 3, the
vertical down-child at `/1.2`, column-packs UP into `/0.2` while seat 6 is still
sitting there **alive and directly linked to seat 3**. E2's id tie-break takes
the incumbent (3 < 6), cascading to seats 35 and 147.

The mover never asked the one question it was best placed to answer: *can I hear
the occupant myself?*

**The narrowing matters — read this before touching it.** The first fix guarded
`promoteInto` unconditionally on `firstHandLive(hole)`. That fixed the sever leg
and **broke three others**: churn seed 5 kill=0.4 (`s1=22/25`), partition seed 7
(`B strand=20`), D5 crash leg (198/199). `live[]` ages out over 60 ticks, so for
left-pack/findLeaf the guard only *delays* a legitimate heal — but it **drops the
FINDLEAF instead of forwarding it**, and after a mass kill every hole looks fresh
at once, so the delay compounds into permanently unfilled home cells.

The race is specific to the **VERTICAL** healer: its owner is its direct up-link,
so it is the one mover routinely still linked to the seat it would displace.
`colPack` only. **Do not broaden this guard.**

---

## OPEN: Q2 compaction lone-row density

`sim/repro-compaction.sh` leg 1 FAILS. Bisected cleanly to **`7207598`** (same
commit as the sever bug, different mechanism).

```
016692d  ON lone=10 sec=22 depth=3 | OFF lone=12 sec=38 depth=3   PASS
7207598  ON lone=28 sec=35 depth=4 | OFF lone=26 sec=37 depth=5   FAIL
```
The assertion is `onLone < offLone` — compaction must **reduce** lone-row deep
sections. That is its stated media-plane payoff (docs/roadmap.md §3, law T).

**Correctness is NOT affected** anywhere: `CHECK PASS`, 158/158, dups=0,
stranded=0. Legs 2 (no oscillation) and 3 (mass-kill correctness) PASS. Only the
density guarantee fails.

### What is actually regressed — it is NOT compaction

Compaction's own work is unchanged: `cMoves 63 -> 62`, `cAdmits 75 -> 67`,
`cProbes 3754 -> 3868`. What changed is where **admission** puts people:

```
016692d  byDepth 0:25, 1:78, 2:54, 3:1          frontier(d1=47, d2=321)
7207598  byDepth 0:25, 1:46, 2:27, 3:51, 4:9    frontier(d1=79, d2=198)
```
Depth-1 lost 32 seats, depth-2 lost 27, depth-3 gained **50**. Seats land far
deeper, so compaction has more lone deep sections than its up-chain walk can
collapse. The tree is being built worse, then compaction is blamed for it.

### Where to look

`7207598` swapped `cellTaken` -> `cellReserved` in `serveFind`'s S1 scan and
relaxed the frontier test from `occGet(down)>=0` to
`cellReserved(dk) && !occIsPhantom(dk)`. More cells now look admissible, which
changes both the S1 admit decision and — via the
`if(s1admFree>0){ NOROOM; return; }` early return at the end of the S1 branch —
how often a seeker is bounced instead of being placed deep.

**Do NOT simply revert `7207598`.** It fixed atomic-move leg D (7/9 -> 9/9):
gossip re-seeds `occ` for people who already requeued elsewhere, and those
ghosts blocked admission forever. Any fix must keep leg D green.

Suggested approach (sim-first, as always):
1. Instrument which branch of `serveFind` places the deep seats in the shrink
   scenario (`seed 2`, N=300, four `kill 0.15` rounds).
2. Suspect the `s1admFree>0 -> NOROOM` early return: with phantoms counted free,
   S1 looks to have room when it does not, so seekers bounce and re-enter deep
   instead of packing shallow.
3. Pin whatever you find as its own leg in `repro-compaction.sh` before fixing.

---

## Battery status (cold, on nvidia, `eba4803`)

`test/batteries/mesh-churn.sh --quick` — **13 passed, 1 failed**
(only `sim — Q2 compaction`).

`test/batteries/join.sh --quick` — **12 passed, 3 failed**:

| Failure | Verdict |
|---|---|
| `sim — Q2 compaction` | REAL, open — above |
| `adversary — dark peers` | **Pre-existing.** Fails identically on baseline `0b97bf0`. Population-within-2 with dark peers; 0 REACHABLE dups, 0 non-founder MINT. Not split founding. |
| `late join — socketless seats` | **Flake.** `conn:true, vid:false`. Re-ran on `eba4803`: **3/3 ALL PASS** with `vid:true`. Media/transport, not seating. |

---

## Operating notes (earned this session)

- **Run batteries on nvidia, not penguin.** Penguin is 4 cores; the quick battery
  includes the N=800 sweep.
- `pkill -f "chrome-linux/chrome"` over ssh **kills your own ssh session** — the
  pattern matches the command line carrying it. Use `"chrome-linu[x]/chrome"`.
- To gate `site/js/mesh.js` before it hits auto-deploying `main`: push a temp
  branch, `git reset --hard` nvidia to it, run the batteries, then fast-forward
  `main`. `git am` of a patch onto nvidia failed; the branch route is cleaner.
- The battery **caught a bad fix of mine** (the over-broad healer guard) that all
  the single-purpose repros missed. Trust it; run it cold before believing any
  seating/healing change.

---

## Next session priority

1. **Compaction depth regression** (above) — the last red. Sim-first; keep
   atomic-move leg D green.
2. Optional: full `mesh-churn.sh` (browsers) on an idle nvidia.
3. Roadmap leftovers: x402, e2e-video "via Hub" flake, sharded greeters, door
   verbs off relay, scale release.
