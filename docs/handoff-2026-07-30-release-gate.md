# 2026-07-30 — the Stage is fixed; the gate is not green. Read this first.

## What is DONE and LIVE (edge, verified in the prod room)

The **Stage works**. It had never once worked for a normal-sized meeting.
Nathan watched two people hold the Stage with stable feeds after the fix.

Root cause (docs/bugs-2026-07-29-media-fan-liveness.md has the full account):
a stager **claimed an echo of its own feed** off the Section-1 flood, then
re-shipped it under the same job key as its own — so `shipMos` tore the job
down and rebuilt it every 2s sweep, ripping the tracks out from under every
receiver and killing every relayed copy at the same instant. Two guards fix
it: never claim `stg:<self>`, never flood a feed to its owner.

Also shipped and verified: the echo-class guards for `sdrow`/`x2`, husk-claim
liveness (`trackLive`), the stale-seat face veto, the honest quality label
(it reported the headcount baseline, not what was actually sent), phones at
power-tier floor 2, and the relay redeploy.

## What I got WRONG (all removed/reverted — stated so nobody re-adds them)

- **born-dark**: a watchdog rail added on the theory that pipes stalled after
  a frame or two. The real cause was the echo. It violated the ONE-PIPE law
  under load (redun-drill caught a hot standby at loadavg 22) and its removal
  turned e2e-latejoin green. Cost of removal: stage failover ~3s -> ~22s
  (ordinary transport-death failover, inside the documented starve budget).
- **flood sender-skip**: I skipped shipping a feed back to its sender as
  "obvious waste". It is the second announcer that becomes the parked
  standby; skipping it deleted the stage lane's failover path. Reverted.
  (relayStg's sender-skip is ORIGINAL and stays.)
- **two tests of my own** that waited on mesh departure convergence and so
  never exercised the fix they guarded.

## THE GATE IS RED. DO NOT CUT until it is green.

Every red has been root-caused. None is a product regression. But the rule is
green-or-no-cut, and "a red you plan to explain afterwards" is exactly what
the rule forbids — so the cut is NOT taken. The cut is one command when the
gate is green: `scripts/archive-version.sh 0.8.7`, then commit + push.

### Fixed this session (test/harness defects, all pre-existing)

| red | cause | fix |
|---|---|---|
| `behavior/core` | the gate's OWN tier order: drills run `stop_all`, behavior runs two tiers later against dead ports. All 8 scenarios + selftest died before one assertion. | gate starts the stack before behavior |
| `behavior` selftest | pinned `pow.mobile === 1`; phones moved to floor 2 (deliberate policy) | assert `>= 1` |
| `e2e-video` | asserted a CAMERA-OFF peer sends frames. The 20s camera idle-stop (07-26) stops+removes the track — measured: ownW 1280 @18s, 0 @24s. The leg was really asserting "the mesh connects in under 20s". | turn a camera ON for the leg; 4 -> 103 passes |
| `e2e.js` | a neighbour icon's lazily-decoded thumbnail covered the target icon and ate the dblclick (slow boxes passed by accident) | settle on `.icon img` completeness; 58 -> 115 passes |

### NOT fixed — environment, not code

**The 4-core box cannot host this gate.** Measured at loadavg 19 on 4 CPUs
(~5x oversubscribed) while suites spawn 6-10 Chrome instances each. Proof:
identical code on an idle 8-core box —

| suite | 4-core | 8-core |
|---|---|---|
| e2e-handq | RED x3 | GREEN 26 assertions |
| redun-drill | RED | GREEN 9 |
| adversary-room | RED | GREEN 13 |
| e2e-vanish-browser | RED | GREEN 11 |

Check `/proc/loadavg` and `nproc` BEFORE trusting any gate verdict on this
box. Most of a night was spent chasing product theories (a "lone-head
topology" bug, the per-IP socket cap) for failures that were CPU starvation.

**The 8-core box is not clean either**: it runs Chromium **1208** vs 1194
here, and reds differently — `e2e.js` (tab never opens for a folder app) and
`e2e-media-recovery` (renegotiation budget, a flake already widened once on
07-29). Its remaining reds are unproven either way.

## Next steps, in order

1. Run the gate on a host with >=8 cores AND the Chromium the suites target,
   or install matching Chromium on the 8-core box. Neither host is that yet.
2. Re-verify the still-unexplained reds standalone there: `e2e.js`,
   `e2e-media-recovery`, `redun-drill` leg B/C.
3. Green gate -> `scripts/archive-version.sh 0.8.7` -> commit + push.

## Open product questions (not blockers, worth real answers)

- **Stage failover is ~22s** since born-dark's removal (was ~3s with it).
  Inside the documented budget, but slow. A law-abiding fast path — one that
  never wakes a second pipe on a merely-STARVED primary — is worth designing.
- **The 240p floor**: on a phone in any 3+ person meeting the power tier is
  SATURATED, so battery state changes nothing at all. There is no headroom
  below 240p and no fps/bitrate lever that keeps working past it. The tuning
  sweep (docs/phone-power-tuning.md) should fix this; it has NOT been run.
- **~1s lag on the stager's own view** — unexplained.
- `e2e-video` still has a documented late-leg nondeterminism (admin unblur
  propagation ~line 1057); baseline 0.8.6 fails late too, at a different line.
