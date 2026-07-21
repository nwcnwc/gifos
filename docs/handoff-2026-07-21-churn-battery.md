# Handoff — 2026-07-21 (churn battery + cascade rejoin)

**Tip when this was written:** commit about to land = regression-pipeline work below.
**Prior tip on main:** `7207598` — free rejoin phantoms without freeing silent/live peers.

Do **not** re-litigate three-state loss-wedge or only-scoot-up join shape — those shipped.

---

## What shipped this session (product)

| Commit | What |
|--------|------|
| `b3576c9` | H7 dense fill + column scoot UP only (N=9 serial shape) |
| `016692d` | FINDLEAF only to first-hand live; same-row left-pack |
| `7207598` | **Cascade rejoin:** `cellReserved` / `occIsPhantom` / `admitterReachable` — free chairs only when claimant requeued/moved, not silent death or “I don’t hear them yet”. Atomic-move D → 9/9. |

**Production:** main auto-deploys; mesh.js has three-state + H7 + phantom rejoin.

---

## What this handoff finishes (regression pipeline)

**New / updated (commit with this handoff):**

| Path | Role |
|------|------|
| `sim/repro-churn-combos.sh` | Combined disruptions: loss+kill, cascade+1 late joiner, sever live link, silent front-row wipe |
| `test/batteries/mesh-churn.sh` | Full **leave/crash/churn/comms** battery (`--quick` = sim+JS only) |
| `test/batteries/join.sh` | Also runs loss-wedge, atomic-move, churn-combos |
| `test/README.md` | Documents both batteries + sim disruption catalogue |

### How to run (after pull)

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"   # or nvm use 22
# Seating/healing changes:
test/batteries/mesh-churn.sh --quick    # sim + harness; ~15–40 min (includes sweep)
# Join changes:
test/batteries/join.sh --quick
# Full (browsers — prefer nvidia):
ssh nvidia-laptop 'cd ~/projects/gifos && git pull && nvm use 22 && test/batteries/mesh-churn.sh'
```

Logs: `/tmp/mesh-churn-battery/<n>.log`, `/tmp/join-battery/<n>.log`.

---

## Known residual product bugs (not closed)

1. **Multi-newcomer after cascade** — after triple front-row LEAVE + settle 9/9, `spawn 3` reliably leaves **2 searching forever** (only 1 of 3 seats). Pin is **spawn 1 → 10/10** in churn-combos B. Follow-up: open **row 2 admission** after row 1 full under residual greeter/FIND churn (not phantom free-seat).
2. **Browser on nvidia (2026-07-21):** adversary **ALL PASS**; ladder **burst ALL PASS**; **serial N=2** incomplete link; **latejoin** 1 fail (conn ok, vid false). Penguin load false-fails adversary — recheck serial N=2 / latejoin on idle nvidia, not as seating math.
3. **Do not** treat non-firstHandLive occ as free (FIND ping-pong greeters). Phantom = alive-but-not-at-cell only.

---

## State mid-flight when wrapping

- `mesh-churn.sh --quick` was **running** (through step ~churn-combos GREEN, into **sweep**). Re-run to confirm full green after pull.
- Working tree before commit: README + join.sh + new scripts uncommitted.

---

## Next session priority

1. `git pull` → `mesh-churn.sh --quick` green end-to-end.
2. Product: multi-newcomer after cascade (why /2.0 never admits).
3. Optional: nvidia full `mesh-churn.sh` + fix serial N=2 link completeness if still red.
4. Do not invent new test runners — use batteries above.
