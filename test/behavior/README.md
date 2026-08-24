# The behavior battery — 26 use cases, real people, real phones

Launch truth: there will be **no monitors in production**. Billions of rooms,
zero pis, nobody watching. Every problem a meeting can have must be one the
meeting heals **by itself**, and the only way to believe that before launch is
to *rehearse the actual meetings people will hold* — not protocol fragments,
but whole stories: who these people are, what devices they hold, what their
phones do to the call while life happens around it.

This battery is that rehearsal. Twenty-six use cases of 2–8-person rooms, each
with named personas and 1–3 **interaction patterns** (a pattern = one runnable
scenario script). Every role is played by a real `test/swarm/meet.js` instance
— a full Playwright participant recording debug state — orchestrated by
`lib/cast.js`. Mostly **phone profiles** (mobile UA, phone viewport, a fake
battery), some desktops, because that is the launch audience.

## The realities every run must be able to inject

These are the things that actually happened to real users this month, turned
into levers (all are `meet.js` commands; see "The levers" below):

| reality | lever | what it does |
|---|---|---|
| app-switch (screen on) | `hide` / `show` | visibility override + `visibilitychange` — JS keeps running (throttled phone) |
| LONG app-switch / screen off | `freeze` / `thaw` | renderer **SIGSTOP** — main thread, workers, encoders all stop while the network process keeps answering ICE consent: the exact S10-incident anatomy. (CDP web-lifecycle "frozen" was a no-op — the worker metronome kept beating.) |
| coverage dropout (tunnel, elevator, dead zone) | `radio off` / `radio on` | in-page RADIO SILENCE: relay WS + every DataChannel go quiet **both directions, with no close events**, new sockets fail — a tunnel, not a hangup |
| battery states | `battery <pct> [charging\|drain]` | drives the fake `navigator.getBattery` → the real tier machinery (phone ≥1, <50% → 2, <25% → 3, charger-losing → 3) |
| parked phone | `idlemin <mins>` / `poke` | backdates/refreshes `lastActive` → wake-lock release + rung floor |
| throttled-phone pulses | `pulses off\|on` | halts outgoing pulses (G1 drill lever) |
| freeze-gap on return | `beatgap <secs>` | backdates the beat clock so a `show` triggers the >150s resume self-heal without waiting 150 real seconds |
| rejoin churn | `reload` | full page reload → rejoin (the fast-rejoin race lives here) |
| clean leave / crash | `leave` / `die` | pagehide LEAVE vs. SIGKILL vanish (D5) |
| a production deploy | `cast.deployRelay()` | `touch relay/src/relay.js` under the **real relay** (`servers/relay-dev.sh`, wrangler dev) — a genuine Durable Object restart |

**Honest vs. compressed time.** Protocol thresholds are real: transport-vouch
cap 180s, freeze-heal gap 150s, park 3min, camera idle-stop 20s, holdover 60s.
Scripts compress *dead air* (a 1-hour story runs in minutes) but never fake a
threshold — they either wait it out for real or use the sanctioned backdating
hooks (`beatgap`, `idlemin`), which move the app's own clocks rather than
skipping its logic.

## Cast conventions

- `profile: 'phone'` — mobile UA (`IS_MOBILE` true), 390×844 touch viewport,
  fake battery defaults to 90% discharging. `profile: 'desktop'` — 1280×820,
  battery charging (tier 0).
- Every actor records `--jsonl` debug snapshots to the run dir
  (`/tmp/behavior/<script>-<ts>/<role>.jsonl`) — the forensic record when a
  run goes red.
- Rooms are single-use: `bb-<script>-<random>` on the local relay. Scenarios
  never share a room, never touch production.
- Default stack: site on 8099 + `relay-local.js` on 8790 (auto-spawned if the
  ports are idle). Scenarios marked **[relay-dev]** need the REAL relay
  (`test/servers/relay-dev.sh`, port 8794) and are skipped with a notice if
  it isn't up — DO restarts cannot be mirrored by the Node stand-in.
- `engine: 'firefox'` puts a role on another BROWSER ENGINE (default chromium;
  `webkit` exists but cannot paint a remote tile and dies on an app share, so
  it is not a battery participant). A scenario that depends on one calls
  `needEngines('firefox')`, which SKIPs loudly on a box that lacks it.
- **The cast can span BOXES.** With a `BEHAVIOR_HOSTS` file (see test/README →
  "The BEHAVIOR battery in FLEET mode") each actor runs on a real machine over
  ssh, 1-2 per box — the only way a timing number here means anything, since
  one box running five browsers plus the relay is a shape no meeting has.

## The 26 use cases

Order is by how common we judge the meeting shape at launch, not severity.
Scripts live in `scenarios/` as `<nn><letter>-<case>-<pattern>.js`.
**CORE** marks the must-run set (`batteries/behavior.sh --core`; the
authoritative list is `CORE=` in `batteries/behavior.sh` — 21a, 24a, 25a and
26a are in it even where a tag below is missing).

---

### 1. The busy household check-in — 3 people
**Cast:** Dana (parent, office **desktop**), Maya (teen, **phone**, walking
home), Pops (grandparent, **phone**, plugged into a weak charger).
**Story:** the daily "who's getting dinner" call. Dana is stationary; Maya
walks through the neighborhood dead zone; Pops holds his phone in a recliner
until his hands and the phone both fall asleep.

- **1a `01a-household-rolling.js`** [CORE] — rolling attendance: Dana founds,
  Maya joins 40s later mid-walk, Pops last; Maya leaves early (clean LEAVE),
  rejoins to say one more thing, leaves again. Asserts: every arrival seats
  into ONE room, occupancy converges after each leave, no ghosts 30s after
  each departure.
- **1b `01b-household-deadzone.js`** [CORE] — Maya's dead zone: two `radio off`
  windows (25s and 70s) mid-conversation. Asserts: short dropout stays soft
  (no seat loss, tile comes back); the long one crosses vouch/pulse limits —
  others' rosters go honest (no frozen zombie tile past the 180s cap), and
  Maya self-heals to a seat with no human action when radio returns.
- **1c `01c-household-frozen-pops.js`** [CORE] — Pops's phone freezes (real
  `freeze`, 60s) then returns with a backdated 155s beat gap. Asserts: the
  resume self-heal auto-rejoins him (reload observed, seated again <45s),
  others converge to 3 with zero dups.

### 2. Boss + direct reports weekly sync — 4 people, admin room
**Cast:** Priya (boss, **desktop**, admin), Sam, Noor, Jae (reports,
**phones**).
**Story:** Priya runs a standing sync in HER room (admin `--av`); reports dial
in from wherever the week put them.

- **2a `02a-boss-transit.js`** [CORE] — Sam joins from the train: joins late,
  app-switches (`hide`) every ~40s to check a doc, one 30s `radio off` tunnel.
  Asserts: Sam's tile shows "away" not firewall-dead during hides; senders
  park video toward him while hidden and restore on `show`; tunnel self-heals.
- **2b `02b-boss-latecomer.js`** — Jae knocks 3 minutes in while Priya is
  talking. Asserts: late join against a settled admin room completes through
  the greeter door (no founding, no fragment — the JOINING VEIL law: a failed
  knock never shows an empty room), admin table intact after seat.
- **2c `02c-boss-frozen-report.js`** — Noor's phone frozen for 6 real minutes
  during Priya's monologue (the S10 case, real-time). Asserts: vouch cap
  removes the zombie tile ≤180s+pulse-slack, seat is healed/reused, Noor's
  return self-heals via reload, room converges to 4. *(Long — FULL tier.)*

### 3. Former classmates reunion — 5 phones, evening couches
**Cast:** Ana, Bo, Cleo, Dev, Em — all **phones**, all multitasking.
**Story:** the annual "we should do this more" call. Nobody gives it full
attention; everyone's phone does phone things.

- **3a `03a-classmates-serial-pip.js`** [CORE] — serial arrivals over ~2 min;
  then everyone except the speaker hides (couch multitask) and returns in
  waves. Asserts: 5-way convergence; hidden-viewer parking economics — a
  hidden actor's inbound mains are parked by mates, audio never parks,
  full restore on return.
- **3b `03b-classmates-sleeper.js`** — Em stops touching her phone (idlemin 4)
  and drifts off; the call carries on; 20 min later (compressed) she `poke`s
  back awake. Asserts: parked-phone floor engages (wake lock released,
  powTier idle set), her AV keeps flowing to others, poke restores tier.
- **3c `03c-classmates-flaky-pair.js`** — Bo and Dev on bad wifi: each drops
  (`radio off` 20–40s) and recovers on offset cycles, 3 rounds. Asserts: the
  room never splits (census: one tree, no dup coords), each recovery re-seats
  without disturbing the stable three.

### 4. Emergency-response crew — 5 phones in the field
**Cast:** Marta (coordinator, staging area), Ray, Ines, Kofi (field,
**phones** moving through coverage), Tow-truck Ted (joins late).
**Story:** a storm callout. Coverage is the enemy; the room must simply
never be the problem.

- **4a `04a-crew-coverage-churn.js`** [CORE] — Ray/Ines/Kofi cycle through
  staggered dropouts (15–90s) for 6 minutes while Marta talks. Asserts: after
  every wave the census re-converges to one tree, 5/5 seated, zero dups,
  zero orphaned refs; audio-first survival (audio pipes never park).
- **4b `04b-crew-deploy.js`** [CORE] [relay-dev] — **the open WHOHOME bug as a
  scenario**: room seated and stable → `cast.deployRelay()` (real DO restart)
  → Ted knocks fresh. Asserts: Ted decrypts greeter blobs AND completes
  WHOHOME to a seat ≤60s with NO seated member re-entering. This is the
  deterministic-stall repro; expected RED until the bug is fixed.
- **4c `04c-crew-battery-decay.js`** — an hour compressed: Kofi's battery
  62%→45%→22%, Ines's charger is losing ground (drain). Asserts: tier
  transitions fire (2 at <50%, 3 at <25%, drain → 3), send quality steps
  down, tiers release when Kofi plugs in, room quality for others unharmed.

### 5. The influencer panel show — 5, stage-driven
**Cast:** Rae (host, **desktop**), guests Kiki, Malik, Sol (**phones**),
Producer Pat (**desktop**, camera OFF, hidden in a monitoring tab).
**Story:** a weekly live panel: host + rotating guests on Stage, producer
lurking.

- **5a `05a-panel-stage-choreo.js`** [CORE] — guests step up/down Stage in a
  rehearsed rotation (self step-up, open room). Asserts: Stage membership is
  exactly the chosen set at each beat, cap respected, buses (stage vs
  stadium) route to everyone, step-down releases feeds.
- **5b `05b-panel-star-freeze.js`** — Kiki freezes mid-segment ON Stage
  (45s freeze + beatgap return). Asserts: her Stage slot survives-or-heals
  honestly (no permanent black Stage tile: either she resumes or the slot is
  released ≤ vouch cap), Follow-speaker on Rae's fullscreen never sticks on
  the corpse.
- **5c `05c-panel-silent-producer.js`** — Pat hidden + camera off the entire
  show. Asserts: vis-park economics hold for the whole hour (compressed):
  every sender parks its main toward Pat, Pat's meters stay at hidden
  cadence, consent tally correctly counts Pat as a blocker the whole time.

### 6. The long-distance couple — 2 phones, an hour of ambient togetherness
**Cast:** Ju (**phone**, cooking), Aki (**phone**, commuting home then couch).
**Story:** the every-evening open line. The call is furniture — it must cost
almost nothing and survive everything.

- **6a `06a-couple-pip-evening.js`** [CORE] — both hide into PiP-style
  multitask for long stretches with brief mutual returns. Asserts: N=2
  parking economics both ways, audio continuous, restore on every return,
  wake-lock/rung behavior under two-phone idleness.
- **6b `06b-couple-parked-stand.js`** — Ju props the phone on a stand
  (idlemin 4, no touches) while cooking loudly. Asserts: speech keeps the
  phone from parking (poke via VAD path — driven by `poke` at speech
  moments), then true silence parks it, first touch restores.
- **6c `06c-couple-transit.js`** — Aki's commute: hide + two tunnels
  (`radio off` 30s/80s) + one real short freeze (25s), then home wifi.
  Asserts: the pair NEVER shows "everyone left" (the JOINING VEIL / honest
  roster laws at N=2), each recovery ≤45s, final state clean.

### 7. The study group — 4, hands and discipline
**Cast:** Lena (organizer, **desktop**), Omar, Tess, Vik (**phones**).
**Story:** exam-week sessions with the hand queue as the talking stick.

- **7a `07a-study-handq.js`** [CORE] — 12 rounds of raise/lower across all
  four with app-switch hides between turns. Asserts: queue order is exactly
  raise order (incl. a same-millisecond tie via `raiseHandAtForTest`), hands
  survive hide/show, queue never ghosts a left member.
- **7b `07b-study-switch-storm.js`** — everyone hides/shows on 20–40s
  personal rhythms for 5 minutes (the whole room is phones being phones).
  Asserts: park/unpark storm never flaps tiles for the currently-visible
  (MON flap counters ≈ 0 for visible pairs), meters at hidden cadence for
  hidden, full convergence at the end.

### 8. Family tech support — grandparent + grandkid (+ parent), the chaos user
**Cast:** Gigi (grandparent, **phone**, enthusiastic), Kai (grandkid,
**desktop**), Rosa (parent, **phone**, joins to referee).
**Story:** Gigi does everything wrong so production users don't have to.

- **8a `08a-techsupport-reload-mash.js`** [CORE] — **the open fast-rejoin race
  as a scenario**: Gigi reloads the page 5 times, some back-to-back (<3s),
  some after seating. Asserts: after every reload she lands in the SAME room
  as Kai (never a solo fragment), final census = one tree of 2–3.
- **8b `08b-techsupport-locked-door.js`** — Rosa locks the room; Gigi arrives,
  fumbles the password twice, gets it right. Asserts: wrong-pw bounces
  re-present the modal (no fake empty room, no founding), right pw seats her,
  blur state honest per the door rules.
- **8c `08c-techsupport-frozen-gigi.js`** — Gigi's tab frozen 4 min (real)
  mid-call, then screen-on return. Asserts: the full S10 arc end-to-end on
  the REAL clock — corpse removal at vouch cap, resume self-heal reload,
  re-seat, zero occ flap echoes 60s after return. *(Long — FULL tier.)*

### 9. The remote standup — 5, three times in a row
**Cast:** five colleagues, mixed 3 **phones** / 2 **desktops**.
**Story:** 15-minute daily, everyone arrives within seconds, everyone leaves.
The same room founded → filled → emptied → re-founded, three times.

- **9a `09a-standup-triple-burst.js`** [CORE] — 3 cycles of: 5-way burst join
  (≤10s spread) → quick round (each speaks/chats) → all leave (mix of LEAVE
  and die). Asserts: every cycle founds exactly once (no dueling genesis),
  seats all 5, empties clean (relay session ends, no residue haunting the
  next cycle), cycle 3 as clean as cycle 1.

### 10. The job interview — 3, stakes and nerves
**Cast:** Devi (candidate, **phone**, 23% battery), Hunter (interviewer,
**desktop**), Scout (recruiter, **desktop**, camera off, note-taking).
**Story:** the call that must not embarrass anyone.

- **10a `10a-interview-low-battery.js`** [CORE] — Devi arrives at 23%
  (tier 3 from the knock). Asserts: she seats fine, sends at tier-3 quality
  (15fps floor honored), others see a live usable tile, no tier flapping
  when level wobbles 23↔26%(hysteresis honesty: assert steady tiers, not
  oscillation).
- **10b `10b-interview-blip.js`** — Hunter's office wifi blips 12s
  mid-question. Asserts: sub-vouch blip never drops his seat or roster
  entry anywhere, media resumes, no reload triggered (self-heal is
  proportionate — the drastic lever stays holstered).
- **10c `10c-interview-hidden-scout.js`** — Scout hidden + cam-off,
  occasionally surfacing to type a chat line. Asserts: chat delivery from a
  hidden tab is immediate, hidden meters cadence, parking toward Scout, and
  Scout's roster presence stays honest ("away", never vanished).

### 11. The telehealth consult — 2, audio is sacred
**Cast:** Dr. Osei (**desktop**, clinic), Ren (patient, **phone**, rural).
**Story:** a follow-up consult on one bar of signal.

- **11a `11a-telehealth-weak-signal.js`** [CORE] — Ren's link degrades in
  waves: three 15–45s dropouts across 5 minutes plus battery at 35%.
  Asserts: audio comes back first and stays primary, video degrades rather
  than kills the call, every recovery is automatic, doctor's view never
  claims Ren left while vouch holds.
- **11b `11b-telehealth-camera-doc.js`** — Ren turns the camera off to talk,
  on to show something, off again (3 cycles, with >20s off-gaps). Asserts:
  camera idle-stop releases the sensor after 20s off, regrab on demand works
  every cycle (lateMedia), consent tally tracks each flip.

### 12. The sports-team logistics call — 5 phones, decisions get made
**Cast:** Cap (captain), Jo, Min, Petra (+ Petra's carpool passenger Ferg
sharing her wifi hotspot — same IP).
**Story:** Sunday's game: who drives, who brings the kit, vote on the time.

- **12a `12a-team-founding.js`** [CORE] — Cap founds, burst arrivals, the
  plan gets made in chat and the captain takes the Stage briefly to settle
  it. Asserts: the settled plan lands for all, founding under burst is
  single.
- **12b `12b-team-car-death.js`** — Ferg's phone dies at 1% (abrupt `die`,
  same egress IP as Petra). Asserts: D5 vanish — seat freed, no corpse-echo
  occ flap >60s (the D-class open residual: measure and report flap count),
  Petra (same IP) unaffected.
- **12c `12c-team-decision-churn.js`** — the plan gets settled WHILE Min's
  tab freezes and Jo tunnels. Asserts: chat state survives the churn,
  returners see the outcome after Min's self-heal reload.

### 13. The church small group — 5, the long quiet hour
**Cast:** Pastor Ann (**desktop**), four members on **phones** in living
rooms.
**Story:** an hour of discussion; phones on knees and coffee tables.

- **13a `13a-smallgroup-parked-hour.js`** — all four phones park (staggered
  idlemin) while discussion continues on audio; two get poked back by
  their turn to read. Asserts: 4-phone simultaneous park is stable (no
  flap storm), wake-lock releases don't kill audio, pokes restore
  independently.
- **13b `13b-smallgroup-unison.js`** — closing: everyone unmutes, Timing →
  Unison, 30s of simultaneous audio. Asserts: all mics live simultaneously,
  mix survives, then clean simultaneous-ish departure of all 5.

### 14. The contractor walkthrough — 2–3, a moving camera
**Cast:** Faye (homeowner, **phone**, walking the house), Bill (contractor,
**desktop**), later Faye's partner Gil (**phone**, joins from work).
**Story:** "show me the leak" — the phone is a flashlight-camera-tour.

- **14a `14a-walkthrough-handoff.js`** [CORE] — Faye walks: wifi → dead spot
  in the basement (`radio off` 35s) → back; Gil joins mid-tour. Asserts:
  the tour survives the handoff, Gil's late join lands while Faye is in the
  dead spot (join during member-dropout — the door must not depend on her),
  three-way converges.
- **14b `14b-walkthrough-pocket.js`** — Faye pockets the phone (hide, 90s)
  to move a ladder, talks the whole time. Asserts: her audio never stops,
  senders park video toward the pocket, unpocket restores in <5s.

### 15. The new-baby share — 3–4, cameras on and off
**Cast:** Nadia + Tom (new parents, one shared **phone** then Tom's own),
Grandma Vera (**phone**), Grandpa Lou (**desktop**).
**Story:** the baby is asleep, then not; cameras chase the moment.

- **15a `15a-baby-cam-churn.js`** — rapid cam on/off across all (baby
  privacy reflex), Tom joins as 4th mid-churn. Asserts: consent tally is
  correct at every step, cam churn never wedges a tile, the late join
  during churn seats clean.
- **15b `15b-baby-propped-sleep.js`** — Vera props her phone to watch the
  sleeping baby: idle 10 min (compressed), pokes when the baby stirs.
  Asserts: the watched feed keeps flowing TO parked Vera (park is about
  her SENDING cost, audio+claimed feed honesty), poke restores everything.

### 16. The book club — 5, one perpetual latecomer
**Cast:** Ruth (host, **desktop**), Ida, June, Kaz (**phones**), Perpetually
Late Leo (**phone**).
**Story:** chapter 12; Leo arrives 40 minutes in, as always.

- **16a `16a-bookclub-latecomer.js`** [CORE] — the room runs (compressed)
  long enough to be deeply settled (greeter rotation, steady sockets),
  then Leo knocks. Asserts: late join against a LONG-settled room via
  greeter door + sponsor forwarding, seats ≤45s, no disturbance to the
  settled four.
- **16b `16b-bookclub-deploy.js`** [relay-dev] — same settled room; deploy
  fires WHILE all five are seated; conversation continues; THEN Leo knocks.
  Asserts: seated members survive the DO restart (re-register ≤60s,
  healing-laws R2/R3), and the newcomer completes WHOHOME (the bug-#1
  companion to 4b with a longer-settled room).

### 17. The language tutoring session — 2, metronome regularity
**Cast:** Mika (tutor, **desktop**), Billie (student, **phone**, charger
losing ground).
**Story:** 55 minutes weekly; Billie flips to a flashcard app constantly.

- **17a `17a-tutoring-flashcards.js`** [CORE] — Billie hide/show every ~30s,
  18 cycles. Asserts: park/unpark cycling is flap-free and cheap (flap
  counters ~0, restore latency stable across cycles — no degradation from
  repetition), session state (chat, hands) unaffected.
- **17b `17b-tutoring-charger-loser.js`** — Billie plugged in but DRAINING
  (drain lever) for 10 min, then the charger wins again. Asserts: drain →
  emergency tier 3 while plugged in, recovery when level rises, no flap at
  the boundary.

### 18. The support circle — 5, privacy is the feature
**Cast:** five members, all **phones**, first names only; locked room.
**Story:** a weekly circle where trust is the product.

- **18a `18a-circle-locked.js`** [CORE] — founder locks at genesis; all four
  join through the password door (one wrong-try). Asserts: locked-door flow
  end-to-end at N=5, no unlocked window, wrong-pw never founds or fragments.
- **18b `18b-circle-abrupt-exit.js`** — a member exits abruptly mid-share
  (privacy exit: `die`). Asserts: the vanish is fast and total (D5 —
  seat freed, tile gone, no lingering media), circle re-converges, consent
  recomputes to the remaining set.
- **18c `18c-circle-camoff.js`** — three of five keep cameras off
  throughout. Asserts: consent tally honestly names the blockers the whole
  session, no clear-video, camera-off seats still fully present (audio,
  chat, hands), idle-stop releases their sensors.

### 19. The musicians' rehearsal — 3, sound before sight
**Cast:** Ash (guitar, **desktop**), Bea (vocals, **phone**), Cy (cajón,
**phone**).
**Story:** Tuesday rehearsal; Timing → Song; a dropped beat is worse than a
dropped frame.

- **19a `19a-rehearsal-song-freeze.js`** — mid-song, Cy's phone freezes 30s
  and returns. Asserts: Ash+Bea's audio bus is unaffected during the freeze
  (no stall on THEIR pipes), Cy re-syncs on return, Song mix intact.
- **19b `19b-rehearsal-solo-stage.js`** — Bea steps on Stage for the solo,
  steps down. Asserts: stage audio path at N=3, step-down returns her to
  the row bus cleanly, no residual stage claim.

### 20. The cross-timezone holiday marathon — 5, the kitchen sink
**Cast:** the whole extended family: 3 **phones** (one at 30% battery, one
parking repeatedly, one commuting), 2 **desktops**.
**Story:** the hour-long holiday call in which everything above happens to
somebody. This is the closing gauntlet and the launch dress rehearsal.

- **20a `20a-marathon-gauntlet.js`** [CORE] [relay-dev if up] — staggered
  joins → PiP hides → a tunnel → a real freeze + beatgap return → battery
  decay to tier 3 → a parked phone → a relay deploy (if relay-dev is up) →
  a late joiner → staggered leaves, one abrupt. Asserts at every checkpoint:
  ONE tree, no dups, no ghosts beyond caps, roster honesty, every self-heal
  ≤ its law's deadline; final: the last two standing hold a clean 2-person
  room. *(~12 min compressed.)*

### 21. The quiet room — silence is not absence
**Cast:** a co-working study hall (2 desktops + 2 phones); a late-night
sit-up pair plus one late knock.
**Story:** rooms where nobody SAYS anything for minutes — co-working,
silent company, an app filling the screen. Every other use case keeps
traffic flowing, which is exactly why the starve-edge regression (fixed
in 6a23358) was invisible to all of them and was caught by the quiet
guest-perms drill instead. These scenarios make minutes-long user
silence a first-class battery reality.

- **21a `21a-quiet-study-hall.js`** — 4 join, one line of chat, then FOUR
  minutes of total user silence. Asserts: a settled quiet room never
  blinks (240s steady at 4), the first message after the silence lands
  everywhere ≤20s, clean census.
- **21b `21b-quiet-door-knock.js`** — a settled pair sits in silence; a
  third knocks INTO the silence. Asserts: a silent door still seats
  ≤45s, the settled pair rides the admission unblinked, chat resumes
  for all three.
- **21c `21c-quiet-app-idle.js`** — the guest-perms drill's exact shape
  battery-ized: 2-person room, the host (seeded via the meet.js
  `--seed-desktop` lever) shares the Bible Browser, then FOUR minutes of
  total silence. Asserts: the app stays MOUNTED on both sides through
  the silence (the starve-edge regression's exact kill shape), the quiet
  pair never blinks, chat lands afterward.

### 22. The choir — seven singers, two rows
**Cast:** 7 (2 desktops + 5 phones), default C=5.
**Story:** the first use case past ONE row. H7's row-major law ("the first
C people are row-mates") finally gets a second row to be true against, and
the H/Q laws get their first multi-row heal.

- **22a `22a-choir-two-rows.js`** — staggered joins to 7. Asserts: the
  formation is EXACTLY row-major (front row full 5 + back row 2, one
  section), a back-row leave/return never disturbs the shape, ONE tree.
- **22b `22b-choir-front-row-loss.js`** — a FRONT-row phone dies abruptly
  under a live back row. Asserts: census heals to 6, ONE tree/no dups, and
  the shape returns to row-major legality (5 + 1 — the hole must not live
  in the front row; Q2 compaction owns the end shape).

### 23. The beehive — seven people, a real tree (C=2)
**Cast:** 7-8, every role `meshC: 2` (the `--mesh-c` lever →
`window.GIFOS_SCALE={C:2}` — the K-sweep doctrine: at C=2 a section is
2×2, so seven browsers exercise the multi-section structure that needs
26+ people at C=5; RELAY_DEV's uncapped session makes the relay C-agnostic
for tests).
**Story:** the first battery scenarios where the stadium is a TREE — deep
sections, sponsor forwarding, anchors rooting subtrees.

- **23a `23a-beehive-forms-deep.js`** — 7 join → ≥2 sections form, room
  converges ACROSS section boundaries, ONE tree; then a late 8th knock
  seats ≤60s through sponsor forwarding into the deep room.
- **23b `23b-beehive-anchor-death.js`** — a non-founder Section-1 seat
  dies abruptly while deep members exist. Asserts: census heals to 6, ONE
  tree (no orphaned section), every survivor holds a real seat — the
  E-laws' promotion, first time in the battery with real browsers.

### 24. The street broadcaster — the Broadcast app (one-to-many)
**Cast:** Hana (desktop, `adminPw` + `bc: true` + `ensurePass` — the host),
four phone viewers joining with `bc: true` + the ticket (`pass`).
**Story:** the Broadcast app is run.html wearing its one-to-many skin
(`#bc=1` on an admin room): one host live on the Stage, viewers who bring
NOTHING — no camera, no mic, no permission prompts — a hand queue as the
only on-ramp to the Stage, and chat as a back-channel the host can silence,
line-delete and reopen. The viewer password is the ticket: it clears the
blur and never rides the link.

- **24a `24a-broadcast-street.js`** — the whole show: host auto-stages and
  goes CLEAR once the ticket is set; three viewers arrive (no gUM, no row
  grid) and the stage feed paints; hand-raise → signed grant calls a viewer
  up (Stage = {host, guest} room-wide) and revocation pulls her down by
  arithmetic; chat flows, chat-off silences everyone but the host (a
  DOM-hacked heckle lands nowhere), a signed per-line delete removes a
  message on every device; a LATE ticket-holder walks straight into the
  painted show; the full house holds steady.

### 25. The mixed-engine household — the room is never one browser
**Cast:** Dana (desktop, chromium), Maya (phone, **Firefox**), Pops (phone,
chromium).
**Story:** the same household as use case 1, except Maya's phone is Gecko.
Every other scenario in this battery is Chromium on all sides, so the
cross-engine facts — a VP8-only negotiation (the playwright firefox build has
no H.264), another WebRTC stack's ICE, another visibility/beat implementation —
were never under a gate.

- **25a `25a-mixed-engines-household.js`** — mixed cast seats into ONE tree,
  mutual sight by name, video crosses BOTH ways, and the coverage-dropout lever
  self-heals on the non-chromium side (which also proves the levers themselves
  are engine-neutral page JS). SKIPs loudly where firefox is not installed.
  Any OTHER scenario can be asked the same question without editing it:
  `BEHAVIOR_ENGINE=<role>=firefox`, or `BEHAVIOR_ENGINE=firefox` for an
  all-Gecko room.

### 26. Three people driving round one city — an APP room in the battery
**Cast:** Ada (wheel), Ben (stick), Cyd (tilt) — three steering schemes in one
shared Anyroad world.
**Story:** the only place the three steering schemes are exercised at once; a
scheme nobody drives breaks silently for whichever player chose it.

- **26a `26a-anyroad-three-drivers.js`** [CORE] — deliberately does NOT use
  `lib/cast.js` (an app room driven by pointer/orientation events is not a
  meeting): it runs `test/browser/e2e-anyroad-mp.js` through the app-as-room
  door and translates its output into the battery's contract. One
  implementation, two front doors.

---

## Script index → what reality each covers

| lever \ scripts | covered by |
|---|---|
| coverage dropout (`radio`) | 1b 2a 3c 4a 6c 10b 11a 12c 14a 20a |
| hidden tab (`hide`) | 2a 3a 5c 6a 6c 7a 7b 10c 14b 17a 20a |
| FROZEN tab (`freeze`) | 1c 2c 5b 6c 8c 12c 19a 20a |
| battery tiers / drain | 4c 10a 11a 17b 20a |
| parked phone (idle/poke) | 3b 6b 13a 15b 20a |
| freeze/rejoin churn (`reload`/beatgap) | 1c 2c 8a 8c 12c 20a |
| abrupt death (`die`) | 9a 12b 18b 20a |
| relay deploy [relay-dev] | 4b 16b (20a opportunistic) |
| locked door / admin | 2b 8b 18a |
| stage / vote / handq | 5a 5b 7a 19b (12a/12c settle their plan in chat + a brief Stage turn) |
| late join vs settled room | 2b 14a 16a 16b 20a 21b |
| minutes-long user silence | 21a 21b 21c |
| shared app (`app run`, --seed-desktop) | 21c |
| multi-row rooms (6+ people) | 22a 22b |
| multi-section trees (`--mesh-c 2`) | 23a 23b |
| the Broadcast skin (`bc`, ticket, call-up, chat-off) | 24a |
| a NON-CHROMIUM participant (firefox/Gecko, VP8) | 25a (+ any scenario under `BEHAVIOR_ENGINE`) |

58 pattern scripts (+ `00-levers-selftest`, the tool gate: every lever proven
by its observable effect — run it FIRST when a scenario goes red, it says
whether the lever machinery or the app broke). The three open bugs this
battery once carried as expected-RED scenarios are all FIXED and their
scenarios green (2026-07-27 confirmation sweep): **4b/16b** post-deploy
WHOHOME stall — root cause was the fork false-positive on stale door
evidence, fixed 95ca143; **8a** fast-rejoin race — the resume-race latch;
**12b** corpse-echo occ flap — the ghost-echo fixes (d49dae6, "a peer
object is not a person"). They stay in the battery as the regression
guards for exactly those fixes.

## Running

```bash
# stack (auto-spawned if idle): site 8099 + RELAY_DEV=1 relay-local 8790
test/servers/relay-dev.sh                    # only for the [relay-dev] scenarios

node test/behavior/scenarios/01a-household-rolling.js       # one scenario
test/batteries/behavior.sh --core            # the CORE set (25 scripts, ~1.5h)
test/batteries/behavior.sh                   # everything (several hours)
```

Every scenario exits non-zero on failure and leaves its run dir
(`/tmp/behavior/<script>-<ts>/`) with per-role JSONL, the orchestrator log,
and failure screenshots. `BEHAVIOR_BASE`/`BEHAVIOR_RELAY` redirect the stack;
`BEHAVIOR_HEADFUL=1` shows the browsers.

**Across the farm** (the shape a meeting actually has — and the reason the
battery does not have to queue behind the gate host):

```bash
# on the box that serves the stack — bind 0.0.0.0 or every scenario refuses
# with "stack unreachable"; fleet mode NEVER auto-spawns the stack
python3 -m http.server 8199 -d site
RELAY_DEV=1 RELAY_HOST=0.0.0.0 RELAY_PORT=8795 node test/servers/relay-local.js

BEHAVIOR_HOSTS=~/farm-hosts.json node test/behavior/scenarios/03c-classmates-flaky-pair.js
BEHAVIOR_HOSTS=~/farm-hosts.json BEHAVIOR_ENGINE=bo=firefox \
  node test/behavior/scenarios/03c-classmates-flaky-pair.js   # …with one Gecko phone
```

The hosts-file format, the engine filter, and the traps (spare ports when the
box already serves someone else's tree; `weight` as the only load control; a
loaded orchestrator inflating a LOCAL actor's join to 90s) are in test/README →
"The BEHAVIOR battery in FLEET mode".

## Writing a new scenario

```js
const { scenario } = require('../lib/cast');
scenario('my-pattern', {
  ana: { profile: 'phone', battery: '0.62' },
  bob: { profile: 'desktop' },
}, async (cast, check) => {
  await cast.joinAll();                 // staggered by default
  await check.converged(2);
  await cast.get('ana').cmd('radio off');
  await cast.sleep(30);
  await cast.get('ana').cmd('radio on');
  await check.selfHealed('ana', { within: 45 });
  await check.oneTree();                // census: no dups, no orphans
});
```

The framework is deliberately thin: a scenario is a story told in levers plus
assertions in laws. If a new reality shows up on a real phone, add ONE lever
to `meet.js`, list it in the table above, and write the story that uses it.
