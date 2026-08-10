# The four app services the mesh owes an app

Status: **§1, §2, §4 are DESCRIPTIVE** — they ship today, and the citations are
to running code. **§3 is an OPEN PROBLEM** — it is neither built nor designed,
and this document deliberately does not pretend otherwise. §5 is a related
open question that is not a service.

The organising principle:

> **An app gets scale from the OS, not by implementing it.** An app declares
> what kind of data it has; the runtime owns how that data crosses a room of
> five people or a million.

This is already true of three of the four. `apps/anyroad/` implements **none**
of services 1, 2 or 4 — it calls `gifos.fetch()` and `gifos.db()` and the
runtime does the rest. The reason this document exists is that Anyroad's
player positions are **service 3 traffic being carried by service 4**, because
service 3 does not exist, and that is what puts a ceiling of a few dozen
players on a mesh whose seating protocol converges a million
(`docs/scale-1m-2026-08-07.md`).

---

## 1. The blob service — "the GIF pattern" (SHIPPED)

**Carries:** one immutable byte-identical blob that every node wants a copy of.
Today: the app GIF itself.

**Mechanism.** The owner broadcasts the bytes **once** as an owner-signed
`app` frame; every node that receives one **retains** it
(`site/run.html:9537` `sgaDeliver`); a latecomer pulls from whichever *peer*
already holds it (`sga-appreq` / `sga-app`, `run.html:9600`, `:9624`).
Distribution is a bounded-degree flood with dedup (`sgaFan` `:9514` over
`sgaTargets` `:9485`).

**Cost:** owner O(1). One frame per session, ever.

**Why it works.** Immutable + content-identical + transferred once. Every one
of those three matters — drop any of them and this pattern stops being the
answer.

**History worth keeping.** This was a star until 2026-08-02: every guest
dialled the owner for the file. `runtime.js:2230` records why that died — *"it
makes the owner (typically a phone) an origin server for every guest who ever
arrives… and it did not even work at two people."*

## 2. The pool service — content-addressed fetch (SHIPPED)

**Carries:** third-party HTTP responses that several nodes in a room will
independently ask for. Today: Anyroad's Overpass map tiles.

**Mechanism, and it is transparent.** The app calls ordinary
`gifos.fetch(url)`. `runtime.js:1946` silently routes it through
`pooledFetch` when the manifest declares that host under `capabilities.pool`.
Anyroad's source never mentions the pool; its manifest lists four Overpass
mirrors and that is the whole integration.

Two subtleties, both solved, both documented at `runtime.js:1437`:

- **Claim before fetching.** At a cold start nobody holds anything, so all N
  miss at once and "share what you downloaded" engages *after* every request it
  existed to prevent. So a node announces intent, waits out `SETTLE_MS`, and the
  lowest-sorting claimant goes while the rest wait for its answer.
- **Damped answers.** Once everybody holds a URL, one latecomer's miss would be
  answered by all N. Each holder waits a deterministic slot derived from its own
  id and the URL, and cancels when it sees someone else's answer go by.

**Cost:** one fetch per URL per room instead of one per node.

**Known limits.** `POOL_MAX = 96` entries, `POOL_TTL` 30 min,
`POOL_FAN_BYTES = 384 KB` unasked-push cap, `SERVE_SLOTS = 8`. These are tuned
for a room of tens. The claim/want frames still ride the same flood, so pool
*discovery* is O(N) per miss even though pool *payload* is O(1).

## 3. The status service — per-participant live state (MISSING, AND NOT DESIGNED)

**Would carry:** each participant's own small, frequently-changing record,
which every other participant wants a view of. Anyroad's player position and
heading; a meeting's hand-raise and talking state; any game's per-player state.

### 3.1 Why this is not service 4

A status record has exactly one legitimate author — the participant it
describes — and no two participants ever contend for one. Anyroad worked this
out independently and had to fake it through the DB. From `apps/anyroad/mp.js:173`:

> *"Nobody ever writes to anybody else's record: every player owns exactly one
> row and reads the rest, which is the same shape the ghosts already use and
> needs no authority to arbitrate."*

That is a description of a service the platform does not offer, written by an
app that needed it.

### 3.2 Why it is harder than anything we have folded before

We have folded two things along the Stadium mosaic. Neither transfers.

| | what folds | why it stays bounded |
|---|---|---|
| **Video** (`docs/media-plane.md` Channel Sd) | pixels | fixed canvas; past ~100 the footprint caps and each square **shrinks** |
| **Votes** (`docs/vote-scale.md` §2) | `{target → count}` + population claims | it is a **reduction** — sums are commutative, top-K throws the rest away |
| **Status** | N individual records | **nothing.** A set of distinct records has no reduction and no downscale |

That is the whole problem in one row. Video is bounded because pixels
degrade gracefully; votes are bounded because a tally is arithmetic. A set of
individual records is bounded only if you **throw one of three things away**:

1. **Precision** — quantize the record (the video answer, applied to data).
2. **Freshness** — carry only some records per tick, patch a local table as
   fragments land (eventual consistency; the property video cannot use).
3. **Membership** — carry only records the receiver cares about (interest
   management; needs something the OS cannot infer).

All three are available. Which combination is right is **not decided**.

### 3.3 What we are confident about

- **Eventual consistency is legitimate here and is the cheapest knob.** Each
  node keeps its own table of everyone's latest record and patches it as
  fragments arrive. No node ever needs a coherent room-wide snapshot at an
  instant. Video can never do this; status always can.
- **Emission must be change-triggered, not clocked.** A parked car should emit
  nothing. Anyroad currently publishes unconditionally at 5 Hz
  (`mp.js:20`, `:163`) whether or not anything moved. Dead reckoning with a
  floor (a liveness heartbeat) and a ceiling (a rate cap) is strictly better
  and is app-agnostic.
- **A source-side rate limit does not compose.** "No more than 1 tick in X"
  throttles a node in a sparse branch for nothing while a node under a dense
  head still overflows its link. A **per-link byte budget with a
  staleness-ordered queue** (oldest-unsent first, defer the rest) self-balances
  with no global X, and staleness-ordering needs nothing from the app.
- **Whatever we build, the arithmetic below is what it must live inside.**

### 3.4 The arithmetic any candidate must face

Assume a 16-byte record (id + lat/lon f32 + heading/speed), a fold tick of
4 Hz, and a per-link budget of one ordinary video stream — ~4 Mbps, ~125 KB per
tick. Then the interval at which you hear about **one specific distant
participant** is:

| room | raw 16 B records | author-signed (~80 B) |
|---|---|---|
| 1,000 | every tick | every tick |
| 100,000 | ~3 s | ~16 s |
| 1,000,000 | **~32 s** | **~2m 40s** |

Two things fall out of this table and both are load-bearing:

- **A global view is affordable and a local view is not.** ~30-second-stale
  dots on a globe at bounded per-device cost is a real feature. The same
  mechanism is useless for the car 40 m ahead of you, at any budget. Discovery
  and detail are different problems — see §5.
- **Signing every record breaks the budget.** A 64-byte Ed25519 signature on a
  16-byte record is 5× overhead and costs a factor of five in freshness.
  `vote-scale.md` dodges this by folding counts while heads retain the raw
  signed leaves for one audit window — but a status fold has no counts to
  carry. Unresolved (see Q4).

### 3.5 Two candidate mechanisms, and we do not know which

**A — tree fold along the Stadium pathway.** Leaves emit records; a row head
merges its row's records with each down-link's block into one flat batch under
a byte budget, drains a staleness-ordered queue, ships up; Section 1 finishes
in parallel with no election; mix-minus down. Reuses solved machinery
wholesale, and the per-link cost is fixed by construction.

**B — anti-entropy gossip.** Each node periodically exchanges digests with its
neighbours and pulls what it lacks. No tree, no assembly points, heals
naturally under churn, no head to become a liar or a bottleneck. Already the
one-line sketch in `docs/mmog-ideas.md` §1 ("gossip / app state — flood +
anti-entropy over the mesh"), and the mesh already runs a gossip lane for
status heartbeats.

The honest position: **A is elegant because it reuses the pathway, B may be a
better fit precisely because the consistency is eventual.** Nobody has
compared them. A fold gives a hard per-link bound and a clean aggregation
point; gossip gives churn-resilience and no privileged node. The choice
probably turns on Q1 and Q4 below, and on whether §5 ends up carrying the
local-detail load — which would shrink service 3 dramatically.

### 3.6 Open questions — none of these are answered

1. **Is the global view worth building at all?** Anyroad's actual gameplay need
   is the local view (§5). A million dots on a globe is a spectacle, not a
   mechanic. If §5 carries the real load, service 3 might reduce to "how many
   participants are in each cell" — which *is* a reduction, and therefore
   already solved by the `vote-scale.md` shape. **This question should be
   settled before either candidate is prototyped**, because a yes and a no
   build completely different things.
2. **Does staleness-ordering actually bound worst-case staleness through a
   tree?** Oldest-unsent-first is obviously fair within one head's queue. Across
   a tree where a head merges K child blocks under a fixed budget, whether a
   deep subtree can starve is an open question and a sim question.
3. **How much relevance can be declarative?** Staleness is generic. Relevance
   is not. Evaluating an app-supplied predicate at every intermediate node means
   running app code on other people's devices — a non-starter. A declared
   comparable key (a geocell) is safe but limited. Which useful relevance
   fits in "a key, not an algorithm" is undecided.
4. **What is the trust model, given §3.4?** Intermediate nodes can drop, delay,
   reorder, or fabricate. `vote-scale.md` §3's answers mostly port — minting is
   signing, two disjoint paths, spot audits, censorship is bounded not fatal,
   freshness decays — but per-record signatures cost 5× the budget. Candidates:
   sign optimistically-unsigned batches at the head with raw leaves retained for
   audit; aggregate signatures; or accept forgeable distant status and treat it
   as cosmetic. Each has a different failure story and none is chosen.
5. **Does a fixed-schema declaration buy generic densification?** If a record
   is declared as a typed tuple with ranges (`lat: f32 [-90,90]`), the OS can
   quantize down a precision ladder without knowing it is a car — making
   knob 1 app-agnostic, the same discipline as "a key, not an algorithm". Seems
   promising, entirely unvalidated.
6. **What is the actual record budget?** §3.4 assumes 16 bytes and 4 Hz because
   they are round, not because anyone measured what a status service needs.

### 3.7 Sim-first, same gate as votes

Nothing here reaches the wire before the C++ reference sim proves it —
`test/sim/mesh.cpp` is source of truth for mesh behaviour, and
`docs/vote-scale.md` §5 sets the precedent. Minimum scenarios: budget
saturation, deep-subtree starvation (Q2), liar/censoring head, churn mid-fold,
and the C-sweep.

## 4. The DB service — replicated app state (SHIPPED)

**Carries:** authoritative shared state with real write contention. Anyroad's
`race` record; a shared document; a game's score table.

**Mechanism.** The owner holds the authoritative store. A guest write is a
**proposal**: an `act` frame floods to the owner, which validates it against the
manifest's visibility rules and the leadership fence, applies it, then signs and
floods the result (`runtime.js:2293` `onAct`, `:2278` `sendDelta`, `:2271`
`sendSnap`). A late joiner pulls the retained snap from any peer holding it. On
the client, a `db-change` notification triggers a full `getAll` (`:197`).

**Cost:** every change is a full-state re-serialise, an Ed25519 signature on the
owner's main thread, and a room-wide flood. The client then re-reads the whole
collection. `mp.js:10` states the consequence plainly: *"A subscriber
re-downloads the WHOLE collection on every change. Position traffic is therefore
O(players²)."*

**What it is actually good for.** Low-rate authoritative state where a single
writer resolving conflicts is a feature. For that, full-state + owner-signing is
a perfectly reasonable design and the cost is irrelevant.

**Its real ceiling.** Measured: one `approom-host` stopped serving app bytes
altogether after ~20 sequential guests (`test/README.md:197`).

**The point of this document.** Anyroad's `players` collection is service 3
traffic in service 4's clothing — 5N writes/sec, each triggering a full-state
owner-signed broadcast of all N rows. **Move it to service 3 and service 4's
remaining load in Anyroad is the `race` record: two coordinates and a results
list, a handful of writes per race.** No change to service 4 is then needed.
Per-record deltas and author-signed rows would still be tidier, but they stop
being load-bearing, which is why they are not proposed here.

## 5. Locality is not a service (OPEN)

§3.4 shows a global status view cannot also be a local one. The fold tells you
roughly where everyone is; something else must tell you exactly what the people
around you are doing. Three candidates, none chosen:

- **Cell-keyed ad-hoc rows.** Not a child stadium — a **Row** (`media-plane.md`
  Channel R: direct, full quality, fully meshed, no compositing, no election).
  Keyed by **geocell, not by neighbour**: in Anyroad your neighbours change every
  few seconds at speed, but your cell changes only at a crossing, and you can
  pre-join the cell you are driving toward. Cell → room key falls out of the
  existing derive-don't-send scheme (`gifos-net.js` DS). Requires **simultaneous
  membership in several meshes**, which nothing in the codebase does today: K
  memberships cost K×(C+1) links plus K sets of heartbeat and healing duty.
- **Subrooms / breakouts (roadmap §4d).** Exists on paper but is the wrong
  shape: each subroom is "a full, ordinary GifOS room (its own stadium = its own
  relay session = its own URL and key)", and joining is "leave-parent +
  join-child". A migration, one room at a time, with a whole stadium of overhead
  per room. Right for humans taking a breakout; wrong for a car crossing a
  street.
- **Swap pools (`mmog-ideas.md` §4).** Move people in the tree so friends become
  row-mates. Rate-limited, lease-based, abortable during heal storms — and
  explicitly bounded by that document's own doctrine (§1.1): *"Topology is
  weather (logistics). Affiliation is player-authored (app state)."* Good for a
  party sitting down together for an evening; cannot track continuous motion.

The open decision is whether simultaneous multi-mesh membership is a thing the
platform should learn, and if so whether the light form (an ad-hoc row) is
enough to avoid everything §4d has to reckon with.

---

## Summary

| | carries | mechanism | cost | state |
|---|---|---|---|---|
| 1. Blob | one immutable blob | broadcast once, retain, peer pull-through | owner O(1) | ships |
| 2. Pool | content-addressed fetches | claim / settle / damped serve | one fetch per room | ships |
| 3. Status | per-participant live record | **undecided** | **undecided** | **open** |
| 4. DB | authoritative shared state | owner-signed full-state snap/delta/act | O(N) per change | ships |
| 5. Locality | direct comms with who is near you | **undecided** | — | **open** |

Related: [`media-plane.md`](media-plane.md) (the fold that works),
[`vote-scale.md`](vote-scale.md) (folding a reduction, and the liar-aggregator
answers), [`mmog-ideas.md`](mmog-ideas.md) (topology-is-weather; swap pools),
[`healing-laws.md`](healing-laws.md), [`app-mesh.md`](app-mesh.md),
[`scale-1m-2026-08-07.md`](scale-1m-2026-08-07.md) (the seating protocol does
converge a million).
