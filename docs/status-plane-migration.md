# The status plane migration — off the room-wide flood (scale-audit V1, § 7 steps 1-3)

Branch `status-digest`, begun 2026-09-28. This file is the working plan and the
record of what landed; update it as each step closes.

## Why

Every participant's status heartbeat (`broadcastStatus`, every 4 s, 12 s hidden)
rides `fanOut → meshNode.gossip`: a dedup'd flood over every link, so every node
receives every node's pulse every period. That is O(N) frames per node — at
1,000 people ~2,000 status frames/s in and out of every browser — and it is the
one per-node cost in the system that grows with the room (scale-audit § 1.5).

The fix was designed and built in August and never switched on:

- 2026-08-05 `65a82daa` — the V1 rollup digest in the C++ reference (healing-laws § G).
- 2026-08-06 `4ca69cc4` — the browser twin, **flag OFF** (`GIFOS_DIGEST`), "until
  run.html migrates off the flood". No commit since has migrated a consumer.

The C++ sim seats 10⁶ because it models the seating protocol (O(C) per node) with
the digest ON; it never ran run.html's status flood (nor the relay door, fixed
2026-09-28 in `ab9f145d`). Both floods lived in layers the sim does not model.

## The shape

1. **Status is SECTION-SCOPED.** A status floods only within its sender's section
   (the C×C = 25 seats sharing a `pc`), over links inside that section. Per node:
   ≤ C² statuses per period, N-independent. Below C² participants the room IS
   Section 1, so this is byte-identical to today (G8). DC pairs still hear the
   pulse directly (they already do, `fanOut`'s viaDc).
2. **Room-global facts ride the rollup digest** (healing-laws § G, G0-G8), extended
   with bounded list fields, sim-first in BOTH twins:
   - `n` — the count (exists; G2 label).
   - `refuse` — consent refusals (exists; G3/G4; badge only, G1).
   - `hands` — the K earliest raised hands `{id, t, nm}` + total `handN`.
   - `stage` — the 2C earliest stage claims `{id, t, f, nm}` (flags: sing, scr, app);
     run.html applies `canStage` and vote exclusion to the candidates.
   - `votes` — the vote-scale fold (docs/vote-scale.md V1-V3): per-target
     `{up, down}` for the top-K targets + the voting population.
   - `app` — the newest room-app ad `{s, ts, id}`.
   Each list is capped (bounded payload, bounded state), folded by a total order
   (earliest `t`, ties by id), and checked by the author's refutation (G4
   generalised: "my entry is in the fold unless K entries that outrank it are").
3. **Events ride an on-change tree flood, never the heartbeat** (G6): the mod
   table (admin grants/blocks), app stop, lock epoch. One flood per change is
   O(1) per node per event — the chat shape, which the audit rates FINE.
4. **`statusOf` and its satellites are capped** to the section + the duty set
   (stagers, hand-queue heads, vote targets named by the digest). The directory
   `rosterIds` becomes occ ∪ section statuses.

## The consumer inventory (run.html, 2026-09-28)

| consumer | reads | today | migrates to |
|---|---|---|---|
| tiles: mute/cam/rec/cc/hand/scr/away/cap icons, blur level | `updateTile`, `seatDark`, `blurLevelFor`, `capOf` | flood | section-scoped status (tiles you see are row-mates, section, stagers) |
| names, ips | `learn` → `rosterNames`, `ipsOf` | flood | section status; digest lists carry `nm` for hands/stage |
| directory `rosterIds` | `renderFromOcc` | occ ∪ every fresh status | occ ∪ section statuses |
| count `knownTotal` / `participantCount` | :2114, :3549 | occ ∪ roster | digest root `n` (label), local occ when N ≤ C² |
| consent `allConsent` / `consentCount` | :2687 | unanimity over roster — ACTUATES outbound pixels | section unanimity actuates (first-hand scope); room-wide = digest `refuse` BADGE (G1). *Pending Nathan's call on rooms > 25.* |
| hand queue `handQueue` | :4766 | every fresh status | digest `hands` (top-K) + `handN` |
| stage `stageIds` / `stgOf` | :1891 | every fresh status | digest `stage` candidates → canStage + vote filter locally |
| stage votes `stageVoteTallies` | :2000 | every fresh status, scale-guarded | digest `votes` (vote-scale V1-V3); enforcement at S1 assembly (V4) stays in `stageIds` |
| screen sharers `screenSharers` | :11022 | every fresh status | stage candidates' `scr` flag |
| sing `singOf` / `roomSingOn` | :11351 | stagers' statuses | stage candidates' `sing` flag |
| `gd`, `sp` (sing latency) | `rttOf`, `stgIncurred` | linked peers only | unchanged (already near field) |
| app ads `findSharedApp` / `adCarriers` | :13075, :13053 | every fresh status | digest `app` |
| app stop drum `stopRoomApp` | :13033 | unicast to roster ∪ ad-carriers (O(N) sends) | on-change tree flood |
| mod table + `modw` | `takeMod` | re-gossiped on every admin heartbeat | on-change tree flood (G6), section status keeps it fresh locally |
| lock epoch floor `pwEp` | `takeStatus` | every status | section status (a member learns it from any neighbour) |
| `devOf` (vote/ban device tags) | roster + deltas | relay roster | section status carries the relay-stamped tag's owner claim; votes fold by device at the leaf (V1) |
| `conns` (friend-relay) | `learn` → `connsOf` | flood | section status (only relays you'd use are near) |

## Steps (each ends green and committed)

Landed so far on `status-digest`:
- **The heartbeat's carrier** (`4ff74349`): `gossip(payload, { scope: 'section',
  ephemeral })` in site/js/mesh.js; `test/mesh/status-plane.js` measures it —
  section heartbeat max 133/192/192 frames/node/beat at N=20/100/400 (bound 216)
  against the room flood's p50 696 -> 1896.
- **G9 lists, both twins** (this step): healing-laws § G9; sim `mesh.cpp` +
  `mesh_seat.inc`, `repro-digest.sh` legs 6-10 (72/72); browser `mesh.js` with
  `setLeaf`/`roomDigest` on mesh-wire and `digSane` at every wire intake,
  `test/mesh/digest.js` legs 6-11 (83/83). Whole sim tier + C-sweep 2..5 and
  test/mesh 19/19 green.
- **G0b — a digest carries its AGE, never a clock** (`6ec3f4f2`). Found by the
  first real-browser run past one section: every page's tick starts at its own
  load, the fold compared stamps across pages, and ten browsers read the room as
  four. The sim had one global clock. Now `ag` rides the wire and the reader
  re-stamps on its own clock. It was built sim-first: `net skew=` puts each seat
  on its own clock, and the absolute-stamp reading is kept as a negative control
  that must collapse. repro-digest 89/89, digest.js 98/98.
- **run.html consumers, behind the flag** (this step): the heartbeat is
  section-scoped and ephemeral, except an admin's. Each beat also sets this
  seat's leaf facts (`pushLeaf`). The room-wide views merge the section's own
  statuses with the fold's top-K, and a fresh section status always beats the
  fold. Per consumer:
  - hand queue and banner total;
  - Stage candidates, filtered by `canStage` and the vote exclusion;
  - sing and screen flags;
  - app ads and ad-carriers;
  - folded vote tallies past one section;
  - the count label (`displayCount`, a label only, G2);
  - mod changes and app stops: one room-wide flood per change (G6);
  - devOf from the status `dv` where the relay attested none.

  Consent past one section is the unanimity of the section seats I actually
  hear. Seats my tree names in OTHER sections (the up/down links) are left out,
  or they would hold the room blurred forever. The digest's `refuse` is a room
  badge only (G1). `test/browser/e2e-status-plane.js` proves all of it in real
  browsers: ten pages at C=2, four sections, 21/21. Its legs:
  - count;
  - confinement (the median seat hears 1-4 of 9);
  - a deep hand, a deep Stage claim and a deep mod change reach every seat;
  - consent clears the room, then one refuser blurs only itself and the
    section-mates who hear it, while everyone else shows the badge;
  - `statusOf` stays within C²-1 plus the open DataChannels (the V2 bound).

Known, measured and NOT fixed here: S1SYNC's claim-birth `b` is also an
absolute tick carried across seats. In the sim with per-seat clocks (N=600,
20% churn plus two targeted kills, seeds 1-3) it changes trajectories but
never correctness (CHECK PASS, dups 0). It gates a tie-break, not a count.
The fix has the same shape (send the age) but belongs in its own sim-first
change to the seating laws.

1. **Measure first.** A browser-side gauge of status frames/node/period (txStats +
   the harness), recorded at N = 25, 100, 500 on today's code — the baseline the
   migration must flatten.
2. **Digest lists, sim-first.** `test/sim/mesh.cpp` + `mesh_seat.inc`: the list
   fields, their folds, their G4 refutation; `repro-digest.sh` extended (vote storm,
   liar head inflate/censor, churn mid-fold, decay, C-sweep). Then the faithful
   port to `site/js/mesh.js`, and `test/mesh/digest.js` extended — ON≡OFF
   trajectory identity must still hold (G0/G1).
3. **App leaf facts.** `mesh-wire.js` lets run.html set this seat's leaf facts
   (hand, stage claim, votes, app ad) that the fold reads; nothing new on the wire.
4. **Section-scoped status**, behind the flag; small-room byte-identity e2e (G8).
5. **Migrate consumers**, one commit each, in the table's order of risk: count,
   hands, stage + scr + sing, app ads + stop, votes, mod table, consent.
6. **Remove the room flood for status** (G8 gate green), cap `statusOf`, move the
   cap assertion into `e2e-status-map.js`; flip `GIFOS_DIGEST` on by default.
7. **Prove it at scale:** the gauge flat across N; flood harness at 1,000; the AWS
   swarm (1,000 real browsers) with per-node status traffic measured.
