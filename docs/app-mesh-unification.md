# Unifying apps and meetings onto ONE control plane (design study)

Status: **DESIGN STUDY — research + recommendation, no code.** Written
2026-07-18. This is the wide, deep companion to the existing narrow migration
note [`app-mesh.md`](app-mesh.md): where that note scopes a *bus swap* (replace
the relay broadcast with `meshNode.gossip`), this study asks the bigger
question the directive poses — *should an app-share and a meeting become the
same object at the networking layer, and exactly what breaks or holds if they
do?* Companions: [`healing-laws.md`](healing-laws.md) (the mesh),
[`media-plane.md`](media-plane.md) (A/V over it), [`meet-security.md`](meet-security.md)
(door lock / signed authority), [`threat-model.md`](threat-model.md) (app
sandbox), [`architecture.md`](architecture.md) (the GifOS computer).

## TL;DR

A meeting and a running-app-with-people should be **one mesh room**. The room
is a mesh session (URL-derived `sid`/`tok`/`K`, greeter registry R2/R3, C=5
seating, healing laws). App shared-state rides the room's **gossip flood** the
way chat/status/votes already do. Turning on A/V is a strictly-additive wrapper
(camera tracks + the media-plane packer + the meeting UI) over a room that
already exists as a control mesh.

The single load-bearing decision is the **consistency/authority model**, and it
cuts against the mesh's grain: the mesh is deliberately *no-boss*, but the app
runtime is deliberately *host-authoritative* (one writer the relay gates by a
verifier), and that host-authority is exactly what bounds a malicious peer's
blast radius today. Gossip is a room-wide flood — harm ≈ **fanout = the whole
room** — so putting raw app writes on the flood with no authoritative writer
would let one malicious seat poison the app for everyone. **The recommendation
keeps a single authoritative host seat, healed by the mesh, and uses gossip
only as the pipe** — preserving the Boundary-E trust model while retiring the
relay-as-transport.

---

## 1. Current state, side by side

Two stacks share one transport fabric (`site/js/gifos-net.js`) but diverge
completely above it.

| Dimension | **Meeting mesh** (control plane) | **App multiplayer** (host/client) |
|---|---|---|
| **Where it lives** | `site/js/mesh.js` (Seat brain, sim port) + `site/js/mesh-wire.js` (transport binding) + `site/meet.html` (`startMesh` line 2279) | `site/js/runtime.js` (`boot`/`becomeHost` 1827/`bootClient` 1940) + `site/run.html` |
| **Transport** | Bounded-degree WebRTC tree (rows + cross + up/down + S1 columns), degree ≤ C+1; relay is greeter-only | Star: host browser ⇄ each client, over relay WebSocket (P2) with opportunistic DataChannels (P1); relay fans `{t:'bcast'}` to all clients |
| **Invite / join** | URL secret → `deriveMeet` (`gifos-net.js` 321) → knock relay greeter registry, newcomer dance, seated at a vacant coord (R1–R6) | Link secret → `deriveJoin` (`gifos-net.js` 299) → relay session `sid`; host holds the slot, client joins and mirrors |
| **Identity of the room** | URL + optional admin verifier; **genesis key** (R2/R3) is the per-instance identity (`mintGenesisKey` `gifos-net.js` 354) | `sid` = `deriveJoin(lsec)` for self-healing links, or `"<room>.<verifier>"` for owned links; fileId names the app, not the room |
| **Identity of a person** | Opaque ephemeral `peerId`; S4 per-person keypair specified, **not built** (`healing-laws.md` S4) | Self-asserted screen name + random `uid` (`threat-model.md` §6); no per-person crypto |
| **State model** | No shared app state — the mesh carries occ-map (coord→peer), rosters (W5), and a gossip lane for chat/status/votes/files | Host holds the authoritative IndexedDB (`appstate`/`apprecords`, `architecture.md` L1); clients forward *ops* up, host applies + broadcasts changes |
| **Replication / ordering** | Gossip is an **exact-once flood** with dedup + anti-entropy replay (`mesh.js` 278–310); occ/roster converge via healing laws | **Host-authoritative, host-ordered.** `db-change` events broadcast (`runtime.js` 1720); writes serialized at host; idempotent replay by op-id (`threat-model.md` Boundary E) |
| **Late joiner** | Newcomer seated at frontier; `_gspReplay` hands the recent gossip backlog (`mesh.js` 310) — a **bounded** 64-entry / 256-tick window, not full history | Client **mirrors the full state** on join and on every `db-change` (`runtime.js` `mirror` 1997); a full dump, not a delta replay |
| **Churn / healing** | Rich: leaf-promotion (P), fixed-designation healers (H), drain/reseat (E1), ring integrity (W7). Seat death is a first-class event | `AUTO_TAKEOVER` (`runtime.js` 1288/2049): if the host dies, a still-connected mirrored guest (resilient links only) becomes the new host on the same `sid` |
| **Persistence** | None — the room is live-only; "no stored home" (R1). Roster is reconstructed by walking the mesh | State lives with the icon on the host's desktop (`/appstate/<gifId>/`); snapshots export a full GIF; guests can snapshot their mirror |
| **Ownership** | No boss (open rooms) or admin via signed Ed25519 orders (`meet-security.md` §SIG); genesis founder is not privileged | **Owned** host slot gated by a verifier the relay checks (`verifierOf`, shared with meetings), or **anyone-owns** dotless id (`architecture.md` L4) |
| **Security boundary** | Room key `K` is the ONLY trust boundary; harm ≈ fanout; C3 exclusivity bounds seat capture; per-connection DTLS | App runs sandboxed (opaque origin, CSP `connect-src 'none'`, Boundary A); host filters reads/writes by collection visibility (`_vis`); host is authoritative (Boundary E) |

### Where they already overlap (honestly)

The unification is less far than the table suggests — three big pieces are
already shared:

1. **One transport fabric.** `gifos-net.js` serves both: `steadySocket`,
   fragmentation, the derive-don't-send scheme, `seal`/`open`, the P0/P1/P2
   path ladder, and `verifierOf` authority all belong to both. Apps and
   meetings *already* authenticate authority identically (same helper —
   `architecture.md` L4, `threat-model.md` Boundary E).
2. **App-in-a-meeting is already half on the mesh.** `runApp` (`meet.html`
   5112) boots the app through the normal runtime, `becomeHost`s it
   `forever`/resilient (5124), and advertises `{s,k,relay,name}` **inside the
   mesh status heartbeat** (`myStatus.app`, 5135) — so app *control*
   (share/stop, host handoff, the deterministic winner in `findSharedApp`
   5171) already rides mesh gossip. Only the app's **state** still flows over a
   *second, separate* relay session (`mountClientApp` 5142 calls `bootClient`
   with the app's own `{s,k,relay}` — a distinct `deriveJoin` sid, not the
   meeting sid).
3. **The gossip lane is already a general app bus.** `meshNode.gossip({a:1,
   msg})` (`meet.html` 1703) already carries chat, status, votes, and file
   control room-wide with exact-once delivery and late-joiner replay
   (`mesh-wire.js` 159, `onGossip` dispatch `meet.html` 2294). App-state deltas
   are the same *shape* of traffic — this lane is the natural home for them.

So today an app "in a meeting" runs **two relay sessions at once**: the
meeting mesh (`deriveMeet`) and the app share (`deriveJoin`). The redundancy the
directive targets is real and precisely located: the app-state relay session.

---

## 2. The unified model

**A room is a mesh session. An app-share is a room. A meeting is a room with
the media plane switched on.** Concretely:

### 2.1 Participants are seats

Everyone who joins an app-share takes a bounded seat `{pc,r,i}` under the same
C=5 healing laws (`gifos-net.js` `topo` 485, `SCALE.C` 462). An app-share opens
**no camera tracks and never runs the packer** (`mesh-media.js`) — it is the
control mesh plus the gossip lane and nothing else. This is exactly the
headless node `app-mesh.md` calls for; `mesh-wire.js`'s `createMeshNode`
already takes no media dependency, so a "media-less meeting" is just a node
with `dropDeepSocket` on and no `mesh-media` wired.

### 2.2 App state lives on the gossip lane, namespaced by app sid

App-state deltas travel as `seat.gossip(payload)` floods (`mesh.js` 278),
exact-once and room-wide, over the tree's own bounded links (DC → sponsor-
forward → relay-bootstrap). Namespace them the way meeting traffic already is:
today `{a:1, msg}` carries meeting app-traffic (`meet.html` 2295); add an
`{app:<sid>, m:<delta>}` shape so one room can host several apps and each
client filters by the app sid it mounted. `onGossip` (`mesh-wire.js` 97)
dispatches to the runtime's delta handler instead of a relay `db-change`.

### 2.3 Authority: keep a single writer, heal it with the mesh (the crux)

This is the decision everything else hangs on. Two candidate models:

- **(A) Host-authoritative over gossip (RECOMMENDED).** Exactly one seat owns
  the authoritative DB, as today. Clients gossip *ops* toward the host seat (a
  directed mesh send to the host's coord, the `{t:'to',to:host}` of `runtime.js`
  1369 becomes a mesh unicast); the host applies them against its store and
  gossips `db-change`/delta floods room-wide. Consistency model **unchanged** —
  gossip is only the pipe (this is `app-mesh.md`'s "host stays the sole
  writer"). The host slot is healed the way the mesh already heals a seat: if
  the host seat dies, its designated healer (H1/H2) promotes, and app-host
  responsibility follows the seat — replacing the runtime's bespoke
  `AUTO_TAKEOVER` mirror-race (`runtime.js` 2049) with the mesh's own healing.
- **(B) Host-less replicated state (CRDT / last-writer).** Every seat holds
  the full state; writes are CRDT-merged locally and gossiped; there is no
  authoritative writer. This is the "truest" unification (no host to heal at
  all) and matches the mesh's no-boss doctrine — **but** it breaks the
  host-side visibility enforcement (`architecture.md` L1: the host filters
  `private` records out of every guest read, refuses guest writes to non-
  `read-write` collections) and, critically, the security bound (§5): a raw
  gossip write reaches the whole room in one flood, so a malicious seat's harm
  is no longer bounded — it poisons everyone's copy at once.

**Recommendation: (A).** It preserves the entire Boundary-E trust model, is the
smaller change (`app-mesh.md`'s bus-swap), and lets the mesh's *existing,
proven* healing carry the host slot instead of a parallel takeover mechanism.
(B) is a worthy long-horizon goal but demands per-author identity (S4, not yet
built) and app-level CRDT semantics before it is safe — it is out of scope for
the first unification and noted as future work.

### 2.4 Late joiner: snapshot, not replay

Gossip replay alone **cannot** converge a late joiner: `_gspReplay` keeps only
a bounded recent window (64 entries / 256 ticks, `mesh.js` 301–310) — by design,
for memory. Full app state can be arbitrarily large (megabytes; `architecture.md`
size table). So the joiner needs a **snapshot**, which the host model already
provides: a newly-seated client requests the current state dump from the host
seat (the runtime's `dump` path, `runtime.js` 691, already produces a
visibility-filtered snapshot) delivered over the mesh (DC, fragmented via
`sendChunked`, sponsor-forwarded or paced-relay for a heavy app exactly as
`architecture.md` L4 "App delivery scales past the relay budget" describes).
After the snapshot, incremental deltas from the gossip lane keep it live — the
recent-window replay (`_gspReplay`) covers the gap between snapshot-time and
first-flood-seen. **Snapshot for the bulk; gossip-replay for the seam.**

### 2.5 App state under churn/healing

The rook / E1 / W5 machinery carries the **room's structure and roster**, not
app payloads — E1 re-seats members and W5 syncs the *greeter roster*, neither
of which is app state. So app state needs its **own** durability layer riding
on top:

- **The authoritative copy lives at the host seat** and is healed by promoting
  the host slot (2.3-A). The promoted host must hold the state — so, as today,
  **resilient shares mirror state to guests** (`runtime.js` `mirror` 1997), and
  the mesh's designated healer for the host seat must be a mirror-holder.
  Reconciling "the mesh picks the healer by topology (H1/H2)" with "only a
  mirror-holder can become host" is an open wrinkle (see §7): either every seat
  mirrors (costly for big apps) or host-heal is restricted to seats that do,
  falling back to a fresh snapshot fetch if the topological healer lacks one.
- **Persistence remains the icon.** The host's state is still stored under
  `/appstate/<gifId>/` (`architecture.md` "State lives with the icon"); the
  room is live-only ("no stored home", R1), so if the whole room dies the app
  survives only as the host's saved GIF or a guest's snapshot — unchanged from
  today, and correct.

---

## 3. Invite / join flow, unified

### 3.1 An app invite maps to a mesh join

An app-share invite becomes a **mesh room URL**. The link secret derives the
room the same way a meeting does — `deriveMeet(appSessionSecret)` →
`{sid, tok, K}` (`gifos-net.js` 321) instead of `deriveJoin` — so the relay
holds only `H(genesis key)` + the sealed greeter list for that sid (R2). The
newcomer knocks the greeter registry, does the newcomer dance, and is seated
(R1–R6). No app data ever touches the relay. (`app-mesh.md` "Session key".)

### 3.2 Reconciling app identity with room identity

Three identities must be aligned:

- **`fileId`** names *which app GIF* is running — it is not a room identity and
  does not change. It selects the sandboxed app and its local DB partition; it
  stays a client-side concept.
- **The room key** (`K = deriveMeetKey(url, pw)`) is the read-boundary and the
  seal for all traffic including app deltas. Holding the link = being able to
  read the room.
- **The genesis key** (R2/R3, `mintGenesisKey`) is the per-*instance* identity:
  it is what makes *this* run of the app a distinct room from another run of the
  same app. Two people opening the same app GIF and each minting a share create
  two rooms with two genesis keys — correctly distinct, resolved by R5 if they
  ever collide under one URL.

So: **each app-invite = a distinct mesh room keyed by (URL secret + genesis
key)** — i.e. by *instance*, exactly like a meeting. The app (`fileId`) is what
runs *inside* it. An app running *inside an existing meeting* does **not** mint
a second room: it reuses the meeting's mesh session and rides its gossip lane
under an `{app:<sid>}` namespace (§2.2) — retiring the second relay session
that `mountClientApp` opens today.

### 3.3 Owner / host onto the mesh

The runtime's ownership shapes (`architecture.md` L4) map cleanly onto the
mesh's:

- **Owned app link** (`sid = "<room>.<verifier>"`, host slot gated by a secret
  whose hash is the verifier) → a mesh room **with an admin**. The same
  `verifierOf` helper the relay already shares between apps and meetings
  (`threat-model.md` Boundary E) becomes the room's admin verifier; the owner
  proves authority with **§SIG signed orders** (`meet-security.md`) rather than
  a relay-checked `adm` secret. The owner is the app-host and the room admin —
  one identity, expressed as signed authority.
- **Anyone-owns link** (dotless id) → a **plain (admin-less) mesh room**: any
  holder may host, order is peer-enforced civility, and — under model (A) — the
  host seat is whoever founded / was healed into it. Same "deliberate, labeled"
  trade the app runtime and plain meetings already make.

The **Section-1 founder is not privileged** (R3: arrival order decides genesis,
never authority). So "the owner" is *not* "the founder"; it is the verifier-
holder, expressed through signed §SIG orders that any seat verifies — which is
exactly how a meeting admin already works. This keeps ownership orthogonal to
topology, as it must be.

---

## 4. The optional A/V wrapper

Everything above builds a live room with no camera. "Turning the meeting on" is
**strictly additive** — it adds, to a room that already exists:

1. **Media tracks.** Open camera/mic and attach streams to the WebRTC links the
   control mesh already holds. "When a heal moves a seat, its media links move
   with it — no separate media healing" (`media-plane.md` "Relation to the
   control plane"): media is a pure consumer of the same occ-map.
2. **The packer + channels.** Wire `mesh-media.js` to composite Row / Stage /
   Stadium over the existing tree (`media-plane.md`). None of this touches the
   control mesh or the gossip lane — it reads the same occ-map the healing laws
   maintain.
3. **The meeting UI.** The stadium scroll, tiles, blur/consent, admin controls
   — all `meet.html` chrome, layered over the app pane that already exists
   (`showAppPane` 5101).

The proof that it is additive: the app-on-Stage feature already treats an app
as a **data stream, not A/V** (`media-plane.md` lines 80–88) — the app occupies
a Stage slot and broadcasts state deltas down the Stage path, taking *no* slot
in the A/V strip. Under the unified model that is just the app's gossip lane
projected onto the Stage fan for the "shared app on the broadcast tier" case;
the A/V strip composites only camera stagers. So the media plane already
assumes app-state is separable from A/V — the unification makes that the *only*
model, and A/V becomes the wrapper the media plane was always designed to be.

**Symmetry both directions** (already true today, `architecture.md` "Apps
inside meetings"): "Run app" in a meeting = mount the app on the existing room;
"Meeting" in an app tab = switch the media plane on for the room the app is
already running in. Both land on one layout because they are one object.

---

## 5. Security reconciliation

Combine the two trust models:

- **App model:** untrusted app GIF, sandboxed (opaque origin, CSP
  `connect-src 'none'`, WebRTC neutered — Boundary A); host-authoritative,
  host filters by collection visibility; owned host slot gated by a verifier
  (Boundary E); per-app DB isolation by fileId.
- **Mesh model:** room key `K` is the ONLY trust boundary; harm ≈ **fanout**;
  C3 exclusivity means a seat's occupant changes only via its one designated
  healer (S1/S2); a malicious peer can poison only its own connections (S3);
  per-person identity S4 specified, not built.

### 5.1 What stays bounded

- **The sandbox is untouched.** Whether app state arrives over a relay `bcast`
  or a mesh gossip flood, the app still runs in the opaque-origin iframe with
  `connect-src 'none'` and neutered WebRTC (Boundary A). The mesh node lives in
  the *trusted meet.html/runtime origin*, never in the app — the app calls
  `gifos.db()` and the runtime mediates, exactly as now. **A joiner of a
  hostile app still crosses Boundary A + B** (`threat-model.md` Boundary E) —
  unchanged.
- **Host-authority preserves the write bound.** Under model (A), the host seat
  is still the sole writer and still filters reads/writes by visibility. A
  client seat can only *propose* ops to the host; the host validates. So a
  malicious seat cannot write `private` records to others or forge a
  `read-only` write — the Boundary-E guarantee carries over intact.
- **The room key stays the read boundary.** All app deltas are `seal`ed under
  `K` (`gifos-net.js` 425); a sponsor-forwarding friend carries ciphertext it
  could already read as a member but cannot alter (§FWD). A logging relay sees
  a hash + ciphertext — *better* than today's standalone app-share, where the
  relay routes every delta (`app-mesh.md` "STANDALONE app-share… the relay
  routes every delta").
- **Authority is signed, not stamped.** The owner→admin mapping (§3.3) rides
  §SIG signed orders any seat verifies — no "admin socket," no relay stamp.

### 5.2 What is newly open

- **A malicious seat can flood *bad ops* room-wide cheaply.** Gossip fan-out is
  the whole room, so a client seat can gossip a torrent of ops toward the host
  (and junk `{app:sid}` frames toward everyone). Under model (A) the host
  *rejects* bad writes, but the **flood still costs every relay it crosses** —
  harm ≈ fanout, and the fanout is now room-wide rather than one relay hop to
  the host. Mitigation: rate-limit the gossip lane per source (the mesh's
  gossip dedup + a per-source op budget), and keep ops *directed* to the host
  seat (a mesh unicast, not a flood) so only the host bears them — reserving
  the flood for the host's authoritative `db-change`.
- **Model (B) would be a direct S-frame violation** — spelled out so nobody
  reaches for it casually: a raw peer write on the flood lets one seat change
  everyone's state in one hop. That is precisely "influence jumps
  discontinuously" (the S-frame's bug test) and precisely what C3 forbids for
  seats. Any future host-less app state MUST first solve per-author identity
  (S4) and per-record authorship, or it hands a Sybil attacker a room-wide
  poison lever.
- **The host seat is now a public, healable coord.** Making app-host
  responsibility follow a mesh seat means the host is at a known coord with the
  mesh's public wiring (W5/W6 at Section 1). An attacker that captures the host
  seat's coord could serve poisoned state as "the host." This is bounded by C3
  (only the designated healer fills the host seat, and only when it is genuinely
  empty — S5 no-eviction) **but** rests on S4 to prove *who* the healer is —
  the same not-yet-built dependency the mesh already carries. Until S4 lands,
  host-heal has the same structural-head-start-not-a-proof exposure as any
  Section-1 heal (`healing-laws.md` S4 STATUS).
- **First-contact / Sybil gap is inherited, not widened.** The app-share leans
  on the same `K`-proves-*a*-member-not-*which* limit as the meeting mesh. No
  new gap — but the app now inherits the meeting's open S4/Sybil/first-pin
  issues, where before an owned app link at least gave the relay a verifier
  gate on the *host* slot. Keeping the owned→admin verifier mapping (§3.3)
  preserves that gate for owned apps.

**Net:** model (A) keeps the security posture roughly at parity with today
(host-authoritative, sealed, verifier-gated) while *improving* relay exposure
(no app data on the relay). The one genuinely new cost is gossip-flood abuse,
bounded by directed ops + rate limiting. Model (B) is unsafe without S4.

---

## 6. What's reusable, what changes, migration

Rip-and-replace is acceptable (no back-compat constraint), but most of the app
runtime is *reused*, not deleted:

**Survives unchanged:**
- The whole app sandbox / runtime API (`window.gifos`, `gifos.db()`, the
  bridge, capabilities) — apps are untouched.
- The DB store, collection-visibility enforcement, `_vis`, snapshots, the
  host-authoritative op model (`architecture.md` L1/L3; `runtime.js`
  `handleRpc`) — the *consistency model is preserved* (model A).
- `gifos-net.js` entirely (already shared).
- The mesh control plane, gossip lane, anti-entropy, healing (already proven by
  harness + swarm).

**Changes (the seam):**
- Extract `{ bcast(msg), to(peer,msg), onMessage(cb) }` from `runtime.js`'s raw
  socket (`app-mesh.md` "Concrete seam"). Default binding = today's relay
  socket (zero behaviour change); injected binding = `bcast →
  meshNode.gossip({app:sid,m})`, `to → directed mesh send to the host seat`,
  `onMessage → onGossip` filtered by `app:sid`.
- App-in-meeting stops opening a second session: `mountClientApp` (`meet.html`
  5142) binds the runtime client to the *meeting's* meshNode instead of calling
  `bootClient` with a separate `{s,k,relay}`.
- Standalone app-share gets a headless meshNode via a new reusable module
  (`app-mesh.md` calls it `site/js/mesh-app.js`) that `run.html` and `meet.html`
  both consume — factoring the node bring-up + DC signaling glue out of
  `meet.html`.

**Deleted once baked:**
- The relay's app-broadcast: `{t:'bcast'}` fan-out and the mesh `{t:'gossip'}`
  relay fallback (`relay.js` 517/522) shrink to greeter-only — the last piece
  of the R2 lockdown, *currently deferred precisely because apps still need the
  relay bus* (`app-mesh.md` step 4).
- The runtime's `AUTO_TAKEOVER` host-race (`runtime.js` 1288/2049) — replaced by
  mesh host-slot healing (model A, §2.5) — **IF** the mirror/heal wrinkle (§7)
  is solved; otherwise it is retained as the mirror-selection mechanism.

**Dependency on the in-flight control-plane port:** this whole study rides on
`site/js/mesh.js` + `mesh-wire.js` being production-ready. Several load-bearing
pieces are **specified but not yet built** and gate the unification's safety:
W7 ring integrity (`healing-laws.md` W7 STATUS: `crossLink` still returns the
sparse transpose), and **S4 per-person identity** (needed before host-heal or
any move toward model B is trustworthy). The unification should not ship its
host-heal step ahead of W7 + S4.

### Phased path

1. **Extract the transport seam** in `runtime.js` behind a flag; default relay
   binding, zero behaviour change. Land the multi-participant app-sync e2e test
   `app-mesh.md` demands (two mesh participants + one `runAppForTest`, assert DB
   converges over gossip with **no** new relay `role=host` session) — *before*
   anything ships.
2. **Point app-in-meeting at the meeting's node.** App deltas gossip over the
   existing meeting mesh; retire the second relay session. This alone kills the
   redundancy the directive names and is low-risk (the meeting mesh already
   exists and carries the app's *control*).
3. **Headless node for standalone app-share** (`mesh-app.js`): a media-less
   room. Standalone apps now run on the mesh; relay is greeter-only for them.
4. **Snapshot-on-seat** for late joiners (§2.4) over the mesh delivery path.
5. **(Gated on W7 + S4) Host-slot healing** replaces `AUTO_TAKEOVER`.
6. **Retire the relay app-broadcast** once 1–4 bake.
7. **(A/V wrapper)** already works today (`architecture.md` "Apps inside
   meetings"); once state is on the mesh it needs no change — the wrapper was
   always additive.

---

## 7. Recommendation + open questions

**Recommended unified model:** a room is a mesh session; an app-share is a
media-less room; a meeting is that room with the media plane switched on. App
state stays **host-authoritative** (model A) — the host is the sole writer, the
mesh gossip lane replaces the relay bus, ops are *directed* to the host seat and
only the host's authoritative `db-change` floods. Late joiners get a **snapshot**
from the host over the mesh, with gossip-replay covering the seam. Owned apps
map their verifier onto the room's §SIG admin authority; anyone-owns apps are
plain rooms. A/V is the strictly-additive wrapper the media plane already
assumes.

**Ordered increments (design-level):** exactly the phased path in §6 —
(1) seam + test, (2) app-in-meeting onto the meeting node [kills the named
redundancy], (3) headless node for standalone, (4) snapshot-on-seat,
(5) host-heal [gated on W7+S4], (6) retire relay bus, (7) A/V wrapper [already
done].

**The 3–4 hardest decisions — needs a human:**

1. **Authority model — confirm (A) over (B).** Keeping a single healed host
   preserves the whole Boundary-E trust model but keeps a "boss" the no-boss
   mesh must special-case. Going host-less (B) is the truer unification but is
   unsafe without S4 + app-level CRDT. **Recommend (A) now, (B) as post-S4
   future work.** Human must ratify that the mesh permanently carries a
   privileged host seat for apps.
2. **Host-heal vs. mirror-holding.** The mesh picks a seat's healer by topology
   (H1/H2), but only a *state-mirror-holder* can become the app host. Reconcile:
   every seat mirrors (costly for multi-MB apps) vs. restrict host-heal to
   mirror-holders vs. topological healer fetches a fresh snapshot on promotion.
   **Needs a human decision.**
3. **Late-joiner state transfer under load.** Snapshot-from-host over the mesh
   for a heavy app (multi-MB) competing with live deltas and (if A/V is on)
   media — is the DC/sponsor/paced-relay delivery (`architecture.md` L4) enough,
   or does a big shared app need a designated snapshot-holder set (like the
   greeter pool) to spread the cost? **Needs a human decision.**
4. **Ordering guarantees for concurrent client ops.** Host-ordering is
   preserved, but directed-to-host over a *mesh* (multi-hop, sponsor-forwarded)
   has looser latency/ordering than a direct relay socket. Confirm the existing
   idempotent-op-id replay (`threat-model.md` Boundary E) is sufficient over the
   mesh path, or whether apps need explicit per-op sequencing.

**Biggest risk:** putting app state on a room-wide gossip flood removes the
relay's implicit chokepoint on writes. Under model (A) the host still rejects
bad *writes*, but a malicious seat can still **flood cheaply and room-wide** —
harm ≈ fanout is now the whole stadium, not one relay hop. This is bounded (not
closed) by directing ops to the host as unicast + per-source gossip rate limits,
and it is the reason model (B) is unsafe until S4 lands. The unification's
safety therefore **depends on the in-flight control-plane port delivering W7 and
S4** before the host-heal step ships.

---

## DECIDED (implemented)

The open decisions above are now **made and built** (branch `app-mesh-unify`).
The unified model shipped as a runtime-side adapter over the existing `sga`
Stage DATA lane — `meet.html` and the mesh control plane were NOT touched.

### The model, settled

- **A room = a mesh session. An app-share = a media-less room. A meeting =
  that room with the media plane switched on.** App state rides the mesh's
  Stage DATA lane (`GifOS.meetStageData`), never a second relay session.
- **App authority is a SIGNATURE SCOPE over app-state — owner-authoritative
  (model A), enforced by the app's OWNER key.** The owner (the seat that shared
  the app) holds an Ed25519 keypair; it signs every canonical `snap`/`delta`
  frame. Every participant verifies against the owner pubkey and rejects
  anything unsigned / impostor-signed / tampered. A client's write is an
  unsigned `act` PROPOSAL the owner validates (visibility + leadership) →
  applies → re-signs → broadcasts. **Non-owner-signed state is never canonical:
  a malicious seat can spam frames but cannot corrupt state.**
- **This authority NESTS in any room and is relay-free.** It is pure mesh-peer
  signature verification the relay never sees, so it works unchanged inside an
  open/anarchy meeting. The owner's authority is ONLY over app-state — it cannot
  ban meeting members or lock the room (that stays a relay-door concern).
- **A/V is strictly additive.** A standalone app-share opens no camera; lighting
  up the media plane leaves the app's owner-authority riding straight through.

### What was built (all in `site/js/`)

- **`app-owner.js`** — a pure, transport-free module: `createSigner()` (Ed25519,
  private key non-extractable, never leaves the tab), `makeVerifier(sid)` (pins
  the owner pubkey on first valid frame; binds it to the sid tail when the link
  commits to one — `room.<sha256(pk) prefix>`), a canonical serializer, and the
  snap/delta/op reducers. Node-testable, browser-loadable.
- **`runtime.js` → `becomeHost().attachStageBus(bus)`** (host side): tears down
  the redundant relay app-session, mints an owner signer, subscribes for `act`
  proposals (validated against collection visibility + the leadership fence,
  exactly as the relay host's `handleRpc` did), applies them to the
  authoritative store, and broadcasts owner-signed `snap` (app bytes + filtered
  state, retained by the lane for late joiners) and `delta` (state) frames on
  every db-change.
- **`runtime.js` → `bootClientBus(mountEl, {s,send,subscribe})`** (client side):
  renders the shared app from the sga lane instead of a relay session —
  verifies every frame's owner signature, mirrors owner-signed state, mounts the
  app iframe from the snapshot's app bytes, and sends the user's writes back as
  `act` proposals. Private collections stay per-tab and are never proposed.

### What was DELETED

- **The second relay app-session for app-in-meeting.** Clients now take the mesh
  bus (`bootClientBus`) — they never open the app's own relay session. The host
  side's relay app-session is **torn down inside `attachStageBus`** the moment
  the mesh bus is attached. App-state is no longer duplicated over the relay.

### Late joiner

Snapshot, as decided — not replay. The host's `snap` frame carries the app
bytes + the full visibility-filtered state and is **retained by the sga lane**,
which replays it to any subscriber on join (`meet.html`'s `sgaSnap`). Live
deltas keep it current after that.

### Verification

`test/mesh/e2e-app-owner.js` (protocol) and `test/mesh/e2e-app-mesh-wire.js` (the exact
runtime frame shapes over a simulated sga lane) both pass under Node, proving:
snap convergence, `act`-proposal round-trip, read-only refusal, **impostor-op
rejection**, tamper rejection, late-joiner snapshot, delete convergence, and
sid-bound first-frame binding. The full browser flow (iframe mount + IndexedDB
store + real mesh transport) still needs a stable WebRTC environment to exercise
end to end — `test/browser/e2e-meeting-app.js` loads the runtime cleanly but the
headless cross-participant meshing is flaky on the CI box (upstream of any app
code).

### Accepted limitations (per the decided scope — NOT bugs)

- **Owner away → writes pause.** Tearing down the relay app-session also retires
  its `AUTO_TAKEOVER` host-race for the meeting-app case. Host-slot healing over
  the mesh is the decided replacement but is **S4/W7-gated future work** (§6
  step 5); until then an owner leaving freezes app-state (acceptable for
  owner-centric apps; co-admin keys are future work). The app survives as the
  owner's saved GIF or any client's snapshot, and a new share re-mints an owner.
- **First-frame TOFU on healing-link sids.** For a meeting-app the sid is an
  opaque healing sid (no pubkey commitment), so the client pins the owner pubkey
  trust-on-first-valid-frame. An impostor racing the owner's first `snap` onto
  the lane could be pinned. This is the same first-pin/S4 exposure the meeting
  mesh already carries. The verifier ALREADY closes it for any sid that commits
  to the pubkey (`room.<sha256(pk)>`, tested). The clean close for the meeting
  path is a small **`meet.html`** change (below).
- **Heavy apps re-send app bytes in each retained snap.** Fine for the small
  sample apps; a per-record delta stream + a separate app-bytes frame is the
  optimization when a multi-MB app rides the lane.
- **Optimistic client writes** to shared collections show locally before the
  owner's signed echo; a refused op reverts on the next owner snap.

### Changes OUTSIDE my files that are needed / recommended (NOT made)

- **`meet.html` (recommended, would strengthen security):** carry the owner
  pubkey in the app ad (`myStatus.app.pk = r.attachStageBus(...).pk`) and pass
  it into `bootClientBus` params, so the client pins the owner key from the
  **authenticated ad** instead of TOFU — closing the first-frame race for
  healing-link sids. The runtime already returns `{pk}` from `attachStageBus`
  for exactly this.
- **`meet.html` (recommended, avoids a transient relay session):** pass a
  `mesh:true`/`noRelay` option into `becomeHost` so it skips `openHostSocket`
  entirely for a meeting-hosted app, rather than opening then immediately tearing
  it down in `attachStageBus`. Removes even the momentary relay app-session
  registration.
- **No mesh/relay/`gifos-net.js` changes were required** — the adapter rides the
  already-merged `sga` lane and `GifOS.meetStageData` API as-is.
