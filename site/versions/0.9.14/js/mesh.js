/*
 * mesh.js — the GifOS no-root mesh CONTROL PLANE, a faithful port of the C++
 * reference sim (test/sim/mesh.cpp + test/sim/mesh_seat.inc + test/sim/topo.h). This is the
 * production seating + healing brain; docs/healing-laws.md is its law catalog
 * and docs/sim-split-brain.md the anti-divergence casebook (7 fixed bugs —
 * every one of them is mirrored here, do not regress them).
 *
 * The doctrines carried over from the green sim (kill 0.1–0.6 × seeds 1–50 →
 * 0 dups / 0 stranded / 0 teleport; total partition → two clean homes):
 *   W7  — Section 1 (pc==0) is the 5×5 ROOK'S GRAPH: row + column + down,
 *         uniform degree 9. Deep sections keep the sparse transpose.
 *   C3  — fixed-designation healing: ONE healer per hole, known in advance
 *         (down-child VERTICAL; childless head's right-neighbour HORIZONTAL;
 *         reactive + proactive LEFT-PACK; the probe-gated head backstop
 *         s1Fill). lowestSurvivor is RETIRED — no computed opinions.
 *   S5  — healing fills holes, never makes them: a fill lands only on a coord
 *         its healer has itself, first-hand, stopped hearing.
 *   E2  — liveness is FIRST-HAND only (PHONE/PONG/HELLO/CLAIM). Gossip
 *         (S1SYNC) informs routing, NEVER evicts, never resurrects. Tenure
 *         protects the sitting occupant; ties break lower-id-wins everywhere.
 *   H1-S1 — ring-heal conservatism: a home cell is refilled only after its
 *         occupant is unreachable via ALL rook paths for RING_HOLD (probe-
 *         gated ringConfirmDead). Hold a hole, never mint a duplicate.
 *
 * It is TRANSPORT-AGNOSTIC. A Seat holds all its own state (occ map, live,
 * s1seen, cousins, roster, …) and talks to the outside only through an injected
 * `env`:
 *   env.TICK            current logical time (a monotonically rising integer —
 *                       the heartbeat count in production, the tick in the sim)
 *   env.HEALING         master heal enable (always true in production)
 *   env.send(from,to,m) deliver control message m from peer `from` to peer `to`
 *                       (WebRTC data channel in production; the sim's bus in test)
 *   env.knock(from,key) knock the relay presenting genesis-key token `key`
 *                       (relay WebSocket in production; the modelled registry in test)
 *   env.wake(id)        mark a seat active (scheduler hint; may be a no-op)
 *   env.peek(id)        OPTIONAL (test harness only): the sim's global peer view
 *                       {hasCoord, coord, socketed, gateway} — enables the sim's
 *                       Option A owned-link routing enforcement (no teleports).
 *                       Production leaves it undefined: mesh-wire owns delivery.
 *   env.bumpMoves/bumpEvict  optional metrics counters (test only)
 *
 * Peer IDs are opaque but TOTALLY ORDERED (integers in the sim, peer-id strings
 * in production) — the healing tie-breaks need only a consistent order, so
 * string `<` works exactly like the sim's numeric `<`. Absent occupancy is
 * `null` (the sim's -1 sentinel); ckey() is a STRING map key (no uint64 in JS).
 */
(function (root) {
  const GifOS = root.GifOS = root.GifOS || {};
  const net = GifOS.net;
  const topo = net.topo;
  const ck = topo.ckey, unck = topo.unck;
  const C = () => net.SCALE.C;

  // ---- constants (mirror test/sim/mesh.cpp — SWEPT values, tuned for C=5 and the
  // lastPhone>=8 heartbeat cadence; re-sweep in the sim before changing) ----
  const RELAY_TTL = 500;     // greeter entry lifetime (ticks)
  const RELAY_CAP = 72;      // max greeter entries the relay holds
  const E3_PERIOD = 200;     // Section-1 re-knock cadence (< RELAY_TTL so live seats stay listed)
  const STRAND_TTL = 500;    // R6: unreachable-for-this-long ⇒ take over (empty) or stranded (recoverable — retry after backoff)
  // H1-S1 RING-HEAL CONSERVATISM (W7): a HOME (Section-1) cell is refilled only
  // after its occupant has been unreachable via ALL its rook-redundant paths for
  // this settled window — far higher than the deep-tree confirmation (60),
  // because the rook has many paths to exhaust. A wrong ring-heal is the one act
  // that mints a divergent home; a held hole is a recoverable availability dip.
  const RING_HOLD = 220;     // test/sim/mesh.cpp RING_HOLD
  const OWNER_SILENT = 40;   // test/sim/mesh.cpp OWNER_SILENT — 5 unanswered 8-tick phone beats arms the ghost-target probe
  // A three-state occupancy: soft sitting-down TTL + assigner recheck (loss wedge).
  const SIT_TTL = 90, SIT_RECHECK = 25;
  // V4 probe window: free a silent vouch only after a SITPING went unanswered
  // this long (delivery is bounded per leg, so 15 covers the round trip; a
  // killed tab frees at 25+15=40 — inside the ghost-churn budget).
  const SIT_PING_WAIT = 15;
  // D5 EARLY-PROBE (healing-laws D5): when MY OWN transport to a neighbour dies
  // (DataChannel close / hard pc failure — a FIRST-HAND observation, never
  // gossip), the confirm probe may start immediately instead of waiting out the
  // silence horizon. EARLY_HOLD is the settled window the probe gets on the
  // mesh's redundant paths before the death is confirmed: long enough for a
  // probe round trip plus a retry (probes re-fire every ~6 ticks while
  // pending), short enough that an ungraceful death is confirmed in seconds.
  // The horizon (60 / RING_HOLD) remains the backstop when no transport event
  // fired; an answered probe clears the observation entirely.
  const EARLY_HOLD = 12;     // test/sim/mesh.cpp EARLY_HOLD
  // T — the mover's lease (atomic seat switching, healing-laws.md law T).
  // A self-move TAKES its new seat FIRST and vacates the old one only when the
  // claim CONFIRMS; a contradiction rolls the mover back to its still-held old
  // seat. After confirm the old cell keeps a bounded FORWARDING TOMBSTONE.
  const CONFIRM_TTL = 16;    // test/sim/mesh.cpp CONFIRM_TTL
  const LEASE_TTL = 40;      // test/sim/mesh.cpp LEASE_TTL
  // Q2 — COMPACTION (roadmap §3, healing-laws law T): a settled deep LEAF that a
  // fresh probe would place STRICTLY SHALLOWER walks its own ALIVE up-chain and
  // joins the nearest strictly-shallower OCCUPIED row (densify) via an atomic
  // law-T move. Rate-limited + local-quiescence-gated so a healing boundary never
  // sloshes; depth is a monotone potential ⇒ MOVES provably settle.
  const COMPACT_PERIOD = 90; // test/sim/mesh.cpp COMPACT_PERIOD — min ticks between one leaf's compaction probes
  const COMPACT_SETTLE = 300; // test/sim/mesh.cpp COMPACT_SETTLE — quiescence window since seating / last heal / last move / last local churn. ABOVE the healing horizons so a mass-heal fully re-converges before compaction stirs the tree (a shorter window ~2x'd mass-heal convergence and flaked the churn sweep).
  const COMPACT_TTL = 30;    // test/sim/mesh.cpp COMPACT_TTL — up-chain hop budget for a compaction probe
  const PROBLVL = 0;         // test/sim/mesh.cpp PROBLVL (`problvl n`) — cap the probe's climb at n levels above the seeker; 0 = unlimited. The V5 funnel fix: at N=20000 settled, problvl 2 takes the hot S1 seat from 13.7-15.1 frames/tick to the 3.13 floor on every seed swept (2026-08-07) while compactness holds. MUST match the sim default — twins never diverge.

  // ---- V1 ROLLUP DIGEST (healing-laws.md § G) — faithful port of the sim's
  // digest machinery (test/sim/mesh.cpp Dig + mesh_seat.inc rollup/pubDig/
  // noteUp/upRefuted/scopeGap). FLAG-GATED, DEFAULT OFF: every digest site is
  // behind env.DIGEST === true. The sim runs it ON and its gate
  // (test/sim/repro-digest.sh, 47 assertions) is green; the browser flips it
  // on only when the small-room e2e is proven byte-identical (scale-audit
  // sequencing step 4). G0: digests ride EXISTING frames — dgUp on PHONE,
  // dgPub/dgEcho/dgRoot on PONG, digs on S1SYNC — not one new frame type, no
  // new timer, no decision. G1: display only — nothing below may evict, seat,
  // move, admit, heal, or release privacy state. test/mesh/digest.js asserts
  // the ON≡OFF trajectory identity that makes G0/G1 mechanical.
  const DIG_TTL = 60;        // test/sim/mesh.cpp DIG_TTL — a report older than this is stale (G3: stale ⇒ fail-closed)
  const DIG_LOSS_H = 300;    // test/sim/mesh.cpp DIG_LOSS_H — the fail-closed blur horizon (spans RING_HOLD, the longest confirm window)
  // The digest record (sim struct Dig). by=null is the sim's by=-1; at=-1 means "never computed".
  const dig0 = () => ({ n: 0, refuse: 0, freeC: 0, at: -1, by: null, dmin: 99, part: 0 });
  const digFold = (dst, s) => { dst.n += s.n; dst.refuse += s.refuse; dst.freeC += s.freeC; if (s.dmin < dst.dmin) dst.dmin = s.dmin; if (s.part) dst.part = 1; };

  // A Section-1 key has pc==0 — its string ckey starts "0_".
  const isS1key = (k) => k.charCodeAt(0) === 48 && k.charCodeAt(1) === 95;
  // ownerCoordOf(c): the coord that owns cell c (its head's up), or null for Section 1.
  const ownerCoordOf = (c) => (c.pc === 0 ? null : topo.up({ pc: c.pc, r: c.r, i: 0 }));
  // A tiny non-crypto key hash for the modelled relay / genesis identity. In
  // production the relay hashes with SHA-256; here only equality + "is set" matter.
  function keyHash(s) {
    let h = 2166136261 >>> 0; const str = String(s);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) || '1';
  }

  class Seat {
    constructor(id, env) {
      this.id = id; this.env = env;
      this.state = 0;            // 0 join, 1 ask, 2 search, 3 seated
      this.hasCoord = false; this.coord = { pc: 0, r: 0, i: 0 };
      this.occ = new Map(); this.live = new Map(); this.s1seen = new Map();
      // born: CLAIM BIRTH — the tick each (cell → claimant) pairing was first
      // established, locally or carried end-to-end in S1SYNC (entry field b).
      // Gates the gossip tie-break: an ancient claim never wins a tie.
      this.born = new Map();
      this.healTry = new Map(); this.cousins = new Map();
      this.kidful = new Map(); this.childOf = new Map();
      // A three-state: soft sitting-down marks {joiner, assigner, at} by cell key.
      this.sitting = new Map();
      this.rowLedger = true;   // V4: false only while a vouched-in S1 row head awaits its assigner's SITXFER
      // V4: MONOTONE first-hand-ever — `live` entries are erased by attributed
      // clears (current-liveness semantics); "have I EVER heard this cell
      // first-hand" must survive them (the devolution-narrowing predicate).
      this.fhEver = new Set();
      // holeSince: when a Section-1 cell I don't hear first-hand first looked
      // like a hole (H1-S1 confirm-window timer, probe-gated ringConfirmDead)
      this.holeSince = new Map();
      // D5 early-probe state (all keyed by coord ckey):
      //   translost: when MY transport to that coord's occupant died (edge-
      //              triggered — set once per transition, cleared on any answer)
      //   tlProbeAt: last tick a pending translost re-probed (probe pacing)
      //   probeAck:  last tick a ROUTE probe of that coord was ANSWERED (ROUTED
      //              with a live id). Deliberately NOT `live` (E2 untouched):
      //              a probe answer travels the mesh, so it can only ever
      //              PREVENT an early eviction, never evict or resurrect.
      this.translost = new Map(); this.tlProbeAt = new Map(); this.probeAck = new Map(); this.tlLog = []; // [k, tick, why] — last 24 forgotten observations (forensics)
      // PRODUCTION EXTENSION (no sim counterpart — the sim's harness reads occ
      // directly every tick; the app samples it). d5Deaths: each probe-
      // confirmed death tlSweep evicts, as a FACT the app drains — a same-tick
      // heal (the sole survivor promoting into the freed head seat) rebuilds
      // occ wholesale, so the app's diff-based departure intake is blind to
      // exactly the deaths that trigger a heal. A ledger changes no mesh
      // decision; it only makes the verdict deliverable.
      this.d5Deaths = []; // [k, pid, tick]
      this.retryAt = -1; this.seatTries = 0; this.lastPhone = -99; this.lastAck = 0;
      // ENTRY PACING (law tightened 2026-08-02): at most ONE knock and ONE
      // seat-ask per tick. The sim's bus already tick-paces every round trip,
      // but production recv is EVENT-driven — a NOROOM answered in
      // milliseconds re-asked in milliseconds, and a joiner facing a settling
      // row hosed the relay at network speed (measured: 4,000 entry frames in
      // 13s). The law always assumed the tick cadence; these guards make it
      // real. A same-tick repeat is DEFERRED (reAsk/reJoin), fired next tick.
      this.askTick = -1; this.joinTick = -1; this.reAsk = false; this.reJoin = false;
      this.healAt = -99; this.drainAt = 0; this.rosterAskAt = -999; this.xlinkAt = 0;
      this.seatedAt = 0; this.challAt = 0; this.s1CheckAt = -1;
      this.rookSeenAt = 0;   // last tick I heard ANY rook neighbour first-hand (split-off fragment detection)
      this.myKey = 'mk_' + id;   // throwaway personal genesis key (unique per seat)
      this.genKey = null;        // THIS meeting's genesis key (learned via the dance, or minted)
      this.joinStart = -1; this.stranded = false; this.evil = false; this.alive = true;
      // R6: lastReach = last tick I REACHED a greeter (a HOME roster came back).
      // Stranding requires having reached NONE for a full TTL — a busy room where
      // I keep getting NOROOM is competing for a slot, NOT stranded (bug #6).
      this.lastReach = -1; this.strandedAt = 0;
      this.gateway = null;       // the greeter this (unseated) newcomer routes through
      // R5 / E5§2: multi-greeter HOME probe before seating. Cluster replies by
      // genesis key AND by roster overlap (same-key torn home = two greeter
      // halves the newcomer alone can see). Two+ clusters ⇒ human pick-one.
      // Faces for the UI: Stage first, else Stadium (app fills via HOME fields).
      this.forkProbe = false; this.forkAt = -1;
      this.forkSamples = []; // raw HOME samples before clustering
      this.forkOpts = new Map(); // optionId -> { id, gkey, gateway, roster, stage, stadium, faces }
      this.forkPending = 0; this.forkPaused = false;
      // ---- T: atomic seat switching (mover's lease) ----
      this.moving = false; this.moveAt = -1;        // transit: NEW seat taken, OLD not yet vacated (dual-hold)
      this.oldCoord = null; this.oldCk = null;      // the still-held old seat
      this.oldNbrIds = [];                          // old-link occupants — get the LEAVE(mvd) on confirm
      this.holdOcc = null; this.holdSeen = null; this.holdCous = null; // rollback snapshots
      this.leaseCk = null; this.leaseUntil = -1;    // T3: forwarding tombstone for my just-vacated cell
      this.compactAt = 0;        // Q2: next tick this leaf may probe for a shallower seat
      this.lastChurn = 0;        // Q2 hysteresis: last tick my neighbourhood churned (LEAVE/heal/move nearby) — compaction waits for local quiescence
      this.compactMoves = 0;     // Q2 observability: how many times I have compacted upward (surfaced via __gifosVideo.debugDump for the swarm live test)
      this.roster = []; this.haveRoster = false; this.lastGreeters = [];
      this.findNc = null;        // 03c: seeker of the serveFind scan in progress (knock-is-evidence phantom scope)
      // ---- V1 ROLLUP DIGEST state (healing-laws § G; sim mesh.cpp) ----------
      // Display-only, flag-gated (env.DIGEST) — see the constants block above.
      this.refuses = false;      // MY OWN first-hand consent state (has NOT consented). Local, never derived from a digest.
      this.lie = 0;              // adversary knob (tests only): 1 = publish refuse=0/part=0 (SUPPRESS — the one dangerous direction), 2 = inflate n
      this.myDig = dig0(); this.rowDig = dig0(); this.rootDig = dig0(); // my subtree fold / my row fold (deep heads) / the room fold
      this.downDig = dig0();     // the ROW digest my down-child head published up to me (my whole owned child row)
      this.rowKids = new Map();  // head only: each row-mate's subtree digest   (<= C-1)
      this.s1tab = new Map();    // Section 1 only: per-S1-cell subtree digests (<= C^2)
      // G4: the ring of reports I published upward (ground truth for the echo
      // check), and what I actually FOLDED this period (echoed to its authors).
      this.upLog = []; for (let q = 0; q < 16; q++) this.upLog.push({ at: -1, n: 0, refuse: 0 });
      this.upLogI = 0; this.upSince = -1; this.lastAgg = null; this.emptyEcho = 0;
      this.downUsed = dig0(); this.rowUsed = new Map();
      this.digMismatch = 0;      // refutations I have raised (mine only — no votes, G4)
      this.digArm = 0;           // which refutation arm last fired (1 echo fidelity, 2 fold monotonicity, 3 omission)
      this.digGap = 0;           // which scope member I fail-closed on this fold: 1=child row, 2=row-mate, 4=S1 cell
      this.onDigMismatch = null; // diagnostic hook (the sim's MESH_DIGLOG twin) — display only, never a decision
      // per-seat PRNG (splitmix-ish), seeded from id — matches the sim's per-seat rng role
      let h = 2166136261 >>> 0; const b = 'p' + id;
      for (let k = 0; k < b.length; k++) { h ^= b.charCodeAt(k); h = Math.imul(h, 16777619); }
      this.rs = (h ^ 0x9e3779b9) >>> 0;
    }
    get TICK() { return this.env.TICK; }
    rng() { this.rs = (this.rs + 0x6d2b79f5) >>> 0; let t = this.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    shuf(a) { for (let k = a.length - 1; k > 0; k--) { const j = (this.rng() * (k + 1)) | 0; const t = a[k]; a[k] = a[j]; a[j] = t; } return a; }
    // A seat HOLDS a relay socket while joining (state!=3) or while seated in
    // Section 1 (the greeter pool). Deep seats are socketless.
    socketed() { return this.state !== 3 || (this.hasCoord && this.coord.pc === 0); }
    // emit(): Option A owned-link delivery — a seated seat may only hand a frame
    // to a seat it holds a real owned-link (DataChannel) to; a seated NON-
    // neighbour target is ROUTED over the mesh instead of teleported. The
    // enforcement needs the sim's global peer view, so it is ACTIVE only when
    // the env provides peek() (the test harness models the fabric exactly like
    // the sim's emit). In production mesh-wire owns delivery (DataChannel with
    // sealed-relay fallback) and peek is undefined — emit sends directly.
    emit(to, m) {
      if (to == null) return;
      if (this.env.peek && !m.routing && !m.direct && to !== this.id) {
        const st = this.env.peek(to);
        if (st) {
          let directLink = false;
          if (this.hasCoord) { for (const olc of topo.ownedLinks(this.coord)) if (this.occGet(ck(olc)) === to) { directLink = true; break; } }
          if (!directLink) {
            if (this.socketed() && st.socketed) { /* relay path — both hold sockets (greeting scope): fall through */ }
            else if (st.hasCoord) { this.route(st.coord, null, m); return; }                  // deep target ⇒ route over the mesh
            else if (st.gateway != null) { const gw = this.env.peek(st.gateway); if (gw && gw.hasCoord) { this.route(gw.coord, to, m); return; } return; } // unseated target ⇒ via its gateway
            else return;                                                                      // unreachable right now ⇒ drop, caller retries
          }
        }
      }
      this.env.send(this.id, to, m);
    }
    emitRelay(key) { this.env.knock(this.id, key); }
    wake() { if (this.env.wake) this.env.wake(this.id); }

    // ---- occupancy helpers ----
    occGet(k) { const v = this.occ.get(k); return v === undefined ? null : v; }
    // a seat can be in exactly ONE place: never store MYSELF at a coord I do not
    // hold (stale self-claims circulating back made invisible zombies)
    setOcc(k, v) { if (v === this.id && (!this.hasCoord || k !== ck(this.coord))) return; if (this.occ.get(k) !== v) { this.tlForget(k, 'occ-change→' + (v == null ? 'null' : String(v).slice(0, 6))); this.born.set(k, this.TICK); } this.occ.set(k, v); }
    noteS1(k) { if (isS1key(k)) this.s1seen.set(k, this.TICK); }
    s1Fresh(k) { const it = this.s1seen.get(k); return it !== undefined && this.TICK - it < 120 && this.occ.has(k); }
    // A three-state helpers (empty / sitting-down / seated)
    softSitting(k) {
      const s = this.sitting.get(k); if (!s) return false;
      if (this.TICK - s.at > SIT_TTL) { this.sitting.delete(k); return false; }
      return true;
    }
    cellTaken(k) { return this.occ.has(k) || this.softSitting(k); }
    // Requeue/moved ghost: alive but not at k. Silent death (alive=false) stays
    // reserved for ring-hold (headless C). Unknown ids stay reserved (conservative
    // — free-ing them broke D5 sever probes). Not "merely lack first-hand".
    occIsPhantom(k) {
      const x = this.occGet(k); if (x == null) return false;
      if (this.firstHandLive(k)) return false;
      // 03c LOCAL-EVIDENCE PHANTOMS — production has no env.peek, so the
      // requeued/moved phantom detection below this block was SIM-ONLY and a
      // radio-churned member's stale occ at a row head made every greeter
      // NOROOM every seeker forever (the 03c livelock). These two rules are
      // the peek's requeued/moved semantics rebuilt from what one seat can
      // see FIRST-HAND, and agree with the peek in every honest case:
      //  (1) knock-is-evidence: the seeker of the serveFind scan in progress
      //      is AT THE DOOR by construction — an occ entry naming it is stale.
      if (this.findNc != null && x === this.findNc) return true;
      //  (2) moved-elsewhere: x is first-hand-live at a DIFFERENT cell, so
      //      the entry at k is its pre-move/pre-requeue echo. First-hand
      //      only — gossip never evicts (E2).
      for (const [k2, v2] of this.occ) if (v2 === x && k2 !== k && this.firstHandLive(k2)) return true;
      const st = this.env.peek ? this.env.peek(x) : null;
      if (!st) return false; // unknown: keep reserved
      if (!st.alive) return false; // dead without LEAVE: ring-hold reserved
      if (!st.hasCoord || ck(st.coord) !== k) return true; // requeued/moved
      return false;
    }
    admitterReachable(k) {
      const x = this.occGet(k); if (x == null || x === this.id) return false;
      if (this.firstHandLive(k)) return true;
      const st = this.env.peek ? this.env.peek(x) : null;
      if (!st || !st.alive) return false;
      return !!(st.hasCoord && ck(st.coord) === k);
    }
    // Soft or non-phantom occ. Requeue phantoms free for rejoin (atomic D).
    cellReserved(k) {
      if (this.softSitting(k)) return true;
      // A reservation needs a CLAIMANT. `live` is keyed by coord and is only
      // cleared on a LEAVE I can attribute (occGet==leaver), so a cell vacated
      // by a move — or by a LEAVE that raced my occ — stays "first-hand live"
      // for the full 60-tick window with nobody in it. Treating that as
      // reserved made empty home cells look occupied through a churn and pushed
      // seekers DEEP instead of packing shallow (compaction leg 1: byDepth 3
      // went 1 -> 51). No occ entry => no claimant => free.
      if (!this.occ.has(k)) return false;
      if (this.firstHandLive(k)) return true;
      return !this.occIsPhantom(k);
    }
    cellSeated(k) {
      if (this.hasCoord && ck(this.coord) === k) return true;
      return this.firstHandLive(k) && this.occ.has(k);
    }
    clearSoft(k) { this.sitting.delete(k); }
    markSitting(k, joiner) { this.sitting.set(k, { joiner, assigner: this.id, at: this.TICK, pingAt: -1 }); }
    confirmSeated(k, joiner) {
      // V4 SITXFER: confirming a Section-1 row HEAD I vouched hands it the
      // row's outstanding vouch ledger AND my confirmed row occ — the head
      // becomes its row's admitter the moment it seats, and without the
      // ledger it re-admits cells my in-flight (or already-confirmed)
      // admittees hold (the designated-vs-headless-soft V4 seed pair).
      const sit = this.sitting.get(k);
      const c0 = unck(k);
      const xfer = !!sit && sit.assigner === this.id && sit.joiner === joiner && c0.pc === 0 && c0.i === 0;
      this.clearSoft(k); this.setOcc(k, joiner); this.liveMark(k); this.noteS1(k);
      if (xfer) {
        const vouches = [], rowOcc = [];
        for (const [sk, ss] of this.sitting) { const sc = unck(sk); if (sc.pc === 0 && sc.r === c0.r && ss.assigner === this.id) vouches.push({ k: sk, v: ss.joiner }); }
        for (let j = 0; j < C(); j++) { const rk = ck({ pc: 0, r: c0.r, i: j }); const x = this.occGet(rk); if (x != null && rk !== k) rowOcc.push({ k: rk, v: x }); }
        this.emit(joiner, { t: 'SITXFER', ck: k, id: joiner, vouches, rowOcc });   // an EMPTY ledger is still the authority-handover signal
      }
    }
    // CHECK-BACK (law A tightened, 2026-08-02 — the ghost-churn fix): the
    // recheck at SIT_RECHECK now actually FREES a vouch that was never
    // answered. A live joiner is always HEARD within a couple of beats of its
    // PLACE (its CLAIM or HELLO lands, or its first PHONE beat at +8 ticks);
    // a tab killed mid-placement is never heard at all. 25 ticks of total
    // silence after my own PLACE means my vouch is dead — holding the chair
    // the full SIT_TTL (90) let six killed tabs wall off the whole home row
    // and strand every real newcomer behind it. Freeing also clears the
    // cell's healTry admission stamp: a freed chair is admissible NOW, not 45
    // ticks after its dead admittee's own admission.
    recheckSitting() {
      if (!this.sitting.size) return;
      const del = [];
      for (const [k, s] of this.sitting) {
        if (s.assigner !== this.id) continue;
        if (this.occGet(k) === s.joiner && this.firstHandLive(k)) { del.push(k); continue; }
        if (this.TICK - s.at < SIT_RECHECK) continue;
        // V4 PROBE-GATED CHECK-BACK (confirmed absence, the ghost-law
        // discipline): "never heard in 25 ticks" is NOT evidence of death —
        // at the mass-join storm a live admittee's CLAIM to a deep placer is
        // routinely lost or slow (a j>0 child has no owned up-link, so CLAIM
        // rides the mesh), and freeing on that lagged view let the SAME
        // placer re-place the cell. So falsify first-hand: SITPING the
        // admittee itself. A live one answers (its pong is a re-CLAIM for
        // exactly the vouched cell, no other payload — the 2026-08-02 probe
        // was rejected because its ROUTED answer re-seeded occ and fanned
        // HELLOs); a killed tab never does, and the chair frees at
        // 25+15=40 ticks — inside the ghost-churn budget that the rejected
        // free-at-50 missed. Freed on SILENCE ⇒ the chair re-enters the
        // 45-tick admission cooling instead of "admissible NOW".
        if (this.occGet(k) !== s.joiner && !this.firstHandLive(k)) {
          if (s.pingAt == null || s.pingAt < 0) { s.pingAt = this.TICK; this.emit(s.joiner, { t: 'SITPING', ck: k, id: s.joiner, from: this.id }); continue; }
          if (this.TICK - s.pingAt < SIT_PING_WAIT) continue;
          del.push(k); this.healTry.set(k, this.TICK);
          continue;
        }
        if (this.TICK - s.at >= SIT_TTL) {
          del.push(k); this.healTry.set(k, this.TICK);   // V4: TTL is also a silence-free — cool before re-admission
          if (this.occGet(k) === s.joiner && !this.firstHandLive(k)) {
            this.occ.delete(k); this.live.delete(k); this.s1seen.delete(k);
            this.kidful.delete(k); this.tlForget(k, 'sit-ttl'); this.healTry.delete(k);
          }
        }
      }
      for (const k of del) this.sitting.delete(k);
    }
    // E2 FIRST-HAND liveness: `live` is set ONLY by direct contact — a PHONE I
    // answered (onPhone), a HELLO/CLAIM its occupant sent me, a PONG from a rook
    // neighbour. GOSSIP (S1SYNC) never sets it. So firstHandLive is the ONLY
    // signal that may evict/tie-break: a phantom (a stale gossip echo of a seat
    // that has moved) is NOT first-hand live, so it can never yield a live
    // healer out of a hole. Echo-immune — gossip informs routing, never liveness.
    liveMark(k) { this.live.set(k, this.TICK); this.fhEver.add(k); }
    firstHandLive(k) { const it = this.live.get(k); return it !== undefined && this.TICK - it <= 60; }
    // ---- D5 EARLY-PROBE intake (transport loss is FIRST-HAND evidence) ------
    // transportLost(pid): MY DataChannel / peer connection to `pid` just died —
    // my own direct observation (the transport layer calls this; gossip never
    // can). It evicts NOBODY by itself: it only registers the observation and
    // fires the EXISTING confirm probe immediately, so the probe-gated death
    // confirmation (D4/H1-S1) can start now instead of after the silence
    // horizon. Edge-triggered per coord — one probe burst per transition, so a
    // flapping link cannot generate probe storms.
    transportLost(pid) {
      if (!this.hasCoord || this.state !== 3 || pid == null || pid === this.id) return;
      for (const olc of topo.ownedLinks(this.coord)) {
        const k = ck(olc);
        if (this.occGet(k) !== pid) continue;
        // STALE-EDGE REVALIDATION — PRODUCTION EXTENSION (same class as
        // heardFrom below; the sim's transports never flap, so mesh.cpp can't
        // express this). A translost registered during an earlier link blip
        // can STAND while the occupant lives on: the confirm verdict is only
        // polled once the occupant stops looking alive, so nothing ever
        // forgets the stale entry — and its edge-guard then EATS the next
        // real death observation (caught live 2026-07-28: victim killed,
        // survivor's translost stood from a setup-era blip, kill-time call
        // skipped here, first poll forgot the stale entry via pre-kill
        // contact, and the seat freed only via the 12s starve re-arm). A
        // standing entry already DISPROVEN by contact since it was set is not
        // an armed edge — it is garbage; clear it and let the fresh
        // observation register. Real standing edges still suppress re-fires:
        // no probe storms.
        if (this.translost.has(k)) {
          const old = this.translost.get(k);
          const lv = this.live.get(k), pa = this.probeAck.get(k);
          if ((lv !== undefined && lv >= old) || (pa !== undefined && pa >= old)) this.tlForget(k, 'stale-reval');
          else continue;
        }
        this.translost.set(k, this.TICK); this.tlProbeAt.set(k, this.TICK);
        this.routeToProbe(olc); // probe NOW — across the mesh, not the dead link
      }
      this.wake();
    }
    // translostConfirmed(k): the early-confirm verdict. TRUE only when a first-
    // hand transport loss is registered for k AND the probe has gone unanswered
    // on every mesh path for the settled EARLY_HOLD window. ANY answer since the
    // loss — first-hand contact (live) or a probe answer (probeAck) — clears the
    // observation and re-arms the edge trigger: their link to me died; they may
    // be fine (the probe travels the mesh, not the dead link). While pending it
    // keeps re-probing every ~6 ticks (the first probe can be lost).
    translostConfirmed(k) {
      const at = this.translost.get(k); if (at === undefined) return false;
      const lv = this.live.get(k), pa = this.probeAck.get(k);
      // BOTH evidence channels are STRICT (>) — PRODUCTION EXTENSION
      // (tick-boundary causality; the sim's harness reports a loss ticks
      // after the last frame, so mesh.cpp never faces this). "Evidence since
      // the loss" must mean a STRICTLY LATER tick: a 500ms tick routinely
      // holds the victim's death, the relay's socket-death broadcast, AND the
      // victim's in-flight frame tail (frames authored before death, still
      // crossing the relay after it — §HEARD's heardFrom stamps probeAck for
      // those; caught live 2026-07-28: 'pa:heardFrom' at the registration
      // tick forgot the observation one tick later — the vanish stall
      // lottery: same-tick → starve fallback ~20-25s; next-tick → 7s). A
      // genuinely alive peer produces evidence EVERY tick — one strict tick
      // costs it nothing; a dead one's tail can never span two.
      if ((lv !== undefined && lv > at) || (pa !== undefined && pa > at)) { this.tlForget(k, 'evidence lv=' + lv + ' pa=' + pa + ' at=' + at); return false; }
      const pAt = this.tlProbeAt.get(k);
      if (pAt === undefined || this.TICK - pAt >= 6) { this.tlProbeAt.set(k, this.TICK); this.routeToProbe(unck(k)); }
      return this.TICK - at > EARLY_HOLD;
    }
    tlForget(k, why) { if (this.translost.has(k)) { this.tlLog.push([k, this.TICK, why || '?']); if (this.tlLog.length > 24) this.tlLog.shift(); } this.translost.delete(k); this.tlProbeAt.delete(k); this.probeAck.delete(k); }
    tlClear() { this.translost.clear(); this.tlProbeAt.clear(); this.probeAck.clear(); }
    // heardFrom(pid) — PRODUCTION EXTENSION (Nathan-blessed 2026-07-28; no
    // sim counterpart — the sim's transports never half-die). ANY sealed
    // end-to-end frame from a peer is liveness evidence, whatever path
    // carried it: WebRTC signaling mid-rebuild is the load-bearing case. A
    // 2-person pair whose reform lost the race against the D5 confirm used
    // to FORK the room — both sides compacted to lone roots, and forks only
    // heal by a human pick no standing member ever sees. The peer's own
    // authored frames were streaming past the death clock the whole time.
    // Same evidence class as a probe answer (the frame may TRANSIT the
    // relay, but the relay authors nothing — this is not a relay vouch);
    // clears any standing translost and feeds the silence horizon.
    // NARROW ON PURPOSE (redun-drill bisect, 2026-07-28 eve): the first cut
    // stamped live+probeAck on EVERY frame, which made ordinary app traffic
    // count as full first-hand SEAT evidence — and that perturbed decisions
    // far beyond the fork fix (stage redundancy lost its stg spares:
    // stdPipes 2/2 → 0/0 deterministic; green again with this gate). The
    // fork-killer needs exactly one thing: evidence SINCE A STANDING LOSS
    // clears the confirm — translostConfirmed's own rule. A healthy pair's
    // mesh frames already keep `live` fresh through the normal intake.
    heardFrom(pid) {
      if (!this.hasCoord || pid == null || pid === this.id) return;
      for (const olc of topo.ownedLinks(this.coord)) {
        const k = ck(olc);
        if (this.occGet(k) !== pid || !this.translost.has(k)) continue;
        this.probeAck.set(k, this.TICK); this.tlLog.push([k, this.TICK, 'pa:heardFrom']); if (this.tlLog.length > 24) this.tlLog.shift();
      }
    }
    // WIRE-ONLY (no sim counterpart — the sim has no device-local network).
    // Called at BOTH edges of the device's own network dying/returning:
    // silence observed while WE were dark is not evidence about anyone
    // (D5's "unreachable on every path" presumes the paths were ours to
    // try). Drop every silence-derived observation and hole timer; fresh
    // reality re-derives real ones within a beat. Without this, the latched
    // dark-era observations fired on resume and a lone survivor CONFIRMED
    // its whole row dead and healed itself into 0/0.0 — a seated self-mint
    // fragment (behavior battery 06c, 2026-07-26).
    netHold() { this.tlClear(); this.holeSince.clear(); this.lastAck = this.TICK; }
    // tlSweep — D5 cleanup at EVERY observer (D3's "a corpse stops riding
    // rosters", started early): once my own observation CONFIRMS (probe
    // unanswered on every path past the early window), the corpse leaves MY
    // occ/roster view even when I am not the designated healer — healing stays
    // exclusively the healer's (C3); this deletes a view, never fills a seat.
    // The standing translost then keeps gossip echoes from re-seating the
    // corpse until the cell genuinely refills (setOcc/admit clear it).
    tlSweep() {
      if (!this.translost.size) return;
      for (const k of Array.from(this.translost.keys())) {
        if (!this.translostConfirmed(k)) continue;
        if (this.occ.has(k)) {
          const pid = this.occ.get(k);
          if (pid != null && pid !== this.id) { this.d5Deaths.push([k, pid, this.TICK]); if (this.d5Deaths.length > 24) this.d5Deaths.shift(); }
          this.occ.delete(k); this.live.delete(k); this.kidful.delete(k); this.s1seen.delete(k); this.healTry.delete(k); // freed ⇒ admissible now (healTry is heal pacing, not a chair embargo)
        }
      }
    }
    drainD5() { const out = this.d5Deaths; this.d5Deaths = []; return out; } // consume-once: a stale verdict must not re-kill a returned peer
    ownedRowHead() { return { pc: topo.childPath(this.coord.pc, this.coord.i), r: this.coord.r, i: 0 }; }
    rosterCells() { const h = this.ownedRowHead(); const out = []; for (let c = 0; c < C(); c++) out.push({ pc: h.pc, r: h.r, i: c }); return out; }
    // Do I hear ANY rook neighbour (row/col/down) first-hand? An S1 seat that
    // hears NONE for a long time is an isolated fragment — it can neither phone
    // (heartbeat is occ-gated) nor route-probe (no link), so E2 can't yield it.
    anyRookLive() {
      if (!this.hasCoord || this.coord.pc !== 0) return false;
      for (const m of topo.rowMates(this.coord)) if (this.firstHandLive(ck(m))) return true;
      for (const m of topo.colMates(this.coord)) if (this.firstHandLive(ck(m))) return true;
      return this.firstHandLive(ck(topo.down(this.coord)));
    }
    // 11a FRONTIER-ONLY ADMISSION: admit a newcomer only into a TRUE frontier
    // slot — a free cell whose down-child is NOT occupied. A free cell that
    // still owns a subtree is an INTERNAL hole: its fixed healer (that
    // down-child, VERTICAL) is already filling it; a newcomer there would
    // double-book, lose the race, requeue OUT, and leave a gossip phantom
    // permanently blocking refill (bug #2). Skip it; serveFind forwards deeper.
    firstFreeInRoster() {
      // V4 THE DEPTH WALL: the C++ twin's uint32 path overflows at depth 13
      // and silently aliases cells; the wall is enforced in BOTH twins so
      // they cannot diverge there (a depth-12 stadium is ~2 billion sections
      // — reaching the 13th floor is a dup-war signature, not a need).
      if (topo.pcDepth(this.coord.pc) >= 12) return null;
      // V4 wave 2: deep admission reads the SAME phantom-aware reservation as
      // the S1 scan (cellReserved, not raw cellTaken) — stale dup-war occ
      // echoes are never falsified down here (no s1Fill, no designated-arm
      // phantom clear), and raw occ let parents sit on free child rows
      // forever while joiners funneled into the depth wall (the N=2000
      // plateau livelock).
      for (const rc of this.rosterCells()) {
        const k = ck(rc);
        if (this.cellReserved(k)) continue;
        const dk = ck(topo.down(rc));
        if (this.cellReserved(dk) && !this.occIsPhantom(dk)) continue;
        if (this.softSitting(dk)) continue;
        // V4: deep admissions honor the same 45-tick cooling as S1 — a
        // silence-freed chair is not "admissible NOW".
        const ht = this.healTry.get(k);
        if (ht != null && this.TICK - ht <= 45) continue;
        return rc;
      }
      return null;
    }
    ownerCoord() { if (!this.hasCoord || this.coord.pc === 0) return null; return topo.up({ pc: this.coord.pc, r: this.coord.r, i: 0 }); }
    ownerId() { if (!this.hasCoord) return null; const u = topo.up({ pc: this.coord.pc, r: this.coord.r, i: 0 }); if (!u) return null; return this.occGet(ck(u)); }
    hasChildren() { for (const rc of this.rosterCells()) { const x = this.occGet(ck(rc)); if (x != null && x !== this.id) return true; } return false; }
    // 11a: does cell c own an OCCUPIED down-child (so its fixed healer is that
    // down-child, the VERTICAL rule — the right-neighbour must then DEFER)?
    // Known either directly (I link down(c)) or via childOf learned from PONGs.
    hasDownChild(c) { if (this.occGet(ck(topo.down(c))) != null) return true; const it = this.childOf.get(ck(c)); return it !== undefined && it != null; }
    // Random pick spreads door load (the doctrine) — but never re-pick a
    // target that has already proven SILENT this join (a dark member's cell
    // costs a full retry window per void FIND; at N=2+dark that stalled half
    // of all joins — behavior battery 14a, 2026-07-26). Any answer from a
    // target lifts the mark; when everyone is marked, fall back to the full
    // set (an all-dark roster still retries honestly).
    // TODO(sim parity): port triedSilent to test/sim/mesh.cpp — same rule.
    // DOOR-LISTED FIRST (2026-08-02, the fresh-corpse ask): a roster can
    // name a JUST-DEPARTED seat that is still s1Fresh at the greeter (its
    // LEAVE lost, its transport death not yet registered), and one silent
    // ask costs the seeker its whole retry window (the e2e serial-guests
    // "~23s clustering"). The seeker's own last GREETERS list is FRESH DOOR
    // TRUTH — it just knocked — and a pool entry dies WITH its socket, so a
    // fresh corpse is absent while every live S1 seat is present. Prefer
    // targets the door lists; fall back to the plain roster when the
    // intersection is empty. In a healthy room the intersection IS the
    // roster, so the pick distribution — and the door-load spread — are
    // unchanged. (Every stronger shape was tried and failed a pinned
    // battery: gateway-always livelocked mass rejoin at 29/400; gateway-
    // until-refused re-asked a slow admitter into twin-PLACE dups; gateway-
    // first-ask-only moved partition seed 29 into a split-brain draw.)
    pickRoster() {
      const liveIds = []; const fresh = []; const door = [];
      for (const e of this.roster) if (e.v !== this.id) {
        liveIds.push(e.v);
        if (!this.triedSilent || !this.triedSilent.has(e.v)) {
          fresh.push(e.v);
          if (this.lastGreeters && this.lastGreeters.includes(e.v)) door.push(e.v);
        }
      }
      const pool = door.length ? door : (fresh.length ? fresh : liveIds);
      if (!pool.length) return null;
      return pool[(this.rng() * pool.length) | 0];
    }
    // A standing-translost occupant is UNREACHABLE-PENDING-PROBE: handing it to
    // a newcomer as a gateway/FIND target wastes their whole retry window (the
    // honest answer is silence, not a corpse). Root cause of the unban-rejoin
    // wedge (2026-07-29): a banned member's seat sat in the survivor's HOME
    // roster between translost and the D5 confirm, the newcomer coin-flipped
    // onto the corpse, and the void FIND cost the full state-2 window.
    s1Roster() { const out = []; if (this.hasCoord && this.coord.pc === 0) out.push({ k: ck(this.coord), v: this.id }); for (const [k, v] of this.occ) if (isS1key(k) && v !== this.id && this.s1Fresh(k) && !this.translost.has(k)) out.push({ k, v }); return out; }

    // ---- S4 identity hook (seam) --------------------------------------------
    // verifyFill(msg): is this occupancy-changing frame (PLACE / CLAIM /
    // FINDLEAF) from a source authorized to author it? The C3 STRUCTURE (one
    // fixed healer per hole) serializes fills; S4 identity (mesh-identity.js)
    // makes WHO the healer is unforgeable, so a forged peer id can't capture a
    // seat, race a turnover, or climb.
    //
    // Ed25519 verification is done at the boundary that owns transport+crypto
    // (mesh-wire.js in production, the harness fabric in tests), which verifies
    // the fill's signature against the TOFU-pinned participant key BEFORE
    // delivering and stamps the verdict as m.s4ok. This seam is FAIL-CLOSED with
    // NO escape: an occupancy-authoring fill is accepted ONLY if its signature
    // was verified. There is no "S4 off" — every real and every test node runs
    // identities. An unsigned/forged/tampered fill is dropped, full stop.
    verifyFill(msg) { return msg.s4ok === true; } // S4: fail-closed, no bypass

    // ---- entry (R1/R3/R4) ----
    // NEWCOMER knock: present my THROWAWAY key. If I'm first I mint genesis;
    // else I learn the real key via the dance and re-present it once seated.
    join() {
      // ENTRY-PACING INVARIANT: a paced-out (same-tick) join defers the SEND,
      // never the STATE. A requeue() whose join() got paced out used to return
      // with hasCoord=false but state still 3 — and tick()'s state-3 branch
      // never consumes reJoin, so the seat wedged forever: seated-looking,
      // coordless, knocking never (behavior 04a: a 20s radio blip left one
      // phone solo for 3.5 minutes; the netDark tick-freeze lets a whole
      // rescue→rejoin→rescue dance share ONE tick at the radio-on edge).
      if (this.joinTick === this.TICK) { if (!this.hasCoord) { this.state = 0; this.retryAt = this.TICK; } this.reJoin = true; this.wake(); return; } // ENTRY PACING: one knock per tick
      this.joinTick = this.TICK;
      this.state = 0; this.retryAt = this.TICK; this.haveRoster = false;
      this.resumeTries = 0; // ENTRY RESUME: a fresh knock re-arms the knockless-retry budget
      this.triedSilent = new Set(); // per-join-attempt silent-target marks (pickRoster)
      this.forkProbe = false; this.forkPaused = false; this.forkSamples = [];
      this.forkOpts = new Map(); this.forkPending = 0;
      if (this.joinStart < 0) this.joinStart = this.TICK;
      this.emitRelay(this.myKey); this.wake();
    }
    askSeat(target) { if (this.askTick === this.TICK) { if (!this.hasCoord) { this.state = 2; this.retryAt = this.TICK; } this.reAsk = true; this.wake(); return; } this.askTick = this.TICK; this.state = 2; this.retryAt = this.TICK; (this.triedSilent = this.triedSilent || new Set()).add(target); this.lastAsked = target; this.emit(target, { t: 'FIND', nc: this.id, ttl: 200 }); this.wake(); } // ENTRY PACING: one ask per tick (paced-out ⇒ defer the SEND, never the STATE — see join())
    // ENTRY RESUME (2026-08-04 plane incident; test/tools/seat-flap-repro.js).
    // The dance is three door round trips — knock→GREETERS, WHOHOME→HOME,
    // FIND→PLACE — and a retry used to restart it from the knock, so a socket
    // whose continuous up-windows were shorter than the WHOLE dance never
    // seated (measured: at a fixed 33% uptime, 100s windows seat in 5.5s;
    // 1.5s windows never seat) — while an already-established media pc kept
    // streaming, needing zero round trips. Video without a seat, for hours.
    // A retry that still HOLDS a fresh greeter list re-enters at the WHOHOME
    // step instead of re-knocking: each up-window then has to carry only ONE
    // round trip, and the dance ratchets forward across socket deaths.
    // Bounds, so a stale list can never trap the entrant:
    //   - the list is trusted only for RELAY_TTL — the registry's own entry
    //     lifetime; beyond that we can't know the doors are still doors;
    //   - each list entry is tried ONCE per join attempt (the same triedSilent
    //     silent-until-answered marks the classic path uses); a dead list
    //     costs one WHOHOME per entry and then the next retry re-knocks;
    //   - fork handling is untouched: a resume never runs while a fork probe
    //     or pick-one pause is live, and R5 cluster detection stays where it
    //     was — on fresh GREETERS replies. A fork born after our knock waits
    //     one RELAY_TTL; forks are rare and human-gated, entry is constant.
    resumeAsk() {
      if (this.forkProbe || this.forkPaused) return false;
      const ls = this.lastGreeters;
      if (!ls || !ls.length) return false;
      if (this.greetersAt === undefined || this.TICK - this.greetersAt > RELAY_TTL) return false;
      const tried = this.triedSilent = this.triedSilent || new Set();
      let pool = ls.filter((g) => g && g !== this.id && !tried.has(g));
      // The silent marks say "its HOME never landed" — but on a flapping
      // socket that is usually OUR flap eating the reply, not a dark greeter
      // (the exact confusion this path exists to survive: a 1-greeter room
      // marks its only door on the first WHOHOME and resume would then never
      // fire twice). So when the marks exhaust the list, cycle it again —
      // but only RESUME_TRIES consecutive times without a HOME, so a
      // genuinely dead list concedes to a fresh knock, never a livelock.
      if (!pool.length) {
        if ((this.resumeTries || 0) >= 6) return false; // mirrors seatTries<=6
        pool = ls.filter((g) => g && g !== this.id);
        if (!pool.length) return false;
      }
      this.resumeTries = (this.resumeTries || 0) + 1; // cleared by join() and by a landed HOME — any real progress re-arms the budget
      const g = pool[(this.rng() * pool.length) | 0];
      tried.add(g); // silent until its HOME lands — same mark the knock path sets
      this.gateway = g;
      this.emit(g, { t: 'WHOHOME', from: this.id, ttl: 60 });
      this.state = 1; this.retryAt = this.TICK;
      this.wake();
      return true;
    }
    // Faces for pick-one UI: Stage first, else Stadium, else S1 roster peers.
    static forkFaceList(sample) {
      if (sample.stage && sample.stage.length) return { tier: 'stage', faces: sample.stage.slice(0, 12) };
      if (sample.stadium && sample.stadium.length) return { tier: 'stadium', faces: sample.stadium.slice(0, 12) };
      return { tier: 'roster', faces: (sample.faces || []).slice(0, 12) };
    }
    // Peer-id set from a HOME roster [{k,v}|id, …].
    static rosterPeers(roster) {
      const s = new Set();
      for (const e of roster || []) {
        const v = e && (e.v != null ? e.v : e);
        if (v != null && v !== '') s.add(String(v));
      }
      return s;
    }
    // Jaccard-ish: any shared peer ⇒ same cluster; else separate (torn halves).
    static rostersOverlap(a, b) {
      if (!a.size || !b.size) return false;
      for (const p of a) if (b.has(p)) return true;
      return false;
    }
    // Same room seen through two doors, or two real rooms? Different gkey is
    // ALWAYS two rooms (the crypto key IS the room). Same gkey splits ONLY on
    // POSITIVE disjointness evidence — because two doors of ONE healthy room
    // can look disjoint when instance ids churned (both phones reloaded: each
    // roster still carries the other's dead old id) or when S1 freshness
    // lapsed (roster = just me). A false fork throws the pick-one modal at a
    // healthy room, and a headless client parked there is indistinguishable
    // from a dead door (the 2026-07-26 monitor wedge). So, same gkey:
    //   · any shared roster id            ⇒ same room (the classic rule)
    //   · any shared Stage/Stadium FACE   ⇒ same room (app-layer display
    //     identities survive instance-id churn; a real torn half can't hold
    //     the same live person as the other half)
    //   · a BLIND door (roster names nobody beyond its own greeter) ⇒ merge —
    //     "I can't vouch for my row right now" is ignorance, not evidence of
    //     a separate room. A genuinely lone torn seat self-rescues via the
    //     fragment requeue path; it never needs a newcomer's pick to survive.
    static forkSameRoom(a, b) {
      if (a.gkey !== b.gkey) return false;
      if (Seat.rostersOverlap(a.peers, b.peers)) return true;
      for (const f of a.facesAll) if (b.facesAll.has(f)) return true;
      const blind = (c) => { for (const p of c.peers) if (!c.gws.has(p)) return false; return true; };
      return blind(a) || blind(b);
    }
    // Cluster HOME samples: different gkey always split; same gkey splits only
    // on positive disjointness evidence (forkSameRoom). Fixpoint merge — a
    // later sample may bridge two earlier clusters.
    clusterForkSamples(samples) {
      const clusters = []; // each: { gkey, gateway, roster, stage, stadium, peers, gws, facesAll }
      const absorb = (c, s) => {
        for (const p of s.peers) c.peers.add(p);
        for (const g of s.gws) c.gws.add(g);
        for (const f of s.facesAll) c.facesAll.add(f);
        if ((s.stage || []).length > (c.stage || []).length) c.stage = s.stage;
        if ((s.stadium || []).length > (c.stadium || []).length) c.stadium = s.stadium;
        if ((s.roster || []).length > (c.roster || []).length) { c.roster = s.roster; c.gateway = s.gateway; }
      };
      for (const s of samples) {
        const proto = {
          gkey: s.gkey, gateway: s.gateway, roster: s.roster,
          stage: s.stage || [], stadium: s.stadium || [],
          peers: Seat.rosterPeers(s.roster),
          gws: new Set(s.gateway != null ? [String(s.gateway)] : []),
          facesAll: new Set([...(s.stage || []), ...(s.stadium || [])].map(String)),
        };
        const hit = clusters.find((c) => Seat.forkSameRoom(c, proto));
        if (hit) absorb(hit, proto); else clusters.push(proto);
      }
      for (let again = true; again;) {
        again = false;
        for (let i = 0; i < clusters.length && !again; i++) {
          for (let j = i + 1; j < clusters.length; j++) {
            if (Seat.forkSameRoom(clusters[i], clusters[j])) {
              absorb(clusters[i], clusters[j]); clusters.splice(j, 1); again = true; break;
            }
          }
        }
      }
      return clusters.map((c, i) => {
        const fl = Seat.forkFaceList(c);
        const id = String(c.gkey) + '#' + i + '#' + String(c.gateway || i);
        return {
          id, gkey: c.gkey, gateway: c.gateway, roster: c.roster,
          stage: c.stage || [], stadium: c.stadium || [],
          faces: fl.faces, tier: fl.tier, n: c.peers.size || fl.faces.length,
        };
      });
    }
    // R5: after multi-greeter HOMEs, one cluster → seat; two+ → pick-one.
    maybeResolveFork() {
      if (!this.forkProbe || this.forkPaused || this.state !== 1) return;
      const TICK = this.TICK;
      const ready = this.forkPending <= 0 || (this.forkAt >= 0 && TICK - this.forkAt >= 30);
      if (!ready && this.forkSamples.length < 2) return;
      if (this.forkSamples.length === 0) {
        if (ready) { this.forkProbe = false; this.retryAt = TICK - 10; }
        return;
      }
      const opts = this.clusterForkSamples(this.forkSamples);
      this.forkOpts = new Map(opts.map((o) => [o.id, o]));
      if (opts.length === 1) { this.acceptFork(opts[0]); return; }
      // Two+ clusters (multi-genesis OR same-key torn greeter halves).
      this.forkProbe = false; this.forkPaused = true;
      if (typeof this.env.onFork === 'function') {
        this.env.onFork(opts.map((o) => ({
          id: o.id, gkey: o.gkey, gateway: o.gateway,
          faces: o.faces, tier: o.tier, n: o.n,
          stage: o.stage, stadium: o.stadium,
        })));
      } else {
        // No UI: deterministic — prefer lowest gkey, then lowest option id.
        opts.sort((a, b) => (a.gkey < b.gkey ? -1 : a.gkey > b.gkey ? 1 : a.id < b.id ? -1 : 1));
        this.acceptFork(opts[0]);
      }
    }
    // Human (or sim) chose one option id (or legacy gkey if unique). Never merge.
    chooseFork(idOrGkey) {
      if (!this.forkPaused) return false;
      let o = this.forkOpts.get(String(idOrGkey));
      if (!o) {
        // allow chooseFork(gkey) when only one option has that gkey
        const hits = [...this.forkOpts.values()].filter((x) => x.gkey === String(idOrGkey));
        if (hits.length === 1) o = hits[0];
      }
      if (!o) return false;
      this.acceptFork(o);
      return true;
    }
    acceptFork(o) {
      this.forkPaused = false; this.forkProbe = false; this.forkPending = 0;
      this.genKey = o.gkey;
      this.gateway = o.gateway;
      this.roster = o.roster;
      this.haveRoster = true;
      this.lastReach = this.TICK;
      this.seatTries = 0;
      this.state = 1;
      const t = this.pickRoster();
      if (t != null) this.askSeat(t);
      else this.retryAt = this.TICK - 10;
      this.wake();
    }

    take(c, owner, nbrs) {
      if (c.i >= C() || c.r >= C()) return;   // sanity: never take a malformed coord
      this.rowLedger = !(c.pc === 0 && c.i === 0 && owner != null);   // V4: an admitted S1 row head waits for its assigner's SITXFER
      this.coord = c; this.hasCoord = true; this.state = 3; this.joinStart = -1; this.stranded = false; this.reAsk = false; this.reJoin = false; // seated: any deferred entry retry is moot
      // A: self-confirm sitting-down → seated (only the joiner upgrades).
      this.confirmSeated(ck(c), this.id);
      for (const kv of nbrs) if (!this.occ.has(kv.k)) { this.setOcc(kv.k, kv.v); this.noteS1(kv.k); }
      this.drainAt = 0; this.seatTries = 0; this.seatedAt = this.TICK; this.rookSeenAt = this.TICK;
      // § G: a seat change re-parents me — new aggregator, new scope, new child
      // row. Every digest relationship starts over, including G4's grace
      // window; carrying the old one over would accuse a brand-new aggregator
      // of suppressing reports it never received. The ring's CONTENTS too: a
      // retained pre-move record collides with my cell's PREVIOUS occupant's
      // stamp and reads as a forged echo (sim: 10 false fires at N=600).
      // (Display state only — nothing here can move a seat.)
      this.upLogI = 0; this.upSince = -1; this.lastAgg = null; for (let q = 0; q < 16; q++) this.upLog[q] = { at: -1, n: 0, refuse: 0 };
      this.downDig = dig0(); this.downUsed = dig0(); this.myDig = dig0(); this.rowDig = dig0(); this.rootDig = dig0();
      this.rowKids.clear(); this.rowUsed.clear(); if (c.pc !== 0) this.s1tab.clear();
      this.lastAck = this.TICK; this.lastPhone = this.TICK;
      if (owner != null) this.emit(owner, { t: 'CLAIM', ck: ck(c), id: this.id });
      if (c.pc === 0) { this.s1CheckAt = this.TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0); this.emitRelay(this.genKey); } // E3: a Section-1 seat registers as a greeter on seating
      this.announce(); this.wake();
    }
    announce() {
      const seen = new Set();
      for (const olc of topo.ownedLinks(this.coord)) {
        const lk = ck(olc); let x = this.occGet(lk);
        if (x == null && this.softSitting(lk)) { const s = this.sitting.get(lk); if (s) x = s.joiner; }
        if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'HELLO', ck: ck(this.coord), id: this.id }); }
      }
    }

    admit(c, f) {
      const nc = f.nc;
      const k = ck(c);
      this.tlForget(k, 'refill'); // the cell genuinely refills — any standing D5 observation of the old occupant ends here
      const nbrs = []; const ol = topo.ownedLinks(c);
      for (const olc of ol) { const x = this.occGet(ck(olc)); if (x != null && x !== nc) nbrs.push({ k: ck(olc), v: x }); }
      // ALWAYS teach the admittee its ADMITTER (2026-08-02) — not only when
      // the admitter happens to be an owned-link. A deep non-head admittee
      // whose admitter is the SECTION OWNER learned nothing about it, so
      // when that admittee later became the head's LEFT-PACK healer it
      // promoted itself into the head hole with an EMPTY nbrs list:
      // take(hole, null, []) sends no CLAIM, the no-neighbour claim window
      // confirms SAME-TICK, and the promoted head is an ISLAND — empty occ,
      // no phone target, invisible to the owner, whose stale head-occ then
      // re-admits another seat behind it. Two seats oscillated head↔row-cell
      // forever, sampling as a duplicate (c-sweep C=5 0.30×2 seed 1). The
      // entry is truthful (the admitter at its real coord) — it can only
      // inform.
      let selfNb = false; for (const olc of ol) if (ck(olc) === ck(this.coord)) selfNb = true;
      if (!selfNb && this.hasCoord) nbrs.push({ k: ck(this.coord), v: this.id });
      if (selfNb) nbrs.push({ k: ck(this.coord), v: this.id });
      const m = { t: 'PLACE', coord: c, owner: this.id, nbrs, tag: f.tag, nc };
      // Q2 compaction (tag==1): reserve with occ. Newcomer: soft sitting-down only
      // (loss wedge — never permanent occ without self-confirm).
      if (f.tag === 1) {
        this.occ.set(k, nc); this.noteS1(k);
        this.route(f.coord, null, m);
      } else {
        this.markSitting(k, nc);
        this.emit(nc, m); this._gspReplay(nc);
      }
    }
    serveFind(mm) {
      const TICK = this.TICK;
      if (!this.hasCoord || mm.ttl <= 0) { this.emit(mm.nc, { t: 'NOROOM' }); return; }
      if (this.coord.pc === 0) {
        // H7 ROW-FILL seating (replaces the old column backfill): Section 1
        // fills ROW-MAJOR — row 0 seats 0..C-1, then row 1, ... — so the first
        // C people in a room are ROW-MATES (the media plane's near field is
        // row-scoped: a 2-person meeting must be a direct conversation, never
        // column-mates). Admission keeps the C3 fixed-designation discipline:
        // every S1 cell has ONE designated admitter —
        //   (0,t,j>0): its row head (0,t,0);
        //   (0,t,0):   the head of the row ABOVE, (0,(t-1+C)%C,0) — the old H7
        //              seat relation inverted (growth seeds DOWNWARD row by
        //              row; the wrap still lets ordinary arrival traffic
        //              resurrect a fully-dead row, H7's original purpose).
        // Scan row-major for the first admissible cell: free AND a true
        // FRONTIER (11a: a free cell with a live down-child is an INTERNAL
        // hole owned by its fixed healer, the VERTICAL down-child — admitting
        // there would race it and mint a phantom). Admit if I am the cell's
        // designated admitter, else hand the FIND to the admitter — my row
        // head or a fellow head, a rook link; and every S1 seat is a socketed
        // greeter, so the hand-off is always deliverable.
        // Row liveness, FIRST-HAND-FIRST: my OWN row is live because I AM IN
        // IT — a lone survivor's s1seen of its own cells decays (nobody phones
        // a lone seat), and without this a survivor would resurrection-scan
        // its own live row and seat a 2-person room as COLUMN-mates (the
        // headless-row repro, leg A). Computed up front for all rows: the
        // headless-row devolution below needs the ADMITTER's row too.
        const rowLive = [], rowSeen = [], rowHeld = [];
        for (let t = 0; t < C(); t++) {
          rowLive[t] = (this.coord.r === t); rowSeen[t] = rowLive[t]; rowHeld[t] = false;
          for (let j = 0; j < C(); j++) { const k = ck({ pc: 0, r: t, i: j }); if (this.s1Fresh(k)) rowLive[t] = true; if (this.s1seen.has(k)) rowSeen[t] = true; if (this.cellReserved(k)) rowHeld[t] = true; }
        }
        for (let t = 0; t < C(); t++) {
          // A + H7 (HARDENED 2026-08-02): do NOT start the next S1 row until
          // the previous row is fully OCCUPIED — confirmed seats, not
          // reservations. A row of soft sitting-down marks is a row of
          // vouches nobody has answered yet: seating a newcomer BEHIND it
          // gambles that every one of them confirms, and when they are killed
          // tabs (the ghost-churn repro) the newcomer lands in an empty row
          // with zero live links — a fragment that can pull neither snap nor
          // app from anyone. NOROOM is the honest answer while the previous
          // row settles. (The old gate counted cellTaken — occ OR soft — and
          // only refused a soft HEAD.)
          if (t > 0) {
            let prevFull = true;
            for (let j = 0; j < C(); j++) if (!this.occ.has(ck({ pc: 0, r: t - 1, i: j }))) { prevFull = false; break; }
            if (!prevFull) break;
          }
          const liveRow = rowLive[t], everSeen = rowSeen[t];
          // A VACATED row is not a corpse. Resurrection is for a row that DIED
          // wholesale — its stale occ lingers (nobody left to sweep it) and
          // blocks ordinary admission. A row the left-pack legitimately emptied
          // (cascade scoot-up) holds NO reservation at all: it is the frontier
          // again, and the head of the row above (proven full by the H7 gate)
          // seats it. Without this a drained row sent every FIND to the row
          // below — never live in a shrinking room — and newcomers past the
          // frontier searched forever (churn-combos B with spawn>1).
          if (!liveRow && everSeen && rowHeld[t]) {
            // RESURRECTION (old H7, row-targeted): this row LIVED and is now
            // entirely silent — a whole-row death. Its subtrees drain (anchor
            // dead at lastAck>80, long before the RING_HOLD vertical heal) and
            // re-enter as newcomers, and THIS is what re-seeds the row: stale
            // occ corpses / childOf must NOT block it (they linger for a wiped
            // row — nobody left to sweep them). Old H7's no-race discipline is
            // kept exactly: the admitters are the greeters of the row BELOW
            // ((t+1)%C — the old "row above me is dead" relation), each
            // admitting at its OWN column, so no two admitters ever target one
            // cell. Anyone else hands the FIND to its column-mate in that row
            // (a direct rook link; head as fallback). Adjacent dead rows
            // resolve bottom-up, the same upward cascade the old H7 produced.
            const below = (t + 1) % C();
            if (this.coord.r === below) {
              const k = ck({ pc: 0, r: t, i: this.coord.i });
              if (TICK - (this.healTry.has(k) ? this.healTry.get(k) : -999) > 45) { this.healTry.set(k, TICK); this.admit({ pc: 0, r: t, i: this.coord.i }, mm); return; }
              continue;
            }
            // Forward toward the admitter row below ONLY over a FIRST-HAND-LIVE
            // link. Raw occGet here was a bug: when the admitter row is ALSO
            // wholly dead, its cells linger as stale occ echoes (a corpse's id,
            // never cleared once no neighbour hears a LEAVE and gossip re-seeds
            // it), so the FIND was handed to a DEAD seat and swallowed — two
            // ADJACENT dead home rows never resurrected (the scan returned at the
            // lower row before reaching the upper row it could itself admit).
            // First-hand liveness sees the corpse for what it is, so a dead
            // admitter row falls through to the bottom-up continue.
            const ac = ck({ pc: 0, r: below, i: this.coord.i }), ah = ck({ pc: 0, r: below, i: 0 });
            // First-hand, or DOOR-LISTED: mid-churn my first-hand hearing of
            // the admitter row decays while it is alive and greeting — the
            // door still lists it (every S1 seat is a greeter), and a door-
            // listed admitter is deliverable by definition. Without this, the
            // dead-row fall-through below raced a merely-unheard admitter
            // row's own admissions and minted a dup (c-sweep C=5 0.30×2
            // seed 1).
            const doorListed = (x) => x != null && !!(this.lastGreeters && this.lastGreeters.includes(x));
            let aid = this.firstHandLive(ac) ? this.occGet(ac) : (doorListed(this.occGet(ac)) ? this.occGet(ac) : null);
            if (aid == null || aid === this.id) { const hx = this.occGet(ah); aid = this.firstHandLive(ah) ? hx : (doorListed(hx) ? hx : null); }
            if (aid != null && aid !== this.id) { this.emit(aid, { t: 'FIND', nc: mm.nc, ttl: mm.ttl - 1 }); return; }
            // The whole admitter row below is dead too. "Resolve bottom-up"
            // DEADLOCKED here when EVERY row below was dead or empty (s1all
            // recovery: fresh greeters in rows 0-1, rows 2-4 dead, one stale
            // corpse hint in row 2 — 465 seekers NOROOM'd for 39k ticks): the
            // wrap admitters can never seat because seating THEM needs this
            // row first. A dead-held row whose resurrectors are also dead can
            // only be re-seeded by ORDINARY admission — fall through to the
            // j-loop: the H7 advance gate above already proved the row ABOVE
            // full, so j==0's admitter (that row's head) is alive, and the
            // stale corpse hints are individually skipped by cellReserved.
            // The row's new head then s1Fill-sweeps the corpses itself.
            // BUT ONLY WITH THE DOOR'S CORROBORATION: an unconditional fall-
            // through re-seeded rows a PARTITION had merely hidden and
            // minted split-brain dups (sweep split-0.5 seed 29: side B
            // dups=18). Every S1 seat is a greeter: the registry drops the
            // DEAD instantly, while a partitioned-but-alive row's members
            // keep E3-knocking the shared door and stay LISTED — so a hinted
            // occupant present in my own last greeter list means "hold the
            // hole" (H1-S1), and a row of occupants the door has forgotten
            // is genuinely dead.
            {
              let anyHint = false, doorHolds = false;
              for (let j = 0; j < C() && !doorHolds; j++) { const x = this.occGet(ck({ pc: 0, r: t, i: j })); if (x == null) continue; anyHint = true; if (this.lastGreeters && this.lastGreeters.includes(x)) doorHolds = true; }
              // POSITIVE corroboration only: fall through iff the row still
              // NAMES occupants and the door has forgotten every one of
              // them. A row whose hints have fully decayed gives no verdict —
              // hold (a partition starves hints and door-listings alike, and
              // H1-S1 says hold the hole when you cannot tell).
              if (doorHolds || !anyHint) continue;
            }
          }
          for (let j = 0; j < C(); j++) {
            const cell = { pc: 0, r: t, i: j }; const k = ck(cell);
            // Soft / real occupant reserved; phantoms free for rejoin.
            if (this.cellReserved(k)) continue;
            const dk = ck(topo.down(cell));
            if (this.softSitting(dk) || (this.cellReserved(dk) && !this.occIsPhantom(dk))) continue;
            // HEADLESS-ROW admission (the H7 amendment; roadmap §3 gap):
            //  - the vacated HEAD of a LIVE row is an INTERNAL HOLE owned by
            //    its designated healer (the H2 scoocher / vertical promotion)
            //    — never an admission target (C1: an admission must not race
            //    a healer).
            if (j === 0 && rowLive[t]) continue;
            let adm = j > 0 ? { pc: 0, r: t, i: 0 } : { pc: 0, r: (t - 1 + C()) % C(), i: 0 };
            // A: soft-only primary — assigner mass-fills the rest of the row.
            // NEVER devolve on mere silence of an occ occupant (headless-row C).
            if (this.softSitting(ck(adm)) && !this.occ.has(ck(adm)) && j > 0) {
              const sit = this.sitting.get(ck({ pc: 0, r: t, i: 0 }));
              if (sit && sit.assigner === this.id) {
                if (TICK - (this.healTry.has(k) ? this.healTry.get(k) : -999) > 45) { this.healTry.set(k, TICK); this.admit(cell, mm); return; }
                continue;
              }
            }
            // H-CHAIN: devolve when admitter not reserved; prefer real row-mates.
            // V4 NARROWING (both arms): devolve ONLY over a cell I have AT SOME
            // POINT heard first-hand (live ever set — the falsifiable-ghost
            // discipline of the E1 narrowing). A genuine row-mate always heard
            // its admitter within a couple of D1 beats; a frontier seat reading
            // a gossip gap may not inherit admission authority.
            if (!this.cellReserved(ck(adm)) && this.fhEver.has(ck(adm)) && rowLive[adm.r]) {
              for (let dj = 1; dj < C(); dj++) {
                const d = { pc: 0, r: adm.r, i: dj };
                if (this.cellReserved(ck(d)) && !this.occIsPhantom(ck(d))) { adm = d; break; }
              }
            }
            // S1 column-clique admission: only when primary was known (s1seen)
            // and is not reserved — never when simply unknown. Devolve only to
            // STRICTLY DEEPER same-column seats (no wrap into denser upper rows).
            if (!this.cellReserved(ck(adm)) && this.fhEver.has(ck(adm)) && this.s1seen.has(ck(adm))) {
              for (let rr = cell.r + 1; rr < C(); rr++) {
                const d = { pc: 0, r: rr, i: cell.i };
                if (this.cellReserved(ck(d)) && !this.occIsPhantom(ck(d))) { adm = d; break; }
              }
            }
            if (ck(this.coord) === ck(adm)) {            // I am the designated (or devolved) admitter
              // V4 LEDGER GATE: as a vouched-in head I may not admit into MY
              // OWN row before my assigner's SITXFER arrives — my empty view
              // of the row is definitionally lagged (its cells may be promised
              // to admittees still in flight). Past 60 ticks a silent assigner
              // is dead and its vouches died with it.
              if (this.coord.i === 0 && cell.r === this.coord.r && !this.rowLedger && TICK - this.seatedAt <= 60) continue;
              if (TICK - (this.healTry.has(k) ? this.healTry.get(k) : -999) > 45) {
                this.healTry.set(k, TICK);
                if (this.occIsPhantom(k)) {
                  this.occ.delete(k); this.live.delete(k); this.s1seen.delete(k); this.kidful.delete(k); this.tlForget(k, 'phantom-heal');
                }
                this.admit(cell, mm); return;
              }
              continue;                                  // admit gate cooling — consider the next cell
            }
            // Hand off to reachable real admitter; never emit to a corpse.
            if (this.admitterReachable(ck(adm))) {
              this.emit(this.occGet(ck(adm)), { t: 'FIND', nc: mm.nc, ttl: mm.ttl - 1 }); return;
            }
          }
        }
        // Only go deep when no admissible S1 free cell remains (phantoms free).
        let s1admFree = 0;
        for (let t = 0; t < C(); t++) {
          const liveR = rowLive[t];
          for (let j = 0; j < C(); j++) {
            if (j === 0 && liveR) continue;
            if (!this.cellReserved(ck({ pc: 0, r: t, i: j }))) s1admFree++;
          }
        }
        // Must stay unconditional: falling through to the deep path when home's
        // free cells look unservable fast-tracks silent death past the H1-S1
        // ring-hold (headless-row leg C), and buys nothing — the partitioned
        // half recovers on the reachable-forward fix below alone.
        if (s1admFree > 0) { this.emit(mm.nc, { t: 'NOROOM' }); return; }
      }
      const f = this.firstFreeInRoster();
      if (f) {
        // Phantom occ on the admitted cell: clear it first-hand before the
        // admit, exactly as the S1 designated arm does.
        const fk = ck(f);
        if (this.occIsPhantom(fk)) { this.occ.delete(fk); this.live.delete(fk); this.s1seen.delete(fk); this.kidful.delete(fk); this.tlForget(fk, 'phantom-deep'); }
        this.admit(f, mm); return;
      }
      // Descend — but NEVER into the void. This forward used raw occ, so it
      // emitted the FIND at an occupant on the far side of a partition (or a
      // corpse), where it is silently swallowed and the seeker burns its whole
      // timeout before retrying. To my own evidence a partitioned peer and a
      // SILENT-BUT-REAL head look identical, so two passes, in this order:
      //   0 — a hop I have heard from FIRST-HAND (demonstrably deliverable:
      //       what the starved half of a split needs)
      //   1 — any reachable-by-occ hop (what a silent head needs; gating those
      //       on liveness fast-tracks silent death past H1-S1 ring-hold)
      // V4 THE DEPTH WALL (twin of the sim's uint32 guard): never forward a
      // FIND toward the 13th floor — NOROOM is honest, and the twins must
      // refuse at the same depth or they diverge exactly where a dup storm goes.
      if (topo.pcDepth(this.coord.pc) >= 12) { this.emit(mm.nc, { t: 'NOROOM' }); return; }
      const rc = this.rosterCells(); const idx = this.shuf(Array.from({ length: C() }, (_, k) => k));
      for (let pass = 0; pass < 2; pass++)
        for (const q of idx) {
          const rk = ck(rc[q]); const x = this.occGet(rk); if (x == null || x === this.id) continue;
          if (pass === 0 ? this.firstHandLive(rk) : this.admitterReachable(rk)) { this.emit(x, { t: 'FIND', nc: mm.nc, ttl: mm.ttl - 1 }); return; }
        }
      this.emit(mm.nc, { t: 'NOROOM' });
    }
    // Q2 — COMPACTION service (the UP-CHAIN walk). A compaction FIND (tag==1)
    // climbs the seeker's OWN up-chain — every hop an ALIVE link (row → head →
    // owner) — and joins the NEAREST strictly-shallower OCCUPIED row (densify).
    // Reliable (no long route over a fragmented mesh, no reliance on a shallow
    // seat's stale view of a deep row), monotone (the seeker's depth strictly
    // decreases), and it empties lone-row deep sections into their ancestors'
    // rows — the media-plane payoff. The seeker's coord rides in mm.coord.
    serveCompact(mm) {
      if (!this.hasCoord || this.state !== 3 || mm.ttl <= 0) return;
      const sd = topo.pcDepth(mm.coord.pc);
      // Only a ROW HEAD decides — it holds the whole row FIRST-HAND (row-mates are
      // meshed), so its frontier view is fresh (unlike an S1 seat's stale view of
      // a deep row). A non-head hands the probe to its own row head (direct link).
      if (this.coord.i !== 0) { const h = this.occGet(ck({ pc: this.coord.pc, r: this.coord.r, i: 0 })); if (h != null && h !== this.id) this.emit(h, { t: 'FIND', nc: mm.nc, tag: 1, coord: mm.coord, ttl: mm.ttl - 1 }); return; }
      // I am a row head. If my row is a DEEP row STRICTLY shallower than the
      // seeker, offer the first free DENSIFYING slot in it (a trailing frontier:
      // free + down-child empty, so the seeker lands a childless leaf and never
      // displaces a healer). NEVER Section 1 (pc==0): the home is filled only
      // under H1-S1 ring-conservatism — compaction seating a leaf in an S1 cell
      // whose occupant is merely unreachable (not confirmed dead) could mint a
      // divergent home. The chain climbs THROUGH S1 but never seats there.
      if (this.coord.pc !== 0 && topo.pcDepth(this.coord.pc) < sd) {
        for (let j = 1; j < C(); j++) { const cell = { pc: this.coord.pc, r: this.coord.r, i: j };
          if (this.occ.has(ck(cell))) continue;                    // occupied (I know my row first-hand)
          if (this.occGet(ck(topo.down(cell))) != null) continue;  // internal hole — its down-child heals it (C1)
          this.admit(cell, mm); return;                            // densify: seat the seeker beside me, PLACE routed back (tag==1)
        }
      }
      // My row is full or not shallower — climb one level toward the home.
      // V5 CAP (PROBLVL, test/sim/mesh.cpp serveCompact): the funnel IS the
      // cost — a probe that cannot be served within PROBLVL levels of its
      // seeker dies here instead of walking to the S1 wall. The leaf just
      // retries next period.
      if (PROBLVL > 0 && topo.pcDepth(this.coord.pc) - 1 < sd - PROBLVL) return;
      const o = this.ownerCoord(); if (o) { const oid = this.occGet(ck(o)); if (oid != null && oid !== this.id) this.emit(oid, { t: 'FIND', nc: mm.nc, tag: 1, coord: mm.coord, ttl: mm.ttl - 1 }); }
    }

    // ---- healing (C3 fixed designation + diversified leaf-sourcing) ----
    heal(hole) {
      const TICK = this.TICK;
      if (!this.hasCoord || this.state !== 3 || TICK - this.healAt < 12) return;
      this.lastChurn = TICK; // Q2 hysteresis: I'm healing — my region is churning
      const hk = ck(hole); if (TICK - (this.healTry.has(hk) ? this.healTry.get(hk) : -999) < 45) return;
      this.healAt = TICK; this.healTry.set(hk, TICK);
      const nbrs = []; const ol = topo.ownedLinks(hole);
      for (const olc of ol) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) nbrs.push({ k: ck(olc), v: x }); }
      let selfNb = false; for (const olc of ol) if (ck(olc) === ck(this.coord)) selfNb = true; if (selfNb) nbrs.push({ k: ck(this.coord), v: this.id });
      const oc = ownerCoordOf(hole); if (oc) { const oid = this.occGet(ck(oc)); let has = false; for (const x of nbrs) if (x.k === ck(oc)) has = true; if (oid != null && !has) nbrs.push({ k: ck(oc), v: oid }); }
      // Gather EVERY candidate leaf-source, then pick ONE at random. A single
      // fixed source (my one known down-child) can have a broken/stale deep
      // chain that silently swallows the FINDLEAF forever — the stuck-home-hole
      // bug (#5). Diversifying across my subtree children, my kidful row-mates,
      // AND (for a home hole) other Section-1 seats' subtrees means repeated
      // heals eventually reach a live leaf; a rare double-promotion is culled by
      // E2's first-hand HELLO yield.
      const src = [];
      // FINDLEAF sources must be first-hand live — phantoms swallow FINDLEAF.
      for (const rc of this.rosterCells()) { const x = this.occGet(ck(rc)); if (x != null && x !== this.id && this.firstHandLive(ck(rc))) src.push(x); }
      if (hole.pc === this.coord.pc && hole.r === this.coord.r) { for (const m of topo.rowMates(this.coord)) { if (ck(m) === ck(hole)) continue; if (!(this.kidful.has(ck(m)) && this.kidful.get(ck(m)))) continue; const x = this.occGet(ck(m)); if (x != null && x !== this.id && this.firstHandLive(ck(m))) src.push(x); } }
      if (hole.pc === 0 && this.coord.pc === 0) { for (const e of this.s1Roster()) if (e.v !== this.id && e.k !== ck(hole) && this.firstHandLive(e.k)) src.push(e.v); }
      // Immediate LEFT-PACK designee: subtree first; after repeated FINDLEAF
      // misses (healTry aged ≥90), scooch even with children so S1 cannot
      // stay short forever after mass kill.
      if (hole.pc === this.coord.pc && hole.r === this.coord.r && hole.i === this.coord.i - 1
          && this.occGet(ck(topo.down(hole))) == null) {
        const mysrc = [];
        for (const rc of this.rosterCells()) { const x = this.occGet(ck(rc)); if (x != null && x !== this.id && this.firstHandLive(ck(rc))) mysrc.push(x); }
        const hk = ck(hole);
        const tried = this.healTry.has(hk) ? this.healTry.get(hk) : -999;
        if (mysrc.length && this.TICK - tried < 90) {
          const who = mysrc[(this.rng() * mysrc.length) | 0];
          this.emit(who, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); return;
        }
        if (!this.hasChildren() || this.TICK - tried >= 90) { this.promoteInto(hole, nbrs); return; }
        if (mysrc.length) {
          const who = mysrc[(this.rng() * mysrc.length) | 0];
          this.emit(who, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); return;
        }
      }
      // H-CHAIN S1 column-pack scooch UP only (hole.r < coord.r) BEFORE FINDLEAF.
      // Downward holes fall through to FINDLEAF — never raid denser upper rows.
      if (!this.hasChildren() && this.coord.pc === 0 && hole.pc === 0 && hole.i === this.coord.i && hole.r < this.coord.r) {
        let rowRightEmpty = true;
        for (let j = hole.i + 1; j < C(); j++) if (this.firstHandLive(ck({ pc: 0, r: hole.r, i: j }))) { rowRightEmpty = false; break; }
        if (rowRightEmpty) { this.promoteInto(hole, nbrs); return; }
      }
      if (src.length) { const who = src[(this.rng() * src.length) | 0]; this.emit(who, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); return; }
      if (!this.hasChildren() && hole.pc === this.coord.pc && hole.r === this.coord.r && hole.i === this.coord.i - 1) this.promoteInto(hole, nbrs);
    }
    findLeaf(hole, nbrs, ttl) {
      if (!this.hasCoord) return;
      if (ttl > 0) {
        const rc = this.rosterCells(); const idx = this.shuf(Array.from({ length: C() }, (_, k) => k));
        for (const q of idx) {
          const x = this.occGet(ck(rc[q]));
          if (x != null && x !== this.id && this.firstHandLive(ck(rc[q]))) {
            this.emit(x, { t: 'FINDLEAF', hole, nbrs, ttl: ttl - 1 }); return;
          }
        }
      }
      // Same-row non-head hole: only LEFT-PACK (hole to my left), not a no-op return.
      if (this.coord.pc === hole.pc && this.coord.r === hole.r && hole.i !== 0) {
        if (!(hole.i < this.coord.i) || this.hasChildren()) return;
        this.promoteInto(hole, nbrs); return;
      }
      this.promoteInto(hole, nbrs);
    }
    promoteInto(hole, nbrs) {
      if (!this.hasCoord || ck(this.coord) === ck(hole)) return;
      if (this.moving) return;                       // T1: one move at a time
      if (this.coord.pc === 0 && hole.pc !== 0) return;
      // 11a left-pack: scooch LEFT within the row. H-CHAIN S1 column: scooch
      // UP into denser (lower row index) same-column hole only — never DOWN
      // (raids H7-dense upper rows; N=9 serial left /0.4 empty forever).
      if (this.coord.pc === 0 && hole.pc === 0) {
        const leftPack = hole.r === this.coord.r && hole.i < this.coord.i;
        const colPack = hole.i === this.coord.i && hole.r < this.coord.r;
        if (!leftPack && !colPack) return;
        // E2, PREEMPTIVE — column-pack only. A VERTICAL healer is the one mover
        // routinely still linked to the seat it would displace: its owner is its
        // direct up-link. A severed head confirms its row-mate dead via the D5
        // probe (correct from its blind vantage) and hands the hole to exactly
        // that child, which then evicts a live occupant it can hear — the tie-
        // break takes the incumbent, not the mover. A cell heard FIRST-HAND is
        // alive by definition, so declining here cannot mask a real hole.
        // NOT applied to left-pack / findLeaf: those movers are not linked to
        // the corpse and blocking them starves mass-kill/partition healing.
        if (colPack && this.firstHandLive(ck(hole))) return;
      }
      this.doMove(hole, null, nbrs);
    }
    // T1 CLAIM-BEFORE-VACATE (dual-hold transit): take the NEW seat FIRST — the
    // claim is ordinary seating (CLAIM/HELLO, S4-signed) — while the OLD seat is
    // still held: no LEAVE has been sent, so to every neighbour the old cell is
    // simply occupied (no admitter or healer touches it; tenure/E2 protect it;
    // its PHONEs are still answered). Vacate ONLY when the claim CONFIRMS: a
    // new-neighbourhood frame arrives, or the window closes with NO
    // contradiction (a wiped region has nobody to answer). A CONTRADICTION at
    // the new cell (E2 yield, impostor CONFIRM) ROLLS BACK to the still-held
    // old seat — a mover is never homeless.
    doMove(hole, owner, nbrs) {
      if (!this.hasCoord || ck(this.coord) === ck(hole) || this.moving) return;
      if (this.env.bumpMoves) this.env.bumpMoves();
      this.lastChurn = this.TICK; // Q2 hysteresis: a move is churn
      this.oldCoord = this.coord; this.oldCk = ck(this.coord);
      this.oldNbrIds = []; { const seen = new Set();
        for (const olc of topo.ownedLinks(this.oldCoord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.oldNbrIds.push(x); } } }
      this.holdOcc = new Map(this.occ); this.holdSeen = new Map(this.s1seen); this.holdCous = new Map(this.cousins); // rollback snapshots
      this.occ.clear(); this.s1seen.clear(); this.cousins.clear(); this.tlClear(); // moving levels: old cousins / transport-loss obs are stale; rebuild fresh
      this.moving = true; this.moveAt = this.TICK;
      this.take(hole, owner, nbrs);
      this.lastAck = this.TICK; this.lastPhone = this.TICK - 100;
      let anyNbr = false;
      for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) { anyNbr = true; break; } }
      if (!anyNbr) this.confirmMove(); // nobody to hear from and nobody to collide with: confirm now (the 2-person scooch stays same-tick)
    }
    // A frame that evidences my NEW neighbourhood (someone accepted me there).
    moveEvidence(m) {
      if (m.t === 'PONG') return true;                          // my new phone answered
      if (m.t === 'PHONE') return m.tock === ck(this.coord);    // a call TO my new cell
      if (m.t === 'HELLO' || (m.t === 'CLAIM' && this.verifyFill(m))) {
        for (const olc of topo.ownedLinks(this.coord)) if (ck(olc) === m.ck) return true;
      }
      return false;
    }
    // T3: the confirmed vacate — instant goodbye (D2) whose LEAVE carries WHERE
    // I went (mvd), sent to the snapshotted old links; then a bounded
    // FORWARDING TOMBSTONE: for LEASE_TTL I answer in-flight traffic addressed
    // to the old cell. A redirect, never occupancy.
    confirmMove() {
      if (!this.moving) return; this.moving = false;
      for (const x of this.oldNbrIds) this.emit(x, { t: 'LEAVE', ck: this.oldCk, id: this.id, mvd: ck(this.coord) });
      this.oldNbrIds = []; this.holdOcc = null; this.holdSeen = null; this.holdCous = null;
      this.leaseCk = this.oldCk; this.leaseUntil = this.TICK + LEASE_TTL;
    }
    // T1 rollback: my claim at the new cell was contradicted (someone else is
    // the rightful occupant). Un-announce the new cell and go home to the old
    // seat, which was never vacated — nobody ever saw it empty.
    rollbackMove() {
      if (!this.moving) return; this.moving = false;
      const newCk = ck(this.coord); const seen = new Set();
      for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: newCk, id: this.id }); } }
      this.coord = this.oldCoord;
      this.occ = this.holdOcc || new Map(); this.s1seen = this.holdSeen || new Map(); this.cousins = this.holdCous || new Map();
      this.occ.set(this.oldCk, this.id);
      this.oldNbrIds = []; this.holdOcc = null; this.holdSeen = null; this.holdCous = null;
      this.healTry.set(newCk, this.TICK); this.healAt = this.TICK; // pace any re-attempt at that hole
      this.lastAck = this.TICK; this.lastPhone = this.TICK - 100;  // fresh grace; re-announce
      this.announce(); this.wake();
    }
    attack() { if (!this.hasCoord) return; for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) this.emit(x, { t: 'HELLO', ck: ck(olc), id: this.id }); } }
    requeue() { if (!this.evil && this.env.bumpEvict) this.env.bumpEvict(); if (this.env.bumpMoves) this.env.bumpMoves(); this.moving = false; this.oldNbrIds = []; this.holdOcc = null; this.holdSeen = null; this.holdCous = null; this.leaseCk = null; this.leaseUntil = -1; if (this.hasCoord) { const seen = new Set(); for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: ck(this.coord), id: this.id }); } } } this.hasCoord = false; this.occ.clear(); this.s1seen.clear(); this.tlClear(); this.drainAt = 0; this.join(); }

    drainOrReenter() {
      const TICK = this.TICK;
      // E1 LAST RESORT, checked FIRST (bug #7): owner-chain dead >220 with no
      // mesh route → drop the dead roster and re-enter the front door. Below
      // the drain branch it was unreachable for a seat holding a STALE roster.
      if (TICK - this.lastAck > 220) { this.haveRoster = false; this.roster = []; this.drainAt = 0; this.requeue(); return; }
      if (this.haveRoster && this.roster.length) { if (!this.drainAt) { const rc = this.rosterCells(); for (let c = 0; c < C(); c++) { const x = this.occGet(ck(rc[c])); if (x != null && x !== this.id) this.emit(x, { t: 'DRAIN', roster: this.roster }); } this.drainAt = TICK + 25 + (this.rng() * 10 | 0); } return; }
      if (TICK - this.rosterAskAt > 40) {
        this.rosterAskAt = TICK; const x = topo.crossLink(this.coord); let xid = x ? this.occGet(ck(x)) : null;
        if (xid != null && xid !== this.id) { this.emit(xid, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 }); }
        else { const rm = topo.rowMates(this.coord); const ri = this.shuf(Array.from({ length: C() - 1 }, (_, k) => k)); for (const q of ri) { const rr = this.occGet(ck(rm[q])); if (rr != null && rr !== this.id) { this.emit(rr, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 }); break; } } }
      }
    }
    // NOTE (law T5 — REJECTED, kept vacate-first ON PURPOSE): a keep-old drain
    // re-seat (stay seated while FINDing, vacate on PLACE) was built and
    // REVERTED. It breaks E1's dissolution guarantee: the drain's vacate is
    // what DISSOLVES a doomed fragment; kept alive, the fragment's mutually-
    // live stale seats keep phoning, answering, serving and HEALING each
    // other, promote one another into the home cells of their stale world,
    // and mint a divergent phantom home (a sealed bubble no E2 witness can
    // reach). The atomic transit (T1-T4) covers moves WITHIN a live
    // neighbourhood; a drain is the opposite case — its whole neighbourhood
    // is confirmed dead, and E1 deliberately dissolves it.
    reseatViaRoster() { if (this.env.bumpMoves) this.env.bumpMoves(); if (this.hasCoord) { const seen = new Set(); for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: ck(this.coord), id: this.id }); } } } this.hasCoord = false; this.occ.clear(); this.s1seen.clear(); this.tlClear(); this.drainAt = 0; this.seatTries = 0; const t = (this.haveRoster && this.roster.length) ? this.pickRoster() : null; if (t != null) this.askSeat(t); else this.join(); }

    // ---- routing (rook-aware next hops + Option A strict mesh routing) ----
    nextHopCoord(t) {
      const c = this.coord;
      if (c.pc === t.pc && c.r === t.r && c.i === t.i) return null;
      if (c.pc === t.pc) {                                 // SAME section — stay inside it, over owned links only
        if (c.pc === 0) {                                  // W7: Section 1 = 5x5 ROOK'S GRAPH — row+column are all owned links
          if (c.r === t.r) return { pc: 0, r: c.r, i: t.i }; // same row: one hop to the target column
          return { pc: 0, r: t.r, i: c.i };                // else: column-mate straight into the target row (then a row-mate to t.i)
        }
        if (c.r === t.r) return { pc: c.pc, r: c.r, i: t.i }; // same row: row-mate straight to the target column
        // Different row: reach row t.r via ONE transpose cross-link. The column
        // whose cross-link lands in row t.r is t.r itself, except when t.r==0
        // use my diagonal (col r).
        const tcol = (t.r === 0) ? c.r : t.r;              // never 0 (t.r!=c.r), so my cross-link exists there
        if (c.i !== tcol) return { pc: c.pc, r: c.r, i: tcol }; // hop 1: row-mate to that column
        return topo.crossLink(c);                          // hop 2: transpose across to row t.r (then row-mate to t.i)
      }
      // DIFFERENT section: climb to the common ancestor, or descend toward t.
      const digs = (pc) => { const v = []; if (!Number.isInteger(pc) || pc < 0) return v; while (pc > 0) { v.push(topo.lastDigit(pc)); pc = topo.parentPath(pc); } v.reverse(); return v; };
      const pa = digs(c.pc), pb = digs(t.pc);
      let l = 0; while (l < pa.length && l < pb.length && pa[l] === pb[l]) l++;
      if (l < pa.length) { if (c.i !== 0) return { pc: c.pc, r: c.r, i: 0 }; return topo.up(c); } // climb: to col 0, then up
      const d = pb[pa.length]; if (c.i !== d) return { pc: c.pc, r: c.r, i: d }; return topo.down(c); // descend toward child digit d
    }
    nextHopToward(target, exclude) {
      if (!this.hasCoord) return null; const ideal = this.nextHopCoord(target);
      if (ideal) { const x = this.occGet(ck(ideal)); if (x != null && x !== this.id && x !== exclude) return x; }
      if (this.coord.pc === 0) { // W7: rook — many redundant paths; any live column- or row-mate carries it onward
        for (const cm of topo.colMates(this.coord)) { const x = this.occGet(ck(cm)); if (x != null && x !== this.id && x !== exclude) return x; }
        for (const rm of topo.rowMates(this.coord)) { const x = this.occGet(ck(rm)); if (x != null && x !== this.id && x !== exclude) return x; }
        return null;
      }
      const xc = topo.crossLink(this.coord); if (xc) { const x = this.occGet(ck(xc)); if (x != null && x !== this.id && x !== exclude) return x; }
      const rm = topo.rowMates(this.coord); for (const m of rm) { const cx = topo.crossLink(m); if (!cx) continue; const x = this.occGet(ck(cx)); if (x != null && x !== this.id && x !== exclude) return x; }
      return null;
    }
    routeTo(target, tag) { const nh = this.nextHopToward(target, null); if (ck(this.coord) === ck(target)) return; if (nh != null) this.emit(nh, { t: 'ROUTE', target, asker: this.id, tag, ttl: 60, via: this.id }); }
    // routeToProbe: the D5 translost probe. THE PROBE TRAVELS THE MESH, NOT THE
    // DEAD LINK: the first hop excludes the probed occupant itself (my direct
    // link to it is exactly what died), and the frame carries my coord (acoord)
    // so the answer can route back AROUND the dead link too (tag 3). A live
    // severed peer therefore still answers; only a truly unreachable one stays
    // silent. No alternate hop at all ⇒ no probe ⇒ the confirm window runs — in
    // a room that sparse the dead link WAS the only path.
    routeToProbe(target) {
      const tk = ck(target); if (!this.hasCoord || ck(this.coord) === tk) return;
      const nh = this._probeHop(target, this.occGet(tk));
      if (nh != null) this.emit(nh, { t: 'ROUTE', target, asker: this.id, tag: 2, ttl: 60, via: this.id, acoord: this.coord });
    }
    // _probeHop: first hop for a probe (or its answer) that must NOT use the
    // direct link to `target`. Prefer a hop that is itself a DIRECT neighbour
    // of the target — for a same-row target another ROW-mate, for a same-column
    // target another COLUMN-mate (the rook's parallel independent paths); the
    // generic nextHopToward fallback can otherwise pick a path that funnels
    // straight back into the dead link.
    _probeHop(target, excludeId) {
      if (this.hasCoord && target.pc === this.coord.pc) {
        const cand = [];
        if (target.r === this.coord.r) { for (const m2 of topo.rowMates(this.coord)) if (ck(m2) !== ck(target)) cand.push(m2); }
        else if (this.coord.pc === 0 && target.i === this.coord.i) { for (const m2 of topo.colMates(this.coord)) if (ck(m2) !== ck(target)) cand.push(m2); }
        for (const m2 of cand) { const x = this.occGet(ck(m2)); if (x != null && x !== this.id && x !== excludeId) return x; }
      }
      return this.nextHopToward(target, excludeId);
    }

    // strictNextHop: the ideal step toward rdst, but ONLY if it is one of MY
    // owned links and occupied. A vacant ideal returns null and the frame is
    // dropped so healing fills the gap and the sender retries — routed delivery
    // travels strictly over real links (no teleport).
    strictNextHop(rdst) {
      if (!this.hasCoord) return null;
      const ideal = this.nextHopCoord(rdst); if (!ideal) return null;
      const ik = ck(ideal);
      for (const olc of topo.ownedLinks(this.coord)) if (ck(olc) === ik) { const x = this.occGet(ik); return (x != null && x !== this.id) ? x : null; }
      return null;
    }
    // route(): deliver `inner` to coord rdst over LINKS only. rfinal!=null ⇒
    // hand to that (unseated) newcomer at the destination cell (its gateway).
    route(rdst, rfinal, inner) {
      inner.routing = true; inner.rdst = rdst; inner.rfinal = (rfinal == null ? null : rfinal); inner.rttl = 64; inner.rvia = this.id;
      if (this.hasCoord && ck(this.coord) === ck(rdst)) {   // I'm the destination cell
        inner.routing = false;
        if (inner.rfinal == null || inner.rfinal === this.id) { this.emit(this.id, inner); return; }
        const pk = this.env.peek ? this.env.peek(inner.rfinal) : null;
        if (pk && pk.hasCoord && ck(pk.coord) !== ck(this.coord)) { this.emit(inner.rfinal, inner); return; } // rfinal SEATED since — route to its coord
        inner.direct = true; this.emit(inner.rfinal, inner); return; // still an unseated newcomer — direct hand-off
      }
      const nh = this.hasCoord ? this.strictNextHop(rdst) : this.gateway; // unseated ⇒ leave via the gateway link
      if (nh != null) this.emit(nh, inner);
    }
    // routeStep(): a routing frame arrived at me mid-flight. Return true iff it
    // is FOR me (routing cleared, fall through to normal dispatch).
    routeStep(m) {
      const leaseHit = this.hasCoord && ((this.leaseUntil >= 0 && this.TICK <= this.leaseUntil && ck(m.rdst) === this.leaseCk) // T3: in-flight frames for my just-vacated cell land HERE
                                      || (this.moving && ck(m.rdst) === this.oldCk));                                          // T1 dual-hold: ...and frames for the still-held old cell
      if (this.hasCoord && (ck(this.coord) === ck(m.rdst) || leaseHit)) {
        if (m.rfinal == null || m.rfinal === this.id) { m.routing = false; return true; }
        const h = Object.assign({}, m); h.routing = false;
        const pk = this.env.peek ? this.env.peek(m.rfinal) : null;
        if (pk && pk.hasCoord && ck(pk.coord) !== ck(this.coord)) { this.emit(m.rfinal, h); return false; }
        h.direct = true; this.emit(m.rfinal, h); return false; // still unseated — direct hand-off over the link
      }
      if (m.rttl <= 0) return false;                        // give up — sender retries
      const nh = this.strictNextHop(m.rdst);
      if (nh == null) return false;                         // no link toward rdst — drop
      const f = Object.assign({}, m); f.rttl = m.rttl - 1; f.rvia = this.id; this.emit(nh, f); return false;
    }

    // ---- phone-home / detection (D1) + wiring (W2/W3/W6) ----
    // ========================================================================
    // V1 ROLLUP DIGEST — healing-laws.md § G (sim: mesh_seat.inc, same names).
    // The room folded along the tree instead of flooded: <= C reports in and
    // ONE out per node per pulse period, riding PHONE (up), PONG (down) and
    // S1SYNC (the Section-1 root fold). N never appears in any node's work.
    // ========================================================================
    digOn() { return this.env.DIGEST === true && this.state === 3; }
    pubDig(d) {
      const o = { n: d.n, refuse: d.refuse, freeC: d.freeC, at: d.at, by: d.by, dmin: d.dmin, part: d.part };
      // The adversary knob (tests only). Mode 1 SUPPRESSES — refusals and the
      // partial flag stripped: the ONE dangerous direction (G4.2) and the only
      // one the checker needs to catch; mode 2 inflates n, harmless by G2.
      if (this.lie === 1) { o.refuse = 0; o.part = 0; }
      else if (this.lie === 2) { o.n += 1000; }
      return o;
    }
    // G4: remember every report I published upward, keyed by its own stamp —
    // the ground truth the aggregator's echo is checked against.
    noteUp(d) { this.upLog[this.upLogI & 15] = { at: d.at, n: d.n, refuse: d.refuse }; this.upLogI++; if (this.upSince < 0) this.upSince = this.TICK; }
    // G4, THE AUTHOR'S REFUTATION — the only check any node performs, over a
    // value that node itself authored. No votes (G4.4), no adjudication (G5).
    // (1) ECHO FIDELITY: what it says it took from me IS what I sent.
    // (2) FOLD MONOTONICITY: the fold it published contains what it echoed.
    // (3) ECHO FRESHNESS / OMISSION: consecutive empty echoes past a full
    //     staleness window of folds, or an ancient acknowledged stamp.
    // `base` is what the aggregator legitimately adds atop my report — 1 for
    // an owner folding itself with my row digest, 0 for a head folding my
    // subtree into its row. (Why an echo and not a history window: the fact
    // that decides suppression is WHICH of my reports it used — see the sim's
    // comment block; a bound on my own history false-fires on a settling
    // aggregator and is blind to a shrinking scope.)
    upRefuted(pub, echo, base) {
      this.digArm = 0;
      if (this.upLogI === 0) return false;
      if (echo.at < 0) { this.emptyEcho++; this.digArm = 3; return this.emptyEcho > 2 * DIG_TTL / 8; }
      this.emptyEcho = 0;
      if (this.TICK - echo.at > 2 * DIG_TTL) { this.digArm = 3; return true; }
      if (echo.by !== this.id) return false; // the echo names a DIFFERENT author — my cell's previous occupant's report, not mine. Not evidence.
      let r = null; for (let q = 0; q < 16; q++) { if (this.upLog[q].at === echo.at) { r = this.upLog[q]; break; } }
      if (!r) return false;                  // older than my ring — no record, so no accusation
      if (echo.n !== r.n || echo.refuse !== r.refuse) { this.digArm = 1; return true; }             // (1)
      if (pub.n < base + echo.n || pub.refuse < echo.refuse) { this.digArm = 2; return true; }      // (2)
      return false;
    }
    // G3's fail-closed predicate, FALSIFIABLE and BOUNDED BY THE HEALING
    // HORIZON: is this scope member a PERSON I have lost (⇒ blur), or a stale
    // occ echo / unowned ghost (⇒ never — a permanent unclearable blur is the
    // split-view bug the flood was invented to fix, wearing new clothes). The
    // fold reads the SAME phantom-aware evidence the admission layer reads
    // (occIsPhantom, a pure read), and a member blurs only while its loss is
    // ACTIONABLE — heard first-hand within DIG_LOSS_H. Honest residual: a
    // member alive, refusing, and severed from its aggregator longer than that
    // drops out of both n and refuse — that is E3's "we lost that subtree",
    // not a digest fact.
    scopeGap(k) {
      if (!this.occ.has(k) || this.occIsPhantom(k)) return false;
      const it = this.live.get(k); return it !== undefined && this.TICK - it <= DIG_LOSS_H;
    }
    // The fold: once per pulse period, O(C) work. (1) my SUBTREE = me + the
    // child row I own; (2) a deep ROW HEAD folds its row (its owner is linked
    // only to it); (3) SECTION 1 folds the ROOT from the C^2 section digests —
    // each S1 seat computes it independently (no root to fight over, § P).
    rollup() {
      if (!this.digOn() || !this.hasCoord) return;
      const TICK = this.TICK;
      // occIsPhantom's 03c knock-is-evidence rule is scoped to the FIND scan in
      // progress — a display fold is not that scan. Clear findNc for the fold
      // (restored after), keeping the rollup's phantom read independent of a
      // mid-flight FIND.
      const svFind = this.findNc; this.findNc = null;
      try {
        const d = { n: 1, refuse: this.refuses ? 1 : 0, freeC: 0, at: TICK, by: this.id, dmin: 99, part: 0 };
        // G7 free-space, MEASURED ONLY: how many of my owned child row's cells
        // look admissible. Deliberately a PURE read (occ/sitting membership,
        // never cellReserved — the reservation helpers lazily expire soft
        // marks, and a display fold must not mutate admission state at all).
        if (topo.pcDepth(this.coord.pc) < 12) {
          for (const rc of this.rosterCells()) {
            const k = ck(rc); if (this.occ.has(k) || this.sitting.has(k)) continue;
            const dk2 = ck(topo.down(rc)); if (this.occ.has(dk2) || this.sitting.has(dk2)) continue;
            d.freeC++;
          }
          if (d.freeC) d.dmin = topo.pcDepth(this.coord.pc) + 1;
        }
        const dk = ck(topo.down(this.coord)); this.digGap = 0; this.downUsed = dig0();
        if (this.downDig.at >= 0 && TICK - this.downDig.at <= DIG_TTL) { digFold(d, this.downDig); this.downUsed = this.downDig; }
        else if (this.scopeGap(dk)) { d.part = 1; d.refuse += 1; this.digGap = 1; } // G3 FAIL-CLOSED: a subtree I believe populated but cannot hear counts as REFUSING, never as zero
        this.myDig = d;
        if (this.coord.pc !== 0 && this.coord.i === 0) {
          const r = { n: d.n, refuse: d.refuse, freeC: d.freeC, at: TICK, by: this.id, dmin: d.dmin, part: d.part };
          this.rowUsed.clear();
          for (let j = 1; j < C(); j++) {
            const rk = ck({ pc: this.coord.pc, r: this.coord.r, i: j }); const it = this.rowKids.get(rk);
            if (it !== undefined && TICK - it.at <= DIG_TTL) { digFold(r, it); this.rowUsed.set(rk, it); }
            else if (this.scopeGap(rk)) { r.part = 1; r.refuse += 1; this.digGap |= 2; }
          }
          this.rowDig = r;
        }
        if (this.coord.pc === 0) {
          const R = { n: 0, refuse: 0, freeC: 0, at: TICK, by: this.id, dmin: 99, part: 0 };
          for (let r0 = 0; r0 < C(); r0++) for (let i0 = 0; i0 < C(); i0++) {
            const k = ck({ pc: 0, r: r0, i: i0 });
            if (this.hasCoord && k === ck(this.coord)) { digFold(R, this.myDig); continue; }
            const it = this.s1tab.get(k);
            if (it !== undefined && TICK - it.at <= DIG_TTL) digFold(R, it);
            else if (this.scopeGap(k)) { R.part = 1; R.refuse += 1; this.digGap |= 4; }
          }
          this.rootDig = R;
        }
      } finally { this.findNc = svFind; }
    }

    onPhone(m) {
      const TICK = this.TICK;
      if (this.hasCoord && this.moving && m.tock === this.oldCk && m.tock !== ck(this.coord)) { // T1 dual-hold: the OLD seat still answers while the claim is in flight
        this.emit(m.id, { t: 'PONG', coord: this.oldCoord, from: null, owner: null, oCk: null, row: [], nbrs: [] }); return;
      }
      if (this.hasCoord && this.leaseUntil >= 0 && TICK <= this.leaseUntil && m.tock === this.leaseCk && m.tock !== ck(this.coord)) { // T3: a call to my just-vacated cell — answer MOVED so the caller confirms the vacancy NOW
        this.emit(m.id, { t: 'MOVED', ck: this.leaseCk, mvd: ck(this.coord), id: this.id }); return;
      }
      if (!this.hasCoord || m.tock !== ck(this.coord)) return; // ckey(0,0,0)=="0_0_0" is a REAL coord — always check
      // § G UP-LEG: the phoner's digest arrives as PAYLOAD on the beat it
      // already sends (G0). Which scope it names is decided by the phoner's
      // RELATION to me, read from its coord — never from anything it asserts.
      if (this.digOn() && m.dgUp && m.dgUp.at >= 0) {
        const pk = ck(m.coord);
        if (pk === ck(topo.down(this.coord))) this.downDig = m.dgUp;                       // my down-child head published MY OWNED CHILD ROW
        else if (this.coord.pc === 0 && m.coord.pc === 0) {                                // a rook peer published ITS SECTION
          const it = this.s1tab.get(pk); if (it === undefined || it.at <= m.dgUp.at) this.s1tab.set(pk, m.dgUp);
        } else if (this.coord.pc !== 0 && this.coord.i === 0 && m.coord.pc === this.coord.pc && m.coord.r === this.coord.r) this.rowKids.set(pk, m.dgUp); // a row-mate published ITS SUBTREE
      }
      const kk = ck(m.coord); const prev = this.occGet(kk);
      // D5: my first-hand hearing of prev ENDS at my own transport loss (an
      // unanswered translost) — a corpse whose last PHONE is still inside the
      // 40-tick window must not out-tenure the legitimate healer's fill. An
      // answered probe erases the observation, restoring the sitting
      // occupant's full tenure protection (S5: "has itself, first-hand,
      // stopped hearing the prior occupant").
      if (prev != null && prev !== m.id && m.id > prev && this.live.has(kk) && TICK - this.live.get(kk) <= 40 && !this.translost.has(kk)) { this.emit(m.id, { t: 'YIELD', ck: kk }); return; }
      this.setOcc(kk, m.id); this.liveMark(kk); this.noteS1(kk); this.kidful.set(kk, m.kids ? 1 : 0); if (m.child != null) this.childOf.set(kk, m.child); else this.childOf.delete(kk);
      const myoc = this.ownerCoord(); let owner = null, oCk = null; if (myoc) { oCk = ck(myoc); owner = this.occGet(oCk); }
      const row = [];
      if (this.coord.i === 0 && m.coord.pc === this.coord.pc && m.coord.r === this.coord.r) { row.push({ k: ck(this.coord), v: this.id, age: this.occGet(ck(topo.down(this.coord))) }); for (let c = 1; c < C(); c++) { const rc = { pc: this.coord.pc, r: this.coord.r, i: c }; const x = this.occGet(ck(rc)); if (x != null && x !== m.id) row.push({ k: ck(rc), v: x, age: this.childOf.has(ck(rc)) ? this.childOf.get(ck(rc)) : null }); } }
      const cous = [];
      if (kk === ck(topo.down(this.coord))) { // my DOWN-CHILD phoning: teach it the heirs at its FUTURE owned-links (relay-free promote-up)
        for (const mate of topo.rowMates(this.coord)) { const v = this.childOf.get(ck(mate)); if (v != null) cous.push({ k: ck(mate), v }); }
        if (this.coord.pc === 0) { // W7: my future owned-links are my whole ROW + whole COLUMN (rook) — teach the column heirs too
          for (const cmx of topo.colMates(this.coord)) { const v = this.childOf.get(ck(cmx)); if (v != null) cous.push({ k: ck(cmx), v }); }
        } else { const xl = topo.crossLink(this.coord); if (xl) { const v = this.childOf.get(ck(xl)); if (v != null) cous.push({ k: ck(xl), v }); } }
      } else if (this.coord.i === 0 && m.coord.pc === this.coord.pc && m.coord.r === this.coord.r) { // a ROW-MATE phoned me (head): share MY cousins for H2/C2 promote-up
        for (const [k, v] of this.cousins) cous.push({ k, v });
      }
      // coord+id ride the PONG so the phoner gains FIRST-HAND liveness for me (bidirectional heartbeat)
      const pong = { t: 'PONG', owner, oCk, row, nbrs: cous, coord: this.coord, id: this.id };
      // § G DOWN-LEG (rides the PONG I already send, G0): the room fold, plus
      // the fold I PUBLISH BACK TO THIS PEER. The published fold is the whole
      // of G4 — it hands every author the one value it is uniquely qualified
      // to refute: to my DOWN-CHILD -> my SUBTREE claim (its row digest is the
      // claim's sole input; that child is already my C3-designated healer); to
      // a ROW-MATE -> my ROW fold, which must contain that mate's own
      // contribution. And the ECHO: the report I actually FOLDED from this
      // peer — downUsed/rowUsed, snapshotted at rollup, NOT what I currently
      // hold (echoing a newer report that landed since my fold accuses me of
      // suppression I did not commit — one beat of lag; measured in the sim).
      // A liar that strips its fold strips the echo too (`lie 1` models it) —
      // exactly what check (1) catches, since the peer holds the original.
      if (this.digOn()) {
        pong.dgRoot = this.rootDig;
        const isDownKid = kk === ck(topo.down(this.coord));
        pong.dgPub = this.pubDig(isDownKid ? this.myDig : ((this.coord.pc !== 0 && this.coord.i === 0) ? this.rowDig : this.myDig));
        if (isDownKid) pong.dgEcho = this.pubDig(this.downUsed);
        else if (this.coord.pc !== 0 && this.coord.i === 0) { const it = this.rowUsed.get(kk); if (it !== undefined) pong.dgEcho = this.pubDig(it); }
      }
      this.emit(m.id, pong);
      if (prev !== m.id) this._gspReplay(m.id); // NEW occupant learned ⇒ hand over the recent gossip backlog
      if (prev != null && prev !== m.id) this.emit(prev, { t: 'YIELD', ck: kk });
    }
    phoneHome() {
      let tc = null; if (this.hasCoord) { if (this.coord.i !== 0) tc = { pc: this.coord.pc, r: this.coord.r, i: 0 }; else tc = this.ownerCoord(); }
      if (!tc) return; const tid = this.occGet(ck(tc)); if (tid == null) return;
      const ph = { t: 'PHONE', coord: this.coord, tock: ck(tc), id: this.id, kids: this.hasChildren(), child: this.occGet(ck(topo.down(this.coord))) };
      // § G UP-LEG (payload on the beat, G0): a deep HEAD contributes its whole
      // ROW fold (its owner is linked to it and nobody else in that row);
      // everyone else contributes its own subtree. Section-1 rows do NOT roll
      // up — every S1 seat is a forest root — so an S1 seat always publishes
      // its subtree. noteUp: the G4 ground truth for the aggregator's echo.
      if (this.digOn()) { ph.dgUp = this.pubDig((this.coord.pc !== 0 && this.coord.i === 0) ? this.rowDig : this.myDig); this.noteUp(ph.dgUp); }
      this.emit(tid, ph);
      // A GHOST PHONE TARGET MUST BE FALSIFIABLE (2026-08-05; sim twin is the
      // origin — churn-combos leg C). An occupant that MOVED before I arrived
      // (its LEAVE went to a then-empty cell, so nobody could address it to me)
      // leaves a ghost occ entry no rule can falsify: occGet never nulls, no
      // transport event ever fires (we never shared a live DC), the healers'
      // guards stay shut, and my lastAck rots to E1's 220-tick last resort —
      // a healthy seat unseats out of a healthy room because somebody ELSE's
      // link blipped. Remedy: a VIEW-ONLY delete at the healers' OWN horizons,
      // probe-gated — past OWNER_SILENT I probe the cell across the mesh every
      // beat (a live-but-severed occupant answers HELLO, turns first-hand, and
      // this branch resets); only a target silent through the same confirm
      // horizon the healers use (60 deep, RING_HOLD in Section 1) loses the
      // occ entry, which lets the EXISTING occGet==null healer branches fire
      // with their own pacing. (A translost-based first cut borrowed the
      // DC-death EARLY_HOLD confirm and minted a dup under mass-kill — probe
      // loss in a storm is not death evidence. Measured in the sim, reverted.)
      // NARROWED (second cut): only an occupant I have NEVER heard first-hand
      // — a pure inheritance ghost (live has no entry at all) — is falsifiable
      // by silence. An occupant I once heard and lost is the severed-but-alive
      // case: D5/E2's transport-event + ring conservatism owns it, never a
      // silence clock — under continuous link churn probes die with the links,
      // and the broad !firstHandLive form falsified LIVE severed neighbours
      // (sim repro-adversary went RED in-gate on the first cut).
      const tk = ck(tc);
      if (this.TICK - this.lastAck > OWNER_SILENT && !this.live.has(tk)) {
        this.routeTo(tc, 1);
        const confirmH = (tc.pc === 0) ? RING_HOLD : 90; // deep: 1.5x the healer horizon — silence is weaker evidence than a LEAVE; 60 degraded post-mass-kill packing (sim compaction leg 1), 120 lost the E1 race (leg C s5); 90 measured green on both
        if (this.TICK - this.lastAck > confirmH && this.occ.has(tk)) { this.occ.delete(tk); this.kidful.delete(tk); this.s1seen.delete(tk); }
      }
    }
    // D1 heartbeat over the RICH ROOK (W7): a Section-1 seat phones every live
    // rook neighbour — its whole row AND whole column — each beat, so first-hand
    // liveness is maintained across all redundant home paths. This is what lets
    // phantoms decay (no heartbeat ⇒ not first-hand ⇒ probed and cleared) and
    // lets ringConfirmDead rely on first-hand truth instead of gossip. The deep
    // down-link is still covered by the deep child phoning UP (phoneHome).
    s1Heartbeat() {
      if (!this.hasCoord || this.coord.pc !== 0) return;
      for (const t of topo.ownedLinks(this.coord)) {
        if (t.pc !== 0) continue; // rook (Section-1) links only
        const tid = this.occGet(ck(t)); if (tid == null || tid === this.id) continue;
        const ph = { t: 'PHONE', coord: this.coord, tock: ck(t), id: this.id, kids: this.hasChildren(), child: this.occGet(ck(topo.down(this.coord))) };
        if (this.digOn()) ph.dgUp = this.pubDig(this.myDig); // § G: rook peers exchange SECTION digests (no row fold in Section 1 — every S1 seat is a forest root)
        this.emit(tid, ph);
      }
    }
    s1Sync() {
      const TICK = this.TICK;
      const ent = [{ k: ck(this.coord), v: this.id, age: 0, ch: this.occGet(ck(topo.down(this.coord))), b: this.born.has(ck(this.coord)) ? this.born.get(ck(this.coord)) : this.TICK }]; // carry MY heir
      for (const [k, v] of this.occ) { if (isS1key(k) && v !== this.id) { const it = this.s1seen.get(k); if (it !== undefined && TICK - it < 120) ent.push({ k, v, age: TICK - it, ch: this.childOf.has(k) ? this.childOf.get(k) : null, b: this.born.has(k) ? this.born.get(k) : -1 }); } }
      // W7: sync over the whole rook neighbourhood — every live row-mate AND
      // column-mate (heads included) — keeping the full C^2 home roster
      // consistent across the richly-meshed section.
      const tg = new Set();
      for (const m of topo.rowMates(this.coord)) { const t = this.occGet(ck(m)); if (t != null && t !== this.id) tg.add(t); }
      for (const m of topo.colMates(this.coord)) { const t = this.occGet(ck(m)); if (t != null && t !== this.id) tg.add(t); }
      // § G ROOT FOLD: the rook has diameter 2, so a Section-1 seat hears
      // 2(C-1) of the C^2 sections first-hand and needs ONE relay hop for the
      // rest. S1SYNC is already that relay (it carries the C^2 occupancy
      // table), so the digest table rides it — no new frame (G0), and the fold
      // completes in two beats. Relaying another section's digest is
      // second-hand BY CONSTRUCTION; safe for exactly one reason (G1): a
      // digest can never actuate. Entries carry their AUTHOR's stamp, relayed
      // unchanged, so a relayed fold can never look fresher than it is.
      let digs = null;
      if (this.digOn()) {
        digs = [{ k: ck(this.coord), d: this.pubDig(this.myDig) }];
        for (const [k, d] of this.s1tab) if (k !== ck(this.coord) && TICK - d.at <= DIG_TTL) digs.push({ k, d });
      }
      for (const t of tg) { const msg = { t: 'S1SYNC', ent }; if (digs) msg.digs = digs; this.emit(t, msg); }
    }
    rowSweep() {
      // 11a: the head no longer HEALS its row cells (each is healed by its own
      // down-child (VERTICAL) or its right-neighbour (LEFT-PACK) — a fixed
      // unique designation). rowSweep is pure cleanup: forget a row cell gone
      // silent past the horizon so a corpse stops riding the head's PONG. A
      // severed-but-alive cell that gets forgotten re-announces on recovery.
      const TICK = this.TICK;
      if (this.coord.i !== 0) return; const del = [];
      for (const [k, at] of this.live) { if (TICK - at <= 50) continue; const c = unck(k); if (c.pc === this.coord.pc && c.r === this.coord.r && c.i > 0) del.push(k); }
      // A SILENCE-forget is NOT a free chair (2026-08-02): the occupant may be
      // merely severed from ME while my row-mates still hear it — their next
      // S1SYNC re-seeds my occ within a beat, but the gap between this forget
      // and that re-seed was an ADMISSION WINDOW: a seeker could be seated on
      // a live peer's cell and the E2 contest then churned one of them out
      // (mesh-harness D5-sever: a revolving door at the severed cell). Stamp
      // healTry — the head's own 45-tick admission pace — so the window is
      // closed; every EXPLICIT free (LEAVE, MOVED, D5 confirm, check-back)
      // still clears healTry and stays instantly admissible.
      for (const k of del) { this.live.delete(k); this.occ.delete(k); this.kidful.delete(k); this.s1seen.delete(k); this.tlForget(k, 'row-age'); this.healTry.set(k, this.TICK); }
      // (D5's early corpse-forget lives in tlSweep — every observer, not just
      // heads — so a confirmed corpse stops riding rosters in ~probe-time.)
    }
    s1Fill() {
      // Section 1 must stay full (25). A cell {0,r,j} is normally refilled from
      // below by its down-child (VERTICAL). s1Fill is the HEAD's backstop AND
      // the only thing that clears a Section-1 PHANTOM. Every fill is
      // probe-gated (ringConfirmDead) so a merely-unreachable occupant is held
      // as a hole, never duplicated. One heal per pass.
      const TICK = this.TICK;
      if (TICK - this.seatedAt < 80) return;
      for (let j = 1; j < C(); j++) {
        const c = { pc: 0, r: this.coord.r, i: j }; const kk = ck(c);
        // D5: on the EARLY path defer a cell that owns a down-child to its
        // VERTICAL healer (bug #3's rule) — that child holds the same first-
        // hand loss and heals it in ~probe-time; racing it here minted
        // duplicates. The RING_HOLD horizon path is unchanged (translost
        // clears once the cell refills or answers).
        if (this.translost.has(kk) && this.hasDownChild(c)) continue;
        // (the translost observation deliberately STANDS after the clear — it
        // keeps S1SYNC echoes from re-seating the corpse in my occ until the
        // cell genuinely refills; setOcc/admit clear it on an occupant change)
        if (this.ringConfirmDead(c)) { if (this.occ.has(kk)) { this.occ.delete(kk); this.live.delete(kk); this.s1seen.delete(kk); this.kidful.delete(kk); } this.holeSince.delete(kk); this.heal(c); return; }
      }
    }
    // H1-S1 RING-HEAL CONSERVATISM, probe-gated (NOT gossip-gated). A home cell
    // I don't hear first-hand is a hole, a phantom, or an occupant merely
    // unreachable to me — s1Fresh can NEVER distinguish them. So I actively
    // PROBE it across the whole rook (routeTo walks every redundant path): a
    // live-and-reachable occupant answers with a HELLO and becomes first-hand
    // next round; a true hole / phantom / genuinely-partitioned occupant stays
    // silent. Only after unreachable via ALL paths for the full ring window is
    // it declared dead. Hold the hole; never mint the duplicate.
    ringConfirmDead(h) {
      const hk = ck(h);
      // D5 EARLY-PROBE: my own transport to this occupant died (first-hand) and
      // the confirm probe has gone unanswered across the whole rook for the
      // settled early window — confirmed dead NOW; the horizon below remains
      // the backstop when no transport event fired. (An answered probe clears
      // the observation inside translostConfirmed — no eviction, E2 stands.)
      if (this.translostConfirmed(hk)) return true;
      if (this.firstHandLive(hk)) { this.holeSince.delete(hk); return false; }
      this.routeTo(h, 1); // probe across the rook
      let since;
      if (this.live.has(hk)) since = this.live.get(hk);
      else if (this.holeSince.has(hk)) since = this.holeSince.get(hk);
      else { since = this.TICK; this.holeSince.set(hk, since); }
      return this.TICK - since > RING_HOLD;
    }

    // ---- gossip: room-wide flood over the mesh (PRODUCTION EXTENSION) ----
    // Not part of the sim's law set — the app layer (chat/status/votes/files)
    // rides this instead of relay fan-out, because the relay session is only
    // the greeter pool now, not the room. A bounded-degree flood with dedup:
    // fan-out ≤ my live links, the seen-cache kills echoes, and the link graph
    // (rows + cross + up/down + the S1 rook) spans the stadium, so every seated
    // seat converges on every message. Cost: O(edges) frames per message.
    linkPeers() {
      const out = new Set();
      if (!this.hasCoord) return out;
      for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) out.add(x); }
      const o = this.ownerId(); if (o != null && o !== this.id) out.add(o);
      return out;
    }
    gossip(payload) {
      this.gseq = (this.gseq || 0) + 1; const gid = this.id + ':' + this.gseq;
      (this.gseen = this.gseen || new Map()).set(gid, this.TICK);
      this._gspRemember(gid, this.id, payload);
      for (const p of this.linkPeers()) this.emit(p, { t: 'GSP', gid, src: this.id, m: payload });
    }
    _gspRecv(m) {
      const g = this.gseen = this.gseen || new Map();
      if (g.has(m.gid)) return;
      g.set(m.gid, this.TICK);
      if (g.size > 4096) { for (const [k, at] of g) if (this.TICK - at > 600) g.delete(k); } // horizon GC
      if (this.onGossip) { try { this.onGossip(m.src, m.m); } catch (e) {} }
      this._gspRemember(m.gid, m.src, m.m);
      for (const p of this.linkPeers()) if (p !== m.src) this.emit(p, { t: 'GSP', gid: m.gid, src: m.src, m: m.m });
    }
    // ANTI-ENTROPY, two repairs (dedup makes both idempotent):
    // 1. BEAT RE-FAN — a one-shot flood races topology convergence: a seat whose
    //    neighbours' occ was momentarily stale (mid-heal) is silently missed, so
    //    each seat re-fans messages younger than ~4 phone beats.
    // 2. NEW-NEIGHBOUR REPLAY — a seat that was UNSEATED during the whole flood
    //    window arrives with no history; the first PHONE that teaches me a NEW
    //    occupant gets my recent backlog replayed.
    _gspRemember(gid, src, m) { const g = this.grecent = this.grecent || []; g.push({ gid, src, m, at: this.TICK }); if (g.length > 64) g.shift(); }
    _gspRefan() {
      const g = this.grecent; if (!g || !g.length) return;
      this.grecent = g.filter((e) => this.TICK - e.at <= 256); // replay horizon (memory-bounded with the 64 cap)
      for (const e of this.grecent) {
        if (this.TICK - e.at > 32) continue; // beat re-fan only while fresh
        for (const p of this.linkPeers()) this.emit(p, { t: 'GSP', gid: e.gid, src: e.src, m: e.m });
      }
    }
    _gspReplay(to) { if (this.grecent) for (const e of this.grecent) this.emit(to, { t: 'GSP', gid: e.gid, src: e.src, m: e.m }); }

    // ---- message dispatch ----
    recv(m) {
      if (!this.alive) return;
      // Coordinates ride unsigned frames (ROUTE, FIND, S1SYNC, …) and index
      // the topology arithmetic: a pc that is not a natural number, or an r/i
      // that is not, is a hostile or corrupt frame, never a seat. Dropped at
      // the door so no handler has to re-check (topo.pcDepth guards itself
      // too — see gifos-net.js).
      for (const k of ['coord', 'target', 'hole']) {
        const c = m[k];
        if (c == null) continue;
        if (typeof c !== 'object' || !Number.isInteger(c.pc) || c.pc < 0 || !Number.isInteger(c.r) || c.r < 0 || !Number.isInteger(c.i) || c.i < 0) return;
      }
      if (m.routing && !this.routeStep(m)) return; // Option A: in-transit routing frame — forward (or drop); fall through only when FOR me
      if (this.moving && this.state === 3 && this.moveEvidence(m)) this.confirmMove(); // T1: a new-neighbourhood frame is the claim's CONFIRMATION — vacate the old seat now
      const TICK = this.TICK, HEALING = this.env.HEALING;
      switch (m.t) {
        case 'GREETERS': {
          if (!m.list.length) { if (this.state === 0) { this.genKey = this.myKey; this.take({ pc: 0, r: 0, i: 0 }, null, []); } return; } // R3 mint / R6 take-over
          // R6: greeters exist (meeting alive) but I've REACHED none (no HOME
          // roster came back) for a full TTL ⇒ voted off / unreachable subnet.
          // A seat that keeps reaching greeters but only gets NOROOM is
          // competing for a slot in a busy heal — NOT stranded (bug #6).
          if ((this.state === 0 || this.state === 1) && this.joinStart >= 0 && TICK - this.joinStart > STRAND_TTL && (this.lastReach < 0 || TICK - this.lastReach > STRAND_TTL)) { this.stranded = true; this.strandedAt = TICK; return; }
          this.lastGreeters = m.list; this.greetersAt = TICK; // stamped: entry-resume trusts this list only while registry-fresh
          if (this.state === 0 && !this.forkPaused) {
            // R5: probe SEVERAL greeters. One greeter → classic path. Many →
            // collect HOMEs; cluster by gkey + roster overlap. Two+ clusters
            // (multi-genesis OR same-key torn halves) ⇒ human pick-one.
            const pool = m.list.filter((g) => g && g !== this.id);
            if (!pool.length) return;
            if (pool.length === 1) {
              this.gateway = pool[0];
              (this.triedSilent = this.triedSilent || new Set()).add(pool[0]); // silent until its HOME lands
              this.emit(pool[0], { t: 'WHOHOME', from: this.id, ttl: 60 });
              this.state = 1; this.retryAt = TICK;
              return;
            }
            this.forkProbe = true; this.forkAt = TICK; this.forkSamples = [];
            this.forkOpts = new Map(); this.forkPending = 0;
            const order = pool.slice();
            for (let i = order.length - 1; i > 0; i--) { const j = (this.rng() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
            const fan = order.slice(0, Math.min(5, order.length));
            this.forkPending = fan.length;
            this.state = 1; this.retryAt = TICK + 40;
            for (const g of fan) { (this.triedSilent = this.triedSilent || new Set()).add(g); this.emit(g, { t: 'WHOHOME', from: this.id, ttl: 60 }); } // each is silent until its HOME lands — a dark greeter never gets the seat-ask
          }
          // Split-off fragment self-rescue: a seated S1 seat isolated from EVERY
          // rook neighbour for a full strand window, while the pool lists OTHER
          // live greeters, is a duplicate E2 can never reach (it can't phone —
          // occ-gated — or route-probe — no link). The relay re-knock is its one
          // shared channel with the real ring: requeue and rejoin cleanly. The
          // old rule ignored the list even when drowning; this is the exception
          // for when you actually need the life-saver. A lone genesis lists no
          // other greeter, so it never trips.
          if (this.state === 3 && this.coord.pc === 0 && TICK - this.rookSeenAt > STRAND_TTL
              && m.list.some((g) => g != null && g !== this.id)) { this.requeue(); return; }
          // TWO-RING RECONCILIATION (2026-08-02): the lone-fragment rescue
          // above needs a seat hearing NOBODY — but a churn can rebuild TWO
          // complete home rings in one session (each ring hears its own rook,
          // so neither is "isolated"), a stable split-brain the sweep found
          // at C=2 (three duplicated home cells for 20k ticks). Both rings'
          // greeters share the ONE door: a pool-listed id that appears
          // NOWHERE in my occ is a greeter of a ring I cannot see — greet it.
          // The HELLO carries my coord; if we contest a cell, E2 settles it
          // (lower id wins, the loser requeues through the door into the
          // winning ring), and mutual occ learning cascades the rest. Under a
          // TRUE partition the HELLO is undeliverable, so the two-clean-homes
          // doctrine is untouched. Paced naturally by the E3 re-knock cadence
          // that delivers this reply.
          // …and ONLY from a COMPLETE home view: a stranger in the pool
          // while my C×C home has holes is an ordinary join/churn transient
          // (its seat simply hasn't reached my occ yet), and greeting through
          // those transients perturbed unrelated settling (the compaction
          // repro's lone-row pin). A stranger in the pool while I hold a
          // FULL home is the two-ring signature exactly: there is no seat
          // left it could be sitting in that I cannot see.
          // …and DORMANT until the stranger PERSISTS: a freshly-promoted S1
          // seat reads as a stranger to a stale-but-full view for a beat
          // (S1SYNC catches up well inside one E3 cycle), and greeting
          // through that transient perturbed unrelated settling (the
          // compaction lone-row pin). Only a stranger seen in TWO
          // consecutive E3 replies — hundreds of ticks apart — while my home
          // stays full is a rival ring.
          // …and only from QUIESCENCE (the Q2 hysteresis doctrine): mid-
          // churn a greeter's "full" home view is routinely full of corpses
          // while the pool already lists their replacements — greeting
          // through that window fired 157 times in the compaction shrink
          // scenario and perturbed its pinned settle. A rival ring is a
          // STABLE state: nothing churns, and the strangers persist —
          // exactly what this detector should see.
          if (this.state === 3 && this.coord.pc === 0 && TICK - this.seatedAt > 80 && TICK - this.lastChurn > 300 && TICK - this.healAt > 300) {
            let full = true;
            for (let r = 0; r < C() && full; r++) for (let i = 0; i < C() && full; i++) if (!this.occ.has(ck({ pc: 0, r, i }))) full = false;
            if (full) {
              const known = new Set(this.occ.values());
              const next = new Map();
              for (const g of m.list) if (g != null && g !== this.id && !known.has(g)) {
                const seen = (this.strangeSeen && this.strangeSeen.get(g) || 0) + 1; next.set(g, seen);
                if (seen >= 8) { this.emit(g, { t: 'HELLO', ck: ck(this.coord), id: this.id }); next.delete(g); } // 8 consecutive E3 cycles ≈ 1600-3200 ticks: an order past any legit staleness window (live mates' S1SYNC overwrites a non-first-hand corpse cell within beats), far inside a standoff's lifetime
              }
              this.strangeSeen = next; // ids no longer listed/known drop out
            } else if (this.strangeSeen) this.strangeSeen.clear();
          }
          return;
        }
        case 'WHOHOME': {
          if (!this.hasCoord) { this.emit(m.from, { t: 'HOME' }); return; }
          if (m.ttl <= 0) return;
          if (this.coord.pc === 0) {
            // App may attach Stage / Stadium face lists for R5 pick-one UI.
            let stage = [], stadium = [];
            try {
              if (typeof this.env.homeFaces === 'function') {
                const f = this.env.homeFaces() || {};
                stage = (f.stage || []).map(String);
                stadium = (f.stadium || []).map(String);
              }
            } catch (e) {}
            this.emit(m.from, {
              t: 'HOME', roster: this.s1Roster(), id: this.id, gkey: this.genKey,
              stage, stadium,
            });
            return;
          }
          const fwd = (x) => { if (x != null && x !== this.id && x !== m.via) { this.emit(x, { t: 'WHOHOME', from: m.from, via: this.id, ttl: m.ttl - 1 }); return true; } return false; };
          if (this.coord.i !== 0) { if (fwd(this.occGet(ck({ pc: this.coord.pc, r: this.coord.r, i: 0 })))) return; } else { if (fwd(this.ownerId())) return; }
          const x = topo.crossLink(this.coord); if (x && fwd(this.occGet(ck(x)))) return;
          const rm = topo.rowMates(this.coord); for (const mate of rm) { const cx = topo.crossLink(mate); if (cx && fwd(this.occGet(ck(cx)))) return; }
          return;
        }
        case 'HOME': {
          if (this.triedSilent && m.id != null) this.triedSilent.delete(m.id); // it answered — not silent
          // R5 multi-greeter probe: collect samples; cluster later.
          if (this.forkProbe && this.state === 1 && !this.forkPaused) {
            this.lastReach = TICK;
            if (this.forkPending > 0) this.forkPending--;
            const gk = m.gkey != null ? String(m.gkey) : '';
            if (gk && m.roster && m.roster.length) {
              const faces = (m.roster || []).map((e) => (e && (e.v != null ? e.v : e))).filter(Boolean).map((v) => String(v).slice(0, 12));
              this.forkSamples.push({
                gkey: gk,
                gateway: m.id != null ? m.id : this.gateway,
                roster: m.roster,
                stage: (m.stage || []).map(String),
                stadium: (m.stadium || []).map(String),
                faces,
              });
            }
            this.maybeResolveFork();
            return;
          }
          if (m.gkey != null) this.genKey = m.gkey; // learn this meeting's genesis key (the dance)
          if (this.state === 1) { if (!m.roster || !m.roster.length) { this.retryAt = TICK - 10; return; } this.roster = m.roster; this.haveRoster = true; this.lastReach = TICK; this.seatTries = 0; this.resumeTries = 0; const t = this.pickRoster(); if (t != null) this.askSeat(t); else this.retryAt = TICK - 10; } // reached a greeter: note it for R6; a landed HOME re-arms the resume budget
          else if (this.state === 3 && m.roster && m.roster.length) { this.roster = m.roster; this.haveRoster = true; }
          return;
        }
        case 'FIND': if (m.tag === 1) this.serveCompact(m); else { this.findNc = m.nc; try { this.serveFind(m); } finally { this.findNc = null; } } return; // Q2: tag==1 is a compaction probe (up-chain walk), never newcomer admission. Untagged: the seeker is at the door for the whole scan (knock-is-evidence phantom scope — 03c)
        case 'FINDLEAF': if (!this.verifyFill(m)) return; this.findLeaf(m.hole, m.nbrs, m.ttl); return; // S4 identity hook gates fill authorship
        case 'PLACE':
          if (this.state === 2 && this.verifyFill(m)) { this.take(m.coord, m.owner, m.nbrs); return; } // S4 identity hook
          // Q2: a compaction PLACE for a seated leaf — atomically MOVE (law T
          // dual-hold) into the shallower cell, keeping the old seat warm until
          // confirm. Re-validate at the moment of action (the frontier may have
          // shifted while the PLACE routed): I am the named seeker, still a
          // trailing leaf, not already moving, STRICTLY shallower — else drop and
          // let the next probe retry. A contested destination is caught by E2 →
          // rollbackMove (never homeless).
          if (this.state === 3 && m.tag === 1 && m.nc === this.id && this.verifyFill(m)
              && this.hasCoord && !this.moving && !this.hasChildren()
              && topo.pcDepth(m.coord.pc) < topo.pcDepth(this.coord.pc) && !this.firstHandLive(ck(m.coord))) {
            let trailing = true; for (let j = this.coord.i + 1; j < C(); j++) if (this.occGet(ck({ pc: this.coord.pc, r: this.coord.r, i: j })) != null) { trailing = false; break; }
            if (trailing) { this.compactMoves++; this.doMove(m.coord, m.owner, m.nbrs); }
          }
          return;
        // The refusal lifts the silent mark for its AUTHOR (m.id) and for the
        // target I ASKED (lastAsked): a descending FIND is answered by a
        // descendant, and erasing only the author left every successfully-
        // FORWARDING admitter permanently marked — join-storm retries then
        // scattered away from the funnel and deep sections filled row 1 before
        // row 0 (H7 dense-fill broken; sim hchain E + c-sweep, 2026-07-29). A
        // corpse answers NOTHING, so its mark stands — corpse-avoid untouched.
        case 'NOROOM': if (this.state === 2) { if (this.triedSilent && m.id != null) this.triedSilent.delete(m.id); if (this.triedSilent && this.lastAsked != null) this.triedSilent.delete(this.lastAsked); this.retryAt = TICK; if (this.haveRoster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t != null) { this.askSeat(t); return; } } this.seatTries = 0; this.join(); } return;
        case 'HELLO': {
          // A HELLO is FIRST-HAND: its sender (m.id) is speaking on a link it
          // holds to me, claiming coord m.ck — it sets first-hand liveness.
          if (this.hasCoord && this.state === 3 && m.ck === ck(this.coord) && m.id !== this.id && m.id < this.id) { if (TICK - this.challAt > 20) { this.challAt = TICK; this.emit(m.id, { t: 'CHALLENGE', ck: m.ck, from: this.id }); } return; }
          const prev = this.occGet(m.ck);
          // E2: yield only between FIRST-HAND-LIVE claimants. A prev that is
          // only gossip (a phantom) is NOT first-hand live ⇒ no yield ⇒ the
          // real sender is accepted (bug #1). D5: an unanswered transport loss
          // ends my first-hand hearing of prev, so it no longer counts fresh.
          const prevFresh = (prev != null) && this.firstHandLive(m.ck) && !this.translost.has(m.ck);
          if (prev != null && prev !== m.id && prevFresh) this.emit(m.id > prev ? m.id : prev, { t: 'YIELD', ck: m.ck }); // two live seats at one coord: lower id wins, higher yields
          if (prev !== m.id) { this.setOcc(m.ck, m.id); if (this.hasCoord) this.emit(m.id, { t: 'HELLO', ck: ck(this.coord), id: this.id }); this._gspReplay(m.id); }
          this.liveMark(m.ck); // first-hand: I just heard m.id directly at m.ck
          this.noteS1(m.ck);
          // A, ATTRIBUTABLE (V4): only THE SOFT-SIT JOINER's own HELLO
          // self-confirms — a rival claimant or a promoted healer announcing
          // must not wipe a vouch it does not own (the wipe plus a LEAVE echo
          // read the cell FREE and the same head re-placed it every ~3 ticks).
          { const sit = this.sitting.get(m.ck); if (sit && sit.joiner === m.id) this.clearSoft(m.ck); }
          return;
        }
        case 'YIELD': if (this.hasCoord && this.state === 3 && ck(this.coord) === m.ck) { if (this.moving) this.rollbackMove(); else this.requeue(); } return; // T1: a mover contradicted at its NEW cell goes home, not homeless
        case 'CLAIM':
          if (!this.verifyFill(m)) return;
          // A: joiner self-confirm — upgrade sitting-down → seated.
          this.confirmSeated(m.ck, m.id);
          return;
        case 'LEAVE': {
          this.lastChurn = TICK; // Q2 hysteresis: a departure near me — hold off compaction until quiescent
          if (this.occGet(m.ck) === m.id) { this.occ.delete(m.ck); this.live.delete(m.ck); this.kidful.delete(m.ck); this.s1seen.delete(m.ck); this.tlForget(m.ck, 'leave'); this.healTry.delete(m.ck); } // freed ⇒ admissible now
          // A, ATTRIBUTABLE (V4): only the LEAVER'S OWN vouch clears — a soft
          // sit exists only for a cell that read FREE at admit time, so a
          // LEAVE naming this cell from anyone else is a PRIOR tenant's
          // departure echo arriving after the cell was re-vouched.
          { const sit = this.sitting.get(m.ck); if (sit && sit.joiner === m.id) this.clearSoft(m.ck); }
          if (m.mvd) { this.setOcc(m.mvd, m.id); this.noteS1(m.mvd); } // T3: the goodbye says WHERE it went — routing hint, first-hand
          // H-CHAIN vertical: vacated down-child clears childOf on its owner
          // so LEFT-PACK can devolve (childOf otherwise never expired).
          {
            const left = unck(m.ck);
            if (left.i === 0) {
              const par = topo.up(left);
              if (par) this.childOf.delete(ck(par));
            }
          }
          // H-CHAIN LEFT-PACK (reactive): first OCCUPIED seat strictly right
          // of the hole with empty intermediates heals it. Defer if LIVE
          // down-child (VERTICAL). Old col-1-only is chain length-1.
          if (HEALING && this.hasCoord && this.state === 3) {
            const c = unck(m.ck);
            // Defer to VERTICAL only when down-child OCC is present — stale
            // childOf on neighbours must not block LEFT-PACK forever.
            if (c.pc === this.coord.pc && c.r === this.coord.r && this.coord.i > c.i
                && this.occGet(ck(topo.down(c))) == null) {
              let first = true;
              for (let j = c.i + 1; j < this.coord.i; j++) if (this.occGet(ck({ pc: c.pc, r: c.r, i: j })) != null) { first = false; break; }
              if (first) { this.heal(c); return; }
            }
            // H-CHAIN S1 COLUMN-clique (reactive): same column, STRICTLY DEEPER
            // row (coord.r > hole.r) so scooch is UP into denser H7 territory.
            // Row-right empty = no firstHandLive. First col-mate between hole
            // and me (no wrap raid of upper rows). Defer VERTICAL if down OCC.
            if (this.coord.pc === 0 && c.pc === 0 && this.coord.i === c.i && this.coord.r > c.r
                && this.occGet(ck(topo.down(c))) == null) {
              let rowRightEmpty = true;
              for (let j = c.i + 1; j < C(); j++) if (this.firstHandLive(ck({ pc: 0, r: c.r, i: j }))) { rowRightEmpty = false; break; }
              if (rowRightEmpty) {
                let first = true;
                for (let rr = c.r + 1; rr < this.coord.r; rr++) {
                  if (this.occGet(ck({ pc: 0, r: rr, i: c.i })) != null) { first = false; break; }
                }
                if (first) { this.heal(c); return; }
              }
            }
          }
          return;
        }
        case 'GREETWALK': return; // H6 retired
        case 'S1SYNC': {
          // § G root fold: merge the relayed section table, freshest AUTHOR
          // stamp wins. Purely additive display state — it touches nothing
          // below this block.
          if (this.digOn() && this.hasCoord && this.coord.pc === 0 && m.digs) {
            for (const e of m.digs) {
              if (!isS1key(e.k)) continue;
              if (this.hasCoord && e.k === ck(this.coord)) continue; // never take a relayed claim about MY OWN section — I fold that first-hand
              if (TICK - e.d.at > DIG_TTL) continue;
              const it = this.s1tab.get(e.k); if (it === undefined || it.at < e.d.at) this.s1tab.set(e.k, e.d);
            }
          }
          // GOSSIP updates the ROSTER HINT (occ/s1seen) only — it NEVER evicts
          // a seat, NEVER sets `live`, and NEVER overwrites a cell I hold
          // FIRST-HAND. (E2: gossip may inform routing, but liveness is
          // first-hand only. The old gossip-requeue and gossip-YIELD were
          // phantom weapons — a stale echo could evict a live seat. Bug #1.)
          for (const e of m.ent) {
            const kk = e.k, eid = e.v, age = e.age;
            if (e.ch != null) this.childOf.set(kk, e.ch); // learn this cell's heir — feeds cousins-in-PONG
            if (this.hasCoord && kk === ck(this.coord) && eid !== this.id) continue; // gossip claims MY seat: IGNORE — a genuine duplicate is settled by a first-hand witness, never an echo
            if (this.firstHandLive(kk)) continue; // I have first-hand truth here — gossip can't resurrect a moved/dead occupant over it
            if (this.translost.has(kk)) continue; // D5: my standing first-hand observation (transport died, probe unanswered) outranks an echo — gossip must not re-seat the corpse; any answer or a genuine refill clears the observation and gossip resumes
            const seen = TICK - age - 2; const cur = this.occGet(kk); const curSeen = this.s1seen.has(kk) ? this.s1seen.get(kk) : -999;
            // CLAIM BIRTH (2026-08-02): the ±8 lower-id tie-break exists to
            // resolve SIMULTANEOUS claims, but the freshness stamps it
            // compares are hop-laundered — max(curSeen, seen) lets a
            // displacing entry inherit the displaced occupant's freshness,
            // so a join-era ghost claim re-won ties FOREVER (an immortal
            // gossip echo that, when a sever opened a first-hand gap at one
            // arbiter, evicted a live seat — mesh-harness D5-sever). Honest
            // hop-ages broke legit races instead (a tie-win stored stale
            // went phantom and double-admitted: c-sweep dups). The
            // launder-proof signal is END-TO-END: every entry carries b —
            // the tick its (cell → claimant) pairing was first established,
            // relayed UNCHANGED — and a claim BORN more than 600 ticks ago
            // may never win a tie. A ghost's birth is ancient by definition;
            // every legit contender's is recent.
            if (seen > curSeen + 8 || (seen >= curSeen - 8 && cur != null && eid < cur && (e.b == null || e.b < 0 || TICK - e.b <= 600))) { this.s1seen.set(kk, Math.max(curSeen, seen)); if (cur !== eid) { this.setOcc(kk, eid); this.born.set(kk, (e.b != null && e.b >= 0) ? e.b : TICK); } }
            else if (cur == null && seen > -999) { this.s1seen.set(kk, seen); this.setOcc(kk, eid); this.born.set(kk, (e.b != null && e.b >= 0) ? e.b : TICK); }
          }
          return;
        }
        case 'DRAIN': {
          if (!this.hasCoord || this.state !== 3 || this.coord.pc === 0 || this.drainAt) return;
          this.roster = m.roster; this.haveRoster = true; const rc = this.rosterCells(); for (let c = 0; c < C(); c++) { const x = this.occGet(ck(rc[c])); if (x != null && x !== this.id) this.emit(x, { t: 'DRAIN', roster: m.roster }); } this.drainAt = TICK + 6 + (this.rng() * 12 | 0); this.wake(); return;
        }
        case 'CHALLENGE': if (this.evil) { this.emit(m.from, { t: 'CONFIRM', ck: m.ck, id: this.id }); return; } if (this.hasCoord && this.state === 3 && ck(this.coord) === m.ck) this.emit(m.from, { t: 'CONFIRM', ck: m.ck, id: this.id }); return;
        case 'CONFIRM': if (this.hasCoord && this.state === 3 && ck(this.coord) === m.ck && m.id !== this.id && m.id < this.id) { if (this.moving) this.rollbackMove(); else this.requeue(); } return;
        case 'GSP': this._gspRecv(m); return;
        case 'MOVED': { // T3: the cell I phoned was vacated by a MOVE — first-hand vacancy + redirect, right now
          if (this.occGet(m.ck) === m.id) { this.occ.delete(m.ck); this.live.delete(m.ck); this.kidful.delete(m.ck); this.s1seen.delete(m.ck); this.healTry.delete(m.ck); } // freed ⇒ admissible now
          if (m.mvd) { this.setOcc(m.mvd, m.id); this.liveMark(m.mvd); this.noteS1(m.mvd); }
          this.wake(); return;
        }
        case 'SITXFER': {
          // V4: my assigner hands me my row's ledger — outstanding vouches
          // and its confirmed row occ. I am now the row's admitter, and these
          // cells are already promised or held.
          if (this.hasCoord && this.coord.pc === 0 && this.coord.i === 0 && ck(this.coord) === m.ck) {
            for (const kv of (m.vouches || [])) if (!this.occ.has(kv.k) && !this.sitting.has(kv.k)) this.sitting.set(kv.k, { joiner: kv.v, assigner: this.id, at: this.TICK, pingAt: -1 });
            for (const e of (m.rowOcc || [])) if (!this.occ.has(e.k)) { this.setOcc(e.k, e.v); this.noteS1(e.k); }
            this.rowLedger = true;
          }
          return;
        }
        case 'SITPING': {
          // V4: my assigner asks whether its vouch for me at m.ck is live.
          // Answer ONLY about the vouched cell: seated there (tag=1, a
          // re-CLAIM) or still seeking with the PLACE possibly in flight
          // (tag=0). Seated ELSEWHERE = silence — the vouch should free.
          if (m.id === this.id) {
            if (this.hasCoord && this.state === 3 && ck(this.coord) === m.ck) this.emit(m.from, { t: 'SITPONG', ck: m.ck, id: this.id, tag: 1 });
            else if (!this.hasCoord && this.state === 2) this.emit(m.from, { t: 'SITPONG', ck: m.ck, id: this.id, tag: 0 });
          }
          return;
        }
        case 'SITPONG': {
          if (!this.verifyFill(m)) return;
          const sit = this.sitting.get(m.ck);
          if (sit && sit.joiner === m.id) {
            if (m.tag === 1) this.confirmSeated(m.ck, m.id);            // the lost CLAIM, replayed first-hand
            else { sit.at = this.TICK; sit.pingAt = -1; }               // alive and still seeking: restart the clock
          }
          return;
        }
        case 'PHONE': this.onPhone(m); return;
        case 'PONG': {
          this.lastAck = TICK;
          // FIRST-HAND: the responder spoke to me directly on our rook link.
          const pid = (m.id != null) ? m.id : m.from;
          if (this.hasCoord && m.coord && m.coord.pc === 0 && pid != null) { this.setOcc(ck(m.coord), pid); this.liveMark(ck(m.coord)); this.noteS1(ck(m.coord)); }
          if (m.owner != null && this.occGet(m.oCk) !== m.owner) { this.setOcc(m.oCk, m.owner); this.noteS1(m.oCk); }
          for (const e of m.row) { if (this.occGet(e.k) !== e.v) this.setOcc(e.k, e.v); this.noteS1(e.k); if (e.age != null) this.childOf.set(e.k, e.age); }
          for (const kv of m.nbrs) this.cousins.set(kv.k, kv.v); // W: learn the heirs at my future owned-links for relay-free promote-up
          // ---- § G DOWN-LEG + the AUTHOR'S REFUTATION --------------------
          // G4: I check ONE thing — that the fold my aggregator published
          // still contains the contribution I authored. An owner's subtree is
          // exactly 1 + the row digest I (its down-child) sent it; a head's
          // row fold must contain my subtree digest. A SHORTFALL below what I
          // sent is suppression; anything else is staleness or growth, never
          // evidence. G5: the remedy is a counter and a diagnostic — it
          // evicts NOTHING (an eviction lever here would hand an attacker
          // exactly what G1 denies). G4 grace on a CHANGED AGGREGATOR: a
          // healer just promoted into my owner's/head's cell has folded
          // nothing from me yet and legitimately echoes nothing — the
          // relationship, not my history, is what has to be 2*DIG_TTL old.
          if (this.digOn() && this.hasCoord && this.coord.pc !== 0) {
            if (m.dgRoot && m.dgRoot.at >= 0 && m.dgRoot.at > this.rootDig.at) this.rootDig = m.dgRoot; // the room fold, one level per period (staleness O(depth x period))
            if (m.dgPub && m.dgPub.at >= 0 && m.coord) {
              const oc = this.ownerCoord();
              const isOwner = this.coord.i === 0 && !!oc && ck(m.coord) === ck(oc);
              const isHead = this.coord.i > 0 && m.coord.pc === this.coord.pc && m.coord.r === this.coord.r && m.coord.i === 0;
              if (isOwner || isHead) {
                if (pid !== this.lastAgg) { this.lastAgg = pid; this.upSince = TICK; this.emptyEcho = 0; }
                else {
                  const echo = (m.dgEcho && m.dgEcho.at != null) ? m.dgEcho : dig0();
                  if (this.upRefuted(m.dgPub, echo, isOwner ? 1 : 0)) {
                    this.digMismatch++;
                    if (this.onDigMismatch) { try { this.onDigMismatch({ arm: this.digArm, tick: TICK, meId: this.id, me: { pc: this.coord.pc, r: this.coord.r, i: this.coord.i }, aggId: pid, agg: { pc: m.coord.pc, r: m.coord.r, i: m.coord.i }, pub: m.dgPub, echo }); } catch (e) {} }
                  }
                }
              }
            }
          }
          return;
        }
        case 'ROUTE': {
          if (!this.hasCoord) return;
          if (ck(this.coord) === ck(m.target)) {
            if (m.tag === 3) { this.probeAck.set(m.ack, TICK); this.tlLog.push([m.ack, TICK, 'pa:tag3-answer from ' + String(m.id || m.via || '?').slice(0, 6)]); if (this.tlLog.length > 24) this.tlLog.shift(); return; } // a D5 probe ANSWER routed back around the dead link — the probed peer LIVES
            if (m.tag === 2 && m.acoord) {
              // D5 translost probe reached me: I am alive — answer AROUND the
              // dead link (first hop excludes the asker; my direct link to it
              // is presumably the one that died), so the answer survives a
              // one-sided severance. The plain ROUTED below still covers the
              // healthy-path case.
              const nh2 = this._probeHop(m.acoord, m.asker);
              if (nh2 != null) this.emit(nh2, { t: 'ROUTE', target: m.acoord, asker: this.id, tag: 3, ttl: 60, via: this.id, ack: ck(this.coord) });
            }
            this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: this.id }); return;
          }
          if (m.ttl <= 0) { this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null }); return; }
          // FORWARD WITH THE PROBE PAYLOAD (2026-08-02): the re-minted hop
          // used to drop `ack` (the tag-3 answer's coord) and `acoord` (the
          // tag-2 probe's return address), so any D5 answer that actually
          // ROUTED AROUND the dead link arrived empty — probeAck stamped an
          // undefined key, the observation never cleared, and a LIVE severed
          // peer was early-confirmed dead. Never worked past one hop.
          const nh = this.nextHopToward(m.target, m.via); if (nh != null) { this.emit(nh, { t: 'ROUTE', target: m.target, asker: m.asker, tag: m.tag, ttl: m.ttl - 1, via: this.id, acoord: m.acoord, ack: m.ack }); return; }
          this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null }); return;
        }
        case 'ROUTED': if (m.tag === 1 || m.tag === 2) { if (m.id != null && this.hasCoord) { this.setOcc(ck(m.target), m.id); this.noteS1(ck(m.target)); this.probeAck.set(ck(m.target), TICK); this.tlLog.push([ck(m.target), TICK, 'pa:routed-tag' + m.tag + ' id=' + String(m.id).slice(0, 6)]); if (this.tlLog.length > 24) this.tlLog.shift(); this.emit(m.id, { t: 'HELLO', ck: ck(this.coord), id: this.id }); } } return; // probeAck AFTER setOcc (a changed occupant clears the observation first)
        default: return;
      }
    }

    leave() {
      this.alive = false; this.moving = false; this.leaseCk = null; this.leaseUntil = -1;
      if (!this.hasCoord) return; const kk = ck(this.coord); const seen = new Set();
      for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: kk, id: this.id }); } }
      const o = this.ownerCoord(); if (o) { const oid = this.occGet(ck(o)); if (oid != null && !seen.has(oid)) this.emit(oid, { t: 'LEAVE', ck: kk, id: this.id }); }
    }

    tick() {
      if (!this.alive) return; const TICK = this.TICK;
      if (this.state !== 3) {
        // R6: stranded is RECOVERABLE — after a backoff the client re-knocks;
        // if a greeter is now reachable I seat, else I just strand again.
        if (this.stranded) { if (TICK - this.strandedAt > STRAND_TTL) { this.stranded = false; this.lastReach = -1; this.joinStart = -1; this.join(); } this.wake(); return; }
        if (this.forkProbe) this.maybeResolveFork(); // R5: settle multi-greeter HOME collection
        if (this.forkPaused) { this.wake(); return; } // waiting on human pick-one
        if (this.reAsk || this.reJoin) { // ENTRY PACING: fire the ask/knock deferred from a same-tick repeat (after the fork gate — a join() here must never wipe a pending pick-one)
          const a = this.reAsk; this.reAsk = false; this.reJoin = false;
          if (a && this.haveRoster && this.roster.length) { const t = this.pickRoster(); if (t != null) { this.askSeat(t); this.wake(); return; } }
          this.join(); this.wake(); return;
        }
        if ((this.state === 0 || this.state === 1) && TICK - this.retryAt > 20) { if (!this.resumeAsk()) this.join(); } // ENTRY RESUME: re-enter at WHOHOME while the greeter list is fresh; full knock only when it isn't
        // Graded state-2 retry, SOLE-CANDIDATE ONLY: with exactly one live
        // greeter to ask there is no second admission chain to race, so a void
        // FIND may re-ask after 12 ticks instead of 60 — before this, one
        // swallowed FIND cost a human 30 seconds of "Just you" in a 2-person
        // room (the unban-rejoin wedge, 2026-07-29). With MULTIPLE candidates
        // the full window stands: a fast re-pick abandons a merely-SLOW
        // admitter hand-off chain mid-walk and the twin PLACE races leave
        // shape holes (sim join-patterns N=9-11 serial caught exactly that).
        else if (this.state === 2 && TICK - this.retryAt > ((this.seatTries === 0 && this.roster.filter((e) => e.v !== this.id).length === 1) ? 12 : 60)) { if (this.haveRoster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t != null) this.askSeat(t); else if (!this.resumeAsk()) this.join(); } else { this.seatTries = 0; if (!this.resumeAsk()) this.join(); } } // ENTRY RESUME on roster exhaustion too: a fresh WHOHOME beats a fresh knock
        this.wake(); return;
      }
      if (this.evil) this.attack();
      // T: transit bookkeeping — a claim window that closes with NO
      // contradiction CONFIRMS (a wiped region has nobody to answer; a
      // contradiction would have rolled back already); the tombstone
      // self-expires (T3).
      if (this.moving && TICK - this.moveAt > CONFIRM_TTL) this.confirmMove();
      if (this.leaseUntil >= 0 && TICK > this.leaseUntil) { this.leaseCk = null; this.leaseUntil = -1; }
      this.recheckSitting(); // A: assigner frees soft sitting-down if PLACE never confirmed
      if (this.coord.pc === 0) {
        if (this.anyRookLive()) this.rookSeenAt = TICK;   // fragment detector: reset while I hear anyone
        // D1 over the rook: phone every live row+column neighbour each beat
        // (maintains first-hand liveness across all redundant home paths).
        if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.rollup(); this.s1Heartbeat(); this.s1Sync(); this._gspRefan(); } // § G: ONE fold per node per period, O(C) work, before the beat carries it
        // 11a: every Section-1 cell is refilled by its down-child (VERTICAL);
        // s1Fill is the head's probe-gated LAST-RESORT backstop. While a D5
        // transport-loss observation is pending, check every beat (not every
        // 12) so the early confirm isn't left waiting on the slow cadence —
        // heal()'s own cooldowns keep this storm-free.
        this.tlSweep(); // D5: a confirmed corpse leaves my view early (cleanup, not healing)
        if (this.coord.i === 0 && ((TICK % 12) === 0 || this.translost.size)) { this.rowSweep(); this.s1Fill(); }
        // H2 LEFT-PACK backstop (proactive, probe-gated): when my row has NO
        // live head, the head can't run its backstop, so the row rebuilds
        // itself leftward — I heal my immediate LEFT neighbour (the head if I
        // am column 1). Cascades toward the head, each cell only once its left
        // is confirmed dead. Restricted to headless rows so it never races the
        // head's s1Fill. This is what rebuilds an all-heads-dead column-0 (bug #4).
        // (D5: a pending transport-loss for the head counts as "no live head" —
        // my own link to it died; firstHandLive may linger up to 60 ticks.)
        if (this.coord.i >= 1 && TICK - this.healAt > 20 && (!this.firstHandLive(ck({ pc: 0, r: this.coord.r, i: 0 })) || this.translost.has(ck({ pc: 0, r: this.coord.r, i: 0 })))) {
          const lft = { pc: 0, r: this.coord.r, i: this.coord.i - 1 }; const lk = ck(lft);
          // Defer to VERTICAL only when down-child OCC present (not stale childOf).
          const defer = this.translost.has(lk) && this.occGet(ck(topo.down(lft))) != null;
          if (!defer && this.ringConfirmDead(lft)) { if (this.occ.has(lk)) { this.occ.delete(lk); this.live.delete(lk); this.s1seen.delete(lk); this.kidful.delete(lk); } this.holeSince.delete(lk); this.heal(lft); }
        }
        // W7: keep column links live — re-ping any vacant column-mate
        if (TICK >= this.xlinkAt) { this.xlinkAt = TICK + 150 + (this.rng() * 100 | 0); for (const cm of topo.colMates(this.coord)) if (this.occGet(ck(cm)) == null) this.routeTo(cm, 1); }
        if (this.s1CheckAt < 0) this.s1CheckAt = TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0);
        if (TICK >= this.s1CheckAt) { this.s1CheckAt = TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0); this.emitRelay(this.genKey); } // E3 re-knock: Section-1 seats ARE the greeter pool
        this.wake(); return;
      }
      if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.rollup(); this.phoneHome(); this._gspRefan(); } // § G: ONE fold per node per period (<= C reports in, ONE out), then the beat carries it up
      this.tlSweep(); // D5: a confirmed corpse leaves my view early (cleanup, not healing)
      if (this.coord.i === 0 && (TICK % 12) === 0) this.rowSweep();
      // 11a HORIZONTAL: only a CHILDLESS head needs a horizontal healer (its
      // row depends on it, nothing below to pull up); its fixed healer is
      // {pc,r,1}. A head WITH a subtree is healed by its down-child (VERTICAL).
      // occGet==null = definite LEAVE, so severance never false-heals. (bug #3:
      // the hasDownChild gate is what keeps s1Fill and this healer from racing.)
      // D5 early path: my own DC to the head died and the confirm probe went
      // unanswered — confirmed dead now; clear the corpse and heal. The
      // occGet==null + lastAck>60 branch remains the horizon backstop.
      if (this.coord.i === 1 && TICK - this.healAt > 20) {
        const hd = { pc: this.coord.pc, r: this.coord.r, i: 0 }; const hdk = ck(hd);
        const hdEarly = this.translostConfirmed(hdk);
        if ((hdEarly || (TICK - this.lastAck > 60 && this.occGet(hdk) == null)) && !this.hasDownChild(hd)) {
          if (hdEarly) { this.occ.delete(hdk); this.live.delete(hdk); this.s1seen.delete(hdk); this.kidful.delete(hdk); }
          this.heal(hd);
        }
      }
      if (this.coord.i > 0 && TICK >= this.xlinkAt) { this.xlinkAt = TICK + 150 + (this.rng() * 100 | 0); const x = topo.crossLink(this.coord); if (x && this.occGet(ck(x)) == null) this.routeTo(x, 1); }
      if (this.drainAt && TICK >= this.drainAt) { this.reseatViaRoster(); return; }
      // 11a VERTICAL (the down-child is the fixed healer of its owner;
      // generalizes H8): I am a head, so my owner cell O = up(me) is the cell
      // whose down-child I am. If O is DEAD (occ cleared by a definite LEAVE,
      // NOT mere severance) AND has stopped PONGing me for a settled window
      // (positive death confirmation — no promoting a leaf on a transient occ
      // glitch), I heal O by promoting a LEAF from my subtree up into it (P:
      // only leaves move; I move only when I am childless), wired with my
      // cousins (O's heir neighbourhood, learned from O's PONG).
      let didHeal = false;
      if (this.coord.i === 0 && TICK - this.healAt > 20) { // cousins may be EMPTY — a ghost owner never PONGed, so it taught no heir neighbourhood; nbrs fall back to the hole's owned-link occupants below
        const oc = this.ownerCoord(); const ok = oc ? ck(oc) : null;
        // H1-S1 CONSERVATISM: promoting into a SECTION-1 owner is the one move
        // that can mint a divergent home — it waits the full RING_HOLD window.
        const confirm = (oc && oc.pc === 0) ? RING_HOLD : 60;
        // D5 early path: I hold the down-link DC to my owner; it died and the
        // confirm probe went unanswered across the mesh — first-hand confirmed
        // death (equivalent to a LEAVE), no silence horizon to wait out. The
        // horizon branch (occ cleared + lastAck past the confirm window)
        // remains the backstop. An owner whose probe answers is never touched.
        const ownEarly = ok != null && this.translostConfirmed(ok);
        if (oc && (ownEarly || (this.occGet(ok) == null && TICK - this.lastAck > confirm)) && TICK - (this.healTry.has(ok) ? this.healTry.get(ok) : -999) > 45) {
          if (ownEarly) { this.occ.delete(ok); this.live.delete(ok); this.s1seen.delete(ok); this.kidful.delete(ok); }
          this.healTry.set(ok, TICK); this.healAt = TICK; didHeal = true;
          const nb = []; for (const [k, v] of this.cousins) nb.push({ k, v });
          if (!nb.length) { for (const olc of topo.ownedLinks(oc)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) nb.push({ k: ck(olc), v: x }); } }
          const rc = this.rosterCells(); const ix = this.shuf(Array.from({ length: C() }, (_, k) => k)); let sent = false;
          for (const q of ix) { const x = this.occGet(ck(rc[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FINDLEAF', hole: oc, nbrs: nb, ttl: 40 }); sent = true; break; } }
          if (!sent) this.promoteInto(oc, nb); // I'm childless ⇒ I AM the leaf
        }
      }
      // 11a: draining is severance-immune, like healing. A seat drains only
      // when its ANCHOR is CONFIRMED dead (occ cleared by a LEAVE), not merely
      // silent — a 40-200-tick severance recovers WITHOUT churning out and
      // back. The lastAck>220 E1 last-resort still catches a genuinely
      // orphaned seat whose anchor died without a deliverable LEAVE.
      let ancDead = false;
      if (this.hasCoord) { if (this.coord.i !== 0) ancDead = this.occGet(ck({ pc: this.coord.pc, r: this.coord.r, i: 0 })) == null; else { const anc = this.ownerCoord(); if (anc) ancDead = this.occGet(ck(anc)) == null; } }
      if (!didHeal && TICK - this.lastAck > 80 && (ancDead || TICK - this.lastAck > 220)) this.drainOrReenter();
      else if (!didHeal) this.tryCompact(); // Q2: only when not draining/healing this tick — pack the tree upward when settled
      this.wake();
    }
    // Q2 — COMPACTION probe. A settled DEEP LEAF (childless: P — only leaves move,
    // so its departure strands nobody) periodically sends a probe UP its own ALIVE
    // up-chain for a STRICTLY-SHALLOWER occupied row to densify into. Rate-limited
    // + local-quiescence-gated so a healing boundary never sloshes; strict
    // improvement makes depth a monotone potential ⇒ MOVES provably settle. Never
    // a Section-1 seat (already shallowest; greeter role) and never a non-leaf.
    tryCompact() {
      if (!this.env.COMPACTION) return; // opt-in (mesh-wire enables it; harness/tests toggle)
      const TICK = this.TICK;
      if (!this.hasCoord || this.state !== 3 || this.coord.pc === 0 || this.moving) return; // S1 is the top; a mover finishes first
      if (TICK < this.compactAt) return; // rate limit / hysteresis
      // HYSTERESIS: compact only from a QUIESCENT neighbourhood. A LEAVE/heal/move
      // I saw nearby resets lastChurn, so during a heal storm compaction lies
      // dormant region-wide and only wakes once the dust settles.
      if (TICK - this.seatedAt < COMPACT_SETTLE || TICK - this.healAt < COMPACT_SETTLE || TICK - this.lastChurn < COMPACT_SETTLE) return;
      if (this.hasChildren()) return; // P: only a leaf may move
      // CLEAN-DEPARTURE gate: only the RIGHTMOST occupant of my row may compact,
      // so my leaving shortens the row (a trailing hole, C2) and never orphans a
      // row-mate into a headless row.
      for (let j = this.coord.i + 1; j < C(); j++) if (this.occGet(ck({ pc: this.coord.pc, r: this.coord.r, i: j })) != null) return;
      this.compactAt = TICK + COMPACT_PERIOD + (this.rng() * COMPACT_PERIOD | 0);
      // Send a compaction probe UP my own chain: to my row head (a direct row
      // link), or, if I AM a childless head, straight to my owner. Every hop
      // rides an ALIVE link, so the probe never depends on routing across a
      // fragmented mesh or on a shallow seat's stale view. serveCompact climbs to
      // the nearest strictly-shallower OCCUPIED row and seats me beside it; the
      // admitter routes the PLACE back. A dropped probe just retries next period.
      let up1 = (this.coord.i !== 0) ? this.occGet(ck({ pc: this.coord.pc, r: this.coord.r, i: 0 })) : null;
      if (this.coord.i === 0) { const o = this.ownerCoord(); if (o) up1 = this.occGet(ck(o)); }
      if (up1 == null || up1 === this.id) return;
      this.emit(up1, { t: 'FIND', nc: this.id, tag: 1, coord: this.coord, ttl: COMPACT_TTL });
    }
  }

  GifOS.mesh = { Seat, keyHash, RELAY_TTL, RELAY_CAP, E3_PERIOD, STRAND_TTL, RING_HOLD, EARLY_HOLD, CONFIRM_TTL, LEASE_TTL, DIG_TTL, DIG_LOSS_H, isS1key, ownerCoordOf };
})(typeof window !== 'undefined' ? window : globalThis);
