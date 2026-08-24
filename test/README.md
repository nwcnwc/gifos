# The GifOS test suites

Every suite is a standalone Node script — there is no runner. Run one with
`node test/<dir>/<file>.js`; it exits non-zero on failure. The directories
group suites by **what they need to run**, which is the thing that actually
differs between them.

| dir | needs | what lives here |
|---|---|---|
| `servers/` | — | the fixture servers everything else talks to |
| `unit/` | nothing | pure Node, in-process, sub-second |
| `sim/` | a C++ compiler (`g++`) | the C++ reference mesh (source of truth) + its `repro-*.sh` / `sweep.sh` |
| `mesh/` | own relay (spawned) | the mesh control plane + wire, in-process |
| `relay/` | own relay (spawned) | the relay protocol surface |
| `browser/` | site on 8099 + relay on 8790 | Playwright suites |
| `drills/` | nothing | self-contained: spawn their OWN relay + site |
| `swarm/` | the production site | scale bots + live meeting tools |
| `behavior/` | site 8099 + relay (auto-spawned); relay-dev for deploys | the BEHAVIOR battery: 26 real-life use cases as persona-driven scenarios, spreadable over a FLEET of boxes — see `behavior/README.md` |
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
| `test/sim/mesh.cpp` + `test/sim/repro-*.sh` | the C++ reference, to millions of seats | the LAWS: topology, seating, healing, every arrival pattern | transports, crypto, browsers, wall-clock |
| `test/mesh/mesh-harness.js` | `site/js/mesh.js` replaying the sim's own scenarios at N=500/1000 | the JS port still matches the brain | real transports |
| `test/mesh/e2e-mesh-wire.js`, `flood.js`, `e2e-mesh-identity.js` | mesh + `mesh-wire.js` over a REAL relay, real sealing and signing, in Node | the wire binding: knock, greeters, genesis, S4 | WebRTC, browsers |
| `test/drills/*` | real browsers, real WebRTC, own relay + site | what a meeting actually does | scale |
| `test/swarm/*` | many real browsers, optionally against production | scale, and the real internet | determinism |

**The sim is not an ideal-network toy.** It injects the faults that matter, set
before `init`: `net loss=` drops messages, `net sever=` kills links and leaves
them dead, `net subnets=N density=D` makes whole groups of peers *mutually
unreachable*, `net lat=`/`qual=` degrade the path, and `sever A B T` cuts one
named link with `TRANSLOST` observed at both ends exactly as a closed
DataChannel is. `test/sim/repro-adversary.sh` uses these to ask the adversary
question at 150+ seats, deterministically — including a DARK SEAT that holds
its cell and answers nothing while twenty newcomers arrive. That is where the
adversarial claim is established; the browser drill confirms reality agrees.

**The gap that remains.** What the sim does not model is the *establishment* of
a link — a pair that could talk but has no DataChannel open YET, and needs
signaling to get one. Its fabric answers "can these two reach each other",
never "have these two finished negotiating". Every expensive bug this month
lived in that gap, and it is why the browser rungs must assert **link
completeness** — every neighbour the mesh NAMES is a peer we are actually
connected to — instead of counting seats. A room can report every seat filled
while almost none of its channels exist; that was true in production for
months, and no sim run would have shown it.

### 2. The relay

`servers/relay-local.js` mirrors the production Worker (`relay/src/relay.js`)
message for message and cap for cap, and is what the mesh, relay and drill
suites spawn. `relay/*` exercises the protocol surface directly: the knock and
greeter registry (R2/R3), origin and privacy rules, signed adminship (§SIG),
vote-off and bans.

Keep the two files in step. When they drift, every suite below them is testing
a relay that does not exist.

`servers/relay-dev.sh` runs the REAL `relay/src/relay.js` locally under
`wrangler dev` (ws://127.0.0.1:8794) — actual Durable Objects, hibernatable
sockets, attachment-carried registry, the things no Node stand-in can mirror.
Use it for relay-BEHAVIOR tests: DO restarts (`touch relay/src/relay.js` =
a live deploy), hibernation, wedge recovery. The DO's console.log prints in
the terminal. The 2026-07-26 incidents (accept-path wedge; post-deploy
newcomer stall) live exactly in this layer; the behavior battery drives its
relay-restart scenarios through this harness.

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
8-core gate host; when a run disagrees with the sim, re-run it somewhere idle
before believing it.

**But do not queue the whole farm behind one box.** "Prefer the gate host" is
about where a NUMBER can be trusted, not a rule that every tier must run on one
machine. The final release-gate run belongs to the gate host — one box, one
verdict, one log. Everything else should SPREAD across whatever boxes are up:

* **Suites in parallel, one tier per box.** `unit/`, `tools/`, `mesh/` and
  `sim/` need no browser and no stack, so they can run anywhere while the gate
  host is busy — including on a small ARM client. Browser tiers want cores, but
  two different browser SUITES on two different boxes do not contend at all,
  while two on one box contend badly (a browser suite spawns 6-10 processes).
* **The behavior battery is a FLEET, not a box.** `lib/cast.js` distributes
  actors over ssh (see the fleet recipe below); the orchestrator box only has
  to serve the site + relay and hold the ssh pipes. A 5-person scenario spread
  1-2 actors per box is the only version of it whose timings mean anything.
* **Say WHERE a result came from.** A red is only comparable to another red on
  a box of the same shape and the same load — every behavior failure is stamped
  with loadavg for that reason. Record the box ROLE (gate host / 6-core fleet
  client / 4-core ARM client) with any number worth keeping.
* The gate host is also the box the release gate is ALLOWED to sit on for
  hours. If it is mid-gate, do not borrow it for exploratory runs: land those
  on a fleet client and let the gate finish.
* **Release clones, not the development tree.** A release gate, a fleet actor,
  and `archive-version.sh` run from `~/release-process/gifos` checked out at
  the freeze tag (`v<x.y.z>-freeze`). `~/projects/gifos` is for ongoing
  `main`. Fleet `dir` in `~/.gifos-behavior-hosts.json` is the release-process
  clone on every box. Tag the freeze **before** the gate; further `main` is
  not that release. Product bugs found in the gate land on `release/<x.y.z>`
  AND on `main`. CLAUDE.md "Release clones".

**Diagnostics, when a run disagrees with the sim.**

| question | how to answer it |
|---|---|
| did the bot even dial the relay? | `RELAY_DEBUG=1` on the relay → `[conn] ACCEPT/REJECT` per socket. No line at all ⇒ browser/env, not mesh |
| how chatty is the room? | `[rate]` (per peer msgs/s) and `[kind]` (by frame type) |
| was a socket refused, and why? | `[conn] REJECT ... :: <reason>` |
| are the channels the mesh names actually open? | `links` on the swarm ctrl file — `complete=N/N channels=X/Y`, misses named by coord |
| never offered, refused, or never answered? | `SIGNAL` on the swarm ctrl file — sums `txStats`/`rxStats` across the shard |
| is the room ONE room? | distinct coords + agreeing population (`drills/adversary-room.js` asserts both) |


## SOME SUITES REQUIRE ISOLATED MACHINES, AND NOW THEY SAY SO

(A third, narrower refusal exists beside NEEDS-FLEET and NO-VERDICT:
**WRONG-TREE, exit 2** — `browser/e2e-update-erase.js` edits files on disk
and must refuse to judge when the server at BASE is not serving this clone;
a probe file written into `site/` and fetched back tells the two apart.
Added 2026-08-23 after a release-clone server on 8099 made the suite read
as a product red.)

A suite whose verdict depends on real per-client hardware calls
`await needFleet(n, {why, roles})` (`test/lib/fleet.js`) and **exits 3 having
asserted nothing** when it is not given them. `test/lib/fleet-browsers.js`
starts a Playwright browser server per host over ssh so each actor gets a
MACHINE. Config is the same `~/.gifos-behavior-hosts.json` the behaviour
battery uses.

**This changes the shape of a gate.** `release.sh` reports `NEEDS-FLEET` as its
own verdict — never retried, never a product red — and it BLOCKS a cut, because
a guard nobody ran is a guard nobody has. So a full certification is now:

| where | what |
|---|---|
| gate host | `release.sh --behavior=skip` — reports NEEDS-FLEET for fleet suites |
| behaviour box | `release.sh --only=behavior` — and it must have the RAM to hold a 5-browser cast, or expect NO-VERDICT |
| **the orchestrator** | **the fleet suites, from the box holding the hosts file** |

It verifies rather than trusting the file, and every check has caught something
real: the orchestrator listed with `weight: 1` (it must be 0 — it serves the
stack and runs no browsers), a Playwright version gap that makes `connect()`
refuse (a host may name a matching install with `pwPath`), and a host that is
merely BUSY — **isolated means idle**, and <llm-box>'s resident 7 GB model made it
useless while every other check passed.

Two traps it now handles for you: a remote browser is **not a secure context**
(http on a tailnet IP — GifOS's own `#oldbrowser` banner eats the clicks), and
ports must be **ephemeral** or a killed run's leftover server collides with the
next one.

Worked example: `e2e-anyroad-mp` went from "times out at 600s, or refuses to
judge" on one box to **40 pass / 0 fail in 321s** with a driver per machine.
The 3-driver gate **is** that fleet: the suite calls `needFleet(3)` and has no
one-box door. 26a (the behaviour-battery caller) unsets `ANYROAD_MP_LOCAL` so a
leaked env cannot sneak a wiring-only skip of the steering physics. Without
three isolated machines it exits 3 (NEEDS-FLEET) — never a product red, and
never a green from one box.

Second worked example, and a different lesson: `e2e-pipe-mesh` (2026-08-17).
The encoded-passthrough lane's six-seat room was the gate's only FLAKY suite —
red once, green on the retry — and the gate's advice was "fix the wait". It was
not the wait. Measured before changing anything, on an idle 8-core box with the
suite unchanged: **8 runs, 8 green**, every seat's Stadium live in the low
seconds against a 90 s budget; squeezed to 4 cores, **5 more runs, 5 green**.
Thirteen greens, including nine that seated the gate's exact failing topology.

**The red never reproduced on one box — and then the FLEET reproduced it in
three runs, on verified-idle machines.** A deep row-mate came up holding
nothing: `P4 @1/1.1 claims:[] ann:[] up:null`, while the other five seats were
live in under 300ms and both boxes sat at load 0.09/8 and 0.20/4. So the
contention thesis those 22 runs were built to support is **wrong** — squeezing a
box is not necessary to produce this, and the flake is a product question, not a
kernel one. It reds about 1 run in 9 on the fleet and now names the seat.

**That is the argument for going multi-box, and it is not the argument I
expected to be making.** The fleet's value here was not that it made a flake go
away — it did not — but that in three runs it turned "seats 4 and 6 are false,
on a box we cannot re-run" into a coordinate and a claim state. One box could
not have told you which of those two worlds you were in, and that ambiguity had
already burned two triages.

Two things worth stealing for the next suite of this shape:

- **The workload's real cost.** One 6-seat browser suite forks **17 chrome
  processes and holds a 1-minute load of 8-13 on a 6-core box** for its whole
  duration. `settle_box` gates on load *before* a suite starts, so it cannot see
  this: the next suite in the tier begins inside the previous one's wake.
  `fleet.js`'s 15-minute check *does* see it — after these runs both boxes were
  correctly refused as `BUSY RECENTLY` for ~20 minutes, which is the same
  measurement from the other side. Budget for that cooldown or pass
  `FLEET_WAIT_MS`.
- **Different boxes run different codecs, and that changes what is testable.**
  Measured on the same Playwright build: x86 chromium ships `H264`, ARM does
  not. So a fleet room genuinely spans codecs — the regime the pipe lane's
  failback exists for and one box can never produce — and an assertion premised
  on "this box is VP8-only" is false the moment it leaves that box.


## NEVER LET A WALL CLOCK DECIDE A VERDICT

**Almost every flake this gate has produced is one of two bugs, and both are in
the test.** Written out because four of them were fixed in a single sitting on
2026-08-11 and they were the same bug wearing four hats. Check these two first —
and if neither fits, read the next section, because the 2026-08-11 gate's LAST
remaining flake was neither: its client had died.

**1. A deadline standing in for a correctness claim.** Ask whether the number
is a PROMISE. "A burst join converges" is the claim; "within 40s" is not
something we ship, and on a box running 160 other suites it is a measurement of
the box. Wait for the STATE instead, and fail on the absence of PROGRESS:

| suite | was | is |
|---|---|---|
| `mesh/flood` | flat 40s ceiling → red at seated 19/20 | wait while the census improves; deadlock = STILL for 15s (a real deadlock now fails in 19s, not 40) |
| `e2e-anyroad` | 24 × 250 ms drive → red at "8.9 m" of a 9 m wall | drive until through, or until it has not moved 25 cm for 3s — "a solid wall stops it cold" is the actual claim |
| `26a` / `e2e-anyroad-mp` | 55-frame window with a 7s net → net fired at 8 frames | end on frames, or on 5s of no frames; an UNFILLED window is never scored |

The third one carries the sharpest lesson: physics advances per RENDERED FRAME,
so a wall-clock window measures how many frames the box managed. If a window
cannot fill, say so in those words and refuse the verdict — do not publish
numbers about a car that never moved.

**2. A locator or sample taken at one instant of something eventually
consistent.** `e2e-video` matched a meeting tile with `hasText: 'Bob'`, and a
tile's chips QUOTE OTHER PEOPLE BY NAME — `📡 via Bob`, `🔇 muted for everyone
by Bob`. When Cai's feed happened to route via Bob, Cai's tile matched too.
Whether it does is a property of the mesh topology that run. Match the identity
hook (`<span class="name">`), never the whole element's text; `test/unit/
tile-locators.js` now fails any suite that forgets.

The retry in `release.sh` is a DIAGNOSTIC that separates "deterministically
broken" from "lost a timing lottery". It is not a licence to leave a FLAKY line
alone: every one of them is a bug with a known address.


## A DEAD BROWSER IS NOT A VERDICT

**The third flake family, and it is not a wait at all: the client was gone.**
`03a-classmates-serial-pip` was the 0.9.7 gate's one FLAKY. Root-caused
2026-08-12, and there is nothing wrong with the scenario:

```
t+42.6  em |   seated at 0/0.4
t+44.9  em !   [CRASH] the renderer process died — everything this page carried is gone
t+50.6  em > jstate          … and every 2.5s for the next 250 seconds
```

Four reds followed, every one of them about the mesh — `room converges to 5 for
everyone`, `the room never loses anyone while 4/5 are hidden` (18 violating
samples), `reunion whole after the waves`, `census … replies=4/5`. **All four
statements were TRUE of a room with four live members, and none of them was a
defect.** The box: 7.6 GB of RAM with **49 MB available** (about 6.5 GB held by
a resident GPU model) and five Chromiums living in swap. A 5-phone cast costs
~1950 MB resident — measured on an idle box, ~390 MB per browser — so that box
could never hold it.

The signal was not missing. meet.js printed the crash to **stderr**, which
cast.js files into the per-run `cast.log` that nobody reads unless they already
suspect the answer, and in drive mode the browser-death handlers returned early
on purpose ("the orchestrator owns actor lifecycles"). The orchestrator was
never told, so it interrogated the corpse.

**So the rule, third leg of the same doctrine as NEEDS-FLEET:** a scenario that
loses a browser it did not ask to lose renders **NO VERDICT**, exit **4**.

- `meet.js` says `@@dead <why>` on the *sentinel channel* — from `page.on('crash')`
  and `browser.on('disconnected')` — never only to stderr. `die`, `leave`,
  `quit` and teardown are exempt (`intentionalKill`), and a stale-handle guard
  keeps a late event from a killed browser from being blamed on its replacement.
- `cast.js` stops **at once** and prints the CASUALTY, the box's capacity at the
  moment of death, and what it had at the start. Not green, not a red, **never
  retried** (the box does not get roomier on the second run), and it **blocks a
  cut** — a scenario nobody could run is a guard nobody has.
- Every cast logs `capacity <box>: N browser(s) · X MB available (need ~Y)`
  before it spawns, and says `SHORT BY … : this cast runs from SWAP and a
  casualty is likely`. That is evidence, not a gate: 24 of 25 scenarios do
  survive on swap. It exists so the first question a casualty raises is already
  answered in the log.
- `crash` is a lever (`chrome://crash`, chromium only): the death nobody asked
  for, as opposed to `die`. It is how the gate is provable.

**And it is not only the behaviour battery.** 110+ suites in `test/browser`
and `test/drills` drive Playwright directly and resolve chromium through
`test/lib/pw.js`, where `chromium.launch()` now returns a **watched** browser —
same report, same exit 4 — so the identical bug is closed in all of them from
one wrapper. `test/lib/casualty.js` holds the shared vocabulary (what counts as
a death, the exit code, the capacity arithmetic) so the two halves cannot drift.
**A death you MEANT to cause must be declared:** `deathExpected(browser)` before
you kill one. `e2e-vanish-browser` SIGKILLs a victim's whole process tree — that
is the drill — and, with `drills/casualty-noverdict.js` (which crashes one
renderer and `die`s another to prove the gate itself), they are the only
suites in the repo that kill a browser on purpose.

Guards: `test/unit/behavior-casualty.js` holds the whole chain — classifier,
the deliberate-death exemption, the capacity line, and the fact that meet.js,
cast.js, behavior.sh and release.sh each still handle it (the bug was a signal
shouted into a channel with nobody at the other end, so every link is pinned).
`test/drills/casualty-noverdict.js` proves it with real browsers, both
directions: a crashed renderer must exit 4 with ZERO `✘`, and a deliberate
`die` must still render a verdict — a hair-trigger gate would refuse to judge
`12b-team-car-death`, whose whole subject is somebody vanishing.

**When you see NO-VERDICT:** read the CASUALTY line. Short of RAM → give the
cast a box that can hold it, or spread it over the farm (FLEET mode, below).
Idle and roomy → **the crash itself is the bug**, and the run dir has the
renderer's last words.

### A RESIDENT MODEL IS NOT SPARE CAPACITY — stop it for the run

The behaviour box's shortage was invisible in every process: `ps` accounted for
about 500 MB of the 7.6 GB, and `MemAvailable` said 49 MB. The missing 6.5 GB was
a **resident GPU LLM service** (llama.cpp with `-ngl 99 -c 32768`), and on a
unified-memory board the GPU's memory IS system memory — held through nvmap, so
it appears in no RSS at all. `free` and `top` both look innocent.

**Measured, one command:**

| resident model | MemAvailable | 03a, 3 consecutive runs |
|---|---|---|
| running | ~490 MB | pass, pass, **NO-VERDICT** (em's renderer, t+45.6s) |
| stopped | **5508 MB** | pass, pass, pass |

So: stop the resident model before a behaviour run and start it again after.
Nothing else on that box changed, and the cast went from 1464 MB short to 3558 MB
of headroom. If a box has a resident model, an LLM runtime or any other GPU
tenant, treat it as **occupied**, not idle — `fleet.js` already refuses a host
whose *load* is high, and this is the same lesson one resource over.


## ONE BOX CANNOT ANSWER "is this a real bug?" — go multi-box

**The trap, hit repeatedly.** Every browser suite runs the host, the guests AND
the relay on a single machine. That is not a meeting shape that exists in real
life, and when a timing number looks bad there you genuinely cannot tell a
product bug from that one kernel scheduling three Chromiums. Two full cycles
were burned in the 0.9.0 cut on exactly this.

**Worked example (2026-08-02).** `e2e-perms-share` measured the guest's app
mount at 9-32 ms five runs in six and 32,899 ms on the sixth, on one box. Was it
real? Rebuilt across three machines — host on <monitor-pi>, guest on an idle
<llm-box>, site+relay on <orchestrator> — it reproduced and was far WORSE: 1.6s / 7.7s /
7.7s / 20.7s / 36.5s, later 48.5s. Real bug, two causes, both fixed
(`FIX both remaining legs of the slow app-room join`). Afterwards: max 6.1s.

**The harnesses already exist — do not rebuild them.**

| what | tool |
|---|---|
| meetings / topology (forceSeat, Stage, `tree` census) | `test/swarm/meet.js`, one or two clients per box |
| app-room join latency, leg by leg | `test/tools/approom-host.js` + `test/tools/approom-join.js` |

```bash
# one box serves site+relay for everyone (a fresh relay on a spare port leaves
# any existing dev relay on 8790 alone):
RELAY_DEV=1 RELAY_HOST=0.0.0.0 RELAY_PORT=8795 node test/servers/relay-local.js &
python3 -m http.server 8099 -d site &            # binds 0.0.0.0 already

# HOST box — prints an invite link, then sits in the room until killed:
export MEET_INSECURE_ORIGINS=http://<server-ip>:8099
node test/tools/approom-host.js --base http://<server-ip>:8099 --relay ws://<server-ip>:8795

# GUEST box — fresh guest per run, prints the join timeline:
export MEET_INSECURE_ORIGINS=http://<server-ip>:8099
node test/tools/approom-join.js --base http://<server-ip>:8099 \
     --relay ws://<server-ip>:8795 --link '<invite url>' --runs 6
```

`approom-join` prints a per-run `TRACE snap@… ask@… app-frame@… mounted@…`
(from `window.__appJoinTrace`, written by `runtime.js`). Read the LEGS, not the
total: waiting on the owner's snap is mesh/DC establishment, asks going
unanswered is the bytes path. They are different bugs and the total cannot tell
them apart — guessing without this trace cost two wrong diagnoses in one day.

**Traps, all of them paid for:**

* **Plain http is not a secure context.** Without
  `MEET_INSECURE_ORIGINS=http://<server-ip>:8099` getUserMedia and WebCrypto
  fail and the page looks broken for the wrong reason.
* **…and `gifos.app` cannot be spoken to over http AT ALL.** `.app` is an
  HSTS-PRELOADED gTLD: the browser rewrites `http://gifos.app:8099` to https
  before it reaches the wire, meets a plain-HTTP server there, and fails with
  `net::ERR_SSL_PROTOCOL_ERROR`. No flag turns that off (it is not
  `HttpsUpgrades`), and `--unsafely-treat-insecure-origin-as-secure` grants
  secure-context PRIVILEGES, never the scheme. Faking prod with
  `--host-resolver-rules=MAP gifos.app 127.0.0.1` plus http therefore stopped
  working the day the gate box moved to chromium-1234 / Chrome 151 (1228 still
  loaded it), and took both pretty-URL suites into the DEAD state on their
  first `goto`. Serve the REAL origin instead: `test/lib/prod-origin.js`
  fulfils `https://gifos.app/**` out of the local site server, so the origin is
  genuinely gifos.app, genuinely https, and no bytes leave the box.
* **A fresh `git worktree` has no `node_modules`** (it is gitignored), so every
  actor dies in 4s with "actor not running". Symlink the main clone's:
  `ln -s <a clone that has node_modules> $WT/node_modules` (for a release
  gate that is `~/release-process/gifos`; never point fleet `dir` at the
  development `~/projects/gifos`).
* **A stale clone fails SILENTLY** — a box running older code simply never gets
  placed, with no error. `git log -1` on every box before believing a result.
  Pull there with `git fetch && git reset --hard origin/<branch>`.
* **A long-lived host DEGRADES.** After ~20 sequential guests one
  `approom-host` stopped serving app bytes altogether (0/4 mounted) and a fresh
  host fixed it instantly. Restart the host between measurement batches, and do
  not read a sudden all-fail as a code regression without trying that first.
* **INTERLEAVE every A/B** (O,N,O,N…), never all-old-then-all-new. Box load
  drifts upward across a session, and a sequential A/B reported a phantom
  regression twice in one day. See the `power-lever-refutations` discipline.
* **Background services skew a pi.** <monitor-pi> runs MonitorBot
  (`systemctl --user stop gifos-meet-monitor.service`), <llm-box> runs the Home
  Privacy Machine (`sudo systemctl stop hpm-app.service`, ~3 of its 4 cores).
  Stop them for a clean measurement and **start them again afterwards**. The
  behaviour box's own resident GPU model is the same trap in MEMORY rather than
  CPU, and it hides better — see "A RESIDENT MODEL IS NOT SPARE CAPACITY".
* **Never `pkill chrome` broadly over ssh** — it took down the ssh session
  itself. Kill the harness by its own bracketed name.

### The BEHAVIOR battery in FLEET mode (the same lesson, automated)

`test/behavior/lib/cast.js` already spreads a cast over boxes: it reads a LOCAL
hosts file (`~/.gifos-behavior-hosts.json`, or `BEHAVIOR_HOSTS=<path>` — never
committed, it describes someone's home network), pushes the CURRENT `meet.js`
to each remote as `.bb-meet.js`, and drives every actor over the same stdio
sentinel protocol through ssh. A role can name its box (`host:`) but normally
placement is a weighted round-robin, now filtered by ENGINE (below). The
orchestrator box runs no browsers if you give it no weight — it serves the
stack and holds the pipes.

```jsonc
// BEHAVIOR_HOSTS file. "engines" lists what that box can actually launch;
// omit it and the box is treated as chromium-only. "local" (no ssh) is the
// orchestrator itself — drop it entirely to keep that box browser-free.
{ "base": "http://<orchestrator-ip>:8199", "relay": "ws://<orchestrator-ip>:8795",
  "hosts": [
    { "name": "six-core", "ssh": "<alias>", "dir": "/home/u/gifos",
      "node": "/usr/bin/node", "nodePath": "/home/u/gifos/node_modules",
      "chrome": "…/chromium-<rev>/chrome-linux/chrome",
      "firefox": "…/firefox-<rev>/firefox/firefox",
      "engines": ["chromium", "firefox"], "weight": 2 },
    { "name": "arm-client", "ssh": "<alias>", "dir": "/home/u/gifos",
      "node": "/usr/bin/node", "nodePath": "/home/u/swarm/node_modules",
      "chrome": "…/chromium-<rev>/chrome-linux/chrome", "weight": 1 } ] }
```

```bash
# ON THE ORCHESTRATOR BOX — bind 0.0.0.0 or the fleet cannot reach the stack
# (a scenario refuses with "stack unreachable", it does NOT quietly go local):
python3 -m http.server 8199 -d site                  # binds 0.0.0.0 already
RELAY_DEV=1 RELAY_HOST=0.0.0.0 RELAY_PORT=8795 node test/servers/relay-local.js

BEHAVIOR_HOSTS=~/farm-hosts.json node test/behavior/scenarios/25a-mixed-engines-household.js
BEHAVIOR_HOSTS=~/farm-hosts.json BEHAVIOR_ENGINE=maya=firefox \
  node test/behavior/scenarios/01b-household-deadzone.js   # re-engine ANY scenario
```

Fleet traps beyond the ones above:

* **Fleet mode NEVER auto-spawns the stack.** Local mode boots site+relay if
  the ports are idle; fleet mode cannot (the fleet needs a routable address),
  so it fails fast with `stack unreachable`. Read that as "you did not start
  it, or you bound it to 127.0.0.1", never as a mesh symptom.
* **Use SPARE PORTS when the box may already be serving another session's
  stack.** 8099/8790 are frequently held by someone else's run of a DIFFERENT
  tree; your fleet would then mesh over the right relay against the wrong site.
  8199 + 8795 cost nothing and the hosts file carries them.
* **`weight` is the only load control there is.** Actors are browsers; give the
  6-core box 2 and a 4-core ARM client 1. A box already running a resident
  service (a monitor, a local LLM) should get weight 1 or be left out — its
  spare cores, not its core count, is what you are dividing up.
* **The orchestrator's own load still lands in the numbers.** With another
  session's browser suite on the same box (loadavg 38 on 4 cores, measured
  2026-08-05) a LOCAL firefox actor took 90s to launch and seat, against 8s for
  the same actor on an idle fleet client. Everything still passed — but that
  90s would have been read as a mesh join stall by anyone reading the timings.
  Give the orchestrator no actors when you care about latency.
* **A squeezed orchestrator KILLS ACTORS, and it looks like a join failure.**
  The ssh pipes are cheap in CPU but they are processes: at loadavg 26 on a
  4-core VM (with `virtio_balloon: Out of puff` in `dmesg` the same minute) a
  5-actor scenario lost its first actor outright and reported `ana failed to
  join: actor exited null`. The exit handler now names the signal
  (`[killed: SIGKILL]`) — read that as environment, and re-run before believing
  anything about the mesh.
* **Two casts on ONE orchestrator fight.** `cast.up()`'s stale-actor sweep
  pkills `meet.js --drive`, and a REMOTE actor's ssh command line contains
  `.bb-meet.js --drive` — so starting a second scenario on the same box reaps
  the first one's whole fleet mid-run. Run scenarios serially per orchestrator
  (the battery does), and never start an ad-hoc scenario "just to check" while
  a fleet run is live.
* **`BB_ACTOR=1` makes cleanup co-tenant-safe.** On a box shared with another
  session's suite, `for d in /proc/[0-9]*; do grep -qz BB_ACTOR=1 "$d/environ"
  && kill -9 "${d##*/}"; done` killed exactly this battery's actors (both
  engines) and left the co-tenant's 32 chrome processes alone — verified
  2026-08-05. Prefer it to any chrome-name pattern when the box is not yours.

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
test/servers/relay-dev.sh                 # 8794 — the REAL relay under wrangler dev (relay-behavior tests)
node test/servers/fake-ai.js              # 8791 — the AI suites
node test/servers/fake-keyapi.js          # 8792 — e2e-api, e2e-fluence
node test/servers/fake-cors-proxy.js      # 8793 — e2e-api, e2e-cors-proxy
```

`relay-local.js` runs UNGUARDED by default (DEV mode): every test box drives
its whole fleet from one IP, so the production per-IP cap of 8 is precisely
wrong locally — it silently starved the swarm once and the release gate's
browser tier a second time (e2e-handq meshed exactly 8/10, forever). Set
`RELAY_PROD=1` to mirror the production abuse guards (8 sockets/IP,
30/session, frame meter). Ban/eviction/owned-slot semantics are core session logic and
are active in BOTH modes.

**node 22 or newer, always.** `gifos-net.js` opens the relay socket with the
global `new WebSocket` a browser supplies; node only has that global from v22.
Under 18 or 20 the constructor throws, the connect path catches it and
reschedules forever, and every suite that talks to a relay from Node — `flood`,
`e2e-mesh-wire`, the whole `mesh/` and `relay/` families — **hangs with no
output** instead of failing. the gate box still defaults to node 18, so:
`export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 22`. `batteries/join.sh`
refuses to start without it.

Playwright + Chromium paths are hardcoded (already installed). If page-opens
start timing out for no reason, kill leftover browsers first:
`pkill -f "chrome-linux/chrome"`.

Gotchas:
- A certified app's built GIF lives at `site/apps/<slug>/<slug>.gif` (inside the
  publish boundary, so the App Store can download it). Never spell that path out
  in a suite — use `lib/apps.js` (`appGif('fluence')`), which THROWS when the
  GIF isn't built. It used to be `apps/<slug>.gif` in six suites, and
  `e2e-wasm` SKIPPED when the file was missing: moving the artifact would have
  turned the real-Stockfish test green having asserted nothing.
- `browser/e2e-fetch-bridge.js` spawns its OWN server on 8791 — kill fake-ai first.
- `relay/relay-device-dedupe.js` (8791) hardcodes a port that collides with
  fake-ai; don't run them concurrently. (`relay-owned.js` moved to its own
  8795 and no longer collides.)
- `tools/browser-image-check.js` reads `unit/sample.gif`, which
  `unit/node-roundtrip.js` writes — run that one first.
- Chromium is resolved by SEARCH in `test/lib/pw.js` (newest installed build
  under `/opt/pw-browsers` or `~/.cache/ms-playwright` — both `chrome-linux/`
  and `chrome-linux64/` spellings); `swarm/squat.js` takes Playwright's
  default channel.

## batteries/ — cross-environment gates

Not a suite: a battery runs suites from several directories at once, so it
needs whatever they need. Run one before pushing a change in its area.

| battery | gate |
|---|---|
| `release.sh` | **THE RELEASE GATE** — every tier (unit, sim, tools, relay, browser, drills, behavior core) in order; green end to end or there is no cut. The rest of this document is largely its anatomy. |
| `behavior.sh` | the BEHAVIOR battery: `test/behavior/scenarios/*` run SERIALLY — 26 use cases / 58 persona scripts driving `meet.js --drive` actors through phone realities (dropouts, hidden+frozen tabs, battery states, parked phones, reload churn, relay deploys, and one MIXED-ENGINE room). `--core` = the 25-script core (~1.5h); full = several hours. 04b/16b are the post-deploy WHOHOME repro; they were fixed by 95ca143 and both PASS (verified 2026-08-06 on a full 58/58 run) — this line used to say they stay RED, which was stale, and behavior.sh's own header is the authority. Needs `relay-dev.sh` up for the deploy scenarios (else they SKIP); 25a needs a playwright firefox (else it SKIPs). A SKIP is a failure of the run, not a pass — check for them explicitly. Discovery is a glob, so a new `scenarios/*.js` is gated the moment it lands. Prefer an idle multi-core box — or better, give it a `BEHAVIOR_HOSTS` fleet and put 1-2 actors per machine: 5-browser scenarios saturate 4 cores and starvation reads as flapping (fails are stamped with loadavg for exactly this reason), and a 5-phone cast needs ~1950 MB of *available* RAM (each scenario now logs `capacity` before it spawns). Exit codes: 1 = a red, **4 = NO VERDICT** — a scenario's browser died, see "A DEAD BROWSER IS NOT A VERDICT" — 0 = green. |
| `join.sh` | everything that must stay true about **JOINING** — arrival patterns (burst/serial/batch/window, seating AND H7 shape), loss wedge, atomic-move / cascade scooch, churn combos, adversary fabrics, compaction, H-CHAIN / headless-row, `mesh.js` harness + flood + wire, browser link-completeness ladders, adversary-room + late-join drills. `--quick` skips the browser ladders. |
| `c-sweep.sh` | **The multi-section confidence battery.** Rebuilds the sim at C in {2,3,4,5} (`-DGIFOS_C`) and drives rooms big enough to form DEEP multi-section trees, checking the invariants that must hold however the tree branches: all seated, ZERO duplicate cells, zero stranded, full Section 1, and no split-brain under partition. Production is C=5, where a second section needs >25 people; low C reaches deep trees with a handful of seats, so C=2/3/4 exercise cross-section seating/heal/churn/partition/compaction cheaply. Verdict gates on C>=4 (incl. production C=5); C=2/3 duplicate-minting under stress is a known degenerate-tiny-section finding (see `known-unfixed.sh`). Sim-only, seconds per C. |
| `known-unfixed.sh` | **THE GRAVEYARD — every check in it is EXPECTED TO FAIL.** Behaviours we understood and DECIDED not to fix: too hard, not worth it, or a rule we want to keep would have to change. Not a gate, not run by CI, not called by any battery. Run it only when **we change our mind** and want to try again. RED is correct; a GREEN entry means someone fixed it — promote that check back into its real gate and delete it from here. Never soften an assertion to make it green. |
| `mesh-churn.sh` | everything that must stay true about **LEAVING / CRASH / CHURN / BAD COMMS** — the full disruption matrix: loss+kill, cascade rejoin, link sever, silent row wipe, sweep (kill fractions × seeds + partition + D5), harness mass-kills + D5, vanish (Node + browser), dark peers, latejoin, E5 friend-relay, R5 pick-one, redun + mirror drills. `--quick` is sim + JS only (no browsers). Run this before shipping seating/healing changes. |

**When to run which.** Touching admit/FIND/join shape → at least `join.sh --quick`.
Touching heal/LEAVE/scooch/loss/D5/compaction → at least `mesh-churn.sh --quick`.
Flag-day mesh work → both full batteries on the 8-core box.

`site/` AUTO-DEPLOYS on push, so an untested change to `site/js/mesh-wire.js`,
`site/js/mesh.js` or `site/run.html` is a change to production. Prefer the
8-core box — a weak host invents failures above N=10 from its own exhaustion.

The join battery brings the dev stack up itself (site 8099 + relay 8790,
`RELAY_DEV=1`) when those ports are idle, because the browser ladders drive
`swarm.js` at them and a bot that finds nothing there reports `seated=?/N` —
a missing stack that reads exactly like a broken mesh, right down to N=2
failing. Each step's full output goes to `/tmp/join-battery/<n>.log` (or
`/tmp/mesh-churn-battery/<n>.log`); the summary keeps only the last 12 lines.

### Sim disruption catalogue (`test/sim/repro-*.sh` + `sweep.sh`)

| script | disruption |
|---|---|
| `repro-join-patterns.sh` | every arrival pattern × size; H7 dense shape |
| `repro-loss-wedge.sh` | ~10% packet loss at admit (three-state soft sit) |
| `repro-atomic-move.sh` | dual-hold transit; cascade scooch after multi-LEAVE |
| `repro-churn-combos.sh` | loss+kill, cascade+rejoin, sever live link, silent front-row wipe |
| `repro-hchain.sh` | designation chain: dual leave, silent head, vertical, column |
| `repro-headless-row.sh` | head gone; joiners still land in the home row |
| `repro-compaction.sh` | pack-up under mass-kill |
| `repro-adversary.sh` | loss/sever/subnets + dark seat holding a coord |
| `sweep.sh` | kill fractions × seeds; total partition; D5 crash/sever/blackhole |

**ALWAYS CAP `converge` in a stress scenario, or it hangs forever.** `converge`
with no argument returns only once the room reaches a *clean* target (everyone
seated, a full Section 1, zero duplicates). Under a fault where that target is
*unreachable by design* — ~10% loss (the loss wedge leaves a permanent phantom),
severance, subnet partition, or an N so large it can't fully settle — it never
returns and spins a full core at 100% CPU with no output, indefinitely. (A
leftover 100k/1M-seat scratch battery did exactly this: it hung ~11.5h on a
`net loss=0.10 sever=…` leg that called bare `converge`.) So in any lossy /
severed / partitioned / very-large run, give `converge` an explicit tick cap
(`converge 500000`) and treat "didn't reach the target within the cap" as a
measured result (`state` / `check` after it), never as something to wait out.
The committed `repro-*.sh` / `sweep.sh` already do this — copy their pattern for
any ad-hoc scaling battery, and never leave one running unattended without caps.

## servers/ — the fixture servers

`relay-local.js` mirrors the production Worker (`relay/src/relay.js`) and is
what the mesh/relay/drill suites spawn. `fake-ai.js`, `fake-keyapi.js` and
`fake-cors-proxy.js` stand in for the paid upstreams; `fake-keyapi` speaks
both Deepgram's REST shape AND its WebSocket /v1/listen protocol (the runtime
translates REST→WS natively — the WS answer is stamped `request_id:'ws-fake'`
so a suite can prove which transport ran), plus a `/wsonly` base that answers
REST without CORS to exercise the Settings WS-probe ladder. All the fakes and
the suites that use them honor `FAKE_AI_PORT` / `FAKE_KEYAPI_PORT` /
`FAKE_PROXY_PORT`, so they can run beside a gate that owns the defaults.
Also here: `fake-x402.js` (the paid-resource/sponsor fake for the payments
tier-2 spec — started by nothing yet, and its default 8794 collides with
`relay-dev.sh`) and `pause-forwarder.js` (a TCP forwarder drills use to
freeze a link mid-flight).

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
| `behavior-casualty.js` | the CASUALTY chain end to end in source + logic: what counts as a browser death, that a deliberate `leave`/`die`/`quit` never does, the capacity line, and that meet.js → cast.js → behavior.sh → release.sh each still carry exit 4. Pins every link because the original bug was a signal shouted into a channel with nobody at the other end |

## mesh/ — control plane and wire

| suite | covers |
|---|---|
| `mesh-harness.js` | the Node reference harness for `site/js/mesh.js` — replays the C++ sim's scenarios (JOIN, 50%-kill, s1row, s1all) and asserts its convergence targets at N=500/1000. With `mesh.js` it IS the JS reference implementation. |
| `churn-rejoin-livelock.js` / `entry-resume.js` / `greeter-expiry.js` / `ghost-genesis-client.js` / `zombie-genesis.js` | churn/rejoin livelock, entry resume, greeter TTL expiry, and the two genesis-ghost arms |
| `digest.js` / `q5-designation.js` | the mesh digest surface, and Q5 designation (run by `join.sh`) |
| `requeue-pacing.js` | the entry-pacing invariant: a paced-out (same-tick) `join()`/`askSeat()` defers the SEND, never the STATE — a requeue whose rejoin got paced out must never wedge seated-looking-but-coordless (the behavior-04a radio-blip solo, 2026-08-03) |
| `flood.js` | N nodes hit a FRESH relay in one synchronous burst (no stagger) — the genesis-flood claim |
| `e2e-mesh-wire.js` | mesh↔wire over a real relay and real sealing |
| `e2e-mesh-identity.js` | S4 per-participant identity minting over real WebSockets |
| `e2e-vanish.js` | healing-laws D5: vanish-to-seat-freed per departure mode over the production wire stack |
| `e2e-app-owner.js` / `e2e-app-mesh-wire.js` | app ownership on the mesh |
| `steady-socket.js` | R2 socket retention |

## relay/ — the relay protocol surface

All self-contained — none of these need the 8790 relay running. `relay-origin`
is pure logic (imports `originAllowed` straight from `relay/src/relay.js` — no
server at all); `relay-privacy` runs `relay-local.js` in-process via `require`;
the rest each spawn their own `relay-local.js` child on a private port:
`relay-knock`, `relay-device-dedupe` (port 8791 — kill fake-ai first),
`relay-owned` (the §SIG signed-adminship door; its own port 8795),
`relay-voteoff` (majority boot, standing votes, admin rooms never
vote-kick), `relay-adminban` (forged vs signed ban, banlist re-seed),
`relay-genesis-claim` (the R3 founding race).

## browser/ — Playwright

Roughly three families in one directory:

- **desktop / apps** — `e2e.js` (the big one), `e2e-boot`, `e2e-store`,
  `e2e-version`, `e2e-required`, `e2e-visibility`, `e2e-contrast`,
  `e2e-icon-rotate`, `e2e-add-url`, `e2e-run-param`, `e2e-update-erase`,
  `e2e-launch-args` (a LINK saying what to open an app on — `?run=anyroad&`
  `go.at=…&go.fly=1`: declared-only, consent-gated, fail-shut with no sheet to
  ask with, then the real link end to end until a first-time visitor is
  airborne, and a link making the TTS provider speak),
  `e2e-app-store` (the store catalog, its listings, and Install — including
  the rule that browsing must fetch ZERO App GIFs),
  `e2e-app-frame-escape` (AN APP MAY NEVER NAVIGATE ITSELF OUT OF ITS OWN
  FRAME. A `srcdoc` document inherits its base URL from the parent, so for the
  runtime's whole life every app's base was run.html's own address — and
  `location.replace('#x')` or a click on a plain `<a href="#section">` walks
  the frame onto run.html, which finds no #id=/#s=/#j= in the hash it just
  landed on and opens THE MEETING LOBBY. Regexper shipped to the store doing
  that on 100% of launches; bip39 and piskel did it on a click. Fixed in the
  OS — buildAppHtml pins `<base href="about:srcdoc">`, `base-uri about:` in the
  app CSP so the OS's own base is not refused — so this guard is a SWEEP:
  EVERY built App GIF in site/apps/ is installed, launched and clicked, because
  the hazard belongs to the platform and therefore to every app anyone ports
  next. It also asserts the mechanism directly, so a shelf with no `#` anchor
  in it still fails the day the base tag is dropped. That second assertion is
  a confidentiality one too: document.baseURI is readable inside the sandbox,
  and in an app room run.html's hash carries the room's LINK SECRET),
  `e2e-asset-boot-status` (the solo boot's install-time asset backfill is
  VISIBLE: run.html#id= drives the busy pill with the download's own progress,
  and a failed download says so readably while the app still mounts SOFT.
  Exists because the backfill used to report only to the meeting bar's #status
  line, which body.solo-app hides — so an Add-button or ?run= vocal-remover
  downloaded 120 MB of weights behind a blank pane),
  `e2e-pointer-lock` (capabilities.pointer: an app that did not declare it is
  refused by the sandbox, one that did locks the pointer, and UNCHECKING it in
  the Abilities sheet refuses it again — the sandbox is fixed at navigation, so
  a veto that is only honoured where the brokers honour theirs would be a
  checkbox that moves and changes nothing),
  `e2e-fullscreen-lock` (capabilities.fullscreen, the same three legs over its
  TWO hatches — the fullscreen permissions policy and the
  allow-orientation-lock sandbox token),
  `e2e-screen-share` (sharing a screen in a meeting, and the far more
  interesting half: that an app-pinned meeting NEVER NEEDS IT. It drives the
  REAL getDisplayMedia — headless Chromium answers it only under
  `--auto-select-desktop-capture-source`, and then hands back a genuine
  1280×720 'monitor' surface — so "the published track is a display capture,
  not the camera" is read off the outbound sender's own settings. The app-pin
  half COUNTS rather than trusts: getDisplayMedia is WRAPPED, never stubbed
  (a stub would make the whole assertion vacuous), and the counter must stay at
  ZERO while an app is pinned into a meeting, on host and guest alike, and in
  an app-pinned room — which offers no share control at all, with the ordinary
  meeting buttons beside it asserted VISIBLE so "hidden" means hidden by the
  rule and not by an unrendered bar. That last assertion found a real bug the
  day it was written: Invite-from-solo left `html.solo-app` set, so an app room
  born that way had no meeting bar, no grid and no filmstrip, ever. A last leg,
  on its own flagless browser, guards the invariant that NO APP can photograph
  your screen however its manifest is written — see site/js/runtime.js for why
  a capabilities.screen cannot be built without breaking the app sandbox),
  `e2e-fps-touch` (the thumb controls FPS Simple adds to an engine that has
  none: a real touchstart reveals them and a mouse machine never sees them, then
  a thumb reaches `input.stick` / `_rawLook` / the button queues and the
  player's yaw actually turns. NOTE, the trap this suite paid for: once
  `engine.start()` owns requestAnimationFrame, `waitForFunction` cannot run in
  the app frame AT ALL — even `() => true` times out — while `evaluate` of the
  same expression is correct. Poll from outside; a broken waiter reports a
  working app as a TimeoutError),
  `e2e-join-prettyurl`, `e2e-perms-share`, `e2e-owned-app`, `e2e-mymedia`,
  `e2e-mymedia-share`, `e2e-theme-wallpaper`,
  `e2e-wasm`, `e2e-irl`,
  `e2e-sound-it-out-share` (what a shared app shares: the sight-word list is
  CURRICULUM and must reach a guest both ways, while private prefs must never
  appear in the mirror — it lived in private prefs and silently did not cross).
- **meeting** — `e2e-meet-lobby`, `e2e-meet-invite`, `e2e-meet-prettyurl`,
  `e2e-meet-quiet`, `e2e-meet-record-app`, `e2e-meet-mod` (blur/mute/undo,
  stage, vote, admin rooms — 48 checks), `e2e-meet-password`, `e2e-video`,
  `e2e-sing`, `e2e-mosaic`, `e2e-media-recovery`, `e2e-handq`,
  `e2e-pipe` (the encoded-passthrough lane's DETERMINISTIC half: the module
  chain, and the one-tap fan-out that guards the detached-buffer bug — one box,
  no room, no relay) and `e2e-pipe-mesh` (its six-seat room, which DECLARES
  NEEDS-FLEET; see the worked example above),
  `e2e-meeting-app`, `e2e-mymedia-meet`, `e2e-chess-mp`, `e2e-pip`
  (backgrounding floats the best room video in a PiP overlay; source picker
  never floats your own preview), `e2e-away-holdover` (G1: pocketed phones —
  consent holds without flapping, roster never blinks, vote need drops to the
  engaged majority, 60s holdover expiry backstop; 5 browsers, ~4 min),
  `e2e-vis-park` (hidden-viewer dormancy: a hidden tab's mates park the main
  video they send it — PiP float source excepted, audio never parks, full
  restore on return; 13 checks).
- **AI / network** — `e2e-caps`, `e2e-ai-types`, `e2e-agent`, `e2e-chess-hint`,
  `e2e-askai` (the seeded Ask AI app + the streaming contract under it:
  `gifos.ai.chat({onDelta})` delivers fragments spread over time that join to
  exactly `r.text` while the same call without `onDelta` stays one shot; the
  app is caught painting an answer HALF-DRAWN, stamps every message with a
  wall-clock datetime, reports first-word and total time, keeps the
  conversation across close-and-reopen and hands it back to the model as
  context — proved by the fake endpoint reporting how many messages it was
  actually given, not by reading the app's own screen)
  (all need fake-ai), `e2e-providers` (Provider apps + install-time assets,
  docs/providers.md: recognition-is-a-place with the red ✕, the network-less
  hard rule, ack sheet naming the provider, the real Offline Text to Speech provider speaking a
  WAV through gifos.ai.tts with its engine in-GIF, a synthetic provider
  proving the assets download-verify-cache tier (Blob store hit, GIF
  byte-identical), and the real Offline Cheap Text LLM BitNet provider
  booting llama.cpp in the hidden mount to answer the SEEDED Ask AI app;
  needs only the 8099 static site),
  `e2e-api`, `e2e-cors-proxy`, `e2e-proxy-cache`,
  `e2e-fetch-bridge`, `e2e-fluence-setup`, `e2e-fluence`,
  `e2e-anyroad-mp` (THREE people driving one Anyroad, through BOTH doors:
  `ROOM=meet` a meeting with the app on its stage, `ROOM=app` the app invited
  in place as its own room with no call layer — unset runs both. Guards mp.js
  end to end, and is where the download pool is proven on a real app: nine
  tiles, nine upstream requests, players driving on roads they never
  downloaded. `RECORD=1` writes a per-player screen recording to `test/out/`),
  `e2e-fps-simple` (the FPS Simple port, from its real built GIF. TWO HALVES
  ASKING FOR DIFFERENT HARDWARE. **Solo** runs anywhere — it boots in the
  sandbox, LOCKS THE POINTER through a real manifest, keeps Tab for the
  scoreboard instead of the weapon swap upstream binds it to, and reaches the
  network zero times; all state, so a slow box answers the same as a fast one,
  and it pins `GIFOS_FPS_QUALITY=low` because a software rasteriser otherwise
  spends ~35 s building scenery it never looks at. **Deathmatch** DECLARES
  NEEDS-FLEET and takes a machine per player: two peers in one room must see
  each other, build the SAME street from the shared seed on two different
  machines, SPAWN A BODY for each other (a name on a scoreboard is not something
  you can shoot), pay a claimed hit ONCE rather than once per redelivery of the
  row, and then actually KILL — the target concedes its own death, the kill is
  credited BY ID to the player who fired it, and a claim against the previous
  life does not follow the target into the new one. It lets each device pick its
  own quality, which is the point of asking for the boxes. Every multiplayer
  assertion guards code with nothing else watching it: upstream Claude of Duty
  has no networking at all),
  `e2e-air-hockey` (the Air Hockey port booted from its real built GIF, until
  the table PLAYS. The GifOS OBJMTLLoader shim used to call onLoad
  synchronously; hockey.js writes `var me = this` AFTER its loadModels()
  call, so modelsLoaded fired on an undefined `me`, threw, and the app
  shipped as a score bar over a permanently black table. The suite asserts
  a clean boot, a table that exists (the app area is not one flat colour),
  a scene that animates, and a drag that moves the paddle — all state, no
  timing claims, because WebGL frame rate on a software rasterizer is not
  what is under test),
  `e2e-battle-city` (the Battle City port, from its real built GIF. The app
  shipped with EVERY TANK FROZEN — `canMove` compared the mover by reference
  against a copy of itself, so every move in the game was refused and the
  first stage could not be finished — and nothing caught it because nothing
  opened the app. Two legs, one box each, all state: **desktop** boots the GIF
  in the sandbox, checks all five scripts and 35 stages rode inside it, and
  drives the tank with the arrow keys, J and P; **phone** proves a real touch
  reveals the pad, the board is scaled to the screen rather than left at 1x in
  a corner, no control is drawn over the board or over another control, and a
  d-pad TAP moves the tank — press and release land between two frames, and
  the first build threw the direction away. The rules of the game itself are
  pinned headless in `test/unit/battle-city.js`),
  `e2e-pool` (capabilities.pool — two peers in one meeting, one URL, and the
  upstream is asked ONCE; spawns its own counting server on 8801 and asserts
  the COUNT, not the source, so a cache or a second code path cannot fake it.
  Also checks the three declaration rules and that the same app without the
  capability costs two requests).

## drills/ — self-contained scenario rigs

Each spawns its own relay and its own static server for THIS checkout's
`site/`, so they are safe to run from a worktree.

| drill | proves |
|---|---|
| `e2e-fork-heal.js` / `e2e-ghost-genesis.js` / `e2e-pw-heal.js` / `e2e-relay-blip.js` | fork healing, ghost-genesis at the door, password re-key healing, and a relay blip mid-room |
| `e2e-latejoin.js` | the late-join deadlock: greeter-door sponsor entry, ttl-bounded `fsig`/`fmesh` hops, the `nosock` bounce (meet-security §FWD, healing-laws R2) |
| `e2e-peer-relay-reunion.js` | E5 §1 friend-relay among co-members: ICE-split pair in ONE room, third co-member joins same room → "via Hub" (not a two-meeting merge; that stays R5 pick-one) |
| `e2e-r5-fork-pick.js` | R5 / E5§2 browser rung: same-key dual greeter halves (forceSeat tear + ICE block) → `#fork-modal` → pick-one → seat only one half. Clustering/faces unit is `mesh/r5-fork-pick.js` (already in `join.sh`) |
| `mirror-drill.js` | the sdn DORMANT-MIRROR standby: 8 browsers force-seated at C=2, kill the direct relay, the parked mirror wakes |
| `redun-drill.js` | ONE pipe moves bits — every alternate path parked, then failover wake. Turns the stager's CAMERA ON before it steps up: join-quiet + the 20s camera idle-stop leave `mySelfStream()` null, and a stager who broadcasts nothing makes every failover leg unreachable (2026-08-06). **`DRILL_PIPE=off` runs the GATE's media plane** — see below |
| `e2e-stage-voice.js` | THE ROOM CAN HEAR A CAMERA-OFF STAGER. Three seats, one steps up on the join-quiet default (muted, camera off), and past the 20s camera idle-stop the feed must still be shipped, still be held by every listener as an AUDIO-ONLY stream, and be HEARD (`stageEarLevel`) the moment it unmutes — plus a camera-ON control arm proving the video path is untouched, and a churn bound on the self-stream identity. Guards the 2026-08-06 fix to `mySelfStream()`, which threw the audio track away with the video one |
| `e2e-vanish-browser.js` | the browser half of D5: pagehide→instant LEAVE, `dc.onclose`→`transportLost`→probe-gated early confirm, with a SIGKILLed victim browser |
| `casualty-noverdict.js` | THE HARNESS MAY NOT INVENT A DEFECT OUT OF A DEAD CLIENT. Crashes one actor's renderer for real (`crash` → `chrome://crash`) and requires exit **4**, a CASUALTY line, and **zero `✘`** — the checks sitting one line past the crash must never even be reached. Then the other direction: a DELIBERATE `die` must still render a verdict (exit 0), because a hair-trigger gate would refuse to judge `12b-team-car-death`. See "A DEAD BROWSER IS NOT A VERDICT" |
| `e2e-meet-app-prettyurl.js` | an app shared into a meeting STAYS mounted under the pretty `/meet/<room>` URL. Forces the gifos.app-only pretty-URL rewrite locally (route-patches `pretty=true`, blocks the SW) so the document base moves as it does on prod, then asserts the runtime does not 404 `app-owner.js` and the app is not torn down ~1s after mount. Guards the prod-only regression where a relative dynamic script load broke under the moved base |
| `e2e-meet-app-guest-perms.js` | a GUEST of a meeting mounts a shared network-capable app (the Bible Browser) AND is shown its "reach the internet" challenge, under the pretty `/meet/<room>` base. Same pretty-forcing as above, two participants: guards the CLIENT-side face of the `app-owner.js` moved-base 404 — where `bootClientBus` threw before `mountApp` (so no iframe, no `__gifosPermissions`) and the guest saw a blank space with no challenge |

### THE GATE AND YOUR DESK ARE NOT RUNNING THE SAME MEDIA PLANE

The encoded-passthrough pipe lane needs `RTCRtpScriptTransform`. The release
gate pins `MEET_CHROME` to **chromium-1193 = Chrome 140, which does not have
it** — so in the gate every relay hop TRANSCODES, and a hop forwards the
ORIGINAL remote track (one `trackIdentifier`, many m-lines). On any current
Chromium (141+ here) the lane is LIVE and each hop ships a fresh CARRIER track
with its own id. For the media suites those are two different products, and a
measurement that does not say which one it took cannot be compared with
another one.

That divergence is not hypothetical: redun-drill was promoted out of quarantine
2026-08-06 on 13/14 measured with the lane LIVE, and went red at the next gate
with the lane DEAD, on a phantom the lane had been hiding (see 2026-08-07).

So: **`redun-drill.js` takes `DRILL_PIPE=off`**, which sets the product's own
`gifos_pipe=off` switch and reproduces the gate's plane on a box whose only
Chromium is current. Every run of it now prints which plane it measured:

    media plane: encoded-passthrough pipe lane is OFF (chrome=151)

If you are chasing a media red that the gate has and you do not, set it first.

## swarm/ — scale and live tools

**Production is the default, but nothing here is production-only.** With no
flags `swarm.js`, `meet.js` and `squat.js` load
`https://gifos.app` and hit the real relay (`vanish-drill.js` is the
exception — self-contained, it spawns its own relay + static server and is
always local). Both knobs redirect them at the
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
- **Playwright chromium builds may lack H.264** (2026-08-05: the gate pin
  chromium-1193 answers `canPlayType('avc1')` EMPTY; the standalone
  chromium-1194 under /opt has it). Anything decoding an mp4 in-page — the
  talking-head clip pack above all — silently never fires `loadedmetadata`
  there. meet.js's shim now times out to the portrait canvas instead of
  hanging, but if a camera mysteriously never turns on under one binary and
  works under another, CHECK THE CODEC before anything else: one missing
  decoder produced a night-long cross-box "flake" (behavior 24a) that was
  really deterministic per-build.
- **A box with no playwright chromium falls through to real Chrome — and
  headless real-Chrome 137 stalls the DESKTOP boot on plain-http origins**
  (2026-08-05, measured): pw.js's search walks /opt/pw-browsers and
  ~/.cache/ms-playwright, and on a box where those chromium dirs are empty
  shells it lands on /opt/google/chrome. Under that binary, headless, the
  desktop's load()→seed chain never completes on http://127.0.0.1 — e2e.js
  reads ZERO icons and times out on `.icon` (looks exactly like a seeder
  regression). Discriminators before believing such a red: the same tree via
  playwright-firefox paints all 12 icons; the same Chrome against the https
  production origin paints all 12; the frozen last-release snapshot fails
  identically. If all three hold, it is the box's browser resolution, not the
  tree — install a real playwright chromium or pin MEET_CHROME.
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

### Other ENGINES — `meet.js --engine chromium|webkit|firefox`

On a Linux fleet the attainable diversity axis is ENGINES, not OSes: Chromium
(also Android Chrome and Edge), WebKit (Safari's engine) and Firefox (Gecko).
`meet.js --engine` (env `MEET_ENGINE`) puts a participant on one of them;
webkit/firefox launch BARE because their launchers reject Chromium switches
(see the engine block at the top of `meet.js` for what each dropped switch
bought and its engine-neutral substitute — notably `BB_ACTOR=1` in the browser
process environment replaces the `--bb-actor` marker flag for fleet reaping).

**Measure the engine before wiring scenarios to it.** `test/tools/engine-smoke.js`
is the measurement: a 2-party room, judged from BOTH sides (seat, links, mutual
roster sight, video liveness, DC gossip, chat over DC, and with `APP=1` an app
share mounting on the far side); `DIAG=1` adds the forensics that tell "no
media arrived" from "media arrived and decoded, but the element never started".

Measured 2026-08-05 on a 4-core Linux box, playwright 1.61.1, local site+relay:

- **Firefox (firefox-1532 / Firefox 151) — FULL PASS**, every assertion
  including the app lane (guest mounted the shared app in 5s). It has
  `RTCRtpScriptTransform` (Gecko does; playwright's WebKit port does not). It
  has **no H.264** (no OpenH264 in the playwright build) — VP8/VP9/AV1 only, so
  a firefox↔chromium call negotiates VP8. Playwright throws on `isMobile` for
  firefox, so the `--profile phone` shape drops that one property.
- **WebKit (webkit-2311, UA Safari 26.5) — JOINS, but is NOT a full
  participant.** Control plane is perfect: seated, links up, mutual sight,
  DC gossip both ways, chat crosses. Two hard limits:
  1. *Remote tiles never render.* getStats on the WebKit side shows inbound
     H.264 arriving and DECODING (`framesDecoded` climbing, `frameWidth`/
     `frameHeight` set), yet the tile's `<video>` stays `readyState 0`,
     `videoWidth 0`, and `play()` never settles. Not autoplay and not the
     silent audio track — removing the audio track from the stream changes
     nothing (tested). Its own local canvas-captureStream preview plays fine,
     and chromium peers see ITS video, so WebKit is a working SENDER and a
     working decoder that cannot paint a remote MediaStream. Consequence: a
     WebKit role may assert control-plane/DC facts, and may be the peer whose
     video someone else checks, but must never be the OBSERVER of video
     liveness — `roster[].vid` is false there for harness reasons.
  2. *The app share KILLS it.* Within ~5s of a host running an app into the
     room, the WebKit web process CRASHES ("the renderer process died") and the
     page is gone. Reproduced twice, with and without the diagnostic probes.
  Also, as previously measured: no `RTCRtpScriptTransform` (so
  `GifOS.meshPipe.supported()` correctly returns false and the pipe lane
  self-disables — verified, do not "fix" it), and `newContext` rejects the
  Chromium permission name `'camera'`.
- Both engines ship **no fake capture device**: real `getUserMedia` fails
  (`OverconstrainedError` on webkit, `NotFoundError` on firefox). The injected
  canvas-captureStream camera is therefore REQUIRED off chromium, not a
  convenience — but it is pure page JS and carries across all three unchanged.
- Chromium binaries are found by SEARCH (both `chrome-linux`/`chrome-linux64`
  spellings under `/opt/pw-browsers` and `~/.cache/ms-playwright`, then a real
  Chrome). The single hardcoded path this replaced had become a dangling
  symlink, and the fallthrough was silent — playwright launched its default
  `chrome-headless-shell`, which was not installed either, so actors died with
  "Executable doesn't exist" *after* the harness said it was ready.
- **Firefox HAS an insecure-origin escape hatch; chromium's switch is not the
  only one** (measured 2026-08-05, correcting the first version of this note).
  `dom.securecontext.allowlist` takes a comma-separated **HOST** list — no
  scheme, no port — through playwright's `firefoxUserPrefs`. Against a
  plain-http tailnet origin, without it: `isSecureContext` false,
  `crypto.subtle` undefined, `navigator.mediaDevices` absent, so the page is
  dead before the mesh starts. With it: all three present and WebCrypto
  **Ed25519 `generateKey` succeeds** (the join floor). `meet.js` sets the pref
  itself from `MEET_INSECURE_ORIGINS`, so a firefox actor works cross-box with
  no extra flags. WebKit still has nothing equivalent and keeps its warning.

**In the BEHAVIOR battery.** A role spec takes `engine: 'firefox'` (default
chromium), and `BEHAVIOR_ENGINE` re-engines a scenario without editing it:
`BEHAVIOR_ENGINE=firefox` for an all-Gecko room, `BEHAVIOR_ENGINE=maya=firefox`
for one non-chromium viewer in an existing story. `25a-mixed-engines-household`
is the gated cross-engine guard (one firefox phone among chromium peers: one
tree, video BOTH ways — which only passes if the call negotiated VP8 — and a
dropout healing on the non-chromium side). Three mechanisms make it safe:

* `needEngines('firefox')` SKIPs loudly (exit 0, one `SKIP:` line) on a box
  with no firefox, exactly like the `[relay-dev]` scenarios. A missing BROWSER
  is an environment fact, not a product red — but it is never silent either.
  Negative-controlled: with `PLAYWRIGHT_BROWSERS_PATH` pointed at an empty
  directory the scenario prints the SKIP line naming the install command and
  exits 0, instead of spawning an actor that dies later.
* Fleet placement is engine-aware: a host entry declares `"engines": [...]`,
  and a role is only placed where its engine can launch. Without that filter
  the actor dies with "Executable doesn't exist" AFTER the harness said ready.
* `behavior.sh`'s between-scenario reap sweeps `BB_ACTOR=1` in `/proc/*/environ`
  as well as the chromium name patterns — those patterns cannot see a leaked
  firefox, and a leaked actor still holds a relay socket and a seat.

**Staging engines on a fleet box** (`node node_modules/playwright/cli.js
install firefox`, no sudo needed if the deps are already validated for
chromium):

* The browser revision follows the PLAYWRIGHT version, not the box: 1.61.1
  pulls firefox-1532 (Firefox 151), 1.62.1 pulls firefox-1538 (Firefox 153).
  So a hosts-file `firefox` path is per-box; leave it out and playwright's own
  registry resolves it, which is usually what you want.
* **ARM64 is fine** — playwright ships `firefox-debian-12-arm64`, so the small
  ARM clients can be firefox actors too (installed and verified 2026-08-05).
* **An ALL-Gecko room works** (2026-08-05): `BEHAVIOR_ENGINE=firefox` on
  01a-household-rolling, three firefox actors spread over two ARM cores and an
  x86 box — founding, serial arrivals, ONE tree of 3, a clean leave with no
  ghost, and a rejoin into the same room. But the SAME run with two of those
  firefox actors CO-LOCATED on one box (which was simultaneously running
  another session's browser suite) had both actors seated and each reporting
  `participants=1` — a room that never saw itself. Not reproduced once the pair
  was split across boxes, so it is filed as contention, not as a Gecko-pair
  defect; if you meet it again, the discriminator is exactly that — move the
  two actors apart before believing anything about firefox↔firefox.
* Firefox is SLOWER to become a participant, and the cost is in launch, not in
  the mesh. Same 3-role scenario, per actor: on one idle box chromium
  launch→seat ≈ 3s and firefox ≈ 11s; across the farm, chromium ≈ 13s and
  firefox ≈ 67s (26s of it a cold first launch on that box, 32s page load over
  the tailnet). Everything still converged — but do not read a firefox actor's
  join as a mesh stall, and do not write a cross-engine scenario with a tight
  `waitSeat`.

**STOCK WebKitGTK is not the escape hatch from Playwright's WebKit — measured
2026-08-05, REFUTED.** The standing suspicion was that Playwright's EMBEDDER,
not WebKit, is what makes a WebKit guest join the control plane yet never paint
a remote tile and die on the app share; the plan was to drive the engine the
distro ships (WebKitGTK — what GNOME Web runs) through its own
`WebKitWebDriver`, and, as a stretch, get `RTCRtpScriptTransform` from the
`WEBKIT_FEATURES` env plumbing that Playwright's fork lacks. The question never
got that far: **stock WebKitGTK has no WebRTC at all.**

`node test/tools/webkitgtk-smoke.js` is that measurement, re-runnable on any
box in one command (no npm deps — raw WebDriver over `fetch`, its own probe
server, its own Xvfb and driver). Modes: `caps`, `rtc`, `build`, `gi`.
Needs `sudo apt-get install webkit2gtk-driver xvfb gir1.2-webkit2-4.1`.

- `RTCPeerConnection`, `RTCDataChannel`, `RTCSessionDescription`,
  `RTCIceCandidate`, `RTCRtpSender`, `RTCRtpScriptTransform` — **all
  `undefined`**. `MediaStream`, `getUserMedia`, `canvas.captureStream` and
  `crypto.subtle` are all PRESENT, so the hole is exactly and only the peer
  connection. No mesh link, no DC lane, nothing to smoke.
- **Cause, upstream of any distro:** `Source/cmake/OptionsGTK.cmake` declares
  `WEBKIT_OPTION_DEFAULT_PORT_VALUE(ENABLE_WEB_RTC PRIVATE
  ${ENABLE_EXPERIMENTAL_FEATURES})` — OFF in release builds — while
  `ENABLE_MEDIA_STREAM` is ON. `debian/rules` never overrides it. Do not go
  looking for a distro that packaged it differently: it is off by default
  everywhere.
- **The `enable-webrtc` setting is a decoy.** `WebKitSettings` really has
  `enable-webrtc` (and MiniBrowser exposes every WebKitSettings property as
  `--enable-webrtc=TRUE` etc. via `--help-websettings`). Set it through the C
  API and it reads back `True` — and `RTCPeerConnection` is still undefined.
  A live property over a subsystem that was never compiled in.
- **The build census, with its positive control:** `libwebkit2gtk-4.1.so.0`
  links neither `libgstwebrtc-1.0` nor `libgstsdp-1.0`, *while
  `libgstwebrtc-1.0.so.0` is installed on the box*. Without that second half
  the first half only says "unavailable"; with it, it says COMPILED OUT.
- Fleet-wide, so nobody re-runs it per box: Debian bookworm ships
  webkit2gtk **2.50.6** (`webkit2gtk-driver` = `/usr/bin/WebKitWebDriver`,
  MiniBrowser at `/usr/lib/<triplet>/webkit2gtk-4.1/MiniBrowser`) — new enough
  for the `WEBKIT_FEATURES` plumbing, and irrelevant. The Ubuntu 22.04 box has
  2.50.4. bookworm's WPE sibling (`libwpewebkit-1.1-0` 2.38.6 +
  `wpewebkit-driver`) links no gstwebrtc either. `WebRTCEncodedTransform` does
  not even appear in `MiniBrowser --features=help` (472 features), because the
  whole subsystem it belongs to is absent.
- So **ledger #5 (the pipe lane on a Safari engine) stays with real Apple
  hardware** — the iPhone lane. On Linux the only engine with
  `RTCRtpScriptTransform` remains Firefox, which is already a full participant.
  A WebRTC-capable WebKitGTK would have to be built from source with
  `-DENABLE_WEB_RTC=ON`; the tool is written so that the day such a build
  exists, `caps` goes green and `rtc` becomes the next question — it already
  implements the test Playwright's WebKit FAILS, which is that the RECEIVING
  `<video>` reaches `readyState>=2` / `videoWidth>0`. Decoding is not painting.
- Trap: WebKitGTK is a real GTK app and wants a display. Give it Xvfb
  (`Xvfb :99 …`, `DISPLAY=:99 GDK_BACKEND=x11`), never the user's `:0` — a
  smoke run must not throw windows onto somebody's desktop. And do not drive
  MiniBrowser by hand for measurements: it has no output channel for JS
  results, so a run that silently did not load looks exactly like a run that
  loaded and answered. WebDriver or the gi route, both of which return values.

`swarm.js` runs N headless bots as real
`run.html` clients (solid-swatch cams, `swarm-voices.js` espeak clips,
`swarm-videos/` talking-head packs). `swarm-handq.js` is the hand-queue scale
check. `vanish-drill.js` measures human-visible vanish at swarm scale.
`meet.js` is the meeting command line — join a real room as a participant and
inspect it interactively, as a stream, or one-shot. `squat.js` holds a stage
seat until its owner arrives.

## tools/ — not assertion tests

`browser-image-check.js` (renders a GIF in a browser), `overlay-render.js`
(mesh-media overlay compositing), `shot-fluence.js` (screenshots the Fluence
app README image), `approom-host.js` + `approom-join.js` (app-room join
latency, per-leg TRACE), `engine-smoke.js` + its `engine-smoke-pcrec.js`
init-script (can a given browser ENGINE be in a meeting at all — see
"Other ENGINES" above), `webkitgtk-smoke.js` (the same question asked of the
distro's own WebKitGTK through `WebKitWebDriver`, outside playwright entirely).

`stage-solo-lag.js` answers "why does the Stage feel laggy with ONE person in
the room" with a COUNTING CAMERA: a faked getUserMedia paints a flat luminance
code stamped with `performance.now()`, and the page decodes it back out of the
me tile and of the composited Stage strip, so the two videos' delay behind
capture is a subtraction. Legal on one box precisely because a solo room has no
topology and no network in the path — the whole chain (blur pipe → strip packer
→ `captureStream`) is inside the tab, and the me tile is the control on the
same clock. It also prints `mosaic().jobs`, which in a room of one is `[]`: the
strip is composited for an audience of nobody.

**Fork forensics** (bug ledger 2026-08-05 §6 — two one-seat trees on ONE relay
session for seven hours, invisible from inside either of them):

- `fork-detect.js` is the OBSERVER, not a test: the in-page probe plus the
  dwell clock behind `meet.js`'s `door`/`fork` command, its snapshot field and
  its stderr alarm. A peer socketed on my relay session that holds no cell in
  my occupancy, past any lawful entry dance, is a second tree — one relay
  session is one stadium (R2/R3). Read the header before changing the dwell.
  The guard that exercises it is `drills/e2e-room-fork-live.js`.
- `door-registry-probe.js` speaks the knock protocol directly — no browser, no
  mesh — so a greeter-registry state machine can be reproduced exactly, in
  seconds. `{t:'knock', gk:''}` turns out to be a READ-ONLY door census (it
  claims nothing and still gets the blob list), and `--relay/--sid` points it
  at a real door. Its leg B currently DEMONSTRATES a live defect rather than
  asserting its absence — a stale blobless claim holds a room's genesis
  forever — which is why it is a tool and not a gate.

## Known state

**Decided-not-to-fix things live in `batteries/known-unfixed.sh`**, which is
expected to be RED end to end — including the partition FREEZE and the late-join
app-adoption gap. The entries below are the rest: flakes,
environment traps, and unconfirmed reports, which are NOT the same thing as a
decision and so are deliberately kept out of that script.

- `browser/e2e-fluence.js` was recorded here for a long time as "fails on the
  Deepgram pipeline". IT DOES NOT. It needs `fake-ai` (8791) and `fake-keyapi`
  (8792); without them it times out 20s deep inside the app on a locator that
  never appears, which reads exactly like a broken pipeline. With the fixtures
  up it is 20 assertions, ALL PASS, on both boxes. Promoted out of the graveyard
  2026-07-27. Every fixture-dependent suite now calls `test/lib/need.js` first,
  so a missing server says so in one line instead of impersonating a bug.
- Late joiners do not adopt an app already running in a meeting: app STATE
  rides the structural-neighbour `sga` flood while presence rides
  `meshNode.gossip`, so a newcomer learns an app is running but never receives
  the retained snapshot. `browser/e2e-meeting-app.js` and
  `browser/e2e-mymedia-meet.js` are left failing on purpose as guards.
  (In `known-unfixed.sh`.)
- A total partition may FREEZE one half (~1 split in 6): correctness holds
  (no split-brain, asserted by `test/sim/sweep.sh`) but the frozen half seats a
  fraction of its members. Decided 2026-07-21; see `docs/healing-laws.md`
  § "Partition: one half may FREEZE". (In `known-unfixed.sh`.)
- `browser/e2e-app-governance.js` open-room "latest-wins takeover" is flaky:
  B never becomes `appIsHost` (null `contentWindow` postMessage).
- `drills/e2e-latejoin.js` ARRANGES its own socketless-neighbour scenario
  (`forceSeat` + `learnOcc`) so the deadlock leg is measured every run. Needs
  `RELAY_DEV=1` on its own relay (the frame meter otherwise looks like the
  deadlock). Prefer the browser-capable gate box for the browser drills.
- `drills/adversary-room.js` has, on at least one run, caught every coord being
  held by two participants with populations disagreeing (3–6 of 11). Whether
  that split survives the current wire is unconfirmed. It is the reason the
  drill asserts distinct coords and agreeing population at all: link-based
  checks are blind to a split room, because each fragment wires itself up
  perfectly.
