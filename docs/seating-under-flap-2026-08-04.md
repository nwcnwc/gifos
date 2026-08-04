# Seating under a flapping socket — the plane incident (2026-08-04)

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
- **Guest-side flap forensics**: persist `greeterTrace` + state transitions
  client-side (ring buffer) so the NEXT incident of this shape is diagnosed
  from the victim's logs, not inferred from the survivor's.
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
