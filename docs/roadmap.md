# GifOS roadmap

Planned work that isn't built yet. Each item says **what**, **why it fits**, a
**sketch** of the approach, and the **open questions** still to settle. Nothing
here is committed to a release; it's the shortlist we've agreed is worth doing.

Guiding constraint: everything must survive GifOS's two non-negotiables — **no
accounts** and **no server that sees plaintext** (the relay is a zero-knowledge
greeter; healing-laws R2). A feature that needs a login or a trusted server is
the wrong shape until it's reworked to fit.

---

## 1. (removed as default) GifOS-operated media relay on free Meet

A **always-on GifOS TURN** for every meeting was REJECTED: default Meet media
stays peer-to-peer (plus friend-relay) — the meeting footer's promise.
Connectivity without our media servers: P1 friend-relay and better ICE.

**Still on the roadmap as opt-in paid products (not free default):**
- **§4c** — admin room points at a **customer-chosen** relay (corp brings the pipe).
- **§5b** — host **rents** a media-assist path via x402 when P2P fails (GifOS or
  partner operates assist; room is labeled; free/open rooms stay STUN-only).

## 2. General x402 support (HTTP-native, account-free payments)

**What.** Support the **x402** payment standard across GifOS — the open protocol
built on HTTP `402 Payment Required`: a server answers a request with `402` plus
machine-readable payment requirements, the client pays (typically a stablecoin
like USDC on an L2 such as Base) and retries with a payment proof header, and a
facilitator verifies settlement before the resource is returned. "General
support" means both **consuming** x402 (a GifOS app pays a metered API per
request) and **charging** via x402 (GifOS or makers).

**Concrete products that ride this primitive** (detail below):
- **§5** — Paid meetings (join tickets + optional rented media assist).
- **§6** — App store (free GIF downloads; optional in-app purchases + platform cut).

**Why it fits.** x402 is the most *GifOS-shaped* way to charge for anything:
payment is a **wallet signature, not an account**. No signup, no stored billing
identity — same posture as mesh identity (unforgeable key, not a login).

**Sketch.**
- **Platform runtime:** wallet connect (user-held), consent UI, spend caps, 402
  detect → pay → retry; sandboxed apps never see keys (same broker spirit as
  `gifos.api` / AI).
- **Charging Workers:** facilitator-backed verify/settle; mint **short-lived
  capabilities** (join ticket, download unlock, relay-minute grant) — not user
  balances.
- **Platform cut:** prefer **split / dual pay-to** (maker or host + GifOS
  treasury) so GifOS does not custody sale proceeds (Model B). No accounts.
- Wallet connection is client-side; GifOS custodies nothing.

**Open questions.**
- Sandbox + permissions + per-request consent (no silent drain).
- Chain / asset / facilitator (Base + USDC common default).
- Fee bps and public disclosure in lobby/store UI.
- First pilot: paid meeting join ticket vs store IAP vs both.

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
  devolution for vacated-admitter admission + reactive left-pack heal +
  vertical childOf-clear + **S1 column-clique** (heal/admit when row-right
  empty; `repro-hchain` leg F) is in sim + `mesh.js`. Q5 audits row+column.
  Remaining: self-wire-with-hint packaging, deeper multi-level vertical,
  full sweep soak after each land.

- **A — Loss wedge under ~10% packet loss (LIVE 2026-07-21).** Three-state
  occupancy empty / sitting-down / seated in sim + `mesh.js`. Soft sit on
  admit; joiner self-confirms; assigner recheck + soft TTL 90; row fill while
  head sitting-down OK; next row waits for head seated. Gate:
  `sim/repro-loss-wedge.sh` (loss=0.10 N=60 → ≥55 seated; was 5/60 phantom).
  Follow-ups: s1row gossip residual after mass S1 wipe; seed-10 sweep kill
  can leave S1 short under 15k converge ticks.

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

Also in that doc (§9): a **classic FPS** track where the mesh is **only**
connectivity + many peers (host-authoritative App GIF shooter) — not seat
geometry as the map. Separate from swap/Festival and from vote-off “Last One
Standing.”

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

### 4c. Admin rooms: customer-configured media relay

**What.** **Admin rooms only** can set their own **media relay** (TURN and/or
SFU endpoint + credentials policy) so ICE may use that path when direct P2P
and friend-relay are not enough. Covers **corporate / cross-firewall** meetings:
Company A and Company B never need a path to each other — only to the
**enterprise’s** (or its vendor’s) relay. Open/anarchic rooms stay unchanged:
STUN + friend-relay only; **no** GifOS-operated media relay (see §1 rejected).

**Why it fits.**
- Solves the dual-VPN/firewall case without making gifos.app a Zoom backend.
- Trust and compliance stay with the org that mints the admin room: they pick
  Cloudflare Calls, coturn in their VPC, Twilio, a partner SFU, etc.
- Admin room address already means **consent to authority**
  (`/meet/<room>/<verifier>`); extending that authority to “this room’s media
  assist endpoint” is the same consent shape.
- Keeps R2 for **our** relay: greeter only; A/V still must not ride
  `relay.gifos.app`. The media assist host is **not** the greeter DO.
- Complements **§5b** (rent assist via x402): §4c is BYO relay; §5b is pay
  GifOS/partner to rent one. Both stay **opt-in**, never free-default Meet.

**Sketch.**
- **Admin config (signed, room-scoped):** admin sets media-assist descriptor
  gossiped/sealed with other admin state — e.g. TURN URIs, username/cred
  mechanism (ephemeral REST mint via enterprise URL, long-lived secret never
  in the public link), optional SFU mode flag, “prefer P2P → friend-relay →
  configured relay” policy.
- **Join UX:** clear badge — “This admin room may use an organization media
  relay” — before camera on; link still works for guests from other companies
  without GifOS accounts.
- **Client ICE:** when room policy has assist configured, `gifos-net` /
  Meet adds those ICE servers (and SFU signaling if applicable) **for that
  room only**; default rooms keep STUN-only.
- **Fallback order:** direct → friend-relay (E5) → customer relay; never
  invent a GifOS global TURN.
- **Credentials:** prefer short-lived TURN REST credentials from an
  enterprise-controlled endpoint (admin points at their issuer); avoid putting
  long-lived TURN passwords in shareable URLs.
- **Mesh control plane unchanged:** seating, healing, Stage/Stadium packing
  still peer-side; assist only unblocks **transport** when paths fail (or
  when policy forces assist for compliance egress).

**Open questions.**
- TURN-only vs full SFU (SFU rewrites more of the media plane; TURN keeps
  mesh compositing, only fixes connectivity).
- How assist config is sealed/authenticated so a non-admin cannot point the
  room at a malicious relay (must bind to admin signature / verifier).
- Guest consent + enterprise allow-lists (some corps will only allow *their*
  relay hostnames).
- Credential mint CORS / broker: enterprise issuer may need the same
  third-party API / proxy patterns as other keyed services.
- Whether open-source “run this coturn” docs ship as the default enterprise
  path so nobody needs GifOS to sell media minutes.

## 5. Paid meetings (x402)

Third meeting class alongside **open** and **admin**: **paid**. Creation /
lobby UI lets a host configure money without GifOS user accounts. Free open
and free admin rooms remain the default product; paid is explicit and labeled.

### 5a. Charge to join (host pay-to + platform cut)

**What.** On create (or admin settings): meeting type **Paid** → host sets
**wallet address (pay-to)**, **price**, and **access duration** (e.g. 24h /
30d / open-ended “lifetime for this room epoch”). Joiners hit a **lobby**,
pay via x402, receive an **expiring join ticket**; only **valid payers** and
**room admins/hosts** are admitted. GifOS takes a **small cut** (split or dual
pay-to to treasury + host).

**Why it fits.** Ticketed webinars, office hours, Festival stages — wallet is
the ticket, not an account. Relay/greeter only checks a **capability** (not
full payment stack on every DO). Media stays P2P unless §4c/§5b assist is also
on. Subscriptions = **time-bounded entitlements** re-minted by a new payment
when expired (true autopay optional later).

**Sketch.**
- Create UI: Open | Admin | **Paid** (+ optional Admin+Paid combine).
- Lobby Worker: `402` → verify/settle (host + fee) → mint ticket
  `{ room, validUntil, jti, role? }` saved in the browser for rejoin.
- Relay: admit greeter path only with valid unexpired ticket (or admin proof);
  no global paywall on free rooms.
- Rejoin within window without paying again; expired → lobby renew.
- Optional: bind ticket to device id to limit casual sharing.

**Open questions.**
- Ticket sharing policy; refunds/revoke list (admin-signed).
- Host offline: mint must not depend on host browser (Worker).
- Exact fee bps and whether cut is optional for self-hosted deploys.

### 5b. Rent media relay when P2P fails (x402)

**What.** A room (typically paid or admin) may **rent media assist** — TURN
and/or partner path operated by GifOS or a contracted vendor — billed via
x402 (per minute, per room-hour, or pass). Used when direct P2P and
friend-relay cannot connect (dual firewall / hard NAT). **Not** the default
for open rooms; join UX must show that A/V **may** traverse rented infra.

**Why it fits.** Enterprise and mixed-VPN calls without forcing every corp to
run coturn (§4c remains BYO). Monetizes a real cost (relay bandwidth) without
breaking free P2P culture. Distinct from rejected §1 “silent TURN for all.”

**Sketch.**
- Room policy: `mediaAssist: rented` + grant from x402 (host prepays pool, or
  each participant pays assist minutes — product choice).
- ICE fallback: direct → friend-relay → **rented assist**.
- Separate hosts from `relay.gifos.app` greeter (R2: greeter still carries no
  media). Assist endpoints are dedicated media infra.
- Badge: “Organization / rented media assist may be used in this room.”

**Open questions.**
- Host-prepaid bucket vs per-guest assist fees.
- TURN-only vs SFU; data-retention / jurisdiction for enterprise buyers.
- Relationship to §4c when both BYO and rented are configured (precedence).

## 6. App store (GitHub catalog + free download + x402 IAP)

**What.** A **Home Screen app store** that lists GIF apps. Makers **submit**
apps (pipeline: PR / push into a **GitHub repo** you control — e.g. curated
`apps/` or `store/` catalog). Listed apps become installable from the store
UI on the desktop.

**Commerce model (decided):**
- **Downloads are free** — every listed App GIF installs without payment (discovery,
  remix, try-before-you-buy culture).
- **In-app purchases optional** — while running, an app may charge via x402 for
  extras (content packs, hints, premium modes, metered AI, etc.). Maker
  **pay-to** wallet + **platform cut** (split / dual pay-to). Runtime consent +
  spend caps; never silent charges.
- Paid **download** unlock is **out of scope** for v1 (can revisit later; free
  install is the rule).

**Why it fits.** Apps are files; free distribution matches Steal App / remix.
Makers monetize **value inside** the session, not the bit copy (which users can
duplicate anyway). No accounts: maker = wallet + git identity; payer = wallet.
Curated GitHub repo keeps review in a familiar PR workflow. Store is
**catalog + trust + IAP rail**, not a paid DRM gate.

**Sketch.**
- **Catalog source:** GitHub repo (manifest: title, blurb, icon, content hash,
  maker pay-to for IAP, fee bps, optional `capabilities` / screenshots; **no
  download price**).
- **Publish path:** maker PR with App GIF + listing JSON; CI checks hash / size /
  basic policy; merge → store index → Home Screen.
- **Store UI:** browse + **Install free** → GIF on Home Screen / chest.
- **Distribution:** static/Pages or free CDN/R2 get of bytes by content hash —
  no x402 on download.
- **IAP:** shell broker e.g. `gifos.pay` / 402 handling — “Pay $X to &lt;maker&gt;
  (GifOS fee Y%)?”; receipt unlocks in-app entitlement (local or maker-verified).
- Fully free apps (no IAP) remain first-class.

**Open questions.**
- Curation bar (signed makers only? theme-computer stores?).
- IAP entitlement storage (local-only vs maker server); restore on new device
  without accounts (receipt export / wallet-bound proof).
- Abuse: malicious GIFs that phish pays — review, report, delist, wallet block
  on IAP rail.
- Platform fee bps on IAP; self-hosted store mirrors with fee = 0.
