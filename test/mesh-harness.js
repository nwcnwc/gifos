// mesh-harness.js — a Node reference harness for site/js/mesh.js: it provides
// the SAME fabric the C++ sim models (an in-memory message bus + the modelled
// genesis-key relay registry) and replays the sim's scenarios (JOIN, 50%-kill,
// s1row, s1all), asserting the sim's convergence targets (dups=0, s1 = 25/25).
// Since we deleted the Node sim, mesh.js + this harness ARE the JS reference:
// the production seating/healing brain and its regression test, one artifact.
require('../site/js/gifos-net.js'); // net.topo + SCALE
require('../site/js/mesh.js');      // GifOS.mesh.Seat
const net = globalThis.GifOS.net, mesh = globalThis.GifOS.mesh;
const topo = net.topo, ck = topo.ckey;
const RELAY_TTL = mesh.RELAY_TTL, RELAY_CAP = mesh.RELAY_CAP, keyHash = mesh.keyHash;

// A shared, seeded RNG for fabric-level nondeterminism (relay shuffle + spawn
// plan) — separate from each seat's own PRNG, mirroring the sim's grnd/rng split.
let GSEED = 20260714 >>> 0;
const grnd = () => { GSEED = (Math.imul(GSEED, 1103515245) + 12345) & 0x7fffffff; return GSEED / 2147483648; };
const seedRng = (s) => { GSEED = s >>> 0; }; // reset per scenario ⇒ each is independent + reproducible
const pairKey = (a, b) => (String(a) < String(b) ? a + '#' + b : b + '#' + a);

function makeFabric() {
  const env = {
    TICK: 0, HEALING: true,
    seats: new Map(), bus: new Map(), openPairs: new Set(), seq: 0,
    relayGenesisKey: null, relayGreeters: new Map(),
    moves: 0, evict: 0,
    bumpMoves() { env.moves++; }, bumpEvict() { env.evict++; }, wake() {},
    send(from, to, m) {
      const pk = pairKey(from, to); let d;
      if (env.openPairs.has(pk)) d = 1 + (env.seq & 1);
      else { env.openPairs.add(pk); d = 4 + (env.seq % 5); }
      m.to = to; m.from = from; env.seq++;
      const at = env.TICK + d; let q = env.bus.get(at); if (!q) { q = []; env.bus.set(at, q); }
      q.push(m);
    },
    knock(id, presentedKey) {
      const R = env.relayGreeters;
      for (const [sid, exp] of R) { const s = env.seats.get(sid); if (exp < env.TICK || !s || !s.alive) R.delete(sid); }
      if (R.size === 0) env.relayGenesisKey = null;
      const out = []; for (const sid of R.keys()) if (sid !== id) out.push(sid);
      for (let k = out.length - 1; k > 0; k--) { const j = (grnd() * (k + 1)) | 0; const t = out[k]; out[k] = out[j]; out[j] = t; }
      const at = env.TICK + 1; let q = env.bus.get(at); if (!q) { q = []; env.bus.set(at, q); }
      q.push({ t: 'GREETERS', list: out, to: id, from: null });
      if (R.size === 0) { env.relayGenesisKey = keyHash(presentedKey); R.set(id, env.TICK + RELAY_TTL); }
      else if (keyHash(presentedKey) === env.relayGenesisKey && R.size < RELAY_CAP) { R.set(id, env.TICK + RELAY_TTL); }
    },
  };
  return env;
}

function counts(env) {
  const at = new Map(); let seated = 0, dups = 0; const s1 = new Set();
  for (const s of env.seats.values()) {
    if (!s.alive || s.state !== 3) continue; seated++;
    const k = ck(s.coord); if (at.has(k)) dups++; else at.set(k, s.id);
    if (s.coord.pc === 0) s1.add(k);
  }
  return { seated, dups, s1: s1.size };
}

function doTick(env) {
  const q = env.bus.get(env.TICK);
  if (q) { for (const m of q) { const s = env.seats.get(m.to); if (s && s.alive) s.recv(m); } env.bus.delete(env.TICK); }
  for (const s of env.seats.values()) if (s.alive) s.tick();
  env.TICK++;
}

// Advance until FULLY converged (seated==N && s1 full && dups==0) or cap. Unlike
// the sim's batch print (which stops at a good-window and reports transient
// dups), we run past the transient so the test asserts the settled dups=0 state.
function converge(env, N, cap) {
  const tgt = Math.min(25, N); const start = env.TICK;
  while (env.TICK < start + cap) {
    doTick(env);
    if (env.TICK % 64 === 0) { const c = counts(env); if (c.seated === N && c.s1 === tgt && c.dups === 0) return env.TICK; }
  }
  return env.TICK;
}

// Spawn N seats over a join window (random arrival ticks), like the sim.
function spawn(env, N) {
  const win = Math.max(1, Math.min(Math.floor(N * 0.25), 2000));
  const plan = []; for (let t = 0; t <= win; t++) plan.push([]);
  for (let k = 0; k < N; k++) plan[(grnd() * win) | 0].push(k);
  env._plan = plan; env._spawned = 0; env._N = N;
}
function spawnDue(env) {
  const plan = env._plan; if (env.TICK < plan.length) { for (const k of plan[env.TICK]) { const id = 'p' + k; const s = new mesh.Seat(id, env); env.seats.set(id, s); s.join(); env._spawned++; } }
}
// Drive ticks including spawns until everyone has arrived + FULLY converged.
function runJoin(env, N, cap) {
  const tgt = Math.min(25, N); const start = env.TICK;
  while (env.TICK < start + cap) {
    spawnDue(env); doTick(env);
    if (env.TICK % 64 === 0 && env._spawned === N) { const c = counts(env); if (c.seated === N && c.s1 === tgt && c.dups === 0) return env.TICK; }
  }
  return env.TICK;
}

function kill(env, N, frac, mode) {
  const ids = []; for (const s of env.seats.values()) if (s.alive) ids.push(s.id);
  const nk = Math.floor(N * frac); const ks = new Set();
  while (ks.size < nk && ks.size < ids.length) ks.add(ids[(grnd() * ids.length) | 0]);
  if (mode === 's1row') { const rr = (grnd() * net.SCALE.C) | 0; for (const s of env.seats.values()) if (s.alive && s.hasCoord && s.coord.pc === 0 && s.coord.r === rr) ks.add(s.id); }
  if (mode === 's1all') { for (const s of env.seats.values()) if (s.alive && s.hasCoord && s.coord.pc === 0) ks.add(s.id); }
  for (const id of ks) env.seats.get(id).leave();
  return ks.size;
}

// ---- scenarios ----
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

// Gossip coverage: one seat floods; every other live seated seat must hear it
// exactly once (dedup) within a few hundred ticks.
function gossipCheck(env, label) {
  let got = 0, dupDeliveries = 0; const seen = new Set();
  let src = null;
  for (const s of env.seats.values()) { if (!s.alive) continue; if (!src && s.state === 3) src = s; s.onGossip = () => { got++; if (seen.has(s.id)) dupDeliveries++; seen.add(s.id); }; }
  const expect = [...env.seats.values()].filter((s) => s.alive && s.state === 3).length - 1;
  src.gossip({ hello: 1 });
  for (let t = 0; t < 400; t++) doTick(env);
  check(`${label}: gossip reached ${got}/${expect}, redelivered ${dupDeliveries}`, got === expect && dupDeliveries === 0, { got, expect });
  for (const s of env.seats.values()) s.onGossip = null;
}

function scenario(N, killSpec) {
  seedRng(20260714); // per-scenario reset ⇒ independent + reproducible
  const env = makeFabric();
  spawn(env, N);
  const jt = runJoin(env, N, 20000);
  let c = counts(env);
  const tgt = Math.min(25, N);
  check(`JOIN N=${N}: seated ${c.seated}/${N}, s1 ${c.s1}/${tgt}, dups ${c.dups} @${jt}`, c.seated === N && c.s1 === tgt && c.dups === 0, c);
  if (!killSpec) gossipCheck(env, `GOSSIP N=${N}`);
  if (killSpec) {
    const nk = kill(env, N, killSpec.frac || 0, killSpec.mode || '');
    const nowN = N - nk;
    const kt = converge(env, nowN, 40000);
    c = counts(env);
    const tgt2 = Math.min(25, nowN);
    check(`${killSpec.label} (killed ${nk}): seated ${c.seated}/${nowN}, s1 ${c.s1}/${tgt2}, dups ${c.dups} @${kt}`, c.seated === nowN && c.s1 === tgt2 && c.dups === 0, c);
    gossipCheck(env, `GOSSIP after ${killSpec.label}`);
  }
}

// Robust regime is N>=500: at small N the S1 fill is arrival-rng-sensitive (H7
// "resurrects fully-dead rows" is arrival-driven — the sim itself reports N=25
// INCOMPLETE). We test where the sim converges: JOIN, then the kill scenarios.
const N = process.env.N ? parseInt(process.env.N, 10) : 0;
if (N) { scenario(N, process.env.KILL === '50' ? { frac: 0.5, label: '50%-kill' } : process.env.KILL === 's1row' ? { mode: 's1row', label: 's1row' } : process.env.KILL === 's1all' ? { mode: 's1all', label: 's1all' } : null); }
else {
  scenario(500);
  scenario(1000);
  scenario(500, { frac: 0.5, label: '50%-kill' });
  scenario(500, { mode: 's1row', label: 's1row' });
  scenario(500, { mode: 's1all', label: 's1all' });
}
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
