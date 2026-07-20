# The GifOS test suites

Every suite is a standalone Node script — there is no runner. Run one with
`node test/<dir>/<file>.js`; it exits non-zero on failure. The directories
group suites by **what they need to run**, which is the thing that actually
differs between them.

| dir | needs | what lives here |
|---|---|---|
| `servers/` | — | the fixture servers everything else talks to |
| `unit/` | nothing | pure Node, in-process, sub-second |
| `mesh/` | own relay (spawned) | the mesh control plane + wire, in-process |
| `relay/` | own relay (spawned) | the relay protocol surface |
| `browser/` | site on 8099 + relay on 8790 | Playwright suites |
| `drills/` | nothing | self-contained: spawn their OWN relay + site |
| `swarm/` | the production site | scale bots + live meeting tools |
| `tools/` | varies | utilities, not assertion tests |
| `batteries/` | everything below it | cross-environment GATES — run before pushing |

## The pipelines

Almost every suite belongs to one of four pipelines. Knowing which one you are
in tells you what a green run actually proves — and, more usefully, what it
cannot.

### 1. The meeting mesh — a five-rung ladder

The same control plane is tested five times over, each rung adding one layer of
reality. Cheap and deterministic at the bottom, slow and true at the top.

| rung | what runs | proves | blind to |
|---|---|---|---|
| `sim/mesh.cpp` + `sim/repro-*.sh` | the C++ reference, to millions of seats | the LAWS: topology, seating, healing, every arrival pattern | transports, crypto, browsers, wall-clock |
| `test/mesh/mesh-harness.js` | `site/js/mesh.js` replaying the sim's own scenarios at N=500/1000 | the JS port still matches the brain | real transports |
| `test/mesh/e2e-mesh-wire.js`, `flood.js`, `e2e-mesh-identity.js` | mesh + `mesh-wire.js` over a REAL relay, real sealing and signing, in Node | the wire binding: knock, greeters, genesis, S4 | WebRTC, browsers |
| `test/drills/*` | real browsers, real WebRTC, own relay + site | what a meeting actually does | scale |
| `test/swarm/*` | many real browsers, optionally against production | scale, and the real internet | determinism |

**The gap that matters.** Each rung can only fail in ways its fabric can
express. The sim assumes a message sent is a message delivered, so it cannot
model *"these two seats have no DataChannel yet"* — and that is exactly where
the expensive bugs live. A green sim says the laws are right. It never says a
meeting works. Only the browser rungs can say that, and only if they assert
**link completeness** — every neighbour the mesh NAMES is a peer we are
actually connected to — rather than counting seats. A room can report every
seat filled while almost none of its channels exist; that was true in
production for months.

### 2. The relay

`servers/relay-local.js` mirrors the production Worker (`relay/src/relay.js`)
message for message and cap for cap, and is what the mesh, relay and drill
suites spawn. `relay/*` exercises the protocol surface directly: the knock and
greeter registry (R2/R3), origin and privacy rules, signed adminship (§SIG),
vote-off and bans.

Keep the two files in step. When they drift, every suite below them is testing
a relay that does not exist.

### 3. The desktop and apps

`browser/*` drives the real UI in Playwright — the desktop, the app lifecycle,
and the meeting surface (moderation, stage, password, media, recovery). These
need the dev stack up (`servers/dev.sh`); they are the slowest and the most
likely to be flaky, and they are also the only place a rendering or consent bug
can be seen at all.

### 4. Gates

`batteries/*` runs a slice of all of the above in one command, for changes that
cross layers. Use one when the thing you touched cannot be proven by a single
suite — which is most of the interesting changes.

## Choosing a target, and a box

**Local by default.** `swarm/` tools default to `https://gifos.app` and the
production relay, so a bare `node test/swarm/swarm.js` is a load test against
production. Pass BOTH `--base` and `--relay` to redirect, or a bot loads the
local page and still meshes over the production relay.

**Which box.** A weak host invents failures: browser suites above ~9 bots start
failing purely from local exhaustion (each participant holds several
PeerConnections), and those failures look exactly like mesh bugs. Prefer the
8-core box; when a run disagrees with the sim, re-run it somewhere idle before
believing it.

**Diagnostics, when a run disagrees with the sim.**

| question | how to answer it |
|---|---|
| did the bot even dial the relay? | `RELAY_DEBUG=1` on the relay → `[conn] ACCEPT/REJECT` per socket. No line at all ⇒ browser/env, not mesh |
| how chatty is the room? | `[rate]` (per peer msgs/s) and `[kind]` (by frame type) |
| was a socket refused, and why? | `[conn] REJECT ... :: <reason>` |
| are the channels the mesh names actually open? | `links` on the swarm ctrl file — `complete=N/N channels=X/Y`, misses named by coord |
| never offered, refused, or never answered? | `SIGNAL` on the swarm ctrl file — sums `txStats`/`rxStats` across the shard |
| is the room ONE room? | distinct coords + agreeing population (`drills/adversary-room.js` asserts both) |


## Running

```bash
test/servers/dev.sh          # site on 8099 + relay on 8790, from THIS checkout
test/servers/dev.sh --all    # + fake-ai 8791, fake-keyapi 8792, fake-cors 8793
```

That covers all of `browser/`. `SITE_PORT` / `RELAY_PORT` override the ports;
Ctrl-C tears every child down. The pieces also run standalone if you'd rather
manage them yourself:

```bash
python3 -m http.server 8099 -d site
node test/servers/relay-local.js          # ws://127.0.0.1:8790
node test/servers/fake-ai.js              # 8791 — the AI suites
node test/servers/fake-keyapi.js          # 8792 — e2e-api, e2e-fluence
node test/servers/fake-cors-proxy.js      # 8793 — e2e-api, e2e-cors-proxy
```

`relay-local.js` mirrors the PRODUCTION caps by default — 8 sockets per IP,
30 per session. That is what you want for the suites (they test the real
gate), and exactly what you don't want for a local swarm, where every bot
shares one IP. Set `RELAY_DEV=1` to run it unguarded.

Playwright + Chromium paths are hardcoded (already installed). If page-opens
start timing out for no reason, kill leftover browsers first:
`pkill -f "chrome-linux/chrome"`.

Gotchas:
- `browser/e2e-fetch-bridge.js` spawns its OWN server on 8791 — kill fake-ai first.
- `relay/relay-owned.js` (8792) and `relay/relay-device-dedupe.js` (8791)
  hardcode ports that collide with the fake servers; don't run them concurrently.
- `tools/browser-image-check.js` reads `unit/sample.gif`, which
  `unit/node-roundtrip.js` writes — run that one first.
- `swarm/squat.js` is pinned to a `chromium_headless_shell` path that isn't
  installed here; every other suite uses `/opt/pw-browsers/chromium-1194`.

## batteries/ — cross-environment gates

Not a suite: a battery runs suites from several directories at once, so it
needs whatever they need. Run one before pushing a change in its area.

| battery | gate |
|---|---|
| `join.sh` | everything that must stay true about JOINING — the sim's arrival patterns (burst/serial/batch/window, seating AND H7 shape), `mesh.js` at N=500/1000 plus flood and wire, real browsers asserting LINK COMPLETENESS and ONE room, and the adversary + late-join drills. `--quick` skips the browser ladders. |

`site/` AUTO-DEPLOYS on push, so an untested change to `site/js/mesh-wire.js`,
`site/js/mesh.js` or `site/meet.html` is a change to production. Prefer the
8-core box — a weak host invents failures above N=10 from its own exhaustion.

## servers/ — the fixture servers

`relay-local.js` mirrors the production Worker (`relay/src/relay.js`) and is
what the mesh/relay/drill suites spawn. `fake-ai.js`, `fake-keyapi.js` and
`fake-cors-proxy.js` stand in for the paid upstreams.

## unit/ — pure Node

| suite | covers |
|---|---|
| `topo.js` | `net.topo`: rook degree 9, colMates, deep C+1 — the topology pins |
| `mosaic-rook.js` | the rook's-graph mosaic assembly |
| `mosaic-route.js` | mosaic routing invariants across sections |
| `mirror-route.js` | `sdnMirrorRoute` exhaustively at C=5 and C=2 (media-plane Phase 2) |
| `mesh-media.js` | packGrid / stadiumGrid / coverBox |
| `sign.js` | GIF signing |
| `meet-seal.js` | the meeting seal / derived-key surface |
| `node-roundtrip.js` | GIF encode→decode roundtrip (writes `sample.gif`) |
| `frag-size.js` | wire fragment sizing |

## mesh/ — control plane and wire

| suite | covers |
|---|---|
| `mesh-harness.js` | the Node reference harness for `site/js/mesh.js` — replays the C++ sim's scenarios (JOIN, 50%-kill, s1row, s1all) and asserts its convergence targets at N=500/1000. With `mesh.js` it IS the JS reference implementation. |
| `flood.js` | N nodes hit a FRESH relay in one synchronous burst (no stagger) — the genesis-flood claim |
| `e2e-mesh-wire.js` | mesh↔wire over a real relay and real sealing |
| `e2e-mesh-identity.js` | S4 per-participant identity minting over real WebSockets |
| `e2e-vanish.js` | healing-laws D5: vanish-to-seat-freed per departure mode over the production wire stack |
| `e2e-app-owner.js` / `e2e-app-mesh-wire.js` | app ownership on the mesh |
| `steady-socket.js` | R2 socket retention |

## relay/ — the relay protocol surface

`relay-knock`, `relay-origin`, `relay-privacy` (in-process — requires
`servers/relay-local.js` directly), `relay-device-dedupe`, `relay-owned`
(the §SIG signed-adminship door), `relay-voteoff` (majority boot, standing
votes, admin rooms never vote-kick), `relay-adminban` (forged vs signed ban,
banlist re-seed).

## browser/ — Playwright

Roughly three families in one directory:

- **desktop / apps** — `e2e.js` (the big one), `e2e-boot`, `e2e-store`,
  `e2e-version`, `e2e-required`, `e2e-visibility`, `e2e-contrast`,
  `e2e-icon-rotate`, `e2e-add-url`, `e2e-run-param`, `e2e-update-erase`,
  `e2e-join-prettyurl`, `e2e-perms-share`, `e2e-owned-app`, `e2e-mymedia`,
  `e2e-mymedia-share`, `e2e-theme-wallpaper`, `e2e-invite-lifetime`,
  `e2e-wasm`, `e2e-irl`, `e2e-bible-nav`, `e2e-mirror`.
- **meeting** — `e2e-meet-lobby`, `e2e-meet-invite`, `e2e-meet-prettyurl`,
  `e2e-meet-quiet`, `e2e-meet-record-app`, `e2e-meet-mod` (blur/mute/undo,
  stage, vote, admin rooms — 44 checks), `e2e-meet-password`, `e2e-video`,
  `e2e-sing`, `e2e-mosaic`, `e2e-media-recovery`, `e2e-handq`,
  `e2e-meeting-app`, `e2e-mymedia-meet`, `e2e-app-governance`, `e2e-autoheal`,
  `e2e-failover`, `e2e-reconnect`, `e2e-relay`, `e2e-chess-mp`.
- **AI / network** — `e2e-caps`, `e2e-ai-types`, `e2e-agent`, `e2e-chess-hint`
  (all need fake-ai), `e2e-api`, `e2e-cors-proxy`, `e2e-proxy-cache`,
  `e2e-fetch-bridge`, `e2e-fluence-setup`, `e2e-fluence`.

## drills/ — self-contained scenario rigs

Each spawns its own relay and its own static server for THIS checkout's
`site/`, so they are safe to run from a worktree.

| drill | proves |
|---|---|
| `e2e-latejoin.js` | the late-join deadlock: greeter-door sponsor entry, ttl-bounded `fsig`/`fmesh` hops, the `nosock` bounce (meet-security §FWD, healing-laws R2) |
| `mirror-drill.js` | the sdn DORMANT-MIRROR standby: 8 browsers force-seated at C=2, kill the direct relay, the parked mirror wakes |
| `redun-drill.js` | ONE pipe moves bits — every alternate path parked, then failover wake |
| `e2e-vanish-browser.js` | the browser half of D5: pagehide→instant LEAVE, `dc.onclose`→`transportLost`→probe-gated early confirm, with a SIGKILLed victim browser |

## swarm/ — scale and live tools

**Production is the default, but nothing here is production-only.** With no
flags `swarm.js`, `meet.js`, `squat.js` and `vanish-drill.js` load
`https://gifos.app` and hit the real relay. Both knobs redirect them at the
dev stack — pass BOTH, or a bot loads the local page and still meshes over the
production relay:

```bash
RELAY_DEV=1 test/servers/dev.sh
node test/swarm/swarm.js --room test --n 20 \
  --base http://127.0.0.1:8099 --relay ws://127.0.0.1:8790
node test/swarm/meet.js  --room test --base http://127.0.0.1:8099 \
  --relay ws://127.0.0.1:8790 --watch
```

Local-swarm gotchas:
- `RELAY_DEV=1` — without it the local relay enforces the production 8
  sockets/IP cap and every bot after the 8th is refused (they share one IP).
- Use a **real Chrome** build, not `chrome-headless-shell`: a stripped build
  loads the page but may never open the relay socket. `SWARM_CHROME=<path>`
  (swarm) / `MEET_CHROME` or `--chrome` (meet) picks the binary.
- Pointing bots at a relay on another box (tailnet/LAN, plain HTTP, no cert)
  needs `SWARM_INSECURE_ORIGINS=<origin>` so the page still counts as a secure
  context for getUserMedia/WebRTC. Chromium's local-network-access checks are
  already disabled in the bot launch args for the same reason.
- A single box saturates well before the interesting behaviour: real
  compaction needs enough bots to fill sections, which is why the big runs
  fan out across machines with `--offset`.

Running against PRODUCTION instead needs the abuse guards relaxed for your
egress IPs first — `scripts/swarm-test-mode.sh on <ip,ip>`, and `off`
afterwards. A local run needs none of that, which is the main reason to
prefer it while iterating.

`swarm.js` runs N headless bots as real
`meet.html` clients (solid-swatch cams, `swarm-voices.js` espeak clips,
`swarm-videos/` talking-head packs). `swarm-handq.js` is the hand-queue scale
check. `vanish-drill.js` measures human-visible vanish at swarm scale.
`meet.js` is the meeting command line — join a real room as a participant and
inspect it interactively, as a stream, or one-shot. `squat.js` holds a stage
seat until its owner arrives.

## tools/ — not assertion tests

`browser-image-check.js` (renders a GIF in a browser), `overlay-render.js`
(mesh-media overlay compositing), `shot-fluence.js` (screenshots the Fluence
app README image).

## Known state

- `browser/e2e-fluence.js` fails on the Deepgram pipeline — a long-standing
  known failure, kept as a regression guard.
- Late joiners do not adopt an app already running in a meeting: app STATE
  rides the structural-neighbour `sga` flood while presence rides
  `meshNode.gossip`, so a newcomer learns an app is running but never receives
  the retained snapshot. `browser/e2e-meeting-app.js` and
  `browser/e2e-mymedia-meet.js` are left failing on purpose as guards.
- `browser/e2e-app-governance.js` open-room "latest-wins takeover" is flaky:
  B never becomes `appIsHost` (null `contentWindow` postMessage).
- `drills/e2e-latejoin.js` does not fully pass. Its connection legs do — late
  joiners reach `pc:connected` / `dc:open` — but it cannot reliably ARRANGE its
  own scenario: seating layout churns, so some runs produce no late joiner with
  a socketless link target, and the deadlock leg plus the media check then fail
  for want of anything to measure. Treat a failure here as "did the scenario set
  up?" before "is the product broken?", and check the run's seated coords.
- `browser/e2e-relay.js` times out waiting for the desktop `.icon` to render.
  Predates this work — it fails identically at `421ecc5`.
- `drills/adversary-room.js` has, on at least one run, caught every coord being
  held by two participants with populations disagreeing (3–6 of 11). Whether
  that split survives the current wire is unconfirmed. It is the reason the
  drill asserts distinct coords and agreeing population at all: link-based
  checks are blind to a split room, because each fragment wires itself up
  perfectly.
