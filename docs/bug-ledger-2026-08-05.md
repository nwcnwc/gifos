# Bug ledger — 2026-08-05 (demo-failure night)

> **RE-VERIFIED ENTRY BY ENTRY against the tree on 2026-08-06 (ce294be).**
> Two entries are CLOSED and struck below; the rest are ALIVE. A ledger only
> shrinks — do not re-open a struck entry without a fresh repro.
>
> | # | status | evidence |
> |---|---|---|
> | ~~1 stale guest password splits a room~~ | **CLOSED 2026-08-06** (`31b7617` + `8e0453c`) | Reproduced first on the pi (host and guest both at 1 participant forever, guest told "This room is locked" when it was not, host told nothing). A remembered password is now a CANDIDATE: R6 probes the OPEN key once and lets the DOOR adjudicate; a password the room proves wrong is FORGOTTEN; the store is a last-used cache with a 14-day clock (`gifos_vpwat_`); a lock you did not set this session is visible while you are alone. Guarded + mutation-tested in `e2e-meet-password.js`. RESIDUAL: an entry with no stamp gets one TTL window (see the dispositions below). One regression was found and fixed in the same pass — an ADMIN's stored password is not a candidate, it is the authority her signed re-assert proves, and probing the open key with it left her own room's door open. |
> | 2 sim seed-4 FIND/PLACE livelock | **CLOSED 2026-08-06** | Repro re-run on this tree: `CHECK PASS seed=4 [seated=40/40 s1=25 dups=0]`, seeds 1-8 all pass. Killed by the V4/V5 admission waves (healing-laws §V). CAVEAT: `repro-churn-combos.sh` leg C pins seed 5 only, so seed 4 is unpinned. |
> | ~~3 sw.js can serve a pre-rename loader that 404s~~ | **CLOSED 2026-08-06** (`0871dbb`) | Root cause was narrower and worse than the entry said: `degrade()` answered EVERY navigation with the ROOT `/index.html`, so a `/versions/<v>/` navigation got the EDGE shell, whose loader then re-routed by a frozen page map. A degrade now never crosses the channel boundary — a snapshot falls back to its own `index.html` or says the build is not installed. Guarded by `test/unit/sw-degrade.js`, which runs the REAL worker against stub `self`/`caches`/`fetch`; mutation-tested. The `SHELL_VERSION` freshness check the entry proposed was NOT built and is argued against in the code: within a worker generation the cache is already version-keyed, so the check would assert nothing. |
> | ~~4 loaders with no `gifosPinTarget` hook~~ | **CLOSED 2026-08-06** (`2b71ee7`) | `sign.html` now ships the loader byte-for-byte, and the rot pattern is dead: `test/unit/channel-loader.js` DISCOVERS every `site/*.html` that ships a loader, pins the set, proves all four `pinTarget()` bodies byte-identical, and EXECUTES each page's own copy against the pin/pretty-path/edge/non-prod decisions. `store.html`'s deliberate no-loader exception is recorded there with its reason. Mutation-tested by restoring the pre-fix `sign.html` (7 reds). |
> | 5 mesh-pipe on Safari live + untested | **ALIVE** | `e2e-pipe.js` is chromium-only by construction (`ignorePins`); the only cross-engine suite tests Ed25519, not the pipe. Needs the real-Apple lane. |
> | 6 the 7-hour room fork | **ALIVE — but REPRODUCED, WATCHED and GUARDED 2026-08-06** | The live shape now has a drill (`e2e-room-fork-live.js`, in `mesh-churn.sh` + the drills tier, mutation-tested) and a detector the monitor runs on every snapshot (`test/tools/fork-detect.js`). A door-side MECHANISM is now measured too (`door-registry-probe.js`: a stale blobless claim holds the genesis forever) — relay fix REPORTED, not made. See the §6 note below. |
> | 7 iOS in-app viewers can't grant a camera | **ALIVE (product question)** | No proactive iOS-webview affordance on the join page; "Open in Safari" appears only from the preflight's failure path. |
> | 8 standby re-park lag | **ALIVE** | `redun-drill` still quarantined verbatim; part of the one redundancy-lane investigation. |
> | 9 identity rotation costs a ring window | **ALIVE** | `RING_HOLD = 220` unchanged; no signed "my old self is dead" LEAVE exists in either twin. Still a healing-laws question, not a patch. |
> | addendum: `e2e-deep-pair-heal` red | **CLOSED 2026-08-06** | Root-caused (an isolated pair lawfully self-compacts), drill rewritten to assert the sever BOUNDARY, verified 3/3 green. Suite is in the browser tier and not quarantined. |
> | addendum: serial N=2 | **CLOSED** | stale; no counter-evidence found. |
> | addendum: pinned ≤0.9.2 has no preflight | **NOT A BUG** | snapshots are immutable by design; accepted. |
>
> Two guard gaps this pass exposed, both worth their own work: `statusOf` has
> ZERO test coverage anywhere in the repo, and `e2e-stadium-dup` being
> quarantined silently un-guards a DIFFERENT, genuinely fixed bug (the stale-seat
> duplicate face).

The demo-night root causes are FIXED on main (ghost-target falsification
`0c7f93d`+`b62c31e`, knock-first boot `3dd8802`). These are the REAL findings
from the same investigation that are deliberately NOT fixed tonight, so they
don't dissolve into lore. Each has enough context to act on cold.

## 1. A stale guest password silently splits a room (E2E-key divergence)

`gifos-net.js` derives sid/tok password-FREE but the E2E key password-BOUND
(`meet-e2e` vs `meet-e2e-pw`). Two clients with different `roomPw` for the
same room share a relay session and cannot open each other's frames. And
`gifos_vpw_<room>` in localStorage is per-ORIGIN — shared between the edge
build and every `/versions/<v>/` snapshot — so a password set on a room name
ONCE (even on another build, even weeks ago) locks that name's rooms against
any guest without it. Reproduced as a forever-stall: guest's `__pwLog` fills
with `relay-error: password required`, veil reads "Still trying to reach the
meeting…" (relayUp=false branch). The pw modal DOES show above the veil, so
it is a visible refusal — but "reuse a room name you once locked" is a trap a
host cannot see: THEIR side works.

Fix direction (needs design, not a patch): key mismatches must fail LOUDLY on
the host side too (the host can see a guest knocking it cannot serve), and/or
vpw entries need an epoch/expiry tied to the room's door state.

## 2. Sim: seed-4 bystander stuck SEARCHING through a FIND/PLACE loop

`churn-combos leg C` variant: `seed 4, init 40, sever 1<->2 200t` leaves one
seat cycling state 2 (FIND sent, PLACE never lands) — `seated=39/40` at the
check, recovery only via later cycles. PRE-EXISTING: fails identically at
0.9.1 (f9dcfdb) and pre-resume; not exposed by any gate (leg C pins seed 5).
Ghost-falsification improved it (38→39) but the searching-loop core stands.
Likely the small-N tail of the V4 admission-contention family (see
docs/scale-audit-2026-08-04.md) — diagnose WITH V4, not separately.
`MESH_TRACE=<id>` (new, env-gated, both printf sites in test/sim) is the tool.

## 3. sw.js can serve a pre-rename loader that 404s

`site/versions/0.9.1/run.html` is a hard 404, normally unreachable (every
live loader maps run.html→meet.html for pre-rename snapshots). The one path
to it: `sw.js degrade()` serving a STALE v8-cached `/index.html` whose frozen
loader emits `/versions/0.9.1/run.html` — a new SW does not `skipWaiting()`
over an existing shell, so a pre-rename shell can persist. Requires the 4s
revalidate timeout to fire. Guard idea: `degrade()` refuses shells older than
the current `SHELL_VERSION`.

## 4. sign.html and store.html loaders have no `gifosPinTarget` hook

Both ship channel loaders that `e2e.js`/`runtime-page-name.js` cannot test —
the exact "guard in no battery" rot pattern the release-gate doc warns about.
`sign.html`'s `here = pathname + hash` is the un-mapped pre-rename form
(harmless today — it only ever runs at /sign.html — but rot waiting to bite).

## 5. mesh-pipe on Safari is live and untested

Safari 16.4+ HAS `RTCRtpScriptTransform`, so `supported()` is TRUE on modern
iPhones and the encoded-passthrough lane runs there — while the only engine
the pipe suite runs on is Chrome 141+ (`ec168b4` gate note). Every attach is
try/caught and nothing touches the join path (all behind `hasCoord`), so the
risk is post-seat video, not entry. Needs a real-iOS pass; also the open
pipe-lane freeze `docs/bug-pipe-stg-freeze-2026-08-05.md`.

## 6. The 7-hour room fork (monitor room `test`, 17:30→00:34Z)

Bot at `0/0.0 occ=1 links=0` while the moto sat in its app roster with live
video — two one-seat trees sharing one relay session for ~7h; two-ring
reconciliation never dissolved it; joiners into that state survived 95s/70s.
The ghost-target falsification plausibly removes the way INTO this state (a
stale entry can now be probed away), and c-sweep's split-off-fragment leg is
the sim gate for the family — but the live shape is UNREPRODUCED as a test.
Watch the monitor after the 0.9.2 deploy; if a fork recurs, capture
`greeterTrace` + both sides' `seat.state` timelines (the flap doc's missing
observability, still unbuilt).

**2026-08-06 — the shape is now REPRODUCED, WATCHED and GUARDED. Still ALIVE
as a product bug; what changed is that it can no longer be invisible.**

- **Reproduced.** `test/drills/e2e-room-fork-live.js` manufactures it with
  real browsers: two seats in one tree, then a symmetric sever, and each half
  heals itself into a one-seat tree at `0/0.0` while both sockets stay on the
  ONE relay session. Measured (raspberrypi, load < 2): forms in 6.7s, both
  halves read `0/0.0 occ=1 links=0` — this entry's reading, verbatim. 2/2
  clean runs; mutation-tested (blinding the relay-roster observation reds the
  five fork legs; forcing "nobody is in my tree" reds the silence leg).
- **Watched.** The observation that breaks the one-seat-tree symmetry was on
  the wire all along: the relay's `{t:'roster', peers:[…]}` names every socket
  on the session whatever tree its owner is in, and `run.html` already exposes
  it as `relayReach()`. `test/tools/fork-detect.js` + `meet.js` turn that into
  a verdict on every monitor snapshot (`door`/`fork` command, stderr on both
  edges, carried through the jsonl compactor). Details and the reasoning:
  docs/seating-under-flap-2026-08-04.md → "SEEING A FORK".
- **A mechanism, at the door.** `test/tools/door-registry-probe.js` shows the
  relay CAN hold two genesis instances on one session, and — worse — that a
  socket which registered a greeter blob ONCE and thereafter only knocks
  blobless (a seat's state after `requeue()`) holds the room's genesis
  FOREVER: `a.gblob` is never cleared on expiry and `a.gseen` is refreshed by
  every knock. Measured 5/5: a fresh joiner gets `founded:false
  admitted:false list:[]` forever, and the dead claim resurrects over a
  legitimate founder. That is a door at which two already-seated halves can
  never find each other — seven hours of it. **Relay fix reported, not made**
  (see the flap doc): a genesis claim must require a LIVE registration or an
  unconverted mint inside the grace.
- **And a dissolution cliff worth its own look.** The same drill measures the
  reunion after the partition lifts: a **14s** fork rejoins in **0.7-1.5s**,
  while a **~100s** fork had NOT rejoined 60s after the lift — with the door
  already handing each half the other (`fragment-rescue list=1 open=1`).
  Consistent with §9's arithmetic (RING_HOLD = 220 ticks = 110s). Not
  asserted anywhere: nobody has established a bound for this shape.

## 7. iOS in-app viewers still can't grant a camera

Knock-first (`3dd8802`) means such a joiner now SEATS, chats, sees the room,
and gets the honest view-only note — but a camera in Messages/WhatsApp
webviews may be structurally unavailable. The "open in Safari/Chrome" copy
exists on the lateMedia failure path; whether the JOIN page should proactively
offer an escape-to-browser affordance on iOS webviews is a product question.

## 8. The standby re-park lag (redun-drill, quarantined at the 0.9.2 cut)

A woken spare pipe re-parks slower than redun-drill's two measurement windows
— forensics show it DECAYING (2332→643 B/s), so the ONE-PIPE choreography
works but lags. The interleaved 12-run matrix (idle 8-core box): 3/3 red only
with knock-first AND the ghost-falsification law combined; 1/3 in every other
arm (the drill's pre-existing flake band). The two demo-blocker fixes shift
early-room link timing enough to trip a wake; the lag does the rest. Standby
pipes exist only at stage scale — no small room touches this. Quarantine
entry (c8466ba) carries the full argument. Diagnose WITH the rest of the
redundancy-lane cluster: mirror-drill's claim-ordering flake and
docs/bug-pipe-stg-freeze-2026-08-05.md. Likely one investigation, not three.

## 9. Identity rotation costs a full ring window to re-seat (~110-210s)

When dup/fork resolution rotates a device's identity, the OLD identity's
cells stay corpse-held until the probe-gated ring window frees them
(RING_HOLD = 220 ticks = 110s) — the narrowed falsification law deliberately
does not touch once-heard occupants, so the new identity re-enters against a
room that still looks full and seats only after the ring frees the corpses.
Measured: a rotated node at state 2 / occ=0 for 80s+ on an idle box
(e2e-stadium-dup forensics, tick 160); the monitor bot's 3m25s "Waiting for a
seat…" at 00:35:51Z is the same arithmetic. Within the veil's 210s promise,
but a bad 2 minutes. Design question, not a patch: should a rotation carry a
signed "my old self is dead" so the corpses free instantly (a LEAVE the new
identity can prove), instead of waiting out the ring? Needs a healing-laws
argument (a forgeable early-free is an eviction weapon).

## Dispositions added 2026-08-06 (handoff close-out night)

- **Entry 3 re-checked against the no-shims flag day (5224753):** sw.js today
  carries `SHELL_VERSION = 'v9'` and `degrade()`; whether degrade refuses
  OLDER shells than the current version was NOT re-verified tonight — the
  entry stands, now with the extra wrinkle that a pre-rename cached shell
  would reference the deleted meet.html. Same fix direction as written.
- **Serial N=2 incomplete link on the gate box (2026-07-21 residual) —
  CLEARED as stale:** never re-raised across the 0.8.7 → 0.9.3 gates; the
  serial approom suites and drills have been green on three different boxes
  since. Re-open only with a fresh repro.
- **Pinned ≤0.9.2 visitors run a build with no preflight — ACCEPTED:**
  snapshots are immutable by design; the 0.9.3 cut closed it for fresh
  visitors, and the Ed25519 fallback (0.9.4) retires most of the wall
  anyway. Not a work item.
- **NEW: `e2e-deep-pair-heal` RED TWICE on the gate host's browser tier at
  ca059c8** (was green in the 0.9.3 gate on the same host hours earlier;
  no mesh-touching commit in between). Both attempts identical shape: seat B
  (2/0.0) still ships its `sub>` product up while the partition is supposed
  to hold, stale claims (P1/P2) sit above, and the "heals after lift" leg
  passed with `secondsAfterLift: -15` — a negative interval, i.e. the
  healed MEASURE was captured BEFORE the lift, so the suite's own
  observation window is suspect alongside the partition's leakiness.
  DIAGNOSED same night (mechanism, not yet fixed): the isolated pair
  SELF-COMPACTS. Severed from everyone above, the pair's first-hand view
  says the rest of the room is dead; the healing laws then correctly walk
  the two survivors up the empty-looking tree (V4's phantom-aware deep
  admission made this rescue fast enough to beat the drill's 20s grace
  wait — the failing MEASURE shows A at 0/0.1 with rowFaces = the pair's
  OWN two ids, B a head at 2/0.0 advertising sub> of A). B's ship is a
  correct head's advertisement inside the pair's own tiny tree, and the
  drill's sender-side 'ships nothing up' assertion mis-reads it as a
  leaked partition; secondsAfterLift:-15 is the same failure echoing in
  leg 3. Whether the pair self-compacts inside the window is timing —
  hence green at the 0.9.3 gate, red twice hours later. FIX THE TEST:
  assert isolation as 'no product crosses the sever boundary' (jobs
  claimed by / delivered to seats OUTSIDE the pair), or pin the pair with
  a freeze-moves test hook; never assert 'advertises nothing', which a
  lawful self-compacted head violates.
  Logs: /tmp/release-gate/browser_e2e-deep-pair-heal.log(.retry) on the gate host.

## Dispositions added 2026-08-06 (the low-room-size pass)

- **Entry 1 — what the fix does NOT cover, said plainly.** Three residuals, in
  descending order of how likely they are to bite:
  1. **An existing `gifos_vpw_` entry with no `gifos_vpwat_` stamp gets one
     14-day window**, not an immediate delete. localStorage carries no
     provenance, so "unstamped" cannot be distinguished from "written five
     minutes ago by a build without the stamp"; deleting them all would be a
     flag day that silently drops every deployed remembered password. The
     dangerous cases are healed anyway (an open room self-corrects, a wrong
     password is evicted at the door), so the grace only delays the case the
     TTL alone covers: a stale FOUNDER re-locking a room name. That founder is
     no longer silent — the status bar says the room is locked with a saved
     password while she is alone.
  2. **A stale FOUNDER still locks the room name for the length of the TTL.**
     Nothing local distinguishes "the password this room really has" from "a
     password I typed into this name once" at founding time — only time does.
     The visible-lock line is the mitigation.
  3. **A genuinely locked room now costs up to three door knocks** for a
     device that remembers a password and hits R6 (probe the open key →
     refused → restore). A device that types the password, or is granted it,
     pays one. The cheap way out is a door hint (`&pwc=1`: "match a lock, but
     do not create one") plus `locked` in the roster for PLAIN rooms — the
     relay sends it for admin rooms already. That is a relay change and a
     coordinated deploy, deliberately not taken here.
- **Entry 1 — no derivation changed, so no DS bump.** `deriveMeetKey` /
  `meetPwProof` / `deriveMeet` are untouched; old and new clients still land in
  the same relay session for the same link. The whole fix is in WHICH password
  the client offers and how long it remembers it.
- **The local relay does not mirror production's close CODES.** Production
  `reject()`s 'password required' with 4003 (a FATAL close: the socket stops
  retrying and the app re-arms). `test/servers/relay-local.js` closes with no
  code at all, which is not fatal — and because `steadySocket` resets its
  backoff on every `onopen`, a locally-refused client re-knocks about twice a
  second, forever. Measured while reproducing entry 1. Nothing is broken in
  production, but every browser suite is testing the WRONG reconnect policy
  for policy rejections, which is exactly the shape of hazard this repo keeps
  paying for. Not fixed here (test/servers was out of scope for this pass);
  worth one commit.
- **Entry 1 — a fourth residual, recorded because it is a trade we CHOSE.** In
  the squatter race (an empty room founded by a device holding a WRONG stored
  password, which seeds the plain-room door lock), a member arriving with the
  room's REAL password is refused, exhausts the probe, and has her correct
  password forgotten along with the wrong ones — she must type it once more.
  That is the cost of evicting a password the door has refused, and eviction is
  what stops the reported trap ("one room name locked against its own guests,
  forever") from re-arming on every visit. The prompt is already up when the
  eviction happens, so the retype is one field, not a lockout.
