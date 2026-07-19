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
- **D5. Transport loss is first-hand — it MAY start the confirm probe
  immediately; the horizon remains the backstop.** A seat that watches its OWN
  transport to a neighbour die (the DataChannel closes / the connection lands
  in a hard failed state — never gossip, never hearsay) holds a first-hand
  observation and may begin that seat's probe-gated death confirmation NOW
  instead of waiting out the silence horizon: the probe travels the MESH, not
  the dead link, so a slow-but-alive peer answers and keeps its seat (an
  answered probe erases the observation entirely — no eviction, E2/tenure
  untouched); only a peer unreachable on every path for the settled early
  window is confirmed dead. The trigger is edge-triggered (one probe burst per
  transition — a flapping link cannot storm), a mere 'disconnected' blip never
  fires it, and a death with no transport event keeps the ordinary D3/D4
  horizon unchanged. A relay-observed socket death (the R2 registry's own
  transport plane watching a greeter/joiner socket die — a server frame no
  peer can forge, so still not gossip) may start the same probe: since the
  probe gate decides everything, the worst a wrong trigger can ever cost is
  one probe.

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
- **H1-S1. Section 1 stays full; its heads are the BACKSTOP — but it heals a
  ring cell only on STRONG confirmation.** A Section-1 cell is normally
  refilled from below (H1) like any other seat, and the row head is the
  backstop for a cell whose whole subtree is gone; the head is also the only
  thing that clears a Section-1 PHANTOM (a stale gossip echo squatting on a
  cell), acting on direct evidence only — liveness is set by a real phone
  call, never by gossip (E2). **Ring-heal conservatism:** a wrong ring-heal
  is the *one* act that can mint a divergent home (heal a cell whose occupant
  is merely unreachable, not dead, and you have duplicated it into a second
  ring). So a home cell is healed only after its occupant is unreachable via
  **all** its redundant paths (W7) for a settled window — a much higher bar
  than an ordinary hole. Holding a home coord as a temporary hole is a
  recoverable availability dip; duplicating it is an unrecoverable
  divergence, so the ring always chooses the hole. With W7's redundancy,
  "unreachable on every path" is strong evidence of true death — so this only
  ever hesitates during a genuine partition, which is exactly when hesitating
  is correct.
- **H7. Row-fill seating (newcomer admission).** Section 1 fills ROW-MAJOR:
  row 0 seats 0..C-1, then row 1, and so on — so the first C people in a room
  are ROW-MATES. This is load-bearing for the media plane: the near field
  (raw camera + row-bus audio alignment) is ROW-scoped, so a 2-person meeting
  must seat both people in one row — a direct conversation — never as
  column-mates. Admission keeps the C3 fixed-designation discipline — every
  home cell has ONE designated admitter, so admissions never race:
  - cell `(0,t,j>0)` is admitted by its row head `(0,t,0)`;
  - a row head `(0,t,0)` is admitted by the head of the row above,
    `(0,(t-1+C)%C,0)` — growth seeds downward row by row.
  A seat handed a FIND scans the home row-major for the first admissible cell
  (free AND a true frontier — a free cell that still owns a subtree is an
  internal hole belonging to its designated healer, C1) and either admits (if
  it is that cell's admitter) or hands the FIND to the admitter — always a
  rook link, and all home seats are socketed greeters besides.
  **The headless-row rule (two clauses, both first-hand).** (a) A row's
  liveness is judged first-hand-first: a seat's OWN row is live because it is
  sitting in it — a lone survivor's gossip freshness for its own cells decays
  (nobody phones a lone seat), and without this clause it would
  resurrection-scan its own live row and seat a 2-person room as COLUMN-mates.
  (b) The vacated HEAD of a live row is an internal hole owned by its
  designated healer (the H2 scoocher or the vertical promotion) — never an
  admission target (C1: an admission must not race a healer); and any cell
  whose designated ADMITTER is a vacated head — occ-EMPTY, i.e. a delivered
  LEAVE (D2-confirmed; mere silence never clears occ, so silent death stays
  behind the H1-S1 ring-hold) — has its admission duty DEVOLVE to that
  head-hole's one fixed H2 healer: the occupant of column 1 of the admitter's
  row. Fixed designation, one seat, no race — C3's designated-healer
  discipline applied to admission. (Without this, a FIND arriving in the
  seconds after a head's goodbye found no live admitter anywhere — every row
  cell pointed at the vacated head, every head cell at a row that never
  lived — and fell through the whole home scan to seat the joiner DEEP under
  a survivor, or died at the corpse and rode the FIND-retry cadence: the
  "headless-row admission gap". Repro: `sim/repro-headless-row.sh`.)
  **The resurrection clause (H7's original job, kept).** A row that LIVED and
  is now entirely silent — a whole-row death, distinguished from a never-born
  row by any `s1seen` memory of it — is re-seeded by ARRIVAL traffic, not by
  the frontier scan: when a whole home row dies, its subtrees drain (the
  anchor is confirmed dead at ~80 ticks, long before the RING_HOLD vertical
  heal at 220) and re-enter as newcomers, and those arrivals are seated
  straight back into the dead row, ignoring the stale occ corpses / childOf
  entries that linger for a wiped row (nobody is left to sweep them). The
  no-race discipline of the old rule is kept exactly: the admitters are the
  greeters of the row BELOW the dead row ((t+1)%C — the old "row above me is
  dead" relation), each admitting at its OWN column, so no two admitters ever
  target one cell; other seats hand the FIND toward that row. Adjacent dead
  rows resolve bottom-up, the same upward cascade the old wrap produced.
  *(History: H7 used to be "column backfill" — a seat parked each newcomer in
  the empty row above itself. Its resurrection half is exactly the clause
  above; but in a YOUNG room it also fired on never-occupied rows and spread
  the first arrivals heads-first down column 0 — a 2-person room seated its
  two people in different rows, and the row-scoped media plane gave them no
  direct media. The never-born/once-lived distinction (`s1seen`) removes the
  misfire; the spread was never load-bearing — under the W7 rook's graph rows
  and columns are symmetric for connectivity/density, so row-major fill is
  equally dense.)*
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
  - **And only into a seat that is genuinely EMPTY — healing fills holes, it
    never makes them.** Being the designated healer is permission to fill an
    *empty* seat, never to declare a *full* one empty. Each neighbour accepts
    a fill only for a coord where IT has itself, first-hand, stopped hearing
    the prior occupant (D4 / E2 liveness); a fill aimed at a coord the
    neighbour still hears alive is REJECTED. So a healer that turns attacker
    **cannot evict a living, rightful occupant**: the occupant's OTHER
    neighbours still hear it, keep it (tenure, E2), and refuse the
    replacement. An attacker who enters as a leaf is the rightful healer of
    the seat above it, and one at a head is the rightful healer of its parent
    — but in neither case can that role be used to unseat a live owner.
    (A rogue healer's remaining power is only to *decline* to heal a seat that
    really did die, or to mis-fill a hole that really is empty — a bounded,
    local liveness nuisance, never an eviction.)

## T — the mover's lease (atomic seat switching)

Every heal above ends in a MOVE — a scooch, a leaf promotion, a vertical
self-promote, a drained seat re-entering. The law used to treat a move as
vacate-then-claim, so anything reading occupancy mid-move saw a phantom hole
(the headless-row gap was one of this class). A move is now ONE atomic act
with a bounded, self-resolving transit window:

- **T1. Claim-before-vacate (dual-hold transit).** A mover TAKES its new seat
  first — the claim is ordinary seating through the normal fill discipline
  (C3 designation authorized it; the CLAIM/HELLO announcements are S4-signed;
  S5's empty-only acceptance still guards the destination — moving is seating
  yourself) — while the OLD seat is still fully held: no goodbye has been
  said, so to every neighbour the old cell is simply OCCUPIED. No admitter or
  healer touches it (it is not a hole), tenure/E2 protect it, and its phone
  still answers. The old seat is vacated ONLY when the claim CONFIRMS: a
  new-neighbourhood frame arrives (a PONG to the mover's phone, a
  PHONE/HELLO/CLAIM over a new link — acceptance by the destination's
  neighbours), or the claim window closes with NO contradiction (a wiped
  region has nobody left to answer; refusing to move would leave it
  unhealable). A CONTRADICTION at the new cell — an E2 yield, a lost
  impostor challenge — ROLLS THE MOVER BACK to the seat it never vacated
  and nobody ever saw empty. **A mover is never homeless**, and a lost race
  is a rollback, not an eviction.
- **T2. The transit hold is legal; an expired one is not.** During the window
  the node holds BOTH coords — the new one as its seat, the old one as a
  still-answering hold. This is NOT a dup (a dup is two NODES at one coord —
  still forbidden, still E2's case); it is one node bridging two cells for a
  bounded window. Every transit datum self-expires: the claim window
  (CONFIRM_TTL), the tombstone lease (LEASE_TTL), the re-seat search. The
  sim's invariant checks encode exactly this: live transit holds are legal,
  a hold past its window is a defect (`transitStale`).
- **T3. The forwarding tombstone.** The confirmed vacate is an instant
  goodbye (D2) whose LEAVE carries WHERE the mover went; and for a short
  lease the mover remains the old cell's FORWARDING TOMBSTONE — a redirect,
  never occupancy: a PHONE to the vacated cell is answered MOVED, so an
  in-flight caller (say a child whose up-link points at the vacated cell —
  the exact headless-row wound) confirms the vacancy first-hand IMMEDIATELY
  and its own healer designation fires, instead of waiting out a silent
  decay window; a routed frame addressed to the old coord lands at the
  tombstone-holder and is served from its new seat. The lease is never
  counted as occupancy, never contested, never renewed.
- **T4. Mover death degrades to ordinary death.** Death before confirm is an
  ordinary death at the OLD seat (the destination saw an announcement that
  now goes silent — the usual D machinery clears it); death after confirm is
  an ordinary death at the NEW seat (the old cell was already D2-vacated).
  No third state survives the mover.
- **T5 — REJECTED: the drain still vacates first (E1 stands unamended).** A
  keep-old drain re-seat (stay seated while FINDing, vacate on PLACE) was
  built, caught by the full churn matrix, and REVERTED. The tension is
  fundamental, not an implementation bug: **E1's vacate IS the mechanism that
  dissolves a doomed fragment.** Kept alive, a fragment's mutually-live stale
  seats keep phoning, answering, serving and HEALING each other — and promote
  one another into the home cells of their stale world, minting a divergent
  phantom home: a sealed bubble whose members are each other's only
  first-hand witnesses, which E2 can never cull (no witness is linked to both
  claimants) and which the Section-1 drain exemption then protects forever.
  (Observed as persistent Section-1 duplicate pairs, up to 68 per run, at
  kills 0.2-0.6; partial recusals — a seeking seat refusing to admit —
  reduced but did not close it, and slowed mass heals ~20x.) So the atomic
  transit (T1-T4) applies to moves WITHIN a live neighbourhood; a drain is
  the opposite case — its neighbourhood is confirmed dead, and dissolving it
  is the point. A draining seat's brief homelessness is the price of the
  one-home guarantee.

*(Design note: a confirm-by-remote-healer round trip — PRECLAIM/GRANT to the
FINDLEAF's origin — was also built and rejected: mid-heal, the mesh routes
such a round trip must ride are exactly the broken ones, and stalled claims
slowed a 40% churn heal ~20x. Dual-hold needs no new long-range delivery:
confirmation rides frames the seating already produces.)*

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
- **W7. The home is kept ONE connected component (ring integrity) — Section 1
  is the 5×5 ROOK'S GRAPH.** This is the load-bearing invariant: E1+W5 already
  guarantee that everything *below* the home re-seats into the one home, so the
  ONLY way a divergent home can arise is the home itself splitting. Section 1 —
  and Section 1 ONLY, because it is a fixed C²-seat core that never grows with
  the meeting — is therefore meshed far more richly than the deep tree:
  - **Every home seat meshes its whole ROW and its whole COLUMN.** On top of
    its C-1 row-mates, each seat links all C-1 **column-mates** (the seats in
    its column, across the other rows). Uniform **degree 9** per home seat
    (C-1 row + C-1 column + 1 down = 4 + 4 + 1). This is the 5×5 rook's graph:
    **8-edge-connected** (you must cut 8 links to detach any seat), and every
    pair of rows now shares **C independent links** instead of 1. Only a
    genuine transport-level network partition — never any pattern of node loss
    — can split it.
  - **Heads stop being special.** They gain column-mates like everyone else, so
    the old single-attach head weakness is gone by construction. This
    **subsumes and retires the dynamic head cross-link (F1)** — no conditional
    logic needed.
  - **Section 1 ONLY.** Deep sections keep the strict `C+1` degree bound and
    the sparse transpose cross-link; the rook meshing is gated on `pc==0`. The
    extra links are a *fixed* cost (25 seats, ~9 links each) that never grows,
    and most are cheap control/roster redundancy, not media fan-out.
  - **Keep the home DENSE (compaction).** Row-major seating (H7) + compaction
    keeps rows and columns full, where the rook connectivity is strongest.
    (Rows and columns are symmetric in the rook's graph, so row-major fill is
    exactly as dense as the old column-major — and it additionally puts early
    joiners in ONE row, which the row-scoped media near field requires.)
  - **Cross-links heal fast, with a standby path**, so a transient break
    doesn't linger and compound into a cut.
  **STATUS: specified, NOT yet implemented** — `crossLink` still returns the
  sparse transpose (and none for heads) in both `sim/topo.h` and
  `site/js/gifos-net.js`.

## E — when ordinary healing isn't enough

- **E1. The drain.** A seat whose anchor upward is CONFIRMED dead (a definite
  departure, not mere silence — severance alone never triggers a drain, D4)
  and stays unhealed does NOT stampede the relay. It fetches the home roster over the
  mesh sideways (cross-links walk around the dead chain), then acts as the
  greeter for its own subtree: DRAIN fans down, every member re-seats as a
  newcomer, and the initiator re-seats last. Only if NO mesh route to
  Section 1 exists at all (>220 ticks) does it fall back to re-entering
  through the relay. **Section-1 seats never drain or requeue — you ARE the
  home.** This exemption is exactly why divergence reduces to *ring integrity*:
  E1+W5 pull every fragment *below* the home back into the one home, so the
  only way a divergent home can form is the home itself splitting (which W7 +
  H1-S1 conservatism prevent short of a true network partition). (When the home
  *is* genuinely torn — a real partition — the E3 audit detects it but there is
  no safe P2P reunion, and no home seat is made to drain; see E3.)
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
  being TORN, each half healing itself whole under the same key.)* **Scope
  note:** with W7 (ring integrity) and H1-S1 conservatism, a tear no longer
  arises from ordinary churn — it takes a genuine transport-level network
  partition. So the audit is a rare-event detector, not a routine one, and
  what it detects is by construction the ONE case P2P cannot fix (the halves
  share no link).
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
  hash. Entries expire on TTL; an empty list forgets the key. Routing stays
  TARGETED and honest: a `{t:'peer'}` frame addressed to a peer with no socket
  is answered to the sender with `{t:'nosock'}` (no silent drop, nothing
  stored, nothing new revealed — the roster already says who holds a socket);
  the sender then sponsor-forwards through the mesh instead
  (docs/meet-security.md §FWD — the greeter pool doubles as the DOOR a
  channel-less newcomer's signaling enters the mesh through).
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
  descend its tree, dense-before-deep, to a definitive vacancy — with the home
  itself filled row-major first (H7): while Section 1 has an admissible cell,
  the FIND converges on that cell's designated admitter; only a full home
  spills newcomers into the deep tree.
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
- **S5. No eviction by a rogue healer (C3 empty-only rule).** Being a seat's
  designated healer is not a licence to unseat its live owner: a fill is
  accepted only by a neighbour that has itself lost the prior occupant
  first-hand. A leaf is its parent's rightful healer, a head is *its* parent's
  — yet neither can evict a living seat, because that seat's other neighbours
  still hear it and refuse the replacement. Healing fills holes; it never
  makes them.
- **S4. No climb (one stable identity per PERSON, established at join).** S1
  is not enough by itself: an attacker doesn't stay put, it tries to climb
  toward fanout, one level at a time. And climbing is exactly what the mesh
  pre-wires it for — W6 hands every seat the live wiring of the layer *above*
  it (cousins) so it can promote up, and it already holds links to those
  cousins. So an attacker CAN reach and address the neighbours of the seat
  right above it. If healer-identity were forgeable there, it would
  impersonate that seat's designated healer, capture it, and repeat — rising
  to poison ever more people. So "only the healer may fill" is airtight only
  if a witness can't be FOOLED about *who* the healer is, at **every level.**
  The hardening is small, and the key insight is that we only ever need to
  make **first contact** unforgeable — everything after is free:
  - **Identity is one keypair per PARTICIPANT, minted once at join — NOT per
    seat.** The person's public key IS their name, and it does not change when
    they move. (Minting a fresh key at every seat, as an earlier draft said,
    would re-pin constantly under churn — the fragility this avoids.)
    Promotion moves your *coord*, never your *identity*.
  - **The links already carry identity; the key only makes it portable.** Every
    mesh link is DTLS-secured, so once a neighbour has a link to you, "who is
    on this link" is unforgeable for free. The keypair adds the one thing DTLS
    doesn't: a *stable name across links and moves*. A fill is authored by the
    healer, signed with its stable key; any neighbour that has ever seen that
    key — or holds a live link to the healer's coord — recognises it. No
    per-hop signature chain to maintain: just a stable name that travels with
    the person. A seat's peer id can simply BE (the hash of) this key, which
    also retires the old client-set-id hole (E2's tie-break can no longer be
    hand-picked to impersonate someone).
  - **STATUS: specified here, not yet implemented.** Until it lands,
    healer-identity rests only on the healer's structural head start (it
    detects a death in seconds via the heartbeat D1; an attacker learns of a
    turnover only at gossip/relay speed) — a real edge, not a proof — and the
    exposure is worst at Section 1, where wiring is fully public (W5/W6) and
    seats are relay-reachable.

**Still open (named honestly):** the whole scheme has ONE unforgeable-first-
contact moment it rests on — join (and a total-reconnect where nobody
remembers your key). That moment is authenticated only by the shared room key
`K`, which proves "*a* member," not "*which* member." So two things stay
unsolved there: the **Sybil** attack — one insider being many legitimate-
looking participants at once (we deliberately have no accounts, so `K` can't
tell one member from fifty) — and the **first-pin race**, an impostor claiming
a brand-new (or a departed participant's) identity at that first contact
before anyone can vouch for the real one. S4's per-person key makes identity
unforgeable *everywhere except* that single moment; C3/S1/S2 keep an attacker
from reaching or climbing into seats it has no legitimate claim to. But the
first-contact gap is real, it is exactly one place, and it is the same gap
that leaves the torn-home reunion (E3) unsolved.

---

## The two hard cases — one closed, one open

1. **Two nodes claim the same seat (CLOSED).** Only the one designated healer
   may fill a hole; any other claim is rejected (C3), so no attacker can
   *contest* a seat. A duplicate only arises between two *legitimate* seats
   (severance-revival), and E2 settles that deterministically — first-hand
   liveness only, tenure first, lower id wins. (The one residual: proving
   *who* the healer is needs S4's per-person identity key, established at join
   and stable as you move — worst-exposed at the public Section-1 ring —
   specified, not yet built.)
2. **Churn shatters the meeting into disconnected pieces (SOURCE-PREVENTED,
   with one accepted edge).** Everything *below* the home re-seats into the
   one home (E1 + W5), so divergence can only come from the HOME splitting —
   and the home is wired to be one connected component (W7: heads carry
   cross-links, redundant cross-paths, fast healing) and heals its cells only
   on strong confirmation (H1-S1 conservatism). So no ordinary loss, however
   severe, produces a divergent home. The one thing left is a **genuine
   transport-level network partition** — physics, unpreventable by any P2P
   topology — and that is honestly *two real rooms*: the E3 audit detects it,
   but with no shared link there is no P2P reunion (and no relay tie-break, by
   choice), so it stays two rooms until the network heals or people rejoin by
   URL. (Separately, a genuinely DIFFERENT meeting — a different genesis key —
   is put to a human, R5.)

There is no root to fight over and no arbiter to trust — every verdict above
is computed independently by clients. But the open sub-case is a real one:
peer ids are client-set, not unforgeable, so any reunion rule that lets a
detected group *move* another is a lever a Sybil attacker multiplies. Until
we have a cheap way to bound identity, a torn home is safely NOTICED but not
safely REJOINED. See the mesh security frame: an attacker's harm ≈ its
fanout; bound it, never hand it a mechanism that multiplies one seat into
many.
