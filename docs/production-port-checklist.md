# Production port checklist — bringing `main` into line with the current laws

**Audit date:** 2026-07-18. **Scope:** a READ-only catalog of the gap between the
production code on `main` and the canonical rulebook (`docs/healing-laws.md`,
heavily updated 2026-07-17) plus the media redundancy design
(`docs/media-plane.md`). Nothing in production logic was changed producing this
file; it is the work list, not the work.

**Authorities read:** `docs/healing-laws.md`, `docs/media-plane.md`,
`docs/option-a-plan.md`.
**Production read:** `site/js/gifos-net.js` (net.topo), `site/js/mesh.js` (Seat
brain), `site/js/mesh-wire.js` (transport binding), `site/meet.html` (media
plane + app), `sim/topo.h` (topology source of truth).

**Headline:** production `mesh.js` is a faithful port of an **older** sim —
**pre‑11a**. It still heals via the *computed* `lowestSurvivor()` designation
that the laws (C3) and the 11a redesign explicitly RETIRED. None of the newest
doctrines (W7 rook's graph, C3 exclusivity/S5 empty-only, first-hand
echo-immune liveness, H1-S1 conservatism, S4 per-person identity) are
implemented. The media plane, by contrast, is largely built to spec
(multi-subscribe + cross-link redundancy landed) — but it is wired against the
*current* `crossLink` topology and will need rewiring the day the rook's graph
lands.

---

## Critical path (suggested order)

The control-plane items are interdependent; do them in this order because each
later one assumes the earlier one's invariant.

1. **C3 fixed-designation healing + reject raw claims (§2, §3).** This is the
   *foundational* correctness fix — it is the port of 11a. Everything else
   (identity, ring integrity) assumes "one designated healer per hole, no
   computed opinions." Until `lowestSurvivor()` is gone, the tie-break is still
   a way *in*, not just a way to settle a revival. **BLOCKED in the plan on
   A+B being green in the sim** — do not port routing/healing into production
   ahead of the sim proof (option-a-plan increments 13–14).
2. **W7 rook's graph — degree-9 Section 1 (§1).** The load-bearing topology
   change. Small, self-contained, and it is what H1-S1 conservatism and the
   media head-redundancy both physically depend on ("unreachable on all paths").
3. **First-hand, echo-immune liveness + tenure (§3) and H1-S1 ring
   conservatism (§4).** These ride on top of #1 and #2.
4. **S4 per-person identity (keypair at join, peer-id = H(key)) (§5).** The
   biggest and newest item. Retires the client-set-id hole that §3's tie-break
   otherwise leaves forgeable. Touches the relay handshake, mesh-wire, and every
   place a peer id is minted or trusted.
5. **Media-plane rewiring for the rook's graph (§8).** Once `crossLink` changes
   shape, the Stage/Stadium cross-link redundancy needs re-pointing.

Items §6 (no relay arbiter) and §7 (drain/roster/stranded) are largely **already
correct** — they are audit-confirms, not big builds.

---

## Control plane

### 1. W7 — the 5×5 rook's graph (degree 9, Section 1 ONLY) — MISSING

**Rule:** healing-laws W7. Every Section-1 seat meshes its whole ROW *and* its
whole COLUMN — uniform degree 9 (C-1 row + C-1 column + 1 down), the 8-edge-
connected rook's graph. Heads stop being special (they gain column-mates,
retiring the dynamic head cross-link F1). Deep sections (`pc>0`) keep the strict
`C+1` bound and the sparse transpose.

**Status: MISSING / CONTRADICTS.** The doc itself says "specified, NOT yet
implemented," and the code confirms it.

- `site/js/gifos-net.js:499-504` — `crossLink(s)` returns **null for heads**
  (`if (s.i === 0) return null`) and a single **sparse transpose** partner
  `(r,i)↔(i,r)` for everyone else, with NO `pc==0` special-case.
- `site/js/gifos-net.js:507` — `ownedLinks` = `rowMates(C-1) + cross?(1) +
  up?(1) + down(1)`. For a Section-1 non-head that is degree 6 (4 row + 1
  transpose + 1 down); for a Section-1 head degree 5 (4 row + 1 down, no up, no
  cross). Nowhere near degree 9.
- `sim/topo.h:19,22` — the C++ source of truth has the **same** sparse
  transpose and no rook meshing, so this must land in the sim first (topo.h)
  then be ported verbatim.

**What to change:**
- Add a `columnMates(s)` primitive (the C-1 seats `{pc,r',i}` for `r'≠r`),
  gated on `s.pc === 0`.
- In `ownedLinks`, for `pc==0` append `columnMates` (giving 4 row + 4 column +
  1 down = 9); leave `pc>0` exactly as today (keep the transpose + up/down,
  `C+1` bound).
- Heads at `pc==0`: they now get column-mates from the same rule — no separate
  head-cross-link branch needed (subsumes/retires F1).
- Update **routing** (`mesh.js:186-208` `nextHopCoord`/`nextHopToward`): the
  inter-row hop inside Section 1 (`nextHopCoord` lines 190-191) currently walks
  the single transpose cross-link; with direct column links it can hop straight
  to the target row. `nextHopToward`'s fallbacks (lines 205-206) also lean on
  `crossLink` returning one coord — audit both against the new set.
- Keep it **Section-1 only** — the deep tree's `C+1` degree bound is
  load-bearing for scale.
- **Deep tree stays C+1** (unchanged) — verify no regression.

**Size/risk:** Small topology change, but **wide blast radius** — every
`crossLink`/`ownedLinks` caller (routing, healing wiring W1, media plane §8,
gossip `linkPeers` at `mesh.js:267-277`) reads these. Do it sim-first
(`test/topo.js` pins topo.h↔gifos-net.js equality). Medium risk overall because
so many consumers assume "cross-link = one coord."

### 2. C3 exclusivity + S5 empty-only — MISSING (production still on `lowestSurvivor`)

**Rule:** C3 — exactly ONE healer per hole, known in advance (down-child H1,
else right-neighbour H2), and ONLY it may fill the hole; a bare claim from
anyone else is **REJECTED, not adjudicated**. S5 — a fill is accepted only into
a genuinely EMPTY seat, and only by a neighbour that has itself, first-hand,
stopped hearing the prior occupant; a fill aimed at a still-alive coord is
rejected (no evicting a live owner).

**Status: MISSING / CONTRADICTS.** Production heals via the *computed opinion*
the laws retired, and accepts raw claims from anyone.

- `site/js/mesh.js:89` — `lowestSurvivor()` still exists and is the healing
  trigger: `mesh.js:357` (LEAVE handler heals a dead head only `if
  (...lowestSurvivor())`), `mesh.js:412` and `mesh.js:420` (per-tick heal of a
  dead head). This is exactly the "lowest-column survivor" designation H2
  RETIRED (`healing-laws.md:106-109`) — a role decided from a possibly-divergent
  occ map, i.e. the double-book source 11a was written to kill.
- `site/js/mesh.js:135-152` — `heal()` is a *hybrid*: it does the down-child
  FINDLEAF (vertical, H1-ish) and a childless-head `promoteInto`, but the
  row-mate branch (line 148) FINDLEAFs to **any** kidful row-mate, not the
  **fixed** right-neighbour `(p,r,1)`. There is no single fixed-coordinate
  authority serializing fills.
- **Raw claims are accepted:** `mesh.js:353` (CLAIM) sets `occ`+`live` for *any*
  ck from *anyone*; `mesh.js:344-350` (HELLO) sets occ and runs a pairwise
  tie-break for any ck; `mesh.js:361-372` (S1SYNC) sets occ from gossip;
  `mesh.js:342` (PLACE) — a newcomer `take()s` whatever an admitter told it,
  with no check the admitter was the designated authority. `grep` for
  "designated/healer/reject/verify vacancy" in mesh.js returns **nothing**.
- No first-hand vacancy veto: a healer promotes over a seat its *own* occ view
  calls empty; there is no "other neighbours still hear it → refuse the
  replacement" path (S5).

**What to change (the 11a port):**
- Replace `lowestSurvivor()`-triggered healing with **fixed designation**: your
  down-child heals you (H1); a childless head is healed by its fixed
  right-neighbour `(p,r,1)` (H2); the S1 backstop/backfill own only cells no
  other rule covers.
- Make a hole's fixed authority the **single serialized filler** for both
  healing *and* admission (the one-gatekeeper rule, option-a-plan 11a).
- **Reject** occupancy changes that don't arrive over the designated healer's
  existing live link — turn CLAIM/HELLO/S1SYNC/PLACE from "accept and adjudicate"
  into "accept only from an authorized source" (this is where §5's signed
  identity plugs in — without it the rejection can't be enforced against a
  forged id).
- **Empty-only:** before a neighbour accepts a fill for coord X, require that IT
  has first-hand lost X's prior occupant; refuse if X is still fresh in its own
  first-hand liveness.

**Size/risk:** **Large, high risk** — this is the core healing rewrite and the
plan gates it (increments 13–14) on the sim's A+B being green, which
`option-a-plan.md:28` reports is **not yet achieved** (dups bounded ~340 but not
0, split-brain disjoint-clique blocker). Do NOT port ahead of the sim proof.

### 3. E2 rescope + first-hand echo-immune liveness + tenure + lower-id-wins — PARTIAL

**Rule:** E2 settles duplicates only between two *legitimate* LIVE occupants;
"live" is **first-hand only** (gossip may route but never keeps a phantom alive
or evicts); tenure protects the sitting occupant (only claims first heard AFTER
my seating can outrank me); ties break **lower id wins, higher id yields** —
one convention everywhere.

**Status: PARTIAL — the tie-break convention is right; liveness is partly
gossip-fed (the bug).**

- **Lower-id-wins is consistent (GOOD):** `mesh.js:216` (onPhone yields to the
  higher id), `mesh.js:348` (HELLO yields the higher), `mesh.js:365` (S1SYNC:
  `eid < this.id ⇒ requeue`), `mesh.js:378` (CONFIRM: lower challenger ⇒ I
  requeue). One convention throughout — matches E2.
- **Tenure exists, partially:** `mesh.js:216` gates on a 40-tick first-hand
  liveness window; `mesh.js:365` uses `seen > this.seatedAt + 4`. Reasonable but
  not audited against the exact E2 wording.
- **Liveness is gossip-fed for Section 1 (THE BUG):** `s1Fresh()`
  (`mesh.js:82`) reads `s1seen`, and `s1seen` is set from the **S1SYNC gossip**
  frame at `mesh.js:368` (and `noteS1` on any occ write). S1 healing/eviction
  decisions (`s1Fill`/`rowSweep`, `serveFind`'s S1 emptiness test at
  `mesh.js:123-124`) all key off this gossip-influenced freshness. That is
  exactly the "echo-phantom" the laws forbid (E2: "let gossip refresh liveness
  and evicted ghosts resurrect forever"; option-a-plan calls it the S1SYNC
  echo-phantom blocking refills). The deep-tree `live` map (`mesh.js:217`,
  set in `onPhone`) *is* first-hand — the gap is specifically Section 1.

**What to change:**
- Split "have I heard X first-hand" (a real PHONE/PONG on a link X holds to me)
  from "gossip told me about X." Gate all liveness/eviction/heal decisions on
  the **first-hand** signal only; let S1SYNC inform routing/roster but never set
  the freshness that authorizes a heal or a yield. (option-a-plan increment 29,
  "echo-immune `live` signal.")
- Re-verify tenure wording end-to-end against E2 once §5's stable identity
  makes "who I heard" unforgeable.

**Size/risk:** Medium. It is the "echo-immune liveness" half of the sim's open
A+B blocker — coupled to §2, best done together, sim-first.

### 4. H1-S1 — ring-heal conservatism (heal a home cell only on STRONG, all-paths confirmation) — MISSING

**Rule:** a Section-1 cell is healed only after its occupant is unreachable via
**all** its redundant paths (W7) for a settled window — a much higher bar than
an ordinary hole, because a wrong ring-heal is the one act that can mint a
divergent home. The ring always prefers holding a temporary hole over
duplicating a coord.

**Status: MISSING.** S1 healing fires on a **single** staleness horizon, and
partly on gossip freshness.

- `site/js/mesh.js:253-257` (`s1Fill`) heals a Section-1 row cell after ~60
  ticks of `live` staleness — one path, one horizon.
- `site/js/mesh.js:247-252` (`rowSweep`) and `mesh.js:412` heal on the same
  short window; `serveFind` (`mesh.js:122-126`) declares an S1 row "empty" from
  `s1Fresh` (gossip-influenced, §3).
- There is no "unreachable on every redundant path" test — and there *can't* be
  one until W7 (§1) gives S1 the redundant paths to check.

**What to change:** after §1 lands, gate S1 cell healing on unreachability
across the full rook neighbourhood (row + column) for a settled window strictly
longer than max severance; keep the "hold the hole, never duplicate" bias.

**Size/risk:** Medium; **depends on §1** (needs the redundant paths to exist)
and §3 (first-hand liveness to measure them honestly).

### 5. S4 — per-person identity (keypair at join, peer-id = H(key)) — MISSING (biggest / newest item)

**Rule:** identity is **one keypair per PARTICIPANT**, minted once at join and
stable across moves (promotion moves your coord, never your identity). DTLS
already makes "who is on this link" unforgeable per-link; the keypair adds a
*stable name across links and moves*. A fill is signed with the healer's stable
key; a seat's peer id can simply BE the hash of that key — which **retires the
client-set-id hole** so E2's tie-break can no longer be hand-picked to
impersonate someone.

**Status: MISSING — peer ids are client-set and forgeable, exactly the hole.**

- `site/js/mesh-wire.js:57` — `const peer = opts.peer || 'c_' + net.randHex(6)`
  — the peer id is **client-chosen** (or a bare random), not derived from any
  key.
- `site/js/mesh-wire.js:70` — it is sent **on the socket URL**: `'&peer=' +
  encodeURIComponent(peer)` — the very `peer=` the laws call out (E3:
  "peer ids are CLIENT-SET (`peer=` on the socket, in both relays), so the
  attacker just picks the winning id").
- The only keypairs in production are **admin** keys
  (`gifos-net.js:369-401`, `edKeysFromSeedHex`/`edSign`/`edProven`), seeded from
  the admin password — they authenticate *moderation orders*, not *participant
  identity*. Nothing mints a per-participant keypair at join.
- Consequence: §2's "reject a claim not from the designated healer" and §3's
  tie-break cannot be *enforced* — a forged `peer=` can impersonate the healer
  or hand-pick the winning id.

**What to touch:**
- **Join:** mint an Ed25519 keypair per participant (reuse the
  `edKeysFromSeedHex`/`edSign`/`edVerify` primitives already in gifos-net,
  seeded from fresh randomness, not the admin password).
- **Peer id = H(pubkey):** replace `mesh-wire.js:57`'s random id with the
  key-hash; carry the pubkey (not just the id) through the relay handshake so a
  greeter/peer can bind id↔key on first contact (TOFU).
- **Signed fills:** the healer signs the fill it authors (C3, §2); any neighbour
  that has seen the key — or holds a live link to the healer's coord —
  recognises it. No per-hop signature chain, just a stable signed name.
- **Relay handshake (`mesh-wire.js:68-72`, relay `?peer=`):** stop trusting the
  URL-supplied id as identity; treat it as a routing handle bound to the proven
  key.
- Stable-across-moves: `promoteInto` (`mesh.js:159-169`) and `take`
  (`mesh.js:97-107`) must carry the **same** identity when the coord changes.

**Known-open (flag honestly, per the laws):** even with this, the
**first-contact** moment (join, or a total-reconnect where nobody remembers your
key) is authenticated only by the shared room key `K` — so the **Sybil** attack
and the **first-pin race** stay unsolved, and this is the same gap that leaves
the torn-home reunion (E3) open. S4 closes identity *everywhere except* that one
moment; it does not claim to close that moment.

**Size/risk:** **Largest control-plane item, highest design risk.** New crypto
on the join path, a relay-handshake change, and it touches every id-trusting
site. Sequence it AFTER §2 (it is what makes §2's rejection enforceable) but it
is a prerequisite for §2 being *secure* rather than merely *structural*.

### 6. No relay tie-break / no relay ring-bridge — ALREADY CORRECT (confirm only)

**Rule:** R2 — the relay is a zero-knowledge greeter registry; it arbitrates
nothing. A torn home is two rooms; there is no relay-as-arbiter, no relay
ring-bridge, no forced-drain reunion (E3 reunion is an acknowledged open
problem, detection-only).

**Status: DONE / CORRECT.** No relay-as-arbiter code exists to remove.

- The relay is used only for: **knock/greeters** (`mesh-wire.js:81-92,126-136`),
  a **sealed peer fallback** when no DataChannel exists (`mesh-wire.js:77-80`
  `{t:'peer'}`), and **moderation verbs** (setpw/ban/votekick/banlist —
  `meet.html:907,1188,2332,2339`). None of these arbitrate seating or heal
  rings.
- The room roster is derived from the **mesh occ map**, not the relay:
  `meet.html:1996-2022` (`renderFromOcc`) explicitly "Replaces the relay-roster
  reconcile — the relay's roster is the greeter pool, not the room."
- **The E3 audit is not implemented** (neither the tear-detector nor any
  reunion) — `onGreeters` (`mesh-wire.js:126-136`) reads the sealed list only to
  extract greeter ids; E3 in mesh.js is just the periodic re-knock
  (`mesh.js:105,415`). That is consistent with the laws (audit = future
  detection-only work); nothing to *remove*, just confirm nothing arbitrates.

**What to change:** nothing structural. Note-only: moderation verbs still ride
the relay (roadmap increment 18 moves them onto signed mesh gossip) — that is
governance, not ring-arbitration, so it does not violate R2's "arbitrates
nothing," but it is a residual non-greeting relay path to retire later.

### 7. E1 drain / W5 roster / R6 stranded-newcomer — PRESENT (mostly correct)

**Status: DONE / PARTIAL.**

- **E1 drain (PRESENT):** `mesh.js:173-183` (`drainOrReenter`), DRAIN fan
  `mesh.js:373-376`, cross-link/row-mate sideways WHOHOME to walk around a dead
  chain (`mesh.js:178-180`). **Section-1 exemption is correct:** the DRAIN
  handler returns for `pc==0` (`mesh.js:374`) and `drainOrReenter` is only
  reached in the deep-seat tick branch (`mesh.js:439`, after the `pc==0` branch
  returns at `mesh.js:416`). Matches E1 ("Section-1 seats never drain").
- **W5 roster / S1SYNC (PARTIAL):** `s1Sync` (`mesh.js:237-246`) syncs the S1
  cells with freshness tags and heir/cousin foreknowledge (W6) — present. But
  its freshness feeds the **gossip-fed liveness bug** (§3); and it syncs the
  transpose+row+column-neighbour set, which changes once W7 (§1) makes S1 the
  rook's graph.
- **R6 stranded (PRESENT):** `mesh.js:319` (stranded after `STRAND_TTL`),
  `mesh.js:318` (empty-list mint/take-over), surfaced via `mesh-wire.js:142`
  `onStranded` and `mesh-wire.js:124,133` `onLocked` (wrong-password). Matches
  the R6 three-observable machine (decryptable? alive? reachable?).

**What to change:** only what §1/§3 force (S1SYNC neighbour set widens to the
column under W7; freshness must become first-hand). No standalone work.

---

## Media plane (A/V/data redundancy)

The media plane is built largely to `docs/media-plane.md` and is being
swarm-tested in production. It is a *consumer* of the control plane, so its
correctness is coupled to the topology it reads.

### 8. Multi-subscribe (2 active + dormant spares, replaceTrack, no flicker) — DONE

**Status: DONE** (commit `944f0e0`), looks complete.

- Primary + hot standby over two independent paths, dormant spares:
  `meet.html:3696-3736` (`claimRedun`), `meet.html:3569` (`mosStandby`),
  `meet.html:3679-3685` (`demand` → `mx-want`/`mx-idle`),
  `meet.html:3615-3623` (`setJobActive` = `replaceTrack(null)` dormancy, m-line
  stays negotiated so waking is renegotiation-free).
- No-flicker failover: `meet.html:3709-3714` promotes the already-decoding
  standby; stickiness `meta` refresh at `meet.html:3722`.
- Applied to the redundant channels only (`isRedun` = `sd`/`sgs`/`stg:*`,
  `meet.html:3675`); structural relay slots keep a single sticky claim
  (`meet.html:3744-3757`).

**Gaps/risk:** the "keep an extra candidate wanted toward 2" heuristic
(`meet.html:3734`) and the demand debounce (`subWant`, `meet.html:3570,3681`)
are subtle — worth a live soak test for thrash, but no correctness gap seen from
reading.

### 9. Cross-link redundancy up+down (Stadium `sd`/`sgs`, Stage collect) — PRESENT

**Status: PRESENT** for the sparse-transpose topology of today.

- **Down-fan over cross-link:** `sd` and `sgs` fan over the cross-link at every
  level in addition to the tree — `meet.html:3961-3962` (`sgs` over
  `crossLink`), `meet.html:3977-3978` (`sd` over `crossLink`), deduped by `via`.
- **Stage collect up + redundant cross-path:** `meet.html:3917-3930`
  (`relayStg` ships each stager feed up the tree AND a `^x`-tagged copy over the
  cross-link); S1 floods once per `streamId` (`meet.html:3931-3936`,
  `stgSpread` dedup); `^x` resolves to the same slot (`meet.html:3662`).
- Every downstream viewer gets ≥2 independent sources for the redundant
  channels (primary + standby, §8), so no single upstream monopolizes a view
  (S3 satisfied for `sd`/`sgs`/`stg:*`).

**The load-bearing caveat (will break under §1):** all of this calls
`T.crossLink(c)`, which returns **null for heads** and a **single** transpose
partner otherwise (`gifos-net.js:499-504`). So:
- A **Section-1 head's** Stadium finish has **no cross-link backup today**
  (`crossLink` null for `i==0`) — it leans on row-mate fans
  (`meet.html:3886-3889`). Fine now, but the "independent second source" story
  is weaker at the S1 ring than the doc implies.
- When W7 (§1) reshapes `crossLink`/adds column-mates, **every** `T.crossLink(c)`
  media call site (`meet.html:3900,3924,3961,3977`) needs re-pointing: heads
  gain a real independent column path (good — use it), and the single-transpose
  assumption (`^x` → one slot) must be generalized or the code must pick one
  column-mate deterministically. **Flag: this is the media rewiring the day the
  rook's graph lands.**

### 10. Stage / Stadium mechanics (collect-composite-fan, packer, no election) — PRESENT

**Status: PRESENT / to spec.**

- **Stadium up-assembly:** row heads composite row faces + down-link blocks into
  one gapless packed grid and ship up (`meet.html:3852-3868`,
  `prodPack`/`setBlock`); S1 heads exchange over row-mates (`x1`), pack the
  `'stad'` Stadium, fan down (`meet.html:3869-3890`). Equal-square packing via
  `MM.createPacker`/`packGrid` (mesh-media.js). Parallel, no election
  (`meet.html:3876` every S1 head builds `sdPack` itself).
- **Stage strip:** composited at S1 (`stripPack`, `'bar'` shape,
  `meet.html:3940-3949`), fanned down as `sgs`.
- **Overlay threshold:** `MM.stadiumTiny(knownTotal())` drives tapestry+dot past
  the cap (`meet.html:3829-3830`).

**Not found / suspect (needs live verification):**
- **ICE-restart:** `sendOffer(peerId, iceRestart)` exists (`meet.html:1829-1831`)
  and is a general reconnection primitive, but I did **not** find a media-plane
  reconcile timer that *drives* an ICE restart specifically for a stalled
  `sd`/`sgs`/`stg` feed. Failover is handled at the *subscribe* layer (standby
  promotion, §8), not by restarting ICE on the dead path. Whether a wedged
  transport is recovered promptly is **needs-live-verification**.
- **Reconcile cadence:** `reconcileMosaic` (`meet.html:3811-3981`) is the single
  driver; it is called from `claimMos` sites and the per-tick UI update. I did
  not chase every caller — confirm it runs on a steady beat (not only on occ
  change) so a silently-dropped `mx` announce re-heals. `shipMos` is idempotent
  and re-announces (`meet.html:3592-3595`), which helps.
- **friend-relay (`relayVia`/`claimRelayStreams`):** present and separate from
  the mosaic — `relayVia` map `meet.html:3401`, claim logic `meet.html:3173-3186`,
  `stopRelayFor` `meet.html:3451-3513`. This is the P1 friend-relay for *direct
  peer* streams (row-mates), independent of the Stadium/Stage fans; looks intact.

### 11. App / data on Stage (a DATA stream, not A/V) — MISSING

**Rule:** `docs/media-plane.md` "An APP on Stage carries a DATA stream, not
A/V": an app occupies one of the ≤C Stage seats, broadcasts its shared *state*
(deltas over a data channel) fanned down the same Stage path, rendered locally
from the data stream — reusing GifOS's P2P app-state machinery, broadcast
stadium-wide.

**Status: MISSING — the app still runs over a SEPARATE relay app-session, not
the mesh Stage data path.**

- `meet.html:5112-5141` (`runApp`) boots `GifOS.runtime.boot(...)` and
  `becomeHost(...)` — a **host-authoritative runtime session** with its own
  `sess.sid`/`sess.lsec`/`sess.relay`.
- `meet.html:5142-5147` (`mountClientApp`) → `GifOS.runtime.bootClient(el, {s,
  k, relay: app.relay}, ...)` — clients connect to that app's **own relay**, not
  to a mesh-fanned data stream.
- The app's *presence* rides mesh status gossip (`myStatus.app`,
  `broadcastStatus`, `findSharedApp`) and it does correctly count toward Stage
  eligibility (`canStage`, `meet.html:833`) — but the app **transport** is the
  old relay bus, not the Stage data fan.

**What to change:** roadmap increments 26–28 (app-run on the mesh) — broadcast
app state as a data stream down the Stage path instead of a relay app-session.
Not started. **Size:** large; it is its own track.

### 12. Media plane vs. the new control-plane rules — will need rewiring

Flagged inline above; consolidated:
- **§9 caveat:** every `T.crossLink(c)` media call site
  (`meet.html:3900,3924,3961,3977`) assumes cross-link = one transpose partner
  and null-for-heads. W7 (§1) changes that. **Must rewire** when the rook's
  graph lands: give S1 heads their new column path, generalize `^x`'s
  single-slot assumption.
- **Occ reads:** the media plane reads occupancy directly
  (`occPid`/`meshSeat().occGet`, e.g. `meet.html:3577,3857`). Once C3 (§2)
  rejects raw claims and liveness goes first-hand (§3), the occ map a head reads
  will churn differently (fewer phantom occupants) — the packer's `delTile`
  paths (`meet.html:3860,3862,3880`) should handle a coord going empty cleanly,
  but verify no stale block lingers when a heal moves a seat.
- **Degree budget:** the media doc assumes degree ≤ C+1 and that the freed
  Section-channel budget funds the cross-link redundancy. W7 raises Section-1
  degree to 9 (control/roster links, mostly cheap) — confirm the S1 media
  fan-out still fits the encode budget (`meet.html:1568` caps composite ships at
  0.9 Mbps; heads are the compositors).

---

## What I could NOT determine from reading (needs live verification)

1. **ICE-restart for a wedged media feed** (§10) — no media-specific
   ICE-restart driver found; failover is subscribe-layer only. Needs a live
   "kill the upstream transport, does the view recover, and how fast" test.
2. **`reconcileMosaic` cadence** (§10) — confirm it runs on a steady beat, not
   only on occ-change, so a dropped `mx` announce self-heals.
3. **Multi-subscribe thrash** (§8) — the toward-2 demand heuristic and debounce
   look right but want a soak test at scale for source flapping.
4. **Sim A+B gate** — `option-a-plan.md:28` reports the sim's 11a is *not green*
   (dups bounded ~340, not 0; disjoint-clique split-brain blocker). The
   control-plane items §2/§3/§4 should not be ported to production until that is
   resolved in the sim — I confirmed the *production* state, not the sim's
   current numbers.
5. **Whether any deep test depends on the current `crossLink` shape** — changing
   it (§1) may ripple into `test/topo.js`, `test/mesh-harness.js`,
   `test/e2e-mesh-wire.js`; not run as part of this read-only audit.

---

## One-line summary per item

| # | Item | Status | Size/Risk |
|---|------|--------|-----------|
| 1 | W7 rook's graph (degree 9, S1 only) | MISSING | Small change, wide blast radius |
| 2 | C3 exclusivity + S5 empty-only (port 11a; kill `lowestSurvivor`) | MISSING/CONTRADICTS | Large, high — gated on sim A+B |
| 3 | E2 first-hand echo-immune liveness + tenure | PARTIAL (tie-break OK, S1 liveness gossip-fed) | Medium |
| 4 | H1-S1 ring-heal conservatism (all-paths) | MISSING | Medium, depends on §1/§3 |
| 5 | S4 per-person identity (keypair@join, id=H(key)) | MISSING | **Largest / newest**, high |
| 6 | No relay arbiter / ring-bridge | DONE (confirm) | None |
| 7 | E1 drain / W5 roster / R6 stranded | PRESENT (S1 liveness caveat) | None standalone |
| 8 | Multi-subscribe redundancy | DONE | Low (soak-test) |
| 9 | Cross-link redundancy up+down | PRESENT | Rewire on §1 |
| 10 | Stage/Stadium collect-composite-fan | PRESENT | ICE-restart unverified |
| 11 | App/data on Stage (data stream) | MISSING | Large (own track, roadmap 26-28) |
| 12 | Media vs new control rules | Rewire needed | Medium, coupled to §1/§2/§3 |
