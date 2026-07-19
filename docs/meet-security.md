# Meeting security doctrines (canonical)

The three security principles the meeting mesh is built on. Extracted from the
mesh-refactor design (git history: `docs/mesh-refactor.md`) when the old
deacon/deck model was ripped out; these survived the rewrite because they are
not topology — they are what makes the topology safe to run with a
zero-knowledge relay. Companion docs: `docs/healing-laws.md` (the control
plane), `docs/media-plane.md` (the four media channels),
`docs/threat-model.md` (the whole-system view).

## §LOCK — The door lock is cryptography, not a gate

A LOCKED room's E2E key mixes the password into the derivation
(`deriveMeetKey`, label `meet-e2e-pw`): without the password you cannot READ
the room, no matter what you hold or which door you talk past. The lock is a
property of the ciphertext, not a check someone enforces.

- `sid`/`token` stay password-FREE — routing identity must not move on re-key
  (url+pw must never become a *different room*).
- Changing the password RE-KEYS the room (`rekeyRoom`): members learn the new
  password over the old sealed channel (`pwinfo`), derive the new key, move;
  whoever doesn't learn it falls out of the ciphertext. In a locked room,
  vote-off + re-key = HARD exclusion, achieved entirely P2P.
- The greeter list the relay stores is sealed under this same key
  (healing-laws R2/R6): each entry is `Seal(K, address)`, where the address is
  the greeter's `{peerId, coord}` (a real sealed address, not a bare id). A knocker that can't
  decrypt any entry has the wrong password — that undecryptability IS the
  "wrong password, prompt for it" signal (R6). The relay's own pw check
  remains a courtesy gate only (fail fast with a clear error).

## §SIG — Authority is a signature, never a stamp

Admin power = knowledge of the admin password, proven cryptographically:

- The PBKDF2 bits derived from the admin password seed an **Ed25519 keypair**.
  The room verifier `V` (in the URL, part of the room's identity) is a hash
  commitment to the PUBLIC key: `H(pubkey)` startsWith `V`.
- Privileged orders (mod table, ban/unban, setpw/re-key — including the sealed
  `pwinfo` peers adopt — banlist re-seed, and stopping the room's shared app)
  travel **individually signed** `{ sp, sig, pub }`. Any peer — and the relay,
  for its door duties — verifies the same proof: commitment, signature over
  the exact signed string, right action, fresh timestamp (5-min replay
  window). No socket is "an admin socket"; no transport confers authority.
- A plain room (no `V`) can never have an admin; joining a `V` room is
  structural consent to be administered.

## §FWD — Sponsor-forwarded signaling, and its honest trust note

When a pair has no relay path (deep seats run socketless by design), sealed
frames — WebRTC signaling (`fsig`) and mesh control (`fmesh`) — travel through
the room instead of the relay. The sender tries, in order:

1. **A mutual friend** — the lowest-id connected peer reporting a live link to
   the target forwards over its DataChannel (the classic one-hop sponsor).
2. **The mesh itself** — the sender's own one open-DC step toward the target's
   SEAT (the envelope carries the target's coord; each hop recomputes the next
   step from the row-preserving tree arithmetic).
3. **The greeter DOOR** — the friendless-newcomer bootstrap. A just-seated
   newcomer has NO DataChannels yet, but it always has one guaranteed contact:
   the relay-socketed seats (its entry gateway and the greeter pool — the
   room's public front door, healing-laws R2/E3 — preferring a socketed seat
   already wired next to the target: its owner, head, or row-mates). The
   sealed envelope rides the relay TO that door as an ordinary opaque
   `{t:'peer'}` frame, and the door carries it onward over its channels.

Onward travel is **ttl-bounded UNICAST hop-forwarding** (never a flood): each
hop delivers on a direct channel if it holds one, else takes one mesh step
toward the target's coord; a per-envelope id dedup kills loops; the final hop
may hand the envelope back to the relay addressed to the TARGET itself (it may
be a socketed joiner — the reverse bootstrap). The payload is sealed under the
room key the whole way (a sponsor carries ciphertext it could already read as
a room member, but the relay never can — its knowledge is unchanged).

The relay cooperates with exactly one new frame: a targeted `{t:'peer'}` whose
destination holds no socket is answered to the SENDER with `{t:'nosock', to}`
instead of being dropped silently, so the sender falls back to the sponsor
path immediately instead of retrying blind. This leaks nothing: the roster
already broadcasts which peers hold sockets, and routePeer stays targeted —
the scope rule ("the relay hears only from joiners and greeters") is about
what the relay is *told*, not a refusal to route or to answer honestly.
Deep-seated newcomers also hold their relay socket until their FIRST
DataChannel opens (hard-capped ~2 min — mesh-wire `wired()`), so the answer
leg of their very first handshakes has a path back.

**Trust note:** the relay's authoritative `from` does not cover this path — an
in-room impostor could already disrupt via gossip; connection-level guards
(perfect negotiation, the mesh's link discipline, E2 tenure/yield) bound the
blast radius. Multi-hop widens who may CARRY a pair's signaling from one
sponsor to any room member on the path — but every carrier was already a
room member holding the room key, so nothing new is readable, and S4-signed
mesh fills stay verified at the final recipient regardless of the route. This
is an accepted limit, not an oversight.

## The relay's knowledge, in one paragraph

The relay holds: live sockets, opaque peer ids, room-salted device tags, a
salted IP hash for abuse caps, `H(genesis key)`, and TTL'd sealed greeter
blobs. It reaches a greeter's socket **directly by that greeter's opaque peer
id** — that is how an introduction is delivered, and there is nothing to hide
in it: greeters are the room's public front door, every newcomer touches one,
and a newcomer ends up reachable through them anyway. (Earlier drafts demanded
the relay be *blind to which greeter* and fan every frame out to all sockets;
that bought no real privacy and cost O(sockets) per frame, so it is gone —
targeted delivery to a greeter is fine.) What actually keeps the relay out of
the room's life is **scope**, not blindness: members hold sockets only while
joining or serving as Section-1 greeters; once seated in the mesh (and wired —
§FWD) they drop the socket and the relay never hears from them again. When
asked to route to a peer with no socket it answers the sender `{t:'nosock'}` —
an honest fact the roster already implies — rather than dropping silently or
storing anything. It never holds: the room
code, the password, the E2E key, a name, an IP, a coord, or any notion of who
is seated (healing-laws R2). Arrival order alone decides genesis (R3).
