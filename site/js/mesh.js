/*
 * mesh.js — the GifOS no-root mesh CONTROL PLANE, a faithful port of the C++
 * reference sim (sim/mesh.cpp + sim/mesh_seat.inc + sim/topo.h). This is the
 * production seating + healing brain; docs/healing-laws.md is its law catalog.
 * (Supersedes the old topology-only GifosMesh module — topology now lives in
 * net.topo, the shared port of topo.h.)
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

  // ---- constants (mirror sim/mesh.cpp) ----
  const RELAY_TTL = 500;     // greeter entry lifetime (ticks)
  const RELAY_CAP = 72;      // max greeter entries the relay holds
  const E3_PERIOD = 200;     // Section-1 re-knock cadence (< RELAY_TTL so live seats stay listed)
  const STRAND_TTL = 500;    // R6: unreachable-for-this-long ⇒ take over (empty) or stranded

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
      this.retryAt = -1; this.seatTries = 0; this.lastPhone = -99; this.lastAck = 0;
      this.healAt = -99; this.drainAt = 0; this.rosterAskAt = -999; this.xlinkAt = 0;
      this.seatedAt = 0; this.challAt = 0; this.s1CheckAt = -1;
      this.myKey = 'mk_' + id;   // throwaway personal genesis key (unique per seat)
      this.genKey = null;        // THIS meeting's genesis key (learned via the dance, or minted)
      this.joinStart = -1; this.stranded = false; this.evil = false; this.alive = true;
      this.roster = []; this.haveRoster = false; this.lastGreeters = [];
      // per-seat PRNG (splitmix-ish), seeded from id — matches the sim's per-seat rng role
      let h = 2166136261 >>> 0; const b = 'p' + id;
      for (let k = 0; k < b.length; k++) { h ^= b.charCodeAt(k); h = Math.imul(h, 16777619); }
      this.rs = (h ^ 0x9e3779b9) >>> 0;
    }
    get TICK() { return this.env.TICK; }
    rng() { this.rs = (this.rs + 0x6d2b79f5) >>> 0; let t = this.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    shuf(a) { for (let k = a.length - 1; k > 0; k--) { const j = (this.rng() * (k + 1)) | 0; const t = a[k]; a[k] = a[j]; a[j] = t; } return a; }
    emit(to, m) { if (to != null) this.env.send(this.id, to, m); }
    emitRelay(key) { this.env.knock(this.id, key); }
    wake() { if (this.env.wake) this.env.wake(this.id); }

    // ---- occupancy helpers ----
    occGet(k) { const v = this.occ.get(k); return v === undefined ? null : v; }
    setOcc(k, v) { if (v === this.id && (!this.hasCoord || k !== ck(this.coord))) return; this.occ.set(k, v); }
    noteS1(k) { if (isS1key(k)) this.s1seen.set(k, this.TICK); }
    s1Fresh(k) { const it = this.s1seen.get(k); return it !== undefined && this.TICK - it < 120 && this.occ.has(k); }
    ownedRowHead() { return { pc: topo.childPath(this.coord.pc, this.coord.i), r: this.coord.r, i: 0 }; }
    rosterCells() { const h = this.ownedRowHead(); const out = []; for (let c = 0; c < C(); c++) out.push({ pc: h.pc, r: h.r, i: c }); return out; }
    firstFreeInRoster() { for (const rc of this.rosterCells()) if (!this.occ.has(ck(rc))) return rc; return null; }
    ownerCoord() { if (!this.hasCoord || this.coord.pc === 0) return null; return topo.up({ pc: this.coord.pc, r: this.coord.r, i: 0 }); }
    ownerId() { if (!this.hasCoord) return null; const u = topo.up({ pc: this.coord.pc, r: this.coord.r, i: 0 }); if (!u) return null; return this.occGet(ck(u)); }
    hasChildren() { for (const rc of this.rosterCells()) { const x = this.occGet(ck(rc)); if (x != null && x !== this.id) return true; } return false; }
    lowestSurvivor() { for (let j = 1; j < this.coord.i; j++) { const k = ck({ pc: this.coord.pc, r: this.coord.r, i: j }); const x = this.occGet(k); if (x == null || x === this.id) continue; if (this.coord.pc !== 0 || this.s1Fresh(k)) return false; } return true; }
    pickRoster() { const liveIds = []; for (const e of this.roster) if (e.v !== this.id) liveIds.push(e.v); if (!liveIds.length) return null; return liveIds[(this.rng() * liveIds.length) | 0]; }
    s1Roster() { const out = []; if (this.hasCoord && this.coord.pc === 0) out.push({ k: ck(this.coord), v: this.id }); for (const [k, v] of this.occ) if (isS1key(k) && v !== this.id && this.s1Fresh(k)) out.push({ k, v }); return out; }

    // ---- entry (R1/R3/R4) ----
    join() { this.state = 0; this.retryAt = this.TICK; this.haveRoster = false; if (this.joinStart < 0) this.joinStart = this.TICK; this.emitRelay(this.myKey); this.wake(); }
    askSeat(target) { this.state = 2; this.retryAt = this.TICK; this.emit(target, { t: 'FIND', nc: this.id, ttl: 200 }); this.wake(); }

    take(c, owner, nbrs) {
      if (c.i >= C() || c.r >= C()) return;
      this.coord = c; this.hasCoord = true; this.state = 3; this.joinStart = -1; this.stranded = false;
      this.occ.set(ck(c), this.id); this.noteS1(ck(c));
      for (const kv of nbrs) if (!this.occ.has(kv.k)) { this.setOcc(kv.k, kv.v); this.noteS1(kv.k); }
      this.drainAt = 0; this.seatTries = 0; this.seatedAt = this.TICK;
      this.lastAck = this.TICK; this.lastPhone = this.TICK;
      if (owner != null) this.emit(owner, { t: 'CLAIM', ck: ck(c), id: this.id });
      if (c.pc === 0) { this.s1CheckAt = this.TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0); this.emitRelay(this.genKey); } // E3
      this.announce(); this.wake();
    }
    announce() { const seen = new Set(); for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'HELLO', ck: ck(this.coord), id: this.id }); } } }

    admit(c, nc) {
      this.occ.set(ck(c), nc); this.noteS1(ck(c));
      const nbrs = []; const ol = topo.ownedLinks(c);
      for (const olc of ol) { const x = this.occGet(ck(olc)); if (x != null && x !== nc) nbrs.push({ k: ck(olc), v: x }); }
      let selfNb = false; for (const olc of ol) if (ck(olc) === ck(this.coord)) selfNb = true;
      if (selfNb) nbrs.push({ k: ck(this.coord), v: this.id });
      this.emit(nc, { t: 'PLACE', coord: c, owner: this.id, nbrs });
      this._gspReplay(nc); // an ADMITTED newcomer arrives with no gossip history — hand over the backlog (its later PHONEs will show no prev-transition, so this is the only hook that fires for it)
    }
    serveFind(mm) {
      const TICK = this.TICK;
      if (!this.hasCoord || mm.ttl <= 0) { this.emit(mm.nc, { t: 'NOROOM' }); return; }
      if (this.coord.pc === 0) {
        const ar = (this.coord.r - 1 + C()) % C(); let empty = true;
        for (let j = 0; j < C(); j++) if (this.s1Fresh(ck({ pc: 0, r: ar, i: j }))) { empty = false; break; }
        if (empty) { this.admit({ pc: 0, r: ar, i: this.coord.i }, mm.nc); return; }
        if (this.coord.i === 0) { for (let j = 1; j < C(); j++) { const rc = { pc: 0, r: this.coord.r, i: j }; const rck = ck(rc); if (!this.occ.has(rck) && TICK - (this.healTry.has(rck) ? this.healTry.get(rck) : -999) > 45) { this.healTry.set(rck, TICK); this.admit(rc, mm.nc); return; } } }
      }
      const f = this.firstFreeInRoster(); if (f) { this.admit(f, mm.nc); return; }
      const rc = this.rosterCells(); const idx = this.shuf(Array.from({ length: C() }, (_, k) => k));
      for (const q of idx) { const x = this.occGet(ck(rc[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FIND', nc: mm.nc, ttl: mm.ttl - 1 }); return; } }
      this.emit(mm.nc, { t: 'NOROOM' });
    }

    // ---- healing (H/C/W/E) ----
    heal(hole) {
      const TICK = this.TICK;
      if (!this.hasCoord || this.state !== 3 || TICK - this.healAt < 12) return;
      const hk = ck(hole); if (TICK - (this.healTry.has(hk) ? this.healTry.get(hk) : -999) < 45) return;
      this.healAt = TICK; this.healTry.set(hk, TICK);
      const nbrs = []; const ol = topo.ownedLinks(hole);
      for (const olc of ol) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) nbrs.push({ k: ck(olc), v: x }); }
      let selfNb = false; for (const olc of ol) if (ck(olc) === ck(this.coord)) selfNb = true; if (selfNb) nbrs.push({ k: ck(this.coord), v: this.id });
      const oc = ownerCoordOf(hole); if (oc) { const oid = this.occGet(ck(oc)); let has = false; for (const x of nbrs) if (x.k === ck(oc)) has = true; if (oid != null && !has) nbrs.push({ k: ck(oc), v: oid }); }
      const rc = this.rosterCells(); const idx = this.shuf(Array.from({ length: C() }, (_, k) => k));
      for (const q of idx) { const x = this.occGet(ck(rc[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); return; } }
      if (hole.pc === this.coord.pc && hole.r === this.coord.r) {
        const rm = topo.rowMates(this.coord); const ri = this.shuf(Array.from({ length: C() - 1 }, (_, k) => k));
        for (const q of ri) { if (ck(rm[q]) === ck(hole)) continue; if (!(this.kidful.has(ck(rm[q])) && this.kidful.get(ck(rm[q])))) continue; const x = this.occGet(ck(rm[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); return; } }
      }
      if (hole.pc === 0 && this.coord.pc === 0) { const r = this.s1Roster(); const rr = []; for (const e of r) if (e.v !== this.id && e.k !== ck(hole)) rr.push(e); if (rr.length) { this.emit(rr[(this.rng() * rr.length) | 0].v, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); return; } }
      if (hole.i === 0 && this.coord.i > 0 && !this.hasChildren()) this.promoteInto(hole, nbrs);
    }
    findLeaf(hole, nbrs, ttl) {
      if (!this.hasCoord) return;
      if (ttl > 0) { const rc = this.rosterCells(); const idx = this.shuf(Array.from({ length: C() }, (_, k) => k)); for (const q of idx) { const x = this.occGet(ck(rc[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FINDLEAF', hole, nbrs, ttl: ttl - 1 }); return; } } }
      if (this.coord.pc === hole.pc && this.coord.r === hole.r && hole.i !== 0) return;
      this.promoteInto(hole, nbrs);
    }
    promoteInto(hole, nbrs) {
      if (!this.hasCoord || ck(this.coord) === ck(hole)) return;
      if (this.coord.pc === 0 && hole.pc !== 0) return;
      if (this.coord.pc === 0 && hole.pc === 0 && !(hole.i === 0 && hole.r === this.coord.r)) return;
      if (this.env.bumpMoves) this.env.bumpMoves();
      const oldC = this.coord; const seen = new Set();
      for (const olc of topo.ownedLinks(oldC)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: ck(oldC), id: this.id }); } }
      this.occ.clear(); this.s1seen.clear(); this.cousins.clear();
      this.take(hole, null, nbrs);
      this.lastAck = this.TICK; this.lastPhone = this.TICK - 100;
    }
    attack() { if (!this.hasCoord) return; for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) this.emit(x, { t: 'HELLO', ck: ck(olc), id: this.id }); } }
    requeue() { if (!this.evil && this.env.bumpEvict) this.env.bumpEvict(); if (this.env.bumpMoves) this.env.bumpMoves(); if (this.hasCoord) { const seen = new Set(); for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: ck(this.coord), id: this.id }); } } } this.hasCoord = false; this.occ.clear(); this.s1seen.clear(); this.drainAt = 0; this.join(); }

    drainOrReenter() {
      const TICK = this.TICK;
      if (TICK - this.lastAck > 220) { this.haveRoster = false; this.roster = []; this.drainAt = 0; this.requeue(); return; }
      if (this.haveRoster && this.roster.length) { if (!this.drainAt) { const rc = this.rosterCells(); for (let c = 0; c < C(); c++) { const x = this.occGet(ck(rc[c])); if (x != null && x !== this.id) this.emit(x, { t: 'DRAIN', roster: this.roster }); } this.drainAt = TICK + 25 + (this.rng() * 10 | 0); } return; }
      if (TICK - this.rosterAskAt > 40) {
        this.rosterAskAt = TICK; const x = topo.crossLink(this.coord); let xid = x ? this.occGet(ck(x)) : null;
        if (xid != null && xid !== this.id) { this.emit(xid, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 }); }
        else { const rm = topo.rowMates(this.coord); const ri = this.shuf(Array.from({ length: C() - 1 }, (_, k) => k)); for (const q of ri) { const rr = this.occGet(ck(rm[q])); if (rr != null && rr !== this.id) { this.emit(rr, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 }); break; } } }
      }
    }
    reseatViaRoster() { if (this.env.bumpMoves) this.env.bumpMoves(); if (this.hasCoord) { const seen = new Set(); for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: ck(this.coord), id: this.id }); } } } this.hasCoord = false; this.occ.clear(); this.s1seen.clear(); this.drainAt = 0; this.seatTries = 0; const t = (this.haveRoster && this.roster.length) ? this.pickRoster() : null; if (t != null) this.askSeat(t); else this.join(); }

    // ---- routing (E1 WHOHOME / cross-link repair) ----
    nextHopCoord(t) {
      const c = this.coord;
      if (c.pc === t.pc && c.r === t.r && c.i === t.i) return null;
      if (c.r !== t.r) {
        if (c.pc !== 0) { if (c.i !== 0) return { pc: c.pc, r: c.r, i: 0 }; return topo.up(c); }
        for (let j = 1; j < C(); j++) { const x = topo.crossLink({ pc: 0, r: c.r, i: j }); if (x && x.r === t.r) return (c.i === j) ? x : { pc: 0, r: c.r, i: j }; } return null;
      }
      if (c.pc !== t.pc) {
        const digs = (pc) => { const v = []; while (pc) { v.push(topo.lastDigit(pc)); pc = topo.parentPath(pc); } v.reverse(); return v; };
        const pa = digs(c.pc), pb = digs(t.pc);
        let l = 0; while (l < pa.length && l < pb.length && pa[l] === pb[l]) l++;
        if (l < pa.length) { if (c.i !== 0) return { pc: c.pc, r: c.r, i: 0 }; return topo.up(c); }
        if (pa.length < pb.length) { const d = pb[pa.length]; if (c.i !== d) return { pc: c.pc, r: c.r, i: d }; return topo.down(c); }
      }
      return { pc: c.pc, r: c.r, i: t.i };
    }
    nextHopToward(target, exclude) {
      if (!this.hasCoord) return null; const ideal = this.nextHopCoord(target);
      if (ideal) { const x = this.occGet(ck(ideal)); if (x != null && x !== this.id && x !== exclude) return x; }
      const xc = topo.crossLink(this.coord); if (xc) { const x = this.occGet(ck(xc)); if (x != null && x !== this.id && x !== exclude) return x; }
      const rm = topo.rowMates(this.coord); for (const m of rm) { const cx = topo.crossLink(m); if (!cx) continue; const x = this.occGet(ck(cx)); if (x != null && x !== this.id && x !== exclude) return x; }
      return null;
    }
    routeTo(target, tag) { const nh = this.nextHopToward(target, null); if (ck(this.coord) === ck(target)) return; if (nh != null) this.emit(nh, { t: 'ROUTE', target, asker: this.id, tag, ttl: 60, via: this.id }); }

    // ---- phone-home / detection (D1) + wiring (W2/W3/W6) ----
    onPhone(m) {
      const TICK = this.TICK;
      if (!this.hasCoord || m.tock !== ck(this.coord)) return; // ckey(0,0,0)=="0_0_0" is a REAL coord — always check
      const kk = ck(m.coord); const prev = this.occGet(kk);
      if (prev != null && prev !== m.id && m.id > prev && this.live.has(kk) && TICK - this.live.get(kk) <= 40) { this.emit(m.id, { t: 'YIELD', ck: kk }); return; }
      this.setOcc(kk, m.id); this.live.set(kk, TICK); this.noteS1(kk); this.kidful.set(kk, m.kids ? 1 : 0); if (m.child != null) this.childOf.set(kk, m.child); else this.childOf.delete(kk);
      const myoc = this.ownerCoord(); let owner = null, oCk = null; if (myoc) { oCk = ck(myoc); owner = this.occGet(oCk); }
      const row = [];
      if (this.coord.i === 0 && m.coord.pc === this.coord.pc && m.coord.r === this.coord.r) { row.push({ k: ck(this.coord), v: this.id, age: this.occGet(ck(topo.down(this.coord))) }); for (let c = 1; c < C(); c++) { const rc = { pc: this.coord.pc, r: this.coord.r, i: c }; const x = this.occGet(ck(rc)); if (x != null && x !== m.id) row.push({ k: ck(rc), v: x, age: this.childOf.has(ck(rc)) ? this.childOf.get(ck(rc)) : null }); } }
      const cous = [];
      if (ck(m.coord) === ck(topo.down(this.coord))) { // my DOWN-CHILD phoning: teach it heirs at its future owned-links (my row-mates + cross-link)
        const rm = topo.rowMates(this.coord); for (const mate of rm) { const v = this.childOf.get(ck(mate)); if (v != null) cous.push({ k: ck(mate), v }); }
        const xl = topo.crossLink(this.coord); if (xl) { const v = this.childOf.get(ck(xl)); if (v != null) cous.push({ k: ck(xl), v }); }
      } else if (this.coord.i === 0 && m.coord.pc === this.coord.pc && m.coord.r === this.coord.r) { // a ROW-MATE phoned me (head): share MY cousins for H2/C2 promote-up
        for (const [k, v] of this.cousins) cous.push({ k, v });
      }
      this.emit(m.id, { t: 'PONG', owner, oCk, row, nbrs: cous });
      if (prev !== m.id) this._gspReplay(m.id); // NEW occupant learned ⇒ hand over the recent gossip backlog
      if (prev != null && prev !== m.id) this.emit(prev, { t: 'YIELD', ck: kk });
    }
    phoneHome() {
      let tc = null; if (this.hasCoord) { if (this.coord.i !== 0) tc = { pc: this.coord.pc, r: this.coord.r, i: 0 }; else tc = this.ownerCoord(); }
      if (!tc) return; const tid = this.occGet(ck(tc)); if (tid == null) return;
      this.emit(tid, { t: 'PHONE', coord: this.coord, tock: ck(tc), id: this.id, kids: this.hasChildren(), child: this.occGet(ck(topo.down(this.coord))) });
    }
    s1Sync() {
      const TICK = this.TICK;
      const ent = [{ k: ck(this.coord), v: this.id, age: 0, ch: this.occGet(ck(topo.down(this.coord))) }]; // carry MY heir
      for (const [k, v] of this.occ) { if (isS1key(k) && v !== this.id) { const it = this.s1seen.get(k); if (it !== undefined && TICK - it < 120) ent.push({ k, v, age: TICK - it, ch: this.childOf.has(k) ? this.childOf.get(k) : null }); } }
      const tg = new Set(); const x = topo.crossLink(this.coord); if (x) { const t = this.occGet(ck(x)); if (t != null && t !== this.id) tg.add(t); }
      const rm = topo.rowMates(this.coord); for (const m of rm) { const t = this.occGet(ck(m)); if (t != null && t !== this.id) tg.add(t); }
      const ab = this.occGet(ck({ pc: 0, r: (this.coord.r - 1 + C()) % C(), i: this.coord.i })); if (ab != null && ab !== this.id) tg.add(ab);
      const be = this.occGet(ck({ pc: 0, r: (this.coord.r + 1) % C(), i: this.coord.i })); if (be != null && be !== this.id) tg.add(be);
      for (const t of tg) this.emit(t, { t: 'S1SYNC', ent });
    }
    rowSweep() {
      const TICK = this.TICK;
      if (this.coord.i !== 0) return; const del = [];
      for (const [k, at] of this.live) { if (TICK - at <= 50) continue; const c = unck(k); if (c.pc === this.coord.pc && c.r === this.coord.r && c.i > 0) { const kids = this.kidful.has(k) && this.kidful.get(k); del.push(k); if (kids || c.pc === 0) this.heal(c); } }
      for (const k of del) { this.live.delete(k); this.occ.delete(k); this.kidful.delete(k); this.s1seen.delete(k); }
    }
    s1Fill() {
      const TICK = this.TICK;
      if (TICK - this.seatedAt < 80) return;
      for (let j = 1; j < C(); j++) { const c = { pc: 0, r: this.coord.r, i: j }; const kk = ck(c); const it = this.live.get(kk); if (it !== undefined && TICK - it <= 60) continue; if (this.occ.has(kk)) { this.occ.delete(kk); this.live.delete(kk); this.s1seen.delete(kk); this.kidful.delete(kk); } this.heal(c); return; }
    }

    // ---- gossip: room-wide flood over the mesh (PRODUCTION EXTENSION) ----
    // Not part of the sim's law set — the app layer (chat/status/votes/files)
    // rides this instead of relay fan-out, because the relay session is only
    // the greeter pool now, not the room. A bounded-degree flood with dedup:
    // fan-out ≤ my live links (≤C+2), the seen-cache kills echoes, and the
    // link graph (rows + cross + up/down + S1 columns — the same edges W1-W4
    // keep wired) spans the stadium, so every seated seat converges on every
    // message. Cost: O(edges) frames per message; delivery cb = onGossip.
    linkPeers() {
      const out = new Set();
      if (!this.hasCoord) return out;
      for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && x !== this.id) out.add(x); }
      const o = this.ownerId(); if (o != null && o !== this.id) out.add(o);
      if (this.coord.pc === 0) { // Section-1 column neighbours (the S1SYNC verticals)
        const ab = this.occGet(ck({ pc: 0, r: (this.coord.r - 1 + C()) % C(), i: this.coord.i })); if (ab != null && ab !== this.id) out.add(ab);
        const be = this.occGet(ck({ pc: 0, r: (this.coord.r + 1) % C(), i: this.coord.i })); if (be != null && be !== this.id) out.add(be);
      }
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
    //    window (requeue → reseat can take 45+ ticks) arrives with no history and
    //    no re-fan can be timed to catch it. Event-driven instead: the first
    //    PHONE that teaches me a NEW occupant gets my recent backlog replayed.
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
      const TICK = this.TICK, HEALING = this.env.HEALING;
      switch (m.t) {
        case 'GREETERS': {
          if (!m.list.length) { if (this.state === 0) { this.genKey = this.myKey; this.take({ pc: 0, r: 0, i: 0 }, null, []); } return; } // R3 mint / R6 take-over
          if ((this.state === 0 || this.state === 1) && this.joinStart >= 0 && TICK - this.joinStart > STRAND_TTL) { this.stranded = true; return; } // R6 stranded
          this.lastGreeters = m.list;
          if (this.state === 0) { const g = m.list[(this.rng() * m.list.length) | 0]; this.emit(g, { t: 'WHOHOME', from: this.id, ttl: 60 }); this.state = 1; this.retryAt = TICK; } // RANDOM greeter, not list[0]: spread the intro load across the S1 pool
          return;
        }
        case 'WHOHOME': {
          if (!this.hasCoord) { this.emit(m.from, { t: 'HOME' }); return; }
          if (m.ttl <= 0) return;
          if (this.coord.pc === 0) { this.emit(m.from, { t: 'HOME', roster: this.s1Roster(), id: this.id, gkey: this.genKey }); return; }
          const fwd = (x) => { if (x != null && x !== this.id && x !== m.via) { this.emit(x, { t: 'WHOHOME', from: m.from, via: this.id, ttl: m.ttl - 1 }); return true; } return false; };
          if (this.coord.i !== 0) { if (fwd(this.occGet(ck({ pc: this.coord.pc, r: this.coord.r, i: 0 })))) return; } else { if (fwd(this.ownerId())) return; }
          const x = topo.crossLink(this.coord); if (x && fwd(this.occGet(ck(x)))) return;
          const rm = topo.rowMates(this.coord); for (const mate of rm) { const cx = topo.crossLink(mate); if (cx && fwd(this.occGet(ck(cx)))) return; }
          return;
        }
        case 'HOME': {
          if (m.gkey != null) this.genKey = m.gkey; // learn this meeting's genesis key (the dance)
          if (this.state === 1) { if (!m.roster || !m.roster.length) { this.retryAt = TICK - 10; return; } this.roster = m.roster; this.haveRoster = true; this.seatTries = 0; const t = this.pickRoster(); if (t != null) this.askSeat(t); else this.retryAt = TICK - 10; }
          else if (this.state === 3 && m.roster && m.roster.length) { this.roster = m.roster; this.haveRoster = true; }
          return;
        }
        case 'FIND': this.serveFind(m); return;
        case 'FINDLEAF': this.findLeaf(m.hole, m.nbrs, m.ttl); return;
        case 'PLACE': if (this.state === 2) this.take(m.coord, m.owner, m.nbrs); return;
        case 'NOROOM': if (this.state === 2) { this.retryAt = TICK; if (this.haveRoster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t != null) { this.askSeat(t); return; } } this.seatTries = 0; this.join(); } return;
        case 'HELLO': {
          if (this.hasCoord && this.state === 3 && m.ck === ck(this.coord) && m.id !== this.id && m.id < this.id) { if (TICK - this.challAt > 20) { this.challAt = TICK; this.emit(m.id, { t: 'CHALLENGE', ck: m.ck, from: this.id }); } return; }
          const prev = this.occGet(m.ck);
          let prevFresh = false; if (prev != null) { if (isS1key(m.ck)) prevFresh = this.s1Fresh(m.ck); else prevFresh = this.live.has(m.ck) ? (TICK - this.live.get(m.ck) <= 40) : true; }
          if (prev != null && prev !== m.id && prevFresh) this.emit(m.id > prev ? m.id : prev, { t: 'YIELD', ck: m.ck });
          if (prev !== m.id) { this.setOcc(m.ck, m.id); if (this.hasCoord) this.emit(m.id, { t: 'HELLO', ck: ck(this.coord), id: this.id }); this._gspReplay(m.id); }
          this.noteS1(m.ck); return;
        }
        case 'YIELD': if (this.hasCoord && this.state === 3 && ck(this.coord) === m.ck) this.requeue(); return;
        case 'CLAIM': if (this.occGet(m.ck) !== m.id) { this.setOcc(m.ck, m.id); this.live.set(m.ck, TICK); } this.noteS1(m.ck); return;
        case 'LEAVE': {
          const hadKids = this.kidful.has(m.ck) && this.kidful.get(m.ck);
          if (this.occGet(m.ck) === m.id) { this.occ.delete(m.ck); this.live.delete(m.ck); this.kidful.delete(m.ck); this.s1seen.delete(m.ck); }
          if (HEALING && this.hasCoord && this.state === 3) { const c = unck(m.ck); if (c.pc === this.coord.pc && c.r === this.coord.r && c.i !== this.coord.i) { if (c.i === 0 && this.coord.i > 0 && this.lowestSurvivor()) { this.heal({ pc: c.pc, r: c.r, i: 0 }); return; } if (c.i > 0 && this.coord.i === 0 && (hadKids || c.pc === 0)) { this.heal(c); return; } } }
          return;
        }
        case 'GREETWALK': return; // H6 retired
        case 'S1SYNC': {
          for (const e of m.ent) {
            const kk = e.k, eid = e.v, age = e.age;
            if (e.ch != null) this.childOf.set(kk, e.ch);
            if (this.hasCoord && kk === ck(this.coord) && eid !== this.id) { const seen = TICK - age - 2; if (eid < this.id && seen > this.seatedAt + 4) { this.requeue(); return; } continue; }
            if (age === 0 && this.hasCoord) { const cur = this.occGet(kk); if (cur != null && cur !== eid && cur < eid && TICK - (this.s1seen.has(kk) ? this.s1seen.get(kk) : -999) < 60) this.emit(eid, { t: 'YIELD', ck: kk }); }
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
        case 'CONFIRM': if (this.hasCoord && this.state === 3 && ck(this.coord) === m.ck && m.id !== this.id && m.id < this.id) this.requeue(); return;
        case 'GSP': this._gspRecv(m); return;
        case 'PHONE': this.onPhone(m); return;
        case 'PONG': { this.lastAck = TICK; if (m.owner != null && this.occGet(m.oCk) !== m.owner) { this.setOcc(m.oCk, m.owner); this.noteS1(m.oCk); } for (const e of m.row) { if (this.occGet(e.k) !== e.v) this.setOcc(e.k, e.v); this.noteS1(e.k); if (e.age != null) this.childOf.set(e.k, e.age); } for (const kv of m.nbrs) this.cousins.set(kv.k, kv.v); return; }
        case 'ROUTE': {
          if (!this.hasCoord) return;
          if (ck(this.coord) === ck(m.target)) { this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: this.id }); return; }
          if (m.ttl <= 0) { this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null }); return; }
          const nh = this.nextHopToward(m.target, m.via); if (nh != null) { this.emit(nh, { t: 'ROUTE', target: m.target, asker: m.asker, tag: m.tag, ttl: m.ttl - 1, via: this.id }); return; }
          this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null }); return;
        }
        case 'ROUTED': if (m.tag === 1) { if (m.id != null && this.hasCoord) { this.setOcc(ck(m.target), m.id); this.noteS1(ck(m.target)); this.emit(m.id, { t: 'HELLO', ck: ck(this.coord), id: this.id }); } } return;
        default: return;
      }
    }

    leave() {
      this.alive = false; if (!this.hasCoord) return; const kk = ck(this.coord); const seen = new Set();
      for (const olc of topo.ownedLinks(this.coord)) { const x = this.occGet(ck(olc)); if (x != null && !seen.has(x)) { seen.add(x); this.emit(x, { t: 'LEAVE', ck: kk, id: this.id }); } }
      const o = this.ownerCoord(); if (o) { const oid = this.occGet(ck(o)); if (oid != null && !seen.has(oid)) this.emit(oid, { t: 'LEAVE', ck: kk, id: this.id }); }
    }

    tick() {
      if (!this.alive) return; const TICK = this.TICK;
      if (this.state !== 3) {
        if (this.stranded) return;
        if ((this.state === 0 || this.state === 1) && TICK - this.retryAt > 20) this.join();
        else if (this.state === 2 && TICK - this.retryAt > 60) { if (this.haveRoster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t != null) this.askSeat(t); else this.join(); } else { this.seatTries = 0; this.join(); } }
        this.wake(); return;
      }
      if (this.evil) this.attack();
      if (this.coord.pc === 0) {
        if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.phoneHome(); this.s1Sync(); this._gspRefan(); }
        if (this.coord.i === 0 && (TICK % 12) === 0) { this.rowSweep(); this.s1Fill(); }
        if (this.coord.i > 0 && TICK - this.lastAck > 40 && TICK - this.healAt > 20 && this.lowestSurvivor()) this.heal({ pc: 0, r: this.coord.r, i: 0 });
        if (this.coord.i > 0 && TICK >= this.xlinkAt) { this.xlinkAt = TICK + 150 + (this.rng() * 100 | 0); const x = topo.crossLink(this.coord); if (x && this.occGet(ck(x)) == null) this.routeTo(x, 1); }
        if (this.s1CheckAt < 0) this.s1CheckAt = TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0);
        if (TICK >= this.s1CheckAt) { this.s1CheckAt = TICK + E3_PERIOD + (this.rng() * E3_PERIOD | 0); this.emitRelay(this.genKey); } // E3 re-knock
        this.wake(); return;
      }
      if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.phoneHome(); this._gspRefan(); }
      if (this.coord.i === 0 && (TICK % 12) === 0) this.rowSweep();
      if (this.coord.i > 0 && TICK - this.lastAck > 40 && TICK - this.healAt > 20 && this.lowestSurvivor()) this.heal({ pc: this.coord.pc, r: this.coord.r, i: 0 });
      if (this.coord.i > 0 && TICK >= this.xlinkAt) { this.xlinkAt = TICK + 150 + (this.rng() * 100 | 0); const x = topo.crossLink(this.coord); if (x && this.occGet(ck(x)) == null) this.routeTo(x, 1); }
      if (this.drainAt && TICK >= this.drainAt) { this.reseatViaRoster(); return; }
      // H8: whole-section death — owner cell dead, its row empty, cell-below empty ⇒ FINDLEAF a leaf into it, wired by cousins
      let didH8 = false;
      if (this.coord.i === 0 && this.cousins.size && TICK - this.lastAck > 150) {
        const oc = this.ownerCoord();
        if (oc && this.occGet(ck(oc)) == null) {
          let rowEmpty = true; for (let j = 0; j < C(); j++) if (this.occGet(ck({ pc: oc.pc, r: oc.r, i: j })) != null) { rowEmpty = false; break; }
          const belowEmpty = this.occGet(ck({ pc: oc.pc, r: (oc.r + 1) % C(), i: oc.i })) == null;
          if (rowEmpty && belowEmpty && TICK - (this.healTry.has(ck(oc)) ? this.healTry.get(ck(oc)) : -999) > 45) {
            this.healTry.set(ck(oc), TICK); this.healAt = TICK; didH8 = true;
            const nb = []; for (const [k, v] of this.cousins) nb.push({ k, v });
            const rc = this.rosterCells(); const ix = this.shuf(Array.from({ length: C() }, (_, k) => k)); let sent = false;
            for (const q of ix) { const x = this.occGet(ck(rc[q])); if (x != null && x !== this.id) { this.emit(x, { t: 'FINDLEAF', hole: oc, nbrs: nb, ttl: 40 }); sent = true; break; } }
            if (!sent) this.promoteInto(oc, nb); // I'm childless ⇒ I AM the leaf
          }
        }
      }
      if (!didH8 && TICK - this.lastAck > 80) this.drainOrReenter();
      this.wake();
    }
  }

  GifOS.mesh = { Seat, keyHash, RELAY_TTL, RELAY_CAP, E3_PERIOD, STRAND_TTL, isS1key, ownerCoordOf };
})(typeof window !== 'undefined' ? window : globalThis);
