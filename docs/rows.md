# Rows — the scale-free meeting architecture

*The spec for growing a GifOS meeting from 2 people to 1,000,000 without a
single mode switch. This document is canonical: when code and doc disagree,
one of them is a bug.*

## The one-sentence model

**Rows hold people · row 0 is subscribed by all · every edge carries one
composite each way · fold up, forward down · zoom = pick your depth.**

## Design law: per-node invariants, never global modes

No line of code may ask "is this room big?". Every participant obeys the same
local rules at every size, and structure emerges from data — the way a B-tree
splits nodes at capacity without ever having a "big-tree mode". The small
case must equal today's behavior **by arithmetic** (empty sets, degenerate
folds), never by branching. Corollary: production constants and stress
constants run the same lines; only the numbers differ.

### The constants (`GIFOS_SCALE`, gifos-net.js)

| | meaning | production default |
|---|---|---|
| `C` | row capacity (people per row) | 8 (grows with rehearsals) |
| `K` | live A/V link budget per device | 8 |
| `F` | fold fanout (child rows per deacon at one level) | 16 |
| `COMP_W/H/FPS` | composite frame budget | 480×270 @ 12 |
| `HB` | status heartbeat ms | 4000 |

All injectable via `window.GIFOS_SCALE` — the same idiom as `GIFOS_CONN`.
**The K-sweep doctrine**: the e2e suite runs the identical assertions at
tiny constants (C=2, K=1…) and at production constants. C=2 with ten
browsers is a four-level tree — *harsher* per capita than a million at
production constants (~4 levels). If it converges at C=2/N=10, the million
is a relaxation, not an extrapolation. And K=∞ (production constants, small
room) must be **byte-identical to today's mesh**: same link count, same
message counts, no compositor working, no forwarding hop taken.

## Structure

- A **row** is up to `C` people inside one relay session. Members hold a full
  in-row mesh: live individual A/V links, today's code, today's quality
  ladder, today's blur/mute/moderation — a row *is* the current meeting.
- **Row 0 is the stage.** It always exists and is born empty. Everyone in the
  room subscribes to row 0's output. A room where nobody claimed the stage
  looks exactly like today's grid — today's meetings are simply rooms with an
  unclaimed stage.
- Rows above 0 fill deterministically (first-fit in row order, computed
  identically by every client from the shared roster — no coordinator).
- The **stadium** is every row that isn't yours, seen as folded composites.

Phase map (each phase keeps every earlier suite green):

1. **In-session rows** (this branch): rows partition one relay session
   (≤ relay cap). Deacons, composites, stage, buses — everything below —
   fully real at K=1 with ten browsers.
2. **Multi-session rows**: a row = its own relay session
   (sid = `H(secret|row|n)`); deacons double-home into the parent row's
   session. Same code; the "roster" a client reads becomes its row + parents.
3. **Recursive fold** (depth > 2), zoom-by-depth UI, hand-raise queue
   folding, presence counting for the record.

## Deacons — fold up, forward down

Each row deterministically elects one **deacon** (plus a ranked backup list).
The deacon does double duty — it is simultaneously the row's:

- **compositor**: folds the row's media into ONE outbound composite stream —
  audio summed (WebAudio), video pasted into a down-pixeled grid on a canvas
  (`captureStream`, same primitive as the shipping blur pipe);
- **forwarder**: carries other rows' composites (and the stage composite)
  down to its row members over the in-row links — the volunteer-relay track
  machinery, doing at every scale what it does today for one blocked pair.

**Election is capability-weighted and deterministic.** Every participant
already gossips status; it now includes a small **capability score**:
uplink estimate (`navigator.connection.downlink`/rtt when present), cores
(`hardwareConcurrency`), memory (`deviceMemory`), plugged-in
(`getBattery()` when available) — folded into one number, quantized
coarsely (so jitter can't flap the election), gossiped, and the row picks
max(score, then peer-id) — every phone computes the same winner, like the
initiator rule and the takeover election before it. Deacon dies → next on
the list, same re-election discipline as everything else in meet.

**Trust**: a composite travels with a layout manifest (who occupies which
grid cell — the stream-identity rule extended to composites). Compositors
only ever receive sender-enforced pixels: blur/mute are baked before the
compositor sees a frame, so consent survives folding by construction.

## Media algebra

- **Fold (up)**: `row composite = paste(members) + sum(members' audio)`;
  at depth, `branch composite = paste(child composites)`. Re-encoded per
  level — generational softening *is* the crowd's distance cue.
- **Forward (down)**: the stage composite is encoded once and relayed
  verbatim (no re-encode, no loss) through deacons to every row.
- **Per-edge cost is constant**: one composite up, one down, per edge,
  forever. A device decodes: its in-row mesh (≤ C−1, laddered as today)
  + 1 stage composite + 1 stadium composite. Constant at every N.

## Audio: three buses, receiver-side

Stage (row 0's audio), Row (my row's mesh audio), Stadium (the fold of
everyone else). Buses are a *receiver-side grouping by link class* — senders
tag nothing, and your three faders are your own WebAudio graph, as
ungovernable as a volume knob. Degeneracies: on stage, Stage ≡ Row; in a
one-row room, Stadium is the fold of the empty set (silence). The faders
exist at every size and mean nothing until the room grows — by arithmetic.

## Governance (the room principle, unchanged)

Anarchy is unavoidable in open rooms — so DOM hackers gain nothing over the
honest buttons — and complete control in admin rooms. Stage membership IS
row membership, so the entire table is about row moves:

| | Open room | Admin room |
|---|---|---|
| Step onto row 0 (incl. sharing an app — an app is a row-0 occupant) | anyone while seats remain; attributed | admins + stage-grantees (the moderation-table grant shipped for apps) |
| Move someone else to row 0 | nobody — invite + accept | admins invite; movee accepts |
| Remove from row 0 | attributed group action (mute/vote-off tools also apply) | admins |
| Step down / decline / "never stage me" | everyone, always | everyone, always |
| Personal stage/hide/faders | everyone, always | everyone, always |

Being staged never commandeers a camera: blur and mute are sender-enforced,
so row 0 is only a bigger audience for pixels the owner already governs.

## What this buys the million-person Bible reading

The leader stands on row 0 (stage composite: one clean stream to a million).
Every pew is a live small meeting. The congregation is the recursive
composite — the stadium shimmer at the top of everyone's screen — and the
mixing tree carries a million-voice Amen as one summed roar. The Bible app
occupies a row-0 seat with its `nav` cursor led by the reader. Every one of
those sentences is exercised by ten browsers at C=2 in CI.
