# Handoff 2026-08-06 (overnight) — the Ed25519 fallback, the handoff close-out, and the road to 0.9.4

THE ONE CURRENT SEED. This doc replaces the entire handoff chain: the fifteen
July/August session docs were audited item-by-item and deleted (079fb48; every
open item was traced to a closure, a refutation, or harvested into
roadmap.md §3 / bug-ledger-2026-08-05.md / quarantine.txt — commit afc8c42),
and the two 2026-08-05 docs (v4, 093) are deleted with this one carrying
their living remainder. git history keeps them all.

## READ FIRST — 0.9.4 IS CUT AND LIVE

**Build 1062, version.json current=0.9.4, deployed and verified on
gifos.app.** The old-iPhone demo is ready; nothing needs cutting first, and
no `?edge` pin is needed.

**Verified against LIVE PRODUCTION** with a WebKit browser whose Ed25519 was
removed (the Safari-16 shape), all green in one run:

| | |
|---|---|
| loads gifos.app and is served the release | → `/versions/0.9.4/`, `GIFOS_VERSION='0.9.4'` |
| the fallback engine engages | `GifOS.ed.engine() === 'js'` |
| the vendored signer comes from production | `/versions/0.9.4/js/vendor/nacl-fast.js` → 200 |
| the desktop paints | 12 icons |
| a `/meet/<room>` link | does **NOT** show the too-old wall |
| and the Ed25519-less browser | **SEATS at 0/0.0** — "Just you — send the invite" |

THE COMPOSITE GATE THAT AUTHORIZED THE CUT (farm doctrine):

- **gate host** (nvidia-laptop, `--behavior=skip`): **GREEN 129, FLAKY 0,
  RED 0, DEAD 0, QUARANTINED 4** — the four ledgered entries only.
  `e2e-pipe` and `e2e-stadium-dup` were both GREEN this run: data points
  toward promotion, not promotions (their entries say why).
- **behavior fleet** (clawbox): **57 passed / 1 failed / 0 skipped**, with
  `25a-mixed-engines` passing on the Firefox pin and `04b`/`16b` running for
  real. The single failure, `22b-choir-front-row-loss` — the battery's only
  8-ACTOR scenario — is PROVEN environmental: it died of two crashed
  renderers at 396 MB available / 3.2 GB swap, and at this same tree it
  scores **9 passed / 0 failed** on an uncontended 15 GB box.

## HOW TO RUN THE DEMO (once 0.9.4 is live)

1. On the old iPhone, open **https://gifos.app/** once. It should paint the
   Home Screen with icons. If it does, the phone is on a build that can sign.
   (Check: Settings → Advanced → Version should say 0.9.4.) If the phone has
   opened GifOS before, it may hold an older build: Settings → Advanced →
   Version → update, or just reload.)
2. From your own machine, open a meeting and share the link to the phone
   (Messages/WhatsApp is fine — iOS opens Safari properly for these).
3. On the phone, tap the link. Expect: the name prompt, then the meeting.
   The phone may join **view-only** if it will not grant a camera — that is a
   supported, first-class state, not a failure.
4. If the phone shows "too old for meetings", read the small print at the
   bottom of that screen — it names the missing piece. Ed25519 should NOT
   appear there anymore; if it does, the phone is on a pre-0.9.4 build
   (make it reload). A genuine gap on a very old iPhone would be WebRTC,
   and the screen now explains that in plain language.
5. Tapping an app on the phone's own Home Screen must ALWAYS work, meeting or
   not — that path touches no network at all.

If something goes wrong, the forensics that matter: the phone's Settings →
Advanced → Version (which build it is really on), and whether
`/versions/0.9.4/js/vendor/nacl-fast.js` loads in its browser.

## What shipped overnight (all committed + pushed, all gated)

**1. Solo apps never see the meeting preflight** (e51a2a6). The Safari-16
family-demo bug: the ES5 preflight painted its wall at load for EVERY entry.
Now a solo `#id=` entry records the verdict; the wall moves to the Share-live
button (GifOSPreflight.requireMeeting), dismissible, title/background
untouched. e2e-old-browser (6)/(6c) guard it.

**2. The too-old wall speaks plain language for every gap family** (438ce24).
`requirements[*].plain` in browser-support.json → generated WHY table →
run.html whyLine: WebCrypto = scrambling happens on your device; WebRTC =
straight browser-to-browser, no company server; WebSocket = the doorway
introduction. Truth-driven: a line only shows where it is TRUE; ancient gaps
get none. Generator validates (no markup, no orphan lines).

**3. SYS badge** (ca059c8): the system-launcher badge is a small muted-slate
SYS tag in the NEW badge's corner (system launchers are never fresh, so the
slot is always free). Tests assert .sysbadge presence only.

**4. THE ED25519 FALLBACK — the wall comes down** (a980b6f + ad7a8a6).
Nathan's decision after the family demo. The S4 signing MANDATE is untouched;
the ENGINE gained a second implementation:

- `site/js/vendor/nacl-fast.js` — tweetnacl 1.0.3 VERBATIM, pinned by sha256
  in its own header, public domain, Cure53-audited lineage, ES5, no BigInt.
  NOT a live dependency: static file on our origin, lazily fetched ONLY when
  native Ed25519 is absent. Modern browsers never load it (asserted).
- `site/js/gifos-ed.js` — THE ONE DOOR. Engine detected once (the old
  preflight probe's exact shape); sign dispatches on the KEY's own shape;
  vendor URL resolves against the script's own src (works from /meet/,
  /join/, frozen snapshots). Test hook GIFOS_ED_FORCE_JS.
- Routed: gifos-net edKeysFromSeedHex/edSign/edVerify, app-owner (per-share
  key now seed-derived — custody unchanged in practice, the S4 seed was
  always in JS memory), gifos-sign verify. sign.html's domain-key MINT stays
  native (developer flow). gifos-ed.js loads on all five pages.
- run.html preflight: the async Ed25519 probe is RETIRED. Verdicts are
  synchronous; Ed25519 never walls anyone.
- browser-support.json rewritten: meet/cast gatedBy es6-baseline (globalThis,
  2019, is the youngest requirement left). Derived mins: Chrome 71 /
  Edge 79 / Firefox 65 / Safari 12.1 / iOS 12.2 — confidence 'derived'
  (requirement arithmetic, NOT run; the note says real-device verification
  below the old floor is pending). The Ed25519 requirement row records the
  mandate-vs-engine distinction.
- Guards: test/unit/ed-fallback.js (21/0 — vendored-block sha256 == pin;
  seed→pubkey equality 32/32; signatures cross-verify both directions and
  are byte-identical; net-layer mixed blocks). test/browser/e2e-ed-fallback.js
  — THE TWO-ENGINE ROOM: native host + Safari-16-shape guest over the real
  relay, both SEAT and both SEE EACH OTHER (the only outcome possible if
  signatures crossed the engine boundary both ways), vendor fetched exactly
  once by the crippled side and never by the native side. e2e-old-browser
  (8) THE INVERSION: the Safari-16 shape passes the preflight and seats.
  ALL of e2e-old-browser + e2e-ed-fallback + e2e-solo-app green under real
  chromium on the pi box at ad7a8a6.

**5. e2e-deep-pair-heal red → root-caused → fixed** (see FLEET RESULTS for
the red). An ISOLATED pair lawfully SELF-COMPACTS: severed from everyone
above, first-hand liveness says the room is dead, healing walks the two
survivors up, one becomes a real head and ships 'sub>' to the OTHER pair
member. The drill read any sub> as a leaked partition (and the pair-internal
ship produced its secondsAfterLift:-15 false heal). Fixed by asserting the
BOUNDARY: every mosaic job names its DESTINATION after the last '>'
(shipMos jk = key+'>'+to), so isolation = NO product of any kind to a seat
outside the pair, heal = ANY product to an outside seat (a healed pair may
rejoin section 0, whose visibility products are x1/x2/sdrow, never sub>).
VERIFIED 3/3 green on the pi under real chromium (two iterations: the
sub>-only predicate healed 1/3 — the generalized destination predicate is
the one that landed).

**6. Handoff close-out** (afc8c42 + 079fb48): all 15 old handoffs audited
and deleted. Harvest lives in roadmap §3 "Harvested from retired handoff
docs" (Q3, Q4, D-constants, home-LAN acceptance, fault-knob probes, stager
1s lag, e2e-meeting-app wait, via-Hub flake), the bug ledger (deep-pair-heal
entry; serial-N=2 cleared; pinned-≤0.9.2 hole accepted), quarantine.txt
(stadium-dup moved-face diagnostic lead: deep head rowFaces:[] → check the
iAmHead/beyondRow gate for a freshly-populated deep row). Also closed:
pw-eye deletion REFUTED empirically (one eye per field, minted by
desktop.js; both pi clones clean); cast.js engine wire already shipped;
versioning.md status corrected to BUILT AND LIVE; app-share bus swap marked
DONE (runtime.js liveHost/endSession is dead vestige, safe cleanup later);
join.sh now runs e2e-r5-fork-pick.

## FLEET RESULTS (baseline at ca059c8, pre-fallback commits)

Nathan's fleet directive, executed via one agent per box:

- **nvidia-laptop (gate host, 8c)** — browser tier 68 suites: 65 GREEN /
  1 RED / 0 DEAD / 2 quarantined. The RED was e2e-deep-pair-heal (fixed,
  above). e2e-pipe red exactly per its quarantine entry. e2e-stadium-dup
  GREEN this run incl. the moved-face leg (a promotion data point, recorded
  in quarantine.txt — still do not promote without the measured rate).
- **penguin (4c)** — unit+sim+mesh+relay: 50/50 GREEN.
- **raspberrypi (4c)** — drills: 13/13 launched, 0 RED, 0 DEAD; 1
  load-suspect FLAKY (e2e-fork-heal, retry-green at loadavg 12-16); both
  quarantined drills red as ledgered. Moto: OFFLINE (adb empty).
- **pi-16gb** — SKIPPED itself correctly (sustained loadavg 3.4-4.5 from
  the resident Home-LAN inference stack). FOUND: pi-16gb has NO node ≥22
  (/opt/node22 is only a playwright lib dir; real node is v20) — install
  node 22 before ever assigning it gate work. Its chromium symlink chain is
  healthy (1194→1228 real binary).
- **clawbox (6c/7.6GB, chromium-1234 + firefox-1538)** — full behavior
  battery, 2h22m: **57 passed / 1 failed / 0 SKIPPED** at ca059c8.
  25a-mixed-engines PASSED (the firefox pin was honored — no repeat of the
  cut-day SKIP trap), 04b/16b ran for real because relay-dev was up, and the
  known ~50% flake 08a passed first try.
  The one red is **22b-choir-front-row-loss**, the battery's ONLY 8-actor
  scenario: two renderers (`ed`, `gus`) reported `Target crashed` from the
  first assertion on, and every downstream red counts corpses. loadavg was
  1.89-5.44 on 6 cpus — NOT cpu starvation; memory at the failure was
  **396 MB available with 3.2 GB of swap in use**.
  **BOX ANOMALY, worth chasing on its own:** with every chrome and driver
  killed, the sum of ALL process RSS on clawbox is ~261 MB while `free`
  reports ~6.4 GB used / ~480 MB available. AnonPages 126 MB, Cached
  204 MB, Slab 155 MB, Shmem 2 MB, no cgroup limit, no OOM kills in dmesg,
  /tmp is real disk. Roughly 6 GB is held outside process accounting on a
  2-day uptime. Until that is understood, clawbox has ~0.5 GB of real
  headroom and CANNOT host the 8-actor scenarios.
  **PROCESS LESSON (mine): I destroyed that agent's two discriminating
  retries.** My `pkill -f "[c]hrome-linux/chrome"` and `pkill -f
  "[b]ehavior.sh"` at 23:36/23:37/23:43 landed inside its retry and its
  22a→22b interleaved A/B, which then reported `no actor null` at loadavg
  10.38 — an artifact of having its browsers killed, not a measurement.
  When two sessions share a box, the reaper is a weapon: check
  `pgrep -f behavior.sh` and ASK before reaping anything you did not start.
- Post-fallback verification runs happened on raspberrypi (all green, §4).

**Farm finding to fix**: release.sh's reap_browsers() kill -9's every
chrome/headless_shell on the box — on raspberrypi that repeatedly killed the
RESIDENT MONITOR BOT's browser at every suite boundary (it self-healed each
time). Either never run gate batteries on the monitor box, or scope the
reaper to exclude processes whose cmdline carries the monitor marker
(--name MonitorBot / BB_ACTOR env).

## THE STATE OF /docs (close-out finished 2026-08-06)

There is ONE handoff doc — this one. The 17-doc handoff chain is deleted
(every item traced to a closure, a refutation, or harvested into roadmap §3 /
the bug ledger / quarantine.txt).

**Bug dossiers keep their own files.** Each was re-verified ENTRY BY ENTRY
against the tree — not against its own claims — and now opens with a dated,
commit-stamped liveness note. A doc without such a stamp is a living
reference (roadmap, healing-laws, architecture, media-plane, meet-security,
meeting, threat-model, cors-and-networking, one-runtime, versioning,
app-mesh*, vote-scale, mmog-ideas, ping-pong, avatar-presence,
research-notes-p2p, phone-instrument-interface, concept-self-sovereign-app-mesh).

Standing rule from here: **a bug doc dies only when its bug is FIXED AND
GUARDED**; otherwise it gets a fresh stamp. Do not fold bug docs into this one.

Three guard gaps the audit exposed, all real work and none of them filed
anywhere else:
1. **ENTRY RESUME (seating-under-flap) is live in both twins and NO GATE RUNS
   IT** — `test/tools/seat-flap-repro.js` is a tool, and `test/tools/` is not
   a release.sh tier. A regression would be silent.
2. **`statusOf` has ZERO test coverage anywhere in the repo** — which is the
   scale audit's own named guardrail for V2.
3. **`e2e-stadium-dup` being quarantined silently un-guards a DIFFERENT,
   genuinely fixed bug** (the stale-seat duplicate face, media-fan BUG 3) —
   the exact rot pattern quarantine.txt exists to prevent. It now has TWO
   consecutive greens on the gate host; one more clean window and it can be
   promoted out.

## THE LIVE FRONTS for 0.9.4 (unchanged priorities, now with a clean seed)

1. **N=5000 plateau** (~3076/5000 at 60k cap; scale-frontier.sh is the
   gate-in-waiting, expected-RED in known-unfixed.sh). Two real fronts:
   heal-promotion exclusivity under storm (promo-vs-promo at head cells,
   ~1100 transient mints/run at N=3000 — C1/C3 designation is view-dependent
   when childOf/liveness are storm-stale) and the descent's pass-0
   firstHandLive preference systematically following BUSY branches past a
   uniformly-holey free frontier. Digest routing is MEASURED IRRELEVANT
   (dmin_distinct=1 at the plateau — do not re-derive; the full numbers were
   in the deleted 093 doc, summarized: digest exact at all 3076 observers,
   free space 11,259 cells spread evenly over depths 2-12, zero
   discrimination available). The digest DOES give a free, exact room-wide
   "there IS room" signal — a UX/diagnosis win, not a routing fix.
   Tools: MESH_FINDLOG/SITLOG/CELLLOG/DUPLOG, `holes`/`compact` verbs.

   **T6 "goHome" v1 ATTEMPTED AND REFUTED overnight 2026-08-06 — do not
   rebuild it the same way.** The idea: a promo-loser whose move had already
   CONFIRMED (T3 vacated the old seat) requeues to the ROOT and feeds the
   seeker flood; instead, within the T3 lease window, reclaim the old cell
   (un-announce the lost cell, take(old,-1), guard: skip if a refiller is
   visible in occ; consume the lease; second contradiction requeues).
   Implemented in BOTH twins, wired at YIELD + CONFIRM-lower-id. MEASURED:
   N=3000 det went from a clean 6976-tick convergence to 2962/3000 STUCK at
   the 30000-tick cap (evict=5498, dups 0), and the JS harness's D5 crash
   leg healed in 290 ticks vs the 120 bound. Mechanism (inferred, not yet
   proven): the reclaim collides with the heal layer's own designation for
   the freshly-vacated cell — the healer saw the LEAVE and queued a
   candidate, the goHome reclaim then contests IT, and the contest tax
   moves rather than shrinks. Both twins REVERTED same night; harness
   re-verified ALL PASS.

   **MECHANISM, now MEASURED rather than inferred** (scratch build with a
   requeue-reason tally; N=3000 det, the clean 6976-tick baseline):

   | requeue reason | count |
   |---|---|
   | `T1-yield` | 3443 |
   | `E1-stale-roster` | 1124 |
   | `CONFIRM-lower-id` | 2 |
   | **of the yields: holding a LIVE LEASE** (what T6 redirects) | **1250** |
   | of those: old cell visibly refilled (T6's guard could fire) | 77 |

   So front 1's premise is CONFIRMED — contest losers are 75% of all
   evictions, and a third of them are movers T6 would have sent home. The
   reason it broke: **the mover's "is my old cell already refilled?" guard is
   blind by construction.** `doMove` CLEARS occ and rebuilds it around the
   NEW seat, so `occGet(leaseCk)` asks about a cell the mover no longer has
   any neighbourhood for — it answered "unknown" (guard passes) in 1173 of
   1250 cases. T6 therefore charged 1173 seats back into cells the heal layer
   had in most cases already designated a candidate for, and the contest tax
   moved rather than shrank.

   **Attempt 2 must make the return EVIDENCED, not blind.** The repo already
   has the pattern twice (V2's probe-gated SITPING/SITPONG, D5's early
   probe): during the T3 lease the mover still holds `oldNbrIds` at
   `doMove` time — keep them for the lease window, PHONE them on contest
   loss, and return only on an answer that says the cell is still empty
   (silence ⇒ requeue, the fail-closed direction). The alternative shape —
   have YIELD/CONFIRM carry the winner's id so the loser asks the WINNER,
   who owns that neighbourhood view, for a local placement — turns the
   return into an ADMISSION rather than a raw take, and is the better fit
   for the storm case where the old row is itself churning.
2. **V1 rollup digests to the BROWSER** (sim side LANDED + gated,
   repro-digest.sh 47/0, healing-laws §G argued incl. lying-aggregator);
   then remove the O(N) status flood (V2 statusOf cap, V3 dial). Rename
   covenant: scale-frontier.sh → repro-scale.sh when green.
3. **Quarantine cluster** — one redundancy-lane investigation (mirror-drill,
   redun-drill, e2e-pipe freeze incl. docs/bug-pipe-stg-freeze-2026-08-05.md);
   e2e-stadium-dup promotion decision rides its measured rate.
4. **Filed**: the ~30s bimodal mosaic recovery rail (q-reset → hot-void
   wake, bound 30s barely holds); the bug ledger's 9 standing entries.
5. **Real-Apple lane**: the demo iPhone IS the first real-iOS pass (ledger
   #5 pipe-on-Safari, #7 in-app webview camera). Note what it shows.
6. **Support-floor honesty**: the derived mins (Safari 12.1 etc.) should be
   spot-verified on real old devices/engines when convenient; the matrix
   rows say 'derived' until then. Playwright can install old builds for
   Chrome/Firefox spot checks.

## Box + environment facts (tonight's additions to the standing set)

- clawbox: 6 cores, idle, ~/.cache/ms-playwright chromium-1234 +
  firefox-1538, node 22.23.1 — the behavior-fleet box.
- pi-16gb: node 20 ONLY (no 22 anywhere; /opt/node22 is a misleading name);
  resident inference stack owns the cores at unpredictable times.
- raspberrypi: hosts monitor bot + trading experiment; Moto currently
  adb-OFFLINE; fine for one-off browser suites, and the gate reaper kills
  the monitor's browser (see farm finding).
- penguin: unchanged (no usable headless chromium for desktop boots;
  webkit/firefox pw builds fine; firefox mirrors of chromium suites are a
  legitimate local pre-check).
- Standing discipline: launcher-file + setsid + second-ssh for all remote
  work; loadavg before believing any timing red; MEET_<ENGINE> pins; never
  a literal base tag in site page comments.

## RULES (unchanged)

Main only; commit AND push every milestone. Sim-first, twins never diverge.
NO BANDAIDS, NO BACKWARD COMPATIBILITY, NO SHIMS (meet.html stays dead;
snapshots are addressed run.html PERIOD — runtime-page-name.js guards the
grave). Gate: GREEN OR WE DO NOT CUT; the ONE sanctioned red is
known-unfixed.sh; quarantine only shrinks. Farm doctrine: gate host runs
ONLY the final gate (--behavior=skip + behavior fleet composite).
