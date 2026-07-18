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

When a pair has no relay path (deep seats run socketless by design), a MUTUAL
FRIEND's DataChannel forwards the sealed frame (`fsig`) — one hop,
deterministic sponsor pick (lowest-id connected peer reporting a live link to
the target), sealed end-to-end the whole way (the sponsor carries ciphertext
it could already read as a room member, but cannot alter).

**Trust note:** the relay's authoritative `from` does not cover this path — an
in-room impostor could already disrupt via gossip; connection-level guards
(perfect negotiation, the mesh's link discipline, E2 tenure/yield) bound the
blast radius. This is an accepted limit, not an oversight.

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
joining or serving as Section-1 greeters; once seated in the mesh they drop the
socket and the relay never hears from them again. It never holds: the room
code, the password, the E2E key, a name, an IP, a coord, or any notion of who
is seated (healing-laws R2). Arrival order alone decides genesis (R3).
