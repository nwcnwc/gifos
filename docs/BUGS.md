# Security and scalability findings — 2026-09-15

This document records concrete security and scalability findings from a
repository-wide static review. Locations refer to the edge source unless a
served release is named explicitly.

## Status — 2026-09-16

Every finding below was checked against the code at `5108e8ca` and found
accurate as a description of what the code does. Six were things earlier
audits missed; those are FIXED on this branch with regression guards. The
rest were already recorded in this repo as known, deferred, or accepted
(`test/batteries/known-unfixed.sh`, `docs/audit-2026-09-02.md`,
`docs/threat-model.md`), or are hardening ideas rather than defects. The
reasons stand; they are restated per item so nobody re-derives them.

| Finding | Status | Guard / where the reason lives |
|---|---|---|
| Capabilities active before first-run confirmation | **Open — design, worth reversing.** The sheet is an acknowledgement by design (threat-model § 6, SBX-08). The `api`/`ai` brokers are the part that matters: an unacknowledged app can spend a configured provider while the sheet is up. Gating those brokers on the sheet is a contained change and is recommended. | `docs/audit-2026-09-02.md` accepted residuals |
| API redirects leak custom-header credentials | **FIXED.** `brokerApi` sends `redirect: "error"` (browsers cannot inspect `Location` under `manual`). | `e2e-api.js`: redirect refused, other origin never contacted |
| Unbound transfer invoices claim a stranger's transfer | **FIXED.** `/transfer/receipt` answers an unbound token `PENDING` without touching the chain; the sheet says binding is required. | `test/unit/pay-transfer-bind.js`; `e2e-pay.js`, `e2e-tip-creators.js` unbound checks |
| Remote run links allocate up to 1 GiB pre-confirmation | **FIXED (confirm), ceiling kept.** A declared size above 64 MB raises a confirm naming source and size before a byte is buffered; Cancel stores nothing. The 1 GiB ceiling stays: app size is a feature. | `e2e-run-param.js` large-link checks |
| Brokered API responses have no size ceiling | **FIXED.** `readBodyCapped` at 64 MB. | `e2e-api.js` oversize check |
| Meeting URL import has no size ceiling | **FIXED.** Streams and refuses past 1 GiB, same as the desktop path. User-initiated, so no confirm. | — (mirrors desktop.js, which is guarded) |
| Signed-frame verification backlog | Open, low. Relay rate limits and the S4 fill window bound the input; per-sender fairness is an improvement, not a defect. | `docs/audit-2026-09-02.md` WRK/MSH items |
| Payment and provenance share a signing identity | **FIXED.** The Worker signs with its own key (`pay/gen-key.mjs`), published as `site/gifos-pay.key`; init refuses any other secret. **Needs the secret rotated before the next pay deploy** (see pay/README.md). | `e2e-pay.js`, `e2e-tip-creators.js` verify against `/gifos-pay.key` |
| Trusted shell CSP incomplete | Open, hardening. GitHub Pages sets no headers; a meta CSP cannot carry `frame-ancestors`. Externalising 13k lines of inline script is a project, not a fix. | `docs/audit-2026-09-02.md` SBX-01 |
| CyberChef artifacts from a mutable branch | **FIXED.** `vendor.mjs` now VERIFIES against the committed hashes and refuses to touch `vendor/`; `--repin` is the deliberate act and records the gh-pages commit. (Verify is red today: upstream deployed 2026-09-11. The vendored build is the reviewed one.) | `node apps/cyberchef/vendor.mjs` |
| 5,000-participant join storm | Known, decided 2026-08-05. Diagnosed and solved-but-unshippable (duplicate seats, compaction). | `known-unfixed.sh`, `docs/front3-descent-2026-08-06.md` |
| Late joiners miss running shared apps | Known, kept as guards. A race, not a missing path; the fix is one control plane. | `known-unfixed.sh`, `docs/app-mesh-unification.md` |
| PROBLVL = 0 | Known. Measured fix; the sim twin and `mesh.js` must flip together. | `site/js/mesh.js:97` |
| Meeting history without retention | By design: room-lifetime history, rate-limited. | `docs/meet-security.md` |
| Subscriptions resend full collections | v1 API shape; delta coalescing already landed (SBX-06). Improvement. | — |
| Reconnect queue without priority | Open, low. Fair point, not previously recorded. | — |
| One relay object per room | Architecture as designed; capped at 30 sockets. | `docs/threat-model.md` |
| Decoration cache unbounded | Open, trivial. Bounded in practice by the apps on a desktop. | — |

## Security

### High — capabilities are active before first-run confirmation

**Locations:** `site/js/runtime.js:779-799`, `site/js/runtime.js:2883-2957`,
`site/js/runtime.js:3296-3441`, `site/js/gifos-perms.js:390-438`,
`site/js/desktop.js:3639-3707`

The permissions sheet describes network, API, AI and other declared abilities
as a choice, but the app iframe mounts immediately and brokers allow every
declared capability that has not already been disabled. Confirmation records
acknowledgement; it does not open a capability gate. The launch-argument gate
only protects `go.*` values.

An attacker can publish an App GIF that declares a configured third-party API
and an attacker-controlled network host, then send a `?run=` link. The app can
call the configured API and forward its response while the permissions sheet
is still waiting for a decision. The same path can consume a configured AI
provider. API keys are not returned directly, but the app can act through them
and read their responses.

Initialize every unacknowledged capability and network host as denied. Mount
only after an affirmative decision, or gate every capability broker on a
per-mount promise resolved by the sheet. Apply checkbox choices before
releasing the app. Remote `?run=` targets should also receive an explicit
source-and-capabilities confirmation before persistence or execution.

The behavior is present in the default `0.9.15` release snapshot.

### High — API redirects can leak custom-header credentials

**Location:** `site/js/runtime.js:2889-2957`

`brokerApi()` pins the initial request to the configured origin and then uses
the default redirect-following behavior. It does not validate the final URL.
Browsers remove `Authorization` on a cross-origin redirect, but arbitrary
credential headers such as `x-api-key` can be forwarded when the target permits
the CORS request.

A malicious app can select an open-redirect path on a configured API and send
the request to an attacker-controlled origin. The initial-origin check passes,
then the custom authentication header can cross the redirect.

Use `redirect: "manual"` and validate each `Location` against the configured
origin before following it. Never forward custom-header or query credentials
across origins. Validate the final response URL as a second guard. Apply the
same rule to proxied API requests.

The behavior is present in every currently served release through `0.9.15`.

### Medium — unbound transfer invoices can claim another payer's transfer

**Location:** `pay/src/core.js:497-550`

The transfer flow provides a payer-binding endpoint, but
`/transfer/receipt` also accepts the original unbound invoice. Without
`inv.from`, the chain query uses a wildcard sender topic and signs a bearer
receipt with a null payer.

A distributed attacker can pre-mint invoices across the 10,000 dust values for
a known app, price and SKU. When another wallet sends a colliding amount to the
public payee, the attacker can submit the matching unbound token and receive a
portable entitlement receipt. The in-isolate invoice limiter raises the cost
but does not prevent distributed enumeration.

Reject receipt requests unless the invoice contains a valid bound payer.
Prefer collecting the payer address before issuing the invoice so an unbound
token never exists. Add a regression test that submits the original token
after a matching third-party transfer and requires refusal.

### Medium — remote run links permit large pre-confirmation allocations

**Location:** `site/js/desktop.js:3541-3584`, `site/js/desktop.js:3639-3707`

The public `?run=` path automatically downloads an attacker-selected URL with a
1 GiB ceiling. A declared `Content-Length` at or below that limit allocates the
whole buffer before substantial data arrives. An unknown-length response keeps
all chunks and allocates a second full buffer when joining them.

A crafted link can crash a tab or create device-wide memory pressure,
especially on phones, without delivering a gigabyte over the network first.

Set a substantially smaller remote-link limit suitable for supported devices.
Do not allocate directly from an untrusted `Content-Length`. Require
confirmation that names the source and declared size before a large download.
Use a storage-backed or incrementally decoded path where large App GIFs are a
real requirement.

The default `0.9.15` release has the same 1 GiB ceiling.

### Medium — brokered API responses have no size ceiling

**Location:** `site/js/runtime.js:2951-2957`

The ordinary fetch bridge uses `readBodyCapped()`, but `brokerApi()` calls
`arrayBuffer()` or `text()` directly. A malicious app can request an arbitrarily
large response from any configured API and exhaust the tab's memory.

Read API responses through the existing capped streaming reader with an
API-appropriate limit.

### Medium — meeting app URL imports have no size ceiling

**Location:** `site/run.html:13186-13194`

The meeting importer buffers a URL response with `arrayBuffer()` before
validating the GIF. A large or endless CORS-readable response can exhaust
memory or hold the import indefinitely.

Add streaming byte and time limits before decoding or persisting the response.
The same path exists in selectable frozen releases, including `0.9.15`.

### Medium — signed mesh-frame verification has unbounded backlog

**Locations:** `site/js/gifos-net.js:483-489`,
`site/js/mesh-wire.js:327-332`

All signed occupancy frames share one promise chain. The chain preserves order
but has no depth limit, coalescing or per-sender fairness. A malicious room
participant can send signed or malformed signed frame types faster than
WebCrypto verifies them, delaying legitimate occupancy traffic and growing
retained promise state.

Use bounded per-sender verification queues. Drop or coalesce stale occupancy
updates, reserve capacity for known neighbors, and disconnect sustained
offenders. Add a load test that floods signed frames while asserting bounded
heap and bounded latency for an honest neighbor.

### Medium hardening — payment and provenance share a signing identity

**Locations:** `pay/src/pay.js:35-49`, `scripts/sign-apps.mjs:180-209`,
`docs/threat-model.md:28-34`

The payment Worker requires a private key whose public half is
`site/gifos.key`, while that published key also verifies app provenance. This
conflicts with the threat-model requirement that provenance private keys never
enter Workers. Compromise of the payment deployment can therefore forge
domain-signed apps, not only payment receipts.

Use separate, domain-specific keys for app provenance, payment receipts and
invoice tokens. Keep the app-provenance key offline and publish distinct
verification keys for each protocol.

### Medium hardening — trusted shell CSP is incomplete

**Location:** `site/run.html:13-20`

The trusted meeting shell restricts `frame-src` but does not define
`default-src`, `script-src`, `object-src` or `base-uri`. The JavaScript frame
guard mitigates framing on GitHub Pages, but it does not limit the impact of a
future trusted-shell injection.

Externalize inline scripts where practical and deploy a restrictive CSP. Serve
`frame-ancestors` or `X-Frame-Options` from an HTTP layer where available.

### Low — CyberChef executable artifacts come from a mutable branch

**Location:** `apps/cyberchef/vendor.mjs:28-99`,
`apps/cyberchef/vendor.mjs:119-130`

The vendor script declares a commit pin, but executable assets are downloaded
from the mutable `gh-pages` branch. It calculates hashes only after replacing
the local files and records those new values as metadata.

Fetch artifacts from an immutable commit or release object and verify them
against reviewed expected hashes before replacing committed files.

## Scalability and availability

### High, proven — a 5,000-participant join storm does not converge

**Locations:** `test/sim/scale-frontier.sh:32-37`,
`test/batteries/known-unfixed.sh:69-98`, `site/js/mesh.js:1132-1142`

A simultaneous 5,000-seat join plateaus around 3,076 seated participants at
the 60,000-tick cap. Pass-zero admission descents repeatedly choose a lone
child-row spine, reach the depth-12 wall and return `NOROOM` while free cells
remain under other columns.

The available spread-after-`NOROOM` experiment restores convergence but is not
safe to ship: it produces duplicate seats at 50,000 participants and regresses
tree compaction.

Resolve fresh-admitter selection and the compaction trade before enabling
spread. Keep duplicate-seat and compaction assertions in the same gate as the
5,000-seat convergence target.

### High, proven intermittent — late joiners miss running shared apps

**Locations:** `site/run.html:10610-10686`,
`test/batteries/known-unfixed.sh:103-119`

Shared-app presence uses mesh gossip, while application bytes and retained
state use the structural-neighbor `sga` flood. A late joiner's state request
races DataChannel establishment, producing intermittent blank apps or long
mount delays.

Unify presence, application data and retained state on one control plane, or
provide mandatory retained-state replay independent of channel-open timing.
Require repeated late-join browser runs because a single green run does not
close the race.

### High risk — compaction probes concentrate load on Section 1

**Location:** `site/js/mesh.js:97`, `site/js/mesh.js:1173-1177`

Production ships `PROBLVL = 0`, allowing a compaction probe to climb without a
level cap. At a settled simulated population of 20,000, a hot Section-1 seat
receives approximately 13.7–15.1 frames per tick. A two-level cap reduces that
to approximately 3.13 frames per tick in the documented sweep.

Validate a nonzero `PROBLVL` across simulation seeds and browser twins while
retaining convergence and compactness gates, then ship the bounded climb.

### Medium — meeting history and tombstones grow without retention

**Location:** `site/run.html:7653-7660`, `site/run.html:7711`

Chat messages, file metadata, file tombstones and signed chat tombstones remain
in maps for the life of a meeting tab. Initial chat synchronization slices
messages, but the underlying maps and the metadata/tombstone payloads remain
unbounded.

Introduce explicit retention and pagination. Garbage-collect tombstones only
under a protocol that prevents deleted records from being resurrected by a
late peer.

### Medium — app subscriptions resend full collections

**Location:** `site/js/runtime.js:374-386`,
`site/js/runtime.js:1039-1044`

`subscribe()` obtains a full collection snapshot, and collection-change
notifications cause subscribers to re-read that collection. Frequent writes
to a large collection create work and cross-context traffic proportional to
the collection size.

Add delta subscriptions with sequence or revision identifiers. Reserve full
snapshots for initial subscription and explicit recovery.

### Medium — reconnect buffering drops control traffic without priority

**Location:** `site/js/gifos-net.js:164-174`

When the relay socket is down, all outbound frames share a 500-entry FIFO.
Overflow silently removes the oldest frame. Knocks and greeter registrations
can therefore be discarded behind lower-value traffic, extending recovery or
join failures.

Separate control and data queues, reserve bounded capacity for current
knock/greeter state, and coalesce replaceable heartbeat/status frames.

### Medium — one relay object is an operational concentration point

**Location:** `relay/src/relay.js:176-179`,
`relay/src/relay.js:282-325`

Each room's relay coordination maps to one Durable Object. Connected occupancy
and roster work are intentionally capped at 30 sockets, so roster fan-out is
bounded, but all door, greeter and relay-fallback activity for the room still
shares one event loop and failure domain.

Keep deep participants off the relay as designed, measure reconnect storms
against the object, and define a tested failover or sharding path before room
sizes make the door object a material bottleneck.

### Low — desktop decoration cache is unbounded

**Location:** `site/js/desktop.js:680-719`

File and blob caches have a 300-entry cap, but the decoration map grows with
every distinct app file ID seen by the tab.

Apply the same LRU lifecycle to decoration facts and revoke associated
resources on eviction.

## Existing protections

The reviewed code already bounds direct peer degree, relay byte and frame
rates, gossip deduplication, DataChannel send buffering, fragment assembly and
desktop file caches. App iframes use opaque origins and restrictive injected
CSP, messages are source-checked, app GIF signatures are canonicalized, room
control messages are signed, and relay-held meeting payloads are encrypted.

`npm audit` reported zero known vulnerabilities across 36 locked dependencies
on 2026-09-15. This does not cover vendored browser code or protocol/design
defects.

## Validation status

This ledger comes from static source review and existing regression evidence.
The expected-red 5,000-seat simulation, repeated late-join browser campaigns
and distributed fleet measurements were not rerun for this review. A finding
is not closed until its fix has a reachable regression guard in a release
battery.
