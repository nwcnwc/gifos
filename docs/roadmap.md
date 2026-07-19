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

- **Compaction via atomic moves (2026-07-19, design agreed with Nathan).** A seat
  that observes strictly-better vacancies above — a shallower seat, or joining an
  occupied row instead of sitting in a lone-row section — initiates an ordinary
  ATOMIC MOVE to the frontier (normal admission, S4-signed, transit lease, grace
  over the media hop); the up-seat/parent is the natural admitter with the
  freshest frontier view. Hysteresis: move only on stable strict improvement,
  rate-limited, so boundary oscillation never sloshes seats. Payoffs: kills
  persistent lone-row deep sections (the sdn mirror's one provable no-route
  case becomes transient-only), removes wasted depth/latency in shrinking
  rooms, and packs the tree the stadium metaphor always assumed. Depends on:
  law T (atomic moves) landing. Queue position: after the healing amendment.

- **Headless-row admission gap — CLOSED (2026-07-18).** The head cell's
  admitter didn't exist after a head's goodbye, so a racing joiner seated DEEP
  (or as a permanent column-mate via the lone-survivor resurrection misfire)
  and re-seating rode the drain/FIND cadences. Fixed by the H7 headless-row
  rule (healing-laws.md): own-row first-hand liveness + admission duty of a
  vacated head DEVOLVES to its fixed H2 healer `(0,r,1)`; the vacated head of
  a live row is heal territory, never an admission target. Silent death
  deliberately stays behind the H1-S1 ring-hold. Pinned repro:
  `sim/repro-headless-row.sh` (RED before, GREEN after); e2e-video's "room
  survives its creator" leg green inside its 25s window. (En route, fixed the
  seated-greeter false-lockout: mesh-wire's onLocked now fires for JOINING
  seats only — R6 scope.)

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
- **Seating compaction** — route newcomers to the shallowest hole via the
  echo-immune live signal (sim-first; the fragmentation fix).
- **Scale verification + release** — 500-bot multi-region swarm of the routed
  mesh, home-LAN real-device pass, then cut a versioned release
  (`scripts/archive-version.sh`).
