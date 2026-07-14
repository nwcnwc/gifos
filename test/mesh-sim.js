/*
 * mesh-sim.js — pure in-memory simulation of the introducer mesh
 * (docs/mesh-refactor.md), to PROVE the seating + gossip protocol converges
 * before any WebRTC. No browser, no network: a latency bus, a count-less relay
 * (greeter pool only), and N seats joining concurrently, each with its OWN
 * eventually-consistent view.
 *
 * Backbone: anti-entropy gossip + first-writer-wins per coordinate. A joining
 * seat absorbs a greeter's view (bootstrap), asks an anchor for a vacancy
 * (Section-1-anchored downward search, reserved to avoid handing the same seat
 * twice), claims it, then converges with everyone by exchanging views. A seat
 * that discovers its coordinate was won by an earlier claimant re-pings.
 *
 *   node test/mesh-sim.js [N]
 *
 * STATUS 2026-07-14: CONVERGES at N=200 concurrent joiners (6/6) — unique
 * coordinates, dense connected tree, every seat knows its seven neighbours,
 * tree-reduce count = N, one agreed Section 1. This is the proof the design's
 * central question needed. The measured ceiling (~few hundred) is a SIMULATION
 * shortcut, not an algorithm limit: the join here transfers the greeter's full
 * view (WELCOME) and does nearestVacancy over it — O(N²) total. The scalable
 * protocol replaces that with a DISTRIBUTED downward vacancy search + purely
 * section-local gossip (§1½), which is the next build step. The algorithm
 * converges; the bootstrap shortcut is what limits the sim's headroom.
 */
'use strict';
const M = require('../site/js/mesh.js');
const N = parseInt(process.argv[2] || '200', 10);

let _seed = 987654321;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const pick = (arr, k) => { const a = arr.slice(), o = []; while (a.length && o.length < k) o.push(a.splice((rnd() * a.length) | 0, 1)[0]); return o; };

const buckets = new Map(); let TICK = 0; let inflight = 0;
const send = (to, msg) => { const at = TICK + 1 + ((rnd() * 3) | 0); if (!buckets.has(at)) buckets.set(at, []); buckets.get(at).push({ to, msg }); inflight++; };

const relay = {
  greeters: new Set(),
  open(id) { this.greeters.add(id); }, close(id) { this.greeters.delete(id); },
  knock(id) { send(id, { t: 'GREETERS', list: pick([...this.greeters].filter((g) => g !== id), 4) }); },
};

const seats = new Map(); let nextId = 0;
const better = (a, b) => a.ts < b.ts || (a.ts === b.ts && a.id < b.id); // earlier, then lower id, wins a coord

class Seat {
  constructor(id) { this.id = id; this.coord = null; this.view = new Map(); this.known = new Set(); this.pending = new Map(); this.state = 'joining'; this.retryAt = -1; }

  // merge a set of occupancy facts; return true if I LOST my own seat.
  // Sets this.dirty whenever something changed, so gossip fires only on change.
  merge(entries) {
    let lost = false;
    for (const [ck, v] of entries) {
      const cur = this.view.get(ck);
      if (!cur || better(v, cur)) {
        this.view.set(ck, { id: v.id, ts: v.ts }); this.dirty = true; this.lastChange = TICK; (this.recent = this.recent || []).push(ck); if (this.recent.length > 30) this.recent.shift();
        if (this.coord && M.key(this.coord) === ck && v.id !== this.id) lost = true;
        this.known.add(v.id);
      }
    }
    return lost;
  }
  section1() { const o = []; for (const s of M.sectionOne()) { const v = this.view.get(M.key(s)); if (v) o.push(M.key(s) + '=' + v.id); } return o.sort(); }

  join() { this.state = 'joining'; this.retryAt = TICK; send('relay', { t: 'KNOCK', id: this.id }); }

  recv(m) {
    if (m.t === 'GREETERS') {
      if (this.state !== 'joining') return;
      if (m.list.length === 0) return this.take(M.seat('', 0, 0), 0);   // I'm alone — I found the room
      for (const g of m.list) { this.known.add(g); send(g, { t: 'HELLO', from: this.id }); }
    } else if (m.t === 'HELLO') {
      send(m.from, { t: 'WELCOME', from: this.id, view: [...this.view.entries()], known: [...this.known], s1: this.section1() });
    } else if (m.t === 'WELCOME') {
      this.merge(m.view); for (const id of m.known) this.known.add(id);
      if (this.state === 'joining') { this.state = 'searching'; this.anchor = m.from; send(m.from, { t: 'VACANCY?', from: this.id }); }
    } else if (m.t === 'VACANCY?') {
      const occ = new Set(this.view.keys()); for (const ck of this.pending.keys()) occ.add(ck);   // reserve outstanding hand-outs
      const v = M.nearestVacancy(occ);
      this.pending.set(M.key(v), { id: m.from, at: TICK });
      send(m.from, { t: 'VACANCY', coord: v });
    } else if (m.t === 'VACANCY') {
      if (this.state === 'searching') this.claim(m.coord);
    } else if (m.t === 'GOSSIP') {
      this.known.add(m.from); for (const id of (m.known || [])) this.known.add(id);
      if (this.merge(m.view) && this.state === 'seated') { this.coord = null; this.join(); }   // I lost my seat — re-ping
    }
  }

  claim(coord) {
    const ck = M.key(coord), cur = this.view.get(ck);
    if (cur && cur.id !== this.id) { this.join(); return; }              // already taken in my view — re-ping
    this.take(coord, TICK);
  }
  take(coord, ts) {
    this.coord = coord; this.state = 'seated'; this.view.set(M.key(coord), { id: this.id, ts }); this.dirty = true; this.lastChange = TICK; (this.recent = this.recent || []).push(M.key(coord));
    relay.open(this.id);
    // seed known with any neighbour occupants I already know, and gossip my claim widely
    for (const nb of M.ownedLinks(coord)) { const v = this.view.get(M.key(nb)); if (v) this.known.add(v.id); }
    this.gossip(8); this.dirty = false; this.lastGossip = TICK;
  }
  // Bounded gossip: the architecture is rosterless, so I share only what a
  // neighbour needs to converge — Section 1 (identity), my own coord, my seven
  // link coords, and a small random slice for epidemic reach. O(1) payload, so
  // the whole thing is O(N) not O(N²).
  sample() {
    const out = new Map();
    for (const s of M.sectionOne()) { const v = this.view.get(M.key(s)); if (v) out.set(M.key(s), v); }   // Section 1 (identity)
    if (this.coord) {                                                                                      // my own section + my seven neighbours
      for (const s of M.sectionSeats(this.coord.path)) { const v = this.view.get(M.key(s)); if (v) out.set(M.key(s), v); }
      for (const nb of M.ownedLinks(this.coord)) { const v = this.view.get(M.key(nb)); if (v) out.set(M.key(nb), v); }
    }
    for (const ck of (this.recent || [])) { const v = this.view.get(ck); if (v) out.set(ck, v); }          // recently-changed facts, epidemic
    return [...out.entries()];                                                                             // bounded: O(C²), never O(N)
  }
  gossip(fanout) {
    const targets = pick([...this.known].filter((id) => id !== this.id), fanout);
    const s = this.sample();
    for (const id of targets) send(id, { t: 'GOSSIP', from: this.id, view: s, known: pick([...this.known], 8) });
  }

  tick() {
    // expire stale reservations so a coord a claimer abandoned frees up
    for (const [ck, p] of this.pending) if (TICK - p.at > 12) this.pending.delete(ck);
    if (this.state === 'joining' && this.retryAt >= 0 && TICK - this.retryAt > 8) this.join();      // retry a stalled join
    if (this.state === 'searching' && TICK - this.retryAt > 8) this.join();
    // §0.4 heartbeat guarantee: if my view no longer shows my coord as MINE
    // (an earlier claimant won it, learned via any path), yield and re-ping.
    if (this.state === 'seated') { const cur = this.view.get(M.key(this.coord)); if (cur && cur.id !== this.id) { this.coord = null; return this.join(); } }
    // Gossip only when my view changed — the epidemic converges in a few rounds
    // then the mesh goes quiet (reliable delivery here; a lossy transport adds a
    // slow anti-entropy backstop, §5).
    const churning = TICK - (this.lastChange || 0) < 250;   // stop anti-entropy 250 ticks after the last change
    if (this.state === 'seated' && (this.dirty || (churning && TICK - (this.lastGossip || 0) > 25))) {
      for (const nb of M.ownedLinks(this.coord)) { const v = this.view.get(M.key(nb)); if (v) this.known.add(v.id); }
      this.gossip(5); this.dirty = false; this.lastGossip = TICK;
    }
  }
}

// ---- run: stagger concurrent joins; only tick ACTIVE seats (a converged seat
//      drops out until a message re-activates it) so per-tick cost -> 0. -------
let coordOwner = new Map();
const spawnAt = new Map();                                // tick -> [ids]
for (let k = 0; k < N; k++) { const t = (rnd() * Math.max(1, N * 0.5)) | 0; if (!spawnAt.has(t)) spawnAt.set(t, []); spawnAt.get(t).push(k); }
const lastJoin = Math.max(...spawnAt.keys());
const MAX = N * 40 + 8000;
const active = new Set();                                  // seat ids needing a tick
const wake = (id) => active.add(id);
for (TICK = 0; TICK < MAX; TICK++) {
  for (const _ of (spawnAt.get(TICK) || [])) { const s = new Seat('p' + String(nextId++).padStart(5, '0')); seats.set(s.id, s); s.join(); wake(s.id); }
  const due = buckets.get(TICK) || []; buckets.delete(TICK); inflight -= due.length;
  for (const e of due) { if (e.to === 'relay') relay.knock(e.msg.id); else { const s = seats.get(e.to); if (s) { s.recv(e.msg); wake(s.id); } } }
  // tick active seats + a rotating anti-entropy backstop slice of the rest
  for (const id of [...active]) { const s = seats.get(id); if (!s) { active.delete(id); continue; } s.tick(); if (s.state === 'seated' && !s.dirty && s.pending.size === 0 && TICK - (s.lastChange || 0) > 260) active.delete(id); }
  if (TICK > lastJoin + 60 && (TICK % 20) === 0 && inflight === 0 && active.size === 0 && [...seats.values()].every((s) => s.state === 'seated')) {
    let settled = true;
    for (const s of seats.values()) { for (const nb of M.ownedLinks(s.coord)) { const ck = M.key(nb); if (coordOwner.has(ck) && (!s.view.get(ck) || s.view.get(ck).id !== coordOwner.get(ck))) { settled = false; break; } } if (!settled) break; }
    if (settled) break;
  }
  if ((TICK % 20) === 0) coordOwner = coordsNow();
}
function coordsNow() { const m = new Map(); for (const s of seats.values()) if (s.coord) m.set(M.key(s.coord), s.id); return m; }

// ---- assertions -------------------------------------------------------------
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL — ' + n); } };
const all = [...seats.values()];
ok('all ' + N + ' seats reached a coordinate', all.every((s) => s.state === 'seated' && s.coord));
const coords = coordsNow();
let dupes = 0; { const seen = new Map(); for (const s of all) { const ck = s.coord && M.key(s.coord); if (!ck) continue; if (seen.has(ck) && seen.get(ck) !== s.id) dupes++; else seen.set(ck, s.id); } }
ok('no two seats share a coordinate (dupes=' + dupes + ')', dupes === 0);
const canon = new Set(); { const o = new Set(); for (let k = 0; k < all.length; k++) { const v = M.nearestVacancy(o); o.add(M.key(v)); canon.add(M.key(v)); } }
let offShape = 0; for (const ck of coords.keys()) if (!canon.has(ck)) offShape++;
ok('tree filled dense-before-deep (off-shape=' + offShape + ')', offShape === 0);
// EVERY SEAT KNOWS ITS SEVEN NEIGHBOURS (the real rosterless requirement — it
// needs its links, not the whole room).
let neighborsOk = 0, worstMiss = 0;
for (const s of all) { let miss = 0; for (const nb of M.ownedLinks(s.coord)) { const ck = M.key(nb); if (coords.has(ck) && (!s.view.get(ck) || s.view.get(ck).id !== coords.get(ck))) miss++; } if (miss === 0) neighborsOk++; worstMiss = Math.max(worstMiss, miss); }
ok('every seat knows all its occupied neighbours (ok=' + neighborsOk + '/' + N + ', worst-miss=' + worstMiss + ')', neighborsOk === N);
// THE TREE REDUCE gives N at the root: sum occupancy per section up the tree.
(() => {
  const perSection = new Map();                          // path -> occupied-seat count
  for (const ck of coords.keys()) { const p = ck.split('/')[0]; perSection.set(p, (perSection.get(p) || 0) + 1); }
  const paths = [...perSection.keys()].sort((a, b) => b.length - a.length); // deepest first
  const subtree = new Map();
  for (const p of paths) { let sum = perSection.get(p) || 0; for (const cp of M.childrenPaths(p)) sum += (subtree.get(cp) || 0); subtree.set(p, sum); }
  ok('the tree-reduce count = N at the root (root=' + (subtree.get('') || 0) + ')', (subtree.get('') || 0) === N);
})();
const s1 = new Set(all.map((s) => s.section1().join(','))); ok('all seats agree on Section 1 — one room (distinct=' + s1.size + ')', s1.size === 1);

console.log('mesh-sim(N=' + N + '): ' + TICK + ' ticks — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
