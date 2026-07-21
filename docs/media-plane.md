# The GifOS media plane (canonical)

How audio/video flows over the no-root introducer mesh (`docs/healing-laws.md`).
The **one principle**: *distribute the media processing across every participant,
with zero dedicated infrastructure.* No media server, no elected relays, no
"beefy node" — every seat composites and forwards its fair share, using only the
links it already holds for control. **Three** channels ride the same topology:
**Row**, **Stage**, **Stadium**. (A fourth, the C×C **Section** composite, was
dropped — see the note under Channel R — to free its cross-link budget for the
Stadium/Stage cross-link redundancy.)

### Friend-relay (E5 §1) — not a media server, not a meeting merger

When two **co-members of one meeting** cannot open a direct WebRTC path but
both reach a **third peer already in that same room**, that peer may volunteer
as a **friend-relay** ("via Hub"): it forwards media over links it already
holds. That is **not** infrastructure GifOS pays for and **not** a Durable
Object carrying A/V — it is another browser in the room. Healing-laws **E5**:
use friend-relay among co-members; a **new joiner who can see two meetings
must pick one (R5), never auto-bridge/merge them** (attacker-shaped sole
common witness). Implementation: `site/meet.html` peer-relay; gate:
`test/drills/e2e-peer-relay-reunion.js` (ICE-split co-members, then a third
co-member joins the **same** room and relays — not a two-meeting merge).

The whole geometry derives from `C` (`site/js/gifos-net.js` SCALE, C=5) and the
link primitives in `sim/topo.h` (ported to `net.topo`):

- **row mesh** — a seat is fully meshed with its `C-1` row-mates.
- **cross-link** — every non-head (column > 0) holds one link to its transpose
  partner `(r,i) ↔ (i,r)` within the section; these make the C×C section one
  connected graph.
- **up** — a **head** (column 0, not Section 1) holds one link to its parent.
- **down** — **every** seat holds one link to one child head (`down(pc,r,i) =
  (childPath(pc,i), r, 0)`), whose `up` is exactly this edge.

Bounded degree ≤ C+1 per seat, always. Nothing else exists to route media over.

---

## Channel R — Row (your row-mates)
Direct, full quality: the `C` seats of a row are already fully meshed, so each
holds every row-mate's stream directly. No compositing, no forwarding. This is
the tightest, lowest-latency tier — the people you're "sitting with."

### Channel Se — Section — DROPPED
The old C×C Section composite (the self-assembled block of your section's other
rows, exchanged over cross-links) has been **removed**. Its per-seat compositing
and its use of the cross-link were the price it cost; that budget now pays for
the **cross-link redundancy** the Stadium and Stage need (below). Section-mates
are not lost — they fold into the **Stadium** like everyone else, and your own
row stays live and full-quality on Channel R. The cross-link is freed to carry a
*second, independent* copy of the Stadium/Stage fans instead of a section block.

## Channel St — Stage (the chosen ≤C broadcasters)
A decoupled, deliberately-chosen set (never row 0 — STADIUM vocabulary in
CLAUDE.md), capped at `C`. **Entry** is per room type: self step-up in open
rooms, admin-granted in admin rooms. **Membership rides phone-home**: a stager
announces its coord + a stage flag/timestamp in its status heartbeat, so every
seat knows who is on Stage and in what tile order (the cap-C set is
deterministic — earliest timestamp wins, ties by coord), and joining is just
flipping your own flag.

**Assembly — the Stage is a "row fold" assembled at Section 1, not down-tree:**
1. **Collect.** Each stager's raw feed relays **up the tree** to Section 1 — a
   deep stager ships it to its row-head, a head ships it up its up-link, hop by
   hop (`shipMos('stg:<id>', upTgt)` in `meet.html`) — until it reaches Section 1.
   (An earlier design had the stager open one direct off-tree link to a known S1
   seat; the deployed code relays it up the tree instead, so the collect leg is a
   single up-chain, not a 1-hop link.)
2. **Spread (~2 hops).** That S1 seat relays the feed across the Section-1
   row+cross mesh (the W5 roster fabric), so **every** S1 seat holds all ≤C feeds.
3. **Composite + fan down (video).** Each Section-1 seat composites the ≤C feeds
   into **one** horizontal Stage strip **itself** (redundant, parallel, no
   election — the Stadium doctrine) and fans that single **video-only** stream
   down its subtree; heads forward it down.
4. **Audio folds at the edge (mix-minus).** The strip carries **no audio**. The
   ≤C individual stager feeds fan **down** the same path as the strip (tiny
   streams), and every device folds the Stage audio **locally, skipping its own
   feed** — a stager never hears their own voice come back. Mixed audio is mixed
   paint: once summed a voice can never be removed, so exclusion must happen at
   the LAST mix, which is why the last mix is at the ear (see Channel Sd's
   mix-minus law).

**Stagers live on the Stage ONLY — and the exclusion is now complete, on the
sender side too.** While on Stage, a stager's face and mic are **excluded from
their row's product** (and therefore from every Stadium mix), row-mates play no
direct stager audio, **and the stager's own MAIN camera+mic senders are
parked** — `replaceTrack(null)` on every direct peer link the moment the
gossiped stage set includes them (the m-lines stay negotiated, so stepping
down restores the current tracks with a pure `replaceTrack`, no
renegotiation). The stager's `stg:` aux feed — the blurred/raw video **plus
the mic** — is the one thing that leaves their device; every ear folds that
audio via the stageEar (skipping its own), and row-mates **hide the stager's
direct grid tile** (it would be a black square) — the stager appears in the
Stage strip like everyone else, and the tile returns on step-down. No double
appearance; no voice arriving twice at two different latencies (the
reverb-smear bug); no duplicate upload; and the broadcaster's row-facing load
drops away exactly when they take on the fan-up cost. Track swaps mid-stage
(blur pipe on/off, mic-mode/camera re-grab) never resurrect the parked main
senders — the fresh track reaches the room through the `stg:` ship, which
re-ships exactly when a track actually changes.

One composited strip for the picture, **not** ≤C separate video streams —
fan-out is one cheap stream and a fixed panel is what a broadcast tier wants
(audio is the exception above, and ≤C Opus tracks are near-free). Latency = 1 (to S1) + ~2
(spread) + tree depth (down); less than Stadium (no per-level composite on the
way up), as befits the live tier.

**Where the redundancy is.** At Section 1 the strip is composited **in parallel
by every S1 seat** (no election) and the raw feeds spread across the **row+cross**
Section-1 mesh — so losing S1 seats degrades gracefully. And now the delivery
legs are **no longer single-path**: the fan-down `sgs` and the collect leg both
ride the **cross-link at every level** in addition to the tree (see Channel Sd's
"Cross-link redundancy" — the mechanism is shared). A non-head that loses its
row-head's strip picks it up from its cross-link peer (a different row, a
different up-link) in ~2s via sticky `claimMos`, and a stager's feed reaches S1
by two independent up-paths (the S1 flood dedups the copy). The mid-tree freeze
is closed.

**An APP on Stage carries a DATA stream, not A/V.** Running an app occupies one
of the ≤C Stage seats (it counts toward the cap), but instead of camera pixels
it broadcasts the app's shared **state** (small — deltas over the data channel),
fanned down the same Stage path. It does **not** take a slot in the A/V strip —
the strip composites only the A/V stagers, contiguous, no gap. The app renders
in its **own dedicated UI region**, and each client runs it **locally** from the
data stream. This reuses GifOS's P2P app-state machinery, now broadcast
stadium-wide — a collaborative app on the Stage, crisp and interactive, for the
price of a data stream instead of a video one.

## Channel Sd — Stadium (everyone, as one equal-square mosaic)
The novel tier: the entire room assembled into a single mosaic by the
participants themselves, **up** the tree and back **down**. Every person is an
**equal-size square** — a subtree of 100 people is **100 equal squares**, never
one shrunken cell. It is ONE stream **per link**, composited up the tree and re-mixed on the way
down (election-free, same transport discipline); the packing is equal-square,
not fractal — and the down-flow is **per-branch mix-minus** (below): nobody
ever receives a mix containing their own row.

### Up-assembly (every row head, recursively) — gapless equal-square packing
The compositing core is the **gapless packer** (`site/js/mesh-media.js`:
`packGrid` / `faceSrcRect` / `createPacker`). A face is a centered-square crop of
a camera (`coverBox`); a received sub-mosaic is a **packed block** of `n` faces
in `cols` columns, and the block's `{n, cols}` rides the announce (two ints on
the existing control frame — zero video bandwidth). A row **head** lays its
row's live faces **plus** each down-link's received block into ONE gapless grid,
**blitting every face of a received block out by sub-rect** and repacking it flat
— so faces never nest; the whole subtree contributes its people as equal squares,
not as one contained cell. That flat block is what it sends **up**. Up one level
the parent does the same with its row's blocks. The compositor is **always a row
head gathering its row's down-links** — no other coordination exists — and its
forward cost is one fixed-budget canvas regardless of how deep the tree runs.

### Shape — grows DOWNWARD, ~5 wide, then caps + densifies
The final mosaic (`stadiumGrid`, the `'stad'` pack shape) is packed for a
**vertical** surface (scroll down, never sideways):
- **Readable range** (≤ ~STAD_CAP≈100): ~**5 columns** wide, growing **downward**
  — square-ish near 25 (5×5), a tall ~**1:4** rectangle by ~100 (5×20).
- **Cap + densify** (> ~100): the **footprint stops growing** (held at the
  ~100-person tall rectangle) and each person's **square shrinks** to pack more
  in — pixels/person fall, footprint fixed. `createPacker('stad')` sizes the
  square against a fixed footprint width, so `cols > 5 ⇒ smaller square` falls
  out automatically.

### Overlay threshold — tapestry + green audio-dot
Each square burns its info overlay (name / status / hand + green talking-frame)
at the **leaf** (it rides the pixels up the tree — `drawOverlay`), **except**
once the squares drop below a size threshold (past the cap — `stadiumTiny`,
driven by the gossiped room size so every up-tree compositor agrees). Then the
overlay is **dropped** and the square shows just the raw video **tapestry**, with
only a small **light-green shaded dot** when that seat is talking — the minimal
signal that its audio is blended into the mix.

### The Section-1 finish (redundant, parallel, no election)
Section 1 (`pc=0`) has **no up-links** — it is the top. Each Section-1 head has
assembled everything beneath its own subtree; it then exchanges its assembled
block with the other Section-1 rows over the **cross-links** (`x1`→`x2`→`sdrow`)
and from those blocks packs the mix-minus **views** below (`'stad'` shape) —
its own row's view and one down-ingredient per child branch — rather than one
identical whole-Stadium for everyone. **Every** Section-1 head does this
independently. It is deliberately redundant: computing it C times in parallel
costs wall-clock nothing extra, and it means the room never has to *elect* one
seat to assemble the Stadium for everyone (an election is a single point of
failure and a scaling bottleneck). This is the same doctrine as the healing
plane's parallel greeters — no chosen coordinator, ever.

### Mix-minus (the down-flow) — nobody ever receives a mix containing their own row
Two physical facts force the down-flow's shape:
1. **Mixed audio is mixed paint** — once summed, a voice can never be removed.
   Exclusion must happen at mix time, never after.
2. Each row must not receive itself (self-echo through the Stadium; row-mates
   are already heard live on Channel R) — and different rows need different
   exclusions, so **one shared down-stream cannot serve everyone**.

So every down-mix is built **additively from pieces the head already holds
separately** — nothing is ever subtracted, so nothing ever comes down empty:
- **The row's view (`sdm`).** Each head packs [everything outside my branch] +
  [each child's block] — everyone except its own row's faces — paints it as THE
  Stadium tile and fans it to its row-mates. Your row is never in your Stadium;
  your row is the Channel R tiles on the same screen. **Every face on screen
  exactly once.** At Section 1, "outside my branch" = the other rows' `sdrow`
  blocks; deeper, it is the `sdn` ingredient received from above.
- **Per-child down ingredients (`sdx` → `sdn`).** For each seat of its row with
  a down-child, the head packs [outside my branch] + [my row's faces] + [every
  OTHER child's block] — the one piece left out is that child's own branch —
  ships it to that seat (`sdx`), which relays it down as `sdn`, where it becomes
  the child head's "outside my branch". Each hop **adds** what the branch below
  hasn't heard; the walk down never empties.

Video and audio ride the same per-branch stream: each link encodes its own copy
anyway (there is no free shared broadcast), so per-branch streams cost no extra
encodes, and each packer's audio fold sums exactly its own tiles — the audio
mix-minus falls out of the video packing for free.

**Redundancy — ONE pipe moves bits; every alternate path is parked.** A
per-branch mix has exactly ONE producer (the head) — a *neighbour's* mix can
never substitute (it contains YOUR row) — but the SAME mix is *negotiated*
over every link-disjoint path the topology offers: `sdm` re-fans laterally
mate→mate, and each `sdx` ingredient also travels head → carrier row-mate →
target seat (`sdxc` → `sdx^x`, same slot). The up legs keep their x1/x2
backup. The law for all of them is **one-pipe**: only the claimed PRIMARY
carries media. The best alternate is kept as a **parked standby** — claimed,
its m-lines negotiated, a decoder element waiting — but demanded idle
(`replaceTrack(null)` at the sender: zero bytes). Every further announcer is
a dormant spare. A primary failure **demand-wakes** the standby (one control
frame; a pure `replaceTrack` at the sender, no renegotiation) while the dead
pipe lingers its last frame under the grace; the standby takes the slot the
moment it demonstrably **flows** (frames observed). Target wake ≤2s — always
inside the 5s grace linger. When the preferred tree-direct path returns,
**failback is make-before-break with hysteresis**: the preferred feed is
staged as the standby and woken *alongside* the live primary — the one
sanctioned two-pipe overlap — and the roles swap only after it is flowing
and has been back a full settle window (~5s), so a bouncing link cannot
oscillate the roles; the loser re-parks.

*Why the law changed* (from "primary + hot standby, both decoding"): the
"grace, not teardown" linger already freezes the last frame across any
sub-5s failover, which made the hot standby's zero-flicker advantage nearly
invisible — while its steady cost was very real (every redundant slot
decoding, and its sender encoding, a second full copy forever: ~2× media
bytes on `sdm`/`sdx`/`sgs`/`stg:*`/`sdrow:*`). One pipe hot, everything else
parked, buys the same user experience at half the steady bandwidth; the
brief two-pipe overlap during failback is the sanctioned exception. What
remains single: the head as PRODUCER (a dead head leaves its row
Stadium-dark until healing (C3) refills seat 0 — seconds — while Channel R
and Stage are unaffected). The final parent-seat → child-head `sdn` hop has
its own parked mirror — the dormant chain below.

**The sdn dormant mirror — the missing standby.** The parent-seat →
child-head `sdn` hop used to be the one mix-minus leg with no second path: a
dead parent seat froze the whole child branch's Stadium until healing. It now
has a **link-disjoint mirror chain**, computed by `sdnMirrorRoute`
(`mesh-media.js`) from the topology primitives alone: the producer is the
parent row's **head** (which already builds the per-child ingredient), and
the chain enters the child section through a **different row t's** down-link
— for a deep parent, head → row-mate → cross fold → `(pc,t,i)` → down →
`(cpc,t,0)` → across the child section's row/cross links → the child head;
an S1 parent starts head → `(0,t,0)` over the rook **column** instead; `r=0`
and `i=r` use the adapted cross folds (`(0,t)↔(t,t)`, `(r,r)↔(0,r)`). Every
case shares **no edge** with the direct sdx/sdn legs and never touches the
parent seat itself (verified exhaustively by `test/unit/mirror-route.js` — at C=5
every `(r,i)` case has a valid transit row). The chain rides the ordinary
mosaic machinery: each hop is a keyed ship (`sdnm:<dst>`) **born parked**
(zero media, m-lines negotiated), re-derived from occ on the 2s sweep so
churn re-routes it within a sweep; carriers **relay only** — the mix contains
the producer row's faces, so a carrier must never claim or play it
(mix-minus) — and only the destination child head resolves the mirror to its
own `sdn` slot, where the one-pipe law above treats it as the parked standby.
A wake **propagates end-to-end in one pass**: each woken hop immediately
demands its own upstream awake, one cascade of control frames, never one hop
per sweep. Failback to the direct hop is the same make-before-break swap.
**When no mirror exists:** a child section with only ONE occupied row head
has exactly one physical edge from above — every alternate entry is a
down-link into one of its *other* rows' heads, and those seats are empty —
so a sparse branch (any room where a child section holds a single row)
provably has no disjoint route with the current link set. The mirror simply
isn't built there; the 5s grace linger plus healing remain the backstop of
last resort, exactly as before.

### The latency offset
The Stadium necessarily lags Stage (and the live Row) by exactly the time the
bottom-up assembly took — **physically unavoidable**: you cannot show a
composite of the whole room before the whole room has been composited. Stage
stays live; Stadium is the (slightly behind) crowd behind it.

### Equal-square, not fractal (the change)
The Stadium used to divide space by **tree position** — a lone seat and a seat
rooting a subtree of thousands got the same 1/C² cell (the subtree fractally
composited into it). That "fractal-space" property is **gone**: the packer
blits every leaf out by sub-rect and lays them all into one flat gapless grid
(`packGrid`/`faceSrcRect`), so **every person is one equal square**, sized by
`stadiumGrid` and the cap/densify rule above — a fair-size tapestry of the whole
room, not a position-weighted one. The transport (one stream, up the tree and
fanned down, election-free) is unchanged; only the packing flattened.

### Grace, not teardown — the anti-flap discipline
Every link in the claim→paint chain flickers for benign reasons: a
renegotiation glare, a transport rebuild (which resets the peer's incoming
list), a gossip beat where a seat's occ entry is transiently unknown. The
rule everywhere is **grace before teardown** (`MOS_GRACE`, ~5s in
`meet.html`): a claimed primary that goes dark with no live replacement keeps
its LAST stream painted (a frozen beat — always the viewer's own legitimate
mix, never a neighbour's); an outbound ship stays up until it has been
unwanted for the full grace (occ transients never rip a live pipe); the
whole-mosaic teardown (`beyondRow` false) and a packer's empty-canvas
collapse wait it out the same way. Standby promotion stays instant — grace
only delays *destruction*, never *recovery*. Announces age out at ~12s (a
live job re-announces every sweep), so a silently dead sender cannot linger
as a claim candidate forever.

### Cross-link redundancy (up + down) — closing the mid-tree freeze
The down-fan used to be **single-path**: a non-head got the Stadium (and Stage)
strip only from its **row head**; if that head's feed stalled, the seat froze
with no lateral backup. `sgs` (Stage strip) and the per-stager audio feeds fan
over the **cross-link at every level**, and the Stage **collect** leg pushes a
redundant copy up the cross-link too. (The Stadium's per-branch mixes CANNOT be
laterally backed up — see the mix-minus redundancy trade above — only their
up-leg ingredients, `sdrow` via x1/x2, are.) A cross-link peer sits in a **different
row fed by a different up-link**, so it is an *independent* second source. Dedup
keeps it from looping: a fan is **not** sent back to the peer it was received
from (`via`), the stage copy carries a `^x` tag that resolves to the **same**
slot, and the S1 collect flood dedups by `streamId`. Because `claimMos` is
**sticky** — it keeps a live source and only switches when that source dies —
and the redundancy law is **one-pipe** (above), the second announcer sits
*parked at zero media* until it's needed, then is demand-woken and takes over
in ~2s (no thrash between two live sources, no steady second copy). This is
exactly what the dropped Section channel's cross-link budget was freed to pay
for.

---

## Load & distribution
Every seat: holds its row (C-1), one cross-link and (heads) one up-link, one
down-link — degree ≤ C+1. Every **row head** additionally composites **one**
frame per Stadium tick (its row's live faces + its down-links' blocks, repacked
flat) — O(C) tiles, constant work, and heads are 1-in-C seats so the compositing
load is spread evenly. The cross-link now also carries a **redundant** copy of
the Stadium/Stage fans (the budget freed by dropping Section), still within the
≤ C+1 degree. No seat's cost grows with room size; the room scales by getting
**deeper**, and depth adds latency (the accepted Stadium offset), never per-seat
load. This distributed, election-free assembly is chosen over any
assemble-for-everyone scheme: it spreads the processing the most evenly with no
dedicated node.

## Relation to the control plane
The media plane is a pure consumer of the healing mesh: it reads the same occ
map (coord → peer) the seating/healing laws maintain, and forwards over the same
WebRTC links. When a heal moves a seat, its media links move with it — no
separate media healing. Chat/File/Vote/Admin are unaffected (they ride sealed
control gossip, not these tiers).
