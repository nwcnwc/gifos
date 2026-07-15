/*
 * mesh-core.js — the Seat logic, extracted from mesh-scale.js to run INSIDE a
 * worker shard for the parallel simulator (sim-parallel.js). Same laws, same
 * handlers — but DETERMINISTIC UNDER PARALLELISM: each seat has its own seeded
 * rng (this.rng), so the result never depends on thread scheduling; and the
 * Seat no longer touches the fabric directly — send() becomes emit() into a
 * per-tick OUTBOX that the shard hands to main, which owns the relay + routing.
 */
'use strict';
const M = require('../site/js/mesh.js');
const C = M.C, key = M.key, seatOf = M.seat;
const upCoord = M.up, downCoord = M.down, rowMates = M.rowMates, crossLink = M.crossLink, ownedLinks = M.ownedLinks;
const parentPath = M.parentPath, lastDigit = M.lastDigit;
const ownedRowHead = (s) => seatOf(M.childPath(s.path, s.i), s.r, 0);
const ownedRowSeat = (s, col) => seatOf(M.childPath(s.path, s.i), s.r, col);
// a splitmix32 rng seeded per-seat from its id — deterministic, independent per seat
function seedOf(id) { let h = 2166136261 >>> 0; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h ^ 0x9e3779b9) >>> 0; }
const shuf = (host, a) => { for (let k = a.length - 1; k > 0; k--) { const j = (host.rng() * (k + 1)) | 0; const t = a[k]; a[k] = a[j]; a[j] = t; } return a; };
// module state, set per tick by the shard
let T = 0; let HEALING = true; let GREET_PERIOD = 800;
const MOVES = { n: 0 }, EVICTIONS = { n: 0 };
// per-tick output buffers, drained by the shard each tick
const OUT_MSG = [];      // {from, to, msg} peer frames to route
const OUT_FABRIC = [];   // {op:'knock', id, hold} relay ops
const OUT_WAKE = [];     // seat ids to keep scheduled next tick
const WAKE = (id) => OUT_WAKE.push(id);
class Seat {
  constructor(id) {
    this.id = id; this.coord = null; this.occ = new Map();   // occ: coord-key -> id, for cells I know (my roster + neighbours)
    this.state = 'joining'; this.alive = true; this.retryAt = -1; this.roster = null; this.seatTries = 0;
    this.live = new Map();                                    // owner side: roster-cell key -> last-phone tick
    this.lastPhone = -99; this.lastAck = 0;
    this.healAt = -99;                                        // healing throttle: last promotion attempt tick
    this.kidful = new Map();   // row-mate cell -> does it have downlinks? (C1: a childless leaver's hole is never filled — outside Section 1)
    this.childOf = new Map();  // row-mate cell -> that cell's CHILD-ROW HEAD id (W3) so a healer can wire the downlink at promotion
    this.s1seen = new Map();   // W5: Section-1 cell key -> last tick I heard it live (freshness for the 25-roster + H7's empty-row check)
    this.drainAt = 0; this.rosterAskAt = -999; this.xlinkAt = 0; this.greetAt = undefined; this.healTry = new Map();
    this.greetHold = 0; this.rs = seedOf(id);   // transport: my relay socket (open only while knocking/greeting), and per-peer queues for frames awaiting DC establishment   // per-hole backoff: a promotion needs its full round trip (FINDLEAF descent + take + HELLO back) before the healer may re-fire — re-firing early mints duplicates
  }
  inS1() { return this.coord !== null && this.coord.path === ''; }
  noteS1(ck) { if (ck.charCodeAt(0) === 47) this.s1seen.set(ck, T); }   // '/' prefix = a Section-1 cell key
  s1Fresh(ck) { const at = this.s1seen.get(ck); return at !== undefined && T - at < 120 && this.occ.has(ck); }

  // ---- roster: the cells I admit into (uniform: my ONE child row) ---------
  rosterCells() {
    if (!this.coord) return [];
    const out = []; const h = ownedRowHead(this.coord);
    for (let c = 0; c < C; c++) out.push(seatOf(h.path, h.r, c));
    return out;
  }
  firstFreeInRoster() { for (const c of this.rosterCells()) if (!this.occ.has(key(c))) return c; return null; }

  // ---- join ----------------------------------------------------------------
  join() { this.state = 'joining'; this.retryAt = T; this.roster = null; this.emit('relay', { t: 'KNOCK', id: this.id }); WAKE(this.id); }
  askSeat(target) { this.state = 'searching'; this.retryAt = T; this.emit(target, { t: 'FIND', nc: this.id, ttl: 200 }); WAKE(this.id); }   // WAKE: a searcher whose FIND lands on a dead roster entry gets no reply — it must stay scheduled to retry, or it hangs forever
  pickRoster() { const live = this.roster.filter((e) => e[1] !== this.id); return live.length ? live[(this.rng() * live.length) | 0][1] : null; }   // R4: a newcomer picks a RANDOM Section-1 seat — 25 co-equal entry trees, no bottleneck

  recv(m) {
    if (!this.alive) return;
    switch (m.t) {
      case 'GREETERS':
        if (m.list.length === 0) { if (this.state === 'joining') return this.take(seatOf('', 0, 0), null, []); return; }   // R3 genesis: an empty roster means I hold the only socket — I found the home (a rare knock-race mints a duplicate that E2/E3 settle, same as any other dupe)
        this.lastGreeters = m.list;
        if (this.state === 'joining') { this.emit(m.list[0], { t: 'WHOHOME', from: this.id, ttl: 60 }); this.state = 'asking'; this.retryAt = T; }
        else if (this.state === 'seated' && this.coord && this.coord.path === '') this.emit(m.list[0], { t: 'WHOHOME', from: this.id, ttl: 60 });   // SELF-AUDIT: I asked the front door for a walk to the home — the reply tells me whether the home even knows me
        return;
      case 'WHOHOME': {                                                              // R1: find Section 1 by walking the LIVE MESH — no cache, no stored pointer
        if (!this.coord) return this.emit(m.from, { t: 'HOME', roster: [] });             // I'm nobody right now — tell the asker fast so it retries elsewhere
        if ((m.ttl | 0) <= 0) return;
        if (this.coord.path === '') return this.emit(m.from, { t: 'HOME', roster: this.s1Roster(), id: this.id });   // I AM the home → serve the W5 roster (+ my id, so an auditing home seat can stitch itself to me)
        const fwd = (id) => { if (id && id !== this.id && id !== m.via) { this.emit(id, { t: 'WHOHOME', from: m.from, via: this.id, ttl: (m.ttl | 0) - 1 }); return true; } return false; };
        if (this.coord.i !== 0) { if (fwd(this.occ.get(key(seatOf(this.coord.path, this.coord.r, 0))))) return; }   // CLIMB: route to my row's head (it holds the uplink)
        else if (fwd(this.ownerId())) return;                                        // I AM the head → go UP to my owner
        const x = crossLink(this.coord); if (x && fwd(this.occ.get(key(x)))) return; // uplink dead/unknown → escape SIDEWAYS to a row that can climb
        for (const rm of rowMates(this.coord)) { const cx = crossLink(rm); if (cx && fwd(this.occ.get(key(cx)))) return; }
        return;
      }
      case 'HOME':
        if (this.state === 'asking') {
          if (!m.roster || !m.roster.length) {                                     // walk dead-ended — nobody I can reach is seated
            this.emptyHomes = (this.emptyHomes || 0) + 1;
            if (this.emptyHomes >= 3 && (!this.lastGreeters || !this.lastGreeters.some((p) => p < this.id))) { this.emptyHomes = 0; return this.take(seatOf('', 0, 0), null, []); }   // R3 under SIMULTANEOUS cold start: every knocker sees other knockers, so nobody is ever 'alone' — the lowest-id visible knocker founds; any race mints a duplicate that E2/E3 settle like all the others
            this.retryAt = T - 10; return;
          }
          this.emptyHomes = 0;
          this.roster = m.roster; this.seatTries = 0;
          const t = this.pickRoster(); if (t) this.askSeat(t); else this.retryAt = T - 10;
        } else if (this.state === 'seated' && m.roster && m.roster.length) {
          this.roster = m.roster;                                                    // E1: a severed seat fetched the roster → next tick it drains
          if (this.coord && this.coord.path === '') {
            for (const [ck, id] of m.roster) if (ck === key(this.coord) && id !== this.id) { if (id < this.id) return this.requeue(); this.emit(id, { t: 'YIELD', ck }); }   // E2, the last resort: the home's view names another claimant on MY cell — a LOWER one means I am the zombie and requeue; a HIGHER one is told to yield DIRECTLY (it can't hear me any other way while I'm the invisible one)
            if (m.id) this.emit(m.id, { t: 'HELLO', ck: key(this.coord), id: this.id });    // and STITCH: HELLO the responder so an isolated claimant joins the mesh instead of staying invisible — an unwired lower claimant otherwise wins every audit yet is never adopted, and the cell flaps forever
          }
        }
        return;
      case 'FIND': return this.serveFind(m);
      case 'FINDLEAF': return this.findLeaf(m.hole, m.nbrs, m.ttl);                  // a healer's probe descending its subtree to a leaf, which promotes into the hole
      case 'PLACE': if (this.state === 'searching') this.take(m.coord, m.owner, m.nbrs); return;
      case 'NOROOM':
        if (this.state === 'searching') { this.retryAt = T; if (this.roster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t) return this.askSeat(t); } this.seatTries = 0; this.join(); }
        return;
      case 'HELLO': {
        if (this.coord && this.state === 'seated' && m.ck === key(this.coord) && m.id !== this.id && m.id < this.id) {   // E2 HARDENED: a lower id CLAIMS my coord — but a claim is not proof. CHALLENGE it: only a seat ACTUALLY at my coord (that can answer) unseats me. A forged/ghost id is unroutable or silent → ignored. (Finding 2026-07-15: the bare requeue here let any insider evict every higher-id neighbour at will → 10%% insiders collapsed the room.)
          if (T - (this.challAt || 0) > 20) { this.challAt = T; this.emit(m.id, { t: 'CHALLENGE', ck: m.ck, from: this.id }); }
          return;
        }
        const prev = this.occ.get(m.ck);
        const prevFresh = prev ? (m.ck.charCodeAt(0) === 47 ? this.s1Fresh(m.ck) : (this.live.has(m.ck) ? T - this.live.get(m.ck) <= 40 : true)) : false;
        if (prev && prev !== m.id && prevFresh) this.emit(m.id > prev ? m.id : prev, { t: 'YIELD', ck: m.ck });    // E2: I see TWO LIVE ids on one cell — the higher yields. LIVE is the operative word: a stale occ entry (a dead ex-occupant, usually a LOWER id) must never assassinate the freshly promoted seat — that was an endless take→yield→requeue loop
        if (prev !== m.id) { this.occ.set(m.ck, m.id); if (this.coord) this.emit(m.id, { t: 'HELLO', ck: key(this.coord), id: this.id }); }
        this.noteS1(m.ck);
        return;
      }
      case 'YIELD': if (this.coord && this.state === 'seated' && key(this.coord) === m.ck) return this.requeue(); return;
      case 'CLAIM': if (this.occ.get(m.ck) !== m.id) { this.occ.set(m.ck, m.id); this.live.set(m.ck, T); } this.noteS1(m.ck); return;
      case 'LEAVE': {
        const hadKids = this.kidful.get(m.ck);
        if (this.occ.get(m.ck) === m.id) { this.occ.delete(m.ck); this.live.delete(m.ck); this.kidful.delete(m.ck); this.s1seen.delete(m.ck); }
        if (HEALING && this.coord && this.state === 'seated') {
          const [pr, ii] = m.ck.split('.'); const [pth, rr] = pr.split('/'); const ci = +ii, cr = +rr;
          if (pth === this.coord.path && cr === this.coord.r && ci !== this.coord.i) {   // a hole opened in MY row → keep the row whole
            if (ci === 0 && this.coord.i > 0 && this.lowestSurvivor()) return this.heal(seatOf(pth, cr, 0));   // H2: head hole → the lowest-column survivor refills it
            if (ci > 0 && this.coord.i === 0 && (hadKids || pth === '')) return this.heal(seatOf(pth, cr, ci));   // H1: non-head hole → the head refills it IF it had downlinks — or unconditionally in Section 1 (H1-S1)
          }
        }
        return;
      }
      case 'GREETWALK': {                                                            // H6: a random descendant walk from a Section-1 seat — walk down to a random occupied child, that seat becomes a greeter
        if (!this.coord || this.state !== 'seated') return;
        if ((m.ttl | 0) > 0) { const kids = []; for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) kids.push(id); } if (kids.length) return this.emit(kids[(this.rng() * kids.length) | 0], { t: 'GREETWALK', ttl: (m.ttl | 0) - 1 }); }
        this.greetHold = T + GREET_PERIOD; return this.knock();                 // H6: the walk's chosen descendant opens a real socket and holds the door
      }
      case 'S1SYNC': {                                                               // W5: freshness-tagged Section-1 roster entries — fresher wins, staler is ignored
        for (const [ck, id, age] of m.ent) {
          if (this.coord && ck === key(this.coord) && id !== this.id) { const seen = T - (age | 0) - 2; if (id < this.id && seen > (this.seatedAt || 0) + 4) return this.requeue(); continue; }   // E2 via the sync stream — TENURE-AWARE: only a claimant heard AFTER I sat outranks me; the dead ex-occupant's residue (fresh-looking for up to 120 ticks) must not assassinate the promoted seat
          if ((age | 0) === 0 && this.coord) { const cur = this.occ.get(ck); if (cur && cur !== id && cur < id && T - (this.s1seen.get(ck) || -999) < 60) this.emit(id, { t: 'YIELD', ck }); }   // the sender ITSELF claims this cell (self-entry, age 0) but a LOWER live claimant holds it in my view → tell the sender to yield. Without this, a losing head is a ZOMBIE: heads phone no one, and once every holder converges to the winner, nothing ever targets the loser again.
          const seen = T - (age | 0) - 2;
          const cur = this.occ.get(ck), curSeen = this.s1seen.get(ck) || -999;
          if (seen > curSeen + 8 || (seen >= curSeen - 8 && cur !== undefined && id < cur)) { this.s1seen.set(ck, Math.max(curSeen, seen)); if (cur !== id) this.occ.set(ck, id); }   // fresher wins — but at COMPARABLE freshness the LOWER id wins deterministically, so a duplicate pair's two cohorts converge on one claimant instead of each keeping their own (the higher dupe then hears the lower claim and yields)
          else if (cur === undefined && seen > -999) { this.s1seen.set(ck, seen); this.occ.set(ck, id); }
        }
        return;
      }
      case 'DRAIN': {                                                                // E1: my subtree is re-homing — fan down first, then re-seat myself against the roster
        if (!this.coord || this.state !== 'seated' || this.coord.path === '' || this.drainAt) return;
        this.roster = m.roster;
        for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) this.emit(id, { t: 'DRAIN', roster: m.roster }); }
        this.drainAt = T + 6 + ((this.rng() * 12) | 0); WAKE(this.id);
        return;
      }
      case 'CHALLENGE': if (this.evil) return this.emit(m.from, { t: 'CONFIRM', ck: m.ck, id: this.id });   // ADVERSARY lies: confirms cells it does not hold
        if (this.coord && this.state === 'seated' && key(this.coord) === m.ck) this.emit(m.from, { t: 'CONFIRM', ck: m.ck, id: this.id }); return;   // honest: I really am at this cell → say so (a ghost id cannot answer this)
      case 'CONFIRM': if (this.coord && this.state === 'seated' && key(this.coord) === m.ck && m.id !== this.id && m.id < this.id) return this.requeue(); return;   // the lower claimant PROVED it holds my cell (a genuine promotion-race loser) → now I yield
      case 'PHONE': return this.onPhone(m);
      case 'PONG':
        this.lastAck = T;
        if (m.oCk && m.owner && this.occ.get(m.oCk) !== m.owner) { this.occ.set(m.oCk, m.owner); this.noteS1(m.oCk); }   // W2: my grandparent, live
        if (m.row) for (const [k, id, ch] of m.row) { if (this.occ.get(k) !== id) this.occ.set(k, id); this.noteS1(k); if (ch) this.childOf.set(k, ch); }   // W3: my row roster
        return;
      case 'ROUTE': {
        if (!this.coord) return;
        if (key(this.coord) === key(m.target)) return this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: this.id });
        if ((m.ttl | 0) <= 0) return this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null });
        const nh = this.nextHopToward(m.target, m.via);
        if (nh) return this.emit(nh, { t: 'ROUTE', target: m.target, asker: m.asker, tag: m.tag, ttl: (m.ttl | 0) - 1, via: this.id });
        return this.emit(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null });
      }
      case 'ROUTED':
        if (m.tag === 'xlink') { if (m.id && this.coord) { this.occ.set(key(m.target), m.id); this.noteS1(key(m.target)); this.emit(m.id, { t: 'HELLO', ck: key(this.coord), id: this.id }); } return; }
        if (this._onRouted) this._onRouted(m); return;
    }
  }
  routeTo(target, tag) { const nh = this.nextHopToward(target); if (key(this.coord) === key(target)) { if (this._onRouted) this._onRouted({ tag, target, id: this.id }); return; } if (nh) this.emit(nh, { t: 'ROUTE', target, asker: this.id, tag, ttl: 60, via: this.id }); else if (this._onRouted) this._onRouted({ tag, target, id: null }); }
  probeXlink() { const x = this.coord && crossLink(this.coord); if (x && !this.occ.get(key(x))) this.routeTo(x, 'xlink'); }   // establish my cross-link by routing to my transpose partner (over up/down/row)

  ownerId() {
    if (!this.coord) return null;
    const u = upCoord(seatOf(this.coord.path, this.coord.r, 0));
    return u ? (this.occ.get(key(u)) || null) : null;
  }
  s1Roster() {                                                                      // W5: my freshness-filtered view of Section 1 (always includes myself if I'm home)
    const out = []; if (this.coord && this.coord.path === '') out.push([key(this.coord), this.id]);
    for (const [ck, id] of this.occ) if (ck.charCodeAt(0) === 47 && id !== this.id && this.s1Fresh(ck)) out.push([ck, id]);
    return out;
  }

  // ---- route: a live connection to ANY coordinate ---------------------------
  // Rows change INSIDE Section 1 via its own cross-links (there is no hub):
  // climb to Section 1 preserving my row, hop the cross-link that lands on the
  // target row, then descend by path. Same-row targets: climb to the common
  // ancestor and descend. Every hop is an up / down / row / S1-cross link.
  nextHopCoord(t) {
    const c = this.coord;
    if (c.path === t.path && c.r === t.r && c.i === t.i) return null;               // arrived
    if (c.r !== t.r) {                                                              // ROW CHANGE → do it in Section 1
      if (c.path !== '') return c.i !== 0 ? seatOf(c.path, c.r, 0) : upCoord(c);    // climb (up preserves my row)
      for (let j = 1; j < C; j++) { const x = crossLink(seatOf('', c.r, j)); if (x && x.r === t.r) return c.i === j ? x : seatOf('', c.r, j); }   // find the column whose cross lands on the target row; walk to it, then hop
      return null;
    }
    const pa = c.path, pb = t.path;                                                 // SAME ROW → navigate by path
    let l = 0; while (l < pa.length && l < pb.length && pa[l] === pb[l]) l++;
    if (l < pa.length) return c.i !== 0 ? seatOf(pa, c.r, 0) : upCoord(c);          // climb to the common ancestor
    if (pa.length < pb.length) { const d = +pb[pa.length]; return c.i !== d ? seatOf(pa, c.r, d) : M.down(c); }   // descend: align column to the path digit, then down
    return seatOf(pa, c.r, t.i);                                                    // same section + row → row-mate
  }
  nextHopToward(target, exclude) {
    if (!this.coord) return null;
    const ideal = this.nextHopCoord(target);
    if (ideal) { const id = this.occ.get(key(ideal)); if (id && id !== this.id && id !== exclude) return id; }
    const x = crossLink(this.coord); if (x) { const id = this.occ.get(key(x)); if (id && id !== this.id && id !== exclude) return id; }   // ideal hop is a hole → escape SIDEWAYS
    for (const rm of rowMates(this.coord)) { const cx = crossLink(rm); if (!cx) continue; const id = this.occ.get(key(cx)); if (id && id !== this.id && id !== exclude) return id; }
    return null;
  }

  // ---- seating: H7 first, then dense-before-deep down my own tree ----------
  serveFind(m) {
    if (!this.coord || (m.ttl | 0) <= 0) return this.emit(m.nc, { t: 'NOROOM' });
    if (this.coord.path === '') {                                                   // H7: if the row ABOVE me (wrap row 0 → bottom) is ENTIRELY empty, the newcomer resurrects it — directly above me, my column
      const ar = (this.coord.r - 1 + C) % C;
      let empty = true; for (let j = 0; j < C; j++) if (this.s1Fresh(key(seatOf('', ar, j)))) { empty = false; break; }
      if (empty) return this.admit(seatOf('', ar, this.coord.i), m.nc);
      if (this.coord.i === 0) for (let j = 1; j < C; j++) {                          // H1-S1 with ARRIVALS: I'm a Section-1 head — my own row's OCC-EMPTY holes seat newcomers BEFORE my subtree does (dense-before-deep at the very top; single admitter = no race). s1Fill's phone-authoritative purge empties occ of phantoms; the shared healTry backoff keeps this and the promotion path from double-filling one cell.
        const rc = seatOf('', this.coord.r, j); const rck = key(rc);
        if (!this.occ.has(rck) && T - (this.healTry.get(rck) || -999) > 45) { this.healTry.set(rck, T); return this.admit(rc, m.nc); }
      }
    }
    const free = this.firstFreeInRoster();
    if (free) return this.admit(free, m.nc);
    const cells = shuf(this, this.rosterCells());                                      // roster full → hand down to a child that may have room
    for (const c of cells) { const occId = this.occ.get(key(c)); if (occId && occId !== this.id) return this.emit(occId, { t: 'FIND', nc: m.nc, ttl: (m.ttl | 0) - 1 }); }
    return this.emit(m.nc, { t: 'NOROOM' });
  }
  admit(coord, nc) {
    this.occ.set(key(coord), nc); this.noteS1(key(coord));
    const nbrs = []; for (const nb of ownedLinks(coord)) { const id = this.occ.get(key(nb)); if (id && id !== nc) nbrs.push([key(nb), id]); }
    if (ownedLinks(coord).some((nb) => key(nb) === key(this.coord))) nbrs.push([key(this.coord), this.id]);   // W1: I may neighbour the cell I'm admitting into (H7 backfill) — include myself
    this.emit(nc, { t: 'PLACE', coord, owner: this.id, nbrs });
  }

  // ---- healing: ONE motion — every row keeps ITSELF whole (P) ---------------
  heal(hole) {
    if (!this.coord || this.state !== 'seated' || T - this.healAt < 12) return;   // throttle: one promotion attempt in flight
    if (T - (this.healTry.get(key(hole)) || -999) < 45) return;                  // per-hole backoff: wait out the promotion round trip before re-firing (C3 — one healer AND one attempt at a time)
    this.healAt = T; this.healTry.set(key(hole), T);
    const nbrs = []; for (const nb of ownedLinks(hole)) { const id = this.occ.get(key(nb)); if (id && id !== this.id) nbrs.push([key(nb), id]); }
    if (ownedLinks(hole).some((nb) => key(nb) === key(this.coord))) nbrs.push([key(this.coord), this.id]);   // W1: I neighbour the hole — include myself so the promoted seat can reach me (a healer that omits itself re-fires forever)
    const oc = ownerCoordOf(hole); if (oc) { const oid = this.occ.get(key(oc)); if (oid && !nbrs.some((n) => n[0] === key(oc))) nbrs.push([key(oc), oid]); }   // the promoted seat needs its owner id — REAL-TIME from my occ
    for (const c of shuf(this, this.rosterCells())) { const id = this.occ.get(key(c)); if (id && id !== this.id) return this.emit(id, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); }   // promote a leaf strictly from BELOW me (my own subtree)…
    if (hole.path === this.coord.path && hole.r === this.coord.r) for (const rm of shuf(this, rowMates(this.coord))) {   // …P, precisely: the ROW's subtree is the union of ALL its members' subtrees — mine is empty, so promote through a live row-mate's (the findLeaf sideways-scooch guard stops musical chairs)
      if (key(rm) === key(hole) || !this.kidful.get(key(rm))) continue; const id = this.occ.get(key(rm)); if (id && id !== this.id) return this.emit(id, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); }   // only through a row-mate that HAS children (the kids bit rides every phone) — a subtree-less mate is a dead end that would shadow the section-level fallback
    if (hole.path === '' && this.coord.path === '') {                                // …and at the TOP, P one level up again: SECTION 1 keeps itself whole from ITS subtree — the whole stadium. A lone empty head (no members, no children) asks any live home seat, via the W5 roster, to find it a leaf.
      const r = this.s1Roster().filter((e) => e[1] !== this.id && e[0] !== key(hole));
      if (r.length) return this.emit(r[(this.rng() * r.length) | 0][1], { t: 'FINDLEAF', hole, nbrs, ttl: 40 });
    }
    if (hole.i === 0 && this.coord.i > 0 && !this.hasChildren()) this.promoteInto(hole, nbrs);   // …C2: a CHILDLESS frontier row that lost its head — the lowest survivor scooches itself in
  }
  findLeaf(hole, nbrs, ttl) {
    if (!this.coord) return;
    if ((ttl | 0) > 0) for (const c of shuf(this, this.rosterCells())) { const id = this.occ.get(key(c)); if (id && id !== this.id) return this.emit(id, { t: 'FINDLEAF', hole, nbrs, ttl: (ttl | 0) - 1 }); }
    if (this.coord.path === hole.path && this.coord.r === hole.r && hole.i !== 0) return;   // a subtree-less ROW-MATE never scooches sideways into a non-head hole — that just moves the hole (musical chairs)
    this.promoteInto(hole, nbrs);                                                    // no occupied child → I AM a leaf → I fill the hole
  }
  promoteInto(hole, nbrs) {
    if (!this.coord || key(this.coord) === key(hole)) return;
    if (this.coord.path === '' && hole.path !== '') return;                          // a Section-1 seat never leaves the home for a deep hole
    if (this.coord.path === '' && hole.path === '' && !(hole.i === 0 && hole.r === this.coord.r)) return;   // …and never slides sideways within the home (that just moves the hole) — the only in-home scooch is H2: into MY OWN row's head slot
    MOVES.n++;
    const oldC = this.coord, seen = new Set();
    for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); this.emit(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } }
    this.occ = new Map(); this.s1seen = new Map();
    this.take(hole, null, nbrs);
    this.lastAck = T; this.lastPhone = T - 100;
  }
  attack() {                                                                        // strongest routable attack: claim each neighbour's OWN cell with MY lex-low id, and (see CHALLENGE) lie to confirm it — impersonating a promotion-race winner I am not
    if (!this.coord) return;
    for (const nb of ownedLinks(this.coord)) { const id = this.occ.get(key(nb)); if (id && id !== this.id) this.emit(id, { t: 'HELLO', ck: key(nb), id: this.id }); }
  }
  requeue() {                                                                       // last resort (E1 fallback / E2 loser): give up the seat, re-enter the front door
    if (!this.evil) EVICTIONS.n++;
    const oldC = this.coord; MOVES.n++;
    if (oldC) { const seen = new Set(); for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); this.emit(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } } }
    this.coord = null; this.occ = new Map(); this.s1seen = new Map(); this.drainAt = 0;
    this.join();
  }

  // ---- E1: the drain — my subtree re-homes over the mesh, not the relay -----
  drainOrReenter() {
    if (this.roster && this.roster.length) {                                        // roster in hand → drain: children first, me last
      if (!this.drainAt) {
        for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) this.emit(id, { t: 'DRAIN', roster: this.roster }); }
        this.drainAt = T + 25 + ((this.rng() * 10) | 0);
      }
      return;
    }
    if (T - this.rosterAskAt > 40) {                                             // fetch the roster over the mesh: sideways past my dead chain via cross-links
      this.rosterAskAt = T;
      const x = crossLink(this.coord); const xid = x && this.occ.get(key(x));
      if (xid && xid !== this.id) this.emit(xid, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 });
      else { for (const rm of shuf(this, rowMates(this.coord))) { const id = this.occ.get(key(rm)); if (id && id !== this.id) { this.emit(id, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 }); break; } } }
    }
    if (T - this.lastAck > 220) return this.requeue();                           // no route to Section 1 at all → abandon ship, relay front door
  }
  reseatViaRoster() {
    const oldC = this.coord; MOVES.n++;
    if (oldC) { const seen = new Set(); for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); this.emit(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } } }
    this.coord = null; this.occ = new Map(); this.s1seen = new Map(); this.drainAt = 0; this.seatTries = 0;
    const t = this.roster && this.roster.length ? this.pickRoster() : null;
    if (t) this.askSeat(t); else this.join();
  }

  // ---- take a seat -----------------------------------------------------------
  take(coord, owner, nbrs) {
    this.coord = coord; this.state = 'seated'; this.occ.set(key(coord), this.id); this.noteS1(key(coord));
    if (nbrs) for (const [k, id] of nbrs) if (!this.occ.has(k)) { this.occ.set(k, id); this.noteS1(k); }
    this.drainAt = 0; this.seatTries = 0; this.noHome = 0; this.seatedAt = T;
    this.greetHold = Math.max(this.greetHold, T + 150);                          // become-greeter-on-join: hold the door until relieved by later arrivals
    this.lastAck = T; this.lastPhone = T;
    if (owner) this.emit(owner, { t: 'CLAIM', ck: key(coord), id: this.id });
    this.announce(); WAKE(this.id);
  }
  announce() {
    const c = this.coord, seen = new Set();
    for (const nb of ownedLinks(c)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); this.emit(id, { t: 'HELLO', ck: key(c), id: this.id }); } }
  }

  // ---- phone-home (D1) + Section-1 bookkeeping -------------------------------
  ownerCoord() { return this.coord ? ownerCoordOf(this.coord) : null; }
  phoneTargetCoord() {
    if (!this.coord) return null;
    if (this.coord.i !== 0) return seatOf(this.coord.path, this.coord.r, 0);        // row-mates phone their head
    return this.ownerCoord();                                                       // heads phone their owner — null in Section 1: the home phones no one
  }
  hasChildren() { for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) return true; } return false; }
  lowestSurvivor() { for (let j = 1; j < this.coord.i; j++) { const k = key(seatOf(this.coord.path, this.coord.r, j)); const id = this.occ.get(k); if (!id || id === this.id) continue; if (this.coord.path !== '' || this.s1Fresh(k)) return false; } return true; }   // in the HOME, a lower column only outranks me if it's actually been HEARD lately — deferring to a dead column's stale occ entry left headless rows unhealed forever (the old 'defers to a dead lower-column seat' bug, S1 edition)
  phoneHome() {
    const tc = this.phoneTargetCoord(); if (!tc) return;
    const tid = this.occ.get(key(tc));
    if (tid) this.emit(tid, { t: 'PHONE', coord: this.coord, to: key(tc), id: this.id, kids: this.hasChildren(), child: this.occ.get(key(downCoord(this.coord))) || null });
  }
  onPhone(m) {
    if (!this.coord || (m.to && m.to !== key(this.coord))) return;                   // phones address a COORD — no phantom liveness
    const ck = key(m.coord); const prev = this.occ.get(ck);
    if (prev && prev !== m.id && m.id > prev && this.live.has(ck) && T - this.live.get(ck) <= 40) return this.emit(m.id, { t: 'YIELD', ck });   // E2 with LIVENESS: I'm the authority for this cell (they phone me) — only a claimant I've actually heard recently outranks a new one; a dead lower id must not win
    this.occ.set(ck, m.id); this.live.set(ck, T); this.noteS1(ck); this.kidful.set(ck, !!m.kids); if (m.child) this.childOf.set(ck, m.child); else this.childOf.delete(ck);
    let owner = null, oCk = null, row = null;
    const myOc = this.ownerCoord(); if (myOc) { oCk = key(myOc); owner = this.occ.get(oCk) || null; }   // W2
    if (this.coord.i === 0 && m.coord.path === this.coord.path && m.coord.r === this.coord.r) {         // W3
      row = [[key(this.coord), this.id, this.occ.get(key(downCoord(this.coord))) || null]];
      for (let c = 1; c < C; c++) { const rc = seatOf(this.coord.path, this.coord.r, c); const id = this.occ.get(key(rc)); if (id && id !== m.id) row.push([key(rc), id, this.childOf.get(key(rc)) || null]); }
    }
    this.emit(m.id, { t: 'PONG', owner, oCk, row });
    if (prev && prev !== m.id) this.emit(prev, { t: 'YIELD', ck });
  }
  rowSweep() {                                                                       // D3: head backstop for silent death in my row
    if (this.coord.i !== 0) return;
    for (const [ck, at] of this.live) {
      if (T - at <= 50) continue;
      const slash = ck.indexOf('/'), dot = ck.indexOf('.', slash);
      const pth = ck.slice(0, slash), rr = +ck.slice(slash + 1, dot), ii = +ck.slice(dot + 1);
      if (pth === this.coord.path && rr === this.coord.r && ii > 0) { const kids = this.kidful.get(ck); this.live.delete(ck); this.occ.delete(ck); this.kidful.delete(ck); this.s1seen.delete(ck); if (kids || pth === '') this.heal(seatOf(pth, rr, ii)); }   // H1 (kids-gated) / H1-S1 (unconditional in the home)
    }
  }
  s1Fill() {                                                                         // H1-S1: a Section-1 head keeps its row FULL — fill ANY empty cell, childless or not.
    if (T - (this.seatedAt || 0) < 80) return;                                    // warm-up: give my row time to phone me before I judge any cell
    for (let j = 1; j < C; j++) {                                                    // the row authority is the PHONE (D1), never occ: a yielded/phantom claimant can sit in occ forever and W3/W5 will faithfully re-circulate the stale entry — a cell that is not phoning me is NOT THERE
      const c = seatOf('', this.coord.r, j); const ck = key(c);
      const lv = this.live.get(ck);
      if (lv !== undefined && T - lv <= 60) continue;                             // phoning → present
      if (this.occ.has(ck)) { this.occ.delete(ck); this.live.delete(ck); this.s1seen.delete(ck); this.kidful.delete(ck); }   // purge the phantom so W3/W5 stop spreading it
      return this.heal(c);
    }
  }
  s1Sync() {                                                                         // W5: freshness-tagged roster entries flow across the section every phone beat
    const ent = [[key(this.coord), this.id, 0]];
    for (const [ck, id] of this.occ) if (ck.charCodeAt(0) === 47 && id !== this.id) { const at = this.s1seen.get(ck); if (at !== undefined && T - at < 120) ent.push([ck, id, T - at]); }
    const tgts = new Set();
    const x = crossLink(this.coord); if (x) { const id = this.occ.get(key(x)); if (id && id !== this.id) tgts.add(id); }
    for (const rm of rowMates(this.coord)) { const id = this.occ.get(key(rm)); if (id && id !== this.id) tgts.add(id); }
    const ab = this.occ.get(key(seatOf('', (this.coord.r - 1 + C) % C, this.coord.i))); if (ab && ab !== this.id) tgts.add(ab);   // W5 rides the H7 COLUMN CYCLE too: I sync the seat directly above me…
    const be = this.occ.get(key(seatOf('', (this.coord.r + 1) % C, this.coord.i))); if (be && be !== this.id) tgts.add(be);   // …and directly below me. A resurrected row's head has no row-mates and no cross yet — its backfiller below is its ONLY standing channel, and this is it.
    for (const id of tgts) this.emit(id, { t: 'S1SYNC', ent });
  }

  tick() {
    if (!this.alive) {  return; }
    if (this.state !== 'seated') {
      if ((this.state === 'joining' || this.state === 'asking') && T - this.retryAt > 20) this.join();
      else if (this.state === 'searching' && T - this.retryAt > 60) { if (this.roster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t) this.askSeat(t); else this.join(); } else { this.seatTries = 0; this.join(); } }
      WAKE(this.id); return;
    }
    if (this.evil) this.attack();                                                   // ADVERSARY: an insider with the room key forges eviction claims at its neighbours every tick
    if (this.coord.path === '') {                                                    // SECTION 1: always on — the home runs its bookkeeping in every phase
      if (this.greetAt === undefined) this.greetAt = T + ((this.rng() * GREET_PERIOD) | 0);
      if (T >= this.greetAt) { this.greetAt = T + GREET_PERIOD + ((this.rng() * GREET_PERIOD) | 0); this.recv({ t: 'GREETWALK', ttl: 1 + ((this.rng() * 5) | 0) }); }   // H6
      if (T - this.lastPhone >= 8) { this.lastPhone = T; this.phoneHome(); this.s1Sync(); }   // D1 + W5
      if (this.coord.i === 0 && (T % 12) === 0) { this.rowSweep(); this.s1Fill(); }              // D3 + H1-S1
      if (this.coord.i > 0 && T - this.lastAck > 40 && T - this.healAt > 20 && this.lowestSurvivor()) this.heal(seatOf('', this.coord.r, 0));   // H2 — Section-1 rows heal their head like any other row
      if (this.coord.i > 0 && T >= this.xlinkAt) { this.xlinkAt = T + 150 + ((this.rng() * 100) | 0); if (!this.occ.get(key(crossLink(this.coord)))) this.probeXlink(); }
      if (this.s1CheckAt === undefined) this.s1CheckAt = T + 150 + ((this.rng() * 150) | 0);
      if (T >= this.s1CheckAt) { this.s1CheckAt = T + 250 + ((this.rng() * 150) | 0); this.auditPend = true; this.greetHold = Math.max(this.greetHold, T + 30); this.knock(); }   // E3 self-audit heartbeat: open the front door, read the roster, walk WHOHOME
      WAKE(this.id); return;                                                   // Section-1 seats never drain, never requeue: you ARE the home
    }
    if (T - this.lastPhone >= 8) { this.lastPhone = T; this.phoneHome(); }      // D1
    if (this.coord.i === 0 && (T % 12) === 0) this.rowSweep();                     // D3
    if (this.coord.i > 0 && T - this.lastAck > 40 && T - this.healAt > 20 && this.lowestSurvivor()) this.heal(seatOf(this.coord.path, this.coord.r, 0));   // H2
    if (this.coord.i > 0 && T >= this.xlinkAt) { this.xlinkAt = T + 150 + ((this.rng() * 100) | 0); if (!this.occ.get(key(crossLink(this.coord)))) this.probeXlink(); }   // keep my sideways escape live (the drain depends on it)
    if (this.drainAt && T >= this.drainAt) return this.reseatViaRoster();          // E1: my turn in the drain
    if (T - this.lastAck > 80) this.drainOrReenter();                              // D4 → E1: severed — drain my subtree over the mesh (relay only as last resort)
    WAKE(this.id);
  }
  leave() {
    this.alive = false;  this.wsClose(); if (!this.coord) return;
    const ck = key(this.coord); const seen = new Set();
    for (const nb of ownedLinks(this.coord)) { const id = this.occ.get(key(nb)); if (id && !seen.has(id)) { seen.add(id); this.emit(id, { t: 'LEAVE', ck, id: this.id }); } }
    const o = this.ownerCoord(); const oid = o && this.occ.get(key(o)); if (oid && !seen.has(oid)) this.emit(oid, { t: 'LEAVE', ck, id: this.id });
  }
}

function ownerCoordOf(c) {                                                           // owner of an arbitrary coord (the cell it phones/depends on)
  if (c.path === '') return null;                                                    // Section 1 is ownerless — it IS the home
  return upCoord(seatOf(c.path, c.r, 0));
}
// ---- transport overrides: the seat EMITS instead of touching the fabric ----
Seat.prototype.emit = function (to, msg) {
  if (to === 'relay') { OUT_FABRIC.push({ op: 'knock', id: this.id, hold: this.greetHold || 0 }); return; }
  OUT_MSG.push({ from: this.id, to, msg });
};
Seat.prototype.knock = function () { OUT_FABRIC.push({ op: 'knock', id: this.id, hold: this.greetHold || 0 }); };
Seat.prototype.wsClose = function () {};      // main owns the greeter pool (via greetHold on the knock op)
Seat.prototype.wsRecv = function () {};       // main delivers GREETERS as an ordinary message
Seat.prototype.dcReady = function () {};      // main owns the DC outbox
Seat.prototype.rng = function () { this.rs = (this.rs + 0x6d2b79f5) >>> 0; let t = this.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// ---- migration: a seat's whole state as a transferable plain object ----
Seat.prototype.toState = function () { const o = {}; for (const k of Object.keys(this)) { const v = this[k]; o[k] = (v instanceof Map) ? { __m: [...v] } : v; } return o; };
function fromState(o) { const s = Object.create(Seat.prototype); for (const k of Object.keys(o)) { const v = o[k]; s[k] = (v && v.__m) ? new Map(v.__m) : v; } return s; }

module.exports = {
  makeSeat: (id, evil) => { const s = new Seat(id); s.rs = seedOf(id); s.evil = !!evil; return s; },
  setTick: (t) => { T = t; }, setHealing: (h) => { HEALING = h; },
  drain: () => { const o = { msg: OUT_MSG.slice(), fab: OUT_FABRIC.slice(), wake: OUT_WAKE.slice() }; OUT_MSG.length = 0; OUT_FABRIC.length = 0; OUT_WAKE.length = 0; return o; },
  moves: () => MOVES.n, evictions: () => EVICTIONS.n,
  fromState,
  key, seatOf, C, M,
};
