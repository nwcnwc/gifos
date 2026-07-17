# Option A — faithful P2P transport (no teleport, relay = greeting scope only)

The GifOS founding rule: **your video/audio/control go straight to the other
people, never through a server.** The relay is ONLY a zero-knowledge greeter
registry + the delivery path between *socketed* peers (joiners + Section-1
greeters). Everything else must travel over the P2P mesh (owned-link
DataChannels, multi-hop routed via `nextHopToward`). A **teleport** — a frame
reaching a seat the sender has no honest path to — is a bug and now DETONATES in
the sim (`teleportExplode`).

This file is the working increment list to carry the sim's faithful transport
into production. `sim/mesh.cpp` + `sim/mesh_seat.inc` are the source of truth.

## Done (committed)
- **0** — teleport diagnostic + baseline (classifyEmit: neighbor / relay / bootstrap / TELEPORT).
- **2** — mesh router core: `route`/`routeStep`, `Msg.{routing,rdst,rfinal,rttl,rvia,direct}`, per-seat `gateway`.
- **3** — strict owned-link router (`strictNextHop`) + `--route` enforcement (gated).
- **3b** — complete owned-link routing (`nextHopCoord` rewrite: same-section inter-row via one transpose cross-link).
- **4** — socketed-relay + entry-gateway model → `--route` CONVERGES; fixed the emit↔route stack-overflow (`direct` flag).
- **5** — TELEPORT → 0 (occ-view link check in both emit and metric; direct-hand-off-to-seated routes instead).
- **6** — enforce by default + **detonate on teleport**; fixed self-delivery misclassification.
- **churn wiring** — batch `leaveFrac` was a DEAD no-op; wired `killFraction` so `./mesh N f` really does JOIN→kill→heal.

## THE crux bug: healing breaks when control frames get dropped

**In one sentence:** the mesh's self-healing assumes every control message is
delivered; when a message is *dropped*, two seats end up holding the same
coordinate (a "duplicate"), and the duplicate never gets cleaned up — so the room
never settles and `converge()` runs forever ("timeout").

### Why this was invisible until now
The old sim was a **perfect bus**: `emit(A → B)` teleported the message straight
into B's inbox — it *could not be lost*. So occupancy was always consistent and any
duplicate resolved instantly. **Every "it converges" result we ever had was measured
on a network that never drops a packet.** Real networks drop packets. The whole
point of Option A (faithful P2P) is to stop teleporting — which means we now face
the drops the perfect bus hid.

### What actually drops a frame (two causes, same damage)
1. **Severance** — a live DataChannel goes dead for 40–200 ticks (`sever`), then
   recovers. During that window every frame between those two peers is lost.
2. **Routing holes** — a multi-hop route needs each next-hop coord to be occupied.
   During churn the path has transient gaps, so `strictNextHop` returns −1 and the
   frame is dropped.

Important: **plain packet loss alone is FINE.** `loss`-only and `subnets`-only both
converge, because the protocol already retries. The damage comes from frames lost
for a *sustained window* (severance) or *repeatedly on the same path* (routing
holes) — long enough to fool the liveness logic.

### The failure chain — how ONE dropped frame becomes a PERMANENT duplicate
Follow one cell, coordinate **X**, currently held by seat **A**:

1. A holds X and keeps it "fresh" by pinging its neighbors (`HELLO`/`PONG`/`CLAIM`).
2. A's link to a neighbor **N** *severs* (or A's ping routes through a hole and
   drops). **N stops hearing from A.**
3. After the freshness horizon (~40–120 ticks of silence), **N concludes X is
   empty** — a corpse. *This is deliberate:* a genuinely dead seat must not block
   newcomers forever. But **N cannot tell "severed-but-still-alive" from "actually
   dead"** — both just look silent.
4. N **heals** X: it admits/promotes some seat **B** into X. Now **A and B both hold
   X — a duplicate.**
5. The link recovers. In principle A and B should now discover each other and one
   should step down. But today's dedup is too weak:
   - **pairwise** — it only fires if A and B are *directly linked* and exchange
     `HELLO → CHALLENGE → YIELD`. If they aren't linked, nobody arbitrates.
   - **one-shot** — `HELLO` is sent at placement, not on a schedule; one lost
     `HELLO` and the duplicate is never re-detected.
   - **itself loss-prone** — the `YIELD` can drop too.
6. So the duplicate **persists**, while fresh severances keep manufacturing new
   ones. **Duplicates form faster than they clear → `dups` grows without bound →
   `converge()` never reaches `dups == 0` → it runs to its cap → "timeout".**

**Root cause, precisely:** liveness is *guessed from silence* (step 3), which
severance corrupts; and dedup (step 5) is too weak to clean up the mess that
mistake creates.

### Two bugs, one root — but bug A has a SECOND face
- **Bug B — severance thrash** *(pre-existing; happens even on the perfect bus)*.
  Drop cause = **severance**. The pure failure chain above.
  Evidence: `sever=0.01` → `dups` 140 → 479 and climbing, never converges.
- **Bug A — enforcement heal gap** *(only under routing)*. Drop cause = **routing
  holes** during a 50%-kill heal. It has **two distinct symptoms**:
  - **A-dups (88):** the *same* failure chain — a routed `CLAIM`/`PLACE` drops, two
    seats take the same hole → duplicate. → **fixed by loss-tolerant healing (11a).**
  - **A-strands (5):** a *different* problem — 5 re-joining seats never reach a
    greeter and give up ("stranded"). Their join frames keep dropping without a good
    retry/re-route. This is a **reachability** problem, not a dedup problem. →
    **NOT fixed by 11a; needs routing reliability (11b).**

### What was tried and FAILED — do NOT repeat as-is
Four parameter tweaks; none stopped the dup growth, some broke clean behavior; all
reverted:
`self-reseat lastAck 80→230`, `periodic announce()`, `heal lastAck 40→230`,
`freshness horizon 120/40→220`.
**Lesson: this is not a tuning problem.** Once *any* ack-timeout is crossed under
sustained severance, heal-over fires and dedup can't keep up — moving a threshold
just moves *where* it breaks (and slows clean healing).

### The fix — increment 11, split into 11a and 11b
**11a — one healing rule, fixed designations** *(fixes B and A-dups)* — detailed
in the next section. In one line:

> Every hole is filled by a **leaf** from the healer's subtree (the healer itself
> when it is a leaf), initiated by a **fixed-coordinate** healer: your **down-child**
> if you have one; else your **direct right-neighbour** in the row; if you have
> neither, a right-neighbour arrives after later rounds (or the row is gone and no
> heal is needed).

The dup came from the *one* healer designation that was a **computed opinion**
(`lowest-survivor`, decided from a divergent occ map → two self-appointed healers →
double-book). Every designation above is instead a **fixed coordinate**, so there is
provably one healer per cell — the ambiguity can't arise.
*Pass/fail gate:* under `sever=0.01` and enforced 50%-kill, `dups` stays bounded and
`converge` reaches `dups == 0`; heal reaches 1000/1000.

**11b — routing reliability under churn** *(fixes A-strands):*
  When `strictNextHop` returns −1 (next hop vacant), don't just drop — retry / try an
  alternate owned-link toward the target, and make the re-join dance *provably* reach
  a greeter. *Pass/fail gate:* enforced 50%-kill → `strands == 0`, TELEPORT stays 0.

Both 11a and 11b must land (and pass their gates in the sim) **before** the
production port (13–14) carries routing into `meet.html` — otherwise production
inherits the same dup/strand failures under real churn.

## 11a design — the fixed-designation healing rule (in full)

The one rule, restated:

> **Every hole is filled by a leaf from the healer's subtree (the healer itself when
> the healer is a leaf), initiated by a fixed-coordinate healer: your down-child if
> you have one; else your direct right-neighbour in the row if you have one. If you
> have neither, you get a right-neighbour after later rounds of healing — or the row
> is genuinely gone and no heal is needed.**

### Two fixed directions, no computed roles
- **Vertical — down-child.** A cell `X` with an occupied down-child `down(X) =
  {childPath(pc,i), r, 0}` is healed by that down-child, which promotes a **leaf**
  from its own subtree up into `X`, pre-wired from `X`'s phone-home. If the down-child
  is *itself* a leaf, it is the mover (base case). **This subsumes H8.**
- **Horizontal — right-neighbour.** A **childless head** `{pc,r,0}` has no down-child,
  but its row depends on it (non-head cells have no `up` of their own — the head is
  the row's sole up-link). Its healer is its fixed right-neighbour `{pc,r,1}`, which
  promotes a leaf from *its* subtree into the head (or, if it is a leaf, scooches in),
  reconnecting the head upward using the parent id it holds as pre-load.

### Only leaves move (P) — nothing is orphaned
The mover is **always a leaf**. A healer that has a subtree promotes the nearest leaf
in it and **stays put**; only a healer that is itself a leaf moves. So a subtree-bearing
right-neighbour never slides sideways (which would change its `down` coord and orphan
its subtree) — it lends a leaf instead.

### "Neither" → wait a round; the row left-packs itself (= compaction, free)
Holes fill *from the right*, so each fill migrates the hole one column rightward; the
row **left-packs**, holes collect at the rightmost column (the sink — a newcomer fills
it or the row runs shorter). If a hole's right-neighbour is momentarily empty, it
**waits**: as occupants migrate left, a right-neighbour arrives and heals it. The head
returns as long as *any* cell in the row survives. If the **whole row** dies: cells
with subtrees are re-seeded from below by the down-child rule; a wholly childless dead
row has no dependents and simply **vanishes** (the section shrinks) — no heal needed.

### The parent is FOREKNOWLEDGE, not the healer
Healing is directional — leaves live at the bottom and promote **up**. A childless head
has nothing below to pull up, and its parent is *above*, where there are no leaves to
push down. The parent also (a) has no leaf — its only subtree, through the head, is the
empty one — and (b) is cut off from the row the instant the head dies (the head is the
row's sole `up`-link; it holds only a stale roster). So the parent can't act. Its value
is **pre-load**: the head hands the row the parent's id downward (so the healing
row-mate reconnects up with zero discovery), and the parent's roster feeds the cousin
foreknowledge a deep re-seed uses. Parent = knows everything, enables the instant heal,
is not the actor.

### Why this fixes the dup
- **One healer per cell** (a fixed coordinate) ⇒ two nodes can't both heal the same
  hole ⇒ the `lowest-survivor` double-book cannot occur. This alone bounds formation.
- If a healer *does* heal over a live-but-severed occupant, the dup is between the
  original and the leaf it promoted — and the healer is **directly linked to both**
  (both occupy the healed coord, one of the healer's owned links), so on recovery the
  **same** healer resolves it over direct links. ≤1 per cell, self-cleaning, no
  multi-hop dedup needed.
- **Refinement (optional) — positive death confirmation:** have the healer act only
  after the cell is silent past a horizon **longer than max severance** (cross-checked),
  so it rarely heals over a live cell at all. Formation-prevention atop reliable
  resolution.

### Open decision
Vertical heal (a) down-child *moves up itself* (fast; cascades a column-collapse) vs
(b) down-child promotes a *deeper* leaf and stays (minimal churn; must locate the leaf).
Both keep the fixed designation; pick per disruption-vs-latency when building.

## Remaining sim increments
- **7** — model link establishment explicitly (a neighbor link forms only after a routed SIGNAL handshake / RTT), not implicitly.
- **8** — harden the entry-gateway: a joiner's first link is the relay handshake to a greeter; everything else routes through it.
- **9** — earliest relay-socket drop: drop the socket the tick the gateway link is up; re-open only when seated in Section 1.
- **10** — relay-socket bound (~30/session) + greeter-pool health + flash-crowd join.
- **11a** — one healing rule, fixed designations (down-child, else right-neighbour; every hole filled by a leaf; parent = foreknowledge not healer). Replaces `lowest-survivor`. Fixes **B** and **A-dups**. Gate: `sever=0.01` and enforced 50%-kill → `dups==0`, heal 1000/1000. *(Full design in the "11a design" section above.)*
- **11b** — routing reliability under churn (retry / alternate owned-link when `strictNextHop`=−1; re-join provably reaches a greeter). Fixes **A-strands**. Gate: enforced 50%-kill → `strands==0`, TELEPORT stays 0.
- **12** — re-prove under the full impairment matrix (loss / severance / subnets / partition / latency) + scale (100k+): convergence, TELEPORT=0, bounded sockets, ticks/s; gate the diagnostic overhead behind a flag.

## Production port
- **13** — port router + return-path + gateway into `site/js/mesh.js`; run `test/mesh-harness.js`.
- **14** — bind `site/js/mesh-wire.js` `env.send` + `site/meet.html` `sendSig` to **DC → mesh-route → relay-only-if-not-yet-in-mesh**; entry gateway; earliest socket drop; DELETE the relay fallback for seated members.
- **15** — verify: syntax + `mesh-harness` + penguin/swarm e2e — relay proven to carry ONLY knock + first-greeter handshake.

## Broader roadmap (16–35) — one line per increment

### Bootstrap scale + relay truly greeting-only
- **16** — Sharded greeter registry: N bootstrap DOs with a consistent shared genesis, so a 1M flash-crowd fans across shards instead of funneling through one ~30-socket DO.
- **17** — Client shard-select + backoff; model the thundering-herd join in the sim and prove the admission rate.
- **18** — Move `ban` / `setpw` / `votekick` off the relay onto the mesh as signed governance gossip (the door verbs).
- **19** — Final relay audit → greeting-only: delete every remaining non-greeting relay path; prove the relay carries ONLY knock + first-greeter handshake.

### Media plane on the mesh
- **20** — Wire the per-link bundle engine (`createBundle` / `cropView`, built-but-unwired) — encodes = links, ≤7 per node.
- **21** — Gapless composite packer end-to-end: one blended stream per link, aspect-ratio encodes the count.
- **22** — Burned-in overlays at the leaf (name / status / hand / green talking-frame), verified on real tiles.
- **23** — Section composite over the proven tree (composited strip).
- **24** — Stadium composite (cross-section aggregation).
- **25** — Stage channel (the decoupled broadcast tier) + audio folds (summed audio per tier) over the mesh.

### App-run on the mesh
- **26** — Standalone app-share → headless mesh node (`deriveMeet(appSessionSecret)`); kill relay-as-transport-proxy.
- **27** — In-meeting app-run on the same fabric (host-authoritative bus → mesh gossip).
- **28** — App governance over the mesh (open-room anarchy ordered, admin-room control).

### Healing & topology hardening
- **29** — Seating compaction: newcomers into Section-1 holes via the echo-immune `live` signal (the fragmentation fix), sim-first.
- **30** — H8 whole-section death + cousins/heir foreknowledge, re-proven under strict routing.
- **31** — Signaling under churn/partition: heal routing paths; re-prove convergence (composes with 11a/11b).
- **32** — Media resilience: P1 friend-relay fallback when a direct media path fails (still no TURN, ever).

### Production hardening & verification
- **33** — Full swarm verification (500-bot multi-region) of the routed mesh — greeting-only relay confirmed at scale.
- **34** — Home-LAN / penguin real-device verification (the demo path that failed).
- **35** — Cut a versioned release (`archive-version.sh`, bump `GIFOS_VERSION`) once the routed mesh is proven end-to-end.
