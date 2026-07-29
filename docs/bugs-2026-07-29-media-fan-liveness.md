# 2026-07-29 — live-room media-plane bugs: a starved fan job looks healthy

Observed live in prod room `test` (edge build 901, 6 seats: 2 phones + monitor
+ 1 phone attendee on cellular in section 0 rows 0–1, 2 clip bots). Evidence
captured while it happened via the meet.js REPL, the monitor's tmux session,
and read-only CDP against a phone's live tab (`test/tools/cdp-phone-meet.js`,
committed with this doc). All timestamps UTC 21:20–22:10.

The common shape of all of these is the media-plane edition of the mesh-wire
lesson ("THE RELAY IS A DOOR" — *it lied about liveness*): **a fan job whose
stream carries no frames is reported exactly like a healthy one.** Jobs stay
"active", claims stay satisfied, and the starve detector either never arms or
heals an order of magnitude slower than the budget.

## BUG 1 (MAJOR) — Stage went black+silent for every receiver when the stager unmuted

The attendee (`k_b7b0f3…`, seat 0/1.1, Android/cellular) self-stepped onto the
Stage. Receivers showed the stage briefly. The stager then unmuted their mic
and spoke → every remote stage view went black, stage audio never arrived
anywhere, while the stager's own local view stayed fine. No recovery for the
rest of the session (>20 min).

Measured at the stage distributor (seat 0/0.2, which claimed `stg:k_b7b0f3…`
and fanned it to the other three row-0 seats):

- inbound stage video: **9,445 bytes / 1 frame decoded, total** — the "brief
  moment it worked" was literally one frame;
- inbound stage audio: **46 bytes total** (negotiated at unmute, then nothing);
- all three outbound `stg:*` fan jobs: **bytes=0, fenc=0, still listed as
  active jobs** — a frameless stream fanned in perfect health.

Locus: the `mosaic.fb` starve tracker entry for the `stg:*` key read
`lastAdvanceAt: 0, lastBytes: -1, dark: false` — **the detector never arms for
stage feeds**, so no darkness is ever declared and no re-election fires. The
`sdm` entry of the same structure on the same seat arms and advances normally.

Trigger hypothesis: the stager's unmute renegotiated the stage sender (an
audio track appearing on the doctrine's video-only pipe) and the sender
stalled at the source. Whatever the sender-side cause, the plane's job is to
*notice a feed that stops advancing* — it structurally cannot for `stg:*`.

## BUG 2 (MAJOR) — Row-1's stadium was black ~5 minutes; the starve-rebuild budget is ~22 s

With 6 seats (row 1 = head `Bot2` + the attendee), the row-1 head's claimed
`sdrow:0` feed from seat 0/0.0 delivered **1,113 bytes total, video element
0×0** — no frame ever. The head dutifully mixed a black `sdm` and fanned it to
its row-mate at full encode rate (fenc advancing), so the attendee saw a live,
moving-bitrate, black stadium. Every OTHER row saw row 1 fine (the up-product
`sdrow:1` was healthy) — which is exactly why nobody upstream noticed.

The standby/claim machinery DID eventually re-elect a provider and the
stadium came back with no user action — after **~5 minutes**, versus the ~22 s
starve-rebuild residual we already carry. Re-election this slow is
indistinguishable from broken for a phone user (phone-user patience: an
ambiguous phone state means the tab gets closed).

## BUG 3 — A stale seat block duplicates a participant in the stadium

`Bot1` moved 0/0.4 → 0/0.3 under compaction. Census showed `occ=7` with 6
participants (one stale occupancy; Bot1 itself replying `occ=6`). The stadium
composite showed **Bot1 twice from the first frame it ever painted** — the
packer composes both the old and the new seat block. Persistent for the whole
session, survives provider re-elections.

## BUG 4 — Provider flapping: claims churn every few seconds in a small, stable room

The monitor's `mon` transition log recorded 30+ claim/standby transitions in
120 s (`claim sdm A→B`, `standby sdm B→A`, back again) with loadavg <1 and all
links stable. Each switch is a new sid → new stream → keyframe wait → visible
freeze; the attendee reported freeze/unfreeze cycles matching this cadence. At
one point the row-1 head claimed the attendee's own stage feed and ran a
`stg:<attendee>` fan job BACK to the attendee (self-echo of their own stage) —
while its up-fan of the same feed sat stalled at 0 bytes.

## Also observed (context, not separate bugs)

- The mesh census (`tree`) listed seat 0/0.2 and the attendee as "referenced
  but SILENT (unreachable/orphan)" while seat 0/0.2 was actively serving as
  row 0's `sdm` + stage distributor. Census reachability and media-plane
  liveness disagree completely.
- Power context (the experiment this room was hosting): both phones plugged
  in. The instrumented phone's USB budget is 2.5 W (ilim 500 mA @ 5 V VBUS)
  and its charger top-up surplus was near zero at 6 seats; the attendee's
  phone drained 41%→33% in 30 min *while charging*. On this MTK phone,
  battery `current_now` with a flat charge counter is the charger SURPLUS,
  not the system load — the earlier recipe note has it backwards under load.

## Fix pointers

1. `fb` starve tracking must arm for `stg:*` exactly as for `sdm` — and a fan
   job whose outbound bytes/fenc do not advance is DEAD, not idle: kill it,
   re-announce, force re-election.
2. Re-election latency: 5 min → the ~22 s budget. Find what gates the standby
   promotion (wakeAt backoff?) and bound it.
3. Stadium packer must evict a seat's old block when the census/roster shows
   the peer at a new coord (occ=7 vs 6 was visible the whole time).
4. Claim/standby hysteresis: a provider that is advancing frames should not
   lose its claim to a flap; require darkness (or a better score) to switch.

## Instrumentation

`test/tools/cdp-phone-meet.js` — read-only diagnostics against a real phone's
live meet tab (video element dims, avStats per-stream bytes/fdec/fenc, mosaic
jobs/claims/fb). Never activates or navigates the tab:

```bash
adb -s <serial> forward tcp:9222 localabstract:chrome_devtools_remote
node test/tools/cdp-phone-meet.js [screenshot.png]
```
