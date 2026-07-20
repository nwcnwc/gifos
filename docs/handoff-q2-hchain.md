# Handoff — Q2 (compaction) then H-CHAIN, each all the way to LIVE production

Written 2026-07-19, end of the session that merged branches 3A + 3B and wrote
the H-CHAIN law text. **This is the resume doc for the next session — read it
top to bottom, then act on §8.** It is self-contained; deeper background is in
`docs/handoff-2026-07-19.md` (the prior handoff), `docs/healing-laws.md`,
`docs/media-plane.md`, `docs/roadmap.md` §3, and the memory index.

The standing model (CLAUDE.md): work directly on `main`; every push
auto-deploys `site/` to gifos.app via GitHub Pages (live ~1 min). The relay is
a separate Cloudflare Worker — `wrangler deploy` from `relay/` **only** when
`relay/` changes (Q2 and H-CHAIN are control-plane, NOT relay — so no wrangler
unless that changes).

---

## 1. What LANDED this session (all on `main`, pushed, gates green)

| Commit | What | Verification |
|---|---|---|
| `1114dac` | **3A — atomic seat-moves (law T) + headless-row admission fix.** Rebased onto main (its 12 commits forked BEFORE D5/media landed); the D5×law-T conflicts were hand-woven (D5's `tlClear`/`tlForget`/`TRANSLOST` coexisting with law-T's dual-hold/`MOVED`) across `sim/mesh.cpp`, `sim/mesh_seat.inc`, `site/js/mesh.js`. | harness ALL PASS (incl D5 suite), `repro-headless-row` + `repro-atomic-move` GREEN, **full 300-case churn sweep 300/0**, e2e autoheal/failover/reconnect PASS, e2e-video 72 PASS (fails only at the pre-existing line-590 "via Hub" leg, same as pristine main) |
| `91d72fd` | roadmap: dropped the now-CLOSED headless-row entry | — |
| `fef0ae5` | **3B — tiles follow fast detection.** Event-driven tile/roster removal off D2/D5; hand-queue 15s freshness; `'left'` fast-removal gated on opened-then-closed channel. | `e2e-vanish-browser` ALL PASS: graceful vanish **0.9s** (target ≤3s), crash tile-gone **7.0s** / seat-freed **6.9s** (target ≤10s), AWAY (18s hidden) never removes, BLIP never false-removes; meet.html parses, harness + e2e-autoheal no regression |
| `0a3cb70` | **Q1 law text — H-CHAIN designation chain.** `docs/healing-laws.md`. Encodes Nathan's DEPTH RULE + the S1-rich/deep scoping. Marked **STATUS: SPECIFIED, sim-verification PENDING** (same convention as W7 and S4). | Nathan reviewed the text 2026-07-19: **"looks good."** |

The two spend-limit-killed branches (3A + 3B) are both fully landed. The rebase
(not merge) approach kept `main` linear — no merge commits, per CLAUDE.md.

**H-CHAIN is NOT implemented** — sim or production. Confirmed to Nathan. The one
LIVE instance of that family is 3A's single-step admission devolution (a vacated
head's admit duty → `(0,r,1)`). The general chain (multi-level witness chain,
depth rule, row-clique devolution to depth C−1, vertical/resurrection recursion,
self-wire-with-hint) is design only. Today the dangling-designation cases are
handled CORRECTLY-BUT-SLOWLY by the existing E1 drain + s1Fill backstops (the
300/0 sweep proves correctness); H-CHAIN is a speed/determinism win, not a
correctness fix.

---

## 2. THE MISSION (Nathan's explicit instruction, 2026-07-19)

> "Do **Q2** all the way through from beginning to end, where ending is all the
> way in production and tested on live production using the home LAN hw. Then do
> the same with **H-CHAIN**."

So each of Q2, then H-CHAIN, runs the FULL pipeline:

1. **Design** is already agreed (Q2 in roadmap §3; H-CHAIN in healing-laws.md).
2. **Sim-first** — implement in `sim/mesh.cpp` + `sim/mesh_seat.inc` (source of
   truth), add a deterministic repro (like `repro-atomic-move.sh`), verify.
3. **Port to `site/js/mesh.js`** line-for-line; pin with `test/mesh/mesh-harness.js`.
4. **Gate** — `node --check` mesh.js/mesh-wire.js + meet.html inline scripts;
   `node test/mesh/mesh-harness.js` ALL PASS; build sim + **full `sim/sweep.sh`**
   (300/0); the new repro GREEN; relevant browser e2e green.
5. **Ship to production** — commit to `main`, push (auto-deploys gifos.app). NO
   wrangler (neither Q2 nor H-CHAIN touches `relay/`).
6. **Test on LIVE production using home-LAN hardware** — §5. Deploy is not
   "done"; observing the new behavior live at some scale is the acceptance bar.

Order is settled: **Q2 first, then H-CHAIN.** Why (corrected in-session — the
first rationale was wrong): Q2 does NOT obviate Q1/H-CHAIN (the empty-down-child
slots I first cited are the normal dense-before-deep FRONTIER, healed by H2 —
not non-density; the real vertical-recursion case is a transient double-death Q2
can't prevent). Q2 goes first because it is **foundational and lower-risk** than
core-healing devolution: it packs the tree (its real payoffs — kills deep
lone-row sections so the sdn-mirror's one no-route case becomes transient-only,
cuts depth/latency, packs the density W7 assumes), and it exercises the law-T
atomic-move path that H-CHAIN's self-wire also rides. H-CHAIN's law text and
Nathan's review are NOT blocked by Q2 — they're largely independent.

---

## 3. Q2 — COMPACTION via atomic moves (design AGREED; build it)

**Design (roadmap §3, commit `79e2940`, agreed with Nathan):** a seat that
observes strictly-better vacancies ABOVE it — a shallower seat, or joining an
occupied row instead of sitting alone in a lone-row section — initiates an
ordinary **atomic move (law T, now LIVE from 3A)** to the frontier. The
up-seat/parent is the natural admitter (freshest frontier view). **Hysteresis:**
move only on a STABLE strict improvement, rate-limited, so a boundary that
oscillates never sloshes seats back and forth.

**Payoffs:** kills persistent lone-row deep sections → the sdn mirror's one
provable no-route case becomes transient-only (see media-plane.md Phase 2);
removes wasted depth/latency in shrinking rooms; packs the tree the stadium
metaphor assumes.

**Build notes (grounded in this session's sim reading):**
- Law T (`doMove`, dual-hold transit, rollback, tombstone) is DONE and green —
  Q2 is a new *trigger/policy* on top of it, not new move mechanics. A
  compacting seat calls the same `doMove` an admitter-directed move uses.
- "Strictly-better vacancy above" = a free frontier cell at a SHALLOWER depth,
  or a free cell in an already-occupied shallower row (density), that the seat
  learns from its parent/roster. The parent (up-seat) is the admitter, so this
  reuses the ordinary FIND/admit path — a compacting seat effectively re-FINDs
  from a better starting point and moves if the result strictly dominates.
- **Hysteresis is the delicate part:** define "strict improvement" precisely
  (depth decreases, or lone→shared row) and require it to hold for a settled
  window before moving; rate-limit per seat. Without this, two seats near a
  section boundary can trade places forever. The sim's churn sweep + a dedicated
  `repro-compaction.sh` (converge a deliberately-sparse/deep tree, tick, assert
  it packs to minimal depth with dups=0, stranded=0, teleport=0, and MOVES
  settles — does not grow unbounded) is the gate.
- Watch the invariant guards already in the sim: `promoteInto`/`doMove` forbid a
  Section-1 seat moving into a deeper hole (`coord.pc==0 && hole.pc!=0 return`)
  and only allow S1 left-scooch within a row. Compaction moves UPWARD (deeper →
  shallower), which is the allowed direction, but check the guards don't block a
  legit deep→shallow compaction and don't allow a teleport.
- **STANDING GUARD for Q2:** if compaction ever produces oscillation (MOVES
  never settles) or a dup/strand/teleport in the sweep, STOP and bring the
  hysteresis design back to Nathan — do not ship a sloshing tree.

---

## 4. H-CHAIN — implement the specified law (design AGREED; Nathan reviewed text)

Law text is in `docs/healing-laws.md` under **H-CHAIN** (Nathan: "looks good").
Implement it sim-first. The precious, must-preserve content (already in the doc,
restate faithfully in code comments citing the law):
- **WHO — the witness chain:** duty devolves along a FIXED order from the hole's
  own first-hand neighbour set: down-child → right-neighbour → remaining
  row-mates ascending-column cyclic → column-mates (Section 1 only).
- **DEPTH RULE (Nathan's):** a level-k designee may act ONLY if it first-hand
  confirms the hole AND the death of every designee above it. No hearsay
  devolution. The chain NEVER crosses the clique boundary; beyond it → E1
  drain/re-entry.
- **SCOPING:** row-clique devolution to depth C−1 in EVERY section; the column
  clique + whole-dead-row resurrection handoff are Section-1 ONLY (deep sections
  have no column mesh).
- **HOW — self-wire with the healer's free hint:** designee witnesses/designates/
  confirms-empty; the promoted leaf computes its own link geometry; the fill
  carries the healer's fresh `coord→occupant` snapshot as a HINT; reaches via
  the join/sponsor S4-signed path; under law T keeps its old links (warm start).
  Seating, moving, healing become ONE primitive.
- **A2:** same devolution for H7 resurrection (dead re-seeder → next live row
  down, wrapped). State once; H7 cites it.
- **STANDING GUARD (in the law):** if the sim finds a reachable hole whose chain
  has NO designee that can first-hand-confirm per the depth rule, **STOP and
  bring the case back** — do not ship a devolution that guesses.

**Build approach:** generalize 3A's single-step admission devolution (the
template, `sim/mesh_seat.inc` ~line 100: `if(!occ.count(ckey(adm)) &&
rowLive[adm.r]) adm={0,adm.r,1};`) into the multi-level chain, plus the healing
side (the reactive left-pack at the LEAVE handler + the s1Fill/backstop paths).
Add `repro-hchain.sh` (or `repro-dangling-healer.sh`): construct a hole whose
designated healer is ALSO dead, in BOTH a deep row (row-clique devolution) and a
Section-1 vertical/resurrection case; assert it heals in ~probe-time (NOT the
drain cadence), dups=0/stranded=0/teleport=0. Then re-run the full sweep + (when
built) the Q5 small-N designation audit to hunt the standing-guard case.

**Q5 (small-N designation audit)** is the final verifier for BOTH Q1 and Q4 —
exhaustively model-check every (cell,duty)→designee mapping over generated
small occupancy patterns (N≤~10) for any reachable state with a required duty
that has no live designee, plus any cyclic designation. Build it as part of
closing H-CHAIN (it "would have found the headless-row gap before a user did").

---

## 5. "Live production using home-LAN hardware" — the acceptance test

Deploy-to-gifos.app is not the finish line; observing the NEW behavior live is.
The home-LAN swarm infra (from `memory/swarm-test-plan.md` — that memory
describes the DEAD deacon/fold mesh, but the INFRA below is reused; verify each
piece against current code before trusting it):

- **Relay on `pi-16gb`** bound `RELAY_HOST=0.0.0.0` + `TRUSTED_IPS=<tailnet IPs,
  127.0.0.1,::1>`, exposed valid-cert via
  `sudo tailscale serve --bg --https=8443 http://127.0.0.1:8790` →
  **`wss://pi-16gb.tail58a633.ts.net:8443`**. (Or just use the PRODUCTION relay
  `wss://relay.gifos.app` for a true live-production test — but that's the CF
  Worker with a 100k/day free cap; the pi relay avoids that.)
- **Bots:** `node test/swarm/swarm.js --room <R> --relay <R> --n N --offset O` on the
  Pis / Jetson Orin. swarm.js was UPDATED for mesh-v2 this project (the `mon`
  monitor in meet.js + `--ctrl` fault injection were added) — CONFIRM it emits
  the seat/coord/move metrics you need to SEE compaction/healing, and extend it
  if not. Chromium LNA fix is already in swarm.js (`--disable-features=…Local
  NetworkAccessChecks…`) for the ARM Pis (chromium-1228 = Chromium 149).
- **RELAY-HOST box uses `ws://127.0.0.1:8790`** (Tailscale won't hairpin its own
  MagicDNS name); every OTHER box uses the wss tailnet URL.
- **Nathan / a real device joins:** `https://gifos.app/meet.html#v=<R>&relay=
  wss://pi-16gb.tail58a633.ts.net:8443`.
- **SSH to the Pis is FLAKY** (drops 255): scp a runner script, launch with
  `ssh -f box 'bash /tmp/run.sh'`, poll output files with short reads.
- **What to OBSERVE for Q2:** join/grow/shrink a room; watch seats COMPACT to
  minimal depth (the `mon` monitor / a console `V.*` probe on a real client),
  no oscillation, media stays intact across the compaction moves.
- **What to OBSERVE for H-CHAIN:** kill a seat AND its designated healer
  together (`--ctrl` fault injection or SIGKILL a bot), watch the hole heal via
  the fast devolved designee (seconds), not the drain cadence.
- **GAP TO CONFIRM WITH NATHAN:** whether "home LAN hw" means the tailnet-Pi
  swarm above, or specific home devices, and what SCALE he wants for acceptance.
  The infra memory is 5 days old and pre-mesh-v2 — treat every command as
  needs-verification, not gospel.

---

## 6. Operational gotchas (still current — from prior handoff §7)

- **Merge gate (control plane):** `node --check` the changed JS + meet.html
  inline scripts; `node test/mesh/mesh-harness.js` ALL PASS; build sim + **full
  `sim/sweep.sh`** (300/0) + the change's repro; browser e2e as needed. Only
  all-green → commit to main + push. `relay/` unchanged ⇒ NO wrangler.
- **Commit AND push after every milestone** (CLAUDE.md). Rebase onto main to
  keep history linear; no merge commits.
- **Full sweep** takes ~2–3 h (300 cases, single-threaded). Run in background
  with a PRIVATE `BIN=` (it uses a shared `/tmp/gifos-mesh-sweep` path that can
  collide). The QUICK sweep (`sim/sweep.sh`, no `full`) is ~18 min / 30 cases
  and covers kills {0.2,0.4,0.5} — enough for a fast signal; the FULL run is the
  merge gate.
- **Local browser e2e:** chrome path — the e2e-*.js hardcode
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (EXISTS, symlink → system
  Chrome) so they run as-is; `e2e-vanish-browser.js` reads `MEET_CHROME` (set it
  to `/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`).
  Self-contained e2e spawn their own servers (e2e-vanish-browser: 8814/8816).
  Load-gate (1-min ≤30) inside a FOREGROUND bounded loop; box = 4 cores/6 GB,
  tops ~9–16 chromium. Never `pkill -f` a pattern that can match your own shell.
- **e2e-video** reaches 72 PASS then times out at line 590 (the "via Hub"
  peer-relay leg) — PRE-EXISTING on pristine main, a media-plane issue, NOT a
  control-plane regression. Don't blame a merge for it.
- **Telegram** target chat id **1511297360** (NOT 9495101132/@nathan — dead).
  `ssh -o ConnectTimeout=8 raspberrypi 'bash -lc "openclaw message send --channel
  telegram --target 1511297360 -m \"…\" --json"'`; base64 the body for anything
  with quotes/newlines (see `.claude/skills/telegram`). SSH to the pi is flaky —
  retry. There is NO active hourly cron this session (recreate if wanted).
- **Max 2 background agents.** Every agent gets synchronous-execution discipline
  (bounded FOREGROUND sleeps; the run ends only with the final report — never
  "wait for a notification/monitor that never fires").
- Model at handoff: Opus 4.8 (1M context). Watch the monthly spend limit (it
  killed the prior session mid-flight).

---

## 7. OPEN decisions that still need Nathan (do NOT ship)

- **A4 — founder dies mid-founding:** suspected `founded` flag can outlive an
  empty registry → room alive-but-unjoinable. Sim-verify it's REAL first, then
  design together (a naive revert walks into split-brain).
- **Anti-stampede constants for class D at scale:** the event-reactive principle
  is decided; jitter/damping numbers must be MEASURED on the swarm, not guessed.
- **Split-room reunion:** still the one acknowledged unsolved problem
  (Sybil-blocked). Parked.
- The rest of the design queue after H-CHAIN: **Q3** (class C+D event-reactive
  retries + clock unification), **Q4** (greeter/door extinction invariant). Both
  design-sketched only in the prior handoff §4.

---

## 8. HOW TO RESUME (next session, in order)

1. `git pull origin main` (other sessions may have pushed). Read this doc, then
   `docs/healing-laws.md` (esp. the H section + H-CHAIN), `docs/roadmap.md` §3,
   `docs/media-plane.md`, and the memory index.
2. Confirm the baseline is green: `node test/mesh/mesh-harness.js` (expect ALL PASS),
   `g++ -O2 -std=c++17 -fsyntax-only sim/mesh.cpp` (expect OK).
3. **Build Q2 (compaction) end-to-end** (§3): sim-first + `repro-compaction.sh`
   → mesh.js port → full gate → push (deploys) → **home-LAN live test** (§5).
   Commit each milestone. Bring the hysteresis design back if the sim sloshes.
4. **Then build H-CHAIN end-to-end** (§4): generalize the devolution sim-first +
   `repro-hchain.sh` + the Q5 small-N audit → mesh.js → full gate → push →
   home-LAN live test. Honor the STANDING GUARD (stop + escalate if a chain has
   no first-hand-confirming designee).
5. Bring the §7 open decisions to Nathan; don't ship them.
6. Send Nathan periodic Telegram updates (target 1511297360); recreate an hourly
   cron if he wants them while away. Never fabricate agent/test results.

### Seed prompt for the fresh session (paste this)

> Resume the GifOS work per `docs/handoff-q2-hchain.md` — read it in full first,
> along with `docs/healing-laws.md` (the H section + H-CHAIN), `docs/roadmap.md`
> §3, `docs/media-plane.md`, and the memory index. Branches 3A + 3B are already
> merged and green on main; the H-CHAIN law text is written and I approved it;
> nothing else in the queue is implemented. Your mission: take **Q2 (compaction)**
> all the way through — sim-first with a repro, port to mesh.js, full merge gate
> (`node test/mesh/mesh-harness.js` ALL PASS + full `sim/sweep.sh` 300/0 + browser
> e2e), push to main (auto-deploys gifos.app; NO wrangler, it doesn't touch
> relay/), and then TEST IT ON LIVE PRODUCTION using the home-LAN hardware (the
> tailnet-Pi swarm in §5 — verify swarm.js/the `mon` monitor actually surface
> compaction moves first, and confirm with me what scale counts as done).
> **Then do the exact same end-to-end for H-CHAIN.** Standing rules: work on main,
> commit+push every milestone, max 2 background agents with synchronous-execution
> discipline, control-plane merge gate = node --check + harness ALL PASS + full
> sweep. Bring the open decisions (A4 founder-death, D-constants, reunion) back to
> me. Give me a one-screen status + plan before you start building. Telegram me at
> 1511297360 for periodic updates.
