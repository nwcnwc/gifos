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
4. **Events accelerate; the heartbeat guarantees.** Paid for on main
   (`6b927c5`): a derivation that runs only on events strands forever when one
   race misses its window — the fold-claim did exactly that until it joined the
   periodic reconcile "like every other role derivation." Every derivation this
   refactor introduces — greeter election and pool rotation, probe designation,
   the seating view, the shun tally, introduction-in-flight state — must
   re-derive idempotently on the heartbeat. An event may trigger it early;
   only the heartbeat makes it inevitable.

This is **not** a scale rescue. The prior design already reached a million via
bounded relay sessions on free hibernating sockets. This refactor is driven by
principles 1–2; the collapse of the relay to a **log-sized (`~X`) front door** —
one that only ever *introduces* — is a bonus of removing it from the loop, not
the motivation. Say so honestly to anyone who asks.

**Scope:** this covers **meeting (mesh) sessions only**. The relay's app
multiplayer sessions (`host`/`client` roles, the epoch guard, owned-link host
gating) are untouched by this refactor — the host-authoritative app model is a
different trust shape and stays on the relay for now.

---

## 1. The core mechanism: introduce, sponsor, then hold the door

There is **one relay session per room** — not per section. The old
`MAX_SOCKETS_PER_SESSION = C²+C` cap is gone: the relay holds only the room's
small **greeter pool** (§2), never its seated members. Joining is one move,
identical at every scale:

1. A newcomer contacts the room's relay **once** and is fanned to the open
   greeters.
2. A greeter **sponsors** it: it runs a seat-finding **ping** across the live
   mesh (§1½) to place the newcomer in an empty seat, then brokers the
   newcomer's WebRTC signaling to that seat's neighbours over existing
   DataChannels (§3).
3. The newcomer is now woven into the mesh along its seven links (§1½). It
   **becomes a greeter** — keeps its relay socket open — and holds the door for
   the next arrival.
4. It **closes its socket** only once a newer newcomer has confirmed-joined
   behind it *and* the pool would still meet `X` without it (§2). Until then it
   *is* the front door.

That is the entire lifecycle, and it is the same at every level of the tree
because the tree is not built from different kinds of thing — it is one kind of
thing, the **seat**, repeated (§1½). There is no delegate, no deacon, no space
that behaves unlike a section.

**Small-room honesty:** the sacred base case does change. A 2-person room today
has both peers on the relay; here the first is a lone greeter holding the door
and the second is introduced P2P. "One recursive pattern, no mode switch" holds
in spirit, but `rows.md`'s "byte-identical to today's mesh for one section" does
not — the mesh itself is different. That law gets rewritten, not preserved.

---

## 1½. The topology: uniform seats, one tree, no deacons

*This section supersedes the deacon/composite model of `docs/rows.md` and every
"deacon" reference elsewhere in this document. **There are no deacons.** Every
seat is identical and carries a bounded, uniform share of the whole structure —
which is exactly why it converges where a deacon-centred star did not (the
2026-07-13 live tests: one overloaded deacon starved and its whole fold-mesh
stranded; here there is no such node to starve).*

**Coordinates.** A seat's address is `(path, r, i)`:
- `path` — the section's position in a fixed **C-ary tree**, a base-C string:
  `""` is the root section, `"2"` its third child, `"20"` that child's first.
  Depth `= len(path)`.
- `r` — the row within the section, `0 … C-1`.
- `i` — the seat within the row, `0 … C-1`.

A section is `C²` seats (C rows of C). Every seat computes the entire wiring
below **from its own coordinate alone** — no negotiation, no election, no
roster.

**C = 5.** Small enough that a row-strip (C feeds stacked vertically) is cheap
to composite and a section grid `(C-1)×C` fits a screen; large enough that the
tree stays shallow — `log₅`, so a million seats is ~7 levels deep. Every
per-seat link budget and composite size is a function of this one constant.

**The links every seat owns** (uniform — this is the whole point):

1. **Row mesh** — `C-1` links to the rest of my row `(path, r, ·)`. Full P2P; I
   see my row-mates as individual live feeds.
2. **One cross-row link** into my section — deterministically the transpose,
   `(path, r, i) ↔ (path, i, r)`. It's symmetric, and each row `r` owns one seat
   pointing at every other row (`i ≠ r`), so a row's C seats collectively bridge
   **all C-1 other rows** — widen the rule with a second offset if a row-pair
   needs more than one bridge. Over it I trade **row-strips**: I send my row's C
   feeds as one vertical strip and the row mesh fans all C-1 incoming strips to
   every row-mate, so each of us renders the section as a **(C-1)×C grid**.
3. **One up-link** to the parent section (a deterministic seat, e.g. same
   `(r,i)` one level up). Carries my section's **assembly piece** toward the
   root.
4. **One down-link** into one child section (deterministic — row `r` descends
   into child `r`, tiled so each child receives C down-links: **C-fold
   redundancy on every tree edge**). Carries the **Stage + Stadium + count**
   back down.

Owned links: `C-1 + 1 + 1 + 1 = C+2 = 7`. Total *degree*, counting links others
own onto me, stays bounded at ~`2C` — never `O(section)`, as a deacon was. **No
seat is load-bearing for anyone else's whole experience.** A dead seat costs its
row-mates one feed and its neighbours one redundant path; the blast radius is a
smudge, not a hole. *(The exact seat-to-seat function for links 3–4 is a
deterministic tiling to finalize in code; the load-bearing invariants are:
pure-function-of-coordinate, bounded degree, C-fold-redundant tree edges.)*

**The four fidelity tiers — distance rendered as latency and compression:**

- **Your row** — individual live feeds over the row mesh. Sharpest, lowest
  latency: the people beside you.
- **Your section** — the C-1 other rows as composited strips (cross-row bridges
  + row mesh). One hop out, lightly compressed.
- **The Stage** — row 0 of the root section, broadcast *down* the tree on a
  **tight latency budget**: it's what everyone is actually watching, so it gets
  priority to the leaves (~depth hops).
- **The Stadium** — the whole crowd as one **rolled-up mosaic**. Each section
  composites itself into a fixed-size tile; a parent composites its own tile
  with its children's (arriving up their up-links) into a same-resolution,
  wider-coverage tile, up to the root — where the **full-tree mosaic exists in
  bounded size regardless of room scale**. It broadcasts *down* alongside the
  Stage on a **loose** budget, lagging it by roughly the extra up-then-down trip
  (~2×depth). Exactly right: the ambient crowd may be a beat stale; the stage
  may not.

Up-links assemble the Stadium; down-links broadcast Stage + Stadium. **Audio,
video, gossip, and seat-finding all ride these same seven links** — one
structure, four tiers. That is the stadium, expressed as a protocol.

**The count comes free.** Rolling the Stadium mosaic up means the root tallies
every occupied seat as it composites the pieces; **`total` rides back *down*
with the Stadium**, and every seat reads the room size — and derives
`X = max(3, 2·log₁₀ total)` for the greeter pool — from that one broadcast. No
roster is summed, no count is polled.

**Seating anchors to Section 1 — the room's identity is its root, not a
roster.** Handed X greeters, a newcomer does *not* ask "where's an empty seat."
It asks each greeter **"what is your Section 1?"** — the identities of the root
section's seats, which any seat reads in a few hops up its up-link. **The room
*is* its Section 1**: the real people at the top, under sealed identities no
adversary can forge.

- **Greeters agree** (identical, or mostly-overlapping mid-churn, Section 1) →
  they are one tree. The newcomer asks any Section-1 seat for its **closest empty
  seat**; that seat runs a **downward search** — a root-anchored breadth-first
  descent that fills the tree dense-from-the-top — and returns a *definitive*
  vacancy, which the newcomer claims (first-writer-wins; a loser re-asks). The
  frontier grows the tree one level only when the downward search bottoms out
  full. No vacancy list is maintained anywhere.
- **Greeters disagree** (different Section 1s) → a genuine fork, and no algorithm
  can say which is the *real* room. So **ask the human**: show a snapshot of who
  is on the **Stage (row 0)** — or **Row 1** if the stage is empty — in each
  tree, and let them pick. Sealed identities make the faces real; the person
  recognizes their own meeting. Honest and unspoofable.

This *is* the split-resolver (§6): a malicious "join my empty tree" greeter is
caught the instant its Section 1 fails to match the honest greeters', and a true
fork is settled by the humans, who converge on the tree they recognize — the
fake withers because nobody joins it.

**The only state is a seat's own coordinate and its live links.** Everything
else — who is present, where the vacancies are, the count, the crowd — is
discovered on the wire, on demand, along the same seven paths. No roster, no
deacon, no per-section relay session.

**Two primitives carry everything else, too.** A C-ary tree is a reduce/broadcast
machine, and once you have it the rest of the room's coordination is free, in
exactly two shapes over the one tree:

- **Reduce up** — each section folds its children's partial into its own and
  passes *one bounded summary* to its parent. The count (sum occupancy), a vote
  tally (sum a device's shun-count), any room-wide aggregate: computed at the
  root in `O(depth)`, no seat holding more than its own section's share.
- **Broadcast down** — the root's result (or the Stage, or an admin's signed
  order) fans down to every seat, `O(depth)`, C-fold redundant.

So **stepping onto the Stage** is a broadcast (gossip your step-up stamp; the
deterministic row-0 resolves; broadcast down who holds the stage). **Vote-off**
(§7) is a reduce (tally each device's shun-count up the tree, cross threshold,
broadcast the verdict down — no relay tally, ever). Presence, moderation, the
count, the crowd mosaic — every one is a reduce or a broadcast over the same
tree. *That* is why the design needs no special machinery for any of them: the
tree already is the machinery.

---

## 2. The greeter pool — self-forming, never elected

A room's front door is a small pool of open relay sockets — the **greeters**.
Never a single one (a single point of failure for *joining*; the mesh itself
needs no greeter at all), and — the correction to the earlier draft — never
*elected*. The pool forms out of the arrival stream itself:

- **Every newcomer becomes a greeter the instant it is woven in, and holds its
  socket.** It just proved it can reach the relay — the one qualification a
  door-holder needs — so it holds the door for the next arrival. No ranking, no
  capability weighting, no negotiation.
- **It closes its socket only once a *newer* newcomer has confirmed-joined
  behind it** — actually taken a pool slot of its own, never on a mere knock, so
  a bouncing knocker can't shrink the pool. On that trigger it re-decides,
  purely locally: would the pool fall below `X = max(3, 2·log₁₀(total))` if I
  left? If yes, stay; otherwise close and become a plain member.

So the pool is the **most-recent arrivals, sized `X`, self-refreshing on every
join with zero coordination**. `X` is 3 for a handful, ~8 at ten thousand,
**~12 at a million** — the front door's standing load grows with the *log* of
the room, which is the entire reason a million-person room survives on a
hibernating relay. **The relay never holds more than ~`X` sockets per room.**

**The relay has no counts.** `K` (the live greeter count) and `total` are
P2P-gossiped facts — greeter is a *status* a member advertises in the same
heartbeat that already carries presence — so every member derives `K` and `X`
from the roster it already holds. The relay's sole act is to fan a newcomer's
knock to whatever sockets are open (blind broadcast; it *has* the sockets in
order to route, it does not count or report them). No count, no roster, no seat
number ever crosses it.

**Row 1 keeps the pool honest and topped off — on the heartbeat.** Left to the
arrival stream alone the pool is made entirely of the *freshest* peers, which
are also the least-proven and the easiest for a bad actor to flood (sit on
sockets, sponsor newcomers with lies). So the room's first row — deterministic,
every member already agrees who is in it — **periodically sends one known-good
member to re-enter through the front door**, on its heartbeat. That single act
does three jobs at once:

1. **Tops the pool up** whenever arrivals have thinned it below `X` — the §0.4
   heal applied to the door.
2. **Guarantees at least one honest greeter** at all times, so a newcomer
   cross-checking its sponsors always has a truthful mesh to take. The pool can
   be *diluted* by squatters but never *entirely* poisoned.
3. **Sutures silent splits** (§6b): the same re-entrant, fanned to whatever
   sockets are open, stitches together partitions whose greeters landed on
   different sides — and because one room is one relay session, every fragment's
   greeters are reachable from that one knock.

This collapses three mechanisms the earlier draft treated separately — pool
maintenance, anti-poison, and split-healing — into **one heartbeat action by
row 1**. (Cadence and who row 1 designates: OPEN — see §6b/§11.)

**Introduction is fan-out, not hand-off.** The relay fans every knock to all
open greeters; the newcomer links to whichever answer, cross-checks them, and
takes the mesh that actually stitches it in. Failover is free (a greeter
dropping mid-handshake is simply not one of the ones that wove you in), the
newcomer starts with several P2P links rather than one, and — because greeters
from different fragments all receive the same knock — it is the seam that heals
splits.

**An open socket is not authority.** Anyone with the room URL can hold a socket
and answer with lies ("room's full", a garbage manifest). Contained by
construction: (a) fan-out + cross-check means an honest greeter — guaranteed
present by row 1's injection — is always among the answers; (b) a shunned or
fake "greeter" holds no DataChannels into the real mesh, so its only power is to
lie to a newcomer who is simultaneously hearing the truth; (c) sponsorship trust
comes from the mesh actually forming around you, never from who answered the
door.

**Cold start needs no authority — it self-heals.** With the relay reporting no
counts, a first arrival that can reach no greeter simply concludes *"I'm alone,
I am the only greeter,"* and waits. This is not a decision that has to be
*correct*: if it was wrong — the greeters had merely all died a half-second
ago, or a twin genesis happened elsewhere — the mesh **merges** the moment any
later arrival bridges the islands. The bridge can come from anywhere: the
newcomer's own greeter list, a mesh it was already part of, or a row-1
re-entrant (§6b) fanned to both islands' sockets on one relay session. Parallel
genesis is therefore not a fault to prevent but a state to reconcile — the same
self-healing that carries the rest of the design. The one irreducible loss is a
*genesis-time* bad actor who poisons arrival #2 before any healing peer shows
up; the accepted escape is that the room eventually notices and retreats to a
fresh URL the attacker doesn't hold. No relay count, no empty-detection
protocol, is needed.

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
   still-live link** (any of the seven — a row-mate, the cross-row bridge, the
   up/down tree link); only when a seat has *no* live link at all does it fall to
   §6a re-entry — and §6a's trigger is therefore "the connection-layer heal
   **gave up**," never "a link looks down," or re-entry races the sweeper's
   ICE-restart and double-heals. The `makingOffer`/perfect-negotiation guards
   from those commits are transport-agnostic and carry over unchanged.

   Two negotiation lessons from the fold-strand forensics (`6b927c5`) bind
   every recovery path this design adds:

   - **"Settled" means every m-line finished its round, not just
     `signalingState === 'stable'`.** A mid with `currentDirection: null` is an
     offer whose *answer* never applied — glare killed the round — and it is
     invisible to any check that only reads the signaling state. The old
     "settled" gate no-opped exactly there and a fold stayed dark forever.
     Every gate this refactor writes (sponsor-forwarded heals, greeter
     admission re-kicks, shun teardown/re-admit) uses the strict form:
     settled = stable AND no in-flight offer AND no mid with a null or
     send-stripped `currentDirection` it still owes.
   - **Recovery is owner-driven, or the heal loop *sustains* the wound.**
     Observed twice now: the per-fold transport rebuild that tore down all
     folds on a 9s loop (`e198019`), and the receiver-side empty re-offer that
     landed against the sender's meaningful offer every 2.5s, sustaining the
     very glare storm it was healing (`6b927c5`). The rule: only the side that
     *owns* pending outbound m-lines renegotiates; the other side kicks —
     asks, never offers. The refactor's new healers (sponsors forwarding
     recovery offers, greeters re-stitching a wobbly newcomer, probe
     re-entrants) each have exactly one owner per action, rate-limited, and a
     no-op must stay a no-op — a healer that "does something anyway" is how
     the outage becomes self-sustaining.

After this, the relay's *only* remaining wire role is the initial newcomer↔greeter
introduction. Everything else is DataChannels.

---

## 4. Seating is the ping — there is no walk

Superseded by §1½; kept here only to state what *dies*. Seating is not
arbitrated by the relay's roster (gone) or by a greeter's private occupancy
count — it is a **C-ary vacancy ping** across the mesh, first-vacancy-wins,
fill-dense-before-deep. Consequences worth pinning:

- **No `sectionNum` walk counter, anywhere.** A seat's identity is its absolute
  coordinate `(path, r, i)`, assigned by the ping and fixed for life. The whole
  bug class where a *local* walk counter disagreed with reality and mislabeled a
  composite (`fb562ed`) simply cannot exist: nothing is counted locally, and no
  composite is keyed by a derived row number — the coordinate *is* the key.
- **Holes refill for free.** A departed seat is a vacancy the next ping finds;
  the tree never renumbers, because coordinates are absolute.
- **The Stage is exempt from ordinary seating.** Row 0 of the root section is
  addressed and broadcast specially (§1½, §7 step-up); the ping never hands a
  row-0-root seat out as a normal vacancy.
- **Steady-state fragmentation is gone.** The 33/5/5 fracture we watched under
  the old relay-walk was a symptom of sections-as-relay-sessions; with one tree
  and a ping that always fills the nearest vacancy of *that* tree, it cannot
  arise. The only residual split is genesis-time (two islands founded before
  they could see each other), and that **merges** when a bridge appears (§2 cold
  start, §6) — a reconciliation, not a fault. "Walk back from lonely sections"
  disappears along with the problem it never actually solved.

---

## 5. Gossip is reduce-and-broadcast — not a layer to build

Superseded by §1½. There is no separate gossip subsystem to write and no relay
`{t:'gossip'}` fallback to keep. Every non-media coordination is one of the two
tree motions, over the same seven links that carry the media:

- **Broadcast (down):** presence/status, hand-raises, the Stage, signed admin
  orders, the room count, the Stadium mosaic. Fans down the tree, `O(depth)`,
  C-fold redundant, deduped by message id so it never loops. Mutable status is
  **latest-wins by `(peer, timestamp)`** — forward only if fresher, or a section
  re-floods its own 4-second heartbeats.
- **Reduce (up):** the count, any tally (votes — §7), any room-wide aggregate.
  Each section folds its children's partial into its own and passes one bounded
  summary up; the result forms at the root and rides back down as a broadcast.
- **Anti-entropy on the heartbeat:** each seat periodically reconciles its view
  with each of its seven neighbours, so a broadcast a link dropped is repaired
  on the next beat — §0.4 applied to gossip. Nothing here is event-only; that
  was the root cause of every convergence bug on `main`.

The "biggest build" the earlier draft feared turns out to be mostly *deletion*:
the transport already exists (the seven links) and the merge rules are the two
motions above.

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

### 6b. The active anti-split probe — row 1 keeps the Stage whole

The silent case (a group still internally connected but severed from the rest)
must be *actively* probed. What it protects is the Stage's defining property —
row 0 of the root reaches *everyone* — which is false the instant the room
forks. Row 0 can't be the actor (it is born empty). The actor is the root
section's **row 1**, a deterministic set of seats every member already agrees
on:

- **Row 1 sends one known-good member to re-enter, on its heartbeat** — the
  *same* action that tops off the greeter pool and resists poisoning (§2). One
  mechanism, three effects. The re-entrant is fanned to **all open greeter
  sockets** on the room's single relay session; if those sockets span two
  fragments, the re-entrant is now linked into both and **sutures them** (gossip
  merges, the ping re-seats stragglers, the fork heals). No split → a cheap
  no-op that just refreshes the pool.
- **The re-entrant never leaves its seat.** It keeps its coordinate and all
  seven links throughout; it *only* opens a socket, receives the fan-out, links
  to whatever answers, and closes. Never leave-and-rejoin — a seat vacating and
  re-seating is a needless vacancy-ping plus link churn for its neighbours.
  (Live-measured 2026-07-13 in the old deacon model, a rejoin-style probe took
  tens of seconds to re-converge and demolished the view on every beat; there
  are no deacons now, but the churn reason alone still forbids it.)
- **One relay session per room makes the suture trivial.** Both fragments'
  greeters sit on the *same* relay session (§1), so any re-entry is fanned
  across the whole split — there is no per-section session for a fragment to be
  isolated in. This is strictly simpler than the earlier per-space recursion,
  which the single-session model dissolves outright.
- **Probe only when a silent split is arithmetically possible** — both sides
  would need ≥2 seats (a lone severed seat self-heals via 6a), so gate the probe
  on the room holding ≥4 seats. This zeroes the standing relay-wake cost for the
  dominant small-room case (a quiet connected room costs the relay nothing);
  cadence for big rooms is a tunable (§11).
- **A fork is resolved by Section 1 — and, if genuine, by the human.** With no
  roster a split cannot be *seen*, only *bridged*, so every join already does the
  detecting work: a newcomer asks all its greeters for their **Section 1** (§1½)
  and compares. Matching Section 1s were never truly forked — same tree, seat
  downward. *Different* Section 1s are a real fork, and no algorithm should be
  trusted to pick the "real" room over an adversary's decoy: both claim to be it.
  So the machine refuses to guess and **surfaces it — show the human the faces on
  the Stage (or Row 1) of each tree and let them choose.** Sealed identities make
  those faces unforgeable; people converge on the meeting they recognize and the
  decoy withers unjoined. There is deliberately **no automatic coordinate-merge**
  — an earlier larger-wins idea is dropped, because a count can be inflated by an
  adversary where a human glance at who is actually present cannot be gamed.

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
  One more gap in the same family: a pair that only ever connects via a
  **friend-relay** (hard-NAT island, media forwarded by a mutual friend) has no
  direct ICE exchange at all — no `srflx`, no observed path, nothing to
  confirm. For such a peer the vote runs on the hint alone: it counts toward
  the tally like an IP-only match but can never auto-confirm. Name it so the
  implementation doesn't silently treat "no stats" as "no vote."
- **Lists stay personal and client-held**, gossiped **sealed** over the same P2P
  gossip as everything else (§5). The relay never receives a `votekick`.
- **Tally is a reduce (§1½).** Each device's shun-count sums up the tree; when
  it crosses majority-of-present it broadcasts down as a verdict. Brief
  disagreement during convergence is fine for a civility tool — it is the same
  eventual consistency every reduce carries.
- **Enforcement is local shunning, and the mesh absorbs it.** Tear down any link
  to a shunned device (row, cross-row, up, or down), stop sending it media, hide
  its tile — and because *every* seat composites its own row-strip and rolls its
  section into the Stadium, **exclude a shunned member from every strip and
  mosaic you render**, so it reaches no distant screen either. Dropping the link
  costs you nothing: each of the seven is redundant (C-fold on the tree edges,
  C-1 in the row), so the mesh routes around the shunned seat. There is no deacon
  whose loss could black out your view — that failure mode left with the deacon.
- **This design needs the introducer world to be coherent:** with peers off the
  relay there is no relay to tally or kick, which is the point. It also dissolves
  the earlier "global vs per-room" tension — the relay never sees the vote key,
  so there is nothing to correlate. Whether votes follow a person across rooms is
  now purely a client choice about which key to persist (a device-derived secret
  the *client* keeps, never shown to the relay), not a relay capability.

- **A shunned seat is frozen out of every role — but roles are positional now.**
  With uniform seats there is nothing to *elect* and therefore nothing to
  hijack. A shunned device is simply never re-seated by the vacancy ping (§1½),
  never sponsored by an honest greeter (§2), and never accepted as a row-1
  re-entrant (§6b). The old worry — "don't let your shunned deacon black out
  your view" — is moot: no seat carries anyone else's whole experience.
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
   socket when a new tab opens (functionality, not moderation). With members off
   the relay, decide how to preserve it (sessionStorage peer-id handles reload;
   the new-tab case may be acceptable to drop, or handled seat-side).
2. **Row-1 re-entry cadence + who.** The ≥4-seat gate is settled (§6b); tune the
   interval and which Row-1 seat re-enters (rotate it, so no one seat eats the
   cost). Too rare → slow heal; too frequent → wasted relay wakes.
3. **Greeter admission throttling** to absorb a re-bootstrap burst (§12 herd
   risk) without throttling a healthy re-entry cadence.
4. **IP-only vote confidence** (§7): tuple-vs-IP-only policy — display-only?
   count but never auto-confirm? — plus the friend-relayed no-`srflx` case.
5. **The deterministic wiring, finalized** (§1½). The exact seat-to-seat
   functions for the cross-row bridge (and its redundancy width), the up-link,
   and the down-link — any pure function of coordinate that keeps degree bounded
   and every tree edge C-fold redundant. Pick it and freeze it; it is the one
   piece marked "to finalize in code."
6. **The Section-1 fork UX** (§1½/§6). When greeters return different Section 1s,
   the human is shown the Stage (or Row 1) faces of each tree to choose. Design
   the surface: how many faces, how identity is shown, the default on dismiss.
7. **Reduce/broadcast tuning** (§5): the id-dedup window, the latest-wins clock
   discipline (skew tolerance), and the per-link anti-entropy interval — fast to
   converge, cheap enough not to saturate the seven links.
8. **Ops visibility from inside.** The relay's per-session rosters — how every
   2026-07-13 fracture was found — are gone. `test/observer.js` is the
   replacement: it joins as a seat and streams protocol-level stats. Decide
   whether that suffices, or whether a seat should answer a *sealed* census to a
   URL-holding diagnostic client. Choose deliberately; don't discover the gap
   mid-incident.

*(Settled and dropped from this list: the signature algorithm — Ed25519, shipped
in step 3; and the relay session cap — now trivially "≈ X greeters + in-flight
joiners," no longer a tuning knob. Section consolidation is dissolved: one tree +
Section-1-anchored seating leaves no steady-state fragments to consolidate.)*

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
- **Room-level observability shrinks.** With member sockets gone, there is no
  central surface that knows a room's fragment layout; diagnosis moves to
  per-seat forensics plus whatever §11 q8 decides. Budget for this in incident
  response — the 2026-07-13 fold hunt would have been materially slower without
  the relay's session rosters.

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

## 14. Concrete change list — rip and replace

**No legacy.** We have not launched, so this is a *replacement* of the mesh
layer, not a migration — no compatibility branches, no old code path kept
alongside. Hold two disciplines throughout: **K-sweep** (identical assertions at
C=2 and at production `C=5`), and **ship the forensics with the step** — `clog`
flight-recorder events and `__gifosVideo` / `test/observer.js` hooks for every
new bit of state, in the same commit. The 2026-07-13 root causes were only
pinnable because the forensics existed; the new state (seat coordinate, the
seven links, ping-in-flight, reduce/broadcast, greeter pool, shun tally) needs
the same instrumentation.

**Already shipped — the safe prefix, still valid under the new model:**

- **0. Canonical seat identity** (`566977e`) — identity is a coordinate, never a
  local counter. Under the new model the coordinate the ping assigns simply *is*
  the identity (§1½); no counter remains anywhere.
- **1. Signaling on DataChannels** (`566977e`) — renegotiation/ICE ride the
  pair's own channel; the relay carries only the first handshake.
- **2. Password into the key** (`566977e`) — a locked room's key mixes the
  password; `setpw` is a re-key (§8).
- **3. Admin authority as a signature** (`05ffaca`) — Ed25519 seeded by the
  PBKDF2 bits; V commits to the pubkey; orders signed, verified by peers *and*
  the relay (§9).
- **4. Sponsor-forwarded signaling** (`29523c1`) — a heal/introduction frame
  routes over a mutual friend's channel when the relay path is down (§3).

**The rip-and-replace — the new topology (§1½) replaces `docs/rows.md` wholesale:**

- **5. The uniform seat + the seven links.** *Delete* deacons, the deacon-mesh,
  deacon-composites, `computeRows`-as-election, the `C²+C` session cap, and the
  multi-session walk. *Build*: the seat coordinate `(path, r, i)`; the
  deterministic wiring (row mesh, cross-row transpose, up-link, down-link); each
  seat composites *its own* row-strip. This is the heart — land it behind the
  scale flag and prove convergence at C=2 with `observer.js` before widening.
- **6. The four media tiers** — row feeds (mesh) + section strips (cross-row) +
  Stage broadcast-down (tight latency) + Stadium rolled-up mosaic
  (assemble-up / broadcast-down, loose). One composited tile per section,
  bounded size at every hop; `total` rides down with it.
- **7. Seating by vacancy ping** (§1½) — the C-ary flood, first-vacancy-wins,
  fill-dense-before-deep, frontier grows the tree on timeout. Delete
  relay-arbitrated seating entirely.
- **8. Reduce / broadcast gossip** (§5) — presence, hands, the count, the
  Stadium, admin orders as broadcasts (latest-wins, id-dedup); count and votes
  as reduces; anti-entropy on the heartbeat. Delete the relay `{t:'gossip'}`
  fallback.
- **9. The self-forming greeter pool** (§2) — greeter-on-join, hold until
  relieved, `X = max(3, 2·log₁₀ total)`, count-less relay, cold-start self-heal.
- **10. The row-1 heartbeat re-entrant** (§2 / §6b) — one action that tops off
  the pool, guarantees an honest greeter, and sutures splits; ≥4-seat gate.
  Close member sockets after join (§1); individual re-entry on total link loss
  (§6a); detect-and-warn for the unreachable-relay island (§6c).
- **11. Peer-enforced vote-off as a reduce** (§7) — tuple key (observed ICE path
  + hint), sealed vote gossip, tally-up-the-tree, shun by link-teardown +
  strip/mosaic exclusion, terminal shun notice, greeter declines-with-notice.
  Delete the relay `votekick` / tally / boot / door-gate.
- **12. Reconcile every doc** (no legacy): rewrite `docs/rows.md` to the
  uniform-seat model (or retire it into this doc), and update `architecture.md`,
  `docs/threat-model.md`, and `README.md` — all still describe deacons, a
  relay-authored roster, relay-enforced vote-off, and relay-checked passwords
  that will no longer exist.

The relay keeps only its abuse caps + origin allowlist, guarding the one thing it
still does: **introduce.**
