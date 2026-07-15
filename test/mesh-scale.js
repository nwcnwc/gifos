/*
 * mesh-scale.js — SCALABLE simulation of the introducer mesh, v2 topology
 * (per-row ownership, bidirectional tree links; site/js/mesh.js v2).
 *
 * OWNERSHIP is per-ROW and distributed: every seat (path,r,i) owns row r of its
 * child section path·i — up to C seats reached through that row's 0th seat.
 * THERE IS NO ROOT SEAT: Section 1 (path='') is the home — 25 uniform seats,
 * meshed by their own row + cross links, with nothing above them.
 *
 *   node test/mesh-scale.js [N] [leaveFraction] [mode]
 *     mode: a number   → fraction of N to re-add DURING healing (concurrent)
 *           route      → validate the route() primitive after JOIN
 *           xlink      → establish + measure cross-links after JOIN
 *           s1row      → catastrophe: kill an ENTIRE Section-1 row (+ leaveFraction)
 *           s1all      → catastrophe: kill ALL 25 Section-1 seats (+ leaveFraction)
 *
 * ============================ THE HEALING LAWS ============================
 * (the canonical set — docs/mesh-refactor.md §1¾ carries the same list; keep
 *  them in sync. Every heal change must name which law it implements.)
 *
 * P.  ONE PRINCIPLE: every row keeps itself whole by promoting a leaf from its
 *     own subtree. Child-heals-parent is the same motion one level up. A leaf
 *     has no dependents, so promoting it orphans no one.
 *
 * Detection:
 * D1. Phone-home heartbeat: row-mates (i>0) phone their HEAD (P,r,0); a head
 *     phones ITS OWNER — except Section-1 heads, who phone NO ONE, because
 *     Section 1 IS the home. Head hears its row; row-mates hear the head.
 * D2. LEAVE: announced departure deletes the occ entry immediately.
 * D3. rowSweep: the head sweeps for silently-dead row cells (>50 ticks quiet).
 * D4. lastAck climbing: no PONG => my phone-target is dead (heal >40, drain >80).
 *
 * Healing:
 * H1. The HEAD heals a non-head hole in its row — only if that cell HAD
 *     children (C1) — EXCEPT in Section 1, where the head proactively fills
 *     ANY empty cell of its row, childless or not (H1-S1): the home tier is
 *     the one place where fullness IS resilience, so C1 yields there.
 * H2. Row-mates heal a dead HEAD: the lowest-column survivor promotes a new
 *     head. Deterministic => one healer, no race. Applies to Section-1 rows
 *     exactly like any other row — no special root motion exists.
 * H7. COLUMN BACKFILL: a Section-1 seat handed a newcomer first checks the
 *     row ABOVE it (wrapping row 0 to the bottom row); if that row is
 *     ENTIRELY empty, it seats the newcomer directly above itself (same
 *     column). One designated backfiller per cell => race-free; arrival
 *     traffic resurrects fully-dead Section-1 rows. (Sparse rows are H1-S1's
 *     job; empty rows are H7's.)
 * H6. RELAY FRESHNESS: every Section-1 seat, on its own randomized ~25-minute
 *     timer, sends a RANDOM DESCENDANT (GREETWALK down-walk) to (re)join the
 *     greeter pool. The front door stays stocked with live members.
 *     (H3/H4/H5 are RETIRED: they healed a special root that no longer exists.)
 *
 * Anti-cascade:
 * C1. Childless holes are NEVER filled (no dependents => no up-path through
 *     them) — except in Section 1 (see H1-S1). Heads are always refilled.
 * C2. Scooch is a last resort: a childless-frontier row's head only (H2).
 * C3. Exactly ONE healer per hole (the head / the lowest-column survivor /
 *     the designated H7 backfiller).
 *
 * Wiring (real-time, NEVER stale gossip):
 * W1. The healer builds the promoted seat's neighbour list from its OWN live
 *     occ at promotion time (including ITSELF when it neighbours the hole).
 * W2. EVERY PONG carries "who my owner is" => every seat learns its
 *     GRANDPARENT live.
 * W3. A head's PONG to a row-mate carries the CURRENT row roster.
 * W4. The promoted seat HELLOs its owned links and phones up; the orphaned
 *     subtree below re-attaches by phoning the refilled cell.
 * W5. Section 1 maintains the FULL 25-roster at every one of its seats:
 *     freshness-tagged entries sync across the section's row meshes and
 *     cross-links every phone beat (S1SYNC). This is what greeters serve to
 *     newcomers and what draining subtrees re-seat against.
 *
 * Fallback:
 * E1. THE DRAIN: a severed seat (owner chain dead >80 ticks, unhealed) does
 *     NOT stampede the relay. It fetches the Section-1 roster over the mesh
 *     (WHOHOME via its cross-links — sideways past the dead chain), then acts
 *     as the greeter for its own subtree: DRAIN fans down, every member
 *     re-seats as a newcomer against a random roster seat, the initiator
 *     re-seats last. Only if NO route to Section 1 exists (>220 ticks) does
 *     it fall back to relay re-entry. Section-1 seats never drain or requeue
 *     — you cannot re-enter the home; you ARE the home.
 * E2. Race loser yields: two ids on one coord => the HIGHER id yields (the
 *     dedup channel for every promotion/backfill race).
 *
 * Home & entry:
 * R1. NO STORED HOME anywhere. WHOHOME walks the live mesh to any Section-1
 *     seat and gets the W5 roster back.
 * R2. The relay is GREETERS-ONLY. It never arbitrates or remembers the home.
 * R3. Genesis: no seated greeter and no earlier waiter => first (lowest-id)
 *     knocker takes ('',0,0) — an ordinary seat, special only for being first.
 * R4. Seating is a ping: pick a RANDOM Section-1 seat off the roster, descend
 *     its tree dense-before-deep to a definitive vacancy (H7 first).
 *
 * THE OLD OPEN PROBLEM (partition merge / root minting) IS DISSOLVED: with no
 * root there is nothing to mint. Orphaned subtrees DRAIN into the surviving
 * Section 1 instead of founding islands; total-Section-1 death cascades
 * through the drain fallback to a single serialized genesis (R3) and the room
 * rebuilds itself.
 * ==========================================================================
 */
'use strict';
const M = require('../site/js/mesh.js');
const C = M.C, key = M.key, seatOf = M.seat;
const N = parseInt(process.argv[2] || '10000', 10);
const LEAVE = parseFloat(process.argv[3] || '0');
const MODE = process.argv[4] || '';
const READD = /^[\d.]+$/.test(MODE) ? parseFloat(MODE) : 0;

let _seed = 20260714;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const shuffle = (a) => { for (let k = a.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; const t = a[k]; a[k] = a[j]; a[j] = t; } return a; };
const pickN = (a, k) => { if (a.length <= k) return a.slice(); const o = [], u = new Set(); while (o.length < k) { const j = (rnd() * a.length) | 0; if (!u.has(j)) { u.add(j); o.push(a[j]); } } return o; };

const buckets = new Map(); let TICK = 0, inflight = 0, HEALING = true, MOVES = 0;   // continuous operation from t=0 — reality has no join phase where seats stop phoning
const send = (to, msg) => { const at = TICK + 1 + ((rnd() * 3) | 0); let b = buckets.get(at); if (!b) buckets.set(at, b = []); b.push({ to, msg }); inflight++; };

const upCoord = M.up, downCoord = M.down, rowMates = M.rowMates, crossLink = M.crossLink, ownedLinks = M.ownedLinks;
const parentPath = M.parentPath, lastDigit = M.lastDigit;

// The row a seat owns: row s.r of child section (s.path · s.i). Represented by
// its 0th seat (the head); the ≤C seats are columns 0..C-1 of that row.
const ownedRowHead = (s) => seatOf(M.childPath(s.path, s.i), s.r, 0);
const ownedRowSeat = (s, col) => seatOf(M.childPath(s.path, s.i), s.r, col);

// Relay: single front door for the whole STADIUM (one room = one URL).
// Greeters-only (R2): no home pointer, no arbitration. Genesis (R3) is
// serialized through the arrival stream: with no seated greeter, the
// lowest-id waiter founds; everyone else waits on it.
const relay = { g: [], set: new Set(), recent: [], founder: null, founderAt: -999,
  open(id) { if (!this.set.has(id)) { this.set.add(id); this.g.push(id); } },
  knock(id) {
    const out = []; for (let k = 0; k < this.g.length && out.length < 6; k++) { const c = this.g[k]; const s = seats.get(c); if (s && s.alive && s.state === 'seated' && c !== id) out.push(c); }   // EARLIEST seated = shallow = reliably home-connected
    if (out.length === 0) {                                                          // R3 genesis, SERIALIZED: designate ONE founder and make every later knocker wait on it — a second designation while the first is mid-seat forks the room
      const f = this.founder ? seats.get(this.founder) : null;
      const fOk = f && f.alive && (f.state === 'seated' || TICK - this.founderAt < 200);
      if (!fOk || this.founder === id) { this.founder = id; this.founderAt = TICK; this.recent.push(id); if (this.recent.length > 12) this.recent.shift(); return send(id, { t: 'GREETERS', list: [] }); }
      out.push(this.founder);
    }
    this.recent.push(id); if (this.recent.length > 12) this.recent.shift();
    send(id, { t: 'GREETERS', list: shuffle(out) });
  } };

const seats = new Map(); let nextId = 0;
let active = new Set(); const wake = (id) => active.add(id);
const GREET_PERIOD = 800;   // H6: base ticks between a Section-1 seat's greeter-refresh walks (randomized per seat, per fire) — the sim's stand-in for the ~25-minute real timer

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
    this.drainAt = 0; this.rosterAskAt = -999; this.xlinkAt = 0; this.greetAt = undefined; this.healTry = new Map();   // per-hole backoff: a promotion needs its full round trip (FINDLEAF descent + take + HELLO back) before the healer may re-fire — re-firing early mints duplicates
  }
  inS1() { return this.coord !== null && this.coord.path === ''; }
  noteS1(ck) { if (ck.charCodeAt(0) === 47) this.s1seen.set(ck, TICK); }   // '/' prefix = a Section-1 cell key
  s1Fresh(ck) { const at = this.s1seen.get(ck); return at !== undefined && TICK - at < 120 && this.occ.has(ck); }

  // ---- roster: the cells I admit into (uniform: my ONE child row) ---------
  rosterCells() {
    if (!this.coord) return [];
    const out = []; const h = ownedRowHead(this.coord);
    for (let c = 0; c < C; c++) out.push(seatOf(h.path, h.r, c));
    return out;
  }
  firstFreeInRoster() { for (const c of this.rosterCells()) if (!this.occ.has(key(c))) return c; return null; }

  // ---- join ----------------------------------------------------------------
  join() { this.state = 'joining'; this.retryAt = TICK; this.roster = null; send('relay', { t: 'KNOCK', id: this.id }); wake(this.id); }
  askSeat(target) { this.state = 'searching'; this.retryAt = TICK; send(target, { t: 'FIND', nc: this.id, ttl: 200 }); wake(this.id); }   // WAKE: a searcher whose FIND lands on a dead roster entry gets no reply — it must stay scheduled to retry, or it hangs forever
  pickRoster() { const live = this.roster.filter((e) => e[1] !== this.id); return live.length ? live[(rnd() * live.length) | 0][1] : null; }   // R4: a newcomer picks a RANDOM Section-1 seat — 25 co-equal entry trees, no bottleneck

  recv(m) {
    if (!this.alive) return;
    switch (m.t) {
      case 'GREETERS':
        if (m.list.length === 0) { if (this.state === 'joining') return this.take(seatOf('', 0, 0), null, []); return; }   // R3 genesis: the relay says I'm first → found the home
        if (this.state === 'joining') { send(m.list[0], { t: 'WHOHOME', from: this.id, ttl: 60 }); this.state = 'asking'; this.retryAt = TICK; }
        else if (this.state === 'seated' && this.coord && this.coord.path === '') send(m.list[0], { t: 'WHOHOME', from: this.id, ttl: 60 });   // SELF-AUDIT: I asked the front door for a walk to the home — the reply tells me whether the home even knows me
        return;
      case 'WHOHOME': {                                                              // R1: find Section 1 by walking the LIVE MESH — no cache, no stored pointer
        if (!this.coord) return send(m.from, { t: 'HOME', roster: [] });             // I'm nobody right now — tell the asker fast so it retries elsewhere
        if ((m.ttl | 0) <= 0) return;
        if (this.coord.path === '') return send(m.from, { t: 'HOME', roster: this.s1Roster() });   // I AM the home → serve the W5 roster
        const fwd = (id) => { if (id && id !== this.id && id !== m.via) { send(id, { t: 'WHOHOME', from: m.from, via: this.id, ttl: (m.ttl | 0) - 1 }); return true; } return false; };
        if (this.coord.i !== 0) { if (fwd(this.occ.get(key(seatOf(this.coord.path, this.coord.r, 0))))) return; }   // CLIMB: route to my row's head (it holds the uplink)
        else if (fwd(this.ownerId())) return;                                        // I AM the head → go UP to my owner
        const x = crossLink(this.coord); if (x && fwd(this.occ.get(key(x)))) return; // uplink dead/unknown → escape SIDEWAYS to a row that can climb
        for (const rm of rowMates(this.coord)) { const cx = crossLink(rm); if (cx && fwd(this.occ.get(key(cx)))) return; }
        return;
      }
      case 'HOME':
        if (this.state === 'asking') {
          if (!m.roster || !m.roster.length) { this.retryAt = TICK - 10; return; }   // walk dead-ended — recycle quickly
          this.roster = m.roster; this.seatTries = 0;
          const t = this.pickRoster(); if (t) this.askSeat(t); else this.retryAt = TICK - 10;
        } else if (this.state === 'seated' && m.roster && m.roster.length) {
          this.roster = m.roster;                                                    // E1: a severed seat fetched the roster → next tick it drains
          if (this.coord && this.coord.path === '') for (const [ck, id] of m.roster) if (ck === key(this.coord) && id !== this.id && id < this.id) return this.requeue();   // E2, the last resort: the home's own view says a LOWER claimant holds my cell — I am the zombie. A fully link-isolated duplicate (occ empty, phones no one, hears nothing) can be reached by NO mesh channel; the front door is the one door every seat can always walk through (R2's whole point).
        }
        return;
      case 'FIND': return this.serveFind(m);
      case 'FINDLEAF': return this.findLeaf(m.hole, m.nbrs, m.ttl);                  // a healer's probe descending its subtree to a leaf, which promotes into the hole
      case 'PLACE': if (this.state === 'searching') this.take(m.coord, m.owner, m.nbrs); return;
      case 'NOROOM':
        if (this.state === 'searching') { this.retryAt = TICK; if (this.roster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t) return this.askSeat(t); } this.seatTries = 0; this.join(); }
        return;
      case 'HELLO': {
        if (this.coord && this.state === 'seated' && m.ck === key(this.coord) && m.id !== this.id && m.id < this.id) return this.requeue();   // E2: a lower id also holds my coord — I yield
        const prev = this.occ.get(m.ck);
        const prevFresh = prev ? (m.ck.charCodeAt(0) === 47 ? this.s1Fresh(m.ck) : (this.live.has(m.ck) ? TICK - this.live.get(m.ck) <= 40 : true)) : false;
        if (prev && prev !== m.id && prevFresh) send(m.id > prev ? m.id : prev, { t: 'YIELD', ck: m.ck });    // E2: I see TWO LIVE ids on one cell — the higher yields. LIVE is the operative word: a stale occ entry (a dead ex-occupant, usually a LOWER id) must never assassinate the freshly promoted seat — that was an endless take→yield→requeue loop
        if (prev !== m.id) { this.occ.set(m.ck, m.id); if (this.coord) send(m.id, { t: 'HELLO', ck: key(this.coord), id: this.id }); }
        this.noteS1(m.ck);
        return;
      }
      case 'YIELD': if (this.coord && this.state === 'seated' && key(this.coord) === m.ck) return this.requeue(); return;
      case 'CLAIM': if (this.occ.get(m.ck) !== m.id) { this.occ.set(m.ck, m.id); this.live.set(m.ck, TICK); } this.noteS1(m.ck); return;
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
        if ((m.ttl | 0) > 0) { const kids = []; for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) kids.push(id); } if (kids.length) return send(kids[(rnd() * kids.length) | 0], { t: 'GREETWALK', ttl: (m.ttl | 0) - 1 }); }
        return relay.open(this.id);
      }
      case 'S1SYNC': {                                                               // W5: freshness-tagged Section-1 roster entries — fresher wins, staler is ignored
        for (const [ck, id, age] of m.ent) {
          if (this.coord && ck === key(this.coord) && id !== this.id) { const seen = TICK - (age | 0) - 2; if (id < this.id && seen > (this.seatedAt || 0) + 4) return this.requeue(); continue; }   // E2 via the sync stream — TENURE-AWARE: only a claimant heard AFTER I sat outranks me; the dead ex-occupant's residue (fresh-looking for up to 120 ticks) must not assassinate the promoted seat
          if ((age | 0) === 0 && this.coord) { const cur = this.occ.get(ck); if (cur && cur !== id && cur < id && TICK - (this.s1seen.get(ck) || -999) < 60) send(id, { t: 'YIELD', ck }); }   // the sender ITSELF claims this cell (self-entry, age 0) but a LOWER live claimant holds it in my view → tell the sender to yield. Without this, a losing head is a ZOMBIE: heads phone no one, and once every holder converges to the winner, nothing ever targets the loser again.
          const seen = TICK - (age | 0) - 2;
          const cur = this.occ.get(ck), curSeen = this.s1seen.get(ck) || -999;
          if (seen > curSeen + 8 || (seen >= curSeen - 8 && cur !== undefined && id < cur)) { this.s1seen.set(ck, Math.max(curSeen, seen)); if (cur !== id) this.occ.set(ck, id); }   // fresher wins — but at COMPARABLE freshness the LOWER id wins deterministically, so a duplicate pair's two cohorts converge on one claimant instead of each keeping their own (the higher dupe then hears the lower claim and yields)
          else if (cur === undefined && seen > -999) { this.s1seen.set(ck, seen); this.occ.set(ck, id); }
        }
        return;
      }
      case 'DRAIN': {                                                                // E1: my subtree is re-homing — fan down first, then re-seat myself against the roster
        if (!this.coord || this.state !== 'seated' || this.coord.path === '' || this.drainAt) return;
        this.roster = m.roster;
        for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) send(id, { t: 'DRAIN', roster: m.roster }); }
        this.drainAt = TICK + 6 + ((rnd() * 12) | 0); wake(this.id);
        return;
      }
      case 'PHONE': return this.onPhone(m);
      case 'PONG':
        this.lastAck = TICK;
        if (m.oCk && m.owner && this.occ.get(m.oCk) !== m.owner) { this.occ.set(m.oCk, m.owner); this.noteS1(m.oCk); }   // W2: my grandparent, live
        if (m.row) for (const [k, id, ch] of m.row) { if (this.occ.get(k) !== id) this.occ.set(k, id); this.noteS1(k); if (ch) this.childOf.set(k, ch); }   // W3: my row roster
        return;
      case 'ROUTE': {
        if (!this.coord) return;
        if (key(this.coord) === key(m.target)) return send(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: this.id });
        if ((m.ttl | 0) <= 0) return send(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null });
        const nh = this.nextHopToward(m.target, m.via);
        if (nh) return send(nh, { t: 'ROUTE', target: m.target, asker: m.asker, tag: m.tag, ttl: (m.ttl | 0) - 1, via: this.id });
        return send(m.asker, { t: 'ROUTED', tag: m.tag, target: m.target, id: null });
      }
      case 'ROUTED':
        if (m.tag === 'xlink') { if (m.id && this.coord) { this.occ.set(key(m.target), m.id); this.noteS1(key(m.target)); send(m.id, { t: 'HELLO', ck: key(this.coord), id: this.id }); } return; }
        if (this._onRouted) this._onRouted(m); return;
    }
  }
  routeTo(target, tag) { const nh = this.nextHopToward(target); if (key(this.coord) === key(target)) { if (this._onRouted) this._onRouted({ tag, target, id: this.id }); return; } if (nh) send(nh, { t: 'ROUTE', target, asker: this.id, tag, ttl: 60, via: this.id }); else if (this._onRouted) this._onRouted({ tag, target, id: null }); }
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
    if (!this.coord || (m.ttl | 0) <= 0) return send(m.nc, { t: 'NOROOM' });
    if (this.coord.path === '') {                                                   // H7: if the row ABOVE me (wrap row 0 → bottom) is ENTIRELY empty, the newcomer resurrects it — directly above me, my column
      const ar = (this.coord.r - 1 + C) % C;
      let empty = true; for (let j = 0; j < C; j++) if (this.s1Fresh(key(seatOf('', ar, j)))) { empty = false; break; }
      if (empty) return this.admit(seatOf('', ar, this.coord.i), m.nc);
      if (this.coord.i === 0) for (let j = 1; j < C; j++) {                          // H1-S1 with ARRIVALS: I'm a Section-1 head — my own row's OCC-EMPTY holes seat newcomers BEFORE my subtree does (dense-before-deep at the very top; single admitter = no race). s1Fill's phone-authoritative purge empties occ of phantoms; the shared healTry backoff keeps this and the promotion path from double-filling one cell.
        const rc = seatOf('', this.coord.r, j); const rck = key(rc);
        if (!this.occ.has(rck) && TICK - (this.healTry.get(rck) || -999) > 45) { this.healTry.set(rck, TICK); return this.admit(rc, m.nc); }
      }
    }
    const free = this.firstFreeInRoster();
    if (free) return this.admit(free, m.nc);
    const cells = shuffle(this.rosterCells());                                      // roster full → hand down to a child that may have room
    for (const c of cells) { const occId = this.occ.get(key(c)); if (occId && occId !== this.id) return send(occId, { t: 'FIND', nc: m.nc, ttl: (m.ttl | 0) - 1 }); }
    return send(m.nc, { t: 'NOROOM' });
  }
  admit(coord, nc) {
    this.occ.set(key(coord), nc); this.noteS1(key(coord));
    const nbrs = []; for (const nb of ownedLinks(coord)) { const id = this.occ.get(key(nb)); if (id && id !== nc) nbrs.push([key(nb), id]); }
    if (ownedLinks(coord).some((nb) => key(nb) === key(this.coord))) nbrs.push([key(this.coord), this.id]);   // W1: I may neighbour the cell I'm admitting into (H7 backfill) — include myself
    send(nc, { t: 'PLACE', coord, owner: this.id, nbrs });
  }

  // ---- healing: ONE motion — every row keeps ITSELF whole (P) ---------------
  heal(hole) {
    if (!this.coord || this.state !== 'seated' || TICK - this.healAt < 12) return;   // throttle: one promotion attempt in flight
    if (TICK - (this.healTry.get(key(hole)) || -999) < 45) return;                  // per-hole backoff: wait out the promotion round trip before re-firing (C3 — one healer AND one attempt at a time)
    this.healAt = TICK; this.healTry.set(key(hole), TICK);
    const nbrs = []; for (const nb of ownedLinks(hole)) { const id = this.occ.get(key(nb)); if (id && id !== this.id) nbrs.push([key(nb), id]); }
    if (ownedLinks(hole).some((nb) => key(nb) === key(this.coord))) nbrs.push([key(this.coord), this.id]);   // W1: I neighbour the hole — include myself so the promoted seat can reach me (a healer that omits itself re-fires forever)
    const oc = ownerCoordOf(hole); if (oc) { const oid = this.occ.get(key(oc)); if (oid && !nbrs.some((n) => n[0] === key(oc))) nbrs.push([key(oc), oid]); }   // the promoted seat needs its owner id — REAL-TIME from my occ
    for (const c of shuffle(this.rosterCells())) { const id = this.occ.get(key(c)); if (id && id !== this.id) return send(id, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); }   // promote a leaf strictly from BELOW me (my own subtree)…
    if (hole.path === this.coord.path && hole.r === this.coord.r) for (const rm of shuffle(rowMates(this.coord))) {   // …P, precisely: the ROW's subtree is the union of ALL its members' subtrees — mine is empty, so promote through a live row-mate's (the findLeaf sideways-scooch guard stops musical chairs)
      if (key(rm) === key(hole) || !this.kidful.get(key(rm))) continue; const id = this.occ.get(key(rm)); if (id && id !== this.id) return send(id, { t: 'FINDLEAF', hole, nbrs, ttl: 40 }); }   // only through a row-mate that HAS children (the kids bit rides every phone) — a subtree-less mate is a dead end that would shadow the section-level fallback
    if (hole.path === '' && this.coord.path === '') {                                // …and at the TOP, P one level up again: SECTION 1 keeps itself whole from ITS subtree — the whole stadium. A lone empty head (no members, no children) asks any live home seat, via the W5 roster, to find it a leaf.
      const r = this.s1Roster().filter((e) => e[1] !== this.id && e[0] !== key(hole));
      if (r.length) return send(r[(rnd() * r.length) | 0][1], { t: 'FINDLEAF', hole, nbrs, ttl: 40 });
    }
    if (hole.i === 0 && this.coord.i > 0 && !this.hasChildren()) this.promoteInto(hole, nbrs);   // …C2: a CHILDLESS frontier row that lost its head — the lowest survivor scooches itself in
  }
  findLeaf(hole, nbrs, ttl) {
    if (!this.coord) return;
    if ((ttl | 0) > 0) for (const c of shuffle(this.rosterCells())) { const id = this.occ.get(key(c)); if (id && id !== this.id) return send(id, { t: 'FINDLEAF', hole, nbrs, ttl: (ttl | 0) - 1 }); }
    if (this.coord.path === hole.path && this.coord.r === hole.r && hole.i !== 0) return;   // a subtree-less ROW-MATE never scooches sideways into a non-head hole — that just moves the hole (musical chairs)
    this.promoteInto(hole, nbrs);                                                    // no occupied child → I AM a leaf → I fill the hole
  }
  promoteInto(hole, nbrs) {
    if (!this.coord || key(this.coord) === key(hole)) return;
    if (this.coord.path === '' && hole.path !== '') return;                          // a Section-1 seat never leaves the home for a deep hole
    if (this.coord.path === '' && hole.path === '' && !(hole.i === 0 && hole.r === this.coord.r)) return;   // …and never slides sideways within the home (that just moves the hole) — the only in-home scooch is H2: into MY OWN row's head slot
    MOVES++;
    const oldC = this.coord, seen = new Set();
    for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); send(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } }
    this.occ = new Map(); this.s1seen = new Map();
    this.take(hole, null, nbrs);
    this.lastAck = TICK; this.lastPhone = TICK - 100;
  }
  requeue() {                                                                       // last resort (E1 fallback / E2 loser): give up the seat, re-enter the front door
    const oldC = this.coord; MOVES++;
    if (oldC) { const seen = new Set(); for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); send(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } } }
    this.coord = null; this.occ = new Map(); this.s1seen = new Map(); this.drainAt = 0;
    this.join();
  }

  // ---- E1: the drain — my subtree re-homes over the mesh, not the relay -----
  drainOrReenter() {
    if (this.roster && this.roster.length) {                                        // roster in hand → drain: children first, me last
      if (!this.drainAt) {
        for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) send(id, { t: 'DRAIN', roster: this.roster }); }
        this.drainAt = TICK + 25 + ((rnd() * 10) | 0);
      }
      return;
    }
    if (TICK - this.rosterAskAt > 40) {                                             // fetch the roster over the mesh: sideways past my dead chain via cross-links
      this.rosterAskAt = TICK;
      const x = crossLink(this.coord); const xid = x && this.occ.get(key(x));
      if (xid && xid !== this.id) send(xid, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 });
      else { for (const rm of shuffle(rowMates(this.coord))) { const id = this.occ.get(key(rm)); if (id && id !== this.id) { send(id, { t: 'WHOHOME', from: this.id, via: this.id, ttl: 60 }); break; } } }
    }
    if (TICK - this.lastAck > 220) return this.requeue();                           // no route to Section 1 at all → abandon ship, relay front door
  }
  reseatViaRoster() {
    const oldC = this.coord; MOVES++;
    if (oldC) { const seen = new Set(); for (const nb of ownedLinks(oldC)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); send(id, { t: 'LEAVE', ck: key(oldC), id: this.id }); } } }
    this.coord = null; this.occ = new Map(); this.s1seen = new Map(); this.drainAt = 0; this.seatTries = 0;
    const t = this.roster && this.roster.length ? this.pickRoster() : null;
    if (t) this.askSeat(t); else this.join();
  }

  // ---- take a seat -----------------------------------------------------------
  take(coord, owner, nbrs) {
    this.coord = coord; this.state = 'seated'; this.occ.set(key(coord), this.id); this.noteS1(key(coord));
    if (nbrs) for (const [k, id] of nbrs) if (!this.occ.has(k)) { this.occ.set(k, id); this.noteS1(k); }
    this.drainAt = 0; this.seatTries = 0; this.noHome = 0; this.seatedAt = TICK;
    relay.open(this.id); this.lastAck = TICK; this.lastPhone = TICK;
    if (owner) send(owner, { t: 'CLAIM', ck: key(coord), id: this.id });
    this.announce(); wake(this.id);
  }
  announce() {
    const c = this.coord, seen = new Set();
    for (const nb of ownedLinks(c)) { const id = this.occ.get(key(nb)); if (id && id !== this.id && !seen.has(id)) { seen.add(id); send(id, { t: 'HELLO', ck: key(c), id: this.id }); } }
  }

  // ---- phone-home (D1) + Section-1 bookkeeping -------------------------------
  ownerCoord() { return this.coord ? ownerCoordOf(this.coord) : null; }
  phoneTargetCoord() {
    if (!this.coord) return null;
    if (this.coord.i !== 0) return seatOf(this.coord.path, this.coord.r, 0);        // row-mates phone their head
    return this.ownerCoord();                                                       // heads phone their owner — null in Section 1: the home phones no one
  }
  hasChildren() { for (const c of this.rosterCells()) { const id = this.occ.get(key(c)); if (id && id !== this.id) return true; } return false; }
  lowestSurvivor() { for (let j = 1; j < this.coord.i; j++) { const id = this.occ.get(key(seatOf(this.coord.path, this.coord.r, j))); if (id && id !== this.id) return false; } return true; }
  phoneHome() {
    const tc = this.phoneTargetCoord(); if (!tc) return;
    const tid = this.occ.get(key(tc));
    if (tid) send(tid, { t: 'PHONE', coord: this.coord, to: key(tc), id: this.id, kids: this.hasChildren(), child: this.occ.get(key(downCoord(this.coord))) || null });
  }
  onPhone(m) {
    if (!this.coord || (m.to && m.to !== key(this.coord))) return;                   // phones address a COORD — no phantom liveness
    const ck = key(m.coord); const prev = this.occ.get(ck);
    if (prev && prev !== m.id && m.id > prev && this.live.has(ck) && TICK - this.live.get(ck) <= 40) return send(m.id, { t: 'YIELD', ck });   // E2 with LIVENESS: I'm the authority for this cell (they phone me) — only a claimant I've actually heard recently outranks a new one; a dead lower id must not win
    this.occ.set(ck, m.id); this.live.set(ck, TICK); this.noteS1(ck); this.kidful.set(ck, !!m.kids); if (m.child) this.childOf.set(ck, m.child); else this.childOf.delete(ck);
    let owner = null, oCk = null, row = null;
    const myOc = this.ownerCoord(); if (myOc) { oCk = key(myOc); owner = this.occ.get(oCk) || null; }   // W2
    if (this.coord.i === 0 && m.coord.path === this.coord.path && m.coord.r === this.coord.r) {         // W3
      row = [[key(this.coord), this.id, this.occ.get(key(downCoord(this.coord))) || null]];
      for (let c = 1; c < C; c++) { const rc = seatOf(this.coord.path, this.coord.r, c); const id = this.occ.get(key(rc)); if (id && id !== m.id) row.push([key(rc), id, this.childOf.get(key(rc)) || null]); }
    }
    send(m.id, { t: 'PONG', owner, oCk, row });
    if (prev && prev !== m.id) send(prev, { t: 'YIELD', ck });
  }
  rowSweep() {                                                                       // D3: head backstop for silent death in my row
    if (this.coord.i !== 0) return;
    for (const [ck, at] of this.live) {
      if (TICK - at <= 50) continue;
      const slash = ck.indexOf('/'), dot = ck.indexOf('.', slash);
      const pth = ck.slice(0, slash), rr = +ck.slice(slash + 1, dot), ii = +ck.slice(dot + 1);
      if (pth === this.coord.path && rr === this.coord.r && ii > 0) { const kids = this.kidful.get(ck); this.live.delete(ck); this.occ.delete(ck); this.kidful.delete(ck); this.s1seen.delete(ck); if (kids || pth === '') this.heal(seatOf(pth, rr, ii)); }   // H1 (kids-gated) / H1-S1 (unconditional in the home)
    }
  }
  s1Fill() {                                                                         // H1-S1: a Section-1 head keeps its row FULL — fill ANY empty cell, childless or not.
    if (TICK - (this.seatedAt || 0) < 80) return;                                    // warm-up: give my row time to phone me before I judge any cell
    for (let j = 1; j < C; j++) {                                                    // the row authority is the PHONE (D1), never occ: a yielded/phantom claimant can sit in occ forever and W3/W5 will faithfully re-circulate the stale entry — a cell that is not phoning me is NOT THERE
      const c = seatOf('', this.coord.r, j); const ck = key(c);
      const lv = this.live.get(ck);
      if (lv !== undefined && TICK - lv <= 60) continue;                             // phoning → present
      if (this.occ.has(ck)) { this.occ.delete(ck); this.live.delete(ck); this.s1seen.delete(ck); this.kidful.delete(ck); }   // purge the phantom so W3/W5 stop spreading it
      return this.heal(c);
    }
  }
  s1Sync() {                                                                         // W5: freshness-tagged roster entries flow across the section every phone beat
    const ent = [[key(this.coord), this.id, 0]];
    for (const [ck, id] of this.occ) if (ck.charCodeAt(0) === 47 && id !== this.id) { const at = this.s1seen.get(ck); if (at !== undefined && TICK - at < 120) ent.push([ck, id, TICK - at]); }
    const tgts = new Set();
    const x = crossLink(this.coord); if (x) { const id = this.occ.get(key(x)); if (id && id !== this.id) tgts.add(id); }
    for (const rm of rowMates(this.coord)) { const id = this.occ.get(key(rm)); if (id && id !== this.id) tgts.add(id); }
    const ab = this.occ.get(key(seatOf('', (this.coord.r - 1 + C) % C, this.coord.i))); if (ab && ab !== this.id) tgts.add(ab);   // W5 rides the H7 COLUMN CYCLE too: I sync the seat directly above me…
    const be = this.occ.get(key(seatOf('', (this.coord.r + 1) % C, this.coord.i))); if (be && be !== this.id) tgts.add(be);   // …and directly below me. A resurrected row's head has no row-mates and no cross yet — its backfiller below is its ONLY standing channel, and this is it.
    for (const id of tgts) send(id, { t: 'S1SYNC', ent });
  }

  tick() {
    if (!this.alive) { active.delete(this.id); return; }
    if (this.state !== 'seated') {
      if ((this.state === 'joining' || this.state === 'asking') && TICK - this.retryAt > 20) this.join();
      else if (this.state === 'searching' && TICK - this.retryAt > 60) { if (this.roster && this.roster.length && ++this.seatTries <= 6) { const t = this.pickRoster(); if (t) this.askSeat(t); else this.join(); } else { this.seatTries = 0; this.join(); } }
      active.add(this.id); return;
    }
    if (this.coord.path === '') {                                                    // SECTION 1: always on — the home runs its bookkeeping in every phase
      if (this.greetAt === undefined) this.greetAt = TICK + ((rnd() * GREET_PERIOD) | 0);
      if (TICK >= this.greetAt) { this.greetAt = TICK + GREET_PERIOD + ((rnd() * GREET_PERIOD) | 0); this.recv({ t: 'GREETWALK', ttl: 1 + ((rnd() * 5) | 0) }); }   // H6
      if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.phoneHome(); this.s1Sync(); }   // D1 + W5
      if (this.coord.i === 0 && (TICK % 12) === 0) { this.rowSweep(); this.s1Fill(); }              // D3 + H1-S1
      if (this.coord.i > 0 && TICK - this.lastAck > 40 && TICK - this.healAt > 20 && this.lowestSurvivor()) this.heal(seatOf('', this.coord.r, 0));   // H2 — Section-1 rows heal their head like any other row
      if (this.coord.i > 0 && TICK >= this.xlinkAt) { this.xlinkAt = TICK + 150 + ((rnd() * 100) | 0); if (!this.occ.get(key(crossLink(this.coord)))) this.probeXlink(); }
      if (this.s1CheckAt === undefined) this.s1CheckAt = TICK + 150 + ((rnd() * 150) | 0);
      if (TICK >= this.s1CheckAt) { this.s1CheckAt = TICK + 250 + ((rnd() * 150) | 0); send('relay', { t: 'KNOCK', id: this.id }); }   // E2 self-audit heartbeat: periodically walk the front door and ask the home about my own cell
      active.add(this.id); return;                                                   // Section-1 seats never drain, never requeue: you ARE the home
    }
    if (TICK - this.lastPhone >= 8) { this.lastPhone = TICK; this.phoneHome(); }      // D1
    if (this.coord.i === 0 && (TICK % 12) === 0) this.rowSweep();                     // D3
    if (this.coord.i > 0 && TICK - this.lastAck > 40 && TICK - this.healAt > 20 && this.lowestSurvivor()) this.heal(seatOf(this.coord.path, this.coord.r, 0));   // H2
    if (this.coord.i > 0 && TICK >= this.xlinkAt) { this.xlinkAt = TICK + 150 + ((rnd() * 100) | 0); if (!this.occ.get(key(crossLink(this.coord)))) this.probeXlink(); }   // keep my sideways escape live (the drain depends on it)
    if (this.drainAt && TICK >= this.drainAt) return this.reseatViaRoster();          // E1: my turn in the drain
    if (TICK - this.lastAck > 80) this.drainOrReenter();                              // D4 → E1: severed — drain my subtree over the mesh (relay only as last resort)
    active.add(this.id);
  }
  leave() {
    this.alive = false; active.delete(this.id); if (!this.coord) return;
    const ck = key(this.coord); const seen = new Set();
    for (const nb of ownedLinks(this.coord)) { const id = this.occ.get(key(nb)); if (id && !seen.has(id)) { seen.add(id); send(id, { t: 'LEAVE', ck, id: this.id }); } }
    const o = this.ownerCoord(); const oid = o && this.occ.get(key(o)); if (oid && !seen.has(oid)) send(oid, { t: 'LEAVE', ck, id: this.id });
  }
}

function ownerCoordOf(c) {                                                           // owner of an arbitrary coord (the cell it phones/depends on)
  if (c.path === '') return null;                                                    // Section 1 is ownerless — it IS the home
  return upCoord(seatOf(c.path, c.r, 0));
}

// ---- run ----------------------------------------------------------------------
const t0 = Date.now();
const joinWindow = Math.max(1, Math.min((N * 0.25) | 0, 2000));
const spawnPlan = new Map(); for (let k = 0; k < N; k++) { const t = (rnd() * joinWindow) | 0; spawnPlan.set(t, (spawnPlan.get(t) || 0) + 1); }
const MAXP = N * 30 + 60000;

function step() {
  for (let s = spawnPlan.get(TICK) || 0; s > 0; s--) { const seat = new Seat('p' + String(nextId++).padStart(8, '0')); seats.set(seat.id, seat); seat.join(); }
  const due = buckets.get(TICK); if (due) { buckets.delete(TICK); inflight -= due.length; for (const e of due) { if (e.to === 'relay') relay.knock(e.msg.id); else { const s = seats.get(e.to); if (s) { s.recv(e.msg); wake(s.id); } } } }
  const cur = active; active = new Set();
  for (const id of cur) { const s = seats.get(id); if (s) s.tick(); }
}
const liveSeated = () => { let c = 0; for (const s of seats.values()) if (s.alive && s.state === 'seated') c++; return c; };
const allSeated = () => { for (const s of seats.values()) if (s.alive && s.state !== 'seated') return false; return true; };
const s1Count = () => { let c = 0; for (const s of seats.values()) if (s.alive && s.state === 'seated' && s.coord && s.coord.path === '') c++; return c; };

let joinStable = 0;
for (TICK = 0; ; TICK++) {
  step();
  if (TICK > joinWindow + 50 && seats.size === N && allSeated() && s1Count() === Math.min(25, N)) { if (++joinStable > 100) break; } else joinStable = 0;
  if (TICK > MAXP) break;
}
let failed = report('after JOIN', N);

if (MODE === 'route') {                                                              // validate the route() primitive between random seated pairs
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

if (MODE === 'xlink') {                                                              // establish cross-links via routing, then measure completeness
  for (let round = 0; round < 30; round++) { for (const s of seats.values()) if (s.alive && s.state === 'seated') { s.probeXlink(); active.add(s.id); } for (let g = 0; g < 16; g++, TICK++) step(); }
  const seated = [...seats.values()].filter((s) => s.alive && s.state === 'seated' && s.coord);
  const at = new Map(); for (const s of seated) at.set(key(s.coord), s.id);
  let known = 0, tot = 0;
  for (const s of seated) { const x = crossLink(s.coord); if (!x) continue; const real = at.get(key(x)); if (!real || real === s.id) continue; tot++; if (s.occ.get(key(x)) === real) known++; }
  console.log('  cross-links established: ' + known + '/' + tot + ' (' + (100 * known / (tot || 1) | 0) + '%)');
  process.exit(known === tot ? 0 : 1);
}

if (LEAVE > 0 || MODE === 's1row' || MODE === 's1all') {
  HEALING = true;
  for (const s of seats.values()) if (s.alive) { s.lastAck = TICK; s.lastPhone = TICK; s.healAt = TICK; active.add(s.id); }
  for (let w = 0; w < 48; w++, TICK++) { if ((TICK % 8) === 0) for (const s of seats.values()) if (s.alive && s.state === 'seated') active.add(s.id); step(); }   // warmup: phone-home populates liveness + child bits + cross-links, as continuous operation would
  const leavingSet = new Set(pickN([...seats.keys()], Math.floor(N * LEAVE)));      // true random — nothing is protected
  if (MODE === 's1row') { const rr = (rnd() * C) | 0; for (const s of seats.values()) if (s.alive && s.coord && s.coord.path === '' && s.coord.r === rr) leavingSet.add(s.id); console.log('  [catastrophe: killing ALL of Section-1 row ' + rr + ']'); }
  if (MODE === 's1all') { for (const s of seats.values()) if (s.alive && s.coord && s.coord.path === '') leavingSet.add(s.id); console.log('  [catastrophe: killing ALL 25 Section-1 seats]'); }
  const leaving = [...leavingSet];
  for (const id of leaving) seats.get(id).leave();
  const readdTotal = Math.floor(N * READD); let readdDone = 0;
  const expect = (N - leaving.length) + readdTotal, start = TICK;
  const readdPlan = new Map(); for (let k = 0; k < readdTotal; k++) { const t = start + 4 + ((rnd() * joinWindow) | 0); readdPlan.set(t, (readdPlan.get(t) || 0) + 1); }
  for (const s of seats.values()) if (s.alive) active.add(s.id);
  let seatedSince = TICK;
  for (; ; TICK++) {
    for (let s = readdPlan.get(TICK) || 0; s > 0; s--) { const seat = new Seat('q' + String(nextId++).padStart(8, '0')); seats.set(seat.id, seat); seat.join(); readdDone++; }
    if ((TICK % 8) === 0) for (const s of seats.values()) if (s.alive && s.state === 'seated') active.add(s.id);   // pulse so everyone phones home
    step();
    if ((TICK % 50) === 0) {                                                         // convergence = everyone seated AND the home is full, sustained
      if (readdDone === readdTotal && liveSeated() === expect && allSeated() && s1Count() === Math.min(25, expect)) { if (TICK - seatedSince > 400 && TICK - start > 300) break; } else seatedSince = TICK;
    }
    if (TICK - start > MAXP) break;
  }
  const label = 'after ' + Math.round(LEAVE * 100) + '% LEFT' + (MODE === 's1row' ? ' + Section-1 ROW WIPE' : '') + (MODE === 's1all' ? ' + ALL of Section 1 WIPED' : '') + (readdTotal ? ' + ' + Math.round(READD * 100) + '% REJOIN' : '');
  failed += report(label, expect);
}
process.exit(failed ? 1 : 0);

function report(label, expect) {
  const live = [...seats.values()].filter((s) => s.alive);
  let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('    FAIL — ' + n); } };
  const seated = live.filter((s) => s.state === 'seated' && s.coord);
  ok('all ' + expect + ' live seats seated (' + seated.length + ')', seated.length === expect);
  const coords = new Map(); let dupes = 0, maxDepth = 0; for (const s of seated) { const ck = key(s.coord); maxDepth = Math.max(maxDepth, s.coord.path.length); if (coords.has(ck) && coords.get(ck) !== s.id) dupes++; else coords.set(ck, s.id); }
  ok('unique coordinates (dupes=' + dupes + ')', dupes === 0);
  let orphan = 0;                                                                    // up-path: every seat's owner-cell chain reaches Section 1
  for (const s of seated) {
    let cur = s.coord, h = 0, live2 = true;
    while (cur.path !== '') {
      if (h++ > 80) { live2 = false; break; }
      const oc = upCoord(seatOf(cur.path, cur.r, 0));
      if (!oc || !coords.has(key(oc))) { live2 = false; break; }
      cur = oc;
    }
    if (!live2) orphan++;
  }
  ok('every seat has a live up-path to Section 1 (orphans=' + orphan + ')', orphan === 0);
  const s1 = seated.filter((s) => s.coord.path === '');
  ok('Section 1 is FULL — the home stays whole (' + s1.length + '/' + Math.min(25, expect) + ')', s1.length === Math.min(25, expect));   // H1-S1 + H7: fullness IS the invariant now — no root to count
  console.log('  ' + label + ': ' + pass + '/' + (pass + fail) + ' [seated=' + seated.length + ', depth<=' + maxDepth + ', ' + TICK + ' ticks, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, mem=' + (process.memoryUsage().heapUsed / 1e6 | 0) + 'MB]');
  return fail;
}
