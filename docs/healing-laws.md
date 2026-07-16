# The GifOS mesh healing laws (canonical)

The no-root introducer mesh: Section 1 (`path=''`) is the home — C² uniform seats
meshed by their own rows + cross-links, nothing above them. Coordinate `(path, r, i)`,
column count `C`. **Every heal change must name which law it implements.**

This is the canonical set. It supersedes the old copy that lived in
`test/mesh-scale.js` (the Node reference sim, now retired — see git history).
The C++ reference sim is `sim/mesh.cpp` + `sim/mesh_seat.inc` + `sim/topo.h`.

## P — the one principle
Every row keeps itself whole by **promoting a leaf from its own subtree**.
Child-heals-parent is the same motion one level up. A leaf has no dependents, so
promoting it orphans no one. **Only leaves promote — the sole exception is scooch (C2).**

## Detection (D)
- **D1.** Phone-home heartbeat: row-mates (i>0) phone their HEAD `(p,r,0)`; a head phones ITS OWNER — except Section-1 heads, who phone NO ONE (Section 1 IS the home). Head hears its row; row-mates hear the head.
- **D2.** LEAVE: an announced departure deletes the occ entry immediately.
- **D3.** rowSweep: the head sweeps for silently-dead row cells (>50 ticks quiet).
- **D4.** lastAck climbing: no PONG ⇒ my phone-target is dead (heal >40, drain >80).

## Healing (H)
- **H1.** The HEAD heals a non-head hole in its row — only if that cell HAD children (C1) — EXCEPT in Section 1 (**H1-S1**), where the head proactively fills ANY empty cell of its row, childless or not.
- **H2.** Row-mates heal a dead HEAD: the lowest-column survivor promotes a new head. Deterministic ⇒ one healer, no race. Applies to Section-1 rows like any other.
- **H7.** COLUMN BACKFILL: a Section-1 seat handed a newcomer first checks the row ABOVE it (wrapping row 0 to the bottom); if that row is ENTIRELY empty, it seats the newcomer directly above itself (same column). Arrival traffic resurrects fully-dead Section-1 rows.
- **H8.** WHOLE-SECTION DEATH (relay-free reconstruction). A section head whose owner cell `O` is DEAD, **and** `O`'s whole row is empty (so no H2 row-mate can heal it) **and** `O`'s cell-below `(p,(r+1)%C,i)` is empty (so no H7 backfill-from-below) — heals `O` by **FINDLEAF into its OWN subtree**: a LEAF promotes into `O`, the head **stays put** (P — only leaves promote). It passes its **cousins (W6)** as the promoted leaf's neighbour list, so the leaf lands pre-wired with no relay. The head is `O`'s **unique down-child**, so C3 holds. This is what rebuilds a totally-wiped Section 1: each surviving section head refills its own Section-1 cell from below, and — because the heads stay alive — the heads themselves are the connective tissue that carries the new Section-1 roster to the promoted leaves (no separate relay bridge needed).
  - *(H6, H3/H4/H5 are RETIRED — H6 folded into E3; H3/H4/H5 healed a special root that no longer exists.)*

## Anti-cascade (C)
- **C1.** Childless holes are NEVER filled (no dependents ⇒ no up-path) — except Section 1 (H1-S1). Heads are always refilled.
- **C2.** Scooch is a last resort: a childless-frontier row's head only (H2). The **only** non-leaf promotion.
- **C3.** Exactly ONE healer per hole (the head / the lowest-column survivor / the H7 backfiller / the H8 down-child).

## Wiring — real-time, never stale gossip (W)
- **W1.** The healer builds the promoted seat's neighbour list from its OWN live occ at promotion time (including ITSELF when it neighbours the hole).
- **W2.** EVERY PONG carries "who my owner is" ⇒ every seat learns its GRANDPARENT live.
- **W3.** A head's PONG to a row-mate carries the CURRENT row roster.
- **W4.** The promoted seat HELLOs its owned links and phones up; the orphaned subtree below re-attaches by phoning the refilled cell.
- **W5.** Section 1 maintains the FULL C²-roster at every one of its seats: freshness-tagged entries sync across the section's row meshes + cross-links every phone beat (**S1SYNC**). This is what greeters serve to newcomers and what draining subtrees re-seat against.
- **W6.** COUSIN / HEIR FOREKNOWLEDGE (feeds H8, relay-free). S1SYNC carries each Section-1 cell's `childOf` (its heir — the section head one level down), so every Section-1 seat knows every cell's heir. On a PONG, an owner teaches its **down-child** the heirs sitting at that child's *future* owned-link coords (the owner's row-mates + cross-link), and a head shares those cousins with its **row-mates** too (so whoever scooches/heals into head inherits them). A seat therefore holds its parent-layer neighbourhood in advance — so an H8 promotion lands into an already-wired mesh with no relay and no discovery latency. (~C² addresses per seat, bounded — always the *immediate* aunt/uncle layer, recursive down the tree.)

## Fallback (E)
- **E1.** THE DRAIN: a severed seat (owner chain dead >80 ticks, unhealed) does NOT stampede the relay. It fetches the Section-1 roster over the mesh (WHOHOME via cross-links — sideways past the dead chain), then acts as greeter for its own subtree: DRAIN fans down, every member re-seats as a newcomer, the initiator re-seats last. Only if NO route to Section 1 exists (>220 ticks) does it fall back to relay re-entry. **Section-1 seats never drain or requeue — you ARE the home.** *(With W6/H8, drain is now a rarer fallback: a dead parent is refilled in place by its heir.)*
- **E2.** RACE LOSER YIELDS: two ids on one coord ⇒ the HIGHER id yields — but only between LIVE claimants, judged with TENURE (only claims heard after my seating outrank me), broken deterministically LOWER-ID-WINS, with a YIELD back-channel for losing heads nobody targets. Cross-fork duplicates no longer arise (R2/R3's genesis key prevents parallel homes at admission), so E2 only settles the LOCAL races of ordinary healing.
- **E3.** GREETER REGISTRATION (was self-audit + stitch): every Section-1 seat knocks the front door WHEN IT TAKES ITS SEAT and re-knocks each ~TTL, presenting the meeting's GENESIS KEY (R3) — which admits it to the greeter list. The Section-1 seats ARE the greeter pool (~C², +rotation churn). No roster comparison, no stitch: genesis/forks are handled at admission by the key. When every Section-1 seat stops re-knocking for one TTL, the list empties and the room reopens for a fresh genesis.

## Home & entry (R)
- **R1.** NO STORED HOME anywhere. WHOHOME walks the live mesh to any Section-1 seat and gets the W5 roster back.
- **R2.** The relay is a ZERO-KNOWLEDGE GREETER REGISTRY keyed by the hashed URL. It stores ONLY `H(genesis key)` and a TTL'd list of SEALED greeter entries — each `Seal(K, address)` under the meeting-URL key `K` the relay never holds. On knock it returns the sealed list and ADMITS the knocker iff the list is empty (mint genesis) or the presented key hashes to the stored `H(genesis key)`. It holds no home, no coords, no seat-state, no plaintext address/identity, and arbitrates nothing — arrival order alone decides genesis. A URL-holder decrypts the list to reach greeters; the operator sees only ciphertext + a hash. Entries expire on TTL; an empty list forgets the key.
- **R3.** Genesis via the KEY: a NEWCOMER knocks with a throwaway PERSONAL key. The first to meet an empty list has its key recorded as the meeting's genesis key and founds `('',0,0)`. The relay adds it at KNOCK time (not seat time) and is single-threaded, so every later knocker gets a NON-EMPTY list and never founds. A newcomer learns the real genesis key during the newcomer dance (the greeter's HOME reply carries it) and, only after taking a Section-1 seat, re-knocks with the matching key to join the pool. One key per URL-instance ⇒ no storm, no parallel founders; the key is the unforgeable, member-held INSTANCE IDENTITY (a fork = a different key).
- **R4.** Seating is a ping: pick a RANDOM Section-1 seat off the roster, descend its tree dense-before-deep to a definitive vacancy (H7 first).
- **R5.** A GENUINE fork (disjoint FILLED rosters — real partition or adversarial decoy whose sealed dance fails) is never auto-merged: the client surfaces the unforgeable faces on the Stage / row 0 of each tree and the HUMAN chooses. Counts are not trusted (inflatable); a face cannot be gamed. *(E4 — a genesis-storm resolver — is DISSOLVED: R2/R3's key prevents the storm at admission.)*
- **R6. STRANDED-NEWCOMER RESOLUTION (pure client logic, zero relay presence).** The greeter list is sealed under `K = derive(url, pw)` — BOTH the URL secret and the password (if set) — so for a LOCKED room the guest list itself is invisible without the password (`sid` is NEVER password-derived: `url+pw` would be a *different room*). A newcomer that gets a greeter list but seats reasons from three observables — *decryptable? alive? reachable?*:
  - **Can't DECRYPT the entries** ⇒ wrong password ⇒ prompt for it.
  - **Decrypts (right password) but can't REACH any greeter** after re-knocking/trying them all ⇒ wait **one greeter-TTL** ("Trying to connect… ⟨countdown⟩"), then re-check the relay:
    - **list EMPTY** ⇒ the meeting ended; **mint and take over** the room (R3 — the genesis key serialises concurrent take-overs, so no storm).
    - **list still NON-EMPTY** ⇒ it's genuinely live and I'm the one cut off — *voted off* or on an *unreachable subnet*, which are **indistinguishable and correctly so** (a ban you could be *told* about requires reaching you, the very thing that's failing) ⇒ surface *"This meeting is taking place but your network settings aren't allowing you to connect."*
  This collapses **wrong-password, partition, ban, and "I'm just late" into ONE observable state machine**, and the only ACTION it ever takes is the one the system already supports (found on an empty list). The relay does nothing new — just its TTL'd greeter list — so server presence stays minimal.

---

**The old open problem (partition merge / root minting) is dissolved twice over:**
with no root there is nothing to mint, AND the relay's genesis key admits only ONE
home per URL-instance, so parallel founders can't form. Orphaned subtrees drain (E1)
or are refilled in place by their heir (H8/W6) into the surviving Section 1; a total
Section-1 wipe rebuilds either by H8 (heirs refill from below, keeping the key) or,
if the whole room is gone, by the greeter list expiring → a single fresh genesis (R3).
Only a genuine, human-scale fork (R5) is ever surfaced to a person.
