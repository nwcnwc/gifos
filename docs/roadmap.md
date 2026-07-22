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

- **V1 — Relay-detected stale client (version gate on knock).** A tab that has
  had `meet.html` open across a deploy keeps running the old wire/derivation
  code; today nothing tells it. Add `ver: GIFOS_VERSION` to the `knock` frame
  (a build string, not room content — no zero-knowledge cost, R2 still
  arbitrates nothing) and have the relay compare it against the version it is
  itself deployed with / a configured minimum. When the knocker is older, the
  relay answers the knock with a `stale` flag (still returning the greeter list
  — the relay must not *refuse* anyone, it only reports), and the client shows a
  modal: **Reload to the current version** or **Join anyway**. Reload does a
  cache-busting reload of `meet.html`; join-anyway proceeds unchanged so a
  pinned `/versions/<x.y.z>/` build is never locked out.
  Design notes / open questions:
  - Distinguish *incompatible* (DS derivation tag changed → old and new clients
    land in different relay sessions anyway, so "join anyway" is a lie) from
    merely *older* (cosmetic/bugfix). Incompatible should be a hard prompt with
    reload as the only useful action; carry the `DS` tag alongside `ver`.
  - Applies to seated peers too, not just knockers: an already-seated stale tab
    never re-knocks except on E3, so the E3 re-knock is the natural nag point.
  - Do not auto-reload mid-meeting without consent — a forced refresh drops
    media and the user's seat. Ask, always.

- **V2 — Operator system message (banner from the greeter package).** A
  hard-coded notice string in the relay source (`relay/src/relay.js`, changed by
  redeploying the relay — no dashboard, no storage, no API), returned in the
  `greeters` answer alongside `list` / `founded` / `admitted`. `meet.html`
  renders it as a dismissible banner at the top of the meeting page; the user
  ✕'s it to acknowledge and it goes away.
  - Payload: `{ id, text, level }` — `id` is a short slug the operator bumps
    when the message changes; `level` is `info` / `warn` for styling. Empty or
    absent ⇒ no banner (the normal state).
  - Dismissal is remembered **per `id`** in `localStorage`, so a re-knock or a
    reload does not resurrect a banner the user already ✕'d, but a *new* notice
    (new `id`) shows again. Same ✕ = close/dismiss convention as everywhere
    else — this is a dismiss, not a delete, so ✕ is correct here.
  - Text only; no HTML, no links executed from relay-supplied markup — the
    banner sets `textContent`. The relay is a greeter, not a content channel.
  - Composes with V1: the stale-client prompt is a *modal* (blocks join),
    the operator notice is a *banner* (never blocks). Distinct surfaces.

- **V3 — Home-page update prompt ("your gifos.app is behind").** The desktop
  (`site/index.html` / `boot.html`, running `window.GIFOS_VERSION`) can sit open
  for days across deploys. Compare the running `GIFOS_VERSION` against the
  **currently deployed** version — read from a tiny static file the deploy
  writes (e.g. `/site/version.json` `{ version, minSupported }`, fetched
  cache-busted on boot / focus / a slow poll). When the running build is older,
  show a popup: **"Your gifos.app is behind the current version — update now?"**
  with **Update** (cache-busting reload of the shell), **Later**, and a
  **"Don't show this message again"** checkbox.
  - "Don't show again" is remembered in `localStorage` **keyed by the target
    version** — so suppressing 0.7.0 → 0.7.1 does *not* silence the *next*
    version's prompt. (A blanket forever-mute is a footgun: the whole point is
    to move stragglers off a broken build. Per-version suppression keeps the
    nag honest.) Consider still forcing the prompt — ignoring the checkbox —
    when `running < minSupported` (a hard-incompatible floor, e.g. a DS flag
    day), since staying is not actually a safe choice there.
  - This is the **home/desktop** cousin of **V1** (which gates *meeting* join at
    the relay). V3 needs no relay: the answer is a static file next to the app.
    The two share the cache-busting-reload helper and the version-compare logic.
  - Note the existing `pin` redirect in `index.html:62` already sends a pinned
    `/versions/<x.y.z>/` load to its archive — V3 is about the *unpinned* live
    shell drifting behind, a different case; don't nag pinned archive loads.

- **V4 — Site-wide system message (banner from a static JSON file).** The same
  dismissible top-of-page banner as **V2**, but sourced from a **static JSON
  file in `/site`** (e.g. `/site/notice.json`) instead of the relay greeter
  package, and shown on **every first-party surface: the desktop/home
  (`index.html` / `boot.html`), `meet.html`, and `run.html`.** Nathan
  edits/commits that file (a push auto-deploys via Pages) to raise a notice;
  **when the file is missing (404), no banner is shown** — that is the normal
  state.
  - **Same formatting rules as the relay notice (V2), verbatim:** payload
    `{ id, text, level }`; `level` is `info` / `warn`; **`textContent` only, no
    HTML / no executed links** from the file; dismissal remembered **per `id`**
    in `localStorage` so a reload doesn't resurrect a ✕'d banner but a new `id`
    shows again; ✕ = dismiss (not delete), matching the shared convention.
  - Fetched cache-busted on load; a 404 or parse error is silent (no banner, no
    console noise beyond a debug line) — a missing/broken notice must never
    break any page.
  - **`meet.html` therefore carries TWO notice sources:** the relay operator
    notice (V2, from the greeter package — meeting-scoped, may differ per relay
    deploy) *and* the static site notice (V4, from `/site` — platform-wide). Two
    independent banners (independent `id` namespaces / dismissal keys). If both
    are live, **de-dupe: when the relay notice and the site notice are verbatim
    identical, show it only once; otherwise stack them** (site notice above
    relay notice, say). "Verbatim identical" = same `text` after trim (the
    signal is the message a user reads; don't require `id`/`level` to match,
    since the two authors won't coordinate slugs). When de-duped to one banner,
    a single ✕ dismisses it — record the dismissal under **both** sources' `id`
    keys so it doesn't reappear from the other source on reload. Don't otherwise
    collapse them — different authors and lifecycles, they only merge when the
    text truly coincides.
  - V4 is to the whole site what V2 is to the meeting; factor the banner render
    + per-`id` dismissal into **one shared helper** every surface (home, meet,
    run) calls, differing only in **source** (relay greeter package for V2's
    meeting banner vs static `/site` JSON for V4's site-wide banner). `run.html`
    and the home page have no relay, so they show only the V4 static notice.

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

**Authorization — how a member proves it may use the relay (Nathan, 2026-07-21).**

The premise to reject first: *the admin manually passes a token along.* Nothing
in GifOS should require a human to copy a secret into a chat box — and a token
pasted into the room is a bearer secret visible to everyone who is already in
the room anyway. So the rule is:

> **Authorization is admission.** Being seated in the admin room *is* the
> credential. The media-assist secret rides the **sealed admin state** that the
> mesh already gossips to admitted seats — it is delivered automatically on
> admission and is never in the shareable URL, never in a knock, never on the
> greeter relay. Do not invent a second identity system beside the room key.

That leaves only the question of *what* is sealed into the room. Three tiers,
increasing in cost and in blast-radius containment — ship T0, design toward T2:

- **T0 — static credential (ship first).** The admin's configured TURN
  username/password sits in the sealed admin descriptor. Simplest thing that
  works with an unmodified coturn. Leak = free relay for the leaker until the
  admin rotates. Acceptable *only* for a relay the org owns with bandwidth caps
  on it. Rotation is a config edit + re-gossip.

- **T1 — room-scoped ticket, redeemed by each client.** Sealed state carries an
  issuer URL + a short-lived, **room-scoped** ticket (TTL ≈ meeting length).
  Each client POSTs the ticket to the *enterprise's* issuer and gets back its
  **own** ephemeral TURN credential (standard TURN REST: `username =
  <exp>:<seat-pseudonym>`, `password = HMAC(secret, username)`). The
  long-term shared secret never leaves the issuer. Leak of the ticket is bounded
  by TTL, by a max-redemptions cap, and by per-credential bandwidth quota. This
  is the "temporary token for that meeting only" shape — the mesh does the
  passing-along, not the admin.

- **T2 — per-seat signed assertion (no bearer secret at all).** At room setup
  the org registers the admin room's **verifier / admin public key** with its
  issuer, once. Thereafter the admin signs `{room, seat, memberPub, exp}` with
  the key the admin-room address already establishes as authority, and the
  member presents that assertion to the issuer. The issuer's whole check is:
  signature valid under a registered key, room matches, not expired, not
  revoked. **Nothing secret ever transits the room**, credentials are per-seat
  (so the org's TURN logs attribute bandwidth to a seat, and revocation is
  per-member, not per-room), and a stolen assertion buys one seat until `exp`.

**Consequences worth stating up front:**
- **T2 needs a live signer.** If the only admin leaves, new joiners can't get an
  assertion. Mitigations: co-admins as signers, or a longer-lived
  *delegation* assertion signed once at config time that authorizes the room to
  mint per-seat creds. Existing members' creds are unaffected either way.
- **The issuer is not on the critical path.** Issuer down / CORS-blocked /
  rate-limited ⇒ fall back to direct → friend-relay (E5) and keep the meeting
  up. Assist failure must never be a join failure.
- **GifOS cannot police TURN abuse.** TURN has no concept of "this meeting";
  whoever holds a credential can relay arbitrary traffic until it expires. Per-
  credential quota, peer/permission restriction, and egress monitoring are the
  **org's** relay's job. Say so in the admin UI rather than implying we enforce it.
- **Privacy boundary.** The enterprise issuer learns room id + seat pseudonym +
  timing. It learns no media, no membership names, and the GifOS greeter relay
  learns nothing at all about any of this (R2 intact).

**Open questions.**
- Whether the T1 ticket and T2 assertion can share one wire shape so the client
  has a single "get me assist creds" path with a pluggable issuer.
- Seat-pseudonym stability across a re-seat / heal: a member who moves seats
  shouldn't have to re-mint mid-call (bind the assertion to identity, not `{pc,
  r, i}`).
- A reference issuer worth shipping: ~50 lines of Worker in front of coturn's
  shared secret, so "run this" is the default enterprise path.
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

### 4d. Subrooms / breakout sessions

**What.** A meeting can spawn **subrooms** — each a full, ordinary GifOS room
(its own stadium = its own relay session = its own URL and key, per the stadium
doctrine), linked back to a **parent** room. Two governance shapes matching the
two room classes:

- **Open rooms — grassroots subrooms.** *Anyone* can create a subroom and
  **share the link in chat**; others click to hop over. No authority, no
  assignment — it's just "spin off a side room and drop the link," the same
  freedom open rooms already give. The subroom is a normal room; the only new
  thing is the create-and-share affordance in the meeting UI.
- **Admin rooms — managed breakouts.** An **admin** auto-creates **N** subrooms
  at once ("Create 6 breakout rooms"), which appear **pinned in a side panel**
  (a **Breakouts** sidebar, sibling to the Chat sidebar). The admin can then
  **force-assign** participants — **random shuffle**, even split, assign-by-hand
  (drag a name into a room), reshuffle, and **"bring everyone back"** to the
  parent. This is the classic large-meeting break-out-session flow.

**Why it fits.**
- Subrooms are **not a new primitive** — each is already exactly a room. The
  mesh, seating, healing, media plane, chat, apps all work in a subroom
  unchanged. We're adding **relationship + orchestration**, not a new network
  object. Keeps the "no beefy node / one relay session per stadium" doctrine.
- Open-room grassroots subrooms are a **zero-authority** feature: share a link,
  done — no relay change, no signed governance. Ships first, cheaply.
- Admin breakouts extend the **existing admin authority** (`/meet/<room>/<verifier>`
  = consent to authority) with a new signed verb — the same shape as ban /
  setpw / votekick, so it rides the planned "door verbs → signed governance
  gossip" path (§3) rather than inventing a control channel.

**Sketch.**
- **Data model:** parent holds a signed (admin rooms) or chat-shared (open
  rooms) **breakout manifest** — a list of `{ label, roomUrl/key, assignments? }`.
  In admin rooms this is admin-signed room state gossiped to seats; in open
  rooms it's just links pasted in chat (no manifest, no authority).
- **Create:** admin action "Create N breakouts" derives N fresh room
  keys/URLs (reuse the normal room-create/derive path, `gifos-net.js` DS
  scheme) and publishes the manifest. Grassroots create = the normal
  "new room" flow surfaced as a chat action.
- **Breakouts sidebar (admin rooms):** panel listing the N rooms, occupancy
  counts, per-room "Join", and admin-only "Shuffle / Even split / Assign /
  Bring all back" controls. Row-styling and dismissal conventions match the
  Chat sidebar; row actions follow the standardized button set.
- **Force-assign = a directed request, not a kidnapping.** An admin assignment
  is signed room gossip telling client X "your breakout is room Y." The client
  **navigates itself** there (leaves the parent seat cleanly = ordinary
  leave/heal; knocks into Y). Media/seat can't be seized server-side — the
  relay arbitrates nothing (R2). So "force" = the client obeys a trusted admin
  instruction, with (design choice) a brief "moving you to Breakout 3…" toast;
  optionally a **soft** mode that *invites* rather than auto-moves.
- **Bring everyone back:** admin publishes "return"; assigned clients navigate
  back to the parent URL and re-seat. Same mechanism, reverse direction.
- **Return-home ergonomics:** subroom UI shows a persistent "← Back to main
  room" affordance so grassroots hoppers (open rooms) aren't stranded.

**Open questions.**
- **Identity / rejoin across the hop:** moving to a subroom is leave-parent +
  join-child; does the participant keep a stable pseudonym/identity across both
  (so the admin's roster and "bring back" can track them), and how does that
  interact with the per-seat identity (S4) — likely a meeting-scoped identity
  that spans parent+children, distinct from seat coords.
- **Parent liveness while empty:** if everyone breaks out, the parent stadium
  may go empty — does it stay "founded" (relay holds genesis, so return works)
  or must the admin/one anchor stay? Ties to the A4 founder-vanish reasoning.
- **Does an admin follow into a breakout** to moderate, and can they broadcast
  to all breakouts at once (a "10 seconds left" message fan-out to N rooms)?
- **Assignment privacy:** in admin rooms, is the full assignment map visible to
  everyone (who's in which room) or only to admins? Default: counts public,
  names admin-only unless the room opts to show them.
- **Nesting / limits:** cap N (media + socket budget across N relay sessions);
  forbid or allow breakouts-of-breakouts (probably forbid v1).
- **Paid/§5 interaction:** do breakouts of a paid room inherit the join ticket,
  or is each a free child? (Likely inherit — same meeting epoch.)

### 4e. App-driven media layout (apps place Stage / Row / Stadium tiles)

**What.** Let an **app running in a meeting** control the **on-screen placement
and transform of the live video tiles** — the Stage strip, the Row tiles, the
Stadium tile — instead of the fixed grid. Today the media plane decides where
each face draws (`media-plane.md`: Stage strip, Channel-R row tiles, one Stadium
tile). Expose that as a **layout seam** an in-meeting app can drive: give me the
set of live tiles as movable, positionable, transformable objects and let the
app say *where each one goes and how it's drawn.* The wild version: an app that
lets you **drag row-mates' heads onto cartoon bodies**, or **arrange faces on a
building and launch Angry-Birds at them** — the meeting's real faces become game
sprites.

**Why it fits.**
- The media plane already **owns tile identity and compositing** (who's on
  Stage, row tile order, the single Stadium tile). This is a **presentation
  seam over data the plane already computes** — apps read a tile roster + drive
  placement; they never touch transport, seating, or the mix-minus audio fold.
- Extends the in-meeting app model (Stage DATA lane, `app-mesh.md`) from
  *content beside the faces* to *content that arranges the faces* — the
  strongest possible "the meeting is a canvas" statement, and a genuine
  GamePigeon-beater: live-video party games no message-transport toy can do.
- Reuses the **presence seam** already sketched in §4b (avatars): consumers see
  `MediaStream`/frames, not SDKs. Layout is the same seam, one level up — where
  the frame draws, not what the frame is.

**Sketch.**
- **`gifos.stage` / `gifos.presence.layout` API (in-meeting apps):** the app
  gets a **live tile roster** — `[{ tileId, seat:{pc,r,i}, kind:'stage'|'row'|'stadium', name, stream/frameSource }]` — plus **subscribe** for
  join/leave/step-up churn. The app supplies a **placement**: per-tile
  `{ x, y, w, h, rotation, z, shape/mask, opacity }`, or hands back a draw
  callback and GifOS renders each tile's current frame into the app's canvas.
- **Two render modes:** (a) **overlay** — app positions the plane's own tile
  DOM/canvas nodes (cheap, keeps GifOS compositing); (b) **frame handoff** —
  app receives each tile's frames and draws them itself (heads-on-cartoons,
  masks, physics), GifOS just supplies pixels + audio stays on the normal fold.
- **Audio is untouched.** Layout moves *pixels*; mix-minus, Stage ear, and the
  per-packer audio fold (`media-plane.md`) are unchanged. Muting a face's video
  into a sprite does not change who you hear. (Design: does a "launched" head go
  silent, or keep talking off-screen? Probably keep audio — it's a visual game.)
- **Local-only by default; shared is opt-in.** The layout an app paints is a
  **local view** (my screen arranges the faces my way) unless the app uses the
  Stage DATA lane to **sync** placement so everyone sees the same board (a real
  multiplayer game vs. a personal toy). Consent + a "this app is rearranging
  video" trust chip, like camera/mic capabilities.
- **Degrade gracefully:** a tile whose stream drops (leave/heal, primary goes
  dark per `media-plane.md`) must not crash the app — the roster event removes
  it; the app decides (sprite vanishes, ragdoll falls, etc.).

**Open questions.**
- **Consent to be a sprite:** can a participant refuse to have *their* face
  dragged onto a cartoon / launched? Likely a per-user "allow apps to restyle my
  tile" toggle; admin rooms may force or forbid it.
- **Overlay vs frame-handoff perf:** frame handoff is a per-tile video→canvas
  copy every frame — CPU/GPU budget on phones (ties to §4b's CPU concern).
  Maybe cap frame-handoff to Stage + own row (O(C) tiles), never the whole
  Stadium.
- **Scope of control:** may an app move the **Stadium** tile (the far-field
  aggregate) or only Stage + Row (near field)? Moving Stadium is mostly
  cosmetic; near-field is where the games live.
- **Fairness / no-hijack:** an app must not use layout to *hide* who's speaking
  or fake presence (someone drawn as "gone" who is really there). Trust chip +
  maybe a always-available "show me the real grid" escape hatch.
- **Recording / screenshots:** faces-as-game-sprites raises the same consent
  questions as any A/V capture; inherit the meeting's existing capture policy.

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

### 5b-1. GifOS-sponsored Cloudflare TURN, rented per-period, verified on-chain (no DB)

**What.** The concrete GifOS-operated instance of §5b: a **Cloudflare TURN**
(Cloudflare Calls TURN / Realtime) that an **admin rents by the period** (day /
week / month) with **x402**. The design constraint that shapes everything:
**the TURN admission check keeps NO database.** It does not store who paid, does
not track sessions, does not phone a billing API per connection. It answers one
question — *"is there a paid, unexpired rental for this room right now?"* — by
**reading the blockchain**, and it caches that answer for a short window.

**Why it fits.** §5b says "GifOS may operate rented assist"; this is the *how*
that stays true to the project's spine — **derive/verify, don't keep server
state** (same instinct as the greeter relay's zero-knowledge registry and the
"admission IS the credential" rule in §4c). No accounts, no payments DB, no
per-user secret store to breach or subpoena. Rent is a fact on a public ledger;
the TURN is a stateless reader of that fact.

**Mechanism — payment as an on-chain, self-describing entitlement.**
1. **Rent.** Admin hits an x402-gated "Rent GifOS TURN" flow (lobby Worker).
   Payment settles to the **GifOS treasury** on Base (USDC). The settlement is
   made **self-describing** so a reader can later recover *what* was bought
   without a side DB. Two candidate encodings (pick in design):
   - **On-chain marker (preferred): a tiny purpose-built rental contract.** The
     x402 payment calls `rent(roomCommit, periods)`; the contract records
     `paidUntil[roomCommit] = max(now, paidUntil) + periods·PERIOD` and takes
     the fee. State is one mapping: **commitment → expiry timestamp.** That is
     the "DB," but it lives on-chain and the TURN only *reads* it.
   - **Event/memo encoding (no custom contract): ERC-20 transfer + calldata /
     an emitted event** carrying `roomCommit` and `periods`; the reader sums
     valid payments to a room's commitment. Cheaper to ship, more work to read
     (scan + validate amount ≥ price·periods).
2. **roomCommit is a commitment, not the room.** It is
   `H(roomVerifier ‖ salt)` — public on-chain, but it does **not** reveal the
   join link or room key. The admin proves rental by presenting the
   pre-image binding (sealed into admin state, per §4c) so the client's TURN
   credential request can be checked against `roomCommit` **without** the room
   id ever appearing on-chain in the clear.
3. **TURN admission = read + short cache.** When a client asks the TURN edge
   (a Cloudflare Worker fronting Calls TURN, or coturn's REST auth hook) for a
   credential:
   - Client presents `{ roomCommit, seatAssertion }` (the §4c per-seat signed
     assertion — reused verbatim, so **members are authorized by admission**,
     not by holding the payment).
   - Worker checks a **cached** `paidUntil[roomCommit]`; on cache miss it does
     **one** chain read (contract call or indexed event query) and caches the
     expiry with a TTL of a minute or two.
   - If `now < paidUntil` **and** the seat assertion verifies → mint a
     short-lived TURN REST credential (`username = <exp>:<pseudonym>`,
     `password = HMAC(turnSecret, username)`), `exp` clamped to
     `min(assertionExp, paidUntil, now+shortTTL)`. Else `402`/deny → client
     falls back to friend-relay.
   - **No write. No session row. No payment record.** Restart the Worker and it
     re-derives everything from the chain.

**What this buys us.**
- **Statelessness end to end.** The only durable state is the on-chain expiry
  mapping and the static `turnSecret` in the Worker's env. Nothing to migrate,
  nothing to lose, nothing to breach that isn't already public.
- **Rent is publicly auditable.** Anyone can verify a room's rental status;
  GifOS cannot silently over-bill or deny a paid period.
- **Renewal is idempotent.** A second `rent()` just pushes `paidUntil` further;
  no subscription state machine, no autopay lock-in (autopay can be a client
  cron that calls `rent()` before expiry — optional, later).

**Consequences / hard edges to state up front:**
- **Chain-read latency & cost.** Per-connection chain reads are a non-starter;
  the short-TTL cache is load-bearing. Under a flash crowd the cache carries it,
  and worst case is a ~2-minute lag between an on-chain rent/expiry and the edge
  honoring it — acceptable for a rental, not for a paywall that must be exact.
- **Grace at the boundary.** A credential minted at `paidUntil−10s` outlives the
  rental by its TTL. Fine (it's a courtesy tail); just clamp `exp ≤ paidUntil`
  if we want a hard cut, at the cost of dropped media exactly at expiry.
- **Reorg / finality.** Read at a small confirmation depth; a reorged-away
  `rent()` that already minted creds is a rounding error we eat (bounded by the
  short cred TTL). Don't gate minting on deep finality — it would add minutes.
- **TURN abuse is still the operator's problem (us, here).** Unlike §4c BYO,
  *GifOS* runs this TURN, so **we** own the per-credential bandwidth quota,
  peer/permission restriction, and egress caps. Price the period to cover the
  bandwidth cap, not "unlimited."
- **Privacy.** On-chain: a commitment, a period count, a fee — no room id, no
  members, no media. The chain reveals *that a room was rented and for how
  long*, nothing about who or what was said.
- **Reader is not on the critical path.** RPC down / rate-limited / cache
  cold-and-slow ⇒ client falls back to direct → friend-relay → (BYO §4c if
  configured). Rented-assist failure is never a join failure.

**Open questions.**
- Custom rental contract vs event-scan encoding — contract is cleaner to read
  and cheaper per-query but is code to write/audit/deploy; event-scan ships on
  a bare ERC-20 transfer but pushes validation into the reader.
- Which RPC / indexer the Worker trusts (Cloudflare's own, Base RPC, a light
  indexer) and how to avoid a single-provider dependency for the read.
- Whether per-period rent and §5b's per-minute metering coexist, or per-period
  is simply the shipped shape of §5b (I lean: this *is* §5b's v1).
- Cloudflare Calls TURN's own auth model vs fronting it with our Worker — does
  Calls let us issue our own short-lived creds, or must we proxy?
- Refund / early-cancel: on-chain rent is non-refundable by default; is that the
  stated policy, or does the contract support a `cancel()` clawback of the
  unused tail (adds state + a refund path)?

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
