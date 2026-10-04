# Meeting security doctrines (canonical)

The security principles the meeting mesh is built on (§LOCK, §SIG, §FWD, §AUTH). Extracted from the
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

The password is STRETCHED before it reaches either derivation: PBKDF2-SHA256,
310k iterations, salted with the room and verifier (`stretchPw`). The relay
holds every occupant's proof and every frame is ciphertext under the key, so
with one plain SHA-256 both were an offline dictionary attack at native hash
speed for any past link holder. Key and proof derive from the stretched bits
under their own labels, so neither reveals the other. (DS `gifos-net-3`.)

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
- **A GENERATION COUNTER, and a FLOOR the room supplies (2026-08-02).** Every
  grant carries `ep`, and a grant at or below my own generation is a replay —
  dead on arrival. That guard was disabled precisely where it mattered most:
  it read `if (m.ep != null && pwEpoch && m.ep <= pwEpoch)`, and `pwEpoch` is 0
  on a FRESH page, so a late joiner accepted ANY replayed grant. Measured: a
  room rotated clubhouse(1) → cleared(2) → vault(3); a joiner typed the current
  password, connected, received the chat — then adopted a replayed ep=1 grant,
  re-keyed itself a generation behind, and sealed itself away mid-transfer,
  grant-healing the room forever from the wrong side. A joiner cannot know the
  room's generation from its own state, so the ROOM says it: the status pulse
  carries `pwEp` (the NUMBER only — the password itself still travels solely
  inside a signed, sealed grant, so this leaks nothing), and a member whose
  sealed frames I can OPEN is speaking my key generation, so its epoch becomes
  my FLOOR. With the floor in place the guard drops its truthiness test —
  epoch 0 is a real generation — and the ancient grant is rejected as the
  replay it is.
- **THE FLOOR IS BOUNDED (2026-10-03).** The pulse is any member's word, so it
  may raise the floor only to a non-negative safe integer at most `PW_EP_MAX`
  (1e9). Unbounded, one member pulsing `pwEp = 1e20` set every listener's
  epoch to a number where `epoch + 1 === epoch`, persisted it, and the admin's
  next grant was dead on arrival everywhere — for the life of the room name.
  A grant's `ep` and the persisted counter must be non-negative safe integers
  too (`pwEpInt`), so `pwEpoch + 1` is always a new generation and an admin
  floored to `PW_EP_MAX` still mints one every seat takes; a stored value that
  fails the rule reads as 0 and the room floors it again.
  `test/unit/meet-pw-epoch.js` runs takeStatus on the poison;
  `test/browser/e2e-meet-password.js` rotates past a poisoned guest.

## §SIG — Authority is a signature, never a stamp

Admin power = knowledge of the admin password, proven cryptographically:

- The PBKDF2 bits derived from the admin password seed an **Ed25519 keypair**.
  The room verifier `V` (in the URL, part of the room's identity) is a hash
  commitment to the PUBLIC key: `H(pubkey)` startsWith `V`.
- Privileged orders (mod table, ban/unban, setpw/re-key — including the sealed
  `pwinfo` peers adopt — banlist re-seed, stopping the room's shared app, and
  the `cdel` chat-delete tombstone) travel **individually signed**
  `{ sp, sig, pub }`. Any peer — and the relay,
  for its door duties — verifies the same proof: commitment, signature over
  the exact signed string, right action, fresh timestamp (5-min replay
  window; the one exemption is `cdel`, verified with no age limit so `hi`
  backfill can re-prove old deletes to late joiners — replaying a delete
  deletes the same message again, which is idempotent). No socket is "an admin socket"; no transport confers authority.
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
   sealed envelope rides the relay TO the doors as ordinary opaque
   `{t:'peer'}` frames — fanned, not single-door: `fsig` goes to 3 doors
   (one door alone was the permanent late-join wedge), `fmesh` HELLO/CLAIM
   to every door, other `fmesh` to one (throttled per target) — and each
   door carries it onward over its channels.

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
Deep-seated newcomers also hold their relay socket until EVERY named
neighbour holds a live DataChannel (mesh-wire `wired()` is all-links; the
socket drops only after a ~20-tick grace once fully wired, and re-opens
whenever wiring regresses — no wall-clock cap), so the answer leg of their
very first handshakes has a path back.

**Trust note:** the relay's authoritative `from` does not cover this path — an
in-room impostor could already disrupt via gossip; connection-level guards
(perfect negotiation, the mesh's link discipline, E2 tenure/yield) bound the
blast radius. Multi-hop widens who may CARRY a pair's signaling from one
sponsor to any room member on the path — but every carrier was already a
room member holding the room key, so nothing new is readable, and S4-signed
mesh fills stay verified at the final recipient regardless of the route. This
is an accepted limit, not an oversight.

## §AUTH — Who may say what about which seat (2026-10-03)

A mesh control frame names seats (`id`, `from`) and cells (`ck`, `coord`),
and the sender writes every one of those fields. None of them proves who sent
it. Two things do:

- **The transport's word, `lk`.** Only the wire writes it: `mesh-wire`
  `ingest(m, via, direct)` sets `m.lk = via` for a frame that came straight
  off the sender's own DataChannel (run.html's pair intake passes `direct`)
  and was not routed. A relay frame's `from` is the socket's own `peer=`
  claim (relay.js and relay-local.js stamp it, and nothing proves the socket
  holds that key — `rs` only stops a live socket being *replaced*), and a
  sponsor envelope's origin is written by whoever built it, so neither ever
  becomes `lk`. The sender may not pre-stamp `lk`, `s4ok` or `s4from`.
- **The author's signature, `s4ok`.** S4 `verifyFill` binds `id` to the
  signer. YIELD, CONFIRM, LEAVE and MOVED are now signed by their author
  (`EVICT` in mesh-wire); the LEAVE/MOVED statement covers `mvd`.

The rules (mesh.js, twinned in test/sim/mesh_seat.inc):

| frame | honoured only when |
|---|---|
| PHONE / PONG (never signed) | the cell is one of my owned links; the transport names the author; an unproven one may only refresh a pairing I already hold |
| HELLO / CLAIM (signed) | the cell is mine, an owned link, my owner's, or my vouch for that id (CLAIM: also my child row). Unproven (sponsor/relay), it never displaces an occupant and holds at most one hint cell per claimant |
| YIELD | from my arbiter — my phone target, or a rook peer in Section 1 — proven the sender (one arbiter suffices: a contest is often seen by one arbiter only) |
| a claim on an occupied cell | never from a claimant I hear first-hand at another cell: a seat is in ONE place, so a neighbour cannot take the next cell over |
| CONFIRM | Section 1 only, from the rival I CHALLENGEd for that cell within 40 ticks, proven, not first-hand live elsewhere |
| LEAVE / MOVED | from the leaver itself (link or signature), freeing only the cell I hold it at |
| ROUTED | for a target I probed in the last 240 ticks |

Every cell key from the wire must be a real cell (`cellKeyOk`: `r,i < C`,
each path digit a column, depth <= 12). No signature rides a per-beat frame,
and an eviction frame that needs one is verified on its own chain, never
ahead of a seating frame. A LEAVE is signed ahead of time so a closing page
sends it in the same tick. `test/mesh/forged-frames.js` is the attack suite.

**Still open** (the first-contact edge of S4, extended to occupancy): a member
can contest a Section-1 cell, or pose as a newcomer at a free cell next to a
victim, under its own signed id, and E2's lower-id-wins favours a ground low
id; a forged but consistent PHONE can keep a dead neighbour looking alive; and
the DataChannel pair id is only as strong as the unsigned WebRTC signaling
that built it. Binding occupancy to the admitter's signed PLACE, and signing
the offer/answer with the S4 key, would close them.

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
