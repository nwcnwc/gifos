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
**11a — loss-tolerant healing** *(fixes B and A-dups):*
  1. **Positive death confirmation before heal-over** — don't treat a cell as empty
     on *silence alone*. Require it be *observed* empty (its occupant seen leaving,
     or its coord seen taken by someone else) or confirmed dead by *multiple
     independent* observers, on a horizon **longer than max severance (200)**.
  2. **Third-party (owner-arbitrated) dedup** — the owner of a coord sees every
     `CLAIM` for it; if it sees two different claimants, it forces the loser to
     `YIELD`. This no longer depends on the two duplicates being directly linked.
  3. **Periodic, loss-surviving dedup** — re-assert occupancy each cycle so a single
     lost frame can't leave a permanent duplicate.
  *Pass/fail gate:* under `sever=0.01` and enforced 50%-kill, `dups` stays bounded
  and `converge` reaches `dups == 0`; heal reaches 1000/1000.

**11b — routing reliability under churn** *(fixes A-strands):*
  When `strictNextHop` returns −1 (next hop vacant), don't just drop — retry / try an
  alternate owned-link toward the target, and make the re-join dance *provably* reach
  a greeter. *Pass/fail gate:* enforced 50%-kill → `strands == 0`, TELEPORT stays 0.

Both 11a and 11b must land (and pass their gates in the sim) **before** the
production port (13–14) carries routing into `meet.html` — otherwise production
inherits the same dup/strand failures under real churn.

## Remaining sim increments
- **7** — model link establishment explicitly (a neighbor link forms only after a routed SIGNAL handshake / RTT), not implicitly.
- **8** — harden the entry-gateway: a joiner's first link is the relay handshake to a greeter; everything else routes through it.
- **9** — earliest relay-socket drop: drop the socket the tick the gateway link is up; re-open only when seated in Section 1.
- **10** — relay-socket bound (~30/session) + greeter-pool health + flash-crowd join.
- **11a** — loss-tolerant healing (positive death confirmation + owner-arbitrated periodic dedup). Fixes **B** and **A-dups**. Gate: `sever=0.01` and enforced 50%-kill → `dups==0`, heal 1000/1000. *(See the crux section above — this is the hard one.)*
- **11b** — routing reliability under churn (retry / alternate owned-link when `strictNextHop`=−1; re-join provably reaches a greeter). Fixes **A-strands**. Gate: enforced 50%-kill → `strands==0`, TELEPORT stays 0.
- **12** — re-prove under the full impairment matrix (loss / severance / subnets / partition / latency) + scale (100k+): convergence, TELEPORT=0, bounded sockets, ticks/s; gate the diagnostic overhead behind a flag.

## Production port
- **13** — port router + return-path + gateway into `site/js/mesh.js`; run `test/mesh-harness.js`.
- **14** — bind `site/js/mesh-wire.js` `env.send` + `site/meet.html` `sendSig` to **DC → mesh-route → relay-only-if-not-yet-in-mesh**; entry gateway; earliest socket drop; DELETE the relay fallback for seated members.
- **15** — verify: syntax + `mesh-harness` + penguin/swarm e2e — relay proven to carry ONLY knock + first-greeter handshake.

## Broader roadmap (16–35)
- **16–19** — sharded greeter registry for 1M flash-crowd; client shard-select+backoff; move `ban`/`setpw`/`votekick` off the relay onto signed mesh gossip; final relay audit → greeting-only.
- **20–25** — media plane on the mesh: wire the per-link bundle engine (encodes=links ≤7); gapless composite packer; burned-in overlays; Section / Stadium composites; Stage channel + audio folds.
- **26–28** — app-run on the mesh: standalone app-share → headless mesh node; in-meeting app-run; app governance (open-room anarchy / admin control).
- **29–32** — seating compaction (echo-immune `live` signal); H8 + cousins under strict routing; signaling under churn/partition; media P1 friend-relay fallback (never TURN).
- **33–35** — full swarm verification (500-bot multi-region); home-LAN/penguin real-device; cut a versioned release.
