# meet.html wiring plan — the last leg of the mesh-v2 port (executable spec)

The stack below the browser is DONE and green: `net.topo` (topo.js), `mesh.js`
(the sim brain, harness-proven), `mesh-wire.js` (transport binding, e2e-proven
against the real relay with real sealing), relay greeter registry (R2/R3),
mesh gossip (exact-once under churn). This file specifies the surgery that
makes meet.html CONSUME it — rip-and-replace, no legacy (user mandate). Line
numbers from the 2026-07-16 recon of meet.html (5902 lines); re-grep before
cutting, the file moves.

## The one sentence
Replace meet.html's roster-arithmetic model (relay roster ⇒ computeRows/deacons
/decks/folds/walk) with the mesh node (occ ⇒ links, knock ⇒ entry, gossip ⇒
room-wide app traffic), keeping the entire per-pair WebRTC + Chat/File/Vote/
Admin layer as-is.

## What is RIPPED (old model — delete, no shims)
- Section walk: `sectionNum`/`sectionTry`/`walkOn()`/`sectionPathOf` (~2082-2093),
  the roster seat-cap walk in `t:'roster'` (~2545), `deriveMeetSess` call sites.
  ONE relay session per stadium now (base `deriveMeet` sid).
- Row arithmetic from roster order: `computeRows()` (~840-850, row 0 = stage —
  wrong twice over), `rowIndexOf`/`myRowIndex`/`rowMates` (rebuilt on coords),
  `gRowOf` (~4059).
- Deacons: `deaconRanking`/`deaconOf`/`amDeacon` (~862-866) + the deacon branch
  of `linkTo` (~2002).
- Decks/spaces: `UP`/`UP2` (~2104-2111), `spacePath`/`spaceRows`/`openSpace`/
  `walkSpace`/`closeSpace`/`reconcileUp`/`syncUpCam` (~2095-2320), deck
  presence-counting `knownDeckSections`…`knownTotal` (~935-990) and the
  `st.leaf/cnt/branch/bl/tot/seen` status fields (~903-913).
- Folds: `compPipe`/`deckPipe`/`startComp`/`drawComp`/`stopComp`/`startDeck`/
  `drawDeck`/`stopDeck`/`reconcileComp`/`takeComp`/`dropComp` (~3745-4258) and
  the `'b:'`/`'s:'` key vocabulary. (Replaced in 3b by docs/media-plane.md —
  fractal mosaic at row heads; interim rule below keeps small rooms whole.)

## What is KEPT verbatim
Per-pair WebRTC (`newPcFor`, `wireDc`, `onDc`, `renegotiate`, perfect
negotiation, `sendSig` DC-first signaling, `fsig` sponsor forwarding,
friend-relay TURN), crypto (`deriveMeet*`, seal/open, Ed25519 admin §9),
password flow + `rekeyRoom`, chat/file/history (`hi`), votes/bans, tiles.

## The new spine
1. **Join** (`joinRoom` ~3071): `deriveMeet(room, av, pw)` → ONE sid. Create the
   mesh node:
   `meshNode = GifOS.meshWire.createMeshNode({ relayUrl, sid, tok, key: roomE2E,
    peer: myId, tickMs: 500, sendDC, onGossip, onLocked: showPwModal(true),
    onStranded: <the R6 "network settings" banner>, onUpdate: renderFromOcc })`.
   The wire layer owns the relay socket (knock/greeters/socket-drop) — meet.html
   no longer opens its own mesh socket (`openSock` shrinks to nothing; the old
   roster/gossip relay handlers go).
2. **Control transport**: `sendDC(to, m)` = existing DC layer: if `peers.get(to)`
   has an open 'gifos' DC → `dcSend(to, {k:'mesh', m})` (sealed like everything)
   → true; else false (wire falls back to sealed relay `t:'peer'` — fine at
   greeter-contact time, when no DC exists yet). In `onDc`: `k === 'mesh'` →
   `meshNode.recvCtl(m.m)`.
3. **Links from occ** (replaces `linkTo`/`reconcile`): the peers I hold WebRTC
   connections to = `meshNode.seat.linkPeers()` (rows + cross + up/down + S1
   columns — bounded ≤ C+2) ∪ media-tier peers. INTERIM MEDIA RULE until 3b:
   if the room fits in Section 1 (occ has no pc≠0 entries), hold links to ALL
   seated peers — the Section tier's degenerate case (your section IS the room),
   which keeps every existing small-room e2e green with tiles for everyone.
4. **Rows for the UI**: my row = `topo.rowMates(seat.coord)` occupants; Stage =
   the `stg`-flagged set from status gossip (decoupled chosen set, cap C — the
   existing `stageIds` logic re-keyed on gossip, NOT row 0).
5. **App traffic**: status heartbeat + chat + votes + pwinfo ride
   `meshNode.gossip({...})` instead of relay `t:'gossip'` (the relay session is
   only the greeter pool now). `broadcastStatus` keeps its sealed payload shape
   minus the deck fields; DC-direct paths (`sig`/`fsig`/files) unchanged.
6. **Names/roster UI**: `rosterIds` = seated peers seen in occ + status gossip
   (identity stays sealed end-to-end; the relay roster is no longer the room).

## Order of work (each step leaves meet.html loadable; ONE commit at green e2e)
a. Include `mesh.js` + `mesh-wire.js` after `gifos-net.js`; build `sendDC`/
   `recvCtl` plumbing; instantiate the node in `joinRoom`.
b. Swap the entry path (kill walk/roster-seating) + links-from-occ + interim
   media rule; rip UP/deacons/decks/folds and the dead status fields.
c. Move status/chat/votes onto gossip; rewire Stage membership.
d. Green gate: `e2e-meet-quiet`, `e2e-meeting-app`, `e2e-meet-invite`,
   `e2e-media-recovery` (2-3 browser rooms — all inside one section), plus the
   Node suites (topo, meet-seal, mesh-harness, e2e-mesh-wire, relay-knock).
   THEN commit. If a suite needs the old relay roster semantics, fix the TEST
   (the relay roster is greeters-only now — that's the design, not a bug).
e. After commit: home-LAN swarm smoke (test/swarm.js against relay-local with
   TRUSTED_IPS), then 3b media (docs/media-plane.md).

## Interim-rule exit criterion (3b)
The `room > one section` case renders placeholder tiles for out-of-section
peers until the fractal mosaic lands — acceptable pre-launch; 3b replaces the
placeholders with the Stadium/Section composites and the Stage strip.
