/*
 * mesh.js — the GifOS no-root mesh CONTROL PLANE, a faithful port of the C++
 * reference sim (sim/mesh.cpp + sim/mesh_seat.inc + sim/topo.h). This is the
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

  // ---- constants (mirror sim/mesh.cpp — SWEPT values, tuned for C=5 and the
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
  const RING_HOLD = 220;     // sim/mesh.cpp RING_HOLD
  // D5 EARLY-PROBE (healing-laws D5): when MY OWN transport to a neighbour dies
  // (DataChannel close / hard pc failure — a FIRST-HAND observation, never
  // gossip), the confirm probe may start immediately instead of waiting out the
  // silence horizon. EARLY_HOLD is the settled window the probe gets on the
  // mesh's redundant paths before the death is confirmed: long enough for a
  // probe round trip plus a retry (probes re-fire every ~6 ticks while
  // pending), short enough that an ungraceful death is confirmed in seconds.
  // The horizon (60 / RING_HOLD) remains the backstop when no transport event
  // fired; an answered probe clears the observation entirely.
  const EARLY_HOLD = 12;     // sim/mesh.cpp EARLY_HOLD
  // T — the mover's lease (atomic seat switching, healing-laws.md law T).
  // A self-move TAKES its new seat FIRST and vacates the old one only when the
  // claim CONFIRMS; a contradiction rolls the mover back to its still-held old
  // seat. After confirm the old cell keeps a bounded FORWARDING TOMBSTONE.
  const CONFIRM_TTL = 16;    // sim/mesh.cpp CONFIRM_TTL
  const LEASE_TTL = 40;      // sim/mesh.cpp LEASE_TTL
  // Q2 — COMPACTION (roadmap §3, healing-laws law T): a settled deep LEAF that a
  // fresh probe would place STRICTLY SHALLOWER walks its own ALIVE up-chain and
  // joins the nearest strictly-shallower OCCUPIED row (densify) via an atomic
  // law-T move. Rate-limited + local-quiescence-gated so a healing boundary never
  // sloshes; depth is a monotone potential ⇒ MOVES provably settle.
  const COMPACT_PERIOD = 90; // sim/mesh.cpp COMPACT_PERIOD — min ticks between one leaf's compaction probes
  const COMPACT_SETTLE = 300; // sim/mesh.cpp COMPACT_SETTLE — quiescence window since seating / last heal / last move / last local churn. ABOVE the healing horizons so a mass-heal fully re-converges before compaction stirs the tree (a shorter window ~2x'd mass-heal convergence and flaked the churn sweep).
  const COMPACT_TTL = 30;    // sim/mesh.cpp COMPACT_TTL — up-chain hop budget for a compaction probe

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
      this.healTry = new Map(); this.cousins = new Map();
      this.kidful = new Map(); this.childOf = new Map();
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
      this.translost = new Map(); this.tlProbeAt = new Map(); this.probeAck = new Map();
      this.retryAt = -1; this.seatTries = 0; this.lastPhone = -99; this.lastAck = 0;
      this.healAt = -99; this.drainAt = 0; this.rosterAskAt = -999; this.xlinkAt = 0;
      this.seatedAt = 0; this.challAt = 0; this.s1CheckAt = -1;
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
    setOcc(k, v) { if (v === this.id && (!this.hasCoord || k !== ck(this.coord))) return; if (this.occ.get(k) !== v) this.tlForget(k); this.occ.set(k, v); }
    noteS1(k) { if (isS1key(k)) this.s1seen.set(k, this.TICK); }
    s1Fresh(k) { const it = this.s1seen.get(k); return it !== undefined && this.TICK - it < 120 && this.occ.has(k); }
    // E2 FIRST-HAND liveness: `live` is set ONLY by direct contact — a PHONE I
    // answered (onPhone), a HELLO/CLAIM its occupant sent me, a PONG from a rook
    // neighbour. GOSSIP (S1SYNC) never sets it. So firstHandLive is the ONLY
    // signal that may evict/tie-break: a phantom (a stale gossip echo of a seat
    // that has moved) is NOT first-hand live, so it can never yield a live
    // healer out of a hole. Echo-immune — gossip informs routing, never liveness.
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
        if (this.occGet(k) !== pid || this.translost.has(k)) continue;
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
      if ((lv !== undefined && lv >= at) || (pa !== undefined && pa >= at)) { this.tlForget(k); return false; }
      const pAt = this.tlProbeAt.get(k);
      if (pAt === undefined || this.TICK - pAt >= 6) { this.tlProbeAt.set(k, this.TICK); this.routeToProbe(unck(k)); }
      return this.TICK - at > EARLY_HOLD;
    }
    tlForget(k) { this.translost.delete(k); this.tlProbeAt.delete(k); this.probeAck.delete(k); }
    tlClear() { this.translost.clear(); this.tlProbeAt.clear(); this.probeAck.clear(); }
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
        if (this.occ.has(k)) { this.occ.delete(k); this.live.delete(k); this.kidful.delete(k); this.s1seen.delete(k); }
      }
    }
    ownedRowHead() { return { pc: topo.childPath(this.coord.pc, this.coord.i), r: this.coord.r, i: 0 }; }
    rosterCells() { const h = this.ownedRowHead(); const out = []; for (let c = 0; c < C(); c++) out.push({ pc: h.pc, r: h.r, i: c }); return out; }
    // 11a FRONTIER-ONLY ADMISSION: admit a newcomer only into a TRUE frontier
    // slot — a free cell whose down-child is NOT occupied. A free cell that
    // still owns a subtree is an INTERNAL hole: its fixed healer (that
    // down-child, VERTICAL) is already filling it; a newcomer there would
    // double-book, lose the race, requeue OUT, and leave a gossip phantom
    // permanently blocking refill (bug #2). Skip it; serveFind forwards deeper.
    firstFreeInRoster() { for (const rc of this.rosterCells()) { if (this.occ.has(ck(rc))) continue; if (this.occGet(ck(topo.down(rc))) != null) continue; return rc; } return null; }
    ownerCoord() { if (!this.hasCoord || this.coord.pc === 0) return null; return topo.up({ pc: this.coord.pc, r: this.coord.r, i: 0 }); }
    ownerId() { if (!this.hasCoord) return null; const u = topo.up({ pc: this.coord.pc, r: this.coord.r, i: 0 }); if (!u) return null; return this.occGet(ck(u)); }
    hasChildren() { for (const rc of this.rosterCells()) { const x = this.occGet(ck(rc)); if (x != null && x !== this.id) return true; } return false; }
    // 11a: does cell c own an OCCUPIED down-child (so its fixed healer is that
    // down-child, the VERTICAL rule — the right-neighbour must then DEFER)?
    // Known either directly (I link down(c)) or via childOf learned from PONGs.
    hasDownChild(c) { if (this.occGet(ck(topo.down(c))) != null) return true; const it = this.childOf.get(ck(c)); return it !== undefined && it != null; }
    pickRoster() { const liveIds = []; for (const e of this.roster) if (e.v !== this.id) liveIds.push(e.v); if (!liveIds.length) return null; return liveIds[(this.rng() * liveIds.length) | 0]; }
    s1Roster() { const out = []; if (this.hasCoord && this.coord.pc === 0) out.push({ k: ck(this.coord), v: this.id }); for (const [k, v] of this.occ) if (isS1key(k) && v !== this.id && this.s1Fresh(k)) out.push({ k, v }); return out; }

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
      this.state = 0; this.retryAt = this.TICK; this.haveRoster = false;
      this.forkProbe = false; this.forkPaused = false; this.forkSamples = [];
      this.forkOpts = new Map(); this.forkPending = 0;
      if (this.joinStart < 0) this.joinStart = this.TICK;
      this.emitRelay(this.myKey); this.wake();
    }
    askSeat(target) { this.state = 2; this.retryAt = this.TICK; this.emit(target, { t: 'FIND', nc: this.id, ttl: 200 }); this.wake(); }
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
    // Cluster HOME samples: different gkey always split; same gkey splits when
    // rosters are disjoint (the real split-room door case).
    clusterForkSamples(samples) {
      const clusters = []; // each: { gkey, gateway, roster, stage, stadium, faces, peers }
      for (const s of samples) {
        const peers = Seat.rosterPeers(s.roster);
        let placed = false;
        for (const c of clusters) {
          if (c.gkey !== s.gkey) continue;
          if (Seat.rostersOverlap(c.peers, peers)) {
            // merge into existing same-key cluster (union faces / prefer richer stage)
            for (const p of peers) c.peers.add(p);
            if ((s.stage || []).length > (c.stage || []).length) c.stage = s.stage;
            if ((s.stadium || []).length > (c.stadium || []).length) c.stadium = s.stadium;
            if ((s.roster || []).length > (c.roster || []).length) { c.roster = s.roster; c.gateway = s.gateway; }
            placed = true; break;
          }
        }
        if (!placed) {
          clusters.push({
            gkey: s.gkey, gateway: s.gateway, roster: s.roster,
            stage: s.stage || [], stadium: s.stadium || [], peers,
          });
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
      this.coord = c; this.hasCoord = true; this.state = 3; this.joinStart = -1; this.stranded = false;
      this.occ.set(ck(c), this.id); this.noteS1(ck(c));
      for (const kv of nbrs) if (!this.occ.has(kv.k)) { this.setOcc(kv.k, kv.v); this.noteS1(kv.k); }
      this.drainAt = 0; this.seatTries = 0; this.seatedAt = this.TICK;
      this.lastAck = this.TICK; this.lastPhone = this.TICK;
      if (owner != null) this.emit(owner, { t: 'CLAIM', ck: ck(c), id: this.id });
      if (c.pc === 0) { this.s1CheckAt = this.TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0); this.emitRelay(this.genKey); } // E3: a Section-1 seat registers as a greeter on seating
      this.announce(); this.wake();
    }
    announce() { const seen = new Set(); for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'HELLO', ck: ck(this.coord), id: this.id }); } } }

    admit(c, f) {
      const nc = f.nc;
      this.tlForget(ck(c)); // the cell genuinely refills — any standing D5 observation of the old occupant ends here
      this.occ.set(ck(c), nc); this.noteS1(ck(c));
      const nbrs = []; const ol = topo.ownedLinks(c);
      for (const olc of ol) { const x = this.occGet(ck(olc)); if (x != null && x !== nc) nbrs.push({ k: ck(olc), v: x }); }
      let selfNb = false; for (const olc of ol) if (ck(olc) === ck(this.coord)) selfNb = true;
      if (selfNb) nbrs.push({ k: ck(this.coord), v: this.id });
      const m = { t: 'PLACE', coord: c, owner: this.id, nbrs, tag: f.tag, nc };
      // Q2: a compaction seeker (tag==1) is already SEATED and NOT adjacent to me
      // — ROUTE the PLACE to its coord and deliver to WHOEVER sits there
      // (rfinal=null, NOT a direct hand-off to the seated seeker, which would
      // teleport). m.nc names the intended seeker; if it has moved on, the seat
      // now at that coord ignores the PLACE (nc mismatch) and the seeker
      // re-probes. A plain newcomer (tag falsy) is reached directly.
      if (f.tag === 1) { this.route(f.coord, null, m); }
      else { this.emit(nc, m); this._gspReplay(nc); } // an ADMITTED newcomer arrives with no gossip history — hand over the backlog
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
        const rowLive = [], rowSeen = [];
        for (let t = 0; t < C(); t++) {
          rowLive[t] = (this.coord.r === t); rowSeen[t] = rowLive[t];
          for (let j = 0; j < C(); j++) { const k = ck({ pc: 0, r: t, i: j }); if (this.s1Fresh(k)) rowLive[t] = true; if (this.s1seen.has(k)) rowSeen[t] = true; }
        }
        for (let t = 0; t < C(); t++) {
          const liveRow = rowLive[t], everSeen = rowSeen[t];
          if (!liveRow && everSeen) {
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
            let aid = this.firstHandLive(ac) ? this.occGet(ac) : null;
            if (aid == null || aid === this.id) aid = this.firstHandLive(ah) ? this.occGet(ah) : null; // column-mate not live → that row's head, still first-hand
            if (aid != null && aid !== this.id) { this.emit(aid, { t: 'FIND', nc: mm.nc, ttl: mm.ttl - 1 }); return; }
            continue;                                    // the whole admitter row below is dead too (not first-hand live) → resolve bottom-up
          }
          for (let j = 0; j < C(); j++) {
            const cell = { pc: 0, r: t, i: j }; const k = ck(cell);
            if (this.occ.has(k)) continue;               // taken (or a stale phantom — the heal machinery clears those)
            // Frontier test by DIRECT knowledge only (the old 11a admit-
            // liveness: occGet(down)==null) — NOT hasDownChild, whose childOf
            // arm never expires: a stale heir entry would permanently steer
            // arrivals away from a clear cell, leaving it to the much slower
            // leaf-promotion backstop.
            if (this.occGet(ck(topo.down(cell))) != null) continue; // internal hole — its down-child heals it (C1 frontier rule)
            // HEADLESS-ROW admission (the H7 amendment; roadmap §3 gap):
            //  - the vacated HEAD of a LIVE row is an INTERNAL HOLE owned by
            //    its designated healer (the H2 scoocher / vertical promotion)
            //    — never an admission target (C1: an admission must not race
            //    a healer).
            if (j === 0 && rowLive[t]) continue;
            let adm = j > 0 ? { pc: 0, r: t, i: 0 } : { pc: 0, r: (t - 1 + C()) % C(), i: 0 };
            //  - H-CHAIN admission devolution (healing-laws H-CHAIN): when the
            //    designated admitter seat is VACATED (occ EMPTY — D2 LEAVE;
            //    mere silence never clears occ), duty devolves along that
            //    admitter's ROW: col 1, then 2, … C−1. First OCCUPIED seat
            //    wins. Empty chain → scooch still rebuilding; keep scanning.
            //    Single-step col-1 devolution is the j=1 special case.
            if (!this.occ.has(ck(adm)) && rowLive[adm.r]) {
              for (let dj = 1; dj < C(); dj++) {
                const d = { pc: 0, r: adm.r, i: dj };
                if (this.occ.has(ck(d))) { adm = d; break; }
              }
            }
            if (ck(this.coord) === ck(adm)) {            // I am the designated (or devolved) admitter
              if (TICK - (this.healTry.has(k) ? this.healTry.get(k) : -999) > 45) { this.healTry.set(k, TICK); this.admit(cell, mm); return; }
              continue;                                  // admit gate cooling — consider the next cell
            }
            const aid = this.occGet(ck(adm));
            if (aid != null && aid !== this.id) { this.emit(aid, { t: 'FIND', nc: mm.nc, ttl: mm.ttl - 1 }); return; }
            // admitter unknown/dead: keep scanning. Do NOT gate on firstHandLive
            // (fast-tracks silent death past H1-S1 — headless-row leg C).
          }
        }
        // no admissible S1 cell (home full, or every hole is a healer's) ⇒ deep
      }
      const f = this.firstFreeInRoster(); if (f) { this.admit(f, mm); return; }
      const rc = this.rosterCells(); const idx = this.shuf(Array.from({ length: C() }, (_, k) => k));
      for (const q of idx) { const x = this.occGet(ck(rc[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FIND', nc: mm.nc, ttl: mm.ttl - 1 }); return; } }
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
      for (const rc of this.rosterCells()) { const x = this.occGet(ck(rc)); if (x != null && x !== this.id) src.push(x); }
      if (hole.pc === this.coord.pc && hole.r === this.coord.r) { for (const m of topo.rowMates(this.coord)) { if (ck(m) === ck(hole)) continue; if (!(this.kidful.has(ck(m)) && this.kidful.get(ck(m)))) continue; const x = this.occGet(ck(m)); if (x != null && x !== this.id) src.push(x); } }
      if (hole.pc === 0 && this.coord.pc === 0) { for (const e of this.s1Roster()) if (e.v !== this.id && e.k !== ck(hole)) src.push(e.v); }
      if (src.length) { const who = src[(this.rng() * src.length) | 0]; this.emit(who, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); return; }
      // 11a: childless right-neighbour SCOOCHES left into its left-neighbour
      // hole (head when coord.i==1) — left-pack base case (only a leaf moves)
      if (!this.hasChildren() && hole.pc === this.coord.pc && hole.r === this.coord.r && hole.i === this.coord.i - 1) this.promoteInto(hole, nbrs);
    }
    findLeaf(hole, nbrs, ttl) {
      if (!this.hasCoord) return;
      if (ttl > 0) { const rc = this.rosterCells(); const idx = this.shuf(Array.from({ length: C() }, (_, k) => k)); for (const q of idx) { const x = this.occGet(ck(rc[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FINDLEAF', hole, nbrs, ttl: ttl - 1 }); return; } } }
      if (this.coord.pc === hole.pc && this.coord.r === hole.r && hole.i !== 0) return;
      this.promoteInto(hole, nbrs);
    }
    promoteInto(hole, nbrs) {
      if (!this.hasCoord || ck(this.coord) === ck(hole)) return;
      if (this.moving) return;                       // T1: one move at a time
      if (this.coord.pc === 0 && hole.pc !== 0) return;
      // 11a: a Section-1 seat may scooch LEFT within its row (left-pack), never sideways/down
      if (this.coord.pc === 0 && hole.pc === 0 && !(hole.r === this.coord.r && hole.i < this.coord.i)) return;
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
      const digs = (pc) => { const v = []; while (pc) { v.push(topo.lastDigit(pc)); pc = topo.parentPath(pc); } v.reverse(); return v; };
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
    onPhone(m) {
      const TICK = this.TICK;
      if (this.hasCoord && this.moving && m.tock === this.oldCk && m.tock !== ck(this.coord)) { // T1 dual-hold: the OLD seat still answers while the claim is in flight
        this.emit(m.id, { t: 'PONG', coord: this.oldCoord, from: null, owner: null, oCk: null, row: [], nbrs: [] }); return;
      }
      if (this.hasCoord && this.leaseUntil >= 0 && TICK <= this.leaseUntil && m.tock === this.leaseCk && m.tock !== ck(this.coord)) { // T3: a call to my just-vacated cell — answer MOVED so the caller confirms the vacancy NOW
        this.emit(m.id, { t: 'MOVED', ck: this.leaseCk, mvd: ck(this.coord), id: this.id }); return;
      }
      if (!this.hasCoord || m.tock !== ck(this.coord)) return; // ckey(0,0,0)=="0_0_0" is a REAL coord — always check
      const kk = ck(m.coord); const prev = this.occGet(kk);
      // D5: my first-hand hearing of prev ENDS at my own transport loss (an
      // unanswered translost) — a corpse whose last PHONE is still inside the
      // 40-tick window must not out-tenure the legitimate healer's fill. An
      // answered probe erases the observation, restoring the sitting
      // occupant's full tenure protection (S5: "has itself, first-hand,
      // stopped hearing the prior occupant").
      if (prev != null && prev !== m.id && m.id > prev && this.live.has(kk) && TICK - this.live.get(kk) <= 40 && !this.translost.has(kk)) { this.emit(m.id, { t: 'YIELD', ck: kk }); return; }
      this.setOcc(kk, m.id); this.live.set(kk, TICK); this.noteS1(kk); this.kidful.set(kk, m.kids ? 1 : 0); if (m.child != null) this.childOf.set(kk, m.child); else this.childOf.delete(kk);
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
      this.emit(m.id, { t: 'PONG', owner, oCk, row, nbrs: cous, coord: this.coord, id: this.id });
      if (prev !== m.id) this._gspReplay(m.id); // NEW occupant learned ⇒ hand over the recent gossip backlog
      if (prev != null && prev !== m.id) this.emit(prev, { t: 'YIELD', ck: kk });
    }
    phoneHome() {
      let tc = null; if (this.hasCoord) { if (this.coord.i !== 0) tc = { pc: this.coord.pc, r: this.coord.r, i: 0 }; else tc = this.ownerCoord(); }
      if (!tc) return; const tid = this.occGet(ck(tc)); if (tid == null) return;
      this.emit(tid, { t: 'PHONE', coord: this.coord, tock: ck(tc), id: this.id, kids: this.hasChildren(), child: this.occGet(ck(topo.down(this.coord))) });
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
        this.emit(tid, { t: 'PHONE', coord: this.coord, tock: ck(t), id: this.id, kids: this.hasChildren(), child: this.occGet(ck(topo.down(this.coord))) });
      }
    }
    s1Sync() {
      const TICK = this.TICK;
      const ent = [{ k: ck(this.coord), v: this.id, age: 0, ch: this.occGet(ck(topo.down(this.coord))) }]; // carry MY heir
      for (const [k, v] of this.occ) { if (isS1key(k) && v !== this.id) { const it = this.s1seen.get(k); if (it !== undefined && TICK - it < 120) ent.push({ k, v, age: TICK - it, ch: this.childOf.has(k) ? this.childOf.get(k) : null }); } }
      // W7: sync over the whole rook neighbourhood — every live row-mate AND
      // column-mate (heads included) — keeping the full C^2 home roster
      // consistent across the richly-meshed section.
      const tg = new Set();
      for (const m of topo.rowMates(this.coord)) { const t = this.occGet(ck(m)); if (t != null && t !== this.id) tg.add(t); }
      for (const m of topo.colMates(this.coord)) { const t = this.occGet(ck(m)); if (t != null && t !== this.id) tg.add(t); }
      for (const t of tg) this.emit(t, { t: 'S1SYNC', ent });
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
      for (const k of del) { this.live.delete(k); this.occ.delete(k); this.kidful.delete(k); this.s1seen.delete(k); this.tlForget(k); }
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
          this.lastGreeters = m.list;
          if (this.state === 0 && !this.forkPaused) {
            // R5: probe SEVERAL greeters. One greeter → classic path. Many →
            // collect HOMEs; cluster by gkey + roster overlap. Two+ clusters
            // (multi-genesis OR same-key torn halves) ⇒ human pick-one.
            const pool = m.list.filter((g) => g && g !== this.id);
            if (!pool.length) return;
            if (pool.length === 1) {
              this.gateway = pool[0];
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
            for (const g of fan) this.emit(g, { t: 'WHOHOME', from: this.id, ttl: 60 });
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
          if (this.state === 1) { if (!m.roster || !m.roster.length) { this.retryAt = TICK - 10; return; } this.roster = m.roster; this.haveRoster = true; this.lastReach = TICK; this.seatTries = 0; const t = this.pickRoster(); if (t != null) this.askSeat(t); else this.retryAt = TICK - 10; } // reached a greeter: note it for R6
          else if (this.state === 3 && m.roster && m.roster.length) { this.roster = m.roster; this.haveRoster = true; }
          return;
        }
        case 'FIND': if (m.tag === 1) this.serveCompact(m); else this.serveFind(m); return; // Q2: tag==1 is a compaction probe (up-chain walk), never newcomer admission
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
        case 'NOROOM': if (this.state === 2) { this.retryAt = TICK; if (this.haveRoster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t != null) { this.askSeat(t); return; } } this.seatTries = 0; this.join(); } return;
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
          this.live.set(m.ck, TICK); // first-hand: I just heard m.id directly at m.ck
          this.noteS1(m.ck); return;
        }
        case 'YIELD': if (this.hasCoord && this.state === 3 && ck(this.coord) === m.ck) { if (this.moving) this.rollbackMove(); else this.requeue(); } return; // T1: a mover contradicted at its NEW cell goes home, not homeless
        case 'CLAIM': if (!this.verifyFill(m)) return; if (this.occGet(m.ck) !== m.id) { this.setOcc(m.ck, m.id); this.live.set(m.ck, TICK); } this.noteS1(m.ck); return; // first-hand + S4 identity hook
        case 'LEAVE': {
          this.lastChurn = TICK; // Q2 hysteresis: a departure near me — hold off compaction until quiescent
          if (this.occGet(m.ck) === m.id) { this.occ.delete(m.ck); this.live.delete(m.ck); this.kidful.delete(m.ck); this.s1seen.delete(m.ck); this.tlForget(m.ck); }
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
            if (c.pc === this.coord.pc && c.r === this.coord.r && this.coord.i > c.i && !this.hasDownChild(c)) {
              let first = true;
              for (let j = c.i + 1; j < this.coord.i; j++) if (this.occGet(ck({ pc: c.pc, r: c.r, i: j })) != null) { first = false; break; }
              if (first) { this.heal(c); return; }
            }
          }
          return;
        }
        case 'GREETWALK': return; // H6 retired
        case 'S1SYNC': {
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
            if (seen > curSeen + 8 || (seen >= curSeen - 8 && cur != null && eid < cur)) { this.s1seen.set(kk, Math.max(curSeen, seen)); if (cur !== eid) this.setOcc(kk, eid); }
            else if (cur == null && seen > -999) { this.s1seen.set(kk, seen); this.setOcc(kk, eid); }
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
          if (this.occGet(m.ck) === m.id) { this.occ.delete(m.ck); this.live.delete(m.ck); this.kidful.delete(m.ck); this.s1seen.delete(m.ck); }
          if (m.mvd) { this.setOcc(m.mvd, m.id); this.live.set(m.mvd, TICK); this.noteS1(m.mvd); }
          this.wake(); return;
        }
        case 'PHONE': this.onPhone(m); return;
        case 'PONG': {
          this.lastAck = TICK;
          // FIRST-HAND: the responder spoke to me directly on our rook link.
          const pid = (m.id != null) ? m.id : m.from;
          if (this.hasCoord && m.coord && m.coord.pc === 0 && pid != null) { this.setOcc(ck(m.coord), pid); this.live.set(ck(m.coord), TICK); this.noteS1(ck(m.coord)); }
          if (m.owner != null && this.occGet(m.oCk) !== m.owner) { this.setOcc(m.oCk, m.owner); this.noteS1(m.oCk); }
          for (const e of m.row) { if (this.occGet(e.k) !== e.v) this.setOcc(e.k, e.v); this.noteS1(e.k); if (e.age != null) this.childOf.set(e.k, e.age); }
          for (const kv of m.nbrs) this.cousins.set(kv.k, kv.v); // W: learn the heirs at my future owned-links for relay-free promote-up
          return;
        }
        case 'ROUTE': {
          if (!this.hasCoord) return;
          if (ck(this.coord) === ck(m.target)) {
            if (m.tag === 3) { this.probeAck.set(m.ack, TICK); return; } // a D5 probe ANSWER routed back around the dead link — the probed peer LIVES
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
          const nh = this.nextHopToward(m.target, m.via); if (nh != null) { this.emit(nh, { t: 'ROUTE', target: m.target, asker: m.asker, tag: m.tag, ttl: m.ttl - 1, via: this.id }); return; }
          this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null }); return;
        }
        case 'ROUTED': if (m.tag === 1 || m.tag === 2) { if (m.id != null && this.hasCoord) { this.setOcc(ck(m.target), m.id); this.noteS1(ck(m.target)); this.probeAck.set(ck(m.target), TICK); this.emit(m.id, { t: 'HELLO', ck: ck(this.coord), id: this.id }); } } return; // probeAck AFTER setOcc (a changed occupant clears the observation first)
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
        if ((this.state === 0 || this.state === 1) && TICK - this.retryAt > 20) this.join();
        else if (this.state === 2 && TICK - this.retryAt > 60) { if (this.haveRoster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t != null) this.askSeat(t); else this.join(); } else { this.seatTries = 0; this.join(); } }
        this.wake(); return;
      }
      if (this.evil) this.attack();
      // T: transit bookkeeping — a claim window that closes with NO
      // contradiction CONFIRMS (a wiped region has nobody to answer; a
      // contradiction would have rolled back already); the tombstone
      // self-expires (T3).
      if (this.moving && TICK - this.moveAt > CONFIRM_TTL) this.confirmMove();
      if (this.leaseUntil >= 0 && TICK > this.leaseUntil) { this.leaseCk = null; this.leaseUntil = -1; }
      if (this.coord.pc === 0) {
        // D1 over the rook: phone every live row+column neighbour each beat
        // (maintains first-hand liveness across all redundant home paths).
        if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.s1Heartbeat(); this.s1Sync(); this._gspRefan(); }
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
          // D5 early path defers to the VERTICAL healer when the hole owns a
          // down-child (bug #3's rule) — racing it minted duplicates.
          const defer = this.translost.has(lk) && this.hasDownChild(lft);
          if (!defer && this.ringConfirmDead(lft)) { if (this.occ.has(lk)) { this.occ.delete(lk); this.live.delete(lk); this.s1seen.delete(lk); this.kidful.delete(lk); } this.holeSince.delete(lk); this.heal(lft); }
        }
        // W7: keep column links live — re-ping any vacant column-mate
        if (TICK >= this.xlinkAt) { this.xlinkAt = TICK + 150 + (this.rng() * 100 | 0); for (const cm of topo.colMates(this.coord)) if (this.occGet(ck(cm)) == null) this.routeTo(cm, 1); }
        if (this.s1CheckAt < 0) this.s1CheckAt = TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0);
        if (TICK >= this.s1CheckAt) { this.s1CheckAt = TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0); this.emitRelay(this.genKey); } // E3 re-knock: Section-1 seats ARE the greeter pool
        this.wake(); return;
      }
      if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.phoneHome(); this._gspRefan(); }
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
      if (this.coord.i === 0 && this.cousins.size && TICK - this.healAt > 20) {
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

  GifOS.mesh = { Seat, keyHash, RELAY_TTL, RELAY_CAP, E3_PERIOD, STRAND_TTL, RING_HOLD, EARLY_HOLD, CONFIRM_TTL, LEASE_TTL, isS1key, ownerCoordOf };
})(typeof window !== 'undefined' ? window : globalThis);
