# The Introducer Mesh — a relay-minimal refactor of GifOS meetings

**Status:** design proposal, not yet implemented. Written for coordination with
a parallel work-stream. This supersedes and merges the two earlier drafts
(`relay-as-introducer.md`, `p2p-vote-off.md`), which are removed. It is meant to
be read end-to-end before any of it is built.

**No legacy. Rip and replace.** There is no installed base to protect: no old
admin links that must keep working, no old rooms that must keep decrypting, no
wire compatibility to preserve. Every derivation change here is a clean DS
version bump (gifos-net's flag-day mechanism), old-format anything is simply
invalid, and no code path should be written to tolerate the previous scheme.
Do not add compatibility shims; do not carry the old relay behaviors alongside
the new ones.

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

**Scope:** this covers **meeting (mesh) sessions only**. The relay's app
multiplayer sessions (`host`/`client` roles, the epoch guard, owned-link host
gating) are untouched by this refactor — the host-authoritative app model is a
different trust shape and stays on the relay for now.

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

**An open socket is not authority.** Anyone holding the room URL can sit on an
open relay socket and receive introduction fan-outs — including a shunned
re-entrant or a squatter — and answer newcomers with lies ("room's full") or
garbage manifests. This is contained by construction, but say it out loud so the
implementation leans on it: (a) fan-out means honest greeters answer the same
introduction — a newcomer cross-checks sponsors and takes the mesh that actually
stitches it in; (b) a shunned "greeter" cannot forward signaling into the mesh
(members hold no DataChannels with it), so its only power is to lie to a
newcomer who is simultaneously hearing the truth; (c) greeter *eligibility* in
the election excludes peers you shun, so honest members never yield the anchor
slots to one. Sponsorship trust comes from the mesh, never from holding a socket.

**Empty-session detection is authoritative, not a timeout.** The relay knows how
many sockets a session has open (it counts blind, reading no identity). A
newcomer arriving at a zero-socket session is told "you're alone" and seats
itself as first occupant/greeter (§1's base case). The residual race — a section
whose greeters all crashed in the same instant looks empty and a newcomer founds
a parallel group — is a transient split, and §6b heals it.

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

3. **Healing signaling must survive the pair it heals.** The wedged-link
   sweeper (`988a09b`/`e198019` on main: ICE-restart a pair stuck >12s in
   `'connecting'`, rebuild the transport past 25s, per-fold kicks only on
   settled pairs) sends its recovery offers over the *relay* today — and the
   pair's own DataChannel is exactly what's broken when a heal is needed. In
   the introducer world those offers route by **sponsor-forwarding over any
   still-live link** (a row-mate forwards to the deacon, the deacon-mesh
   crosses rows); only when a peer has *no* live link at all does it fall to
   §6a re-entry — and §6a's trigger is therefore "the connection-layer heal
   **gave up**," never "a link looks down," or re-entry races the sweeper's
   ICE-restart and double-heals. The `makingOffer`/perfect-negotiation guards
   from those commits are transport-agnostic and carry over unchanged.

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

- **Status / presence / hands** get the same *transport* as chat-class gossip
  (`rows.md:175`) — hop through the deacon-mesh and up/down the delegate tree,
  with periodic anti-entropy — but NOT the same merge rule: chat dedupes by
  message id (each message is new), while status is **latest-wins by (peer,
  timestamp)** — forward a status only when it is fresher than the one you hold,
  or a section will flood itself re-forwarding 4-second heartbeats. The
  assertion/display counting rules (`rows.md:157`) are unchanged — they already
  assume tree forwarding; they just lose the relay shortcut.
- The **fold/stadium is already fully P2P** — deacon composites over
  DataChannels, fold up / forward down. It needs **no** change. The relay's only
  fingerprints on the stadium were the walk (§4) and this gossip fallback; remove
  both and the entire tree is relay-free after introduction.

This is the biggest build. Flag it as such: it is not a deletion, it is moving a
transport.

---

## 6. Staying whole: disconnection, split-brain, and the row-1 re-entry probe

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

### 6b. The active anti-split probe — row 1 keeps row 0 whole

The silent case (a group still internally connected but severed from the rest)
cannot be detected passively, so it must be *actively* probed. What the probe
protects is row 0's defining property — "row 0 is subscribed by all"
(`rows.md`): the stage is only the stage if it reaches *everyone*, which is
false the moment the room forks. But row 0 cannot be the *actor*: **the stage is
born empty in every room**, and an empty row designates nobody. The actor is the
first row of actual seated members:

- **Row 1 runs the probe, on its heartbeat.** Its deacon (deterministic — every
  phone already agrees who that is) **periodically designates a member to
  re-enter through the relay**; if row 1 has somehow emptied (holes mid-refill),
  the duty falls to the lowest-numbered occupied row by the same rule — the
  arithmetic answer, never a special case. That
  re-entrant is introduced by the relay to **all currently-open greeter sockets**
  (§2) — and if those greeters span two partitions, the re-entrant is now
  P2P-linked to both and **sutures them**: rosters merge via gossip through it,
  direct links reform, the fork heals. If there was no split, the probe is a
  cheap no-op that also happens to refresh the greeter pool. The re-entrant
  keeps its existing peer id — re-introduction is idempotent, never a ghost tile.
- **Why both sides of a split still hold relay sockets — make the mechanism
  explicit, don't assert it:** the greeter-pool invariant (§2) is maintained
  *locally by every connected component*. After a split, each side notices the
  other's absence (links died), recomputes the deterministic election over its
  own shrunken membership view, and its newly-elected greeters open sockets.
  Neither side needs to know it is "the minority"; both just keep their own pool
  staffed. That per-component re-election is the precondition the suture stands
  on — without it the probe would find only one partition at the relay.
- **Probe only when a silent split is arithmetically possible.** A split is
  silent only if **both** sides keep ≥2 members (a lone severed peer sees its
  links die and self-heals via §6a). So a section probes only while it holds
  ≥4 members — the per-node-invariant way to gate it. This matters for cost: a
  quiet connected room today costs the relay *zero* wakes (DC-first heartbeats),
  and an unconditional 30–60s probe would re-introduce ~1,400–2,900 billed
  wakes/day/room forever. The arithmetic gate zeroes that for the dominant
  small-room case; cadence for big rooms is a tunable (§11).
- **This is recursive**, like everything else: each session's greeter pool /
  anchor runs the same periodic re-probe of *its* relay session, so splits heal
  at the level they occur — a section that forks internally is re-sutured by its
  own greeters, the tree by its delegates, the room by row 1. No global coordinator.
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
- **Shared IPs mean collateral — be honest and key on the tuple.** CGNAT puts
  thousands of strangers behind one mobile-carrier IP; a household or office
  shares one; and a same-LAN pair may connect via host candidates with no
  `srflx` at all. An IP-only shun can hit innocents. So the vote key is the
  **(observed path, device-tag hint) tuple**: full-tuple matches enforce
  confidently; IP-only matches enforce cautiously (e.g. count toward the tally
  but require the tuple to auto-confirm). Within the stated scope —
  unsophisticated bad actors — this is an accepted, *named* risk, not a surprise.
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

- **Elections must respect the tally — including the deacon.** A member's
  entire fold view rides its ONE row-deacon link (the hard-won lesson of the
  fold-collapse fixes on main), so "shun by teardown" pointed at your own
  deacon would black out your stadium. All role elections — deacon, greeter,
  prober — therefore exclude peers your local tally has at threshold, and the
  row re-elects around a shunned deacon exactly as it does around a dead one.
  Transient divergence (two members briefly computing different deacons while
  the tally converges) is the same eventual-consistency the counting rules
  already tolerate.
- **The shun must be told to its target, or §6a loops forever.** A shunned
  peer's links all die — which is *exactly* the §6a "you fell out, re-enter
  through the relay" trigger. Today the relay's terminal `close(4007)` tells
  them and `bannedOut` stops the reconnect; here nobody would, and an honest
  client would re-bootstrap through the relay endlessly. So: enforcement sends
  an attributed, sealed **shun notice** ("the people in this room have voted not
  to include this device") before teardown, and a greeter whose local tally has
  the re-entrant at threshold **declines sponsorship with the same notice**
  instead of stitching them in. The client treats the notice as terminal, like
  `bannedOut` today. A *modified* client that hammers re-entry anyway buys
  nothing (nobody links to it) and runs into the relay's join-rate caps.

**Honest limit — soft, not hard (but see §8: locked rooms can re-key).** Shunning
blocks everything a bad actor *sends* and removes them from every screen, but
cannot evict them from signaling: while they hold the room URL they can still
passively *receive* sealed gossip (lurk). A URL-holder can already lurk by
joining quietly, so this is not a regression; the harm is outbound, and shunning
stops it completely. In a **password-locked** room the limit disappears: once
the password enters the key derivation (§8), rotating the password after a
vote-off re-keys the room and the lurker can no longer even decrypt.

---

## 8. The door lock becomes cryptography (it must — and it's an upgrade)

Today the room password is **only an admission gate at the relay**: the E2E key
derives from `roomCode|av` alone (`deriveMeet`, `site/js/gifos-net.js`), and the
password just yields an equality proof the relay compares before letting a
socket in. That was fine while the relay was the door. In the introducer world
the "door" is a greeter — a peer, checkable but not authoritative — so an
unmodified gate would leave a URL-holder without the password able to decrypt
every sealed frame they can obtain. **The lock would become decorative.**

The fix is to move the password into the key itself:

- **Locked room key = H(code | av | pw)** (a new derivation label under the DS
  version tag — gifos-net's DS bump is a deliberate flag day). Without the
  password you cannot *read* the room, no matter what you hold or which greeter
  you fool. The lock stops being a gate someone enforces and becomes a property
  of the ciphertext.
- **Changing the password re-keys the room.** The existing `setpw`/`pwinfo` flow
  becomes a key rotation: members holding the old key receive the new password
  over the old sealed channel (exactly how `pwinfo` already shares it), derive
  the new key, and move; whoever doesn't learn the new password falls out of the
  ciphertext.
- **This upgrades vote-off from soft to hard in locked rooms.** The standing
  "soft shun" limit (§7) is that a voted-off URL-holder can still lurk on sealed
  gossip. In a locked room: vote off, then rotate the password (don't send the
  shunned device the new one) — the lurker can no longer decrypt anything. Hard
  exclusion, achieved entirely P2P, no relay in the loop.
- Greeters still *check* the pw proof at introduction as a courtesy gate (fail
  fast with a clear error instead of letting someone join a room they can't
  read), but nothing rests on that check anymore.

---

## 9. Admin rooms: authority becomes a signature (the stamp cannot survive)

The doc cannot punt this one. Today admin authority exists **only** as the
relay's `adm:true` stamp on frames it routes — `relay/src/relay.js:472` says it
plainly: *"clients themselves can't prove adminship to each other"* — and admin
bans are relay socket-cuts plus a relay door-gate. In the introducer world
members hold no sockets and gossip rides DataChannels: **there is nothing to
stamp and nobody to cut.** "Leave admin rooms relay-enforced" is not an option
short of keeping every admin-room member on the relay forever — a global mode
switch that violates the design law. So admin authority must become verifiable
peer-to-peer:

- **Make K a signing key, not a bare secret.** Keep the deliberately-expensive
  PBKDF2 derivation from the admin password (dictionary resistance is still
  wanted), but use the derived bits as the **seed of a signature keypair**
  (Ed25519 — precedent already in the codebase via GIF signing; P-256 ECDSA if
  WebCrypto availability demands). The room verifier **V becomes a hash
  commitment of the public key** (same 24-hex prefix form, so URL shape is
  unchanged).
- **Admins sign their moderation messages** (mod table, ban/unban, setpw/re-key
  orders). The first signed message carries the public key; any peer checks
  `H(pubkey)` startsWith V (V is in the URL they joined by), caches it, and
  verifies signatures from then on. The relay stamp is replaced by a proof any
  peer can check with no third party.
- **Admin bans become signed shun orders**: every client enforces them exactly
  like vote-off shunning (§7) — teardown, tile removal, fold exclusion, greeter
  declines-with-notice — but on the admin's signature instead of a majority
  tally. Joining an admin room remains structural consent to be administered;
  only the enforcement mechanism moves.
- **No legacy path.** There are no existing admin links to keep alive (see the
  rip-and-replace note up top). V = H(pubkey) is simply *the* scheme; the old
  V = H(K) form is invalid, verified nowhere, and gets no compatibility branch —
  the relay's stamp path (`adm:true`, `routePeer`'s stamped shape, the
  stamped-broadcast in the gossip handler) is deleted, not deprecated.

---

## 10. The clarification that keeps the design honest

It is tempting to say "the relay can't poll the members because the roster is
sealed." Half true, wrong half load-bearing:

- **True:** the relay cannot read *who* the members are (sealed identity).
- **False:** sealing does not stop the relay from *reaching* members — it already
  fans a frame to every open socket blind to identity (`broadcast()` / the
  `gossip` handler). What actually removes the relay from the loop is **peers
  closing their sockets** — a deliberate lifecycle choice (§1), not a consequence
  of sealing. The greeter pool (§2) and the row-1 probe (§6b) exist *because* the
  relay can still reach whatever sockets are open; that is the mechanism, not an
  accident.

---

## 11. Open questions to coordinate

1. **Same-device eviction.** The relay uses `dev` to evict a stale same-device
   socket when a new tab opens (functionality, not moderation). If `dev` leaves
   the relay for plain rooms, decide how to preserve it (sessionStorage peer-id
   already handles reload; the new-tab case may be acceptable to drop or handle
   client-side).
2. **Probe cadence and candidate choice** (§6b) — the ≥4-member arithmetic gate
   is settled; tune the interval and who row 1 sends. Too rare risks slow heal,
   too frequent wastes relay wakes.
3. **Greeter admission throttling** to absorb re-bootstrap bursts (§12, herd
   risk).
4. **IP-only vote matches** (§7): exact policy for tuple-vs-IP-only confidence —
   how cautious is "cautious" (display-only? counts but never auto-confirms?).
5. **Signature algorithm** (§9): Ed25519 (codebase precedent, cleaner) vs P-256
   ECDSA (WebCrypto ubiquity) — verify Ed25519 WebCrypto support across the
   browsers GifOS actually targets before committing.
6. **Relay session caps re-tuned** — `MAX_SOCKETS_PER_SESSION = C²+C` was sized
   for everyone-on-relay; steady state is now greeters + in-flight joiners +
   probes. The cap can drop sharply, but must stay generous enough to absorb a
   re-bootstrap herd; join-rate caps must not throttle a healthy probe cadence.

---

## 12. Honest limits, consolidated

- **Re-bootstrap thundering herd.** A partition or mass reconnect sends many
  peers to the relay's introduce path at once; at a million, correlated failures
  can burst it. The relay's abuse caps + greeter admission throttling must
  absorb it — a genuinely new risk the socket-heavy current design lacks (a
  hibernating socket just wakes; it does not re-handshake).
- **Greeter/anchor are per-session soft single points for *joining*** (not for
  the mesh). The pool of 2–3 + deterministic election + the row-1 probe contain
  it; still a new seam to test at every level (same class as host-takeover).
- **Seating and counts go eventually-consistent.** The relay's socket count was
  authoritative; greeter/gossip views lag, so sections may over/under-fill by one
  or two (the C²+C cap has slack) and counts can momentarily disagree.
- **Small-room base case changes** — no longer byte-identical to today's mesh
  (§1).
- **Soft shun in unlocked rooms** — a voted-off URL-holder can still lurk (§7);
  locked rooms escape this via re-key (§8).
- **Shared-IP collateral** — CGNAT/household/office peers share an observed
  path; tuple keying reduces but cannot eliminate it (§7).
- **Probe wakes** — big quiet rooms pay a small permanent relay wake cost for
  split-healing that today's design doesn't have; the ≥4 arithmetic gate zeroes
  it for small rooms (§6b).
- **Re-introduction on dropout** — "never contact the relay again" is really
  "never again *unless you fall out of the mesh*" (§6a).
- **Unhealable true partition** — a group that cannot reach the relay at all
  cannot be merged; we detect-and-warn only (§6c).
- **NAT islands unchanged.** Signaling can always be forwarded (tiny); a hard-NAT
  *media* pair may still island and fall back to a friend-relay exactly as today.
  Being off the relay for signaling creates no new connectivity.

---

## 13. Relationship to the already-shipped sealing work

Branch `claude/domain-name-status-k2mfc5`, commits `a5151c8` + `a61e038`:
**keep it.** Names + self-reported IP sealed; peer-ids-only roster; IP stored
only as a salted abuse-cap tag; `whoami` hands each socket its own address. This
refactor builds on exactly that. The device-tag room-salting in `a61e038` (and
its per-room-vote test churn) is **mooted** here — with vote-off peer-enforced
(§7) the relay never sees the vote key at all, so "global vs per-room at the
relay" no longer exists as a question. Whoever implements can let that fall out
naturally rather than defending the per-room test.

---

## 14. Concrete change list (end-to-end, suggested order)

Build bottom-up; hold the K-sweep discipline (identical assertions at C=2 and at
production constants) for every step.

1. **Signaling on DataChannels** (§3.1). Move renegotiation off the relay for
   already-connected pairs. Smallest, unblocks everything.
2. **Password into the key derivation** (§8). New DS-tagged derivation for
   locked rooms; `setpw` becomes re-key. Independent of everything else, and the
   introducer world is unsafe for locked rooms without it — land it early.
3. **Admin authority as signatures** (§9). PBKDF2 bits seed a keypair; V commits
   to the pubkey; mod/ban messages signed; receivers verify. Unblocks admin
   rooms for every later step.
4. **Sponsor-forwarded introduction** (§3.2). One greeter stitches a newcomer
   into a row over P2P. New primitive on top of `relayVia`/`fwd`.
5. **Greeter pool + fan-out introduction** (§2). Elect 2–3, last-joiner always
   in, relay introduces to all open greeters, rotation on join, "you're alone"
   for zero-socket sessions.
6. **Seating on the greeter** (§4). Move "is this section full / where's the
   hole" from relay roster to greeter P2P view; preserve stage exception.
7. **All gossip P2P** (§5). Extend tree forwarding + anti-entropy to
   status/presence/hands (latest-wins, not id-dedupe); delete the relay
   `{t:'gossip'}` fallback. Largest step.
8. **Close sockets after join** (§1) + **individual re-entry** (§6a).
9. **Row-1 anti-split probe** (§6b, ≥4-gated, heartbeat-driven) + recursive per-session probes +
   detect-and-warn for the unhealable case (§6c).
10. **Peer-enforced vote-off** (§7). Tuple key (path + hint), sealed vote gossip,
    local tally, local + fold shunning, **shun notice** (terminal for honest
    clients; greeters decline-with-notice); delete relay
    `votekick`/tally/boot/door-gate. Admin bans ride the same shunning on
    signatures (§9).
11. **Reconcile docs** — `README.md:72` and `docs/threat-model.md` (both
    currently describe relay-enforced vote-off, a relay-authored roster, and a
    relay-checked password); update `docs/rows.md`'s "byte-identical small room"
    law and its walk/gossip-fallback lines (25, 44).

The relay keeps its abuse caps and origin allowlist throughout — those guard the
introduce path, which is now the *only* thing it does.
