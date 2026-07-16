# The GifOS media plane (canonical)

How audio/video flows over the no-root introducer mesh (`docs/healing-laws.md`).
The **one principle**: *distribute the media processing across every participant,
with zero dedicated infrastructure.* No media server, no elected relays, no
"beefy node" — every seat composites and forwards its fair share, using only the
links it already holds for control. Four channels ride the same topology.

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

## Channel Se — Section (your C×C block, self-composited below your row)
You see your own **Row** live (Channel R, on top), and beneath it a **composite
of the other C-1 rows** of your section — assembled **by you**, from feeds
arriving over your **cross-links**. A non-head's cross-link plus the row meshes
make the section one connected graph, so section feeds **flood** it (bounded
fan-out — row + one cross-link — kept **off the busy heads**); each seat receives
the other rows and composites them itself into the block under its live row. That
block runs slightly **behind** your row (the compositing lag) — everyone does
their own, no central assembler. (A separate media path for now; may later feed
the Stadium.)

## Channel St — Stage (the chosen ≤C broadcasters)
A decoupled, deliberately-chosen set (never row 0 — STADIUM vocabulary in
CLAUDE.md), capped at `C`. **Entry** is per room type: self step-up in open
rooms, admin-granted in admin rooms. **Membership rides phone-home**: a stager
announces its coord + a stage flag/timestamp in its status heartbeat, so every
seat knows who is on Stage and in what tile order (the cap-C set is
deterministic — earliest timestamp wins, ties by coord), and joining is just
flipping your own flag.

**Assembly — the Stage is a "row fold" assembled at Section 1, not down-tree:**
1. **Collect (1 hop).** Each stager opens **one direct link** to a Section-1 seat
   it already knows (its entry greeter / any S1 seat on the roster) and pushes
   its raw feed there. Only ≤C such off-tree links exist — cheap, stagers are few.
2. **Spread (~2 hops).** That S1 seat relays the feed across the Section-1
   row+cross mesh (the W5 roster fabric), so **every** S1 seat holds all ≤C feeds.
3. **Composite + fan down.** Each Section-1 seat composites the ≤C feeds into
   **one** horizontal Stage strip **itself** (redundant, parallel, no election —
   the Stadium doctrine) and fans that **single** stream down its subtree; heads
   forward it down.

One composited strip, **not** ≤C separate streams — fan-out is one cheap stream
and a fixed panel is what a broadcast tier wants. Latency = 1 (to S1) + ~2
(spread) + tree depth (down); less than Stadium (no per-level composite on the
way up), as befits the live tier.

**An APP on Stage carries a DATA stream, not A/V.** Running an app occupies one
of the ≤C Stage seats; instead of camera pixels it broadcasts the app's shared
**state** (small — deltas over the data channel), fanned down the same Stage
path. The composited strip leaves that tile's slot empty; each client runs the
app **locally** and renders it into the slot (positions are deterministic from
the stage roster). This reuses GifOS's P2P app-state machinery, now broadcast
stadium-wide — a collaborative app on the Stage, crisp and interactive, for the
price of a data stream instead of a video one.

## Channel Sd — Stadium (everyone, as one fractal mosaic)
The novel tier: the entire room assembled into a single mosaic by the
participants themselves, **up** the tree and back **down**.

### Up-assembly (every row head, recursively)
Each seat's **down-link delivers it one finished sub-mosaic** — everything
beneath that link, already composited into one `COMP_W×COMP_H` frame. A non-head
has no up-link, so it hands its down-mosaic to its **row head** over the row
mesh. A **row head** therefore holds up to `C` incoming sub-mosaics — *its "up
to C children" are the C down-links of its row* — which it composites into one
frame and sends **up** its up-link. The axis **alternates by level**:
row-layout is **horizontal**, the stack of down-link sub-mosaics is **vertical**
— so the picture grows by ×C in one dimension each level, ×C² every two levels.
Up one level the frame arrives (via a parent seat's down-link) at the parent's
row, and *that* row's head does the next gather. The compositor is **always a
row head gathering its row's down-links** — no other coordination exists.

### The Section-1 finish (redundant, parallel, no election)
Section 1 (`pc=0`) has **no up-links** — it is the top. Each Section-1 head has
assembled everything beneath its own subtree; it then does **one extra
cross-link pass** to fold in the other Section-1 rows' assembled frames,
producing the **whole Stadium**. **Every** Section-1 head does this
independently. It is deliberately redundant: computing it C times in parallel
costs wall-clock nothing extra, and it means the room never has to *elect* one
seat to assemble the Stadium for everyone (an election is a single point of
failure and a scaling bottleneck). This is the same doctrine as the healing
plane's parallel greeters — no chosen coordinator, ever.

### Down-flow and the latency offset
The finished Stadium flows **down** every `down`-link, the reverse of the
assembly. It necessarily lags Stage (and live Row/Section) by exactly the time
the bottom-up assembly took — **physically unavoidable**: you cannot show a
composite of the whole room before the whole room has been composited. Stage
stays live; Stadium is the (slightly behind) crowd behind it.

### The fractal-space property (named, accepted — not a bug)
Because each level divides its frame into equal parts by **tree position, not
by population**, a lone Section-1 seat and a Section-1 seat rooting a subtree of
tens of thousands occupy the **same** 1/C² of the final mosaic — the entire
subtree is composited down into that one cell. Space shrinks fractally with
depth (a seat two levels down holds 1/C⁴ of the frame, and so on). This is
inherent to equal recursive division and is **accepted by design**: it is the
price of a fully-distributed, election-free assembly, and for a
million-person "crowd" overview it reads correctly — the Stadium is the shape
of the room, not a fair-share gallery. (Row/Section/Stage are the tiers where
individuals are seen at fair size.)

### Concrete rendering recursion
`sectionFrame(pc)` is a C×C grid; cell `(r,i)` shows the sub-mosaic contributed
by seat `(pc,r,i)` — its own camera if it is a **leaf** (no occupied down-child),
else `sectionFrame(childPath(pc,i))` (its subtree). Distributed evaluation: each
row head builds its row's horizontal band from its C down-link sub-mosaics and
sends it up; the parent stacks bands vertically; Section-1 heads union the C
bands over cross-links. Frame budget per hop is fixed at `COMP_W×COMP_H`
(SCALE), so a seat's forward cost is constant regardless of how deep the tree
below it runs.

---

## Load & distribution
Every seat: holds its row (C-1), one cross-link or one up-link, one down-link —
degree ≤ C+1. Every **row head** additionally composites **one** frame per
Stadium tick (its row's C down-mosaics) — O(C) tiles, constant work, and heads
are 1-in-C seats so the compositing load is spread evenly. No seat's cost grows
with room size; the room scales by getting **deeper**, and depth adds latency
(the accepted Stadium offset), never per-seat load. This is why the fractal
assembly is chosen over any assemble-for-everyone scheme: it is the arrangement
that distributes the processing the most evenly with no dedicated node.

## Relation to the control plane
The media plane is a pure consumer of the healing mesh: it reads the same occ
map (coord → peer) the seating/healing laws maintain, and forwards over the same
WebRTC links. When a heal moves a seat, its media links move with it — no
separate media healing. Chat/File/Vote/Admin are unaffected (they ride sealed
control gossip, not these tiers).
