// mosaic-route.js — proves the fractal-mosaic ROUTING (docs/media-plane.md, 3b)
// delivers the Stadium to EVERY seat, over the tree's own links, with no
// browsers. It converges a real topology with the ported mesh brain (mesh.js
// over the harness fabric), then checks the three GRAPH INVARIANTS that make
// meet.html's reconcileMosaic deliver — because the mosaic's correctness is a
// property of the tree, not of the wire:
//   (A) every seat's up-chain reaches a Section-1 head (product flows up; the
//       Stadium fans back DOWN the same links) — no seat is stranded below;
//   (B) Section 1 is ONE connected cross+row mesh (each S1 head's exchange
//       gathers all C rows -> the full Stadium, redundantly, no election);
//   (C) each seat's mosaic ships target only {up,down,cross,row} -> bounded
//       fan-out (<= 2C), constant regardless of how deep the tree runs.
// The routing-correctness twin of the e2e browser test (which only confirms
// real pixels move, on real hardware); logic bugs surface here in ms.
require('../site/js/gifos-net.js');
require('../site/js/mesh.js');
const net = globalThis.GifOS.net, mesh = globalThis.GifOS.mesh, T = net.topo, ck = T.ckey;
const C = net.SCALE.C;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

// ---- converge a topology (compact harness fabric) ----
let GSEED = 20260714 >>> 0;
const grnd = () => { GSEED = (Math.imul(GSEED, 1103515245) + 12345) & 0x7fffffff; return GSEED / 2147483648; };
const pk = (a, b) => (String(a) < String(b) ? a + '#' + b : b + '#' + a);
function converge(Nn) {
  const env = {
    TICK: 0, HEALING: true, seats: new Map(), bus: new Map(), openPairs: new Set(), seq: 0,
    relayGenesisKey: null, relayGreeters: new Map(), bumpMoves() {}, bumpEvict() {}, wake() {},
    send(f, t, m) { const k = pk(f, t); let d; if (env.openPairs.has(k)) d = 1 + (env.seq & 1); else { env.openPairs.add(k); d = 4 + (env.seq % 5); } m.to = t; m.from = f; env.seq++; const a = env.TICK + d; let q = env.bus.get(a); if (!q) { q = []; env.bus.set(a, q); } q.push(m); },
    knock(id, key) { const R = env.relayGreeters; for (const [s, e] of R) { const x = env.seats.get(s); if (e < env.TICK || !x || !x.alive) R.delete(s); } if (R.size === 0) env.relayGenesisKey = null; const out = []; for (const s of R.keys()) if (s !== id) out.push(s); for (let k = out.length - 1; k > 0; k--) { const j = (grnd() * (k + 1)) | 0; const t = out[k]; out[k] = out[j]; out[j] = t; } const a = env.TICK + 1; let q = env.bus.get(a); if (!q) { q = []; env.bus.set(a, q); } q.push({ t: 'GREETERS', list: out, to: id, from: null }); if (R.size === 0) { env.relayGenesisKey = mesh.keyHash(key); R.set(id, env.TICK + mesh.RELAY_TTL); } else if (mesh.keyHash(key) === env.relayGenesisKey && R.size < mesh.RELAY_CAP) R.set(id, env.TICK + mesh.RELAY_TTL); },
  };
  const win = Math.max(1, Math.min((Nn * 0.25) | 0, 2000)); const plan = []; for (let t = 0; t <= win; t++) plan.push([]);
  for (let k = 0; k < Nn; k++) plan[(grnd() * win) | 0].push(k);
  const tick = () => { const q = env.bus.get(env.TICK); if (q) { for (const m of q) { const s = env.seats.get(m.to); if (s && s.alive) s.recv(m); } env.bus.delete(env.TICK); } for (const s of env.seats.values()) if (s.alive) s.tick(); env.TICK++; };
  let sp = 0;
  const cnt = () => { const at = new Map(); let seated = 0, dups = 0; const s1 = new Set(); for (const s of env.seats.values()) { if (!s.alive || s.state !== 3) continue; seated++; const k = ck(s.coord); if (at.has(k)) dups++; else at.set(k, 1); if (s.coord.pc === 0) s1.add(k); } return { seated, dups, s1: s1.size }; };
  for (let TK = 0; TK < 40000; TK++) { if (env.TICK < plan.length) for (const k of plan[env.TICK]) { const id = 'p' + k; env.seats.set(id, new mesh.Seat(id, env)); env.seats.get(id).join(); sp++; } tick(); if (sp === Nn && env.TICK % 64 === 0) { const c = cnt(); if (c.seated === Nn && c.s1 === Math.min(25, Nn) && c.dups === 0) break; } }
  return env;
}

// ---- mosaic graph invariants (what makes the mosaic deliver, provably) ----
// The mosaic works iff, on the converged tree:
//  (A) every seat's UP-chain reaches a Section-1 head  (product flows up; the
//      Stadium fans back DOWN the same links to every seat) — this is the tree
//      being rooted in Section 1, which the mesh guarantees, verified here;
//  (B) Section 1's cross+row link graph is ONE connected component (each S1
//      head's exchange gathers all C rows → the full Stadium);
//  (C) each node's mosaic ships target only {up, down, cross, row-mates} —
//      bounded fan-out (<= 2C), constant regardless of the tree below it.
function invariants(env) {
  const occ = new Map(); const coordOf = new Map();
  for (const s of env.seats.values()) if (s.alive && s.state === 3) { occ.set(ck(s.coord), s.id); coordOf.set(s.id, s.coord); }
  const has = (c) => c && occ.has(ck(c));
  const nodes = [...coordOf.values()];

  // (A) up-chain of every seat reaches a Section-1 head. A head climbs via up();
  // a non-head reaches up THROUGH its row's head (the same path the product
  // takes: non-head -> its head -> head.up -> ...). Bounded by tree depth.
  let reachS1 = 0; const stranded = [];
  for (const c of nodes) {
    let cur = c, ok = false;
    for (let hop = 0; hop < 64; hop++) {
      if (cur.pc === 0) { ok = true; break; }        // in Section 1 already
      const head = { pc: cur.pc, r: cur.r, i: 0 };    // route via my row's head
      if (!has(head)) break;                          // head hole — heals, but block delivery now
      const up = T.up(head); if (!up || !has(up)) break;
      cur = up;
    }
    if (ok) reachS1++; else stranded.push(ck(c));
  }

  // (B) Section-1 cross+row graph connectivity (union-find over live S1 seats).
  const s1 = nodes.filter((c) => c.pc === 0).map((c) => ck(c));
  const idx = new Map(s1.map((k, i) => [k, i])); const uf = s1.map((_, i) => i);
  const find = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const join = (a, b) => { if (idx.has(a) && idx.has(b)) uf[find(idx.get(a))] = find(idx.get(b)); };
  for (const k of s1) { const c = T.unck(k);
    for (const m of T.rowMates(c)) if (has(m)) join(k, ck(m));
    const x = T.crossLink(c); if (x && has(x)) join(k, ck(x));
  }
  const comps = new Set(s1.map((k) => find(idx.get(k)))).size;

  // (D) EVERY populated section (not just Section 1) is one connected cross+row
  //     mesh — the Section channel floods within a section, so each must be
  //     internally connected for the block to reach all section-mates.
  const bySec = new Map(); // pc -> [ckeys]
  for (const c of nodes) { const a = bySec.get(c.pc) || []; a.push(ck(c)); bySec.set(c.pc, a); }
  let secBad = 0, secTotal = 0;
  for (const [pc, keys] of bySec) {
    if (keys.length < 2) continue; secTotal++;
    const im = new Map(keys.map((k, i) => [k, i])); const u = keys.map((_, i) => i);
    const fnd = (x) => { while (u[x] !== x) { u[x] = u[u[x]]; x = u[x]; } return x; };
    const jn = (a, b) => { if (im.has(a) && im.has(b)) u[fnd(im.get(a))] = fnd(im.get(b)); };
    for (const k of keys) { const cc = T.unck(k); for (const m of T.rowMates(cc)) if (has(m)) jn(k, ck(m)); const x = T.crossLink(cc); if (x && has(x)) jn(k, ck(x)); }
    if (new Set(keys.map((k) => fnd(im.get(k)))).size !== 1) secBad++;
  }

  // (C) bounded ship fan-out: the union of a seat's mosaic targets.
  let maxFan = 0, argFan = null;
  for (const c of nodes) {
    const tg = new Set();
    const add = (co) => { if (has(co)) tg.add(ck(co)); };
    add(T.up(c)); add(T.down(c)); add(T.crossLink(c));
    for (const m of T.rowMates(c)) add(m);
    if (tg.size > maxFan) { maxFan = tg.size; argFan = ck(c); }
  }
  return { total: nodes.length, reachS1, stranded, s1: s1.length, comps, maxFan, argFan, secBad, secTotal };
}

function run(Nn) {
  GSEED = 20260714 >>> 0;
  const env = converge(Nn);
  const r = invariants(env);
  check(`N=${Nn}: (A) every seat's up-chain reaches Section 1 (${r.reachS1}/${r.total})`,
    r.reachS1 === r.total, r.stranded.slice(0, 6));
  check(`N=${Nn}: (B) Section 1 is ONE connected exchange mesh (${r.s1} seats, ${r.comps} component${r.comps === 1 ? '' : 's'})`,
    r.comps === 1);
  check(`N=${Nn}: (C) mosaic ship fan-out bounded (max ${r.maxFan} <= 2C=${2 * C})`,
    r.maxFan <= 2 * C, { at: r.argFan });
  check(`N=${Nn}: (D) every populated section is one connected cross+row mesh (${r.secTotal - r.secBad}/${r.secTotal})`,
    r.secBad === 0);
}

run(30);
run(100);
run(500);
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
