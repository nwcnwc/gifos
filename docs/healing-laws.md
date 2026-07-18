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

What the laws are for: in a big meeting, people leave constantly — every
departure is a hole in the tree, and every hole must be filled quickly,
by exactly one healer, without stale information, and without the fix
knocking over anything else. There is no server and no boss seat to
coordinate any of it, so every rule below is something each seat can decide
on its own from what it directly knows. Most of this file is that everyday
machinery: noticing a death (D), filling the hole (H), not making it worse
(C), wiring the replacement with live knowledge (W), and the front door (R).
The fallback laws (E) handle the rare extremes — botched races and mass
departures — and are covered at the end.

---

## P — the one principle

**Holes are filled by promoting a leaf.** A leaf has no dependents, so moving
it strands nobody. Every fill below is that one move at some level: a dead
seat is refilled from its own subtree — its down-child walks FINDLEAF down to
a leaf, and the leaf promotes into the hole; a seat with nothing below it
anywhere is packed sideways by the scooch (C2), and even the scoocher must be
childless — a leaf. **Only leaves move. No exceptions.**

## D — how a dead seat gets noticed

- **D1. The heartbeat.** Every non-head seat "phones" its row's head on a
  steady beat, and every head phones the seat above that owns it. Section-1
  heads phone no one — there is nothing above the home. So each head hears
  from its whole row, and each row-mate hears back from its head.
- **D2. Goodbyes are instant.** A seat that announces it is LEAVING is marked
  empty immediately.
- **D3. The sweep is cleanup, not healing.** Each head periodically forgets
  row seats that went silent past the horizon without saying goodbye, so a
  corpse stops riding the head's roster answers. Healing is NOT triggered
  here — that is the designated healer's job (H1/H2). A severed-but-alive
  seat that gets forgotten simply re-announces itself when it recovers.
- **D4. Healers act on CONFIRMED death, not mere silence.** A healer moves
  only when the seat's occ entry is gone (an announced LEAVE, D2) or its
  phone has been quiet past a settled window — never on a transient glitch,
  which would manufacture duplicate seats during a mass heal. A seat whose
  own upward chain is confirmed dead and stays unhealed falls back to the
  drain (E1).

## H — who fills a hole (fixed designation: every hole has ONE pre-named healer)

- **H1. Your down-child heals you (the vertical rule).** Every seat that owns
  a row below it is healed, when it dies, by that row's head — its
  **down-child**. The child is the natural healer: it phones the seat every
  beat (D1), so it notices death first; and it already holds the cousins
  (W6), so it wires the replacement with zero discovery. On confirmed death
  (D4) it runs FINDLEAF down its OWN subtree and a LEAF promotes into the
  hole, pre-wired. If the child is itself childless, it IS the leaf and
  promotes directly. This applies to every level — including Section-1 cells,
  each refilled from below by its own down-child, which is what rebuilds a
  wiped home while keeping the meeting's key (the motion once catalogued as
  H8).
- **H2. A childless seat is healed sideways (left-pack).** A seat that dies
  with nothing below it has no down-child; its fixed healer is its
  **right-neighbour** in the row. That neighbour pulls a leaf from its own
  subtree if it has one — and if it too is childless, it scooches left into
  the hole itself (C2). Rows pack LEFT, so rows stay dense and newcomers
  always land at the right edge. A childless HEAD works the same way: its
  fixed healer is seat `(p,r,1)`. Fixed designation ⇒ exactly one healer, no
  race.
- **H1-S1. Section 1 stays full; its heads are the BACKSTOP.** A Section-1
  cell is normally refilled from below (H1) like any other seat. The row head
  steps in only for a cell whose whole subtree is gone — nothing below to
  promote — and it is also the only thing that clears a Section-1 PHANTOM (a
  stale gossip echo squatting on a cell), acting on direct evidence only:
  liveness is set by a real phone call, never by gossip (E2).
- **H7. Column backfill.** A Section-1 seat that is handed a newcomer first
  checks the row directly above it (wrapping around); if that whole row is
  dead, it seats the newcomer straight above itself. Ordinary arrival traffic
  is what resurrects fully-dead Section-1 rows.
- *(RETIRED: the old H1 "the head heals its row" and H2 "lowest-column
  survivor" — replaced by the fixed designation above. H8 is no longer
  special — it is H1 applied at the top. H6 folded into E3; H3/H4/H5 healed a
  special root seat that no longer exists.)*

## C — rules that stop healing from making things worse

- **C1. Never heal on a maybe.** A seat filled while its occupant still lives
  is exactly the duplicate E2 then has to kill — so healing waits for
  confirmed death (D4), heal attempts are spaced out (cooldowns per hole),
  and newcomers are admitted only at the FRONTIER (a cell whose down-child is
  empty — a true edge), so an admission never races a healer for the same
  hole. Under a mass departure it is better to heal a beat late than to boil.
- **C2. The scooch packs rows left — and even the scoocher is a leaf.** When
  a hole's healer has nothing below it anywhere, the childless right-neighbour
  slides left into the hole. It is childless — a leaf — so even this move
  strands nobody. (The old "scooch is the one non-leaf exception" is gone:
  nothing non-leaf ever moves.)
- **C3. Exactly ONE healer per hole, known in advance — and ONLY it may fill
  the hole.** The down-child (H1) if the seat owned one; otherwise the
  right-neighbour (H2); the backfiller (H7) and the Section-1 backstop (H1-S1)
  own only cells no other rule covers. Because the designation is fixed, no
  two healers ever race for one hole. And the designation is **exclusive**: a
  seat's occupant is changed ONLY by that hole's designated healer, delivering
  the fill **over the healer's existing live link** to the neighbour (W1/W4).
  A bare claim for a hole from anyone else — routed, relayed, or injected — is
  **REJECTED, not adjudicated.** There is no race for E2's tie-break to
  decide, so the tie-break can never be abused to *capture* a seat (see the
  security frame). This is "no action at a distance": to change seat X you
  must already hold a link into X's neighbourhood, which only its neighbours
  and its one healer do.

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

- **E1. The drain.** A seat whose anchor upward is CONFIRMED dead (a definite
  departure, not mere silence — severance alone never triggers a drain, D4)
  and stays unhealed does NOT stampede the relay. It fetches the home roster over the
  mesh sideways (cross-links walk around the dead chain), then acts as the
  greeter for its own subtree: DRAIN fans down, every member re-seats as a
  newcomer, and the initiator re-seats last. Only if NO mesh route to
  Section 1 exists at all (>220 ticks) does it fall back to re-entering
  through the relay. **Section-1 seats never drain or requeue — you ARE the
  home.** (When the home itself is torn in two, the E3 audit *detects* it but
  there is no safe reunion rule yet — see E3's open problem — so no home seat
  is currently made to drain.)
- **E2. Duplicates: the race loser yields.** E2 does NOT decide who may TAKE a
  seat — C3 does that (only the designated healer fills a hole; a raw claim is
  rejected). E2 exists only to settle a duplicate between two *legitimate*
  occupants — chiefly the **severance-revival** case: a seat looked dead, its
  healer filled the hole, then the original revived. Both were placed
  honestly; one must now yield, decided the same way everywhere:
  - Only between **LIVE** claimants — and "live" means **first-hand only**: a
    claimant counts as present only if I have heard it MYSELF, directly, on a
    link it holds to me. Second-hand gossip may inform routing, but it can
    never evict anyone and never keeps a phantom "alive." (Proven in the sim:
    let gossip refresh liveness and evicted ghosts resurrect forever.)
  - **Tenure protects the sitting occupant**: only claims first heard AFTER my
    own seating can outrank me.
  - Ties break deterministically: **lower id wins, higher id yields** — one
    convention, used by every rule in this file (two mixed conventions
    oscillate and never settle; also proven in the sim).
  - **The tie-break is a last resort between two legitimate seats, never a way
    IN.** Because C3 already rejects any un-healer-authorized claim, an
    attacker cannot manufacture an E2 contest for a seat it has no legitimate
    healer claim to — so a forgeable id can no longer *capture* a seat, only
    lose a genuine revival race. (Before C3's exclusivity this was a hole:
    client-set ids let an attacker win a fresh turnover race. Closed.)
  - E2 requires a live witness — some seat directly linked to both claimants.
    Inside one connected mesh that witness always exists (the row is a full
    mesh and the parent owns the head). Across a full partition it does NOT,
    and supplying that missing witness safely — without handing an attacker a
    takeover lever — is exactly the open problem E3's audit runs into.
- **E3. Greeter registration — and the AUDIT (DETECTION ONLY; reunion is an
  OPEN PROBLEM).** Every Section-1 seat knocks at the front door when it takes
  its seat and re-knocks every ~TTL, presenting the meeting's genesis key
  (R3), which admits it to the greeter pool (the Section-1 seats ARE the pool;
  when all of them fall silent for one TTL, the list empties and the room
  reopens for a fresh genesis). Each knock brings the sealed greeter list
  back — and the knocker READS it. *(History: when the genesis key killed
  duplicate foundings we also cut E3's old self-audit — one cut too deep. The
  key prevents two foundings; it cannot prevent the ONE founded home from
  being TORN by mass churn into self-sufficient halves, each healing itself
  whole, both still registered under the same key.)*
  - **What the audit reliably tells us (detection — SAFE).** A tear mints
    freshly promoted home seats on both sides, and a fresh seat knocks the
    moment it sits down, so the first knock after a tear already carries the
    proof: a same-key greeter claiming a coord my own roster (W5) gives to a
    DIFFERENT id, who ANSWERS a ping through the relay (a stale entry for a
    dead seat never answers and TTLs out — the answer is the blip filter).
    **Where we are today: a greeter can notice that another greeter looks
    like it is in a "different meeting" which — by construction — it cannot
    be, since it holds the same URL, password, AND genesis key. That much is
    solid.** Just noticing is safe: it moves nobody and forces nothing.
  - **What to DO about it is UNSOLVED — and every easy answer is a takeover
    weapon.** The moment detection triggers any automatic *remedy* that makes
    one side authoritative over the other, an insider (anyone with the
    link+password — our only trust boundary) can forge that remedy with a
    Sybil attack (one attacker, many fake seats):
    - *"Bigger live home wins, smaller drains"* → the attacker spins up a
      swarm of fake greeters so their side "measures" bigger, and the whole
      real meeting drains and re-seats through the attacker's fakes. Total
      takeover, on command.
    - *"Lower id wins"* → peer ids are CLIENT-SET (`peer=` on the socket, in
      both relays), so the attacker just picks the winning id. (An earlier
      draft here wrongly called ids "unforgeable" — they are not.)
    - Any rule that lets a *detected* group force the other to move is a
      lever a Sybil multiplies. So no counting, no id-vote, no forced drain
      lives here.
    **This is the hard, unsolved problem** (see the "attacker's harm ≈ its
    fanout" note): we have no accounts and no per-person identity, so we
    cannot cheaply tell one real large piece from one attacker wearing many
    masks. E3 therefore STOPS at detection. A safe reunion rule is future
    work.
  - **The current best DIRECTION (candidate, NOT adopted).** Demote the audit
    from *judge* to *introducer*: it opens a single mesh link across the seam
    (relay introduction, greeting scope) to hand E2 the live witness it was
    missing, and then E2 resolves duplicates by **tenure** — a fresh Sybil
    seat cannot outrank a sitting incumbent, so the attacker displaces no one.
    This bounds the attack but does not fully close it (two *equal-tenure*
    pieces still fall to the forgeable id tie-break), so it stays marked OPEN
    until we can defend the sybil case.
  - **The relay stays dumb regardless (R2).** It only serves the same sealed
    list; it never arbitrates. Whatever reunion rule we eventually adopt is
    computed by clients, not the relay.
- *(E4 — a genesis-storm resolver — is DISSOLVED: R2/R3's key prevents the
  storm at admission. E5 — a standalone partition-reunion law — is WITHDRAWN:
  its verdict-and-drain mechanics were a Sybil takeover weapon; only its
  detection half survives, folded into E3 above, and the reunion half is now
  an acknowledged open problem.)*

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
  fork (it is the same meeting torn): the E3 audit *detects* it, but reuniting
  it safely is an open problem, not yet solved.
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

## S — the security frame (an attacker's harm ≈ its FANOUT)

With one shared key, anyone admitted (URL + password — the only trust
boundary) can lie to whoever they are connected to; we cannot stop that. So
the goal is never "prevent lying," it is **bound the blast radius**: an
attacker's harm is roughly the number of people it is connected to — its
seats plus the paths that run through it. Every mechanism is judged by one
test: *does it let a peer's reach grow faster than slow, tenure-gated,
rate-limited honest work?* Anything that lets influence jump discontinuously
is the bug.

- **S1. No action at a distance (C3 exclusivity).** A seat's occupant changes
  only via that hole's one designated healer, over an existing link. You can
  only affect seats you are already wired near — your own neighbourhood. An
  attacker cannot reach across the tree to a *far* seat it has no link into.
- **S2. No turnover capture (C3 + E2 scoping).** When a seat churns, only its
  designated healer may fill it; a raw claim is rejected. So the moment of
  turnover is no longer an open race a forgeable id can win. E2's tie-break
  decides only genuine revival races between two *legitimate* seats — never a
  way in.
- **S3. No chokepoint monopoly (media redundancy).** Even a captured seat
  cannot dominate a downstream view, because every viewer pulls Stage/Stadium
  from *several* independent sources (multi-subscribe, cross-links —
  docs/media-plane.md). Poison is one feed among many, dropped or deduped.
  So a local capture stays local.
- **S4. No climb (per-seat identity, TOFU, ALL the way down).** S1 is not
  enough by itself: an attacker doesn't stay put, it tries to climb toward
  fanout, one level at a time. And climbing is exactly what the mesh
  pre-wires it for — W6 hands every seat the live wiring of the layer *above*
  it (cousins) so it can promote up, and it already holds links to those
  cousins. So an attacker CAN reach and address the neighbours of the seat
  right above it. If healer-identity were forgeable there, it would
  impersonate that seat's designated healer, capture it, and repeat — rising
  to poison ever more people. This is why "only the healer may fill" is
  airtight ONLY if a witness can't be FOOLED about *who* the healer is — and
  that must hold at **every level, not just the public Section-1 ring.** The
  hardening:
  - **A lightweight per-seat identity, minted at seating, pinned on first
    contact (TOFU) — tree-wide.** When a seat takes a coord it mints a
    throwaway keypair and its pubkey is pinned by its neighbours; every fill
    or promotion it authors is signed by it, so an impostor cannot claim "I
    am the healer of the seat above you." No accounts, no cost.
  - **Trust is CHAINED, not raw per seat.** A new seat's key is introduced by
    the healer that placed it — whose key was pinned when *it* was placed —
    so there is no fresh unauthenticated first-contact to race: the
    just-promoted occupant is vouched by an already-trusted healer, down to
    frontier admission (vouched by the gatekeeper) and up to the genesis
    founder. The delegation follows the same tree the healing does.
  - **STATUS: specified here, not yet implemented.** Until it lands,
    healer-identity rests only on the healer's structural head start (it
    detects a death in seconds via the heartbeat D1; an attacker learns of a
    turnover only at gossip/relay speed) — a real edge, not a proof — and the
    exposure is worst at Section 1, where wiring is fully public (W5/W6) and
    seats are relay-reachable.

**Still open (named honestly):** the **Sybil** attack — one attacker wearing
many masks — is not solved, because we deliberately have no accounts and no
per-person identity. C3/S1/S2/S4 keep a Sybil from *reaching* or *climbing*
into seats it has no legitimate healer claim to, and tree-wide TOFU keeps it
from *impersonating* a healer at any level; but nothing yet stops an insider
from being *many legitimate-looking seats at once*, nor from racing the very
first pin of a brand-new key before the real healer announces. These are the
same gap that leaves the torn-home reunion (E3) unsolved.

---

## The two hard cases — one closed, one open

1. **Two nodes claim the same seat (CLOSED).** Only the one designated healer
   may fill a hole; any other claim is rejected (C3), so no attacker can
   *contest* a seat. A duplicate only arises between two *legitimate* seats
   (severance-revival), and E2 settles that deterministically — first-hand
   liveness only, tenure first, lower id wins. (The one residual: proving
   *who* the healer is at every level needs the tree-wide per-seat TOFU key of
   S4 — worst at the public Section-1 ring — specified, not yet built.)
2. **Churn shatters the meeting into disconnected pieces (PARTLY OPEN).**
   Severed subtrees drain back in (E1); dead home cells are rebuilt from
   below (H1/H1-S1/H7, key preserved); a lone cut-off member gets an honest
   answer (R6). But the hardest sub-case — the HOME ITSELF torn into two
   self-sufficient, same-key pieces — is only DETECTED (the E3 audit), NOT
   yet safely reunited: every automatic reunion rule we have tried is a Sybil
   takeover weapon, and with no per-person identity we cannot yet tell one
   big real piece from one attacker in many masks. This is the open problem.
   (Separately, a genuinely DIFFERENT meeting — a different genesis key — is
   put to a human being, R5.)

There is no root to fight over and no arbiter to trust — every verdict above
is computed independently by clients. But the open sub-case is a real one:
peer ids are client-set, not unforgeable, so any reunion rule that lets a
detected group *move* another is a lever a Sybil attacker multiplies. Until
we have a cheap way to bound identity, a torn home is safely NOTICED but not
safely REJOINED. See the mesh security frame: an attacker's harm ≈ its
fanout; bound it, never hand it a mechanism that multiplies one seat into
many.
