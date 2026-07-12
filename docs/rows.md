# The Stadium — GifOS's scale-free meeting architecture

*How a GifOS meeting grows from 2 people to 1,000,000 without a single mode
switch. This document is canonical: when code and doc disagree, one of them
is a bug. All three phases below are BUILT and suite-verified; the "as
built" notes record where the implementation improved on the original
sketch.*

## The metaphor, all the way down

A **seat** holds a person. A **row** seats `C` people — and **row 0 is the
stage**, born empty in every room. A **section** is `C` rows (`C²` seats):
one relay session, the unit the join walk fills. A **deck** is the group of
sections whose row-deacons share one level-1 space. **Levels** count the
recursion: a section's row-deacons meet one level up; the deacons among
*them* meet one level above that, and so on — depth is emergent, there is
no "top" anybody has to know about. The **stadium** is everything beyond
your own row, seen as folds.

**One sentence:** seats fill rows, rows fill sections, sections fill decks
· row 0 is subscribed by all · every edge carries one fold each way · fold
up, forward down · zoom = pick your depth.

People *walk* to their seats: a joiner knocks on sections in order and the
relay's own roster answers "this one's full" — first-come seating, no new
relay state, holes refilled by later walkers. Delegates walk their level's
spaces the same way — and walk *back* when a walked-to space stays lonely
(delegate spaces shrink; exile is not a seat).

## Design law: per-node invariants, never global modes

No line of code may ask "is this room big?". Every participant obeys the
same local rules at every size, and structure emerges from data — the way
a B-tree splits nodes at capacity without a "big-tree mode". The small case
equals today's behavior **by arithmetic** (empty sets, degenerate folds),
never by branching.

### The constants (`GIFOS_SCALE`, gifos-net.js)

| | meaning | production default |
|---|---|---|
| `C` | THE shape constant: seats per row, rows per section, and the fanout at every level | 8 (grows with rehearsals) |
| `COMP_W/H/FPS` | fold frame budget — every fold, at every level | 756×1344 @ 12 (portrait 9:16, 1,016,064 px — a million pixels filling a phone's width) |
| `HB` | status heartbeat ms — the gossip pulse everything idempotent rides. Beats prefer each pair's DataChannel (the relay is billed per frame it wakes for; the DC is free), fall back to the relay only while no DC is open, and hidden non-delegate tabs beat at a third pace | 4000 |

## The grid — audio that never smears

Voices over the internet don't smear because they're late; they smear
because each is late by a *different* amount. The grid (meet.html) makes
the difference zero: clocks sync continuously over the DataChannels
(NTP-style, min-RTT filtered), and every incoming **audio receiver** gets a
`jitterBufferTarget` so its capture-to-ear delay lands on its bus's tier.
Timing is a personal, receiver-side setting with three moods —
**Conversation** (default): the target derives from your own links only —
snappiest replies, each listener's ear de-smeared, never taxing a room for
one slow link; **Unison**: the near field (stage + your row) aligns to the
ROOM's slowest gossiped need (capped at 280ms), so laughter, "Amen"s,
responsive readings and spontaneous song are *generated* in sync across
every listener, on the shared clock — worth its latency when the room is a
congregation rather than a meeting; **Song**: not a knob (see below). When someone leads a **song** (🎵 on the toolbar:
steps them on stage, re-grabs their mic with the speech pipeline off), the
tiers stretch into cathedral acoustics: the stage plays at the same synced
instant on every device (the room sings in true unison), rows land a
uniform beat behind, far units a beat behind that — each tier internally
coherent, receding in time the way a real room recedes in space. The
leader hears the congregation answer from the far tier: the cathedral
echo. Composition is free: fold pipes tap tracks *after* the jitter
buffer, so a deacon's aligned row folds into an internally coherent
composite that downstream rooms align as one stream — align 7 neighbors
plus 3 folds and you have aligned a stadium. Earbuds make a singer part of
the choir (the speech pipeline can't separate your held note from the
choir's — see the singbtn title); speaker-phones still participate at
voice quality.

Everything else is a **consequence**: a section seats `C²` = 64 (exactly
the relay's socket cap), a device's live links are bounded by its row
(≤ C−1) plus the mesh/stage arithmetic, fold fanout is `C` at every level.
The original spec had separate `K` (link budget) and `F` (fold fanout)
knobs; both fell out of the design and were deleted.

All injectable via `window.GIFOS_SCALE`. **The K-sweep doctrine**: the
suites run identical assertions at tiny constants and at production
constants. Ten browsers at C=2 build three sections, a split level-1
space, and a live level-2 space — harsher per capita than a million at
production constants. If it converges there, the million is a relaxation,
not an extrapolation. And the small-room identity is absolute: at default
constants a room that fits one section runs **no walk, no uplink, no
compositor, no stadium** — byte-identical to today's mesh
(`e2e-rows.js` asserts it).

## As built — the three phases and their suites

1. **In-section rows** (`test/e2e-rows.js`, 21 checks): rows partition one
   session; deacons, folds, stage, buses, healing.
2. **Multi-section rooms** (`test/e2e-rows-multi.js`, 12 checks): the walk
   seats sections; row-deacons double-home into the level-1 space; folds,
   stage, chat, counts cross sections; a dead delegate heals end to end.
   *As built:* the session unit is the **section** (C rows), not the single
   row of the original sketch — the whole phase-1 machinery stays alive
   inside every session, and section capacity lands exactly on the relay
   cap.
3. **The recursion** (`test/e2e-rows-depth3.js`, 6 checks): the uplink
   spawns an uplink. Two levels are instantiated (`UP`/`UP2`); each further
   level repeats the same pattern with a longer path prefix. Depth 3
   carries ~4,096 at production constants; a million is depth 5–6.
   *CI caveat:* the depth-3 stadium is a 3-hop distribution tree; ten
   browsers on one shared CPU occasionally outrun the suite's convergence
   windows. Every autopsy shows a different last-mile straggler, never a
   repeated structural defect — production phones each own their CPU.

## Sessions and the walk

A session is addressed by a *path* mixed into the derived sid
(`deriveMeetSess`; never appended after the last dot, where the relay
reads the admin verifier). Path `''` is section 1 — a room that fits in
one section keeps today's identity byte for byte. Sections walk
`r2, r3, …`; level-1 spaces walk `u, u2, …`; level 2 is `uu, uu2, …`.
One room key seals every session of the room; the password proof is
room-wide.

**Wire glossary** (gossip stays terse): `st.leaf` = sender's section
number · `st.cnt` = its section count · `st.branch` = its deck id ·
`st.bl` = the deck's per-section counts · `'b:<n>'` = the fold of deck n ·
`'s:<pid>'` = a stage feed · global row number = (section−1)·C + local row.

## Deacons — fold up, forward down

Each row elects one **deacon**, capability-weighted (uplink, cores,
memory, wall power — coarsely bucketed so jitter can't flap it) and
deterministic (score, then id): every phone computes the same winner, and
the ranking is the succession list. The deacon does double duty:

- **compositor** — folds its row into ONE outbound stream: video pasted
  into a down-pixeled grid, audio summed through WebAudio, consent baked
  in (the same receiver-side blur/mute the tiles enforce is applied to the
  fold's pixels and samples before they leave);
- **forwarder** — carries every fold it holds down one level: to its row
  members always; to its space-row mates when it leads a space row; the
  stage verbatim wherever it goes.

At level 2 the same person may also be a **deck announcer**: exactly one
delegate per deck (first populated space-row's deacon — same-key races
would churn every receiver) paints everything its level-1 space carries
into one deck fold and swaps it with foreign decks in the level-2 space.

**Stream identity is explicit at every hop**: folds are claimed by
announced streamId with a layout manifest (who's in which cell; decks
carry their row list and headcount) — never first-stream-wins. All
announcements are idempotent and re-sent on the heartbeat; mappings that
stay streamless re-kick their pair; senders whose negotiated direction
lost 'send' re-offer. (These renegotiation rules — perfect negotiation
with polite rollback, plus fresh m-lines for all carried media — were the
hardest-won lessons of the build.)

## Presence, hands, and the echo-proof rule

Counting is hierarchical and **assertion/display separated**: what a node
*asserts* is ground truth for its role alone (a member: nothing; a
delegate: its section count and, in the level-1 space, its view of the
deck's per-section counts; a level-2 attendee: the union of deck maps,
keyed BY SECTION so a deck split across spaces can never double-count).
What a node *displays* may absorb any fresher assertion carried down
(`st.seen` — derived only from assertions, never from another `seen`, so
a stale number can't chase its own tail; it expires with the assertion
that fed it).

The hand-raise queue folds the same way, ordered by raise time then id,
entries expiring unless re-asserted within 12s. Authority to speak for a
hand: its own leaf's delegate; a *foreign* deck's level-2 attendee (for
that deck only — your own deck's truth comes from below); or your own
deck's attendee acting as the deck's **window** on the world, heard only
by non-attendees. Every hop's source is one step closer to ground truth,
so lowered hands die everywhere instead of echoing.

Chat-class gossip (chat, transcripts, file metas/tombstones, app ads)
bridges the tree by forward-on-first-sight with dedupe-by-id, backed by
periodic anti-entropy: delegates union-merge recent history across their
up edges every few beats, and whatever was news gossips onward. File
BODIES stay in-section (budget policy, unchanged).

## Audio: four buses, receiver-side

**Stage / My row / My section / The stadium** — a grouping by link class,
applied as volume on the receiving element. Senders tag nothing; your faders
are your own, as ungovernable as a volume knob.

- **Stage** — the `s:` feeds, verbatim everywhere.
- **My row** — my direct row-mate links, the people I actually converse with.
- **My section** — the *other* rows of my own section: deacon-mesh peers and
  their forwarded folds. The near-field murmur of the ~C²−C people around me.
- **The stadium** — everything cross-section: space-mate links, deck-mate
  rows, and deck folds. The far roar of the other sections.

The last two are one split of the old "Crowd" along the seam the feed already
orders by (in-section rows vs deck/deck-mate). Both are **degenerate by
arithmetic**, and their faders follow: a one-row room has no section members
(the My section fader doesn't show), a one-section room has no stadium members
(the stadium fader doesn't show). A room that is just your row shows exactly
two faders — Stage and My row — the same two-channel mix as today. The split
is what lets the reading sit clear while your section stays a faint murmur and
the far stadium is nearly off — then, on the Amen, you push the stadium fader
and the million-voice roar comes through.

## Governance (the room principle, unchanged)

Anarchy is unavoidable in open rooms — so DOM hackers gain nothing over
the honest buttons — and complete control in admin rooms. The stage
anchors at the first level-1 space; staged members never walk (their
seats ride above the delegate count).

| | Open room | Admin room |
|---|---|---|
| Step onto row 0 (incl. sharing an app — an app is a row-0 occupant) | anyone while seats remain; attributed | admins + grantees (the moderation-table grant shipped for apps) |
| Move someone else to row 0 | nobody — invite + accept | admins invite; movee accepts |
| Remove from row 0 | attributed group action (vote-off applies) | admins |
| Step down / "never stage me" / personal faders & zoom | everyone, always | everyone, always |

Being staged never commandeers a camera: blur and mute are sender-enforced,
so row 0 is only a bigger audience for pixels the owner already governs.
Admin *stamps* are relay-scoped, so moderation is per-section for now; the
receiver-side filters (stage, apps) hold at every level because they run
on gossip, not stamps.

**The password lock is occupancy state, and that cuts two ways.** In an
**admin room** only an admin may (re)establish the door lock: after a relay
eviction a non-admin who wins the reconnect race can neither seize the room
with a rogue password nor unlock it — until an admin arrives it's an open,
blurred, self-closing waiting room, and the admin re-asserts the real lock on
arrival. In an **open room** the first arrival to an empty room still seeds
the lock, **by design**: a squatter can lock a given open room by setting a
password, but only at the cost of a perpetual bot holding that one room while
an infinity of open rooms stays free — a losing trade, and the price of
fun-but-safe anarchy. A room that must be un-seizable is an admin room.

## Known refinements (deliberately deferred)

- **Deck-internal fold granularity**: at production constants a deck
  member can be forwarded up to C²−1 individual row folds; fold a deck's
  rows into per-section folds before forwarding (one more pass of the same
  machinery) to keep the strip constant-size.
- ~~Stage seat reservation~~ — done: the relay's session cap is C²+C
  (a full section plus a double-homed stage). The relay's `C` is a
  hardcoded twin of `GIFOS_SCALE.C` — never a client parameter (letting a
  stranger size a Durable Object is an attack vector); raise the two
  together.
- **Depth ≥ 4 instantiation** (the pattern repeats; the loop isn't written).
- **Walk gallop** for O(log) seating in huge rooms; **room-wide admin
  gossip**; **zoom as re-subscription** (today zoom grows the tile —
  pick-your-depth display, not yet pick-your-depth subscription).

## What this buys the million-person Bible reading

The reader stands on row 0 — one clean stream, encoded once, forwarded
verbatim to every section. Every row is a live small meeting. The
congregation is the recursive fold — the stadium shimmer at the top of
everyone's screen — and the folding tree carries a million-voice Amen as
one summed roar. The Bible app occupies a row-0 seat with its `nav`
cursor led by the reader. The headline number is the leaf-keyed count no
stale echo can inflate. Every one of those sentences is exercised by ten
browsers at C=2 in CI.
