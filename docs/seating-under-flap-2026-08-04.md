# Seating under a flapping socket — the plane incident (2026-08-04)


> **GUARDED as of 2026-08-06 (c867cd2): `test/mesh/entry-resume.js` now pins
> the mechanism and all four bounds in the gate's mesh tier, mutation-tested
> (stubbing `resumeAsk` reds 8 assertions). The adjacent work below is still
> open. Original stamp follows.**
>
> **FIX WAS LIVE BUT UNGUARDED as of 2026-08-06 (ce294be) — by this repo's own rule
> it was NOT fixed.** ENTRY RESUME is present in BOTH twins (`site/js/mesh.js`
> `resumeAsk()`, wired at the ask sites; `test/sim/mesh.cpp` + `mesh_seat.inc`),
> but NO GATE RUNS IT: `test/tools/seat-flap-repro.js` is a tool and
> `test/tools/` is not a `release.sh` tier, and no `test/sim/repro-*.sh` flaps
> a socket. A regression would be silent. Also still open: every item under
> "Remaining / adjacent work" (roster `conn` vs mesh-link honesty, retry-cadence
> jitter, dance compression, guest-side flap forensics), and the fix remains
> unverified against real plane wifi.

Nathan joined the monitored `test` room from in-flight wifi. For hours the
room read `occ=1` while his tile flickered in and out; he intermittently SAW
MonitorBot's video. The forensics looked self-contradictory — `liveVid=1`
with `links=0`, hundreds of times — until they weren't.

This doc records what actually happened, what was fixed, the measured limits
of the fix, and the options **not** taken, so the next person doesn't
re-derive them. Repro + measurement: `test/tools/seat-flap-repro.js`.
Fix: `mesh.js resumeAsk()` + sim twin (commits `8e7a8d1`, `e6cb06d`).

## What happened, precisely

Two planes, two transports, two failure modes:

- **Media** rides an `RTCPeerConnection`. Once established, RTP needs ZERO
  round trips and tolerates loss natively. During one lucky window early in
  the flight a pc came up — and then just kept streaming. That was the video.
- **Seating** rides the DOOR. An unseated entrant has no data channels by
  construction, so every entry frame crosses the relay websocket:
  `knock → GREETERS → WHOHOME → HOME → FIND → PLACE` — **three round trips**,
  and pre-fix the dance kept **no partial progress**: a socket death anywhere
  sent the entrant back to state 0. The relay counted `nosock=1012` — a
  thousand entry frames dropped because the guest's socket was gone between
  request and reply.

No seat ⇒ no coord ⇒ `linkPeers()` is empty (`mesh.js`: `if (!this.hasCoord)
return out`) ⇒ **no chat, no app sharing, no votes, no files** — the app
layer floods over mesh links, not the pc. So: video without a room.

## The decisive measurement

Duty cycle is the WRONG variable. The repro holds uptime fixed at 33% and
varies only how long the socket stays up in one continuous stretch
(1 tick = 500ms, `mesh-wire.js`):

| continuous up-window | pre-fix | with ENTRY RESUME |
|---|---|---|
| ≥ 3s | seats | seats |
| 1.5s | **never** (0/10 seeds) | 4/10 seeds |

Pre-fix requirement: *one window longer than the whole dance* (~10s to be
comfortable). Post-fix: *one round trip per window*. The cliff moves; it
does not vanish — below ~1 RTT per window nothing seat-side can help.

## The fix — ENTRY RESUME (chosen as most faithful to R2)

A retry that still holds a registry-fresh greeter list re-enters at the
WHOHOME step instead of re-knocking; the dance ratchets forward across
socket deaths. All new memory lives in the **seat**; the relay stays a dumb
zero-knowledge greeter registry (healing-laws R2). Bounds: list trusted
`RELAY_TTL` only; ≤6 consecutive knockless retries; `triedSilent` marks
re-cycled when they exhaust the list (on a flapping socket "its HOME never
landed" usually means OUR flap ate the reply, not a dark greeter); fork
probe/pick-one untouched. Ported to both twins (`mesh.js`,
`test/sim/mesh.cpp` + `mesh_seat.inc`); all mesh gates + sim repros green.

## What the plane experience should be now

Windows ≥ a few seconds: seated in seconds instead of never; chat and app
sharing work; the tile stops flapping. Sub-2s windows: still rough — resume
buys a real but partial improvement. **Unverified against real plane wifi**;
the edge auto-deploy + the monitor's nightly recycle mean the next flight is
the test. Grab the guest-side `greeterTrace` + `seat.state` timeline if it
still fails — that's the missing observability from this incident.

## Options considered and NOT taken

1. **Door-side durability** — relay briefly buffers (sealed) entry replies
   across a socket reconnect. The only lever that helps below 1 RTT/window.
   Declined for now: touches R2, needs a healing-laws argument. The narrow
   version (buffer only entry-step frames, seconds, sealed blobs the relay
   can't read) is defensible if real-world flights still fail.
2. **Data-only / lite join** — media-less join for chat. Aimed at the wrong
   layer: chat rides mesh links, not the pc's datachannel; an unseated lite
   join is just as mute. Rejected as a workaround that fixes nothing.
3. **`linkPeers()` fallback for the unseated** — relay fan-out or direct-pc
   delivery for chat when coordless. Works around seating instead of fixing
   it; violates the "the relay is not a transport" line. Rejected.

## Remaining / adjacent work

- **UI honesty**: the guest saw a flapping tile with no explanation; the
  seated side saw a roster entry with `conn=true` while `links=0`. "Seen at
  the door — not connected" would have replaced this whole investigation.
  Roster `conn` (pc-level) vs mesh-link state are conflated in the display.
- **Retry-cadence jitter**: entry retries fire on a fixed ~21-tick cadence;
  a *periodic* outage (radio scan cycles exist) can phase-lock every reply
  into the dead phase — the repro demonstrated a perfect livelock this way.
  A few ticks of seeded jitter breaks any lock; cheap, sim-sweep first.
- **Dance compression** (speculative): when the greeter answering WHOHOME is
  itself the designated admitter (common: S1 front row), HOME could carry a
  provisional PLACE — entry in 2 RTTs. Needs care with C3 fixed-designation
  and S4 fill signing; sim first.
- ~~**Guest-side flap forensics**: persist `greeterTrace` + state transitions
  client-side (ring buffer)~~ — **PARTLY DONE 2026-08-06, and the ask was
  mis-stated.** The ring buffer already existed (`mesh-wire.js`
  `greeterTrace`, 32 entries, exposed as `__gifosVideo.greeterTrace()`); what
  did not exist was anything that READ it. It is now recorded with every
  monitor snapshot and printed by `meet.js`'s `door` command
  (see "SEEING A FORK", below). Still open: a VICTIM's copy. The trace lives
  in page memory, so the one client whose logs matter — the phone that
  reloaded, the guest on plane wifi — still takes its evidence with it.
  That needs a product change (persist to localStorage across reloads) and
  belongs to whoever owns `mesh-wire.js`.
- **`nosock` and freshness**: the wire deliberately doesn't nudge the join
  loop on a nosock bounce (a stray bounce thrashes the FIND dance). With
  resume in play, unchanged — but if a bounce ever names our WHOHOME target,
  clearing that one silent-mark early would be a cheap accelerant.
- **Monitor snapshot files roll at UTC midnight** (5pm PT) — a "day" of
  forensics straddles two files. Annoying during exactly this kind of
  archaeology.
- **Moto keeper relaunch leg** is verified only to the launch intent —
  Chrome on the moto is currently failing its own cold start (Play updated
  it under a running instance; a reboot will likely clear it). Door-entry
  and camera legs verified live end-to-end.

## SEEING A FORK — the observability this doc asked for (2026-08-06)

The bug this doc's `greeterTrace` line was written for came due: bug ledger
2026-08-05 §6, the **7-hour room fork**. Monitor room `test`, 17:30→00:34Z,
two ONE-SEAT trees on ONE relay session. Nobody noticed, because from inside a
one-seat tree a fork and an empty room are the same picture, and every field
the monitor recorded was a view from inside one tree.

**The observation that breaks the symmetry was on the wire the whole time.**
The relay broadcasts `{t:'roster', peers:[…]}` — every socket attached to
THIS session, whatever tree its owner is in. `run.html` already keeps it
(`relaySocketed`) and already exposes it (`__gifosVideo.relayReach()`). One
relay session is one stadium (healing-laws R2/R3 — that is what the derivation
is FOR), so:

> a peer socketed on my relay session that holds **no cell in my occupancy**,
> for longer than any lawful entry dance, is a **second tree**.

- `test/tools/fork-detect.js` — the probe and the dwell clock. In-tree is
  proved by three independent witnesses (roster coords, `linkPeers`, my own
  section grid); a fork claim needs all three silent. Dwell 90s in production:
  past ENTRY RESUME's worst case, far short of seven hours. Verdicts:
  `solo-fork` (I am one seat and someone else is here), `split`, `door-stall`
  (I am the one outside — the joiner's view of the same illness).
- `test/swarm/meet.js` — every snapshot carries the verdict, `door` prints it
  with the greeterTrace behind it, both edges go to stderr (the monitor's
  `stderr.log`), and the verdict rides the jsonl compactor's signature: a
  forked room is the most boring-LOOKING state there is (`occ=1 links=0`,
  unchanged for hours), i.e. exactly what a shape-only signature deletes.
  `sever <peer> [secs]` manufactures the shape between REAL boxes.
- `test/drills/e2e-room-fork-live.js` — the guard, in `mesh-churn.sh` and the
  release gate's drills tier. Measured (raspberrypi, load < 1, and
  nvidia-laptop): the fork forms in 6.6-6.7s and both halves see it 6.4s
  later, at `0/0.0 occ=1 links=0` — the ledger's reading, verbatim. A HEALTHY
  room stays silent for twice the dwell, which is the leg that makes the
  others mean anything.

**It observes; it never heals.** Whether a fork of this shape should
self-dissolve is healing-laws work — mesh-wire's fragment-rescue chain
already owns every case where the door can SEE the other half, and this is
precisely the case where it cannot.

## The door itself: a stale claim that never lets go (2026-08-06)

`test/tools/door-registry-probe.js` speaks the knock protocol directly, no
browser. Two results, both measured:

1. **`{t:'knock', gk:''}` is a read-only door probe.** It is never founded,
   never admitted, stamps no `gseen`, and still returns the full live blob
   list — so a door can be censused from outside without minting a ghost.
2. **A stale genesis claim is absorbing, and the mint grace does not touch
   it.** `genesisHash()` grants the room to `a.gblob && a.gseen + TTL > now`
   ("registered before, still knocking"), but `a.gblob` is never cleared when
   it expires and `a.gseen` is refreshed by EVERY knock, blobless ones
   included. A socket that registered a greeter blob ONCE and thereafter only
   knocks blobless — exactly a seat's state after `requeue()`: state 0, same
   socket, ~10s knocks — holds the genesis while greeting nobody. Measured
   5/5 rounds: a fresh joiner gets `founded:false admitted:false list:[]`
   forever, and the dead claim RESURRECTS over a legitimate founder that took
   the room while it was briefly lapsed (`a.gkh` is never cleared either).
   That is the 2026-07-29 field signature verbatim (`hold-mint-gap`,
   listLen 0, sealed []) and a door at which two already-seated halves can
   never find each other again — a mechanism for §6's seven hours.

   The ghost-genesis fix moved the hole one branch down instead of closing
   it: `MINT_GRACE_MS` only weakens a claim from a socket that NEVER
   registered. **Fix direction (relay, REPORTED not made — it wants a
   healing-laws read): a genesis claim must require a LIVE registration
   (`gexp > now`) or an unconverted mint inside the grace. A knock is proof of
   life, never proof of greeting** — which was already the lesson.
