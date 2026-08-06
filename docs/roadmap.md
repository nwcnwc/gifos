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
  `test/sim/repro-compaction.sh` GREEN. Remaining for E: optional home-LAN soak /
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
  `test/sim/repro-loss-wedge.sh` (loss=0.10 N=60 → ≥55 seated; was 5/60 phantom).
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
  had `run.html` open across a deploy keeps running the old wire/derivation
  code; today nothing tells it. Add `ver: GIFOS_VERSION` to the `knock` frame
  (a build string, not room content — no zero-knowledge cost, R2 still
  arbitrates nothing) and have the relay compare it against the version it is
  itself deployed with / a configured minimum. When the knocker is older, the
  relay answers the knock with a `stale` flag (still returning the greeter list
  — the relay must not *refuse* anyone, it only reports), and the client shows a
  modal: **Reload to the current version** or **Join anyway**. Reload does a
  cache-busting reload of `run.html`; join-anyway proceeds unchanged so a
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
  `greeters` answer alongside `list` / `founded` / `admitted`. `run.html`
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
  (`index.html` / `boot.html`), `run.html`, and `run.html`.** Nathan
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
  - **`run.html` therefore carries TWO notice sources:** the relay operator
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

- **G1 — Presence holdover for throttled phones (SHIPPED to edge 2026-07-25,
  commit 61dfc80; gate `test/browser/e2e-away-holdover.js` — 12 checks green).**
  As built: `stHold(pid)` in run.html — fresh <15s stays the rule everywhere,
  then a 60s holdover while the last pulse said `away: true` or transport
  vouches (`p.connected`); applied to roster/in-meeting and to consent
  (**Nathan's call 2026-07-25: an away phone's prior deliberate consent
  STANDS** — expiry past 60s is the privacy backstop for hard-frozen phones,
  and departure still deletes the status so holdover cannot revive the dead).
  Votes: an away device sits out ENTIRELY — standing votes and `need`
  denominator leave together (symmetric, so away ≡ briefly leaving and can't
  manufacture a majority); `need` = majority of the engaged room
  (`participantCount()` minus explicitly-away devices). Sender side: the meet
  heartbeat AND the mesh-wire tick (seat.tick / 55s greeter keepalive / 12s
  zombie watchdog) are clocked by a one-line Blob Worker — worker messages
  escape background DOM-timer chunking, so an app-switched phone beats at true
  cadence and greets at full fidelity; a fully frozen renderer remains the
  mesh's/E3-reopening's case. Historical design notes below.
  Observed on the pi monitor 2026-07-25: a locked Android phone blinks out of
  the roster for one ~5s snapshot every 25-30s, `ghosts` toggling in sync, and
  in a seatless half-state the participant count itself bounced 2↔1. Cause:
  the **15s freshness rule** gates roster/tiles (`freshConsent`), the
  in-meeting id set, stage-seat validity, and vote counting, and it assumes
  the hidden-tab heartbeat (12s — "still inside every 15s freshness window",
  `run.html` heartbeat comment) always lands inside it — but Android
  lock-screen intensive throttling defers page timers into 25-60s chunks, so
  every pulse gap evicts the phone: tile churn for everyone, the consent
  `(x/n)` line bounces, and since `rosterIds` feeds `leafCount()` the count
  flap wobbles the vote-majority `need` denominator too.
  **Why this is bigger than cosmetics (10-phone walkthrough, 2026-07-25):**
  phones whose owners walk away screen-off become *limbo lurkers* — the held
  mic capture keeps them connected (mesh liveness correctly refuses to kill a
  live link), but their throttled pulses fail every 15s gate. Two confirmed
  consequences beyond the blinking: (1) **password rooms re-blur for
  everyone** — `allConsent()` demands a FRESH consenting pulse from every
  seated peer, so one pocketed phone flaps the whole room between clear and
  blurred every ~30s; (2) **governance deadlocks** — vote tallies count only
  fresh voters but `need` is a majority of `participantCount()`, which keeps
  counting connected-but-away phones, so 5 of 10 pocketed ⇒ need 6 > 5 live
  and no vote can pass. (Hard-dead phones are fine: ICE failed → sweeper →
  D5 → heal converges the mesh on the real humans in ~1-2 min. The stage
  already self-heals — a stale stager is auto-evicted.) The honest
  `away: true` pulse (sent on visibilitychange before the freeze) plus the
  `peerAway()` hard-freeze fallback are the coherent signal: away/holdover
  peers should leave the vote `need` denominator, and the consent question
  below decides the re-blur.
  **Principle:** the 15s gate conflates *recent gossip* with *process alive*.
  Where there is direct transport evidence, a stale pulse must not evict —
  `alive()` already ORs `fresh || p.connected || fhLive(v)`; the
  roster/consent/stage gates don't. Sketch:
  - Keep 15s as the "fresh" bar; add a **holdover (~60s)** that keeps a peer
    in roster/tiles/count when the last status flagged `away: true` (the
    honest visibilitychange broadcast already sent before the freeze) OR
    transport is live (`p.connected` / open DC / relayed feed / seated occ).
    Tombstones override instantly — `meshGone`, explicit leave, votekick;
    grace never revives a confirmed departure ("a stale status must not haunt
    the room's consensus" still holds — holdover extends *presence*, never
    resurrects it).
  - UI: dim the tile / an "away" glyph instead of removing it — communicate
    the pocket, don't churn the grid.
  - **Votes stay strict 15s** (scale-guard doctrine: under-count votes, never
    the room). The `need` denominator stabilizes via the count fix alone.
  - Stage: a staged phone keeps its C-capped seat through the holdover;
    eviction only at expiry.
  - Sender side (complementary, lesser half): beat immediately on Page
    Lifecycle `resume` / `pageshow` (visibilitychange already beats on
    return); a Worker-hosted heartbeat is tempting but Android freezes the
    whole renderer, so receiver-side grace is the robust half.
  Gate: a drill (`e2e-throttled-phone`) that stalls one peer's heartbeat ~40s
  with its DC left open — roster and count must hold, zero blinks; then cut
  the transport too — eviction lands at holdover expiry, not before. Plus the
  pi-monitor sweep (`connY < participants-1` windows) staying clean with a
  locked phone in the room.
  Note: Picture-in-Picture (SHIPPED to edge, gate `e2e-pip`) already shrinks
  this window on Android — a page with an open PiP overlay is exempt from
  Chrome's intensive timer throttling, so a phone that app-switches (rather
  than locks the screen) keeps its heartbeat inside 15s. G1 still matters for
  the locked-screen / dismissed-float cases.
  Open questions:
  - Exact holdover length vs the mesh E-timers — must stay well under E3 so
    the mesh's own death detection still wins.
  - Does *consent* hold through away? (Prior consent stands and the camera is
    dark anyway, but it's a privacy call — review before building.)
  - Do relayed feeds count as transport evidence? (`alive()` already says
    yes via `fhLive`.)

- **G2 — Phone power: a meeting must not out-drink a charger (STARTED, first
  wave SHIPPED to edge 2026-07-26; commits 1e7456e / 29b6858 / 9eba60d; gates
  `e2e-vis-park` 13 green, `e2e-pip` + `e2e-away-holdover` re-green).**
  Field event (2026-07-25): a Moto in a 3-person locked room drained FASTER
  THAN ITS CHARGER and died plugged in. Code audit found the watts:
  (1) **No codec preference was ever set** → Chrome↔Chrome negotiated VP8,
  which is SOFTWARE (libvpx) encode on most phone SoCs — and ENCODES = LINKS
  means one encoder per row-mate (2 in that room, up to 4 on a full row).
  (2) The sender-side **blur pipe painted + encoded at full capture size and
  full rung bitrate** — blurred-by-default is the privacy steady state, so
  outside a fully-consented password room this is the camera path.
  (3) The 15Hz metro Worker ticked forever once created, even subscriber-less.
  (4) A **hidden phone kept every mate encoding video at it** — G1 holdover
  makes pockets first-class members, so N pocketed phones = N invisible
  encoders on every sender, for the whole meeting.
  **Shipped (edge):** H.264-first `setCodecPreferences` on every video m-line
  (hardware encode on essentially every phone — Android CDD mandates it;
  per-pair SDP, no flag day) + `debugDump().power` forensics (negotiated
  codec, `encoderImplementation`, `qualityLimitationReason`, 10s cache);
  blur pipe capped at 480w/320w with blur radius scaled (identical look,
  ~4-9x paint and ~4x encode-input savings) + blurred mains floored to
  250kbps; metro Worker terminated when its last subscriber leaves;
  **hidden-viewer dormancy** — a hidden tab asks each mate to PARK the main
  video it sends ({k:'vis'}, media-plane demand law applied to mains; PiP
  float source stays hot, audio NEVER parks, recording disables it, transport
  rebuild resets it, old clients ignore it).
  **Verify on the Moto (edge + a day of normal rooms):** `debugDump().power`
  must show `video/H264` + an OMX/c2 hardware impl (NOT libvpx/OpenH264) and
  `limit` ≠ 'cpu'; then the real test — charge level must RISE while sitting
  in a 3-person room. The pi monitor eval path reads it remotely.
  **Wave 2 SHIPPED (edge 2026-07-26, commits f868865 / 5515f79):** Float
  button (gesture-backed PiP — Android auto-PiP is chrome-gated, a tap is
  not) + fixed the enterpictureinpicture handler clobber; **battery tiers**
  (Nathan's rule: on battery = 1 rung lighter, <50% = 2, <25% = 3 + 15fps
  cap; no Battery API (iOS) = tier 0) — `debugDump().battTier`; **camera
  idle-stop** (20s of camOff stops + removes the hardware track — sensor/ISP
  fully off for join-quiet phones; lateMedia re-grabs on tap, ~0.5s);
  hidden-tab meters at 900ms. All probe/gate verified (e2e-vis-park,
  e2e-away-holdover ALL PASS).
  **Wave 3 SHIPPED (edge 2026-07-26, commit 1b04bc0)** — after the Moto
  drained 30%→2% overnight ON ITS CHARGER: phones are tier ≥1 always (one
  rung down even plugged in); charging-but-level-falling = emergency tier 3;
  a PARKED phone (3 min no touch/no speech) releases the wake lock (screen
  rests; audio/presence/worker beats carry on) and floors the rung — any
  tap/word/return restores. `debugDump().powTier`. Plus the fullscreen
  FILMSTRIP view (big feed + tappable thumbs of stage/row-mates/stadium/me).
  **PRODUCT PRINCIPLE (Nathan 2026-07-26): battery savings are BASELINE,
  always-on behavior — not a mode.** Screen brightness is the USER's dial
  (set for their environment; a dimmed screen in sunlight is unusable) and
  we never touch it — parked mode only releases the wake lock so the OS's
  own screen policy applies to an unattended phone. Brand goal: GifOS Meet
  known as the battery-friendliest call platform.
  **Not done (needs Nathan / next wave):**
  - *Compositor duty on phones:* packer duty follows the SEAT (topology law).
    A phone that seats as a head runs packers + aux encodes. Duty-aware
    seating bias (phones prefer leaf seats?) is a LAW change — sim-first,
    Nathan sign-off. Packers are already demand-gated + governor-capped, so
    this is the smallest of the four; measure before designing.
  - *Concurrent HW encoder sessions:* budget SoCs cap ~2-4 simultaneous
    hardware encodes; a full row + stage may overflow back to software for
    the overflow senders. `power` forensics now make this VISIBLE per-sender
    (mixed impl names = overflow). If observed: cap mobile MAIN encodes and
    let the composite/tree carry the rest (media-plane already supports it).

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
app say *where each one goes and how it's drawn.* The wild versions: an app that
lets you **drag row-mates' heads onto cartoon bodies**; **arrange faces on a
building and launch Angry-Birds at them**; or a **classic memory / concentration
game overlaid on the Stadium** — the far-field faces are **covered by tiles**
you flip two at a time, trying to remember who is underneath and match pairs.
The meeting's real faces become game sprites (and, for the memory game, hidden
game state).

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
- **Scope of control:** may an app move/mask the **Stadium** tile (the
  far-field aggregate) or only Stage + Row (near field)? Not purely cosmetic —
  the **memory game covers Stadium faces** and reveals them, so an app needs to
  address the individual faces *inside* the Stadium aggregate, not just the one
  composited tile. That may mean exposing the Stadium's constituent sub-tiles
  (or a per-face id list) to the layout API, which the far-field packer today
  folds into one tile — a real question for how far the seam reaches into the
  media plane. Near-field (Stage + Row) is the cheap, always-available case.
- **Hidden-info games need real occlusion, not just z-order.** A memory game is
  only fair if a covered face is **actually not rendered** while hidden (you
  must not be able to peek by reading the underlying video element / a
  screenshot / devtools). Frame-handoff mode gives this for free (GifOS only
  hands the app frames it chooses to draw); an overlay-mode "cover" that just
  stacks a tile on top is peekable and unfit for hidden-info play. So hidden-info
  overlays likely **require** frame-handoff.
- **Fairness / no-hijack:** an app must not use layout to *hide* who's speaking
  or fake presence (someone drawn as "gone" who is really there). Trust chip +
  maybe a always-available "show me the real grid" escape hatch.
- **Recording / screenshots:** faces-as-game-sprites raises the same consent
  questions as any A/V capture; inherit the meeting's existing capture policy.

### 4f. Meeting party games (flagship default apps)

**What.** Ship a set of **multiplayer games designed for a live meeting** — apps
that ride the Stage DATA lane and use the room roster, chat, and (optionally
§4e) the video tiles. Headliner, **must-have**:

- **Draw & Guess (the classic drawing game).** One player draws on a **shared
  canvas** (extend the existing **Paint** default app, `sample-apps.js`) from a
  secret prompt; **everyone else races to guess** by typing, with **team play**
  and scoring. Round timer, drawer rotation, word list + custom decks, points
  for guesser *and* drawer, "close!" near-miss hinting optional. This is the
  canonical video-meeting party game and a flagship demo of "the meeting is a
  platform."

Beyond the headliner, the same slot fits **charades** (act it on camera, others
guess — leans on §4e to spotlight the actor's tile), **trivia/buzzer**,
**Codenames-style word grids**, and the GamePigeon-parity quick games
(Checkers, Battleship, Word Hunt, 8-Ball) noted under §3/GamePigeon comparison.

**Why it fits.**
- In-meeting apps already ride the **Stage DATA lane** (`app-mesh.md`) with a
  shared `db`/collection model (see Chess/Connect-Four/Chat default apps) — a
  drawing game is a shared **stroke stream** + **guess stream** + **score doc**,
  nothing new in the network model.
- **Paint already exists** as a default app with a shared `canvas` collection;
  Draw & Guess is Paint + turns + a hidden prompt + a guess/score loop. Highest
  payoff for least new primitive.
- It's the sharpest answer to "GamePigeon but for a whole live room": a
  real-time, N-player, in-video game no message-transport toy can do — and it
  showcases teams, chat, timing, and (with §4e) the faces themselves.
- Party games are proven GifOS territory (the **IRL Games** folder:
  Fake Facts, One Clue, Wolves, …) — this extends that instinct from
  in-person/pass-the-phone to the **live remote meeting**.

**Sketch (Draw & Guess specifically).**
- **State:** `strokes` (append-only, the canvas — reuse Paint's model),
  `guesses` (chat-like stream, but the app judges them against the hidden word),
  `game` doc (`round`, `drawer`, `word` *revealed only to the drawer*, `phase`,
  `timer`, `teams`, `scores`).
- **Secret word to the drawer only:** the prompt must reach *just* the current
  drawer, not the guessers — same hidden-info discipline as §4e's memory game.
  Either the app derives per-round who may read `word` (client-enforced with the
  drawer's identity) or the drawer's client generates the word locally from a
  shared seeded deck + round index (no secret ever on the wire). Prefer the
  latter — **derive, don't send** — so a peeking client can't read the answer.
- **Judging:** guesser types in a guess lane; the drawer's/authority client
  matches against the word (normalize case/space, fuzzy for near-miss),
  awards points, advances phase. No server — an elected round-authority (the
  drawer, or a rotating host) writes the score doc; others verify against the
  same deck.
- **Teams & rotation:** team assignment doc; drawer rotates round-robin across
  teams; scoreboard sidebar. Reuse the row-styling / sidebar conventions.
- **Timer:** shared countdown in the `game` doc; end-of-round reveal.
- **Composes with §4e:** charades/act-it modes spotlight the actor's video tile;
  Draw & Guess can float the canvas over the Stage. Not required for v1 (Draw &
  Guess works as an ordinary app panel), but the seam is there.

**Open questions.**
- **Anti-cheat on the hidden word:** derive-locally is peek-proof but means the
  drawer's deck and round-index must be authoritative and unforgeable; how does
  a late joiner sync the deck position without learning past/future words early?
- **Round authority election:** who writes scores if the drawer drops
  mid-round — fall to host, or a deterministic next-seat rule (ties to the
  mesh's existing leave/heal).
- **Word decks:** ship a default deck; allow custom decks (a maker submits a
  deck app via §6 store?); age-appropriate / room-configurable content.
- **Guess channel vs meeting chat:** separate lane (so guesses don't spam chat)
  or reuse chat with app-side judging? Probably separate lane, with correct
  guesses echoed to chat.
- **Scope:** is 4f a curated first-party pack, or mostly a **showcase** proving
  the §6 app-store + §4e seams so the community builds the long tail? (Lean:
  ship Draw & Guess first-party as the flagship; let the rest be store apps.)

### 4g. Screen sharing (rides the Stage channel)

**What.** Let a participant **share their screen** (a window, a tab, or the whole
desktop) to the whole room by publishing it on the **Stage** — the existing
chosen-≤C broadcast tier. Stepping up to "Share screen" claims a Stage seat and
swaps the sharer's Stage video source from their camera to a
`getDisplayMedia()` capture; the screen is composited and fanned down the same
Stage path as a face, and reverts to the camera on stop. Rendered in a
**dedicated, large region** (like an app on Stage), not as one square in the A/V
strip.

**Why it fits.** The Stage feed is already **source-agnostic** — a stager's
outbound is built by `mySelfStream()` (`site/run.html:6135`) wrapping
`sentVideoTrack()` (`:2433`) plus the mic, shipped up-tree as `stg:<myId>`
(`:7105`/`:7142`), composited at Section 1 and fanned down. Nothing on that path
cares whether the video track came from a camera, and a `getDisplayMedia` track
is structurally identical to a `getUserMedia` one. Three pieces already exist:
- **`getDisplayMedia` is wired up** for the recorder (`site/run.html:8022`,
  `scope:'app'`) — capture/permission/`onended` handling to copy.
- **The ship re-fires on track change** by design (`shipMos`, `:6161`;
  media-plane doc: "re-ships exactly when a track actually changes"), so a
  cam→screen `replaceTrack` propagates with no renegotiation.
- **The architecture already anticipated non-camera Stage occupants.**
  `media-plane.md` Channel St: *"An APP on Stage carries a DATA stream, not A/V …
  renders in its own dedicated UI region."* Screen-share is the pixel-valued
  sibling. It also **reuses the source-substitution seam of §4b** (avatar): both
  are "publish something other than the raw camera on the same `replaceTrack` /
  ship paths." No new infrastructure — one composited fan-down stream occupying
  one of the ≤C Stage seats, honoring the no-beefy-node / fair-share doctrine.

**Sketch.**
- **Source swap:** while sharing, `sentVideoTrack()` / `mySelfStream()` yields
  the display track instead of the camera; the `stg:` ship re-fires
  automatically. Follows the existing "stagers live on the Stage only" rule
  (main cam/mic senders parked via `refreshOutbound`, `:2465`).
- **Aspect ratio (the one real gotcha):** the Stage strip is a `kind:'band'`
  composite where each cell gets a **centered-square cover-crop**
  (`site/js/mesh-media.js:99`, `coverBox` at `:47`) — feed it a 16:9 screen and
  it discards ~40% of the width, text gone. The engine already has the fix:
  `kind:'frame'` draws **aspect-preserved contain, never cropped** (`:92–96`).
  So this is a per-cell "contain, don't cover" flag, not new code.
- **Readability → dedicated region:** a screen sharing 1/C of a 756px-wide strip
  is unreadable. Model it on **app-on-Stage** — occupy a Stage seat but render
  **big in its own area**, with the A/V strip staying contiguous for the
  remaining stagers.
- **Camera coexistence:** simplest (Zoom-style) is screen *replaces* the sharer's
  Stage video and their camera tile hides while sharing. Screen **and** face at
  once means a second aux feed (`stg:` carries one video track) — doable, more
  work, defer.
- **Audio:** `getDisplayMedia` can capture tab/system audio; the Stage aux feed
  already carries audio with edge mix-minus (`stageEar`, `:6115`), so system
  audio can ride along (usual echo caveats).
- **Step-up/stop:** reuse the Stage step-up/cap logic; stop the display track,
  restore the camera as the Stage source (or step down).

**Open questions.**
- **Dedicated-region layout** vs the strip: where the big screen sits relative to
  the A/V strip, the row, and the Stadium; how it reflows on phones (portrait).
- **Face + screen simultaneously** worth a second aux feed, or is
  screen-replaces-face enough for v1? (Lean: replace for v1.)
- **Mobile capability:** `getDisplayMedia` is absent/limited on iOS Safari and
  restricted on some Android Chrome — feature-detect and hide the control
  (as the recorder already does via `canScreenRecord`, `:7950`).
- **Consent / trust chip / recording:** a "sharing screen" indicator to the
  room; inherit the meeting's existing capture/recording consent posture; admin
  ability to allow/forbid guest screen-share (same shape as group blur / cam-off).
- **Interaction with §4e** (app-driven layout): a shared screen is another
  placeable tile the layout seam could arrange.

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

**SHIPPED (2026-08-01) — v1: browse + free install.** The store itself is
live; only the IAP rail below is still unbuilt.

- **Catalog source:** THIS repo, not a separate one. `apps/<slug>/listing.json`
  (author, tagline, long description, releaseDate, **categories**, tags,
  license) beside the app's own `manifest.json`; `scripts/build-app-catalog.mjs`
  composes the published `site/apps/index.json` + `site/apps/<slug>/app.json`
  (adding bytes, sha256, cover, signature claim) and renders `cover.jpg` from
  the source screenshot. Same-origin was the deciding factor: a catalog on
  another host means CORS, which is the one failure `desktop.js` already
  apologizes for.
- **Store UI:** `site/store.html` + `js/store.js` — grid, category filter,
  search, listing page, **Install — free** → the icon lands on the Home Screen
  via `desktop.js`'s `saveItem` (the store never places an icon itself).
  Reachable from a seeded `appstore` system launcher, the GifOS ▾ menu, and
  ＋ Add. Public links: `/store` and `/store/<slug>`.
- **THE COVER RULE:** the store never references an App GIF as an image —
  Chess is 8 MB, and a grid of real GIFs would download the catalog to paint
  one screen. Covers are JPEGs; the GIF crosses the wire exactly once, on
  Install. `e2e-app-store.js` asserts this by counting network requests.
- **Distribution:** GitHub Pages, straight from `site/apps/`. The catalog
  carries each app's sha256 and the store checks the download against it (and
  against the manifest's appId) before writing anything.

**Still to build (the commerce half).**
- **Publish path:** maker PR with App GIF + listing JSON; CI checks hash / size /
  basic policy; merge → store index → Home Screen. (Today the catalog holds
  first-party certified apps only, and `--check` is the CI gate.)
- **Seed the catalog: port existing GitHub apps.** The store's cold-start
  problem is inventory, and the inventory already exists — GitHub is full of
  self-contained browser apps and games that are one packaging step away from
  being App GIFs. Batch-port a curated set (license permitting, credited,
  linked back) and list them.
  - **The example that sets the bar: Hop.Earth** (@DVLPLONDON, announcement at
    3.9M views): a browser three.js driving game where the world is generated
    around you in real time from OpenStreetMap data + satellite elevation —
    click anywhere on the planet, "Hop Here", and drive. Single-player is
    exactly our solo app posture; its multiplayer mode is *"Create race →
    share the link → friends race you"* — which IS the GifOS invite flow, so
    a port gets lobby/link/mesh for free from the runtime instead of running
    its own share plumbing. An app like this in the store is the demo that
    explains GifOS in one install.
  - **Second example: putt.day** (by ell.dev, models Kenney CC0) — Wordle for
    minigolf. One hole a day, the same for the whole world, only your first
    attempt counts; slingshot input; a shareable Wordle-style score card;
    previous holes playable from a calendar. It is already GifOS-shaped to the
    letter — no accounts, no tracking, streak lives in the browser and dies
    with it — EXCEPT for its one server: the live leaderboard + ghost trails
    of other players' balls. A port keeps the daily hole + score card as a
    solo app (deterministic hole from the date seed) and moves the social
    layer onto app rooms: your foursome IS the room, ghosts and leaderboard
    ride the mesh, no server at all. Global-strangers ghosts are the only
    part that genuinely wants a server — a friends-circle version is arguably
    the better game anyway.
  - Diligence per port: license allows redistribution; offline behavior honest
    (Hop.Earth needs OSM/elevation tiles — a `network` capability listing, the
    same honest degradation as Bible Browser); credit + upstream link in the
    listing; size within store norms.
- **IAP:** the whole x402 rail below.
- **IAP:** shell broker e.g. `gifos.pay` / 402 handling — “Pay $X to &lt;maker&gt;
  (GifOS fee Y%)?”; receipt unlocks in-app entitlement (local or maker-verified).
- Fully free apps (no IAP) remain first-class.

**Open questions.**
- Curation bar (signed makers only? theme-computer stores?). The two
  first-party apps are now **signed by gifos.app** (verified in the browser on
  install), so a "signed makers only" bar has a working reference; the open
  question is the policy for **third-party** makers — self-signed + reputation,
  a GifOS counter-signature, or domain-key proof.
- IAP entitlement storage (local-only vs maker server); restore on new device
  without accounts (receipt export / wallet-bound proof).
- Abuse: malicious GIFs that phish pays — review, report, delist, wallet block
  on IAP rail.
- Platform fee bps on IAP; self-hosted store mirrors with fee = 0.

### 6a. Catalog seeding: port MIT-licensed open source at scale

**What.** A deliberate push to **fill the store fast** by turning popular
**permissively-licensed** open-source projects — MIT above all, plus BSD /
Apache-2.0 / ISC — into self-contained GifOS **App GIFs**. The web is full of
finished, well-loved apps whose license already says "use it however you want,
just keep the notice"; the effort is to package as many as run cleanly in the
sandbox as we can. It rides the emerging **"AI software app store"** moment —
teams open-sourcing their products (e.g. an agentic CRM under MIT) and
directories springing up to index AI-built apps (hub.grok.me, dappit.io,
mor.org) — except a GifOS listing is a **portable file you own**, offline and
sandboxed, not a link to someone's server that dies when they stop paying for it.

**Why it fits.**
- A store's cold-start problem is inventory; permissive licenses give a huge,
  legally-clean supply we can ship without asking permission (attribution kept).
- App GIFs are the ideal container for "a whole app you keep" — self-contained,
  runs offline, sandboxed, shareable as one file — a stronger claim than a
  hosted directory entry.
- The port work is exactly what makes an app **sandbox-honest** anyway (vendor
  every asset, no CDN at load, state in `gifos.db`, network only via the
  manifest allowlist), so seeding doubles as hardening.
- It composes with §6's publish path and the AI-porting trend: a coding agent
  can do most of a port mechanically, so "as many as possible" is realistic.

**Sketch.**
- **Candidate list:** curate by license (permissive), self-containability
  (client-side, or a backend whose API can ride `gifos.fetch` + a declared
  host), and appeal (stars / a category we're thin in). Keep it as a tracked
  list in the repo, not tribal knowledge.
- **Port recipe (per app):** vendor all assets INTO the GIF (no CDN, web font,
  or remote image at load — the one hard sandbox rule); swap `localStorage` /
  IndexedDB / cookies for `gifos.db`; route any live data through `gifos.fetch`
  with the hosts declared in `manifest.capabilities.network` (proxy for
  no-CORS public APIs); drop or client-side-reimplement server-only features.
  Land it as an ordinary `apps/<slug>/` source tree + built GIF through
  `scripts/build-app-catalog.mjs` — same pipeline as the first-party apps.
- **License hygiene (non-negotiable):** carry the upstream `LICENSE` / copyright
  INSIDE the GIF (as chess-grandmaster ships `COPYING-stockfish.txt`) and
  surface **upstream license + source link + original author** in the listing.
  Prefer permissive so the port stays freely usable; a GPL port is allowed but
  stays GPL (chess-grandmaster is the precedent) and must say so.
- **Authorship / signing:** a first-party port can be **signed by gifos.app**
  (store shows ✓ signed) while the listing still **credits the upstream
  author** — the signature is provenance of the *packaging*, not a claim of
  original authorship. Ties to §6's curation-bar question.
- **Scale via agents:** a repeatable port checklist plus the sandbox test
  harness makes this a fan-out job — point coding agents at the candidate list,
  one port each, gated by "runs offline in the sandbox, license carried, catalog
  `--check` green."
- **Upstream the packaging (PR the build back):** once a port works, open a PR
  to the **source repo** adding the GifOS build recipe — a small `gifos/`
  target (manifest + `build.mjs` + the pack step) that produces the App GIF from
  *their* source. This turns a one-way take into a **contribution**: the
  upstream project can then build and ship its own GifOS artifact on every
  release, the port stops being a fork frozen in a GIF (it rebuilds from source —
  the antidote to the drift question below), and the PR itself is a distribution
  channel (a "Run it on GifOS" badge / link in their README reaches their whole
  audience). If they merge, GifOS becomes a first-class build target upstream;
  if they decline, we keep our own `apps/<slug>/` port. Either way the recipe is
  identical, so the PR is nearly free once the port exists. Keep the PR narrow
  and additive (a new folder + a README line), never a rewrite, so it's easy to
  accept.
- **Sell the upside to the owner (in the PR):** the PR / port README should
  make the pitch — packaging as a GifOS App GIF hands their app capabilities
  that normally need a backend, **for free and with no server**:
  - **Multiplayer with one invite link.** Declare a shared collection
    `read-write` in the manifest and keep its state in `gifos.db`; an invite link
    then live-syncs that state peer-to-peer (direct WebRTC + relay fallback),
    host-authoritative. For an app already built around shared state, that *is*
    the multiplayer story — no realtime service, no accounts.
  - **Offline** — app and data run in airplane mode (precached shell).
  - **Persistence with no database** — `gifos.db` keeps state inside the icon;
    nothing to host or operate.
  - **The app is a file the user owns** — sharing the GIF shares the app *and*
    its saved data.
  - **Brokered AI / third-party APIs** — `gifos.ai.*` / `gifos.api` let the app
    use the user's own keys without ever seeing them.
  - **Runs inside a Meeting** — launched in a GifOS meeting, an app gains shared
    audio/video/recording around it without touching the camera (the sandbox
    blocks live media itself, by design).
  Keep it **honest**: there is no cloud and no automatic cross-device sync —
  state reaches others only via a live invite link or by sharing the GIF file
  ("saved on this device inside the GIF"), never "syncs to the cloud."
- **Owner-signing instructions (ship them with the PR):** include a short
  how-to so the **repo owner signs the built GIF with their OWN key** — then it
  verifies as **✓ signed by their-domain.com** (or their email), not gifos.app,
  which is the honest provenance for an app they authored. The whole flow
  already exists in [`site/sign.html`](../site/sign.html) (attaches to
  `GifOS.sign`, `site/js/gifos-sign.js`), entirely in-browser, no upload/account,
  two paths:
  - **Domain** — generate an Ed25519 key in the page, publish the public half at
    `https://<their-domain>/gifos.key` (served with CORS), then "Sign &
    download". The key location is derived from the domain, so "signed by it"
    means they control it.
  - **Email / PGP** — download the statement, `gpg --detach-sign --digest-algo
    SHA256 gifos-statement.bin` with a key already on keys.openpgp.org, upload
    the `.sig`, download the signed GIF.
  The signature covers the app bytes but **excludes the saved `.state`**, so it
  stays valid as people use the app. A GIF carries **one** `GIFOSSIG` block, so
  an owner signature *replaces* ours: when the owner signs, the listing shows
  **them** as the signer and credits GifOS as the *packager* in text, not in the
  block. The port README and the upstream PR both carry these steps.

**Open questions.**
- **License set:** MIT/BSD/ISC are easy; Apache-2.0 adds a NOTICE duty and a
  patent grant — in scope for v1 or MIT-first? GPL/AGPL only when we're happy to
  ship the port under that same license.
- **Attribution UX:** how the listing shows "ported from `<repo>`, © upstream,
  `<license>`" so credit and license are obvious, not buried in the GIF.
- **Trademark vs copyright:** a permissive *code* license is not a *trademark*
  license — rename/rebrand ports that carry a protected name; never imply
  endorsement by the original project.
- **Maintenance drift:** a port is a fork frozen in a GIF. Do we pin the
  upstream commit in the listing and track releases, and who re-ports on a
  security fix? (The upstream-PR path above is the real fix when it's accepted —
  the GIF rebuilds from source; for un-merged ports we still own the drift.)
- **Will upstreams accept it:** the PR-the-build-back play depends on maintainers
  merging a new build target. Keep it tiny and self-contained so it's low-risk
  to accept; have a fallback (our own port + a listing that links upstream) for
  repos that decline or are unmaintained.
- **What's actually portable:** anything needing a private backend, a login, or
  a server secret is out (no accounts, no server that sees plaintext) — the
  candidate filter must catch that before a wasted port.
- **Curation / safety:** a permissive license says nothing about code safety; a
  flood of ports raises the review bar (§6's abuse question) and the case for a
  signing/curation gate.

## 7. ONE runtime: kill the app star, strip the relay to meeting-only

**DONE 2026-08-01 — the one-runtime flag day.** The agreed end-state design and
what shipped live in [`docs/one-runtime.md`](one-runtime.md): one room page
(run.html deleted), traits (`appPinned`/`mediaPinned`) minted at entry, solo →
Invite → call-layer lifecycle, owner succession by room class, the relay
stripped to greeter + door, deriveJoin deleted, DS bumped. The text below is
the original plan, kept as history.

**What.** Retire the app-multiplayer **star model** entirely. There is ONE
runtime — a **meeting** — and audio/video, chat, and a shared app are all
**optional components layered on it**. An app-share is that runtime with the
media plane switched off; a meeting is the same room with it switched on; an
app on the Stage is a component either way. Nothing about "sharing an app"
should imply a different network object.

Then **strip the relay to meeting-only functions**: the greeter registry plus
the door. The app-session bus comes out.

**Why it fits.** This is the standing directive ("the relay is greeter-only")
finally applied to the surface that never got it. Today the SAME Cloudflare
Worker (`gifos-relay`, routes `relay.gifos.app`) serves three roles, and only
the meeting side was ever locked down:

1. **Greeter registry** — `knock` (`relay/src/relay.js:564`), answering with the
   sealed greeter list (R2/R3). This is the part that matches doctrine.
2. **Meeting door** — sealed first-contact signaling `peer` (`relay.js:563`,
   last-resort only: own DC → sponsor-forward → relay, `mesh-wire.js:645–652`)
   and the moderation/lock verbs `setpw` / `ban` / `unban` / `votekick` /
   `banlist` (`relay.js:575–628`), each an Ed25519-signed order the relay
   verifies exactly as a peer would (§SIG).
3. **App-session star bus — a FULL app data transport.** `to` (host→one client),
   `bcast` (host→all), and the client default that forwards every frame to the
   host as `from` (`relay.js:559,560,631`). This is standalone app multiplayer
   (`run.html:455` → `runtime.js` `bootClient`/`becomeHost`), and it carries app
   DB ops, not greeting.

The relay's own header states the actual (weaker) promise it was built to —
*"the relay is for CONTROL traffic only (DB ops, WebRTC signaling)"*
(`relay.js:28`). **"Control-only" means "no audio/video" — enforced by the token
bucket (`relay.js:111–175`) — NOT "greeter-only."** Those are different
promises, and the gap between them is this roadmap item. Role 3 is also why the
apps plane still has a relay *fallback rung* at all (`runtime.js:1350,1451`, the
paced drip ~1475): direct DC → friend-hop (P1) → **paced relay (P2)**.

Half of this is already built and proves the shape works: **app-in-a-meeting**
was migrated onto the mesh's Stage DATA lane with owner-signed (Ed25519)
snap/delta frames and its second relay session **deleted** (`site/js/app-owner.js`,
`runtime.js attachStageBus` / `bootClientBus`, `run.html:8184,8212`). What was
never built is `docs/app-mesh-unification.md` **phase 3** — the headless
media-less mesh room (`site/js/mesh-app.js`) that would put *standalone*
app-shares on the same footing. That doc's §6 notes the relay app-broadcast is
"currently deferred **precisely because apps still need the relay bus**"
(`app-mesh-unification.md:381`). This item closes that.

**Sketch.**
- **Basic runtime = a media-less room.** Factor the mesh node bring-up + DC
  signaling glue out of `run.html` into a reusable `site/js/mesh-app.js` that
  BOTH `run.html` and `run.html` consume. Opens no camera, never loads
  `mesh-media.js` — control mesh + gossip lane only. Seats, C=5, healing laws,
  greeter registry all identical to a meeting.
- **Components are opt-in, not separate products:** A/V (media plane on), chat
  (already gossip), shared app on the Stage (already the `sga` lane +
  owner-signed frames). Any combination, including all off (a bare room) and
  app-with-no-A/V (today's app-share).
- **Standalone app-share becomes a mesh join.** Link secret derives the room via
  `deriveMeet` instead of `deriveJoin`; the invite is a room URL. App state rides
  the Stage DATA lane it already rides inside meetings — reuse `attachStageBus` /
  `bootClientBus` unchanged. No app bytes and no DB ops on the relay, ever.
- **Then strip the Worker.** Delete `to` / `bcast` / the client→host `from`
  forward and the `role:'host'`/`role:'client'` session shapes; keep `knock`,
  `peer`, and the signed door verbs. Also delete the **already-dead `gossip`
  handler** (`relay.js:565–574`) — mesh gossip has floated over WebRTC since the
  chokepoint (`run.html:2940`: *"relay `{t:'gossip'}` no longer reaches the room
  and is gone"*; `mesh-wire.js:641` → `mesh.js:1301`). That one is a free
  cleanup and can land first, independently.
- **Retire the bespoke host machinery** the star needed: `AUTO_TAKEOVER`
  (`runtime.js:1288,2049`) and the owned-app host gate / epoch race
  (`relay.js:390–422`) give way to mesh seat healing + owner-key authority.

**Two entry points, ONE runtime.** Unifying the runtime does NOT mean collapsing
the URLs. `/join/…` and `/meet/…` both stay, both keep their current formats, and
both boot the same object — **the entry point only decides which components are
ON at start.** After boot they are the same runtime and can converge: a
`/join/…` room can light up A/V, a `/meet/…` room can mount an app on the Stage.

Current formats, unchanged (router: `site/404.html:55–74`, mirrored in
`site/index.html:96`):

| Entry | Public URL | Boots | Components ON at start |
|---|---|---|---|
| App | `/join/<code>` | `run.html#j=<code>` | app; A/V off, chat off |
| App (owned) | `/join/<app-shortname>/<verifier>/<code>` | `run.html#s=<shortname>.<verifier>&k=<code>` | app, owner-authoritative; A/V off |
| App (own desktop) | — | `run.html#id=<fileId>` | app, solo — no room until Invite |
| Meeting | `/meet/<room>` | `run.html#v=<room>` | A/V + chat; no app until "Run app" |
| Meeting (admin) | `/meet/<room>/<verifier>` | `run.html#v=<room>&av=<verifier>` | A/V + chat + admin authority |
| Meeting (fresh) | `/meet` (bare) | `run.html` — mints a room | A/V + chat |

**DO NOT LOSE: the app's shortname IS the room segment.** An owned app link reads
`gifos.app/join/chess/<verifier>/<code>` — the room is `slug(manifest.shortName)`
(`runtime.js:1892–1893`, `slug()` at `:88`), so an invite is *self-describing*:
you can see what you're being invited to before you tap it. That is app-side
flavor a meeting has no equivalent of (a meeting room id is user-chosen or
minted), and the unification must carry it over verbatim rather than replace it
with an opaque mesh room id. Three parts of it are load-bearing:

- **`-anon` on unsigned apps is a SECURITY rule, not cosmetics.** The room is
  `slug(signed ? shortName : shortName + '-anon')` — an unsigned GIF could claim
  any name, so it can never mint a clean branded URL. `/join/chess/…` means the
  bytes are signed; an unsigned app claiming "Chess" gets `/join/chess-anon/…`.
  Same doctrine as the identity pill, which is only shown when signed
  (`desktop.js:584`). Keep the suffix, keep it tied to signature state.
- **`slug()`'s invariants are router invariants.** Lowercase, non-alnum → hyphen,
  ≤40 chars, and guaranteed to contain a letter/digit so it is "never empty or
  all-hyphens" and a room can never be mistaken for a bare verifier segment
  (`runtime.js:86–91`) — the `404.html:55` path regex distinguishes segments by
  shape. Any new room-minting path must reproduce these or the router silently
  mis-parses links.
- **The self-healing shape has no shortname by design** — `/join/<code>` is the
  whole capability (`runtime.js:94`), nothing to brand. Don't "fix" this into a
  named room; the anonymity is the point.

The clean end state is that a room id may be *derived from an app* (shortname +
verifier) or *chosen/minted by a person* (meeting), and the runtime does not care
which — same object, two naming conventions, both readable in the URL.

**The app slot is PINNED or SWAPPABLE, decided by the entry point.** This is the
other thing the entry point settles, and it follows directly from the naming
rule above:

- **App entry (`/join/…`) — the app is PINNED.** It cannot be unmounted, stopped,
  or swapped for a different app. The room's whole identity is that app: its
  shortname is in the URL, its owner key is the app-state authority, and guests
  followed a link that named it. Unmounting would leave a room that no longer
  matches its own address — an invite to `/join/chess/…` must always land in
  chess. So no "stop sharing" affordance on this entry, and no app picker. A/V
  and chat may still be switched on freely; only the app slot is fixed.
- **Meeting entry (`/meet/…`) — the app slot is FREE.** Mount, unmount, and swap
  apps at will over the life of the room, exactly as today (`runApp` /
  `clearAppView` / `mountClientApp`, `run.html:8136,8152,8205`). The room's
  identity is the *meeting*; an app is a component passing through it, so
  successive apps over one call is the normal case. Stopping a share returns to
  a plain meeting rather than ending the room.

So "can this app be unmounted?" is a **property of the room's identity**, not a
permission or a mode toggle: the app is the room (pinned) or the room hosts apps
(free). Worth encoding as an explicit room trait at mint time rather than an
`if (entryPoint === 'join')` sprinkled through the UI — the runtime should read
one flag and hide or show the whole mount/unmount surface accordingly.

**The same rule runs the other way: each entry pins its OWN defining component.**
Symmetric with the app slot above —

- **Meeting entry (`/meet/…`) — A/V + chat are PINNED.** The media plane cannot
  be torn down; a `/meet/…` link must always land in something that is a meeting.
  The app slot is free (above).
- **App entry (`/join/…`) — A/V + chat are FREE.** Mount and unmount them at
  will: an app-share is silent by default and can light up a call, then drop back
  to silence, without ever ceasing to be that app's room. The app slot is pinned
  (above).

So each entry point pins exactly the component its URL promises and leaves the
other fully swappable. Neat, and it means the runtime needs just two traits at
mint time — `appPinned` and `mediaPinned` — rather than a set of per-entry
special cases.

**CRITICAL carve-out: "pinned" is a ROOM-level affordance, never a per-person
obligation.** Pinning A/V must mean *the media plane stays available* — tiles,
Stage, the ability to turn a camera on — and must NEVER mean a participant has to
transmit. Per-person mute, camera-off, and blur stay freely controllable on every
entry point, always. That is a privacy invariant, not a component toggle:
participants **arrive blurred by default** (`run.html:2293` — "blurred-by-default
is the privacy"; `:7800` — "they arrive blurred"), and a camera nobody chose to
enable is the normal resting state of a meeting. A rule that read "cannot unmount
A/V" as "cannot stop transmitting" would invert the consent doctrine outright, so
the trait must be defined at the plane, not the participant. Note this also makes
"pinned A/V" a genuinely weaker claim than "pinned app": a meeting where everyone
is muted and dark is still a meeting, whereas an app-room with no app is nothing.

Consequence worth stating: a `/meet/…` room whose participants are all silent and
dark, running an app, is *functionally* an app-share — and that is fine. The
difference that survives is identity, not appearance: it keeps its meeting URL,
its app stays swappable, and it never adopts the app's `/join/<shortname>/…`
address.

Two follow-ons this creates:
- **Owner-leaves on a pinned room** has no "fall back to a plain meeting" escape
  the way a meeting-app does — the room cannot outlive its app. Whatever the
  host-heal answer is (S4/W7-gated, below), a pinned room needs one; a meeting
  can always just drop the app and continue.
- **A meeting mounting an app does NOT adopt that app's room identity** — the URL
  stays `/meet/<room>`, the app rides the Stage lane as a component, and the
  app's own owner key governs only its state. Mounting must never rewrite the
  room's address to `/join/<shortname>/…`, or a swap would silently move
  everyone.

A pretty link is a
**secret capability** either way — the client derives the session id, token, and
E2E key from the code and the relay never sees it ("derive, don't send"). The one
real difference to reconcile is the **derivation**: app links use `deriveJoin`,
meetings use `deriveMeet` (`gifos-net.js:299,321`), so moving `/join/…` onto a
mesh room is a `DS`-tagged **flag day** — old and new clients land in different
relay sessions. Sequence it as one, do not straddle.

Longer term `run.html` and `run.html` collapse into one page that reads its
starting component set from the hash; until then, keep both files thin wrappers
over the shared `mesh-app.js` node so the divergence stays cosmetic.

**Ordering (each step shippable).**
1. ~~Delete the dead relay `gossip` handler.~~ **DONE 2026-08-01** (both
   `relay/src/relay.js` and `test/servers/relay-local.js`; relay tier green).
2. `mesh-app.js` — extract the headless node; `run.html` consumes it unchanged.
3. Point `run.html` at it: standalone app-share = media-less room. Retires the
   app-session bus's only remaining caller.
4. Strip the Worker to greeter + door; drop host/client roles.
5. Fold in the components UI (A/V toggle, chat, app-on-Stage) so one surface
   covers both entry points.

**Open questions.**
- **Owner-away freezes writes.** The mesh path deliberately dropped
  `AUTO_TAKEOVER`; host-slot healing over the mesh is the decided replacement
  but is **S4/W7-gated** (`app-mesh-unification.md` §6 step 5, §7 Q2). Standalone
  app-shares lean on takeover harder than meeting-apps do — decide whether step 3
  ships before host-heal, or carries an interim mirror-holder rule.
- **Session socket cap.** `MAX_SOCKETS_PER_SESSION = C*C+C = 30` (`relay.js:123`)
  is sized for a greeter pool, not a star's every-client-holds-a-socket shape.
  Once standalone apps seat deep and drop their sockets this stops mattering —
  confirm the transition doesn't strand mid-migration clients.
- **First-frame TOFU** on healing-link sids for the app owner key; the clean
  close is carrying the owner pubkey in the authenticated ad
  (`app-mesh-unification.md` "Changes OUTSIDE my files").
- **Heavy apps** re-send app bytes in each retained snap; a per-record delta
  stream + separate app-bytes frame is the optimization when a multi-MB app
  rides the lane.
- **Docs to re-true once this lands** (they currently describe the star's relay
  fallback as live): `README.md:54,207`, `site/about.html:77`,
  `site/changelog.json`, and the relay's own header promise (`relay.js:28`),
  which should be rewritten from "control traffic only" to greeter+door.

## 8. Lock a GIF with a passcode (encrypted App GIFs + computer backups)

**What.** Optionally **encrypt the contents of a GIF behind a passcode** so it
can't be opened, run, or restored without unlocking it. Two headline uses: lock
a **whole-computer backup GIF** (the "Back up Home Screen" artifact —
`backupDesktop()`), and lock **any single App GIF** on the Home Screen. Offer
**several passcode methods**, not just a typed password: a **numeric PIN**, a
**connect-the-dots swipe pattern**, a **freeform drawing**, or a full **text
passphrase** — each chosen at lock time, with a matching unlock UI. The file
stays a **valid GIF** (still shareable, still previews its cover animation); only
the GifOS payload inside it is ciphertext.

**Why it fits.**
- Privacy-first with **no accounts and no server**: the key is derived from the
  passcode entirely in the browser — same "derive, don't send" posture as the
  meeting link crypto. Nothing to store server-side, nothing to leak.
- A backup GIF or a shared app can carry real secrets — notes, saved API keys, a
  whole desktop. Locking lets you keep a backup in a shared drive, hand someone
  your phone, or post a computer image without exposing its contents.
- The GIF container already separates **visible frames** from the **GifOS
  filesystem block** (`GIFOS1.0`), and `gifos-gif.js` can already splice that
  block in place — so encrypting the payload while leaving the animation alone is
  a natural extension, not a new format.

**Sketch.**
- **What's encrypted:** the `GIFOS1.0` filesystem payload (app files + `.state`
  user data, or a backup's `desktop.json` + files) → AES-GCM with a per-file
  random salt + IV. The visible GIF frames stay plaintext so it still looks and
  previews like a GIF.
- **Where the lock metadata lives:** a new **unencrypted** app-ext block (e.g.
  `GIFOSLOCK`, a sibling of `GIFOS1.0`/`GIFOSSIG`) carrying `{ method, kdf,
  params, salt, iv }` — the opener needs it to know *how* to prompt and derive,
  so it can't be secret. Reuse `findAppExtSpan` / the repack path.
- **Every method funnels to bytes → KDF → key:** passphrase (UTF-8), PIN (digit
  string), pattern (ordered cell sequence, Android-style), freeform draw
  (quantized to a canonical form). KDF is **memory-hard** — Argon2id (WASM) or
  scrypt, PBKDF2-SHA256 high-iteration as the no-WASM fallback — scaled to the
  device.
- **UX:** "Lock this GIF…" in an icon's menu and a "Lock this backup" toggle in
  the backup flow; an unlock sheet on open/run/restore that renders the right
  input (keypad / dot-grid / draw canvas); change-passcode and remove-lock;
  a **lock badge** on locked icons.
- **Signing stays compatible:** `gifos-sign` already excludes `GIFOS1.0` and
  `.state` from the content hash, so a GIF can be **both signed and locked** and
  the signature still verifies on the visible bytes — confirm block ordering and
  that a recipient can verify provenance *before* they hold the passcode.

**Open questions.**
- **Threat-model honesty (the big one).** With no server there is nothing to
  rate-limit: anyone who holds the file can brute-force **offline**. A 4-digit
  PIN (~10⁴) or a 3×3 pattern (~3.9×10⁵) has tiny entropy, so a memory-hard KDF
  only *slows* cracking, it doesn't stop it. Low-entropy methods are "keep a
  nosy person or a grabbed phone out," **not** "safe against a determined
  attacker with the file"; only a real passphrase gives meaningful offline
  resistance. The UI must state each method's protection level plainly and never
  imply PIN/pattern = encryption-grade.
- **Freeform drawing is hard to reproduce.** Exact re-draw is impossible, so it
  needs fuzzy matching — which either quantizes to a low-entropy canonical form
  (weak) or accepts a tolerance (leaks entropy, enables replay). Ship PIN +
  pattern + passphrase first; treat freeform "draw a picture" as a stretch, or
  reduce it to a connect-the-dots pattern that reproduces exactly.
- **Recovery / loss.** No accounts, no server ⇒ a forgotten passcode means the
  contents are **gone** (same finality as Erase). Offer an optional high-entropy
  **recovery phrase** as a second unlock path, or key escrow to another device
  you own? At minimum, warn loudly at lock time.
- **`.state` while running.** Excluding `.state` from encryption (to preserve the
  signature rule) would leave a running locked app's saved data in plaintext —
  defeating the point. Locking probably must encrypt `.state` too, which then
  interacts with the signature-excludes-`.state` invariant; resolve that tension
  before build.
- **Locked + shared + store.** Can a locked App GIF still install from the store
  (which checks sha256 + signature on download) with unlock deferred to run? Does
  the recipient verify the signature before unlocking (yes — sig is on the
  visible bytes)?
- **Locked backup restore.** `restoreDesktop()` must prompt and unlock *before*
  `clearAll()` / bulk `putItem` — a wrong passcode must never wipe the current
  desktop first.
- **Per-file vs a vault.** Lock individual icons, or a "locked folder" that
  unlocks for a session? Per-open unlock vs unlock-for-session, and what the lock
  badge/relock timeout is.

## 9. Media plane: stop transcoding every hop (mushiness, log N latency, watts)

> **OPEN BUG blocking §9a's guard:** with the encoded-passthrough lane actually
> running, one staged feed bright-freezes at every receiver at once for ≥12s while
> the producer keeps encoding — `e2e-pipe` leg 3, the guard `87f57e6` left behind.
> Proven to belong to the lane (interleaved A/B, 3/3 on, 0/3 off, load excluded)
> and NOT to a busy box. It was invisible until 2026-08-05 because the gate's
> pinned Chrome 140 has no `RTCRtpScriptTransform`, so the lane disabled itself
> and the guard never exercised it. Full evidence and what is still unknown:
> **`docs/bug-pipe-stg-freeze-2026-08-05.md`**.

Everything in this section follows from **one fact**, established 2026-08-04
while asking whether the Settings video-quality knob reaches the Stage:

> **A browser cannot forward video without re-encoding it.** There is no RTP
> passthrough in the MediaStream API. `ontrack` hands you a `MediaStreamTrack`,
> which means exactly one thing — *a source of raw, decoded frames*; the
> compressed bitstream is already gone. So when a seat forwards a feed
> (`shipMos('sgs', …, sgs.stream, …)` in the mosaic sweep, and the `stg:` relay
> beside it), the outgoing sender does the only thing it can with a raw source:
> **encodes it again, from scratch.** Every hop of the tree is a transcode, and
> nothing in our code says so — it reads like a forward.

That single fact is charged to us three separate times.

**1. Mushiness (quality).** Lossy compression is not idempotent: the decoder
returns an approximation, and re-encoding it quantizes on top of what is already
gone. Worse and less obviously, **compression artifacts are noise, and noise is
expensive to compress** — the blocking and ringing in a decoded frame were never
in the original image, but the next encoder cannot tell, so it spends real bits
faithfully reproducing the previous generation's mistakes. Each generation, a
larger share of the budget goes to preserving errors instead of faces.
*Calibration, so this is not overstated:* deep hops forward the strip **verbatim**
rather than re-compositing it (the strip is built once, in Section 1), so
resolution and macroblock alignment are preserved and the decay is gradual, not
a cliff. The honest headline is that ~log_C(N) gentle generations of a **small**
picture is still a small picture — which is why giving the Stage its own cell
size and budget lane (SHIPPED 2026-08-04: `STAGE_CELL`/`STAGE_MAXW` and
`stageCeilingKbps`, replacing the 110px secondary-tile default and the flat 900k
aux constant) mattered more than the generations do.

**2. log N latency.** Every hop pays encoder latency **on the critical path**,
on top of its jitter buffer. Depth is ~log_C(N), so a stadium's deepest seats
carry a stack of encode delays that grows with the log of the room. Nothing about
the tree is wrong here — the transcode is simply sitting in a place that should
have been a pipe.

**3. Watts — and this is the big one.** **Each `RTCPeerConnection` owns its own
encoder for a given sender; the browser will not share one across two PCs, and
there is no API to ask it to.** So a seat fanning a composite to its C down-links
runs **C encoders producing the same picture**. `docs/phone-power-tuning.md`
already named this as a top unclaimed lever — *"fans to N row-mates re-encode per
PC; RTCRtpSender cloning the SAME encoded stream (simulcast-style) would collapse
N encoder sessions to 1 — the MediaCodec session ceiling measured on the g24"* —
and the g24 measurements put a phone's meeting load at ~2.2W against a 2.5W USB
budget. Encoding one picture C times is the single largest avoidable burn in the
whole media plane.

### 9a. Encoded passthrough with local decode (the fix for all three)

**STATUS — FIRST WAVE SHIPPED to edge 2026-08-04** (`site/js/mesh-pipe.js` +
run.html wiring; gates `test/unit/mesh-pipe.js` 23 green,
`test/browser/e2e-pipe.js` 15 green, e2e-mosaic/stage-onerow/broadcast all
green). Every PACKER-ORIGIN forward (sgs, the sd*/x*/sub family) now ships the
received compressed bytes — byte-identical, zero content re-encode per hop —
with per-job automatic failback to the transcode path. What the capability
probes taught (all measured on the pinned Chromium 141, and different from the
sketch below): cross-transformer injection NEVER ships (the sender's sink does
frame-object identity, not provenance — even constructor-clones of its own
frames are silently discarded), so the mechanism is a payload SWAP on the
sender's own frames, template-minted on demand by a 48px `captureStream(0)` +
`requestFrame()` canvas; `transformer.generateKeyFrame()` DOES NOT EXIST, so
the keyframe pulse below is dead — and the `mx-kf` DC walk that first replaced
it is now itself demoted to a no-SKR fallback. SECOND WAVE 2026-08-04, after
decomposing the stg freeze across five devices (test/tools/pipe-freeze-probe.js,
the frza runs): **`stg:*` NOW RIDES THE PIPE — the scope-out is closed.** What
the freeze actually was — NINE defects, each measured in the act:
(1) WebRTC emits NO periodic keyframes (1 key in 20s of healthy flow — the
initial one), so any hole in the ask path is a permanent freeze, not a delay;
(2) the mx-kf walk answered key starvation by nudging the producer's CAPTURE,
and the 1px canvas resize on the BLUR pipe's canvas (the self stream's
privacy steady state) stalled its encoder 10-20s per hit;
(3) every ask was frame-driven, so a pipe whose tap received NOTHING asked
exactly once (105 unanswered PLIs into a husk);
(4) `stg:*` claim preference was key-only Map-insertion order, so direct
receivers idled the producer's only real encode and failback dragged seats
onto husk copies — the same IDENTITY-NOT-KEY class as the 2026-08-01 sdx/sdn
fix — and a hot-but-byte-void husk primary never qualified for the dark
watchdog, blocking the standby swap forever (262s measured);
(5) the deepest: the pipe worker's cold-start primer was JUNK IN THE STREAM —
an idle-queue key template passed through as a 48px carrier frame; mid-stream
it reference-broke every decoder downstream (a healthy queue is empty most of
the time, so consumer-PLI-minted key templates usually landed on one), whose
recovery PLIs minted more junk (self-sustaining 120s room-half freezes;
partial fixes made it WORSE because SKR multiplied PLIs) — and even gated to
cold-start-only it wedged fresh decoders at 48x48 at (re)ship time (frza14:
two seats frozen 4.5min, 1100+ unanswered PLIs each);
(6) demand-minting was 1-for-1 with a round trip that occasionally loses a
beat, so hot pipes accumulated a STANDING queue deficit (pinned at q=21-38 —
a 5-8s latency tax one frame from the overflow cliff) and QMAX overflow
re-keyed the whole downstream in ~1Hz waves — and a synchronous mint burst
cannot fix it, because captureStream coalesces same-task requestFrames into
ONE capture (measured);
(7) claim ties broke by Map insertion order, which SHUFFLES as mosAnn ages
entries, so h-tied candidates flip-flopped and every flip re-shipped a fresh
container id down the whole tree (8 sid changes from one via in 3 minutes);
(8) the mos watchdog was BLIND on never-delivered pipes — a receiver with no
packets yet has no inbound-rtp stats row, pipeBytes returned -1, and every
rail (hot-void included) lived behind the -1 skip, so a seat claiming a husk
ship sat hot-and-blind whole runs (fdec 0, 1000+ unanswered PLIs, a live
parked standby never woken — a no-stats-row receiver is now a judgeable ZERO);
(9) the PLI tunnel was DEAD IN VIVO — a consumer that misses a pipe's birth
key (packets racing its transceiver setup) PLIs forever, but Chromium does
not latch a PLI into a demand-minted captureStream(0) encoder (1305 PLIs,
zero key templates; the module probe had measured the tunnel working, but
only at idle), so the stream stays keyless while bytes flow at full rate —
invisible to every byte rail. The sender page polls its piped senders'
outbound pliCount on the watchdog's 5s beat; a rise KICKS the pipe (ask
upstream for key content + mint the pairing key template).
The fixes: receiver-side `transformer.sendKeyFrameRequest()` EXISTS on this
Chromium (measured: key in 21-72ms from camera, canvas and carrier upstreams)
— the worker asks hop-locally on every starvation path AND re-asks starving
pipes on a 2s timer, chaining to the producer entirely in RTCP; the primer is
REMOVED outright (the demand KEY MINT guarantees every pipe's first write is
a paired real content key, making the original cold-start deadlock
unreachable) and an idle-queue key template is always the PLI tunnel (drop +
ask upstream); a 33ms DRAINER mints catch-up templates in separate tasks
until a backlogged pipe drains, and overflow is KEY-PRESERVING (restart from
a key already in the queue — no ask round trip); the producer-side fallback
lever is a sender `scaleResolutionDownBy` jiggle (key in ~30ms, zero
capture-pipeline contact); stg slots anchor their claim to the feed's OWNER
when direct, else the shortest live chain by announced hop count (h=0 at the
producer, +1 per relay — husk cycles' h grows every sweep, so min-h escapes
them) with STICKY ties (current primary, then lowest pid); and the watchdog
gained HOT-AND-VOID (zero bytes for 12s on a hot primary with a live standby
= husk, not a slow pipe); and the STG KEY PULSE — reactive key recovery
floors at 14-20s across deep piped chains (rate limits x hops), so while my
camera is on the Stage a ~3s sender-side jiggle bounds any consumer's key
wait to one pulse, making the wait invisible. Verdict at healthy fps across
5 devices: frza21/frza22 ZERO freeze events at every receiver seat for the
full runs, pipe queues at 0-4 frames (were pinned at 21-38). Gate: e2e-pipe LEG 3
watches every seat's stg/sgs feeds for the exact bright-stall shape. §9b's
fan collapse shipped with the first wave for free (one tap fans to N pipes).

**What.** Forward the **compressed bytes**, and decode **once, locally, only to
put pixels on this seat's screen**. A seat's job becomes: decode for display
(one decode, unavoidable — it is showing the picture), and hand the *untouched*
encoded frames to its down-links. No re-encode anywhere in the tree.

**Why it fits.** This is an SFU's verbatim forwarding — done peer-side, with no
media server, so healing-laws R2 is untouched and the relay stays a
zero-knowledge greeter. It changes **nothing** about the C-nary tree, seating,
healing, or mix-minus geometry: the same bytes traverse the same edges. It is
purely the removal of a transcode that the browser API forced on us.
**Explicitly NOT in scope: shortening the stage's path by flooding wider.**
That was considered and rejected 2026-08-04 — *the C-nary tree is gospel*; we
buy back quality and latency by making each hop free, not by removing hops.

**Sketch.**
- **`RTCRtpScriptTransform`** (the standardized encoded-transform hook; built for
  E2EE, where an SFU routes media it cannot read). It inserts into the RTP
  pipeline *before* the decoder on the receive side and *after* the encoder on
  the send side, and what flows through it is `RTCEncodedVideoFrame` — the actual
  compressed payload.
- **Receive side:** capture each encoded frame for the feeds this seat forwards
  (`sgs`, `stg:*`, and the `sd*` mix-minus family).
- **Send side:** inject the same bytes into each down-link's sender. This is
  the awkward half — a sender's transform is designed as a *filter over its own
  encoder's output*, not as a source — so expect a dummy/idle encoder whose
  payloads are substituted, with frame metadata (timestamps, dependencies,
  keyframe markers) kept coherent.
- **Local decode is unchanged and still wanted:** every seat already decodes the
  strip to display it. That decode stays; only the *encode* leaves.
- **Falls out for free:** with one set of bytes going to all C down-links, **9b
  is the same change** — the C encoders collapse to zero for forwarded media.

**Open questions.**
- **Per-hop adaptation is lost — THE LAYER-DROP DESIGN (measure-first plan,
  2026-08-04).** Today the pipe hands every consumer exactly what the source
  encoded; the SFU answer is layers the forwarder DROPS instead of
  re-encodes. The design that composes with what shipped:
  (1) LAYERED ENCODE AT THE STG PRODUCER ONLY, to start — it is the one
  lane with a single producer, a pulse, and stage-grade budget:
  `scalabilityMode: 'L1T2'` (temporal-only SVC) on the stg sender's
  encodings is the cheapest first rung — no second encoder session, ~15%
  bitrate overhead, and TEMPORAL dropping is doable INSIDE the existing
  worker (RTCEncodedVideoFrame.getMetadata().temporalIndex: a pipe told to
  halve its rate skips temporalIndex>0 frames — reference chains survive by
  construction; that is a per-CONSUMER rate choice at zero re-encode).
  Spatial simulcast (two encodings on the stg sender) is the second rung —
  real spatial downshift for weak consumers, at the cost of a second
  encoder session on the producer (phones: check MediaCodec session
  ceiling first, docs/phone-power-tuning.md).
  (2) SELECTION composes with the LADDER as a per-pipe cap: adapt() already
  computes each seat's rung; a piped job maps its consumer's advertised
  tier (already gossiped in status) to keep-all / drop-T1 / low-simulcast
  — the DEMAND side (mx-want) grows a {layers} field, old clients omit it
  and get everything (today's behavior, zero flag day).
  (3) MEASURE FIRST, in this order: does L1T2 hurt the pulse (key
  cadence x temporal layers interaction)? does temporalIndex survive the
  payload swap onto templates (the swap is content-agnostic but the
  DEPENDENCY DESCRIPTOR header extension may not ride — check
  getMetadata() on swapped frames at a receiver tap)? and what does T1-drop
  actually save a 4-core receiver (decode fps vs battery on the Moto rig)?
  The worker's per-pipe counters + kfStats mime/impl are the instruments.
- **Per-leg latency (piped vs transcode) — the method, and what the counters
  already say.** The worker stamps lastWriteAt per write and the tap sees
  each frame's rtpTimestamp — a per-leg trace shaped like approom-join's
  TRACE line falls out of correlating one rtpTimestamp across (tap-seen@,
  written@) at each hop plus framesDecoded advance at the consumer; the
  pipe-freeze-probe already carries the plumbing (chain counters per 2s).
  What the frza logs already bound without a dedicated run: a healthy piped
  hop holds q=0-4 template-paired frames (drainer) ≈ ONE mint round trip
  (~35-100ms at 10fps) of added latency per hop, vs the transcode path's
  full encode (frame-interval + encoder delay, ≥100-200ms per hop at the
  same rungs) — and the piped hop's latency is bounded by mint pacing, not
  by encoder load, so it does not degrade under CPU pressure the way the
  transcode lane measurably did (frza10's pinned-queue latency tax is the
  failure mode to watch instead, now gated by the drainer). A dedicated
  timestamp-correlated run across the 5-box rig is the remaining
  measurement, cheap to add to the probe when wanted.
- **Keyframes without a back-channel — ANSWERED (2026-08-04, second wave),
  and Nathan's pulse won the lane that matters.** Three levers, each with a
  measured domain: receiver-side `transformer.sendKeyFrameRequest()` works
  ONLY when the upstream is a real encoder (Chromium does not latch a PLI
  into a demand-minted captureStream(0) carrier — measured, defect 9), so it
  covers producer-adjacent hops; the `mx-kf` DC walk crosses piped hops but
  floors at 14-20s across deep chains (2s-per-hop rate limits — it is the
  PRIMARY for packer lanes, not a fallback); and for the STG lane the answer
  is the original proposal: a ~3s sender-side keyframe pulse (the
  scaleResolutionDownBy jiggle) while staged, bounding any consumer's key
  wait to one pulse. ~+30% stg bitrate while staged — exactly the "quality
  pulse comfortable at stage-grade bitrates" this bullet predicted.
- **The convergence window — closed by the pulse.** At stage-up a seat could
  claim a copy whose chain was still establishing and bright-stall 15-185s
  (frza14-19: the birth-key race + reactive recovery's floor). The 3s stg key
  pulse bounds the wait to one pulse: frza21/22 saw ZERO freeze events at
  every receiver seat, stage-up included. If a future lane needs the reactive
  path to be fast (a pulse-less producer), the candidate remains: suppress
  re-flooding a copy until it has decoded its own first frame, so
  establishing chains are never claim candidates.
- **Codec coherence across every hop — VERIFIED ON REAL HARDWARE
  (2026-08-04, the Moto).** All three legs measured in live rooms (kfStats
  now carries per-flow codec + encoder/decoder implementation): (a) with a
  real phone staged through real-Chrome relays the chain is H.264
  END-TO-END and every relay hop RIDES THE PIPE deny-free — the phone
  encodes its face ONCE on hardware (`NdkVideoEncodeAccelerator
  (c2.mtk.avc.encoder)`, 480x270@10) and hardware-decodes its inbound strip
  and stadium (`MediaCodecVideoDecoder`), which is the §9/§3-G2 watt story
  working: one hw content encode, relays cost 48px template mints;
  (b) a MIXED room (a VP8-only-encode seat staged through H264-first
  relays) codec-DENIES exactly the incompatible hops per-job and falls back
  to transcode with zero picture loss (fr advancing at every seat through
  the deny); (c) homogenization needs no new code — `preferHwVideo` already
  puts H264 first on every pc wherever decode caps exist, so capable rooms
  converge on one codec by construction. Not yet run: the powered-USB watt
  A/B against docs/phone-power-* baselines (needs the meter rig on the
  raspberrypi Motos).
- **Browser support and fallback.** Chrome/Safari/Firefox all ship encoded
  transforms, but details differ; a seat that cannot do passthrough must fall
  back to today's transcode path without splitting the tree.
- **Does the mix-minus family qualify at all?** `sgs` and `stg:*` are pure
  forwards and are the clean case. The `sd*` mixes are genuinely *composited*
  (a packer draws them), so they must still be encoded once by their producer —
  9a removes the *re*-encode on their onward hops, not the original.

### 9b. One-encoder fan (encode once, send C times)

**What.** A seat that ships the same picture to several peers should run **one**
encoder, not one per peer.

**Status: not independently reachable.** This was originally scoped as the cheap
sibling of 9a — "no change to the forwarding model, pure power and latency win."
That is wrong, and the reason is worth recording so it is not re-scoped that way
again: since each `RTCPeerConnection` owns its encoder and there is no
cross-PC sharing API, "collapse N encoders to 1" *means* encoding once and
injecting the same encoded frames into N senders — **which is the 9a machinery,
exactly.** The `phone-power-tuning.md` phrasing ("RTCRtpSender cloning the SAME
encoded stream") is already describing an encoded transform.

So 9b is not a separate project: **it is what 9a delivers for free on the send
side.** Sequence it as one piece of work, and expect the power win (C encoders →
1, or → 0 for pure forwards) to arrive with the quality and latency wins rather
than before them.

**The one genuinely independent scrap:** for media a seat *composites itself*
(the `sd*` packers, the Stage strip at Section 1), the encode is real work that
must happen once regardless — but it is still being done once **per down-link**.
Even without full 9a, capturing that single composite's encoded output and
fanning the bytes is the same trick applied to one producer. If 9a proves slow to
land, this is the sliver worth extracting first, because compositor duty already
falls on whichever seat holds the coordinate — including a phone (§3/G2's
"compositor duty on phones", still open).

## 10. Optical app transfer — pass a GifOS app phone-to-phone with NO network (flashing QR)

**What.** Hand a GifOS app from one device to another **over the air gap**: the
sending phone displays a stream of **rapidly-flashing QR codes** and the
receiving phone's **camera reads them**, reconstructing the App GIF byte-for-byte
with **no network, no relay, no link, no pairing** — just screen-to-camera. The
sender picks an app off its Home Screen, taps **Beam**, and holds the two phones
facing each other; a live HUD shows lock, decode rate, and progress until the
whole GIF lands and the app drops onto the receiver's desktop. Inspiration is the
"airgapped file transfer" fountain-QR POCs (a dense QR video streams a file at
~100–150 KB/s between two phones that share no network) — the same trick, scoped
to GifOS's native unit of exchange: the **App GIF**.

**Why it fits.**
- **It is the purest possible expression of the two non-negotiables.** No
  accounts and no server that sees plaintext — here there is *no server and no
  network at all*. The bytes never leave the two devices; the "relay" is a beam of
  light across a few inches of air. Nothing to eavesdrop, nothing to log, nothing
  to derive — R2 taken to its limit.
- **Apps are already files.** An App GIF is a self-contained file (that is the
  whole "apps are GIFs" premise, and why Steal App / remix works). Transferring a
  file is the natural primitive, and GifOS already has everything to *produce* the
  bytes (desktop file store) and *ingest* them (the same import path a downloaded
  or AirDropped GIF takes). Optical transfer is a new **transport** under an
  existing model, not a new object.
- **On-brand and demoable.** It is visceral in exactly the way GifOS likes — two
  phones, a shimmer of QR, an app appears — and it works on a plane, in a SCIF, at
  a table with no Wi-Fi, across two phones on hostile networks that can't route to
  each other. "Pass me that app" becomes a physical gesture.
- **Complements, doesn't replace, the link path.** Sharing via `/join/<code>` (a
  secret capability link) stays the default for remote and multiplayer. Optical
  transfer is the **in-person, zero-infrastructure** cousin: not a session you
  join, a **copy of the file** you now own and can run, remix, or re-share.

**Sketch.**
- **Payload = the App GIF bytes, chunked + fountain-coded.** Split the file into
  fixed-size source blocks and emit an **endless stream of fountain-coded frames**
  (LT / RaptorQ-style rateless code) so the receiver never needs a specific frame,
  only *enough* frames — no back-channel, no retransmit requests, robust to
  dropped/blurred frames and to the two phones running at different frame rates.
  Each frame is one QR: `{ session, k, degree, xor-of-blocks, crc }`.
- **Sender UI (`site/…`):** a full-screen QR presenter that cycles frames at a
  device-appropriate rate (cap by the receiver's decode feedback if a return
  channel exists; otherwise a safe fixed cadence). Header line names the app +
  total size; a progress bar tracks frames emitted. Reuse desktop file access to
  read the selected GIF.
- **Receiver UI:** camera capture → QR decode loop (WASM/`BarcodeDetector` where
  available) → fountain **decoder** accumulating blocks until the file is whole,
  then verify a **content hash** and drop the GIF through the **normal import
  path** (same as a downloaded App GIF — so signature/`-anon` handling, Home
  Screen placement, and the identity pill all come for free). HUD mirrors the POC:
  capture FPS, decode FPS, lock, dropped, goodput, elapsed, % complete.
- **Integrity + identity, not secrecy.** The channel is already private (it's
  light between two phones the users are holding), so the crypto job is
  **authenticity/integrity, not confidentiality**: verify the reconstructed bytes
  against a hash carried in the frames, and preserve any **maker signature** baked
  into the GIF so a beamed signed app still shows its identity pill and an unsigned
  one still lands as `-anon`. No new key system — inherit the app-signature
  doctrine wholesale.
- **Direction + optional duplex.** v1 is one-way (display → camera). If both
  phones show and watch, a slow **back-channel** (receiver flashes acks/decode
  progress) lets the sender pace or stop early once the decoder signals "done" —
  optional, since fountain coding already tolerates a pure blind stream.
- **Where it lives:** a small self-contained transfer surface reachable from the
  Home Screen (**Beam this app** on a GIF's menu; **Receive an app** action that
  opens the camera). Pure client — no relay code, no Worker, nothing in
  `relay/src`. Fits the "runtime is the client" posture.

**Open questions.**
- **Throughput vs. app size.** Fountain-QR field rates are ~100–150 KB/s; a
  lightweight App GIF beams in seconds but a multi-MB app is a minute-plus of
  holding phones still. Decide a **soft size ceiling** for the optical path (and a
  clear "this is a big one, ~90s" affordance), and whether to **pre-compress** the
  GIF payload before coding.
- **Decoder availability.** `BarcodeDetector` support is uneven; a WASM QR decoder
  (ZXing/quirc) is the portable floor. Frame density (QR version / ECC level) vs.
  camera resolution and hold-steadiness is a tuning problem — expose the same
  live HUD the POC uses so it's debuggable in the field, and pick conservative
  defaults (lower density, higher ECC) over peak goodput.
- **Return-channel or purely blind?** Blind (no ack) is simplest and needs only
  one camera; duplex pacing is faster and can end early but needs both phones
  presenting and watching. Likely ship blind v1, add opt-in duplex later.
- **Trust on receipt.** Beaming bypasses the store's curation entirely — a signed
  app keeps its pill, but an `-anon` app arrives with only its bytes. Same
  posture as any sideloaded GIF (import already sandboxes + shows provenance), but
  worth stating in the receive UI: "you're installing an app handed to you
  in person; it's unsigned."
- **Multi-file / desktop beam?** Scope v1 to **one App GIF**. A later
  generalization (beam a themed desktop, a pack of apps, or any GifOS file) is the
  same transport over a larger payload — note it, don't build it yet.
- **Relation to §6/§7.** This is a **transport**, orthogonal to the store
  (§6, catalog + download) and the ONE-runtime unification (§7, sessions). It
  neither needs nor blocks them; it can ship as a standalone client feature.
