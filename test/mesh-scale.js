/*
 * mesh-scale.js — SCALABLE simulation of the introducer mesh, v2 topology
 * (per-row ownership, bidirectional tree links; site/js/mesh.js v2).
 *
 * OWNERSHIP is per-ROW and distributed: every seat (path,r,i) owns row r of its
 * child section path·i — up to C seats reached through that row's 0th seat. The
 * root (0,0) additionally owns Section 1 (its five rows uplink to it). A row's
 * owner admits into the row, keeps it dense (in-row compaction), and — on each
 * phone-home — re-homes the row UP to the shallowest free downlink (vertical
 * compaction), which is also how a row heals when its owner absconds.
 *
 *   node test/mesh-scale.js [N] [leaveFraction]
 *
 * This build proves JOIN convergence on the v2 topology first; healing follows.
 */
'use strict';
const M = require('../site/js/mesh.js');
const C = M.C, key = M.key, seatOf = M.seat;
const N = parseInt(process.argv[2] || '10000', 10);
const LEAVE = parseFloat(process.argv[3] || '0');

let _seed = 20260714;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const shuffle = (a) => { for (let k = a.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; const t = a[k]; a[k] = a[j]; a[j] = t; } return a; };
const pickN = (a, k) => { if (a.length <= k) return a.slice(); const o = [], u = new Set(); while (o.length < k) { const j = (rnd() * a.length) | 0; if (!u.has(j)) { u.add(j); o.push(a[j]); } } return o; };

const buckets = new Map(); let TICK = 0, inflight = 0, HEALING = false, MOVES = 0;
const send = (to, msg) => { const at = TICK + 1 + ((rnd() * 3) | 0); let b = buckets.get(at); if (!b) buckets.set(at, b = []); b.push({ to, msg }); inflight++; };

const upCoord = M.up, downCoord = M.down, rowMates = M.rowMates, crossLink = M.crossLink, ownedLinks = M.ownedLinks;
const parentPath = M.parentPath, lastDigit = M.lastDigit;

// The row a seat owns: row s.r of child section (s.path · s.i). Represented by
// its 0th seat (the head); the ≤C seats are columns 0..C-1 of that row.
const ownedRowHead = (s) => seatOf(M.childPath(s.path, s.i), s.r, 0);
const ownedRowSeat = (s, col) => seatOf(M.childPath(s.path, s.i), s.r, col);

// Relay: single front door for the whole STADIUM (one room = one URL).
const relay = { g: [], set: new Set(), recent: [],
  open(id) { if (!this.set.has(id)) { this.set.add(id); this.g.push(id); } },
  knock(id) {                                                                     // greeters ONLY — no founder/root pointer. Genesis serialises through the arrival stream.
    const out = []; for (let k = 0; k < this.g.length && out.length < 6; k++) { const c = this.g[k]; const s = seats.get(c); if (s && s.alive && s.state === 'seated' && c !== id) out.push(c); }   // EARLIEST seated = shallow = reliably root-connected. A greeter only relays WHOROOT→root, so reliability beats recency; placement disperses in root's dense descent, not here.
    if (out.length === 0) for (let k = this.recent.length - 1; k >= 0 && out.length < 4; k--) { const c = this.recent[k]; const s = seats.get(c); if (s && s.alive && c !== id) out.push(c); }   // none seated yet → hand out recent knockers so the SECOND arrival waits on the first (empty ⇒ genesis root)
    this.recent.push(id); if (this.recent.length > 8) this.recent.shift();
    send(id, { t: 'GREETERS', list: shuffle(out) });
  } };

const seats = new Map(); let nextId = 0;
let active = new Set(); const wake = (id) => active.add(id);

class Seat {
  constructor(id) {
    this.id = id; this.coord = null; this.occ = new Map();   // occ: coord-key -> id, for cells I know (my roster + neighbours)
    this.state = 'joining'; this.alive = true; this.retryAt = -1; this.rootOwner = null; this.candidates = [];
    this.live = new Map();                                    // owner side: roster-cell key -> last-phone tick
    this.lastPhone = -99; this.lastAck = 0; this.myOwner = null;
    this.healAt = -99;   // healing: last promotion attempt tick cached id of my row's owner (gossiped by the head, so any survivor can promote a new head that knows where to phone up).
    this.kidful = new Map();   // row-mate cell -> does it have downlinks (children)? A hole left by a CHILDLESS sibling has no dependents, so we never fill it (kills come-and-go churn).
    this.childOf = new Map();   // row-mate cell -> that cell's CHILD-ROW HEAD id (shared live across the row) so a healer can attach the downlink at promotion → the orphan reconnects in one hop, no relay re-entry.
  }
  isRoot() { return this.coord && this.coord.path === '' && this.coord.r === 0 && this.coord.i === 0; }

  // ---- roster: the cells I admit into ------------------------------------
  // The root owns all of Section 1 (25). Everyone else owns their single child
  // row (≤C). rosterCells() lists the coords I'm the authority for.
  rosterCells() {
    if (!this.coord) return [];
    const out = [];
    if (this.isRoot()) { for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) out.push(seatOf('', r, i)); }
    else { const h = ownedRowHead(this.coord); for (let c = 0; c < C; c++) out.push(seatOf(h.path, h.r, c)); }
    return out;
  }
  firstFreeInRoster() { for (const c of this.rosterCells()) if (!this.occ.has(key(c))) return c; return null; }
  rosterFull() { return this.firstFreeInRoster() === null; }

  // ---- join --------------------------------------------------------------
  join() { this.state = 'joining'; this.retryAt = TICK; this.rootOwner = null; send('relay', { t: 'KNOCK', id: this.id }); wake(this.id); }
  askRoot(target) { this.state = 'searching'; this.retryAt = TICK; send(target, { t: 'FIND', nc: this.id, ttl: 200 }); }

  recv(m) {
    if (!this.alive) return;
    switch (m.t) {
      case 'GREETERS':
        if (m.list.length === 0) { if (this.state === 'joining') return this.take(seatOf('', 0, 0), null, []); return; }   // empty ⇒ genesis founder = root (0,0)
        if (this.state === 'joining') { send(m.list[0], { t: 'WHOROOT', from: this.id, ttl: 60 }); this.state = 'asking'; this.retryAt = TICK; }
        return;
      case 'WHOROOT': {                                                                // a newcomer/re-entrant finds the CURRENT root by walking the MESH to (0,0). No cache.
        if (!this.coord || (m.ttl | 0) <= 0) return;
        if (this.isRoot()) return send(m.from, { t: 'ROOT', root: this.id });
        const fwd = (id) => { if (id && id !== this.id && id !== m.via) { send(id, { t: 'WHOROOT', from: m.from, via: this.id, ttl: (m.ttl | 0) - 1 }); return true; } return false; };
        if (this.coord.i !== 0) { if (fwd(this.occ.get(key(seatOf(this.coord.path, this.coord.r, 0))))) return; }   // CLIMB: not my row's head → route to the head (it holds the uplink)
        else if (fwd(this.ownerId())) return;                                          // I AM the head → go UP to my owner
        const x = crossLink(this.coord); if (x && fwd(this.occ.get(key(x)))) return;   // uplink absent/unknown → hop SIDEWAYS to a row that can climb
        for (const rm of rowMates(this.coord)) { const cx = crossLink(rm); if (cx && fwd(this.occ.get(key(cx)))) return; }
        return;
      }
      case 'ROOT': if (this.state === 'asking') { this.noRoot = 0; this.rootOwner = m.root; this.askRoot(m.root); } return;   // found a live root → reset the no-root-remint countdown and search for a seat under it
      case 'FIND': return this.serveFind(m);
      case 'FINDLEAF': return this.findLeaf(m.hole, m.nbrs, m.ttl);                    // a healer's probe descending its subtree to a leaf, which promotes into the hole
      case 'PLACE': if (this.state === 'searching') this.take(m.coord, m.owner, m.nbrs, m.rootOwner); return;
      case 'NOROOM': if (this.state === 'searching') { this.retryAt = TICK; if (this.rootOwner) this.askRoot(this.rootOwner); else this.join(); } return;
      case 'HELLO': {
        if (HEALING && this.coord && this.state === 'seated' && m.ck === key(this.coord) && m.id !== this.id && m.id < this.id) return this.requeue();   // a lower id also holds my coord (promotion race) — I yield and re-enter
        const prev = this.occ.get(m.ck);
        if (HEALING && prev && prev !== m.id) send(m.id > prev ? m.id : prev, { t: 'YIELD', ck: m.ck });    // I see TWO ids on one cell — the higher yields
        if (prev !== m.id) { this.occ.set(m.ck, m.id); if (this.coord) send(m.id, { t: 'HELLO', ck: key(this.coord), id: this.id }); }
        return;
      }
      case 'YIELD': if (HEALING && this.coord && this.state === 'seated' && key(this.coord) === m.ck) return this.requeue(); return;
      case 'CLAIM': if (this.occ.get(m.ck) !== m.id) { this.occ.set(m.ck, m.id); this.live.set(m.ck, TICK); } return;   // a seat that phoned me confirms; keep my view
      case 'LEAVE': {
        const hadKids = this.kidful.get(m.ck);
        if (this.occ.get(m.ck) === m.id) { this.occ.delete(m.ck); this.live.delete(m.ck); this.kidful.delete(m.ck); }
        if (HEALING && this.coord && this.state === 'seated') {
          const [pr, ii] = m.ck.split('.'); const [pth, rr] = pr.split('/'); const ci = +ii, cr = +rr;
          if (pth === this.coord.path && cr === this.coord.r && ci !== this.coord.i) {   // a hole opened in MY row → keep the row whole
            if (ci === 0 && this.coord.i > 0 && this.lowestSurvivor()) return this.heal(seatOf(pth, cr, 0));   // head hole → the lowest-column survivor promotes a new head (row-mates relay through it, so always refill)
            if (ci > 0 && this.coord.i === 0 && hadKids) return this.heal(seatOf(pth, cr, ci));   // non-head hole → the head promotes, but ONLY if that sibling had downlinks (a childless leaver is never filled)
          }
        }
        return;
      }
      case 'GREETWALK': {                                                            // H6: a random descendant walk started by a Section-1 seat — keep walking down to a random occupied child, then that seat refreshes itself into the greeter pool
        if (!this.coord || this.state !== 'seated') return;
        if ((m.ttl | 0) > 0) { const kids = []; for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) kids.push(id); } if (kids.length) return send(kids[(rnd() * kids.length) | 0], { t: 'GREETWALK', ttl: (m.ttl | 0) - 1 }); }
        return relay.open(this.id);                                                  // I'm the chosen descendant → make myself a greeter (front door stays stocked with live members, no matter how the tree churns)
      }
      case 'PHONE': return this.onPhone(m);                                          // a seat that phones me (my row-mate if I'm the head; my child head if I'm the owner)
      case 'PONG': this.lastAck = TICK; if (m.oCk && m.owner && this.occ.get(m.oCk) !== m.owner) this.occ.set(m.oCk, m.owner); if (m.row) for (const [k, id, ch] of m.row) { if (this.occ.get(k) !== id) this.occ.set(k, id); if (ch) this.childOf.set(k, ch); } return;   // answered live + handed me my grandparent (owner's owner) AND, if from my head, the row roster → I can wire the up-link when healing my owner, and wire around any row-mate that vanishes
      case 'ROUTE': {
        if (!this.coord) return;
        if (key(this.coord) === key(m.target)) return send(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: this.id });   // I'm the target — hand back the live connection
        if ((m.ttl | 0) <= 0) return send(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null });
        const nh = this.nextHopToward(m.target, m.via);
        if (nh) return send(nh, { t: 'ROUTE', target: m.target, asker: m.asker, tag: m.tag, ttl: (m.ttl | 0) - 1, via: this.id });
        return send(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null });   // no live neighbour is closer — dead end (target empty/unreachable)
      }
      case 'ROUTED':
        if (m.tag === 'xlink') { if (m.id && this.coord) { this.occ.set(key(m.target), m.id); send(m.id, { t: 'HELLO', ck: key(this.coord), id: this.id }); } return; }   // discovered my cross-partner → record it and HELLO so it records me (bidirectional)
        if (m.tag === 'owner') { if (m.id && this.coord) { this.occ.set(key(m.target), m.id); this.lastPhone = TICK - 100; } return; }   // rediscovered my owner → record it and phone it right away (reconnected, no re-entry)
        if (this._onRouted) this._onRouted(m); return;
    }
  }
  routeTo(target, tag) { const nh = this.nextHopToward(target); if (key(this.coord) === key(target)) { if (this._onRouted) this._onRouted({ tag, target, id: this.id }); return; } if (nh) send(nh, { t: 'ROUTE', target, asker: this.id, tag, ttl: 60, via: this.id }); else if (this._onRouted) this._onRouted({ tag, target, id: null }); }
  probeXlink() { const x = this.coord && crossLink(this.coord); if (x && !this.occ.get(key(x))) this.routeTo(x, 'xlink'); }   // establish my cross-link by routing to my transpose partner (over up/down/row — needs no cross-links)

  ownerId() {                                                                       // the seat that owns me (where my row's 0th seat uplinks)
    if (!this.coord || this.isRoot()) return null;
    const u = upCoord(seatOf(this.coord.path, this.coord.r, 0));
    return u ? (this.occ.get(key(u)) || null) : null;
  }

  // ---- route: a live connection to ANY coordinate, over 100%-wired links ----
  // Rows can only change at Section 1 (via the row-0 hub of the internal tree),
  // so: a target in a DIFFERENT row → climb to Section 1, cross row-0 to the
  // target row, then descend; a target in the SAME row → just climb to the
  // common ancestor and descend by path. Every hop is an up / down / row-mate
  // link — all 100% established — so this needs NO cross-links (and is exactly
  // what bootstraps them).
  nextHopCoord(t) {
    const C = this.coord;
    if (C.path === t.path && C.r === t.r && C.i === t.i) return null;               // arrived
    if (C.r !== t.r) {                                                              // ROW CHANGE → do it at Section 1
      if (C.path !== '') return C.i !== 0 ? seatOf(C.path, C.r, 0) : upCoord(C);    // climb (up preserves my row) to Section 1
      if (C.r !== 0) return C.i !== 0 ? seatOf('', C.r, 0) : upCoord(C);            // Section-1 row r → head → up to its owner (0,0,r) on row 0
      if (C.i !== t.r) return seatOf('', 0, t.r);                                   // on row 0: slide to column t.r …
      return seatOf('', t.r, 0);                                                    // … then down into row t.r (its head phones (0,0,t.r), so it's known)
    }
    const pa = C.path, pb = t.path;                                                 // SAME ROW → navigate by path
    let l = 0; while (l < pa.length && l < pb.length && pa[l] === pb[l]) l++;
    if (l < pa.length) return C.i !== 0 ? seatOf(pa, C.r, 0) : upCoord(C);          // climb to the common ancestor
    if (pa.length < pb.length) { const d = +pb[pa.length]; return C.i !== d ? seatOf(pa, C.r, d) : M.down(C); }   // descend: align column to the path digit, then down
    return seatOf(pa, C.r, t.i);                                                    // same section + row → row-mate
  }
  nextHopToward(target, exclude) {
    if (!this.coord) return null;
    const ideal = this.nextHopCoord(target);
    if (ideal) { const id = this.occ.get(key(ideal)); if (id && id !== this.id && id !== exclude) return id; }
    const x = crossLink(this.coord); if (x) { const id = this.occ.get(key(x)); if (id && id !== this.id && id !== exclude) return id; }   // ideal hop is a HOLE (e.g. my dead owner) → escape SIDEWAYS via a cross-link to a row that can proceed
    for (const rm of rowMates(this.coord)) { const cx = crossLink(rm); if (!cx) continue; const id = this.occ.get(key(cx)); if (id && id !== this.id && id !== exclude) return id; }
    return null;
  }

  // Serve "find me a seat": admit into my roster (dense) or descend to a child
  // row that has room. Dense-before-deep: my roster fills before my children.
  serveFind(m) {
    if (!this.coord || (m.ttl | 0) <= 0) return send(m.nc, { t: 'NOROOM' });
    const free = this.firstFreeInRoster();
    if (free) return this.admit(free, m.nc);
    // roster full — hand the newcomer down to one of my roster seats, whose own
    // roster (a deeper row) may have room. Round-robin/random for balance.
    const cells = shuffle(this.rosterCells());
    for (const c of cells) { const occId = this.occ.get(key(c)); if (occId && occId !== this.id) return send(occId, { t: 'FIND', nc: m.nc, ttl: (m.ttl | 0) - 1 }); }
    return send(m.nc, { t: 'NOROOM' });
  }
  admit(coord, nc) {
    this.occ.set(key(coord), nc);
    const nbrs = []; for (const nb of ownedLinks(coord)) { const id = this.occ.get(key(nb)); if (id && id !== nc) nbrs.push([key(nb), id]); }
    send(nc, { t: 'PLACE', coord, owner: this.id, nbrs, rootOwner: this.isRoot() ? this.id : this.rootOwner });
  }

  // ---- healing: ONE motion — every row keeps ITSELF whole -----------------
  // A row watches its own C cells. A hole (a cell that was occupied and departed)
  // is filled by a survivor promoting a LEAF from its own subtree into it — never
  // by moving a subtree. Roles within the row: the head heals its non-head cells
  // (it hears them phone), the row-mates heal the head (they hear it PONG); first
  // writer wins, losers re-enter via the relay. The hole's orphaned subtree
  // re-attaches on its own once the cell is filled (it just phones the new
  // occupant). (0,0) is healed by its own row 0 — same motion — so the root
  // re-anchors for free, with no root stored anywhere.
  heal(hole) {
    if (!this.coord || this.state !== 'seated' || TICK - this.healAt < 12) return;    // throttle: one promotion attempt in flight
    this.healAt = TICK;
    const rootHole = hole.path === '' && hole.r === 0 && hole.i === 0;
    const nbrs = []; for (const nb of ownedLinks(hole)) { const id = this.occ.get(key(nb)); if (id && id !== this.id) nbrs.push([key(nb), id]); }
    if (rootHole && ownedLinks(hole).some((nb) => key(nb) === key(this.coord))) nbrs.push([key(this.coord), this.id]);   // the ROOT hole has no owner to phone, so the new root reconnects to me (its row-mate healer) only by announce — include me so it tells me it exists and I stop re-firing (else duplicate roots)
    const oc = this.ownerCoordOf(hole); if (oc) { const oid = this.occ.get(key(oc)); if (oid && !nbrs.some((n) => n[0] === key(oc))) nbrs.push([key(oc), oid]); }   // the promoted seat needs its owner id — REAL-TIME from my occ, never gossip
    if (rootHole && this.coord.i > 0) {                                              // ROOT re-anchor (H4): try to promote a leaf from my subtree, but if that keeps failing (subtree is dead — its occ entries are stale), scooch in myself so (0,0) actually fills
      this.rootTries = (this.rootTries || 0) + 1;
      if (this.rootTries <= 6) for (const c of shuffle(this.rosterCells())) { const id = this.occ.get(key(c)); if (id && id !== this.id) return send(id, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); }
      return this.promoteInto(hole, nbrs);                                           // >6 failed rounds, or no occupied child → scooch (chasing dead children forever was the roots=0 collapse)
    }
    for (const c of shuffle(this.rosterCells())) { const id = this.occ.get(key(c)); if (id && id !== this.id) return send(id, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); }   // promote a leaf strictly from BELOW me (child-heals-parent, my own subtree)…
    if (hole.i === 0 && this.coord.i > 0 && !this.hasChildren()) this.promoteInto(hole, nbrs);   // …unless a CHILDLESS frontier row lost its head — then the lowest survivor scooches itself in
  }
  findLeaf(hole, nbrs, ttl) {                                                         // a DESCENDED node: keep going to a leaf, then that leaf fills the hole
    if (!this.coord) return;
    if ((ttl | 0) > 0) for (const c of shuffle(this.rosterCells())) { const id = this.occ.get(key(c)); if (id && id !== this.id) return send(id, { t: 'FINDLEAF', hole, nbrs, ttl: (ttl | 0) - 1 }); }
    this.promoteInto(hole, nbrs);                                                     // no occupied child → I AM a leaf → I fill the hole
  }
  promoteInto(hole, nbrs) {
    if (this.isRoot() || key(this.coord) === key(hole)) return;
    MOVES++;
    const oldC = this.coord, seen = new Set();                                        // vacate my old (frontier) cell — it's a childless leaf, so siblings won't re-fill it (no cascade)
    for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); send(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } }
    this.occ = new Map();
    this.take(hole, null, nbrs, this.rootOwner);                                      // become the hole; announce → the subtree below re-attaches, I phone up
    this.lastAck = TICK; this.lastPhone = TICK - 100;
  }
  requeue() {                                                                        // give up my seat (severed branch / promotion-race loser) and re-enter from the front door
    const oldC = this.coord; MOVES++;
    if (oldC) { const seen = new Set(); for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); send(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } } }
    this.coord = null; this.occ = new Map(); this.rootOwner = null;
    this.join();
  }

  // ---- take a seat -------------------------------------------------------
  take(coord, owner, nbrs, rootOwner) {
    this.coord = coord; this.state = 'seated'; this.occ.set(key(coord), this.id);
    this.rootOwner = rootOwner || (coord.path === '' && coord.r === 0 && coord.i === 0 ? this.id : this.rootOwner);
    if (nbrs) for (const [k, id] of nbrs) if (!this.occ.has(k)) this.occ.set(k, id);
    relay.open(this.id); this.lastAck = TICK; this.lastPhone = TICK;
    if (owner) send(owner, { t: 'CLAIM', ck: key(coord), id: this.id });
    this.announce(); wake(this.id);
  }
  announce() {                                                                       // open my links: HELLO each neighbour I can name
    const c = this.coord, seen = new Set();
    for (const nb of ownedLinks(c)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); send(id, { t: 'HELLO', ck: key(c), id: this.id }); } }
  }

  // ---- phone-home: the row heartbeat that detects holes -------------------
  // Row-mates phone their HEAD; the head phones its OWNER. So the head hears its
  // whole row (detects a dead non-head cell) and the row-mates hear the head
  // (detect a dead head). That's all the liveness the one healing motion needs.
  ownerCoordOf(c) {                                                               // owner of an arbitrary coord (the cell it phones/depends on)
    if (c.path === '' && c.r === 0 && c.i === 0) return null;                     // root has no owner
    if (c.path === '' && c.r === 0) return seatOf('', 0, 0);                      // root row (0,0,*) → root (0,0)
    return upCoord(seatOf(c.path, c.r, 0));                                        // Section-1 row r>0 → (0,0,r); everywhere else → parent
  }
  ownerCoord() { return this.coord ? this.ownerCoordOf(this.coord) : null; }
  phoneTargetCoord() {                                                               // who I phone: my head if I'm a row-mate, else my owner
    if (!this.coord || this.isRoot()) return null;
    return this.coord.i !== 0 ? seatOf(this.coord.path, this.coord.r, 0) : this.ownerCoord();
  }
  hasChildren() { for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) return true; } return false; }
  lowestSurvivor() { for (let j = 1; j < this.coord.i; j++) { const id = this.occ.get(key(seatOf(this.coord.path, this.coord.r, j))); if (id && id !== this.id) return false; } return true; }   // am I the lowest-column survivor of my row? (the one who promotes a new head — deterministic, so no race)
  phoneHome() {
    const tc = this.phoneTargetCoord(); if (!tc) return;
    const tid = this.occ.get(key(tc)); this.myOwner = tid;
    if (tid) send(tid, { t: 'PHONE', coord: this.coord, to: key(tc), id: this.id, kids: this.hasChildren(), child: this.occ.get(key(downCoord(this.coord))) || null });   // …share my child-row head id so my row (and my parent) can wire around me if I vanish
  }
  onPhone(m) {                                                                       // someone phones me: confirm liveness (FWW arbitration); if I'm their head, gossip our owner
    if (!this.coord || (m.to && m.to !== key(this.coord))) return;                    // phones address a COORD — if I've moved off it, I'm not that cell anymore (no phantom liveness)
    const ck = key(m.coord); const prev = this.occ.get(ck);
    if (prev && prev !== m.id && m.id > prev) return send(m.id, { t: 'YIELD', ck });  // a lower id already holds this cell — you yield
    this.occ.set(ck, m.id); this.live.set(ck, TICK); this.kidful.set(ck, !!m.kids); if (m.child) this.childOf.set(ck, m.child); else this.childOf.delete(ck);
    let owner = null, oCk = null, row = null;
    const myOc = this.ownerCoord(); if (myOc) { oCk = key(myOc); owner = this.occ.get(oCk) || null; }   // ALWAYS tell my phoner who MY owner is → they learn their grandparent in real-time. That's how a Section-1 row-r head learns (0,0), so when it heals (0,0,r) it can hand the new seat its root up-link (child-heals-parent needs the grandparent).
    if (this.coord.i === 0 && m.coord.path === this.coord.path && m.coord.r === this.coord.r) {   // I'm the head, phoner is my row-mate: also hand back the CURRENT row roster (each member's id AND its child-row head, so any row-mate can wire the downlink when healing)
      row = [[key(this.coord), this.id, this.occ.get(key(downCoord(this.coord))) || null]];
      for (let c = 1; c < C; c++) { const rc = seatOf(this.coord.path, this.coord.r, c); const id = this.occ.get(key(rc)); if (id && id !== m.id) row.push([key(rc), id, this.childOf.get(key(rc)) || null]); }
    }
    send(m.id, { t: 'PONG', owner, oCk, row });
    if (prev && prev !== m.id) send(prev, { t: 'YIELD', ck });
  }
  rowSweep() {                                                                       // head: a row-mate cell that stopped phoning is a hole → heal it (backstop for silent death; LEAVE handles the announced case)
    if (this.coord.i !== 0) return;
    for (const [ck, at] of this.live) {
      if (TICK - at <= 50) continue;
      const slash = ck.indexOf('/'), dot = ck.indexOf('.', slash);
      const pth = ck.slice(0, slash), rr = +ck.slice(slash + 1, dot), ii = +ck.slice(dot + 1);
      if (pth === this.coord.path && rr === this.coord.r && ii > 0) { const kids = this.kidful.get(ck); this.live.delete(ck); this.occ.delete(ck); this.kidful.delete(ck); if (kids) this.heal(seatOf(pth, rr, ii)); }   // only refill a departed sibling that had downlinks
    }
  }

  tick() {
    if (!this.alive) { active.delete(this.id); return; }
    if (this.state !== 'seated') {                                                   // unseated: keep retrying, and STAY scheduled (never drop out of `active`)
      if ((this.state === 'joining' || this.state === 'asking') && TICK - this.retryAt > 20) {
        if (HEALING && (this.noRoot = (this.noRoot || 0) + 1) >= 5) { this.noRoot = 0; return this.take(seatOf('', 0, 0), null, []); }   // H5 (deadlock breaker): I re-entered and 5 cycles of greeter-WHOROOT found NO root anywhere → the whole of row 0 died, so there is nothing to seat under → genesis-remint (0,0) myself. Reliable because greeter-WHOROOT reaches any live root 100%, so this fires ONLY when there truly is none; a live root resets noRoot in the ROOT handler. Duplicates dedupe by id (HELLO/YIELD).
        this.join();
      }
      else if (this.state === 'searching' && TICK - this.retryAt > 60) { this.rootOwner ? this.askRoot(this.rootOwner) : this.join(); }
      active.add(this.id); return;
    }
    if (!HEALING) { active.delete(this.id); return; }
    if (this.coord.path === '') { if (this.greetAt === undefined) this.greetAt = TICK + ((rnd() * GREET_PERIOD) | 0); if (TICK >= this.greetAt) { this.greetAt = TICK + GREET_PERIOD + ((rnd() * GREET_PERIOD) | 0); this.recv({ t: 'GREETWALK', ttl: 1 + ((rnd() * 5) | 0) }); } }   // H6: every Section-1 seat, on its own randomized ~25-min timer, sends a RANDOM descendant to (re)join the greeter pool — keeps the relay fresh with live members, tolerates greeter churn/poisoning, and helps re-entrants always reach a live root
    if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.phoneHome(); }
    if (this.coord.i === 0 && (TICK % 12) === 0) this.rowSweep();                     // head: sweep for dead non-head cells in my row
    if (this.coord.i > 0 && TICK - this.lastAck > 40 && TICK - this.healAt > 20 && this.lowestSurvivor()) this.heal(seatOf(this.coord.path, this.coord.r, 0));   // my head stopped answering → the lowest-column survivor promotes a new head (deterministic, no race)
    if (this.coord.path === '' && this.coord.r > 0 && this.coord.i === 0 && TICK - this.lastAck > 40 && TICK - this.healAt > 20 && !this.occ.get(key(this.ownerCoord())) && this.occ.get(key(seatOf('', 0, 0)))) return this.heal(this.ownerCoord());   // I'm a Section-1 row-r head and my owner (0,0,r) is empty → heal it from my own subtree (H3, the two-step). Gated on a live root so the promoted seat can phone the root for the row-0 roster. When the WHOLE of row 0 died (no root either), this can't fire — that deadlock is broken by the genesis-remint in the re-entry path below (H5): a re-entrant that finds no root ANYWHERE mints one.
    if (!this.isRoot() && !(this.coord.path === '' && this.coord.r === 0) && TICK - this.lastAck > 80) return this.requeue();   // branch severed → re-enter the front door — EXCEPT row-0 seats, which must stay put to re-anchor (0,0) (if they re-entered, there'd be no root to re-enter UNDER → collapse). A row-r head whose owner AND root are both gone falls back to re-entry here, then heals via the two-step once (0,0) is back.
    active.add(this.id);
  }
  leave() { this.alive = false; active.delete(this.id); if (!this.coord) return; const ck = key(this.coord); const seen = new Set(); for (const nb of ownedLinks(this.coord)) { const id = this.occ.get(key(nb)); if (id && !seen.has(id)) { seen.add(id); send(id, { t: 'LEAVE', ck, id: this.id }); } } const o = this.occ.get(key(this.ownerCoord() || seatOf('', 0, 0))); if (o) send(o, { t: 'LEAVE', ck, id: this.id }); }
}

// ---- run --------------------------------------------------------------------
const t0 = Date.now();
const joinWindow = Math.max(1, Math.min((N * 0.25) | 0, 2000));
const spawnPlan = new Map(); for (let k = 0; k < N; k++) { const t = (rnd() * joinWindow) | 0; spawnPlan.set(t, (spawnPlan.get(t) || 0) + 1); }
const MAXP = N * 30 + 60000;
const GREET_PERIOD = 800;   // H6: base ticks between a Section-1 seat's greeter-refresh walks (randomized per seat, per fire) — the sim's stand-in for the ~25-minute real timer

function step() {
  for (let s = spawnPlan.get(TICK) || 0; s > 0; s--) { const seat = new Seat('p' + String(nextId++).padStart(8, '0')); seats.set(seat.id, seat); seat.join(); }
  const due = buckets.get(TICK); if (due) { buckets.delete(TICK); inflight -= due.length; for (const e of due) { if (e.to === 'relay') relay.knock(e.msg.id); else { const s = seats.get(e.to); if (s) { s.recv(e.msg); wake(s.id); } } } }
  const cur = active; active = new Set();                                           // double-buffer: process this tick's scheduled seats; tick()/wake() enqueue into next
  for (const id of cur) { const s = seats.get(id); if (s) s.tick(); }
}
const liveSeated = () => { let c = 0; for (const s of seats.values()) if (s.alive && s.state === 'seated') c++; return c; };
const allSeated = () => { for (const s of seats.values()) if (s.alive && s.state !== 'seated') return false; return true; };

for (TICK = 0; ; TICK++) { step(); if (TICK > joinWindow + 200 && seats.size === N && inflight === 0 && allSeated()) break; if (TICK > MAXP) break; }
let failed = report('after JOIN', N);

if (process.argv[4] === 'route') {                                                  // validate the route() primitive: route between random seated pairs
  const seated = [...seats.values()].filter((s) => s.alive && s.state === 'seated' && s.coord);
  const expect = new Map(); let done = 0, hit = 0, miss = 0, wrong = 0;
  const handler = (m) => { const b = expect.get(m.tag); if (b === undefined) return; done++; if (m.id === b) hit++; else if (m.id === null) miss++; else wrong++; };
  for (const s of seats.values()) s._onRouted = handler;
  const sources = shuffle(seated.slice()); const trials = Math.min(1500, sources.length);
  for (let k = 0; k < trials; k++) { const a = sources[k]; const b = seated[(rnd() * seated.length) | 0]; if (a === b) { done++; continue; } expect.set(k, b.id); a.routeTo(b.coord, k); active.add(a.id); }
  for (let g = 0; g < 6000 && done < trials; TICK++, g++) step();
  console.log('  route: ' + hit + '/' + trials + ' reached (miss=' + miss + ', wrong=' + wrong + ', unresolved=' + (trials - done) + ')');
  process.exit(hit === trials ? 0 : 1);
}

if (process.argv[4] === 'xlink') {                                                  // establish cross-links via routing, then measure completeness
  for (let round = 0; round < 30; round++) { for (const s of seats.values()) if (s.alive && s.state === 'seated') { s.probeXlink(); active.add(s.id); } for (let g = 0; g < 16; g++, TICK++) step(); }
  const seated = [...seats.values()].filter((s) => s.alive && s.state === 'seated' && s.coord);
  const at = new Map(); for (const s of seated) at.set(key(s.coord), s.id);
  let known = 0, tot = 0;
  for (const s of seated) { const x = crossLink(s.coord); if (!x) continue; const real = at.get(key(x)); if (!real || real === s.id) continue; tot++; if (s.occ.get(key(x)) === real) known++; }
  console.log('  cross-links established: ' + known + '/' + tot + ' (' + (100 * known / (tot || 1) | 0) + '%)');
  process.exit(known === tot ? 0 : 1);
}

if (LEAVE > 0) {
  HEALING = true;
  for (const s of seats.values()) if (s.alive) { s.lastAck = TICK; s.lastPhone = TICK; s.healAt = TICK; active.add(s.id); }
  for (let w = 0; w < 48; w++, TICK++) { if ((TICK % 8) === 0) for (const s of seats.values()) if (s.alive && s.state === 'seated') active.add(s.id); step(); }   // warmup: let phone-home run a few rounds so liveness + child-status are populated, as continuous operation would
  const leaving = pickN([...seats.keys()], Math.floor(N * LEAVE));   // true random half — (0,0) heals like any other row, so nothing is protected
  for (const id of leaving) seats.get(id).leave();
  const READD = parseFloat(process.argv[4]) || 0;                    // fraction of N to re-add DURING healing (concurrent join + heal)
  const readdTotal = Math.floor(N * READD); let readdDone = 0;
  const expect = (N - leaving.length) + readdTotal, start = TICK;
  const readdPlan = new Map(); for (let k = 0; k < readdTotal; k++) { const t = start + 4 + ((rnd() * joinWindow) | 0); readdPlan.set(t, (readdPlan.get(t) || 0) + 1); }   // trickle newcomers in over the join window, starting almost immediately (don't wait for heal)
  for (const s of seats.values()) if (s.alive) active.add(s.id);
  let seatedSince = TICK;
  for (; ; TICK++) {
    for (let s = readdPlan.get(TICK) || 0; s > 0; s--) { const seat = new Seat('q' + String(nextId++).padStart(8, '0')); seats.set(seat.id, seat); seat.join(); readdDone++; }   // concurrent newcomers land mid-heal
    if ((TICK % 8) === 0) for (const s of seats.values()) if (s.alive && s.state === 'seated') active.add(s.id);   // pulse so everyone phones home
    step();
    if ((TICK % 50) === 0) {                                                          // convergence = EVERYONE seated (not "zero moves" — a tiny residual re-home churn is harmless and must not block the break)
      if (readdDone === readdTotal && liveSeated() === expect && allSeated()) { if (TICK - seatedSince > 400 && TICK - start > 300) break; } else seatedSince = TICK;
    }
    if (TICK - start > MAXP) break;
  }
  failed += report('after ' + Math.round(LEAVE * 100) + '% LEFT' + (readdTotal ? ' + ' + Math.round(READD * 100) + '% REJOIN' : ''), expect);
}
process.exit(failed ? 1 : 0);

function report(label, expect) {
  const live = [...seats.values()].filter((s) => s.alive);
  let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('    FAIL — ' + n); } };
  const seated = live.filter((s) => s.state === 'seated' && s.coord);
  ok('all ' + expect + ' live seats seated (' + seated.length + ')', seated.length === expect);
  const coords = new Map(); let dupes = 0, maxDepth = 0; for (const s of seated) { const ck = key(s.coord); maxDepth = Math.max(maxDepth, s.coord.path.length); if (coords.has(ck) && coords.get(ck) !== s.id) dupes++; else coords.set(ck, s.id); }
  ok('unique coordinates (dupes=' + dupes + ')', dupes === 0);
  // up-path: every seat reaches (0,0) through its OWNER-cell chain (each cell in a
  // row phones its owner directly, so a head may be an empty frontier cell).
  let orphan = 0;
  for (const s of seated) {
    let cur = s.coord, h = 0, live2 = true;
    while (!(cur.path === '' && cur.r === 0 && cur.i === 0)) {
      if (h++ > 80) { live2 = false; break; }
      const oc = (cur.path === '' && cur.r === 0) ? seatOf('', 0, 0) : upCoord(seatOf(cur.path, cur.r, 0));   // root row → (0,0); Section-1 row r>0 → (0,0,r); else parent
      if (!oc || !coords.has(key(oc))) { live2 = false; break; }                    // owner cell empty → orphaned
      cur = oc;
    }
    if (!live2) orphan++;
  }
  ok('every seat has a live up-path to Section 1 (orphans=' + orphan + ')', orphan === 0);
  const roots = seated.filter((s) => s.coord.path === '' && s.coord.r === 0 && s.coord.i === 0); ok('exactly one seat at the root (0,0) (' + roots.length + ')', roots.length === 1);   // the design stores NO root pointer — "one root" = one occupant of (0,0), re-anchored by its own row
  console.log('  ' + label + ': ' + pass + '/' + (pass + fail) + ' [seated=' + seated.length + ', depth<=' + maxDepth + ', ' + TICK + ' ticks, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, mem=' + (process.memoryUsage().heapUsed / 1e6 | 0) + 'MB]');
  return fail;
}
