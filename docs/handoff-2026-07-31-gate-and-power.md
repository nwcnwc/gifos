# Handoff — 2026-07-31: the power round, and the 0.8.8 gate

## 0.8.8 IS NOT CUT. The gate is not green.

Seven full gate runs (gate7 → gate13) on nvidia-laptop with `MEET_CHROME` pinned
to chromium-1193. Every red was chased to a root cause and fixed; each run then
surfaced a different marginal browser suite. **Do not cut until a run comes back
`RED 0`.** Nothing here was softened and nothing was moved to `known-unfixed`.

| gate | tree | result | red, and what it was |
|---|---|---|---|
| 7  | 3df3f50 | 105G / 1R / 5F | `redun-drill` — a REAL product bug + 2 test bugs |
| 8  | 3760fef | 108G / 1R / 2F | `behavior/core` — scenarios encoded the old battery policy |
| 9  | d5022c7 | 110G / 1R / 0F | `e2e-latejoin` — asserted main video across a link that never carries it |
| 10 | 5b15caf | 107G / 3R / 1F | three browser timeouts |
| 11 | 84c50e8 | 107G / 1R / 3F | `e2e-meet-record-app` — a full-screen app modal |
| 12 | c780a13 | 104G / 1R / 6F | `e2e-video` — liveDataLinks budget |
| 13 | 69aa870 | 2R at time of writing | `e2e-media-recovery`, `e2e-stadium-dup` |

## The one real product bug found: AN UNKEPT WAKE HELD A SECOND PIPE HOT

`fb.wakeAt` kept a demand-woken standby HOT for as long as a wake was in flight,
with **no bound**. The swap that ends a wake requires the standby to demonstrably
FLOW — so a standby that never produces a frame (camOff announcer, husk
container, a path that will never carry) armed the wake once and then held a
SECOND pipe demanded hot forever. ONE-PIPE, broken by the machinery that exists
to serve it. Fingerprint, stable for 300s:

```
claim/standby same via, distinct streams, annForSlot 1,
fb.wakeAt set, stdFdec -1, lastBytes 0, stdHot TRUE
```

Bounded at `MOS_GRACE*3`. This is healing-laws **R3a applied to the media plane**:
a wake is a promise to carry, and an unkept promise must lapse. `dark` is
deliberately left unbounded — a dark primary is still announced and is the thing
being failed away from.

## What is left red, and what is NOT the cause

`e2e-media-recovery`, `e2e-stadium-dup`, `e2e-video`'s friend-relay island leg.

**They are not caused by the power work.** Measured: gate7 (before any of it) had
`media-recovery` GREEN in 19s; gates 8 and 9, carrying every power change, had it
GREEN in 19s too. It degraded from gate10 onward with **no `site/` change at all**
between gate9 and gate10, and the gate clone is clean (`main`, no dirty files).
`e2e-stadium-dup` was already FLAKY in gate8 on this same deep-row leg.

`e2e-video`'s island leg fails ~1 in 4 **even at 90s**, so that one is genuine E5
friend-relay flakiness, not a budget — consistent with "friend-relay roam
engagement still unobserved" in the standing notes.

## Three test-fixing mistakes I made, and the lesson from each

Worth reading before touching these suites — I paid for all three.

1. **Lengthening a wait made a suite fail DETERMINISTICALLY.** `dblclickForTab`
   at 10s → 30s: 3 PASS became 3 FAIL. When the icon node is swapped mid-dispatch
   the click lands on a corpse and **no tab will ever open** — patience cannot fix
   a gesture that already missed, and a longer wait strictly reduces how many
   re-clicks fit. The function's own header said so; I did not read it first.
2. **More retries made it worse still.** 3 → 5 attempts: also 3 FAIL. A failed
   attempt is not a no-op — it has already dispatched a click, so the extras open
   stray tabs and the suite dies further downstream, at a different line each run.
3. **Check `git log` before inventing a fix.** For the record-app modal I wrote a
   "wait for `.perm-modal` to detach". It never detaches — it is an
   acknowledgement waiting for a click. `6070f77` had already solved that exact
   pop: *dismiss it, as a real user would*. Nathan's advice, and it was right.

**The general rule: audit the budget for a propagation delay; fix the gesture for
a lost click. Diagnose which one you have before touching either.**

## Audited budgets (assertions unchanged in every case)

- `e2e-media-recovery` 40s → 90s, and `e2e-video`'s 16 `liveDataLinks` gates
  40s → 90s. `a456ba6` scoped 40s as "covers exactly ONE dc-watchdog rebuild";
  under a full gate a pair can need TWO.
- `e2e-video`'s friend-relay island gates 45s → 90s. These were the only media
  budgets in the suite never audited, and they guard the hardest path in it.
- `e2e-video`'s admin-moderation leg 8-10s → 30s: an admin click must gossip to
  the guest, which then rebuilds its outbound through the blur pipe.

## Rig facts worth keeping

- Bots MUST be launched `--edge`, or they follow `version.json.current` to the
  release snapshot and land in a DIFFERENT relay session from edge-pinned
  phones — they sit at `occ=0` forever, looking exactly like a mesh bug.
- `--video` bots never seat (a 1MB mp4 base64'd into an init script stalls boot
  before the relay). Use `--cam`.
- **Prod caps ~8 connections per IP** and every home box shares one egress. The
  client says so in plain text — "Relay: too many connections from your network"
  — and no page probe surfaces it. Nathan: *the dev relay has no such cap.*
- Bot fleets are **not neutral instruments**: `MEET_CHROME` pointed at
  Playwright's Chromium changes the CODEC negotiated (no H264), which nearly
  justified an architectural change. Use real Chrome for anything codec-adjacent.

See `docs/portrait-pixel-bug-2026-07-31.md` for the power result (a phone was
encoding 3.16x the pixels its rung intended) and
`docs/decode-side-parking-is-a-noop-2026-07-31.md` for the three refuted levers.
