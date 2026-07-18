# The GifOS mesh healing laws (canonical)

This is the rulebook for how a meeting keeps itself alive when people come, go,
and vanish. **Every heal change must name which law it implements.**

The C++ reference sim is the SOURCE OF TRUTH: `sim/mesh.cpp` +
`sim/mesh_seat.inc` + `sim/topo.h`. Production runs a line-for-line port —
`site/js/mesh.js` (the Seat brain) on `net.topo`, bound to real transports by
`site/js/mesh-wire.js` — pinned against the sim's numbers by
`test/mesh-harness.js` and end-to-end by `test/e2e-mesh-wire.js`. Security
doctrines: `docs/meet-security.md`. Media: `docs/media-plane.md`.

## The picture, in three sentences

A meeting is a tree of small **rows** (C seats each, everyone in a row directly
connected). **Section 1** is the top of the tree: C² seats with *nothing above
them* — together they ARE the home of the meeting; there is no root and no
boss. Every other seat hangs somewhere below: a row's column-0 seat (its
**head**) connects UP to the seat that owns the row, one level above; a **leaf**
is a seat with nobody below it.

Two hard problems drive everything in this file:

1. **Two people end up claiming the same seat.** (Healing races make this
   possible.) → settled by **E2**.
2. **So many people vanish at once that the meeting breaks into disconnected
   pieces.** → put back together by **E1, H7, H8, and E5**; only a genuinely
   *different* meeting is ever put to a human (**R5**).

---

## P — the one principle

**Holes are filled by promoting a leaf.** A leaf has no dependents, so moving
it strands nobody. Every rule below is this same idea at a different level:
a row keeps itself whole by pulling up a leaf from its own subtree;
child-heals-parent is the same motion one level up. Only leaves move —
the sole exception is the scooch (C2).

## D — how a dead seat gets noticed

- **D1. The heartbeat.** Every non-head seat "phones" its row's head on a
  steady beat, and every head phones the seat above that owns it. Section-1
  heads phone no one — there is nothing above the home. So each head hears
  from its whole row, and each row-mate hears back from its head.
- **D2. Goodbyes are instant.** A seat that announces it is LEAVING is marked
  empty immediately.
- **D3. The sweep.** Each head periodically sweeps its row for seats that went
  silent (quiet more than 50 ticks) without saying goodbye.
- **D4. Silence upward.** If my own calls stop being answered, the seat I
  report to is dead: start healing after 40 quiet ticks; if still nothing by
  80, treat myself as cut off and fall back to the drain (E1).

## H — who fills a hole

- **H1. The head fills holes in its own row** — but only if the dead seat had
  children below it (a childless hole is left empty, C1). **Exception, H1-S1:**
  in Section 1 the head refills ANY empty cell of its row, childless or not —
  the home is always kept whole.
- **H2. Row-mates replace a dead head.** The surviving row-mate with the
  lowest column number does it — deterministic, so there is exactly one healer
  and no race. Applies to Section-1 rows like any other.
- **H7. Column backfill.** A Section-1 seat that is handed a newcomer first
  checks the row directly above it (wrapping around); if that whole row is
  dead, it seats the newcomer straight above itself. Ordinary arrival traffic
  is what resurrects fully-dead Section-1 rows.
- **H8. Whole-section death (relay-free reconstruction).** A section head
  whose owner cell `O` is dead — and `O`'s whole row is empty (no H2 healer)
  and the cell below `O` is empty too (no H7 backfill) — heals `O` itself: it
  promotes a LEAF from its own subtree into `O` (the head stays put; only
  leaves move, P). It hands the leaf its **cousins** (W6) as the ready-made
  neighbour list, so the leaf lands pre-wired with no relay involved. This is
  what rebuilds a totally wiped Section 1: each surviving section head refills
  its own Section-1 cell from below, and the heads themselves are the
  connective tissue that carries the new roster to the promoted leaves.
- *(H6 folded into E3; H3/H4/H5 retired — they healed a special root seat that
  no longer exists.)*

## C — rules that stop healing from making things worse

- **C1. Childless holes stay empty.** Nobody below depends on them, so filling
  them buys nothing and risks a cascade — except in Section 1 (H1-S1), and
  heads, which are always refilled.
- **C2. The scooch is the last resort** — and the ONLY time a non-leaf ever
  moves: the head of a childless frontier row, healed sideways per H2.
- **C3. Exactly ONE healer per hole.** The head (H1), the lowest-column
  survivor (H2), the backfiller (H7), or the down-child (H8) — never two
  rules racing for the same hole.

## W — the healer wires with live knowledge, never stale gossip

- **W1.** A healer builds the promoted seat's neighbour list from its OWN live
  view at the moment of promotion (including itself, when it borders the hole).
- **W2.** Every heartbeat answer carries "who my owner is" — so every seat
  always knows its grandparent, live.
- **W3.** A head's heartbeat answer to a row-mate carries the current row
  roster.
- **W4.** A freshly promoted seat announces itself on all its links and phones
  upward; the orphaned subtree below re-attaches by phoning the refilled cell.
- **W5.** Every Section-1 seat maintains the FULL C² home roster,
  freshness-tagged, synced across the section's rows and cross-links on every
  heartbeat (**S1SYNC**). This roster is what greeters serve to newcomers and
  what draining subtrees re-seat against.
- **W6. Cousin foreknowledge (feeds H8).** S1SYNC carries each home cell's
  heir (the section head one level down), and on every heartbeat an owner
  teaches its down-child the heirs sitting at that child's *future* neighbour
  coords; heads share these cousins with their row-mates too. So every seat
  holds its parent-layer neighbourhood in advance, and an H8 promotion lands
  into an already-wired mesh — no relay, no discovery delay. (Bounded: ~C²
  addresses per seat, always the immediate aunt/uncle layer.)

## E — when ordinary healing isn't enough

- **E1. The drain.** A seat whose entire chain upward is dead (>80 ticks,
  unhealed) does NOT stampede the relay. It fetches the home roster over the
  mesh sideways (cross-links walk around the dead chain), then acts as the
  greeter for its own subtree: DRAIN fans down, every member re-seats as a
  newcomer, and the initiator re-seats last. Only if NO mesh route to
  Section 1 exists at all (>220 ticks) does it fall back to re-entering
  through the relay. **Section-1 seats never drain or requeue — you ARE the
  home** — with ONE exception: E5, when the home itself has been torn in two
  and this piece lost the coin-flip.
- **E2. Duplicates: the race loser yields.** Two ids on one seat ⇒ one must
  yield, decided the same way everywhere:
  - Only between **LIVE** claimants — and "live" means **first-hand only**: a
    claimant counts as present only if I have heard it MYSELF, directly, on a
    link it holds to me. Second-hand gossip may inform routing, but it can
    never evict anyone and never keeps a phantom "alive." (Proven in the sim:
    let gossip refresh liveness and evicted ghosts resurrect forever.)
  - **Tenure protects the sitting occupant**: only claims first heard AFTER my
    own seating can outrank me.
  - Ties break deterministically: **lower id wins, higher id yields** — one
    convention, used by every rule in this file (two mixed conventions
    oscillate and never settle; also proven in the sim). A losing head that
    nobody would otherwise contact is told over the YIELD back-channel.
  - E2 requires a live witness — some seat directly linked to both claimants.
    Inside one connected mesh that witness always exists (the row is a full
    mesh and the parent owns the head). Across a full partition it does NOT —
    that case is E5's, and after E5 reunites the pieces, any momentary
    duplicates raised by the re-seating crowd are ordinary witnessed races
    that E2 settles normally.
- **E3. Greeter registration.** Every Section-1 seat knocks at the front door
  when it takes its seat and re-knocks every ~TTL, presenting the meeting's
  genesis key (R3), which admits it to the greeter list. The Section-1 seats
  ARE the greeter pool. No roster comparison, no stitching — admission is by
  the key. When every Section-1 seat stops re-knocking for one full TTL, the
  list empties and the room is open for a fresh genesis.
- *(E4 — a genesis-storm resolver — is DISSOLVED: R2/R3's key prevents the
  storm at admission.)*
- **E5. Same-key partition reunion (the torn home).** Extreme churn can tear
  ONE meeting into two (or more) disconnected pieces in a single instant —
  same URL, same password, same genesis key — each piece keeping or rebuilding
  (H2/H7/H8) its own copy of Section 1. R2/R3 prevents two *foundings*; it
  cannot prevent the one founded home from being torn. This is NOT a fork
  (nothing here is a different meeting), so R5's human choice does not apply.
  The pieces reunite like this:
  - **Noticing costs nothing new.** Section-1 seats already re-knock every
    ~TTL (E3) and get the sealed greeter list back. A partition shows up as a
    same-key greeter on that list who is NOT in my home roster (W5) and whom
    the mesh cannot reach. Confirm it first-hand, never by gossip: message
    that greeter THROUGH the relay (legal — both hold sockets; greeting scope,
    R2). A live seat in another piece answers; a stale entry of a dead seat
    never answers and simply TTLs out. Answers-via-relay + unreachable-via-mesh,
    observed on two consecutive knocks, = the meeting is in pieces. (Two
    knocks so a momentary churn blip never triggers it.)
  - **Choosing sides needs no arbiter.** Every piece sees the SAME sealed
    list, so every piece applies the same rule and reaches the same verdict
    without exchanging a word: compare the pieces' claimants of the founding
    seat `('',0,0)` — **lower id wins** (E2's own tie-break; ids are
    unforgeable). The winner's piece is CANONICAL; the rest are guests. A
    piece with no founding-seat claimant on the list is automatically a guest.
  - **Reunion is a drain, not a war.** The guest piece's Section-1 seats do
    the one thing Section-1 seats otherwise never do: they drain (E1). Each
    fans DRAIN down its subtree; every member walks back in through the front
    door of its own meeting — knock, sealed list, a canonical greeter, a seat
    (R4) — leaves first, the Section-1 seat itself last, and it stops
    re-knocking so its greeter entry lapses. Nobody is evicted, no messages
    battle across the seam, no id war: the guest side simply rejoins. Any
    duplicate that flickers while the crowd re-seats is a local, witnessed
    race — E2 mops it up.
  - **The relay stays dumb.** It learns nothing and arbitrates nothing (R2) —
    it only keeps serving the same sealed list it always served; the verdict
    is computed by clients FROM that list. If the relay is down, the pieces
    simply stay apart until it returns — exactly as tolerable as new joins
    being blocked — and the next knock after it returns heals the room.

## R — the front door

- **R1. No stored home anywhere.** WHOHOME walks the live mesh to any
  Section-1 seat and gets the W5 roster back.
- **R2. The relay is a zero-knowledge greeter registry** keyed by the hashed
  URL. It stores ONLY `H(genesis key)` plus a TTL'd list of SEALED greeter
  entries — each `Seal(K, address)` under the meeting-URL key `K` the relay
  never holds, where the address is the greeter's `{peerId, coord}`. On a
  knock it returns the sealed list, and ADMITS the knocker to the greeter pool
  iff the list is empty (mint genesis) or the presented key matches. Each
  greeter's opaque peer id IS the handle that reaches its socket, so the relay
  delivers an introduction straight to a named greeter — fine and expected;
  greeters are the public front door. It holds no home, no coords, no names,
  no IPs, no room contents, and arbitrates nothing — arrival order alone
  decides genesis. A URL-holder decrypts the list and reaches a RANDOMLY
  chosen greeter (spreads the load); the operator sees only ciphertext and a
  hash. Entries expire on TTL; an empty list forgets the key.
- **R3. Genesis via the key.** A newcomer knocks with a throwaway personal
  key. The first knocker to meet an EMPTY list has its key recorded as the
  meeting's genesis key and founds seat `('',0,0)`. The relay records it at
  knock time and is single-threaded, so every later knocker sees a non-empty
  list and never founds. A newcomer learns the real genesis key during the
  newcomer dance (the greeter's HOME reply carries it) and, once seated in
  Section 1, re-knocks with it to join the greeter pool. One key per
  URL-instance ⇒ no founding storms; the key is the member-held INSTANCE
  IDENTITY of this particular meeting (a different key = a different meeting).
- **R4. Seating is a ping.** Pick a RANDOM Section-1 seat off the roster and
  descend its tree, dense-before-deep, to a definitive vacancy (H7 first).
- **R5. A genuine fork is a HUMAN decision.** Two meetings with DIFFERENT
  genesis keys under one URL (a real relay-level split, or an adversarial
  decoy whose sealed dance fails) are never auto-merged: the client surfaces
  the unforgeable FACES on each tree's Stage and the human chooses which room
  to be in. Counts can be inflated; a face cannot. — A same-key split is NOT a
  fork: it auto-reunites by E5 and no human is ever asked.
- **R6. The stranded newcomer** (pure client logic, zero relay presence). The
  greeter list is sealed under `K = derive(url, pw)` — URL secret AND password
  — so in a locked room even the guest list is invisible without the password.
  A newcomer holding a greeter list but no seat reasons from three
  observables — *decryptable? alive? reachable?*:
  - **Can't decrypt the entries** ⇒ wrong password ⇒ prompt for it.
  - **Decrypts but can't reach any greeter** after trying them all ⇒ wait one
    greeter-TTL ("Trying to connect… ⟨countdown⟩"), then re-check the relay:
    - **List EMPTY** ⇒ the meeting ended; mint and take over the room (R3
      serialises concurrent take-overs — no storm).
    - **List still NON-EMPTY** ⇒ the meeting is genuinely live and I am the
      one cut off — voted off, or on an unreachable network, which are
      indistinguishable *and correctly so* (a ban you could be told about
      would require reaching you — the very thing that is failing) ⇒ surface
      *"This meeting is taking place but your network settings aren't letting
      you connect."*
  This collapses wrong-password, partition, ban, and "I'm just late" into ONE
  observable state machine, and the only action it ever takes is one the
  system already supports (found on an empty list).

---

## The two hard cases, closed

1. **Two nodes claim the same seat.** Inside one connected mesh a live witness
   always exists, and E2 settles it deterministically — first-hand liveness
   only, tenure first, lower id wins, one convention everywhere.
2. **Churn shatters the meeting into disconnected pieces.** Severed subtrees
   drain back in (E1); dead home rows are rebuilt from below (H2/H7/H8, key
   preserved); a torn home reunites through the front door it never stopped
   sharing (E5); a lone cut-off member gets an honest answer (R6). Only a
   genuinely DIFFERENT meeting — a different genesis key — is ever put to a
   human being (R5).

There is no root to fight over, no arbiter to trust, and no message a
partition can forge: every verdict above is computed independently from
unforgeable ids and a sealed list every member already holds.
