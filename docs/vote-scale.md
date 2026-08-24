# Voting at stadium scale — tally assembly ALONG THE MOSAIC FOLD

Status: DESIGN (sim-first — nothing here ships to the wire until the C++
reference sim proves it, like every mesh law). The shipped implementation
(run.html, 2026-07-25) is the SECTION-SCALE leaf mechanism plus a scale
guard; see §6.

## 1. The problem

One voter, one vote — onto the stage, off the stage, out of the room — in a
room whose membership a single seat can never enumerate. A seat holds direct
links only to its bounded neighbourhood (row-mates plus cross/up/down in deep
sections, ≤ C+2; row + column + down at Section 1 under the W7 rook, 2C−1),
so at stadium scale:

- no seat can see every voter's list, so no seat can tally exactly;
- a majority measured against "who I happen to see" is a Sybil lever — a
  mutually-visible clique manufactures a "majority" over anyone;
- any aggregation step introduces the LIAR-AGGREGATOR problem: an inner seat
  inflating (or censoring) its subtree's tally.

The healing laws already forbid every shortcut here: no bigger-side-wins, no
force-the-other-to-move, execution stays self-owned.

## 2. The shape: votes fold exactly like the Stadium mosaic

The Stadium channel (docs/media-plane.md) already solves distribution over
this tree: every ROW HEAD composites its row's band plus the sub-products its
down-links deliver, ships the product UP; Section 1 exchanges over the rook
links; the finished view fans DOWN. Vote tallying is the same fold carrying
arithmetic instead of pixels — same links, same sweeper beat, same bounded
degree, no new topology:

- **V1 — votes are leaves.** Every seat carries only its OWN vote lists
  (device-keyed, capped at 8 per kind, S4-signed). One hop: a seat's lists
  travel to its ROW HEAD over the row link — exactly as its camera does
  (Channel R). A vote you did not sign does not exist.
- **V2 — heads fold up.** On the beat, a row head folds its row's signed
  leaves into a SUB-TALLY `{target → count}` plus a POPULATION CLAIM (its
  row + the populations its down-links claimed), merges the sub-tallies its
  down-links shipped, and ships the product UP — the mosaic's product path,
  one struct per beat. Compaction: top-K targets only (K small; only
  near-majority targets matter), exactly the spirit of Q2's "carry less,
  not more".
- **V3 — Section-1 exchange.** S1 seats exchange row/column products over
  the rook mesh as they already do for the mosaic. Subtrees are DISJOINT by
  construction (every device holds exactly one seat), so summation double-
  counts nothing: the composed room total is Σ of S1 products.
- **V4 — STAGE votes are enforced AT ASSEMBLY, not at every ear.** The
  stage video is assembled at known points: the S1 seats that pack the
  per-stager 'stg:' feeds into the strip before it fans down. Those seats
  are exactly where the up-fold terminates (V3), so they hold the room
  totals BY CONSTRUCTION — and they are the only places the off-stage
  tally must be APPLIED: exclude a majority-voted-down feed from the pack
  and every downstream receiver's view is correct no matter what the
  target's client claims. Nothing needs to fan down for enforcement. What
  does fan down is small and cosmetic-or-courtesy: `{epoch, roomN, top-K
  stage-target totals}` riding beside the strip's existing meta — the
  TARGET reads it to step itself down politely (self-owned, as ever), and
  tiles use it for tally chips. O(K) per beat per link.
- **Kick votes** keep their relay-checked arrival gate; their tally fold is
  the same V1-V3 shape with the relay (not the strip) as the acting edge.
- **The shipped section-scale code already has the assembly property:**
  strip packing iterates stageIds(), and stageIds() is where the vote
  exclusion sits — enforcement and assembly are the same line of code.

## 3. Honesty — why a bad actor still only ever moves themselves

- **Minting is signing.** Sub-tallies are claims about signed leaves. An
  aggregator cannot mint votes without forging S4 signatures it does not
  hold. (Leaves are small; a head keeps its row's raw signed lists for one
  audit window.)
- **Population-bounded claims.** A subtree's tally for any target is capped
  by its population claim, and population claims are the SAME numbers the
  counting laws already carry and cross-check (knownTotal). Inflating votes
  means inflating population — a lie the tree's counting already exposes.
- **Two disjoint paths.** The cross-link is the mosaic's independent second
  source; tallies ride it too. Two products for the same subtree that differ
  beyond churn-slack = first-hand evidence, D5-style: probe, confirm, and
  route around the liar (drop its product, take the mirror).
- **Spot audits.** Any seat may descend a claimed path (FINDLEAF-style) and
  demand the signed leaves behind one sub-tally. Refusal or mismatch is
  first-hand evidence against the head — the seat, not the vote, gets healed
  around.
- **Censorship is bounded, not fatal.** A head can drop its subtree's votes
  (it cannot forge them). The subtree's voters see their own chip counts
  stall, and the mirror path still carries them — the same failure posture
  as a head dropping mosaic tiles.
- **Freshness = decay.** A leaf that stops re-asserting (leaver, sleeper)
  ages out of its head's fold within the status window; totals decay with
  the same epoch discipline, so nobody tallies ghosts.

## 4. Need

`need = max(2, floor(roomN / 2) + 1)` where roomN is the AGGREGATED room
population (the counting fold), never a local view. The conservative
asymmetry is the safety property: under-count votes if you must, never
under-count the room.

## 5. Sim-first gate (before any wire port)

mesh.cpp + mesh.js harness scenarios, all green before run.html learns V2-V4:
vote storm (everyone votes everyone), liar head (inflate/censor), mirror
mismatch audit, churn mid-vote (heads die between fold and fan), decay
(voters leave en masse), and the C-sweep (C=2..5).

## 6. What ships today (section scale)

run.html tallies EXACT leaves — every fresh status it can see — and takes
`need` from the aggregated participantCount. In a one-section room that IS
the exact protocol (statuses reach everyone; leaves = room). Beyond section
scale the guard makes votes inert-but-honest: tallies can only undercount,
need never shrinks, so no visible clique can move anyone until V2-V4 land.
The UI (Vote menu → green dot / red ✕ targets, tally chips, labeled strip
targets for stagers) is scale-independent and stays as-is.
