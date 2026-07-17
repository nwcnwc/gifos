# Apps on the mesh (migration design)

Status: **DESIGN — not yet implemented.** Written during the overnight run of
2026-07-17 per the directive: *"update the app-run functionality of the meeting
to ride the meeting infrastructure, and completely update app-run to have the
exact same mesh even when not running inside a meeting."* Companion:
`docs/healing-laws.md` (the mesh), `docs/media-plane.md` (media over it),
`docs/meet-security.md` (R2: the relay is a greeter registry, not a transport).

## The one idea

**A meeting and an app-share are the same object: a mesh session.** A meeting is
a mesh session that carries media; an app-share is a mesh session that carries
**app-state deltas** instead of (or alongside) media. Same greeter registry,
same bounded seats `{pc,r,i}`, same room-wide gossip flood, same healing laws.
Today they are two different transports; they must become one.

## Where we are (two transports — the problem)

1. **App INSIDE a meeting** (`site/meet.html` `runApp`/`stopApp`): the meeting
   already runs a real mesh node (`mesh.js`+`mesh-wire.js`), and app control
   (`appstop`, host handoff) rides `sendSig` — so it already prefers DC →
   sponsor-forward → relay-bootstrap (R2-clean). BUT the app's shared **state**
   (the collections an app reads/writes) still flows through the standalone
   app-sharing machinery below, i.e. the relay. So an app in a meeting is only
   half on the mesh.

2. **STANDALONE app-share** (`site/js/gifos-net.js` + `site/js/runtime.js`): a
   GifOS app opened outside a meeting syncs its collections over the **relay
   WebSocket (P2)** as a bandwidth-capped broadcast bus, with DataChannels (P1)
   as an opportunistic fast path. This is exactly the relay-as-transport-proxy
   R2 forbids: the relay routes every delta (ongoing room traffic, not just the
   greeting introduction it is scoped to) and is a DoS/scale ceiling. It must go.

## Target architecture

Every shared app — in a meeting or not — is backed by a **headless mesh node**
keyed by the app-session id:

- **Session key.** `deriveMeet(appSessionSecret)` → `{sid, tok, K}` exactly as a
  meeting does (derive-don't-send). The relay holds only `H(genesis key)` + the
  TTL'd sealed greeter list for that sid. No app data ever touches the relay.
- **Seating.** Participants take bounded seats `{pc,r,i}` under the same C=5
  healing laws. An app-share needs no media, so it never opens camera tracks and
  never runs the packer — just the control mesh + gossip.
- **State transport = mesh gossip.** An app-state delta is a `seat.gossip(payload)`
  flood: exact-once, room-wide, over the tree's own bounded links (DC, sponsor-
  forwarded where needed) — the same lane chat/status/votes already use in a
  meeting. Anti-entropy on join replays the backlog (the `_gspReplay` hook that
  already hands an admitted newcomer the gossip history), so a joiner converges
  its collections without a relay fetch.
- **App ON STAGE (meeting):** unchanged from `media-plane.md` — the app occupies
  a Stage slot and its state is fanned down the Stage path as a data stream; the
  strip composites only the A/V stagers. This is already a gossip/broadcast of
  state, so it becomes a thin wrapper over the same primitive.

Result: the relay is a pure greeter registry for apps too. Deltas ride the mesh;
the operator sees ciphertext + a hash.

## Concrete seam (traced 2026-07-17 — the migration is a BUS swap, not a rewrite)

The app transport is **host-authoritative over a relay bus**, and the two are
orthogonal — so gossip replaces the bus with the consistency model untouched:

- **Host** (`runtime.js` `boot`→`becomeHost`): holds the DB, broadcasts state
  deltas with `ws.send({ t:'bcast', msg })` (lines ~1707, ~1900); the relay fans
  to every client. Opportunistic P2P DCs (`createOffer` ~1652, `channel.onmessage`
  ~1639) are a fast path over the same logical bus.
- **Client** (`bootClient`, ~1978): a `steadySocket(role=client)`; receives the
  host's `bcast`, sends writes UP to the host with `ws.send({ t:'to', to:host })`.
- **The seam:** abstract `{ bcast(msg), to(peer,msg), onMessage(cb) }` out of the
  raw socket. Default binding = today's relay socket (zero behaviour change).
  Injected binding (in a meeting) = `bcast → meshNode.gossip({app:sid, m})`,
  `to → a directed mesh control send to the host seat`, `onMessage → onGossip`
  filtered by `app:sid`. **Host stays the sole writer** — gossip is just the pipe.

This means the risky part is NOT the distributed-systems model (unchanged); it's
the mechanical extraction of the socket seam across host+client+DC-fast-path
without regressing the ~100s of existing apps. That extraction needs a real
multi-participant app-sync e2e test (two `meet.js` participants, one
`runAppForTest`, assert the other's DB converges over gossip with NO new relay
`role=host` session) — runnable headless, but it must exist and pass BEFORE this
ships, because runtime.js is the whole app platform. Not something to land
unverified at the tail of an autonomous run.

## Migration steps (do NOT do at 4am — sequence for a fresh session)

1. **Extract the app-state lane.** In `runtime.js`, replace the relay-broadcast
   send/recv of collection deltas with `meshNode.gossip(delta)` /
   `onGossip(delta)`. Keep the collection CRDT/merge logic untouched — only the
   transport swaps. Behind a flag so both paths coexist during rollout.
2. **A headless mesh node for standalone apps.** Factor the meeting's node
   bring-up (`createMeshNode` + the DC signaling glue in meet.html: `sendSig`,
   the `k:'sig'|'fsig'|'mesh'|'fmesh'` DC dispatch, `connsOf`/sponsor picking)
   into a reusable module — call it `site/js/mesh-app.js` — that meet.html and a
   standalone app page both consume. No media, no packer.
3. **Point app-in-meeting at the meeting's own node.** When an app runs inside a
   meeting, its deltas gossip over the EXISTING meeting mesh (no second session)
   — an app share among the same people is free.
4. **Retire the relay app-broadcast.** Once (1)-(3) ship and bake, delete the
   relay's `t:'gossip'` fan-out and restrict `t:'peer'` to the greeter handshake
   — then the relay is structurally greeters-only (the last piece of the R2
   lockdown, which is currently deferred precisely because apps still need it).
5. **Tests.** A Node harness like `flood.js` but gossiping app deltas: N nodes
   join an app session, each writes a collection, assert every node converges to
   the same state with zero relay data frames.

## Why this is safe and small, done right

The mesh, gossip flood, anti-entropy, sponsor-forwarding, and healing already
exist and are proven (harness + swarm). This migration is almost entirely a
**transport swap** for one lane plus a **refactor** to share the node bring-up —
not new distributed-systems machinery. The risk is in the details of the
node-bring-up extraction (signaling glue), which is why it wants a careful
session, not the tail of an overnight run.
