# Local regression suite — repair status (branch worktree-agent-ae7c38f4c63d73c55)

Running/repairing every LOCAL test (local servers / in-process) after the
mesh-v2 + media-plane + S4 rip-and-replace. Out of scope: `swarm.js`, `meet.js`
(hit prod). Ignored pre-existing failure: `e2e-fluence` (Deepgram).

Servers used: `python3 -m http.server 8099 -d site`, `node test/relay-local.js`
(8790); aux started per suite: fake-ai 8791, fake-keyapi 8792, fake-cors-proxy 8793.

## Verdict legend
GREEN = passed as-is · FIXED = stale, updated to current behavior · RETIRED =
dropped feature · REAL-BUG = production defect (NOT fixed — reported) · IGNORED.

## Tally (all local tests run)
- GREEN: 45 · FIXED: 8 · RETIRED: 1 (mesh-unit) · REAL-BUG: 5 suites / 2 root
  bugs (BUG-1 media+audio near-field: e2e-video, e2e-media-recovery, e2e-mosaic,
  e2e-sing; BUG-2 late-join app adoption: e2e-meeting-app, e2e-mymedia-meet
  [also FIXED for a separate myId race]) + 1 CANDIDATE (e2e-app-governance
  takeover) · IGNORED: 1 (e2e-fluence) · ENV-BLOCKED: 1 (squat, wrong Chromium
  path) · e2e.js: 5 stale spots FIXED, full run blocked by a pre-existing
  load-flake (openApp), not staleness.
- FIXED suites: relay-owned, flood, e2e-mesh-wire, e2e-version, e2e-theme-wallpaper,
  e2e-invite-lifetime, e2e-mymedia-meet (+bug), e2e-chess-mp, e2e.js.

## Pure-Node tests
| test | verdict | note |
|---|---|---|
| topo.js | GREEN | rook degree 9, colMates, deep C+1 all pinned |
| mesh-harness.js | GREEN | JOIN/kill/s1row/s1all + S4 attack-rejection, N=500/1000 |
| mosaic-rook.js | GREEN | |
| mosaic-route.js | GREEN | invariant (D) shows 0/0 populated deep sections at these N; still passes |
| mesh-media.js | GREEN | packGrid/stadiumGrid/coverBox |
| mesh-unit.js | RETIRED | old path-string topology API on mesh.js (pre-net.topo, pre-rook, uniform C+1). Superseded by topo.js. Stubbed with explanatory header. |
| sign.js | GREEN | |
| meet-seal.js | GREEN | |
| node-roundtrip.js | GREEN | |
| frag-size.js | GREEN | |
| relay-knock.js | GREEN | |
| relay-origin.js | GREEN | |
| relay-privacy.js | GREEN | |
| relay-device-dedupe.js | GREEN | |
| relay-owned.js | FIXED | meeting-admin block asserted the retired "admin socket" model (`?adm=key`→`joined.admin=true`). Adminship is now a per-order Ed25519 signature whose pubkey hashes to the sid verifier (meet-security §SIG; relay/src/relay.js). Rewrote into 3 assertions: no admin flag at door, signed setpw honoured, unsigned setpw rejected. |
| steady-socket.js | GREEN | |
| flood.js | FIXED | required mesh-identity.js before mesh-wire.js (S4 mandatory) + key DC bus by minted node.peer (await whenReady) instead of client string. |
| e2e-mesh-identity.js | GREEN | |
| e2e-mesh-wire.js | FIXED | same as flood: load mesh-identity.js; Scenario A bus keyed by minted node.peer. |
| e2e-app-owner.js | GREEN | |
| e2e-app-mesh-wire.js | GREEN | |
| swarm-voices.js | N/A | data helper (ogg blobs for swarm bots), not a test; swarm-scoped anyway |
| mesh-unit note | | topology moved to net.topo/gifos-net.js |

## Browser (Playwright) tests
| test | verdict | note |
|---|---|---|
| e2e-meet-lobby.js | GREEN | |
| e2e-meet-invite.js | GREEN | |
| e2e-meet-prettyurl.js | GREEN | benign `importKey` pageerror, all asserts pass |
| e2e-autoheal.js | GREEN | |
| e2e-failover.js | GREEN | |
| e2e-reconnect.js | GREEN | |
| e2e-mosaic.js | REAL-BUG | see BUG-1 below (S1 seat Stadium) |
| e2e-video.js | REAL-BUG | see BUG-1 (2 people, column-mates, no video) |
| e2e-media-recovery.js | REAL-BUG | see BUG-1 (late camera never publishes) |
| e2e-meeting-app.js | REAL-BUG (candidate) | host+guest live app mount PASS; the LATE (3rd) joiner never mounts `#appmount iframe` (3/3 timeout at line 77). Presence/status floods to ALL nodes (`meshNode.gossip`), but app STATE rides the structural-neighbour `sga` flood (`sgaTargets`, meet.html:4053/4066) — a newcomer can see the host's app-status yet never receive the retained app snapshot. Not fixed; needs site owner. |
| e2e-boot.js | GREEN | |
| e2e-store.js | GREEN | |
| e2e-version.js | FIXED | Erase moved from the system context menu into Settings → Advanced settings → "Erase this computer" disclosure (`#set-erase`, desktop.js:1737). Rewrote the erase navigation. |
| e2e-required.js | GREEN | (one transient first-load `.icon` flake; green on retry) |
| e2e-visibility.js | GREEN | |
| e2e-mirror.js | GREEN | |
| e2e-theme-wallpaper.js | FIXED | sw.js precaches `/themes/<hostname-label>/wallpaper.js`; on 127.0.0.1 the "127" octet reads as a subdomain label (the SW can't see the page-only GIFOS_THEME), tripping "default requests no wallpaper" — a localhost artifact (real default host has empty label). Block the SW to isolate the page theme cascade under test. |
| e2e-icon-rotate.js | GREEN | |
| e2e-contrast.js | GREEN | |
| e2e-add-url.js | GREEN | (was RED only due to my server-dir setup slip — see note) |
| e2e-run-param.js | GREEN | (same server-dir slip) |
| e2e-update-erase.js | GREEN | |
| e2e-join-prettyurl.js | GREEN | |
| e2e-perms-share.js | GREEN | |
| e2e-owned-app.js | GREEN | |
| e2e-mymedia.js | GREEN | |
| e2e-invite-lifetime.js | FIXED | app-share warning copy refined ("a copy of the data this app shares (private stays on device)" vs old "full copy of everything"); updated the assertion. |
| e2e-mymedia-meet.js | FIXED + REAL-BUG | host mount was a stale myId race (S4 async identity) — FIXED by waiting for canRunApp(). Now surfaces the SAME late-join bug: the guest (joins after the app is already running) never auto-adopts it. See BUG-2. |
| e2e-app-governance.js | REAL-BUG (candidate) | open-room live share mounts for ALL (incl 3rd person) — PASS. But B's "latest-wins" TAKEOVER (B shares a 2nd app) fails: B never becomes appIsHost, with `[b] Cannot read properties of null (reading 'postMessage')` (posting to a torn-down/not-ready iframe contentWindow). App-runtime-on-mesh takeover path. Not fixed; needs site owner. |

| e2e-meet-quiet.js | GREEN | |
| e2e-meet-record-app.js | GREEN | |
| e2e-bible-nav.js | GREEN | |
| e2e-mymedia-share.js | GREEN | (one first-load `.icon` flake; green on retry) |
| e2e-sing.js | REAL-BUG | BUG-1 family (audio plane). Near-field jitter alignment is `bus:'row'` only for `rowMates()` (meet.html:4324); two people seat as COLUMN-mates under W7 column-major seating → `bus:'section'`, D:0, unset. Conversation partners get no near-field time-sync. |
| e2e-irl.js | GREEN | |
| e2e-wasm.js | GREEN | |
| e2e-chess-mp.js | FIXED | joiner iframe wait 12s→30s: the WASM app mounts only after the app-mesh join + P2P handshake, now on top of S4 async identity — legitimately slower. Verified green (7/7). NOT a bug (unlike BUG-2 — verified: chess joiner DOES mount, just slowly). |
| e2e.js | FIXED (5 stale spots) | root count 9→10 (My Media added, 2 spots); Advanced settings `details` now nests Erase disclosure → `> summary`; erase moved to Settings; pretty-URL router sub-tests run in a `serviceWorkers:'block'` context (SW shadows the page.route-injected 404.html — harness interaction, not a product bug); version 0.5.0→0.7.0 (asserted via GIFOS_VERSION) + archived build 0.5.0→0.6.0. Reaches 104/~150 checks; a pre-existing load flake in the `openApp` new-tab helper (line 34/422 — not staleness, not from these edits) blocks a fully-green run in this saturated container. |
| browser-image-check.js | GREEN | |
| overlay-render.js | GREEN | |
| squat.js | ENV-BLOCKED | hardcoded to `chromium_headless_shell-1228/chrome-headless-shell` (not installed; every other suite uses `/opt/pw-browsers/chromium-1194`). Cannot launch — environment, not test logic. |
| e2e-caps.js | GREEN | (fake-ai 8791) |
| e2e-ai-types.js | GREEN | (fake-ai 8791) |
| e2e-agent.js | GREEN | (fake-ai 8791) |
| e2e-chess-hint.js | GREEN | (fake-ai 8791) |
| e2e-api.js | GREEN | (fake-keyapi 8792 + fake-cors-proxy 8793) |
| e2e-cors-proxy.js | GREEN | (fake-cors-proxy 8793) |
| e2e-proxy-cache.js | GREEN | (fake-cors-proxy 8793) |
| e2e-fetch-bridge.js | GREEN | (spawns own 8791; fake-ai killed first) |
| e2e-relay.js | GREEN | |
| e2e-fluence-setup.js | GREEN | (the no-Deepgram-key regression; distinct from e2e-fluence) |
| e2e-fluence.js | IGNORED | known pre-existing Deepgram-pipeline failure |
| shot-fluence.js | N/A | screenshot utility, not an assertion test |
| swarm.js / meet.js | OUT OF SCOPE | hit the production site |

### BUG-2 — late joiner does not adopt an app already running in a meeting
VERIFIED real (not a timeout): with the guest wait raised to 70s the guest still
never mounts. Reproduced in TWO suites:
- e2e-meeting-app: the 3rd participant (joins after the app is running) never
  mounts `#appmount iframe` (3/3).
- e2e-mymedia-meet: after fixing the host-mount myId race, the guest (joins
  after the host already shared My Media) never auto-mounts it.

Participants PRESENT when the app is shared mount it fine (live). Only LATE
joiners fail. Presence/status floods to every node via `meshNode.gossip`
(fanOut, meet.html:1699), but app STATE (`sga`) floods only to STRUCTURAL
neighbours (`sgaTargets`/`sgaFan`, meet.html:4053/4066) and the retained snap
(`sgaSnap`, replayed on subscribe, 4102) is only held by nodes that already
received it — so a newcomer can learn an app is running yet never receive the
snapshot to render it. Not fixed (site/ owned by another session). Left failing
as a regression guard. (Distinct from BUG-1, which is media, not app state.)

### Setup note (my error, now fixed — no product/test defect)
e2e-add-url / e2e-run-param write their fixture GIF into the WORKTREE's `site/`
(`__dirname/../site/__X.gif`), but I had started `python3 -m http.server 8099`
from the MAIN checkout's `site/`, so the fixture 404'd (and the SW served the
404 back). Restarting the server with `-d site` from the worktree fixed both.
The site content is byte-identical between the two checkouts (only `test/*.js`
changed), so every non-fixture test — including the BUG-1 media suites, which
reproduce on the correct server — is unaffected.

## REAL BUGS found (production — NOT fixed, another session owns site/)

### BUG-1 — media plane: non-row-mates get no video in single-section rooms
One root cause, three failing suites (e2e-video, e2e-media-recovery, e2e-mosaic S1).

- The raw camera track is added to a peer connection ONLY when the peer is a
  **row-mate**: `carryCam = (camPeer(p.id) && !p.headless) || myStatus.stg`,
  `camPeer = isRowMate` (site/meet.html:1749, 1764-1769). Non-row-mates
  (column-mates, cross/up/down) are meant to receive the face via the mosaic
  composite instead ("ENCODES = LINKS" comment).
- The mosaic (Stadium assembly, sdPack + `paintStadiumTile`) is gated on
  `c.pc===0 && multiSection()` (site/meet.html:3895), and `multiSection()`
  (site/meet.html:3588) is a LOCAL proxy: true only if my own `occ` holds a
  non-Section-1 coord. In a single-section room it is false for everyone; and
  even in a multi-section room it is false for a Section-1 seat whose own
  down-child subtree is empty.
- W7 seating is **column-major**, so the 2nd person in a room lands as a
  **column-mate** of the founder, NOT a row-mate.

Net effect: two people in a small room are column-mates → `carryCam` false (no
direct camera) AND `multiSection()` false (mosaic off) → the RTCPeerConnection
carries a DataChannel but **zero media transceivers** (`tx:[]`, verified via
`__gifosVideo.pcState`), so each sees the other as `cam-off`. Turning the camera
on afterward does not add a transceiver either (no renegotiation path for the
row-mate gate). Same mechanism blanks a Section-1 seat's Stadium tile in
e2e-mosaic (founder seat (0,0,0), `multi:false`, `tile:null`, deterministic 2/2).

Design intent (meet.html:3567 "a room that fits in Section 1 renders everyone
directly — the interim rule") is NOT implemented: `carryCam`/`camPeer` restrict
the direct camera to row-mates regardless of room size, and nothing else covers
non-row-mate pairs in a single-section room.

Fix direction (for the site owner, not applied here): make the "multi-section"
decision room-wide (e.g. `knownTotal() > C*C`) so every S1 seat assembles the
Stadium in a genuinely multi-section room; and/or carry the direct camera to all
peers (not just row-mates) while the room fits in one section. These tests
(e2e-video, e2e-media-recovery, e2e-mosaic) are left FAILING on purpose as
regression guards — they assert the correct invariant (every seat sees the room).
