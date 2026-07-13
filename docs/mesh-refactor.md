# The Introducer Mesh — a relay-minimal refactor of GifOS meetings

**Status:** design proposal, not yet implemented. Written for coordination with
a parallel work-stream. This supersedes and merges the two earlier drafts
(`relay-as-introducer.md`, `p2p-vote-off.md`), which are removed. It is meant to
be read end-to-end before any of it is built.

**One line:** the relay is a *front door*, not a switchboard — it introduces a
newcomer into a room and then stays out of it; everything after introduction —
signaling, roster, gossip, seating, folds, moderation, presence — runs
peer-to-peer, at every level of the stadium, by one recursive pattern.

---

## 0. Why (the principles this serves)

1. **Don't do centrally what can be done p2p.** The relay should introduce peers
   and otherwise know and do nothing.
2. **The roster is the members', not the relay's.** Identity (name, address) is
   sealed under the meeting-URL key the relay never holds (already shipped —
   `a5151c8`, `a61e038`). The relay routes opaque peer ids.
3. **Per-node invariant, no global mode** (`docs/rows.md` design law). Every
   participant obeys the same local rules at every size; the small room is the
   degenerate case *by arithmetic*, never by a branch. This refactor must keep
   that law — the introducer pattern is itself the invariant, applied
   recursively.

This is **not** a scale rescue. The current design already reaches a million via
bounded C²+C sessions on free hibernating sockets (the K-sweep proves it). This
refactor is driven by principles 1–2; the large drop in steady-state relay
sockets is a bonus, not the motivation. Say so honestly to anyone who asks.

---

## 1. The core mechanism: introduce, then leave — recursively

A **session** (one relay Durable Object) is the unit the join walk fills: a
**section** of C² seats, or a **space** in the delegate tree (`docs/rows.md`).
In this refactor every session — section *and* space — behaves identically:

1. A newcomer contacts the session's relay **once**.
2. The relay introduces it to the session's **greeter pool** (§2).
3. A greeter **sponsors** it: brokers its WebRTC signaling to the rest of the
   session's mesh over existing DataChannels (§3), and hands it the membership
   manifest so it knows who to expect.
4. The newcomer is now in the P2P mesh. It **closes its relay socket** (unless it
   is holding a greeter slot) and does not contact the relay again — until it
   either falls out of the mesh (§6) or takes a turn as greeter.

The delegate tree is the same pattern one level up: a section's delegate is a
newcomer to its parent **space**, introduced by that space's greeter pool into
the space mesh. Depth is emergent; there is no top. This recursion is the whole
architecture — sections and spaces are the same object at different scales.

**Small-room honesty:** this changes the sacred base case. A 2-person room today
has both peers sitting on the relay; here the first peer is the greeter (holds
the socket) and the second is introduced P2P. The *spirit* of "no mode switch,
one recursive pattern" is preserved, but `rows.md`'s "byte-identical to today's
mesh" for a one-section room no longer holds — the mesh itself changed. Update
that law when this lands.

---

## 2. The greeter pool (never a single greeter)

A session's front door is staffed by a **pool of 2–3 open sockets**, never one —
a single greeter is a single point of failure for *joining* (not for the mesh,
which runs without any greeter). Composition:

- **The last peer to join is always in the pool.** It is the freshest, it just
  proved it can reach the relay, and this makes the pool self-refresh on every
  join with zero coordination.
- **The other 1–2 slots** are the session's top-ranked members by the existing
  deacon/host-takeover election (capability-weighted, deterministic — so every
  member agrees who they are without negotiation), for stability when joins are
  infrequent.
- On each new join the newcomer takes the "last joiner" slot and the *oldest
  non-anchor* greeter drops back to a plain member and closes its socket. The
  pool stays at 2–3, continuously refreshed, always spanning "most stable" and
  "most recent."

**Introduction is fan-out, not hand-off.** The relay introduces every
newcomer/re-entrant to **all** currently-open greeter sockets (it can do this
blind — it already `broadcast()`s to all open sockets without reading the
roster). The newcomer links to whichever greeters answer. This gives: (a)
failover — any greeter can sponsor, a mid-introduction greeter drop just falls to
the next; (b) the newcomer starts with 2–3 P2P links, not one, so it is never
one dropped link from isolation; and (c) it is the seam that heals partitions
(§6), because greeters from *different* partitions all receive the same
introduction.

---

## 3. Signaling goes peer-to-peer (the machinery to build)

Today **all** WebRTC negotiation rides the relay — offers, answers, ICE, even
renegotiation — because a pair's DataChannel does not exist yet at first
handshake (`sendSig()` in `site/meet.html` sends only the *status* heartbeat over
the DC). Two builds close this:

1. **Post-join signaling on the DataChannel.** Once a pair is connected, all
   further negotiation for it (renegotiation, track changes, ICE restarts) rides
   their DataChannel. `onDc` already handles `kind:'status'`; extend it to
   `offer`/`answer`/`ice`.
2. **Sponsor-forwarded introduction.** A newcomer reaches only the greeters via
   the relay. To join the rest of its row/section, a sponsoring greeter
   **forwards** the newcomer's SDP/ICE to the other members over DataChannels and
   relays their answers back — a rendezvous-over-P2P. Build on existing pieces:
   the media-forwarder `relayVia` (`site/meet.html`, a friend forwards media for
   a blocked pair — same shape, for signaling), the sealed piece-forwarder
   `{t:'fwd', src, to, p}` (`site/js/gifos-net.js`), and the fold **manifests**
   (`comp-own`/`comp-stream`) that already circulate row membership P2P.

After this, the relay's *only* remaining wire role is the initial newcomer↔greeter
introduction. Everything else is DataChannels.

---

## 4. Seating & the walk move to the greeter

`rows.md` line 25 is the collision point: today "the relay's own roster answers
'this one's full'." That works only while seated members hold sockets — which
this refactor removes. So seating moves off the relay to the greeter, which has
the session's **live P2P occupancy** (it is *in* the mesh):

- On introduction, a greeter checks the section's P2P membership count. If
  seats remain, it **admits** (sponsors the newcomer into a row, or a hole left
  by a departure). If full (≥ C² non-stage seats), it **redirects**: "knock on
  the next section" (deterministic address, unchanged — the joiner tries `r2,
  r3, …`), or hands the newcomer up the tree toward a section with room.
- **Holes refilled** gets cleaner, not harder — the greeter admits into the real
  gap it sees in its P2P roster.
- **Preserve the exceptions:** staged members never walk (`rows.md:209`), so the
  greeter must exclude the stage from the seat count — it has the stage state via
  gossip. The stage still anchors at the first level-1 space.

Delegate seating into spaces (walk to sibling spaces, walk *back* from lonely
ones — `rows.md:27`) is the identical greeter logic one level up.

---

## 5. Gossip goes fully peer-to-peer (the largest single piece)

A section is **not** a full mesh today: links are row-scoped plus the
deacon-mesh, and cross-row *status/presence* gossip leans on the relay's
`{t:'gossip'}` broadcast (`fanOut`; `rows.md:44` — heartbeats "fall back to the
relay only while no DC is open"). With members off the relay, that fallback is
gone. So **all** gossip must forward P2P:

- **Status / presence / hands** join the chat-class treatment that already
  exists (`rows.md:175`): forward-on-first-sight with dedupe-by-id, plus periodic
  anti-entropy union-merge across up-edges. Cross-row hops go through the
  deacon-mesh; cross-section hops go up/down the delegate tree. The
  assertion/display counting rules (`rows.md:157`) are unchanged — they already
  assume tree forwarding; they just lose the relay shortcut.
- The **fold/stadium is already fully P2P** — deacon composites over
  DataChannels, fold up / forward down. It needs **no** change. The relay's only
  fingerprints on the stadium were the walk (§4) and this gossip fallback; remove
  both and the entire tree is relay-free after introduction.

This is the biggest build. Flag it as such: it is not a deletion, it is moving a
transport.

---

## 6. Staying whole: disconnection, split-brain, and the row-0 re-entry probe

The hard problem the relay used to hide: **in a relay-minimal mesh you cannot
passively tell a mass-departure from a partition.** If a branch goes silent, or
the room count drops, you can't know whether those people *left* or whether *you*
were split from them. Left unaddressed, a room could silently fork into two
groups that each believe they are the whole room, forever.

Three layers handle it:

### 6a. Individual dropout — self-evident, self-healing

A peer that loses all its P2P links (network blip, sleep, every direct link and
friend-relay gone) sees its DataChannels close and simply **re-enters through the
relay once** to be re-introduced (§1). The front door must stay open for
*re*-entry, not only first entry. This is obvious to the individual and needs no
detection.

### 6b. The active anti-split probe — row 0 keeps its row-0-ness

The silent case (a group still internally connected but severed from the rest)
cannot be detected passively, so it must be *actively* probed. The anchor does
it:

- **Row 0 (the stage) is the room's spine** — "row 0 is subscribed by all"
  (`rows.md`). Its defining property is that it reaches everyone. So row 0
  **periodically designates a member to re-enter through the relay** (e.g. every
  ~30–60s; the freshest links make good candidates). That re-entrant is
  introduced by the relay to **all currently-open greeter sockets** (§2) — and if
  those greeters span two partitions (both partitions still hold relay sockets,
  as the greeter-pool rule ensures), the re-entrant is now P2P-linked to both and
  **sutures them**: rosters merge via gossip through it, direct links reform, the
  fork heals. If there was no split, the probe is a cheap no-op that also happens
  to refresh the greeter pool.
- **This is recursive**, like everything else: each session's greeter pool /
  anchor runs the same periodic re-probe of *its* relay session, so splits heal
  at the level they occur — a section that forks internally is re-sutured by its
  own greeters, the tree by its delegates, the room by row 0. No global coordinator.
- Because the relay introduces *every* newcomer to *all* greeters (§2), an active,
  join-heavy room heals partitions organically; the probe is the guarantee for
  *quiet* rooms where organic joins won't force a re-entry.

### 6c. The honest, unhealable case

If a group cannot reach the relay **at all** (a network island that can reach
each other P2P but not Cloudflare), it cannot re-enter or be found, and it
becomes a separate room. This is unhealable by construction — but the group is
not *silently* wrong: they can see they cannot reach the relay (the front door is
unreachable), which is a surfaceable state ("you may be seeing only part of the
room"). We detect-and-warn; we cannot merge two groups that share no reachable
rendezvous.

---

## 7. Moderation without the relay (vote-off)

Vote-off is the democratic "the room collectively refuses this person" tool for
plain rooms. Today it is **relay-enforced** despite the "personal, nothing
stored" framing: `syncVotes()` ships each browser's list to the relay; the relay
`tallyVotes()` computes the majority, broadcasts it, `close(4007)`s the loser,
and door-gates arrivals. That is central authority we are removing. (Admin-room
bans are a *separate*, designated-authority model — see §9.)

Peer-enforced replacement, which this whole architecture finally makes coherent:

- **Vote key = the observed network path, not a self-reported id.** A participant
  learns a peer's true path from the ICE `srflx` candidate during connection —
  unspoofable, the way packets actually reach them, mirroring how the relay
  itself always knows the true source IP. **Enforce on the ICE-observed IP** (read
  via `getStats()` → `remote-candidate`), *not* the self-reported `whoami` IP (a
  peer can lie about that) nor the client-chosen device tag (trivially wiped). A
  vote pre-flagged on a hint is *confirmed* on the observed path when connection
  is attempted.
- **Lists stay personal and client-held**, gossiped **sealed** over the same P2P
  gossip as everything else (§5). The relay never receives a `votekick`.
- **Tally is local and eventually-consistent.** Each client counts, for each
  present peer, how many present peers have that peer's path on their list; at
  majority-of-present-devices it acts. Brief disagreement across clients during
  gossip convergence is fine for a civility tool.
- **Enforcement is local shunning, layered where connections live.** Direct
  peers: refuse/tear down the RTCPeerConnection, stop sending media, hide the
  tile. Folded peers: the deacon compositing a row **excludes** a shunned member
  from the manifest and composite, so they appear in no fold and on no distant
  screen either. Media reaches no one.
- **This design needs the introducer world to be coherent:** with peers off the
  relay there is no relay to tally or kick, which is the point. It also dissolves
  the earlier "global vs per-room" tension — the relay never sees the vote key,
  so there is nothing to correlate. Whether votes follow a person across rooms is
  now purely a client choice about which key to persist (a device-derived secret
  the *client* keeps, never shown to the relay), not a relay capability.

**Honest limit — soft, not hard.** Shunning blocks everything a bad actor
*sends* and removes them from every screen, but cannot evict them from signaling:
while they hold the room URL they can still passively *receive* sealed gossip
(lurk). A URL-holder can already lurk by joining quietly, so this is not a
regression; the harm is outbound, and shunning stops it completely.

---

## 8. The clarification that keeps the design honest

It is tempting to say "the relay can't poll the members because the roster is
sealed." Half true, wrong half load-bearing:

- **True:** the relay cannot read *who* the members are (sealed identity).
- **False:** sealing does not stop the relay from *reaching* members — it already
  fans a frame to every open socket blind to identity (`broadcast()` / the
  `gossip` handler). What actually removes the relay from the loop is **peers
  closing their sockets** — a deliberate lifecycle choice (§1), not a consequence
  of sealing. The greeter pool (§2) and the row-0 probe (§6b) exist *because* the
  relay can still reach whatever sockets are open; that is the mechanism, not an
  accident.

---

## 9. Open questions to coordinate

1. **Admin-room bans.** A designated-authority model (one admin, a real ban list,
   relay-held cut/gate). Recommendation: leave relay-enforced for now — you
   consent to an admin by joining an admin room, and admin rooms already advertise
   a central authority. Revisit as admin-stamped P2P shunning later.
2. **Same-device eviction.** The relay uses `dev` to evict a stale same-device
   socket when a new tab opens (functionality, not moderation). If `dev` leaves
   the relay for plain rooms, decide how to preserve it (sessionStorage peer-id
   already handles reload; the new-tab case may be acceptable to drop or handle
   client-side).
3. **Probe cadence and candidate choice** (§6b) — tune interval and who row 0
   sends; too rare risks slow heal, too frequent wastes relay wakes.
4. **Greeter admission throttling** to absorb re-bootstrap bursts (§10, herd
   risk).

---

## 10. Honest limits, consolidated

- **Re-bootstrap thundering herd.** A partition or mass reconnect sends many
  peers to the relay's introduce path at once; at a million, correlated failures
  can burst it. The relay's abuse caps + greeter admission throttling must
  absorb it — a genuinely new risk the socket-heavy current design lacks (a
  hibernating socket just wakes; it does not re-handshake).
- **Greeter/anchor are per-session soft single points for *joining*** (not for
  the mesh). The pool of 2–3 + deterministic election + the row-0 probe contain
  it; still a new seam to test at every level (same class as host-takeover).
- **Seating and counts go eventually-consistent.** The relay's socket count was
  authoritative; greeter/gossip views lag, so sections may over/under-fill by one
  or two (the C²+C cap has slack) and counts can momentarily disagree.
- **Small-room base case changes** — no longer byte-identical to today's mesh
  (§1).
- **Soft shun** — a voted-off URL-holder can still lurk (§7).
- **Re-introduction on dropout** — "never contact the relay again" is really
  "never again *unless you fall out of the mesh*" (§6a).
- **Unhealable true partition** — a group that cannot reach the relay at all
  cannot be merged; we detect-and-warn only (§6c).
- **NAT islands unchanged.** Signaling can always be forwarded (tiny); a hard-NAT
  *media* pair may still island and fall back to a friend-relay exactly as today.
  Being off the relay for signaling creates no new connectivity.

---

## 11. Relationship to the already-shipped sealing work

Branch `claude/domain-name-status-k2mfc5`, commits `a5151c8` + `a61e038`:
**keep it.** Names + self-reported IP sealed; peer-ids-only roster; IP stored
only as a salted abuse-cap tag; `whoami` hands each socket its own address. This
refactor builds on exactly that. The device-tag room-salting in `a61e038` (and
its per-room-vote test churn) is **mooted** here — with vote-off peer-enforced
(§7) the relay never sees the vote key at all, so "global vs per-room at the
relay" no longer exists as a question. Whoever implements can let that fall out
naturally rather than defending the per-room test.

---

## 12. Concrete change list (end-to-end, suggested order)

Build bottom-up; hold the K-sweep discipline (identical assertions at C=2 and at
production constants) for every step.

1. **Signaling on DataChannels** (§3.1). Move renegotiation off the relay for
   already-connected pairs. Smallest, unblocks everything.
2. **Sponsor-forwarded introduction** (§3.2). One greeter stitches a newcomer
   into a row over P2P. New primitive on top of `relayVia`/`fwd`.
3. **Greeter pool + fan-out introduction** (§2). Elect 2–3, last-joiner always
   in, relay introduces to all open greeters, rotation on join.
4. **Seating on the greeter** (§4). Move "is this section full / where's the
   hole" from relay roster to greeter P2P view; preserve stage exception.
5. **All gossip P2P** (§5). Extend chat-class forward+anti-entropy to
   status/presence/hands; delete the relay `{t:'gossip'}` fallback. Largest step.
6. **Close sockets after join** (§1) + **individual re-entry** (§6a).
7. **Row-0 anti-split probe** (§6b) + recursive per-session probes + detect-and-warn
   for the unhealable case (§6c).
8. **Peer-enforced vote-off** (§7). ICE-path key, sealed vote gossip, local
   tally, local + fold shunning; delete relay `votekick`/tally/boot/door-gate.
9. **Reconcile docs** — `README.md:72` and `docs/threat-model.md` (both currently
   describe relay-enforced vote-off and a relay-authored roster); update
   `docs/rows.md`'s "byte-identical small room" law.

The relay keeps its abuse caps and origin allowlist throughout — those guard the
introduce path, which is now the *only* thing it does.
