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

## THE crux bug: healing is not loss-tolerant (unifies A + B)

Bugs A and B are one problem. The **perfect bus never drops a frame** (it teleports),
so occupancy is always consistent and dups always resolve. **Routing drops frames**
legitimately — through a transient hole in the path, or a severed link — and the
healing protocol assumes reliable delivery, so:

- A dropped/severed CLAIM or liveness ack makes a live-but-silent seat look **dead**
  → `heal` promotes another seat into its cell → **double-book (dup)** when it
  reappears.
- Dedup is **pairwise** (`HELLO`→`CHALLENGE`→`YIELD` between the two claimants) and
  **not periodic** — if the two dup-holders aren't linked, or the dedup frames also
  drop, the dup **never resolves**. Under sustained drops, dups form faster than
  they clear → `dups` grows without bound → `converge()` never terminates.

Evidence: `sever=0.01` (perfect bus) → dups 140→479 growing, never converges (the
"timeout"). Enforced clean 50%-kill → dups=88, 5 stranded (routing's own transient
drops). `loss`-only and `subnets`-only converge fine (retries cover pure loss; the
killer is **severance / heal-over**, worse under routing).

- **A — enforcement heal gap.** Clean 50%-kill heals to 995/1000 (+dups) under
  enforcement vs 1000/1000 perfect-bus. The churn-time face of the crux.
- **B — pre-existing severance thrash.** `sever` breaks liveness → heal-over → dups.
  Predates Option A (original sim thrashes worse).

**Tried and FAILED (do not repeat as-is):** raising self-reseat `lastAck>80→230`;
periodic `announce()` dedup; raising `heal` `lastAck>40→230`. None stopped the dup
growth (formation via heal-over persists at any threshold once *some* ack-timeout
is crossed), and raising `heal` broke clean-churn heal (too slow). All reverted.

**Real fix direction (increment 11, needs focused design):** make healing
loss-tolerant — (1) **positive death confirmation** before heal-over (multiple
independent probes / require a cell be observed empty, not just ack-silent);
(2) **third-party-driven dedup** — any seat that observes two claimants for one
coord (via `S1SYNC`/`PONG`/occ) forces a resolution, instead of relying on the two
claimants being directly linked; (3) dedup must be periodic + survive loss. This is
the gate for enforcement-under-churn and must land before the production port
carries routing into `meet.html`.

## Remaining sim increments
- **7** — model link establishment explicitly (a neighbor link forms only after a routed SIGNAL handshake / RTT), not implicitly.
- **8** — harden the entry-gateway: a joiner's first link is the relay handshake to a greeter; everything else routes through it.
- **9** — earliest relay-socket drop: drop the socket the tick the gateway link is up; re-open only when seated in Section 1.
- **10** — relay-socket bound (~30/session) + greeter-pool health + flash-crowd join.
- **11** — fix **A** and **B**; re-prove convergence under loss / severance / subnets / partition, TELEPORT stays 0.
- **12** — scale (100k+): convergence, TELEPORT=0, bounded sockets, ticks/s; gate the diagnostic overhead behind a flag.

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
