# The relay is an introducer, not a hub

**Status:** design proposal, not yet implemented. Written for coordination with
a parallel work-stream. Companion to `docs/p2p-vote-off.md` (moderation) — this
doc is the foundation that one sits on.

## The target

The relay's only job is to **introduce a new peer into a room**. Once a
newcomer is stitched into the mesh, the mesh runs entirely peer-to-peer:
signaling, roster, gossip, moderation, everything. A peer should not need to
contact the relay again for the life of its membership. The relay is a
one-time front door, not a switchboard the room keeps calling.

This is the logical endpoint of "don't do centrally what can be done p2p."

## One precise clarification, so the bootstrap isn't designed on a false premise

It is tempting to say "the relay can't poll the members because the roster is
unreadable to it." That is **half right, and the wrong half is load-bearing.**

- **True:** the relay cannot read *who* the members are. Names, addresses, and
  the roster's identity are sealed under the meeting-URL key it does not hold
  (`a5151c8`, `a61e038`). It authors a peer-ids-only routing hint.
- **False:** that sealing does *not* stop the relay from *reaching* members. The
  relay already fans a frame to **every socket currently open to it**, blind to
  identity — that is exactly what `broadcast()` / the `gossip` handler do in
  `relay/src/relay.js` today (iterate the live WebSockets, `send` to each). It
  needs no roster to do that.

So what actually removes the relay from the loop is **peers closing their
sockets**, not the roster being sealed. This matters because it means the
"introducer only" model is a *deliberate socket-lifecycle decision*, and it
forces one real design question (next section) that a "the relay is already
blind so it's already out" framing would hide.

## The bootstrap question: who greets the next newcomer?

For the relay to introduce a newcomer, **at least one existing member must be
reachable through the relay at the moment the newcomer arrives.** If every
member has truly closed its socket, a newcomer connects to the relay, finds an
empty session, and has no one to be introduced to — the mesh has left and is
now unfindable. Pure "everyone disconnects after joining" makes the room
un-joinable.

So the model needs a greeter. Options:

- **(a) Rotating greeter (recommended).** Exactly one member holds an open
  socket as the room's current entry point. The relay hands each newcomer to
  the greeter; the greeter brokers them into the mesh over P2P and hands off
  greeter duty (e.g. to the newcomer, or by the same deterministic election the
  code already uses for deacons/host-takeover). Every *other* member has closed
  its socket and never contacts the relay again. One socket open per room, not N.
- **(b) All-idle sockets.** Everyone keeps a socket open but never *sends* after
  join. Under Cloudflare hibernation an idle socket costs nothing, and the relay
  can push a newcomer's introduction to all open sockets; the best-placed one
  sponsors. This honors "never *contact* (send to) the relay again" while
  keeping a receive path. Simpler, but N sockets instead of 1, and it leans on
  hibernation staying free.
- **(c) First peer.** An empty room's first arrival has no greeter; it *becomes*
  the greeter and waits. This is just the base case of (a).

Recommendation: (a). It keeps the relay's steady-state footprint at one
hibernating socket per active room and matches the election machinery already in
the codebase.

## The missing machinery: sponsor-forwarded signaling

Today **every** pair's WebRTC negotiation goes through the relay — offers,
answers, ICE, and even renegotiation — because a pair's DataChannel does not
exist yet when they first handshake. `sendSig()` in `site/meet.html` only routes
the *status* heartbeat over the DataChannel; offers/answers/ICE always take the
relay socket (see its own comment: "Offers/answers/ICE stay on the relay too —
the DC doesn't exist yet when they matter"). No signaling of any kind currently
flows peer-to-peer.

So "introduce once, then P2P" needs two builds:

1. **Post-join signaling on the DataChannel.** Once a pair is connected, all
   further negotiation for that pair (renegotiation, track changes, ICE
   restarts) must ride their DataChannel, not the relay. The `onDc` path already
   handles `kind:'status'`; extend it to `offer`/`answer`/`ice`.
2. **Sponsor-forwarded introduction.** A newcomer reaches exactly one member
   (the greeter/sponsor) via the relay. To join the *rest* of its row/mesh, the
   sponsor must **forward** the newcomer's offer/answer/ICE to the other members
   over existing DataChannels, and relay their replies back — a
   rendezvous-over-P2P. Each new pair, once it exchanges ICE this way, connects
   directly (or islands per the existing NAT rules). This is the core new
   primitive.

   Existing pieces to build on, not from scratch:
   - `relayVia` (`site/meet.html`) already forwards **media** for a blocked pair
     through a mutual friend — the same shape, but for signaling instead of
     media.
   - The `fwd`/chain primitive in `site/js/gifos-net.js` (`{t:'fwd', src, to,
     p}`) already forwards an arbitrary sealed piece peer-to-peer.
   - The fold **manifests** (`comp-own`/`comp-stream`) already circulate row
     membership P2P — the sponsor's "here is who else is in your row" handoff is
     a manifest, which the code already produces.

## What the mesh already does P2P (so the "after" state is mostly built)

- **Media** is P2P by definition; row-scoped with cross-row folds (`docs/rows.md`).
- **Membership across the tree** already travels P2P via fold manifests and
  status gossip; only the single-session peer-id roster still originates at the
  relay (as a routing hint).
- **Sealed identity** (name, self-reported IP) already rides the sealed
  heartbeat/offers/answers (`a5151c8`, `a61e038`).
- **Moderation** is the subject of `docs/p2p-vote-off.md` — client-side tally +
  shunning, keyed on the ICE-observed path. That design assumes exactly this
  relay-as-introducer world and needs it: with peers off the relay, there is no
  relay to tally or kick, which is the point.

## Honest limits (state these plainly)

1. **Re-introduction on dropout.** If a peer's P2P links all fail (a network
   blip, a laptop sleep, every direct link and every friend-relay gone), it has
   no way back into the mesh except to contact the relay **once more** to be
   re-introduced. So "never contact the relay again" is really "never again
   *unless you fall out of the mesh*." The relay front door must stay open for
   re-entry, not just first entry.
2. **The greeter is a soft single point.** In model (a), if the greeter drops in
   the instant between the relay handing off a newcomer and the handoff
   completing, that newcomer's join can fail and retry. Rotation + the existing
   deterministic election keep this from being a real availability hole, but it
   is a seam to test (the same class as host-takeover).
3. **NAT islands are unchanged.** Signaling can always be forwarded (it is tiny),
   but the resulting *media* link between two hard-NAT peers may still fail and
   fall back to a friend-relay exactly as today. Being off the relay for
   signaling does not create new connectivity; it removes the relay from a path
   that already worked.
4. **Presence/quorum denominators are peer-derived.** Anything that needs "how
   many are present" (e.g. vote-off majority) now reads a fully peer-gossiped
   view. It is eventually-consistent and only as trustworthy as that view — do
   not present it as an authoritative count.
5. **The relay still sees connection metadata at introduction.** For the seconds
   a newcomer is on the relay being introduced, the relay observes their IP
   (unavoidable — it terminates the socket) and the ciphertext they route. This
   is the same accepted transport-level exposure as today; it is just briefer.

## Concrete change list (for whoever implements)

- **Move post-join signaling to DataChannels.** `sendSig()` routes
  offer/answer/ICE over the pair's DC when it exists; `onDc` handles them.
- **Build sponsor-forwarded introduction.** A `{kind:'introduce', …}` flow: the
  relay connects a newcomer to the greeter; the greeter forwards the newcomer's
  SDP/ICE to row-mates over DCs and relays answers back; hand the newcomer the
  row manifest so it knows who to expect.
- **Elect and rotate a greeter.** Reuse the deacon/host-takeover election. The
  greeter is the one member holding an open relay socket; on handoff it closes.
- **Close the socket after join** (models a/c) — everyone except the current
  greeter drops the relay socket once stitched in, and reconnects only to
  re-bootstrap after a full dropout.
- **Keep the relay's introduce path and abuse caps; delete nothing it needs to
  greet.** But once vote-off (`docs/p2p-vote-off.md`) moves P2P, the relay's
  `votekick`/tally/boot/door-gate go, and with signaling P2P the relay's
  steady-state per-room cost approaches a single idle socket.

## Relationship to the sealing work and the vote-off design

- Keep the identity sealing (`a5151c8`, `a61e038`): names/IP sealed, peer-ids-only
  roster, salted IP tag, `whoami`.
- This doc explains *why* the sealed roster alone didn't take the relay out of
  the loop, and what actually does (socket lifecycle + P2P signaling).
- `docs/p2p-vote-off.md` is the moderation layer that presumes this world.
  Implement this first (or together): peer-enforced moderation is only coherent
  once peers are actually off the relay.
