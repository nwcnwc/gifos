# GifOS MMOG ideas

Design notes and product ideas for **massively multiplayer games that ride the
GifOS meeting mesh** — not a committed roadmap, not a protocol spec. The point
is to capture what the mesh is uniquely good for, what it must not be asked to
do, and a family of game designs that treat seating, Stage, and voluntary motion
as first-class play.

**Related (canonical engineering, not this file):**

- Control plane / seating laws — [`healing-laws.md`](healing-laws.md)
- Media tiers — [`media-plane.md`](media-plane.md)
- Meeting UX map — [`meeting.md`](meeting.md)
- Security (incl. vote-off) — [`meet-security.md`](meet-security.md), [`threat-model.md`](threat-model.md)
- Apps on the mesh — [`app-mesh.md`](app-mesh.md)

---

## 1. Why GifOS is an unfair MMOG platform

Most multiplayer games need **servers** for presence, proximity voice, and
broadcast. GifOS already has a no-root, self-healing P2P tree that scales by
folding the crowd into itself:

| Mesh primitive | Engineering meaning | Game-facing meaning |
|---|---|---|
| **Seat** `{pc,r,i}` | One occupant at a fixed tree coord | “Where the logistics put you” — not player real estate by default |
| **Row** (size `C`, today 5) | Full mesh of direct WebRTC links | Intimate table: full-quality A/V, lowest latency |
| **Section** | `C×C` block of the tree | Mid-scale structure (media folds; not its own relay room) |
| **Stadium** | Whole room = one URL = one relay session | The city / arena / festival — ambient everyone else |
| **Stage** (≤`C`, deliberate) | Chosen broadcasters; collect/fan independent of seating | Spotlight, arena floor, ceremony, shared app |
| **Gossip / app state** | Flood + anti-entropy over the mesh | Scores, pools, quests, soft places, economy |
| **Relay** | Zero-knowledge greeter only | Never the game server; never media; never inventory DB |
| **Vote-off** | Personal device lists + live majority | Hard exclusion without a server ban DB — also a **game weapon** if framed carefully |
| **App GIFs** | Portable apps + state as files | Merch, booths, weapons-as-files, steal/remix culture |

**What scales for free:** concurrent real faces and voices without an SFU bill;
rooms that outlive every host; friend-relay for hard NATs; self-heal under churn.

**What does not come free:** player-authored geometry (the tree is not a city
map you own), global authoritative physics for 10k agents, or a server-side gold
ledger.

### 1.1 The hard constraint: seating is not yours

Mesh **reliability** depends on rules that make position **unpredictable and
mostly out of user control**:

- Newcomers land by **frontier / row-fill** admission (fixed admitters, no race).
- Holes are filled by **promoting leaves** (principle P: only leaves move for
  heals — so dependents are never stranded).
- Rows **pack left**; **compaction** is self-duty for density/depth, not for
  “sit with friends.”
- **Law T** makes moves atomic (claim-before-vacate), but ordinary claims are
  still **empty-only** (no silent eviction of a living occupant).

So a game must **never** promise:

- “Your party is always one mesh row.”
- “Guild hall = this subtree forever.”
- “Follow me and the tree will keep us adjacent.”

Those promises fight the healing laws and will feel like griefing when a heal
or scooch reshuffles people.

**Doctrine for games:**

> **Topology is weather (logistics). Affiliation is player-authored (app state).
> The only deliberate mesh “place” already in product is Stage.
> Voluntary occupancy trades (swap / pool / tide) are the oar.**

### 1.2 Do not auto-place by device power

It is tempting to reseat “stronger” devices into high-responsibility coords
(Section-1 compositors, heavy fan-out heads). **Do not.**

- The media plane doctrine is explicit: **no beefy node** — every seat does its
  fair share of composite/forward work ([`media-plane.md`](media-plane.md)).
- If placement optimized for power, **adversaries bring the strongest computers**
  and capture centrality. Silicon becomes privilege.
- Today the mesh does **not** do capability-aware seating. Sim `netQual` is for
  latency/failure modeling and measurement, not admit/FINDLEAF/compaction
  ranking. Compaction optimizes **geometry** (shallower, denser), not horsepower.

**Rule:**

> **The mesh never optimizes for device power.**  
> **Players may mutually exchange seats.**  
> **Nothing else moves a living occupant** (except heal/compaction empty-destination
> laws that already exist).

Voluntary swap/pool is therefore not a consolation prize — it is the **correct**
agency layer for co-location and play.

---

## 2. Flagship fantasy: Festival (permanent live city)

### 2.1 Pitch

A **link-native world festival / coliseum of humans** where thousands of real
faces coexist, table-games run inside the same room as the show, and the stadium
mesh is the venue architecture — not a hidden netcode detail.

Not a simulated 3D open world with authoritative physics. A **living venue**:

- **Plazas** = meeting URLs (stable, host-less, revive when empty).
- **Tables** = rows when chance or voluntary trades put people together;
  otherwise **soft camps** in app state.
- **Main stage** = mesh Stage (≤`C`, self step-up or admin-granted).
- **Crowd** = Stadium fold (ambient proof the city is full).
- **Booths** = App GIFs mounted into the room (shop, gallery, minigame).
- **Inventory / merch** = GIFs you steal, snapshot, remix — nothing on gifos.app.

### 2.2 What maps cleanly (and what does not)

| Want | Do | Don’t |
|---|---|---|
| Intimate hang | Soft camp + row when lucky + **swap/rally** | Promise permanent co-row |
| Spotlight | Stage | Elect row 0 / S1 as “VIP seats” |
| Mass presence | Stadium composite + reactions | Per-player full-quality to 10k peers |
| Economy | GIF custody, host shop state, room-local scores | Global gold on the relay |
| Navigation | Links, plaza list, Stage, camps | “Walk the tree coords” as the map |

### 2.3 Soft places vs mesh seats

**Soft place (camp / party / channel):** app-level set of peer ids + label.
Chat, emotes, quests, and minigame membership use this graph. Stable until you
leave the camp.

**Mesh seat:** whoever the laws say. Unstable by design. Full-quality multi-person
A/V is a **bonus** when camp members share a row — not a contract.

**Stage:** the one hard, player-chosen broadcast place already in the product.

Optional UI: surface topology as **weather** (“crowd thick · direct links: 4 ·
Stage open”), never as GPS (“you are seat (2,1,3) next to Alice forever”).

### 2.4 MVP slice (product, not full MMO)

1. Festival-skinned meeting lobby: plazas, “tonight’s Stage,” recents.
2. Row labeled **Table** + one-click open table game (reuse IRL / board apps).
3. Stage chrome as **Main Stage** (sign-up / host grant).
4. Stadium chrome as **Crowd** (composite + emoji-react gossip).
5. One booth App GIF (shop / gallery / minigame) mountable in-room.
6. Later: swap + pool + tide (sections 3–5).

---

## 3. Primitive: mutual seat swap

### 3.1 Why it is legal in spirit

Principle P (“only leaves move”) constrains **hole-filling**: do not relocate a
non-leaf and strand its subtree. A **swap does not reshape the tree**. Coordinates
keep up/down/row geometry; only **which identity occupies** two live cells
changes. Subtrees stay attached to coords, not people.

What blocks a naive “I’ll take your seat” is not P — it is **empty-only claim /
tenure / no silent eviction** (S5, C3, E2 family). Ordinary `doMove` (law T)
targets a **confirmed-empty** cell. A live-occupied destination needs a new verb.

### 3.2 What already exists

**Law T** (atomic seat switching for moves into empty / heal destinations):

- T1 claim-before-vacate (dual-hold transit; never homeless; rollback on contradiction)
- T2 bounded transit hold is not a dup
- T3 `MOVED` forwarding tombstone on vacate
- T4 mover death degrades to ordinary death at the live coord
- T5 drain still vacates first (do not keep doomed fragments alive)

Compaction (Q2) is voluntary-ish motion into **better empty** seats for density —
geometry only, self-duty, not affinity.

### 3.3 Proposed swap (pair)

**Bilateral law-T**, not two independent claims:

1. **Preconditions:** both seated, same home/meeting, neither mid-drain/broken
   transit; both explicitly accept (UI + signed accept).
2. **Pair lease:** short-lived exclusive license on `(coordA, coordB)` so healers
   do not treat either cell as a hole and third parties cannot claim them.
3. **Dual claim-before-vacate:** each may claim the other’s cell **only as the
   named counterparty under this lease** (not general occupied-claim).
4. **Confirm → D2 LEAVE old** with `MOVED` to new; lease expiry or contradiction
   rolls back.
5. **Death mid-swap:** same spirit as T4; counterparty aborts.

**Security pitch (UX copy):**  
“Seats reshuffle for reliability. You can **ask anyone to switch**; if they
accept, you trade. **Nobody moves you without your say-so.**”

### 3.4 What pair swap alone does not solve

- Gathering five friends into one row may need many hops (bubble-sort).
- **Internal** swaps among friends who hold **scattered** seats only permute
  labels on the same coords — **no co-location**. Gathering requires empties
  and/or trades with **outsiders**.

Hence pools (section 4).

---

## 4. Generalization: swap pools (teams, cliques, friends)

### 4.1 Definition

A **swap pool** is a set of peer identities with **standing mutual consent** to
participate in coordinated occupancy trades — not a global optimizer with teeth.

| Property | Rule |
|---|---|
| Join / leave | Explicit, signed, heartbeaten membership (no ghost seats in the pool) |
| Inside pool | Members may run swap/move protocols without a fresh confirm every hop |
| Outside pool | Still need that outsider’s accept, **or** an empty seat |
| Power | Never ranks devices; only affinity / declared intent |
| Mesh | Still law T discipline; healers respect leases; no silent eviction |

### 4.2 The internal-permute trap

If K friends occupy K scattered coords, freely rearranging **among those K**
does not put them in one row. Same geometry, different name tags.

**Sitting together means changing the set of coords the group occupies** into a
compact neighborhood — ideally **one full row** (natural party size ≤ `C`, full
mesh A/V).

### 4.3 Three layers of gathering

1. **Free permute** — multi-swap among seats already held by the pool. Useful
   once partially gathered (pack the table). Weak for cold start.
2. **Empty absorb** — pool members `doMove` into free seats of a target row
   (directed compaction / affinity PLACE). Best case: a free row absorbs up to
   `C` friends with no outsider.
3. **Outsider trade** — target seats held by non-members; offer bilateral swap
   (“you take one of our scattered seats”). Refusal → try another row, wait for
   churn, or stay soft-camp only.

### 4.4 Pool protocol sketch (app + mesh-adjacent)

Not a new healer and not a boss seat — gossiped affinity + gather attempts:

1. **Declare** `poolId`, members, optional intent tags, expiry.
2. **Pick target** with a deterministic, non-power rule, e.g.:
   - Row already containing the most pool members
   - Shallowest row with enough free seats
   - Row of the member who pressed **Rally** (explicit UI initiator)
3. **Plan:** keep pool-held target seats; assign empties by stable id order;
   propose swaps for outsider-held target seats.
4. **Execute:** chain of pair leases or one N-way lease on involved coords;
   claim-before-vacate; rollback on conflict.
5. **Abort soft** if the room is in a heal storm; soft camp UI remains.

Rate-limit rallies so pools cannot thrash the tree.

### 4.5 Security one-liners

- Pool cannot move non-members without their accept.
- Leases expire; pools cannot block heals forever.
- Rally initiator is **UI**, never measured FPS/CPU.
- Alts in a pool are a social problem (kick / ignore / vote-off), not a mesh
  privilege.
- Prefer gathering into **ordinary rows**, not “storm Section 1” as a default
  game goal (keeps media load fair-share).

---

## 5. Dual intent: Rally vs Shuffle (Tide) — the liquidity market

### 5.1 The heaven match

If half the people enter a pool because **they want a random new seat** and half
because **they want to sit together**, the motives complete each other:

| Intent | Supplies | Demands |
|---|---|---|
| **Rally / Together** | Target geometry, willingness to leave scattered seats | Co-located table (row) |
| **Shuffle / Anywhere** | Willingness to **yield** current seats | Novelty, new row-mates |

Rallies need vacancies or willing leavers. Shuffles **are** those leavers, as long
as they land somewhere else interesting. Successful gathers are **matches**, not
guilt trips.

Diegetic one-liner:

> **Some people came to hold a table. Some people came to drift. The night only
> works because both showed up.**

### 5.2 Intent tags (product)

Multi-select on pool join:

- **Together** — affinity group / party id; want co-location.
- **Anywhere** (shuffle) — treat me as mobile seating inventory; I want a new seat.
- **Stay** (optional) — in pool only to help friends plan; **do not** draft me as
  a yielder unless I accept a specific swap.

Matching preference (not law):

1. Fill rally targets from **empty** seats first.
2. Then from **Anywhere** members (and compatible other rallies).
3. Never draft **Together-only / Stay** as forced yielders.

Shuffle reward is automatic: they receive a different seat (often a rally’s old
scattered coord — new neighbors by construction). Later polish: bias away from
recent row-mates.

### 5.3 Failure modes (honest UX)

| Room mix | Outcome |
|---|---|
| All rally, no shuffle | Stall; “not enough people open to moving” — soft camp still works |
| All shuffle | Pure reseat lottery — still a game mode |
| Mixed | Festival energy; gathers + serendipity |
| Malicious “Anywhere” sniping | Intent grants no coord picker; only empties + consented trades |

### 5.4 Doctrine line

> **The swap pool is a voluntary liquidity market: rallies demand co-location;
> shuffles supply motion; the mesh only executes consented occupancy trades.**

---

## 6. Shuffle as game, not settings

Do not bury this under “advanced mesh options.” Make motion a **verb**.

### 6.1 Diegetic names (pick later)

Drift · Reseat · Mix · **Tide** · Musical Chairs · Wander · Cut In  
(Pair swap as social emote: **Cut in** / **Trade places**.)

### 6.2 Core loops

| Loop | Play |
|---|---|
| Discovery | Tide drops you with strangers → bits, alliances, material for social games |
| Party formation | Good row → Hold the table; friends Rally using Tide as liquidity |
| Tension | Scarce good tables; compete with **offers**, not hardware |
| Rhythm | Round timer: “Tide turns in 0:45” so reseats batch and heals stay calm |
| Spectacle | Stadium watches the mix; Stage hosts the ceremony |

Unpredictable seating stops being a support ticket (“why aren’t we together?”)
and becomes **the weather the sport is played in.**

### 6.3 Guardrails (game must not melt the tree)

- **Opt-in only** — never draft Stay/Hold into Tide.
- **Round barriers** — reseat in windows; freeze during mass heal / high churn.
- **Cap frequency** — e.g. one tide per N minutes per room mode.
- **No power targeting** — never prefer beefy devices.
- **`C` = party size** — full table = one row; larger groups = multi-table
  alliances + Stage/Stadium.

### 6.4 Scoring without a world server

Room-local or App GIF state only:

- Row-mates or Stage app attest round completion via gossip.
- Host / Stage app is session source of truth for scores.
- Cosmetics as GIF state / stealable stickers — not global gold on the relay.

---

## 7. Game catalog: how different games use swap / pool / tide

Each entry lists **fantasy**, **mesh features used**, **pool usage**, and
**win / loop**. All assume meetings (or app-in-meeting) unless noted.

### 7.1 Festival (default social MMOG)

- **Fantasy:** Permanent plazas, stages, booths, drifting crowd.
- **Mesh:** Stadium presence, Stage shows, row tables, app-on-stage booths.
- **Pool:** Ambient Tide for explorers; Rally for friend groups at game night.
- **Loop:** Arrive → drift or hold → mount a booth / watch Stage → leave with GIFs.

### 7.2 Musical Chairs / Round Mixer

- **Fantasy:** On the bell, everyone in Tide reseats; play a short game with
  **new** row-mates; repeat.
- **Mesh:** Batched multi-swap + empty absorb; Stage as “DJ / host.”
- **Pool:** Almost everyone **Anywhere**; optional Together couples who try to
  re-merge each round (hard mode).
- **Loop:** Score per round with current table (trivia, drawing, word games).
- **Reuse:** Existing IRL party apps (Same Brain, One Clue, etc.) as table games.

### 7.3 Crew vs Tide (asymmetric social sport)

- **Fantasy:** Crews try to **hold a full row** for N minutes; Drifters score by
  **breaking** crews (landing in their row) or visiting K distinct rows.
- **Mesh:** Rally gather + shuffle liquidity; row occupancy as the board.
- **Pool:** Crews = Together pools; Drifters = Anywhere.
- **Win:** Crew time-on-table vs drifter visit/break points.
- **Note:** “Breaking” is only via **consented** swaps or empties — social
  pressure and offers, not force. Refusing is valid defense.

### 7.4 Tabletop night at scale

- **Fantasy:** Many simultaneous 2–5 player games (chess, C4, custom GIFs),
  stadium is the game hall.
- **Mesh:** Row ≈ table when gathered; Stage for tournament finals; soft camp
  for queue between games.
- **Pool:** Rally to seat a match; shuffle between rounds for Swiss pairings
  that are **literally** new neighbors.
- **Loop:** Queue → rally to a free/partial row → play app → tide to next board.

### 7.5 Colosseum / spectator sport

- **Fantasy:** Few combatants on Stage; thousands in Stadium; rows are watch
  parties with side bets.
- **Mesh:** Stage = arena (cap `C` is feature); Stadium = roar; row = friends
  with full A/V.
- **Pool:** Watch parties Rally; casuals Shuffle between sections of the crowd;
  winners get Stage time (ceremony), **not** S1 compositing privilege.
- **Loop:** Bout → vote/react → next bout; merch GIFs.

### 7.6 Massive social deduction (Section Villages)

- **Fantasy:** One Night Wolves × hundreds; each **row** is a cabin when
  gathered; Stage is town square accusation.
- **Mesh:** Stage debate; row private discussion (if rallied); Stadium night
  atmosphere; gossip for roles/votes (careful: info hygiene in app design).
- **Pool:** Village/cabin Rally at dusk; Tide as “night moves” between cabins
  (with consent — or only empties for pure stealth fantasy).
- **Loop:** Deal roles → discuss → Stage trial → resolve; reuse IRL wolves DNA.

### 7.7 Night market / booth crawl

- **Fantasy:** Passworded halls; vendors pin files; shoppers drift.
- **Mesh:** Admin rooms for vendor control; file pin rules; Stage for auctions.
- **Pool:** Shopper Shuffle as the crawl; vendor crews Hold a table/booth row.
- **Loop:** Browse → trade GIFs → auction on Stage.

### 7.8 Quest / scavenger night

- **Fantasy:** Clues across plazas (URLs) and tables; Stage announces chapters.
- **Mesh:** Multi-room links; gossip tokens; Stage narrative.
- **Pool:** Party Rally to solve a table puzzle together; Shuffle to find the
  next clue-holder who is **Anywhere**.
- **Loop:** Soft state in a quest App GIF; no server quest DB required for v1.

### 7.9 Desktop Realms (meta-MMOG)

- **Fantasy:** Character = your GifOS desktop; inventory = App GIFs; zones =
  meetings; raids = co-op apps on Stage.
- **Mesh:** Same as Festival; Steal App is loot-adjacent culture.
- **Pool:** Guild Rally for raid voice quality; open Tide for public hubs.
- **Loop:** Explore plazas → collect/mod GIFs → stage raids.

### 7.10 STADIA (mesh-as-board, hardcore)

- **Fantasy:** Coords are almost diegetic; holding Stage is political; heals are
  visible weather.
- **Mesh:** Expose more topology-as-HUD; swap/pool still required for intentional
  blocks; **still no power auto-seat**.
- **Pool:** Factions Rally onto chosen rows; sabotage only via social swaps and
  public rules — never false heals.
- **Caution:** Easy to overfit networking; keep Festival-friendly modes primary.

### 7.11 Using Stage as the scarce toy (all genres)

Stage is already:

- Deliberate (not seating),
- Cap-`C`,
- Room-visible,
- Able to carry a **DATA** app stream as well as A/V.

Games should treat Stage as **prize, mic, arena, auction block, trial dock** —
not as “the powerful computers sit here.” Entry remains self step-up or admin
grant per room type.

---

## 8. Last One Standing — “FPS” by exclusion (vote-off as the weapon)

### 8.1 Pitch

A first-person (or first-face) **elimination arena** where the goal is not a
kill feed of hit-scan bullets, but to become **the last person still in the
room**. You win — and you are **alone**. When the winner leaves (or the room
empties and revives), the **game resets** for the next round/population.

The weapon is social + systemic: **vote-off** (and related room tools), not a
dedicated game server combat sim.

This rides GifOS uniquely:

- Rooms are permanent URLs; emptiness and rejoin are natural reset edges.
- Vote-off is already **personal, device-based, global to the voter**, tallied as
  a **live majority of connected devices** (min 2), with **no server ban list**
  ([`meeting.md`](meeting.md), [`threat-model.md`](threat-model.md)).
- Full-face presence makes social combat visceral: you see who is hunting you.
- Stadium scale means a large field; row adjacency makes local politics matter
  if combined with swap/tide (alliances, betrayals, “clear this table”).

### 8.2 Win condition and reset

| Event | Meaning |
|---|---|
| Alive | Still in the meeting (seated / connected under room rules) |
| Eliminated | Vote-off threshold reached → removed / denied re-entry per existing vote-off semantics |
| **Win** | You are the sole remaining participant in the room |
| **Reset** | Winner leaves, or room hits empty and the next join wave starts a new match; optional explicit “New game” on Stage app |

**Aesthetic beat:** victory is hollow and loud — empty Stadium, one face, silence
then exit. The game **punishes permanent camping on the win**: staying forever
means no next match; leaving is the curtain call.

### 8.3 Why vote-off fits (and what to respect)

**Fits:**

- Hard exclusion without inventing a parallel ban system.
- Votes already **follow the person** across rooms on each voter’s device —
  for a pure arena mode you may want **room-scoped match votes** (see 8.6) so a
  fun deathmatch does not poison the player’s global civil list.
- Majority of **devices** resists simple multi-tab ballot stuffing (existing
  design intent).

**Respect / do not break:**

- Vote-off was built as **moderation and safety**, not only sport. A game mode
  must be **explicitly entered** (mode flag, passworded arena plaza, or “I
  consent to match votes”) so random open low-channels do not become unmarked
  deathmatches.
- Do not teach players to use global vote-off casually in civil meetings.
- Forged or DOM-injected “insta-ban” was rejected by design — each device casts
  only its own vote. Game UI must use the real path, not a fake button.

### 8.4 Combat fantasy without hit-scan netcode

Frame it as a **social FPS / battle royale of presence**:

- **Loadout** = persuasion, alliances, Stage rhetoric, table politics, swap
  offers, information (who is low on friends).
- **Arena** = the meeting itself; “map control” = Stage time, row majorities,
  pool leadership.
- **Gun** = nominate + vote; optional Phase rules (see below) so it is sport not
  instant chaos.
- **Death** = leave the room (hard). Ghost spectate only if you design a
  non-seated spectator path (hard on pure mesh; simpler: eliminated watch via a
  second “graveyard” meeting link or Stage-only ghost app — product choice).

Optional “FPS HUD” chrome: crosshair is a joke; real reticle is **vote progress
on a target**, heartbeat of room count, Stage “bounty” callouts.

### 8.5 How swap / pool / tide supercharge the arena

| Mechanic | Combat use |
|---|---|
| **Pair swap** | Infiltrate a hostile table; escape a packing row; bribe “trade me out.” |
| **Rally pool** | Form a **squad** that tries to share a row for private plot + full A/V conspiracy. |
| **Shuffle / Tide** | Force map remix on a timer — break entrenched voting blocs; “storm” as consenting mobility. |
| **Stage** | Public accusation, final duel rhetoric, host announces safe phases / sudden death. |
| **Stadium** | Everyone sees the population collapse; roar becomes silence as a win signal. |
| **Soft camp** | Alliance UI even when not co-seated; betrayal when votes flip. |

Example mid-game story: a squad Rallies to a row, votes out isolates, then Tide
hits and scatters them — former allies can now knife each other with votes.

### 8.6 Rules modules (compose a mode)

**A. Consent arena**

- Room created with mode `last-standing` (admin room or mode bit in app state).
- Join = consent to **match-scoped** elimination votes.
- Prefer **match ballots** stored in room/app gossip for the round, **not**
  writing everyone’s civil `gifos_voteoff` list — unless the mode is explicitly
  “hardcore global scars.” Document the choice in UX in huge type.

**B. Phased combat (recommended v1)**

1. **Day / Mingle** — no votes; Tide optional; form squads.
2. **Hunt** — votes open; Stage nominations.
3. **Tide** — mandatory shuffle for Anywhere; optional for all living.
4. **Sudden death** — when ≤`C` remain, force Stage face-off; votes every T
   seconds until one left.

**C. Vote economy (sport balancing)**

- One vote weight per device (already).
- Optional: limited **challenges** per player per phase so early snowballs
  slow down.
- Optional: **mercy** — target can Stage-plea; if majority rescinds before
  threshold, live on.
- **Ally penalty:** voting out a current row-mate costs a cooldown (encourages
  betrayal timing).

**D. Anti-spawn-camp / alt**

- Device majority already helps.
- Match mode can require stable display names + visible device fingerprints in
  the arena roster (meetings already push toward non-anonymity).
- Rejoin-after-eliminate denied for the match (vote-off / ban list for room
  verifier) even if civil global list untouched.

**E. Winner and reset**

- Sole survivor gets Stage crown + “you won, you’re alone” beat.
- Leaving triggers **match over** gossip; next N joiners start match 2, or a
  lobby waits for quorum (e.g. min 4 devices).

### 8.7 Is this really an FPS?

**Spiritually yes:** first-person presence, spatial social cover (rows/squads),
objective (last alive), loadout (rhetoric + mobility + alliances), death that
removes you from the instance.

**Literally no:** not projectile lag-comp or hit registration. That is a
feature for GifOS — you are not fighting the mesh for 60 Hz world state; you are
fighting **people** with a primitive the platform already secured.

If someone later wants raycast FPS, that is a different game (likely small-N
host-authoritative app), not the infinite-stadium killer app.

### 8.8 Risks and ethics

- **Toxicity:** elimination-by-vote can feel like bullying. Mitigations: explicit
  mode, humor framing, phase structure, report/ignore still available, separate
  arena plazas (not unmarked `/meet/a`).
- **Safety tools dulled:** if players spam global vote-off in sport, civil rooms
  suffer → **match-scoped votes** strongly preferred.
- **Empty win:** last player might be the one who never engaged. Optional
  activity scores for flavor crowns, but **sole occupancy** remains the hard
  win for purity.
- **Mesh churn:** mass vote-offs are mass leaves — healing laws must stay green;
  treat eliminations as ordinary LEAVE storms; do not invent special topology
  for death.

### 8.9 Minimal implementation path

1. Arena meeting template + Stage “Last Standing” app (quorum, phase, roster
   count, winner screen).
2. Wire elimination to **room-scoped** majority vote (reuse relay/device tally
   ideas from vote-off; keep civil list separate).
3. Optional Tide rounds via swap pool once that primitive exists.
4. Recording/transcript optional trophy on winner’s device only.

---

## 9. What not to build (reminder list)

- Continuous large-scale authoritative physics MMO on the relay.
- Mesh seating as owned real estate or guild property.
- Auto seat-by-CPU/GPU/uplink.
- Silent eviction dressed as “game balance.”
- Global economy that requires gifos.app to store inventory.
- Unmarked deathmatch on ordinary civil low-channels.
- Teaching Stage or S1 as “high power seats for strong machines.”

---

## 10. Suggested build order (if this becomes real work)

1. **Festival skin + Stage/table UX** (no new mesh laws) — prove fantasy.
2. **Pair swap** in sim + `mesh.js` (law + repro + churn matrix) — primitive.
3. **Pool membership + Rally + Anywhere** app protocol on top of swap.
4. **Tide rounds** as a Stage-hosted mode (Musical Chairs / Mixer).
5. **Last One Standing** arena with match-scoped votes + winner reset beat.
6. **Crew vs Tide** and deduction modes as content packs (App GIFs).

Each step should stay green under existing mesh harnesses and must not weaken
heal/empty-only/fair-share doctrines.

---

## 11. Open questions

- Match-scoped vote storage: pure gossip vs relay assist for tally UX only
  (relay must not become a ban DB of record for sport if avoidable).
- Spectator / graveyard: second link vs stay-connected muted ghost seat (ghost
  seats may fight “last one” purity).
- Max useful pool size vs `C` and lease complexity.
- Should compaction ever accept an **affinity hint** (still empty-only, still
  not power-based)? Probably later; easy to get wrong.
- Cross-plaza (multi-URL) Festival map: directory app only, or deeper?

---

## 12. One-page summary

GifOS can host MMOG-scale **presence** without game servers because the stadium
mesh already folds media and heals under churn. Games must treat **seats as
weather**, **Stage as spotlight**, and **affiliation as app state**. Never
auto-promote strong hardware into heavy seats (adversaries would farm it).

**Mutual swap** is the honest agency primitive; **pools** generalize it for
teams; **Rally vs Shuffle** turns the pool into a liquidity market; **Tide**
makes shuffle a game verb. Genres from festival social worlds to musical chairs,
crew sports, deduction, markets, and quests all compose from those parts.

**Last One Standing** is the sharp edge case: a social FPS whose gun is
**vote-off**, whose map is the room, whose victory is **solitude**, and whose
reset is **leaving the empty throne** — built carefully so sport never poisons
civil moderation tools.

---

*Document status: ideas / design journal. Not binding protocol. When a primitive
(e.g. pair swap) is implemented, add a short “STATUS: LIVE” note and link the
law text + tests here.*
