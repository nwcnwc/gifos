# GifOS roadmap

Planned work that isn't built yet. Each item says **what**, **why it fits**, a
**sketch** of the approach, and the **open questions** still to settle. Nothing
here is committed to a release; it's the shortlist we've agreed is worth doing.

Guiding constraint: everything must survive GifOS's two non-negotiables — **no
accounts** and **no server that sees plaintext** (the relay is a zero-knowledge
greeter; healing-laws R2). A feature that needs a login or a trusted server is
the wrong shape until it's reworked to fit.

---

## 1. (removed) TURN relay tier

A paid TURN tier was sketched here and REJECTED: TURN is a media relay
SERVER, and GifOS media goes peer-to-peer, never through a server — the
meeting footer's promise and the design's non-negotiable. The connectivity
answer for hard NATs stays within the rules: the P1 friend-relay (media
through a MUTUAL FRIEND's browser) and better ICE, not a server.

## 2. General x402 support (HTTP-native, account-free payments)

**What.** Support the **x402** payment standard across GifOS — the open protocol
built on HTTP `402 Payment Required`: a server answers a request with `402` plus
machine-readable payment requirements, the client pays (typically a stablecoin
like USDC on an L2 such as Base) and retries with an `X-PAYMENT` header, and a
facilitator verifies settlement before the resource is returned. "General
support" means both **consuming** x402 (a GifOS app pays a metered API per
request) and **charging** via x402 (a GifOS service).

**Why it fits.** x402 is the most *GifOS-shaped* way to charge for anything:
payment is a **wallet signature, not an account**. No signup, no stored billing
identity, no server that has to remember who you are — exactly the no-accounts
posture the whole system is built on. It turns "paid features" from an
architectural contradiction into a clean, per-use, holder-of-a-key model that
mirrors how the mesh already thinks about identity (an unforgeable key, not a
login).

**Sketch.**
- **Charging side (server):** a facilitator-backed 402 gate. A metered-service cred
  Worker (item 1) is the first customer — answer `402` with the price, verify the
  `X-PAYMENT` settlement, then mint the ephemeral service credential. Same pattern
  generalises to any future metered GifOS service.
- **Consuming side (apps):** a small runtime shim so an App GIF can call an
  x402-gated endpoint — on a `402`, surface the payment requirement to the user,
  pay from their connected wallet, retry with the header. Must run inside the
  app sandbox's existing network-permission model (`runtime.js`), so a paid call
  is still subject to the same allow-list and consent as any other fetch.
- Wallet connection is client-side and user-held; GifOS custodies nothing.

**Open questions.**
- **Sandbox + permissions.** How an x402 payment prompt composes with the app
  permission model and the "apps can't call the GifOS origin" rule — payment
  endpoints are third-party by definition, so this should slot into the existing
  network allow-list, but the UX of a per-request charge inside a sandboxed app
  needs design (consent, spend caps, no silent draining).
- **Chain / asset / facilitator** choice (Base + USDC is the common default) and
  whether to run our own facilitator or use a hosted one.
- **No-custody guarantee.** Keep GifOS entirely out of the money path — it
  brokers a 402 and verifies a receipt; it never holds funds or keys.
- (item 1 was rejected; the first pilot service is TBD — any metered GifOS endpoint fits this pattern.)
  x402 there before generalising to app-to-app metered calls.

## 3. Mesh follow-ups (carried from `option-a-plan.md`, deleted 2026-07-18)

### Priority (Nathan, 2026-07-20) — do in this order

**E (Q2 compaction) → D (H-CHAIN) → A (loss wedge) → B (E5 friend-relay /
pick-one).**

Rationale: compaction and H-CHAIN pack and heal the tree; the loss wedge (A)
may shrink once those land and is **not** to be freestyled before them. B is
product-settled: friend-relay among co-members (LIVE); newcomer who sees two
meetings **picks one** (R5) — never silent merge via sole-bridge.

### Items

- **E / Q2 — Compaction via atomic moves (LIVE in sim + mesh.js; self-duty).**
  A settled deep LEAF that sees a strictly-better vacancy above initiates an
  ordinary ATOMIC MOVE (law T) by probing **its own** up-chain — it asks
  parent/peers to place *itself* better if they can see a densifying slot.
  **Self-duty only (Nathan):** never orders other seats to move. Hysteresis
  (COMPACT_SETTLE / period / leaf-only / rightmost-in-row). Gate:
  `sim/repro-compaction.sh` GREEN. Remaining for E: optional home-LAN soak /
  battery inclusion; not a greenfield build.

- **D / H-CHAIN — designation chain (PARTIAL LIVE).** Row-clique multi-level
  devolution for vacated-admitter admission + reactive left-pack heal is in
  sim + `mesh.js` (`repro-hchain.sh` GREEN). Remaining: vertical recursion,
  S1 column clique, Q5 small-N audit, full sweep soak.

- **A — Loss wedge under ~10% packet loss (PARKED behind E/D).** Diagnosed:
  lost PLACE leaves a phantom `s1seen` row head; resurrection hands FINDs to a
  never-seated admitter; room caps at ~5 seats. Two law-touching fixes tried
  and rejected (firstHandLive gate wrecks healthy convergence; PLACE TTL never
  reaches the cell). Nathan: prefer E/D first — they should not make A worse
  and may reduce pressure. Do not implement A candidates without a fresh call.

- **B / E5 — Friend-relay + pick-one (LAW ADOPTED, refined).** No paid
  media/data relay server. **Co-members** of one chosen meeting may use
  friend-relay ("via Hub") when ICE fails. A **new joiner who can see two
  meetings** is offered **join A or join B** (R5) — they must not become the
  automatic bridge that merges both (attacker who engineered sole visibility).
  Forced merge-by-count forbidden. Drill for §1: `e2e-peer-relay-reunion.js`.

- **A4 — Founder dies mid-founding (CLOSED by design, Nathan 2026-07-20).**
  The second joiner does not need the founder's process to stay alive: the
  relay already holds genesis admission (`H(gk)`), and later knockers with the
  matching key join the existing instance. A vanished founder is an ordinary
  leave/heal of seat `0/0.0`, not a stuck "founded but unjoinable" room. Do
  not re-open unless a repro shows the registry stuck with no genesis and no
  greeters while `founded` lies.

- **e2e-video "via Hub" peer-relay leg (known flake / investigate under B).**
  Historically timed out at the ICE-blocked pair; the dedicated E5 drill is
  the focused gate. Media-plane investigation if that drill fails.

- **F2 (column-major deep seating) — standing caveat (2026-07-18):** Section-1
  admission is ROW-major by law (healing-laws H7 row-fill): the media plane's
  near field is row-scoped, so the first C people in a room MUST be row-mates
  (the old column-first spread seated a 2-person meeting as column-mates with
  zero direct media). F2, if ever built, applies to DEEP sections only, and
  must still keep each partially-filled row dense before opening the next —
  media first, cross-link earliness second.

The mesh-v2 plan doc (`docs/option-a-plan.md`, in git history) is retired: its
design (11a fixed-designation healing, W7 rook's graph, first-hand liveness,
S4 identity) shipped — `site/js/mesh.js` is the faithful port of the green sim,
and the media plane (Stage/Stadium, cross-link + multi-subscribe redundancy,
mix-minus) is live. What it still owed, verbatim but renumbered:

- **Sharded greeter registry** — N bootstrap Durable Objects sharing one
  genesis so a flash crowd fans across shards instead of one ~30-socket DO;
  client shard-select + backoff, thundering-herd proof in the sim first.
- **Door verbs off the relay** — move `ban` / `setpw` / `votekick` onto the
  mesh as signed governance gossip; today they are the relay's last
  non-greeting duties (they don't violate R2's "arbitrates nothing", but they
  are a residual path to retire).
- **Standalone app-share bus swap** — standalone (outside-a-meeting) app
  sharing still rides the relay broadcast bus (`runtime.js` `t:'bcast'`);
  swap it to a headless mesh node per `app-mesh.md`. In-meeting apps already
  ride the mesh Stage DATA lane.
- **Final greeting-only relay audit** — after the two items above, delete every
  remaining non-greeting relay path and prove the relay carries only knock +
  first-greeter handshake.
- **Seating compaction** — covered by Q2 self-duty (above); residual is soak /
  scale, not a second design.
- **Scale verification + release** — 500-bot multi-region swarm of the routed
  mesh, home-LAN real-device pass, then cut a versioned release
  (`scripts/archive-version.sh`).

## 4. Meeting agency & presence

Product-facing mesh features that do not change the fair-share / no-beefy-node
doctrine. Design depth for games and social rooms lives in
[`docs/mmog-ideas.md`](mmog-ideas.md); this section is the roadmap pointer.

### 4a. Voluntary seat swap / pool / tide

**What.** Let two (later N) living occupants **mutually** exchange seats; then
generalize to **affinity pools** (teams/friends with standing consent) and a
**Rally vs Shuffle (Tide)** liquidity market so people who want to sit together
and people who want a random new seat complete each other. Pair swap is the
primitive; pools and tide are product on top.

**Why it fits.** Mesh seating is deliberately unpredictable (heal, admit,
compaction) — reliability must not be player-authored geometry. Players still
need agency for co-location and games without **auto power-seating** (adversaries
would farm strong hardware into heavy coords; media plane forbids a beefy node).
Consented occupancy trades preserve empty-only claim / no silent eviction while
unlocking MMOG and festival play. Full write-up: **`docs/mmog-ideas.md` §§3–7**
(pair swap, pools, Rally/Shuffle, game catalog). Related foundation already
**LIVE:** law T atomic moves (`doMove`, dual-hold, tombstone) for
empty-destination / heal motion — swap is the bilateral occupied-cell cousin.

**Sketch.**
- Sim + `mesh.js`: pair **lease** on `(coordA, coordB)`; dual claim-before-vacate
  under mutual signed accept; healers must not treat leased cells as holes;
  rollback on expiry/contradiction; churn-matrix repro (swap∩kill, S1↔leaf).
- UI: “Switch seats with…”; later pool join with intent tags Together / Anywhere
  / Stay; Stage-hosted Tide rounds optional.
- Never: unilateral claim of a live seat, device-power ranking, or drafting
  non-consenting peers.

**Open questions.**
- Match lease visibility to designated healers without new long-range RPCs.
- Rate limits so pools cannot thrash the tree during heal storms.
- Whether affinity may only **hint** empty-destination compaction (still not
  power-based) — default no until proven safe.

### 4b. Avatar + voice filters (replace live A/V feed)

**What.** A participant may **replace their camera (and optionally reshape
their mic)** with a chosen **avatar** presentation and **voice filters**, while
remaining a first-class seat on the same media plane (row / Stage / Stadium
still composite and forward whatever they publish). Presence is configured once
on the desktop and **piped into Meet and any App GIF that supports avatars**.

**Why it fits.** Privacy, accessibility, low-bandwidth / no-camera contexts,
playful Festival/MMOG identity, and civil rooms where faces are optional — without
a media server or accounts. Sender still enforces blur/consent rules on whatever
pixels leave the device; receivers never strip a “real” face out of an avatar
track. Aligns with camera-optional meetings and data-optional social modes in
`mmog-ideas.md`.

**Sketch.** Full brief: **[`docs/avatar-presence.md`](avatar-presence.md)**.
- **Settings:** reuse **Third-party APIs** for optional vendor keys (HeyGen
  LiveAvatar, D-ID, LemonSlice, …); user picks provider + an **avatar
  description file** (`gifos.avatar/1` JSON / GIF) they own. Keys never enter
  sandboxed apps (same broker discipline as `gifos.api` / AI).
- **Runtime presence seam:** adapters turn description + credentials into a
  `MediaStream`; Meet/`gifos.presence.*` consumers only see tracks/frames — not
  each vendor’s SDK. Local/static avatars work with **no** third party (v1).
- **Video path:** camera | avatar renderer → same `replaceTrack` / ship paths
  as blur and stage park; packers and friend-relay need no special case.
- **Audio path:** optional AudioWorklet filters (or later provider-linked voice)
  before publish; mix-minus / Stage ear unchanged.
- **UX:** Avatar on/off, description file, voice preset, trust chip (“avatar”);
  pause metered cloud sessions when backgrounded / not useful.

**Open questions.**
- Trust signaling: when is “this is an avatar” mandatory vs cosmetic.
- CPU budget on phones; $/min cloud avatar spend UX.
- Blur/consent vs avatar-as-silhouette; admin rooms that require a real camera.
- Token mint via `brokerApi` vs trusted-origin WebRTC SDK for streaming vendors.
