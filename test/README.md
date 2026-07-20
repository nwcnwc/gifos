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
