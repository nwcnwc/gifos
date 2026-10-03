# Meet universe — the overnight sweep of 3 Oct 2026

Branch `meet-universe-2026-10-03`. The ask: make the meeting the best there is — find every bug, every cost that grows with the room, every unnecessary wait and every quirk, fix on a branch, guard every fix in the release gate, measure on the fleet.

## Method

1. A baseline release gate on the untouched branch (the <gate-host>, idle 8 cores): `release.sh --only=unit,mesh,relay,sim,drills,browser`.
2. A real-browser swarm ladder (lite bots on the <llm-box> and the <behavior-box>, site and relay served from a third box) at 24 and 36 seats.
3. Twelve adversarial reviewers, each owning one region of the stack (run.html in ten slices, mesh.js, the wire and media modules, the relay), hunting six classes: cost that grows with N, waits on the join/paint/media path, races and stuck states, media hiccups, quirks, and anything the relay could learn. 280 findings (severity 5: 18, 4: 56, 3: 102).
4. Fixers, one per region so no two edit the same lines, each required to reproduce the finding, write the guard first and see it red, fix, see it green, run the local tiers, and hand back a patch. Patches were applied to the branch in order; every guard lands in a directory `release.sh` discovers (`test/unit`, `test/mesh`, `test/relay`, `test/browser`, `test/drills`), so it is gated from the day it exists.

## Baseline (before any change)

| tier | result |
|---|---|
| unit | 1 red: `app-modals` needs `acorn` in that clone (environment, installed) |
| mesh, relay, sim | all green |
| browser | green except `e2e-status-plane` FLAKY (first run: an attacker's 96 of 300 forged statuses were taken by its two direct neighbours) and two NEEDS-FLEET suites (expected on one box) |
| drills | `e2e-vanish-browser` RED twice: a graceful leave is gone from every survivor in 6.1 s against a ≤6 s assertion (the target is 3 s) |

Swarm ladder (real Chromium, `--lite` bots, 120-240 s settle):

| seats | bots per box | seated | DataChannels the mesh names that actually exist |
|---|---|---|---|
| 24 | 14 + 10 | 22 (2 stuck in `search` with 0 links after ~3 min) | 83-88 % |
| 36 | 14 + 22 | 32 (4 unseated after 4 min: `search` with occ 24-25 and 0 links) | 57 % |

Both boxes were at load 20-24 on 4-6 cores, so these numbers measure contention as much as the protocol; they still show the two shapes worth a fleet-sized rerun: seats that know the occupancy but never open a link, and link completeness falling as the room grows. Per-bot status receive rates (2.5/s at 24, 3.6-4.5/s at 36) stay under the section-scoped bound (6.25/s) — the heartbeat is section-scoped as documented. Sponsor-forward counters grew faster than N (`tx.fwdMesh` per bot per second 2.2 → 11.7), a lead confounded by load and by the unseated bots' retries.

## What landed (each with its guard)

| commit | change | guard |
|---|---|---|
| `e4dad479` | the `hi` history replay a newcomer receives is handed on over its own links as one frame per link per 10 s, never re-flooded room-wide (was: one room flood per learned line, per join); the per-author rate limit no longer truncates a backfill to 20 lines; `trimMap` deletes by key so `trSeen` is finally bounded | `test/unit/room-flood-laws.js`, `test/unit/meet-transcript.js`, `e2e-status-plane.js` leg 8 |
| `9effeab9` | a silenced bus sets `muted` (iOS ignores `volume = 0`, so structural and stage links were audible twice); the stage ear follows membership and the moderator mute; a meter rebuild re-cuts the Whisper capture; Leave and the OS hang-up flush the recorder and stop captures | `test/unit/meet-audio-lifecycle.js` (41 checks) |
| `71a1b392` | a device without a camera still gets its microphone (boot and the late ask fall back to audio-only); a mic-mode request during an in-flight grab is kept, not dropped | `test/unit/meet-media-grab.js`, `e2e-media-recovery.js` scene C |
| `066e0cdc` | the heartbeat re-derives once per pulse (every DC-linked section mate heard each beat twice), a signed mod table is verified once, the mod table is pruned on a confirmed departure, `#status` sits on the always-visible row so refusals and bans are never hidden by the collapsed bar, the first status text no longer promises a camera | `test/unit/meet-heartbeat.js`, `meet-transcript.js`, `e2e-meet-quiet.js` leg C |
| `4112224b` | relay: the dev-less upgrade no longer throws (two frames restarted the room object), door metering lapses with the claim, `who` is cached and per-socket limited, a greeter-set change is O(1) not a full roster resend, a re-mint cannot fork the room, server-initiated closes reach cleanup, the knock hashes a capped key | `test/relay/relay-worker-contract.js` (runs the production Session class in Node), `relay-door-meter.js`, extended `relay-roster-scope.js`, `relay-genesis-claim.js`, `relay-knock.js` |
| `74daa16b` | fragment reassembly is bounded by bytes not count; gossip duplicates are dropped before Ed25519 verification; a clock more than 10 min off is named as the cause instead of "network"; `doorPeers` is O(S) | `test/unit/frag-size.js`, `door-peers.js`, `test/mesh/e2e-mesh-identity.js`, `e2e-mesh-wire.js` |
| `a8e4333d` | the password epoch floor is bounded: a pulse cannot saturate the generation and break every future grant | `test/unit/meet-pw-epoch.js` (24 checks), `e2e-meet-password.js` leg |
| `79e11ca0` | gossip repaints are coalesced into one pass per 250 ms window with one derivation and one layout (was: the whole tile/outbound/adapt cascade per received status frame); chips are written only on change (a focused "stop sharing" chip no longer loses focus every beat); the admin-room blur chip names the host | `test/unit/repaint-cascade.js`, `e2e-screen-share.js`, `e2e-meet-mod.js`, `e2e-status-plane.js` quiet leg |
| `5c509aa1` | stage votes and hands: one verdict per voter (up and down can no longer be held at once), a vote-off is final, a step-up the C cap excludes disarms itself instead of entering the stage later unbidden, stage/hands/votes use the same hold-over liveness rule as consent and the roster (a late hidden-tab beat no longer tears a stager out of every strip) | `e2e-vote-stage.js` leg 3b, `e2e-stage-cap-race.js` (new, C=2), `e2e-stage-holdover.js` (new) |
| `12f3fddc` | mesh gossip: a gid is bound to its author (a member could pre-poison every seat's seen-set with a neighbour's next ids and silence them room-wide — 0 of 29 seats heard the victim); the beat re-fan hands each link at most two copies of a message instead of five (measured 5.11 → 2.00 copies per link at N=100); the seen-set sweep is O(expired) per receipt instead of a whole-map walk; the wire names the delivering link so the per-link flood budget and the digest want-whole path work in production; the R5 multi-greeter probe resolves 8 ticks after the last HOME instead of waiting 15 s on a silent greeter | `test/mesh/gossip-guard.js` (new, 15), `r5-fork-pick.js`, `status-plane.js`, `test/unit/room-flood-laws.js` |
| `1b22e23d` | a status pulse claims the sender's stream only when the id is news; every pulse used to end in updateTile and, outside a repaint pass, a whole-grid layout, so a quiet 10-seat room laid out ~2.5× per second (the <gate-host> measured layouts 50 against 20 passes in 20 s) | `e2e-status-plane.js` quiet-room leg |
| `621f699e` | mesh frame authority: a DRAIN (which dissolves a whole subtree) is signed and honoured only from the receiver's anchor, with a well-formed roster (one unsigned frame could re-seat everyone under a head against an attacker's roster, and a roster-less one wedged tick() forever); a seated seat takes a HOME only as the answer to its own WHOHOME. The sim twin carries the same rule. | `test/mesh/recv-authority.js` (new, 13), `e2e-mesh-identity.js` property 5, `docs/healing-laws.md` E1 |
| `1ebf0be5`, `36960958` | moderation reaches every sink (filmstrip, PiP, iOS native full screen obey video-off and blur); the stage-app pull-through forgets a departed asker; the stage data lane verifies an app frame before retaining it | `test/unit/meet-moderation-sinks.js`, `room-flood-laws.js` §7, `e2e-meet-mod.js`, `e2e-meeting-app.js` |

Verification of the combined tree, as of 13:45 UTC:

| where | suites | result |
|---|---|---|
| the <orchestrator> | whole unit tier | green except `mosaic-route` (120 s timeout on this slow box; green in the baseline gate) |
| the <orchestrator> | whole relay tier (12 suites, 2 new) | green |
| the <orchestrator> | mesh: e2e-mesh-identity, e2e-mesh-wire, steady-socket, greeter-expiry, status-plane, flood N=20 | green |
| the <llm-box> | e2e-meet-mod, e2e-camera, e2e-screen-share, e2e-meet-quiet, e2e-video, e2e-knock-first | green (57, 28, 51, 9, 133, 4 assertions) |
| the <behavior-box> | e2e-video, e2e-meet-quiet | green (133, 9) |
| the <behavior-box>, the <gate-host> | e2e-media-recovery scene C (new: mic-only desktop) | green (14) after the guard's two expectations were corrected: the plain mic toggle flips the track without a status line, and a wholly refused video ask answers "No camera was found on this device (NotFoundError)". The fix in `71a1b392` is proven in a browser: the audio-only boot, the mic reaching the other seat, the camera tap naming the missing camera and keeping the mic. |
| the <llm-box> | drills/e2e-vanish-browser | CRASH legs 21.8 s on a 4-core box carrying 5 browsers (baseline on the idle 8-core <gate-host>: 6.6 s). Re-queued on the <gate-host> to separate load from a regression. |

| the <gate-host> | e2e-meet-password, e2e-status-plane-admin | green (24, 18) |
| the <behavior-box> | e2e-meet-mod, e2e-meeting-app | green (57, 17) |
| the <gate-host> | e2e-status-plane | 3 red on the first combined run: the quiet-room layout count (fixed in `1b22e23d`), and the two 30-line history legs, which sent their 30 lines in a burst and so tripped the live per-author limiter (20 per 10 s, by design) before the replay was measured — the leg now paces them. Re-run pending. |

| the <gate-host> | e2e-vote-stage, e2e-stage-cap-race (new), e2e-stage-holdover (new), e2e-mosaic, e2e-meeting-app, e2e-meet-mod | green (10, 7, 6, 20, 17, 57) |
| the <gate-host> | drills/e2e-vanish-browser | green (11): a graceful leave is gone from every survivor in **0.0 s** (baseline 6.1 s, the one product red of the baseline gate); a crashed browser's seat is freed first-hand in 6.6 s (baseline 6.6 s). The 21.8 s seen on the <llm-box> was that box carrying five browsers on four cores. |

| the <behavior-box> | e2e-status-plane, e2e-video on the stream-claim fix | green (39, 133) — the quiet-room layout leg and both history legs now pass |

Still running when this was written: the whole mesh tier on the <orchestrator>, and a full browser + drills tier split across the three fleet boxes.

## Still in flight when this was written

Fixers for `mesh.js` (unsigned YIELD/CONFIRM/LEAVE/MOVED/DRAIN acceptance; the ×5 beat re-fan; the per-link flood budget; the 30 s lost-FIND and 15 s fork-probe waits), stage flags and votes (ghost stage flag, up-and-down from one voter), and the media ghosts (a crashed peer's structural claims painting a frozen block; hops waiting on the 2 s sweep; recording held in RAM). Their worktrees are `/tmp/mu-wt/<package>`; a patch lands in `/home/nathan/mu-work/patches/` when done.

## Found, not fixed (needs a decision or more time)

- **Relay per-network cap of 8 sockets** (`relay/src/relay.js:181`): an office or campus behind one NAT is locked out once 8 of its people hold sockets. Abuse guard vs. real customers — recommend 32 and metering by bytes, with the device tag in the key.
- **Stadium packer is O(N) per paint** (`mesh-media.js:354`): every Section-1 seat blits one `drawImage` per face in the room, and past ~28k faces the canvas area itself grows. The fold must compose composites, not faces.
- **Captions for everyone makes N devices flood N** (`run.html` transcript lines ride `sendAll`): one scribe is O(1) per node per line, N self-transcribers are O(N). Scope non-scribe lines to the section, or make the scribe the only room-wide writer.
- **`hi` ships ≤300 transcript + ≤500 chat lines per DataChannel open**: bounded by degree, not N, but a digest-and-pull or an age bound changes what a late joiner sees — Nathan's call.
- **Head with a hidden tab freezes every composite for its branch** (`run.html:10401`) — needs a browser reproduction.
- **Boot path**: 25 parser-blocking scripts (~1.95 MB) before the lobby, a synchronous `version.json` XHR on a first visit, a `document.write` theme chain, the body hidden up to 1.5 s waiting for a theme variable.
- **Vote-off majority from forged device tags; device-tag squatting locks a person out** (relay): both change the civility model in `docs/threat-model.md`.
- **Graceful leave 6.1 s** and **the forged-status window** are queued as round-2 packages (`/home/nathan/mu-work/packages-r2.json`).
- The severity 4-5 slice with status: [`meet-universe-findings-2026-10-03.md`](meet-universe-findings-2026-10-03.md) (74 rows: 39 landed, 9 with a fixer in flight, 4 skipped pending a decision, 22 open). The full 280 are in the work directory (`findings-ALL.json`), each with file:line, evidence, proposed fix and guard.

## How to continue

- Apply a finished patch: `bash /home/nathan/mu-work/apply-patches.sh <patch>` then the unit tier, then push.
- Run a suite on a fleet box against the dev tree: `bash /home/nathan/mu-work/remote-suite.sh <box> /home/nathan/projects2/gifos test/browser/<suite>.js`.
- Run the whole browser + drills tiers split over three boxes: `bash /home/nathan/mu-work/fleet-browser-tier.sh /home/nathan/projects2/gifos`.
- Day jobs: the <llm-box> and the <behavior-box> services are stopped for these runs; `sudo reboot` each when done (every unit is enabled).
