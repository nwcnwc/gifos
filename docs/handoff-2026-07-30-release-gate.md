# 2026-07-30 — v0.8.7 CUT AND LIVE. The Stage works. Read this first.

## What is DONE and LIVE (edge, verified in the prod room)

The **Stage works**. It had never once worked for a normal-sized meeting.
Nathan watched two people hold the Stage with stable feeds after the fix.

Root cause (docs/bugs-2026-07-29-media-fan-liveness.md has the full account):
a stager **claimed an echo of its own feed** off the Section-1 flood, then
re-shipped it under the same job key as its own — so `shipMos` tore the job
down and rebuilt it every 2s sweep, ripping the tracks out from under every
receiver and killing every relayed copy at the same instant. Two guards fix
it: never claim `stg:<self>`, never flood a feed to its owner.

Also shipped and verified: the echo-class guards for `sdrow`/`x2`, the
stale-seat face veto, the honest quality label
(it reported the headcount baseline, not what was actually sent), phones at
power-tier floor 2, and the relay redeploy.

## What I got WRONG (all removed/reverted — stated so nobody re-adds them)

Three pieces of machinery, all built on theories that turned out wrong. The
actual Stage fix is the two-line echo guard above; everything below was
scaffolding I added before I understood the cause, and all of it did harm.

- **born-dark**: a watchdog rail on the theory that pipes stalled after a
  frame or two. It violated the ONE-PIPE law under load (redun-drill caught a
  hot standby at loadavg 22); removing it turned e2e-latejoin green.
- **trackLive**: required a claimed stream to carry a live track, on the
  theory that claims were pinned to track-dead "husks". A PARKED STANDBY is
  indistinguishable from a husk by track state, so this discarded the
  ONE-PIPE standby and FAILOVER NEVER COMPLETED (leg B, both hosts). Removed
  c9070c6 — failover resumes in ~6s and the Stage suites still ALL PASS.
- **flood sender-skip**: I skipped shipping a feed back to its sender as
  "obvious waste". It is the second announcer that becomes the parked
  standby; skipping it deleted the stage lane's failover path. Reverted.
  (relayStg's sender-skip is ORIGINAL and stays.)
- **two tests of my own** that waited on mesh departure convergence and so
  never exercised the fix they guarded.

## OUTCOME: GATE GREEN, 0.8.7 CUT (build 909, live as edge build 910)

Final gate on the 8-core host with the browser pinned:
**GREEN 107 / FLAKY 3 / RED 0 / DEAD 0** — "GATE GREEN — clear to cut."
Cut with `scripts/archive-version.sh 0.8.7`; gifos.app/version.json now reads
`current: 0.8.7` and the snapshot serves with the echo guard in it.

It took FIVE full gate runs to get there, and the first four were red for
reasons that had nothing to do with the product. That story is below, because
the next person will hit the same walls.

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

**The 8-core box needed its browser pinned.** pw.js picks the NEWEST build
installed; nvidia had 1208/1228 while this box uses 1194 (an older standalone
install under /opt/pw-browsers that its resolver prefers). `e2e.js` and
`e2e-media-recovery` red ONLY there, and red standalone too — i.e. build
sensitivity, not load. Gate 4 runs with
`MEET_CHROME=~/.cache/ms-playwright/chromium-1193/chrome-linux/chrome`
(1193 ~= the 1194 this box uses). Whether that clears them is the open
question at handoff time.

## Next steps, in order

1. DONE — 0.8.7 is live. To cut the next one, run the gate on the 8-core host
   with `MEET_CHROME=$HOME/.cache/ms-playwright/chromium-1193/chrome-linux/chrome`.
   Do NOT trust a gate verdict from the 4-core box.
2. The 3 FLAKY entries (e2e-media-recovery, e2e-meeting-app, e2e-video) are
   "fix the wait" debt — non-blocking, but the gate rots as that list grows.
3. When a suite red is ambiguous, build the topology ACROSS DEVICES with
   meet.js (1-2 clients per box) instead of arguing about it. That is what
   settled the last blocker in ten minutes.

## Open product questions (not blockers, worth real answers)

- **CORRECTED: the failover gap was `trackLive`, not born-dark's removal.**
  redun-drill leg B reported `NEVER RESUMED` on BOTH hosts, and 0.8.6 was
  green — but 0.8.6 had no born-dark either, so that could not be the cause.
  It was my own `trackLive` guard: a PARKED STANDBY is indistinguishable from
  a husk by track state (a negotiated transceiver carrying no media
  legitimately holds zero live tracks), so the guard discarded the ONE-PIPE
  standby as debris and the slot had nothing to fail over to. Proven by
  experiment: relax it and leg B resumes in 6.4s. REMOVED (c9070c6); both
  Stage suites re-verified ALL PASS without it, because the echo fix was
  always the real cure. Liveness of a CLAIM is announcer-presence; liveness
  of a PIPE is bytes, which the watchdog already measures.
- **Stage failover is ~6s** and redun-drill is back to its PRE-EXISTING
  flaky-green-on-retry state (recorded in the 0.8.6 cut-week notes): 1 of 2
  runs green on an idle 8-core host. Worth fixing the wait someday; not a
  regression.

- **The 240p floor**: on a phone in any 3+ person meeting the power tier is
  SATURATED, so battery state changes nothing at all. There is no headroom
  below 240p and no fps/bitrate lever that keeps working past it. The tuning
  sweep (docs/phone-power-tuning.md) should fix this; it has NOT been run.
- **~1s lag on the stager's own view** — unexplained.
- `e2e-video` still has a documented late-leg nondeterminism (admin unblur
  propagation ~line 1057); baseline 0.8.6 fails late too, at a different line.
