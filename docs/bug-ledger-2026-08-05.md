# Bug ledger — 2026-08-05 (demo-failure night)

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
