# The GifOS meeting

A GifOS meeting is a **serverless, peer-to-peer video room with no size limit**.
Your video, audio, and control messages go **straight to the other people, never
through a server** — the founding rule of the whole system. The relay
(`relay.gifos.app`) is only a **zero-knowledge greeter**: it introduces browsers
to each other and then gets out of the way. It never carries a byte of media,
never learns the room code or password, and stores nothing.

This doc is the **map**. It describes what a participant sees and does, then
points at the four canonical docs that specify each layer:

- **Control plane** (who connects to whom, joining, healing) — [`healing-laws.md`](healing-laws.md).
- **Media plane** (how audio/video is composited and fanned) — [`media-plane.md`](media-plane.md).
- **Security** (the door lock, admin authority, sponsor forwarding) — [`meet-security.md`](meet-security.md).
- **Apps in a meeting** (a shared app on the mesh) — [`app-mesh.md`](app-mesh.md).

The page itself is `site/meet.html`, a **system app** (trusted first-party code,
not a sandboxed GIF app) because live camera/mic + WebRTC cannot run in the app
sandbox. Its control brain is `site/js/mesh.js` (a line-for-line port of the C++
reference sim in `sim/`), bound to real WebRTC transports by
`site/js/mesh-wire.js`, with media in `site/js/mesh-media.js` and the shared
transport fabric in `site/js/gifos-net.js`.

---

## The stadium — one metaphor for the whole room

A meeting is a **stadium**. You never meet a million faces; you meet the few
around you, and the rest is a living backdrop. The vocabulary is canonical
(CLAUDE.md, `healing-laws.md`, `media-plane.md`) — the old deacon/deck/fold model
is dead:

- **Seat** — one person, at a coordinate `{pc, r, i}`: `pc` the section path, `r`
  the row, `i` the column. `C = 5`.
- **Row** — the handful of people right next to you. You hold a **direct** WebRTC
  link to each of your `C-1` row-mates: this is your real conversation, lowest
  latency, full quality.
- **Section** — an internal `C×C` block of the tree (25 seats). You see it as a
  live composited mosaic, assembled by you from feeds arriving over your
  cross-link. A section is **not** its own relay session — it is pure P2P tree
  structure.
- **Stadium** — the whole room = **one** relay session = **one** URL. Everyone
  beyond your section folds down into a single composited backdrop and one summed
  "roar."
- **Stage** — a *special*, deliberately-chosen broadcast tier, capped at `C`,
  seen and heard first by everyone in the room (a speaker, a song leader, a
  shared app). It is **chosen** by a deliberate act — self step-up in open rooms,
  admin-granted in admin rooms — never filled by seating. It is **not** "row 0"
  of anything.

**Section 1** (path `''`) is the home: `C² = 25` uniform seats meshed by their
own rows plus cross-links, with nothing above them. It is the top of the tree and
the pool of greeters (below).

### Why it scales without limit

Each row automatically combines its members' video and voices into **one tile and
one sound**, and rows combine again into sections, sections into the stadium.
Every seat has **bounded degree ≤ C+1** and does only a constant amount of work
no matter how large the room grows — a phone only ever carries its own little
corner. The room scales by getting **deeper**, and depth adds a little latency to
the far-stadium backdrop (physically unavoidable: you cannot show a composite of
the whole room before the whole room has been composited), never per-seat load.
See [`media-plane.md`](media-plane.md) for the four channels (Row, Section,
Stage, Stadium) and exactly how composites are built and fanned up/down the tree.

---

## Joining a meeting (control plane, at a glance)

The relay is a **greeter registry**, not a switchboard. A newcomer:

1. **Knocks** the front door with a throwaway personal key, sending the hashed
   room URL.
2. Gets back a **sealed greeter list** — a TTL'd set of sealed `{peerId, coord}`
   addresses of Section-1 seats currently serving as greeters. (An empty list
   means the room is fresh: the first knocker founds it — genesis.)
3. **Reaches a greeter** (a randomly chosen one, to spread load), does the
   newcomer dance, and is **placed at a definitive vacant seat** in the tree.
4. Once seated, most seats **drop their relay socket entirely and run
   socketless** — only members joining or currently serving as Section-1 greeters
   hold a socket. Everything else (seating, healing, chat, status, votes, media)
   rides the mesh's own WebRTC links.

There is **no stored home**: a live walk of the mesh reaches a Section-1 seat and
returns the current roster. When seats die, rows heal themselves by promoting a
leaf from their own subtree, and orphaned subtrees either refill in place or drain
and re-seat — all P2P, with the relay untouched. The full set of detection,
healing, anti-cascade, and entry laws is [`healing-laws.md`](healing-laws.md);
`site/js/mesh.js` is the faithful port of the reference sim (`sim/`) that
implements them (fixed-designation healing, first-hand liveness, S4 identity).

**Efficiency note:** encodes = links. A seat only ever encodes media for the
bounded links it holds; deep seats that have dropped their relay socket cost the
infrastructure nothing at all.

---

## What a participant sees and does

The screen is **one endless vertical scroll, nearest-first**: the **Stage** on
top, then **your row's** live faces, then the rest of **your section** as a
mosaic, and finally the **far stadium**, folded smaller the farther out it sits.
In a room that fits inside one section, the mosaic simply *is* your section; the
far-stadium tier only appears once the room grows past it. Tap any folded tile to
zoom it; tap again to fold it back.

The controls worth knowing:

- **Blur** (Max / Min / None) — how blurred *your own* video looks to everyone.
  You always control your own camera; nobody can un-blur you. Everyone joins
  muted, camera off, and Max-blurred — invisible until they choose to be seen.
- **Stage** — step up to be seen and heard first by the whole room; tap again to
  step down.
- **Hand** — raise it to join the room-wide **hand queue** (below), in order.
- **Password** — the key to *clear* video (see the door, below).
- **Mix** — your own private sound board: independent faders for **Stage**, **My
  row**, **My section**, and **The stadium** that appear as the room grows big
  enough to need them, plus a **Timing** control (Conversation / Unison / Song).
  It only changes what *you* hear.
- **Invite** — mint a link; also where you create an admin room ("a room you
  control").
- **Run app** — share an app (a Bible, a board, a game) the whole room uses
  together, live (see [`app-mesh.md`](app-mesh.md)).
- **Record / CC** — record a composite to *your own device* (blurred feeds stay
  blurred), or turn on live captions your phone writes from your own voice; lines
  gossip P2P into one attributed transcript.
- **Admin** — appears only inside an admin room, to sign in and moderate.

A **front door, not a cold plunge:** opening Meeting lands you in a **lobby**
(start a meeting, start a room you run, join a link or id, or reopen a recent
one) with the camera **off** until you choose — no light, no permission prompt
just to read the menu. A real invite link or `/meet/<room>` skips the lobby.

**Stepping away** keeps you in the meeting: flip to another tab and you keep
hearing and being heard; your tile says "away" (never mislabeled as
firewall-blocked), your camera pauses to save battery, and a wake-lock keeps the
call and any recording alive in the background.

---

## The hand queue

**Hand** raises a hand the whole stadium can see: one ordered, room-wide queue
of people waiting to speak, derived identically on every phone. There is no
list to keep and nobody keeps it — like the Stage and the rows, the queue is
**pure derived bookkeeping** over gossiped status.

- **Transport — the status pulse.** Raising stamps a timestamp
  (`myStatus.hand = Date.now()`; lowering clears it) into the same status
  heartbeat that already carries mute/blur/stage — no new channel, no
  coordinator, and the flag is strictly **self-owned**: only your own client
  ever sets or clears your hand.
- **One order, derived everywhere.** Every phone sorts the gossiped raised
  hands by **raise time, then id** (`handQueue()` in `site/meet.html`) — a
  pure function of shared status, so however deep the tree, every device
  shows the same line in the same order. A same-millisecond tie breaks on the
  id, deterministically; nothing is elected and nothing is synced.
- **Freshness — a hand needs a live pulse.** A hand only counts while its
  owner's status has been heard within **15 s** — the one freshness rule the
  Stage (`stageIds`), consent, and the roster already use. A vanished peer's
  raised hand therefore clears from the banner as soon as their pulse stops
  (and instantly when their departure is confirmed — the D2/D5 event-driven
  removal drops them from `rosterIds`, which the queue derives over), instead
  of lingering until roster machinery buried them. An honest, briefly-quiet
  peer never flickers: even a hidden tab re-beats every 12 s, inside the
  window.
- **The banner.** One line above the feed (`#handq`): `✋ N waiting:` plus the
  first **8** names in queue order (the head of the line in bold), then a
  `+K` overflow count. It repaints only when the derived line actually
  changes — a beat that changes nothing touches no DOM.
- **Tile float.** A raised hand floats that tile toward the top of the grid,
  in raise order; the Stage always outranks raised hands.
- **The glyph — and where it disappears.** A ✋ is burned onto the person's
  face at the leaf (`drawOverlay`, [`media-plane.md`](media-plane.md)) and
  rides the composited pixels up the tree. Past the overlay threshold
  (`stadiumTiny`, ~100 people) every square is too small for any overlay and
  the glyph is dropped with the name and frame — only the talking dot
  survives. This is by design: **the banner and queue are the authoritative
  signal at every scale; the burned glyph is best-effort decoration below the
  threshold.**
- **Answering a hand — open vs admin rooms.**
  - **Open room:** the queue is purely informational. Self step-up remains
    the only way onto the Stage; there is no authority to call on anyone.
  - **Admin room:** for a signed-in admin the banner is **actionable** —
    tapping a queued name issues that person the room's existing
    **individually signed** stage/app grant (the same §SIG mod-table `app`
    grant that gates apps — [`meet-security.md`](meet-security.md); no new
    privilege channel exists). The grantee's client treats a grant that
    arrives while its own hand is raised as being **called up**: it steps
    onto the Stage by itself, subject to the ordinary cap of `C`. A grant
    that predates the raise is just standing rights, never a call-up.
    Non-admins see the identical banner, inert — and every receiver verifies
    the grant's signature, so a forged tap changes nothing anywhere.
- **Auto-lower.** The moment my own id enters the Stage set (`stageIds()`) —
  by self step-up or by an admin's call-up — my client lowers **my own** hand
  and broadcasts: an answered hand leaves the queue by itself. It runs on the
  2-second beat (idempotent) plus directly on the step-up tap for
  snappiness, and it is strictly self-owned — no peer ever clears another's
  hand.

---

## The door: open rooms vs admin rooms

A meeting's URL declares its governance, and **the address is the contract**:

- **`gifos.app/meet/<room>`** is an **open room** — *anarchic forever*. No admin
  exists and none can be imposed mid-meeting. Order is kept by **peer-enforced
  civility**: anyone can mute or blur anyone for the whole room (always
  attributed, un-liftable by the target), and a **personal, global vote-off list**
  (device ids in your own browser) that the relay tallies as a live majority of
  connected devices — cross the threshold and you're removed, and the vote follows
  the person into every room. There is **no shared ban list** to forge.

- **`gifos.app/meet/<room>/<verifier>`** is a **different room** that declares an
  **authority**: joining it *is* consent to be moderated. The verifier is a hash
  of the admin password (PBKDF2, room-salted); **admin power is knowing the
  password**, typed on your device, never in any URL or on any server. Privileged
  orders (mute/blur, ban, set/re-key password, grant the `app` right) travel
  **individually Ed25519-signed** and are verified identically by every peer and
  by the relay for its door duties. No socket is "an admin socket"; no transport
  confers authority. Bans sever live media and refuse rejoins. An admin room
  **only lives while an admin is present**: without one it is a blurred waiting
  room (nothing clears), and after a 10-second grace a visible 5-minute
  countdown runs and then evacuates everyone — the admin returning cancels it.

**The lock is cryptography, not a gate.** A locked room's end-to-end key mixes the
password into its derivation, so without the password you cannot *read* the room —
the greeter list itself is sealed under that key. Clear (unblurred) video requires
a **password** plus consent (an admin present and that guest consenting, or — in a
plain room — a password and *everyone* ready), so an open passwordless room can
never show clear faces. File sharing likewise needs a password. Full doctrine:
[`meet-security.md`](meet-security.md).

---

## Connectivity: no TURN, ever

GifOS configures **STUN only, no TURN server, anywhere** (`site/js/gifos-net.js`)
— a TURN server is a media relay, which the design forbids. When two people
genuinely can't reach each other directly (both behind strict NATs), a **mutual
friend's browser** forwards between them (the **P1** friend-relay: `{t:'fwd'}`
over two DataChannels), labeled "📡 via <friend>" on the tile, handing back to a
direct route the moment one forms. Media and file *bodies* ride **P0 → P1 only,
never the relay**; chat-class control can additionally fall back to sealed
envelopes over the relay (**P2**) so a fully P2P-blocked participant can still
converse. If no path exists at all, the tile sinks to the bottom and says why.

Every video stream is **bound to identity** — a tile shows a stream only if its id
matches what that peer announced for its own media (or was explicitly mapped by a
relayer), so a friend-relay taking over mid-meeting never shows the wrong face.

## What the relay knows (and doesn't)

For a meeting the relay holds only: live sockets, opaque peer ids, room-salted
device tags, a salted IP hash for abuse caps, `H(genesis key)`, and TTL'd
**sealed** greeter blobs. It reaches a greeter directly by that greeter's opaque
peer id — greeters are the room's public front door, so targeted delivery to one
is fine and expected (there is **no** "blind fan-out" requirement; earlier drafts
demanded it and it bought no privacy at O(sockets) cost). What keeps the relay out
of the room's life is **scope, not blindness**: it is used only for greeting and
bootstrap, never as a transport for ongoing traffic. It never holds the room code,
the password, the E2E key, a name, an IP, a coordinate, or any notion of who is
seated. See [`meet-security.md`](meet-security.md) and `threat-model.md` Boundary D.
