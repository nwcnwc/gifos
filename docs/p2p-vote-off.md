# Peer-enforced vote-off (moderation without the relay)

**Status:** design proposal, not yet implemented. Written for coordination with
a parallel work-stream. Nothing in here is built; the "Current state" section
describes what ships today, and everything under "New design" is the target.

## The principle

> Don't do centrally what can be done peer-to-peer.

The relay is meant to be a dumb signaling pipe: a rendezvous so two browsers can
find each other, plus abuse caps so nobody tunnels media through it. It should
not be an authority on *who is allowed to be in a room*. Vote-off — the
democratic "the room collectively refuses this person" tool for plain
(non-admin) rooms — is moderation, and moderation is exactly the kind of thing
that should be enforced by the participants, not the pipe.

## Current state (what ships today — and why it violates the principle)

Despite the "personal, nothing-stored" framing in `README.md` and the
introducing commits (`02f02c7`, `22d5879`), the enforcement is **relay-central**:

- **Client submits, doesn't enforce.** `syncVotes()` ships each browser's
  personal vote list to the relay as `{t:'votekick', devs:[…]}`
  (`site/js/…`/`site/meet.html` `syncVotes`). The client only renders the
  relay's numbers ("🗳 3/5 to remove") and learns *it* was removed when the
  relay closes *its own* socket with code 4007.
- **Relay tallies and kicks.** `relay/src/relay.js`:
  - `votekick` handler stores each voter's list in the socket attachment
    (`a.votes = cleanDevList(m.devs)`).
  - `tallyVotes()` computes the per-device majority of connected devices,
    broadcasts `{t:'votes', tally, need}`, and calls `s.close(4007,'voted-off')`
    on anyone at threshold.
  - The mesh join path is a **door-gate**: a joiner a present majority has
    voted off is rejected (`reject('voted-off', 4007)`) before admission.

So the relay sees the entire vote graph (who voted off whom, by device tag),
computes the outcome, and performs the exclusion. That is the central authority
we don't want.

There is a second, *separate* mechanism — **admin-room bans** — where a
designated admin bans a device and the relay holds a ban list and cuts/gates.
That is a designated-authority model, not democratic vote-off; see "Open
questions" for whether it moves too.

### The privacy tension this created

A prior change (`a61e038`) room-salted the device tag so the relay can't
correlate a device across rooms. That helped privacy but (a) still leaves the
relay tallying and kicking, and (b) **broke the documented global property**
that "votes follow the person between rooms" (`README.md:72`; `22d5879`).
Room-salting and "votes follow you everywhere" are mutually exclusive when the
relay is the matcher, because global matching requires a stable cross-room id
the relay can see — the exact correlator we're trying to deny it. Moving
enforcement peer-to-peer **dissolves this tension**: if the relay is out of the
moderation loop, it never sees votes or the vote-key at all, so there's nothing
to correlate and nothing to leak.

## New design: client-side tally, client-side shunning

### 1. The vote key is the *observed* network path, not a self-reported id

A participant learns a peer's true path from the **ICE candidates** exchanged
during connection setup (the server-reflexive `srflx` address). That is
unspoofable — it is how packets actually reach them — and it is exactly the
"true path" a peer always knows about its counterparties, mirroring how the
relay/Cloudflare always know the true source IP.

- **Enforce on the ICE-observed IP**, read from the `RTCPeerConnection` (e.g.
  `getStats()` → `remote-candidate`), NOT on:
  - the self-reported IP that `whoami`→sealed-gossip carries (a peer can lie
    about that), nor
  - the client-chosen device tag (trivially wiped/changed).
- The self-reported IP and/or device tag may still be used as a **hint** to
  pre-flag someone, but the binding vote is the path you actually observe when
  you (or your row's deacon) attempt to connect to them.

Consequence: you cannot reliably shun a stranger *before* the first connection
attempt, but you can recognize their real path the instant ICE begins and tear
down before any media flows — practically as good as a door-gate, done P2P.

### 2. Vote lists stay personal and client-held; they gossip sealed

Unchanged from the intended spirit: each browser keeps its own vote-off list in
its own storage. The list now records **path fingerprints** (a hash of the
observed IP, optionally + device-tag hint), not relay device tags.

Each client gossips the slice of its list relevant to the people currently
present, **sealed under the room key**, over the existing directory-spanning
gossip (see §4). The relay never receives a `votekick`.

### 3. The tally is computed locally and is eventually-consistent

Every client independently computes, for each present peer P:
`count(present peers who have P on their vote list) ≥ majority(present devices)`.
"Present" and "each peer's votes" both come from the sealed gossip. Because
gossip propagates with small delays, two clients may briefly disagree on the
count; that is fine for a civility tool — it self-heals as gossip converges.
There is no single authoritative number and no `{t:'votes'}` broadcast from the
relay; the "N/M to remove" chip is computed from locally-known votes.

### 4. Enforcement is local shunning, layered where connections live

- **Direct (row-scoped) peers:** if a present majority has P voted off, refuse
  to establish — or tear down — the `RTCPeerConnection` to P, stop sending them
  media, drop their DataChannel, and hide/omit their tile. P's media reaches you
  never.
- **Cross-row / folded peers:** a deacon compositing its row for the fold simply
  **excludes** a shunned member from the composite manifest and stream
  (`comp-own`/`comp-stream`, see §5). So a shunned person appears in no fold and
  on no distant screen either.
- **The shunned person** can still hold a relay socket and passively receive the
  room's sealed gossip while they hold the URL (see "Honest limits"), but they
  can transmit to no one.

### 5. The relay's remaining role: signaling + a membership hint

The relay keeps doing only what is inherently central:
- WebRTC signaling relay (offers/answers/ICE — already sealed).
- Authoring the per-session peer-id `roster` (a routing/membership *hint*).
- Abuse caps (rate/bandwidth/size), origin allowlist.

It stops doing **all** of: the `votekick` message, `tallyVotes()`, the
`{t:'votes'}` broadcast, the 4007 boot, and the vote-off door-gate.

## What already exists to build on

This is not a from-scratch gossip system — the P2P machinery is here and
load-bearing:

- **Directory-spanning sealed gossip.** `fanOut()` in `site/meet.html` sends the
  status heartbeat (sealed under the room key) to every directory peer over the
  relay *and* DataChannels. Vote-list gossip rides the same path — add a field to
  the status payload, or a sibling `kind`.
- **Peers already pass membership among themselves.** The stadium/fold forwards
  row **manifests** — `{ ids, names }` of who's in a fold — peer-to-peer over
  DataChannels between deacons and across spaces (`comp-own` announce and
  `dcSend(…comp-stream…)` in `site/meet.html`; spec in `docs/rows.md`). Excluding
  a shunned member is a manifest/composite filter, exactly where the fold is
  already built.
- **The sealed identity layer.** Names and the (self-reported) IP already travel
  sealed via the heartbeat/offers-answers (`a5151c8`, `a61e038`). The vote key
  and vote lists join that sealed channel.

So membership *within* one relay session still originates at the relay's
`roster`, but the mechanism for peers to circulate identity/membership/vote data
among themselves already exists and is used at scale.

## Honest limits (name these; don't let them surprise anyone)

1. **Soft, not hard.** P2P shunning makes a bad actor invisible and mute to
   everyone and blocks everything they *send*, but cannot evict them from the
   signaling session — while they hold the room URL they can still *lurk*
   (passively decrypt gossip). The relay-kick severs even that. Weigh it
   honestly: anyone with the URL can already lurk by joining quietly, so the
   kick's unique protection is thin, and the harm is outbound (their
   media/voice/chat), which shunning stops completely.
2. **Determined evaders still evade.** Changing networks (new IP) or hopping
   device tags defeats a soft, path-keyed shun — but that was *always* true even
   with the relay kick (device tags are client-chosen), and the explicit scope is
   "unsophisticated bad people you don't want to talk to again," not a motivated
   attacker.
3. **No pre-connection door-gate.** You recognize the true path at ICE time, not
   before, so there is a brief connection attempt before teardown. No media flows
   in that window (tear down on the first observed candidate), but it is not a
   relay-side "denied at the door" 4007.
4. **Eventual consistency.** Different clients may briefly show different
   tallies. Acceptable for civility; do not present it as a consensus/quorum
   guarantee.
5. **Presence source.** The majority denominator ("how many devices are present")
   is still seeded by the relay roster / gossip. That is signaling bookkeeping,
   not moderation, so it does not violate the principle — but note that the
   denominator is only as trustworthy as the presence view.

## Concrete change list (for whoever implements)

**Relay (`relay/src/relay.js`) and its mirror (`test/relay-local.js`): remove.**
- `votekick` message handling; the `votes` field in the attachment.
- `tallyVotes()` and every call site (join, cleanup/departure).
- The `{t:'votes', tally, need}` broadcast.
- The vote-off door-gate (`reject('voted-off', 4007)`) and the 4007 boot.
- Plain-room `dev` no longer needs to reach the relay at all (admin rooms: see
  Open questions). If `dev` goes away for plain rooms, drop it from the roster
  `devs` for those rooms too.

**Client (`site/meet.html`): add / move.**
- Compute a **path fingerprint** per peer from the ICE `remote-candidate` IP
  during connection setup; store it with the peer record.
- Personal vote list becomes a set of path fingerprints in local storage; the
  vote button records the target's observed fingerprint.
- Gossip the present-relevant slice of the list, sealed, via `fanOut`.
- Local tally (present peers × their gossiped votes) → the "N/M to remove" chip.
- Local enforcement: refuse/teardown the `RTCPeerConnection`, hide the tile, and
  make the fold deacon exclude shunned members from `comp-own`/`comp-stream`.
- Remove `syncVotes()`'s relay send, the `{t:'votes'}` handler, and the
  4007-driven `bannedOut` path for vote-off (keep 4004/admin handling — see
  below).

**Docs to reconcile once implemented.**
- `README.md:72` and the feature checklist (currently claim relay-tally +
  "votes follow the person" — both change).
- `docs/threat-model.md` boundary D/E and §6 (currently say the relay enforces
  vote-offs; update to peer-enforced).

## Open questions to coordinate on

1. **Admin-room bans.** These are a *designated-authority* model (one admin, a
   real ban list, relay-held, relay-cut). Do they stay relay-enforced (a
   deliberate, different trust model — you consent to an admin by joining an
   admin room), or move to admin-stamped P2P shunning too? Recommendation: leave
   admin bans relay-enforced for now; the principle bites hardest on the
   *democratic* vote-off, and admin rooms already advertise a central authority.
2. **Same-device eviction.** The relay currently uses `dev` to evict a stale
   same-device socket when a new tab opens (a functionality feature, not
   moderation). If `dev` leaves the relay for plain rooms, decide how (or
   whether) to preserve that — e.g. peer-id in sessionStorage already handles
   reload; the new-tab case may be acceptable to drop, or handled client-side.
3. **Path fingerprint privacy.** Store/gossip a salted hash of the observed IP,
   not the raw IP, so a peer's vote-list gossip doesn't hand every recipient a
   plaintext map of addresses they haven't otherwise observed.

## Relationship to the just-shipped sealing work

Branch `claude/domain-name-status-k2mfc5`, commits `a5151c8` + `a61e038`:
- Names + self-reported IP now travel sealed; the relay authors a peer-ids-only
  roster; IPs are stored only as a salted tag for abuse caps; `whoami` hands each
  socket its own address. **Keep all of that.**
- Device tags were room-salted there, which broke global "votes follow the
  person." **This design supersedes that debate:** with peer-enforced vote-off
  the relay never sees the vote key, so "global vs per-room at the relay" is
  moot. Whoever implements should decide whether to revert the salting/per-room
  test churn or let it fall out naturally when `votekick`/tally/gate are removed.
