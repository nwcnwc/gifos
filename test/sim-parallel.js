/*
 * sim-parallel.js — the PARALLEL mesh simulator. The actual simulation runs
 * across W worker shards (sim-shard.js + mesh-core.js); this main thread owns
 * only the fabric (relay greeter pool + DC routing) and the per-tick barrier.
 * Deterministic: seats are sharded by a fixed hash, each seat has its own
 * seeded rng, and every seat's inbox is delivered in a canonical (seq) order,
 * so the result never depends on thread timing.
 *
 *   node test/sim-parallel.js [N] [leaveFraction] --workers=W
 *
 * This is the crypto-OFF scale engine (crypto is proven faithful at <=5k in
 * mesh-scale.js). It parallelizes the recv/tick LOGIC — the real cost once
 * sealing is gone — while main does the cheap routing.
 */
'use strict';
const path = require('path');
const { Worker } = require('worker_threads');
const M = require('../site/js/mesh.js');
const key = M.key, seatOf = M.seat, C = M.C;

const N = parseInt(process.argv[2] || '10000', 10);
const LEAVE = parseFloat(process.argv[3] || '0');
const W = (() => { const a = process.argv.find((x) => x.startsWith('--workers=')); return a ? Math.max(1, parseInt(a.slice(10), 10) || 1) : 4; })();
const MAXP = N * 30 + 60000;

let _seed = 20260714;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const pickN = (a, k) => { if (a.length <= k) return a.slice(); const o = [], u = new Set(); while (o.length < k) { const j = (rnd() * a.length) | 0; if (!u.has(j)) { u.add(j); o.push(a[j]); } } return o; };
const idShard = (id) => { let h = 5381; for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0; return (h >>> 0) % W; };
const sectionShard = (path) => (path === '' ? 0 : (path.charCodeAt(0) - 47)) % W;
const seatShard = new Map();          // id -> the worker currently holding this seat (LOCALITY: follows its section)
const admitQueue = Array.from({ length: W }, () => []);   // states to hand to each worker next tick (arrived migrants)
const shardOf = (id) => seatShard.has(id) ? seatShard.get(id) : idShard(id);

// ---- worker pool ----
const workers = [];
function boot() {
  return Promise.all(Array.from({ length: W }, (_, me) => new Promise((res) => {
    const w = new Worker(path.join(__dirname, 'sim-shard.js'), { workerData: { W, me } });
    w.done = null;
    w.on('message', (m) => { if (m.t === 'ready') res(); else if (m.t === 'done' && w.done) { const f = w.done; w.done = null; f(m); } else if (m.t === 'snap' && w.snap) { const f = w.snap; w.snap = null; f(m); } });
    w.on('error', (e) => { console.error('worker error', e); process.exit(1); });
    workers[me] = w;
  })));
}

// ---- fabric state (main-owned) ----
let TICK = 0, MOVES = 0, EVICTIONS = 0;
const bus = new Map();          // tick -> [{to, msg, seq}]
const wakeAt = new Map();       // tick -> Set(id) : seats to tick at that tick
const openPairs = new Set();    // undirected DC pairs that have established
const status = new Map();       // id -> code: bit0 s1, bit1 seated
const seatedSet = new Set();    // ids currently seated
const s1Set = new Set();        // ids currently seated in Section 1
const greeterHold = new Map();  // id -> holdUntil tick (the relay pool)
const recent = [];              // recent knockers (genesis serialization)
let seq = 0;

const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
function route(from, to, msg) {                                                   // schedule a peer frame with a modeled, DETERMINISTIC transit delay
  const pk = pairKey(from, to); let d;
  if (openPairs.has(pk)) d = 1 + (seq & 1);                                        // established channel
  else { openPairs.add(pk); d = 4 + (seq % 5); }                                   // first contact: model offer/answer + DTLS establish
  const at = TICK + d, s = seq++;
  let b = bus.get(at); if (!b) bus.set(at, b = []); b.push({ to, msg, seq: s });
  let wa = wakeAt.get(at); if (!wa) wakeAt.set(at, wa = new Set()); wa.add(to);
}
function knock(id, hold) {                                                         // relay: record greeter, hand back a sample of live seated greeters
  greeterHold.set(id, hold);
  const out = [];
  for (let k = recent.length - 1; k >= 0 && out.length < 6; k--) { const c = recent[k]; if (c !== id && seatedSet.has(c) && (greeterHold.get(c) || 0) >= TICK) out.push(c); }
  recent.push(id); if (recent.length > 400) recent.splice(0, 200);   // bounded rolling greeter window — no O(N) scan
  if (greeterHold.size > 4000) { for (const [c, h] of greeterHold) if (h < TICK) greeterHold.delete(c); }   // occasional GC of expired holds
  route('relay', id, { t: 'GREETERS', list: shuf(out) });                          // delivered like any message next tick
}
const shuf = (a) => { for (let k = a.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; const t = a[k]; a[k] = a[j]; a[j] = t; } return a; };

function applyStatus(changes) {
  for (const [id, code] of changes) {
    status.set(id, code);
    const seated = (code & 2) !== 0, s1 = (code & 1) !== 0;
    if (seated) seatedSet.add(id); else seatedSet.delete(id);
    if (seated && s1) s1Set.add(id); else s1Set.delete(id);
  }
}

// ---- the parallel tick ----
const spawnPlan = new Map();
const joinWindow = Math.max(1, Math.min((N * 0.25) | 0, 2000));
for (let k = 0; k < N; k++) { const t = (rnd() * joinWindow) | 0; if (!spawnPlan.has(t)) spawnPlan.set(t, []); spawnPlan.get(t).push('p' + String(k).padStart(8, '0')); }

async function step(killList) {
  // assign this tick's work per shard
  const per = Array.from({ length: W }, () => ({ spawn: [], kill: [], inbox: [], active: [] }));
  for (const id of spawnPlan.get(TICK) || []) { const sh = idShard(id); seatShard.set(id, sh); per[sh].spawn.push([id, false]); }
  if (killList) for (const id of killList) per[shardOf(id)].kill.push(id);
  const due = bus.get(TICK); if (due) { bus.delete(TICK); due.sort((a, b) => a.seq - b.seq); for (const e of due) per[shardOf(e.to)].inbox.push({ to: e.to, msg: e.msg }); }
  const wa = wakeAt.get(TICK); if (wa) { wakeAt.delete(TICK); for (const id of wa) per[shardOf(id)].active.push(id); }
  // fan out + barrier
  const results = await Promise.all(workers.map((w, i) => new Promise((res) => { w.done = res; w.postMessage({ t: 'tick', T: TICK, spawn: per[i].spawn, kill: per[i].kill, inbox: per[i].inbox, active: per[i].active, admit: admitQueue[i].splice(0) }); })));
  // collect: route messages, run fabric ops, gather wakes + status
  MOVES = 0; EVICTIONS = 0;
  for (const r of results) {
    MOVES += r.moves; EVICTIONS += r.evictions;
    for (const e of r.msg) { if (e.to === 'relay') continue; route(e.from, e.to, e.msg); }
    for (const f of r.fab) if (f.op === 'knock') knock(f.id, f.hold);
    if (r.wake) for (const id of r.wake) { let s = wakeAt.get(TICK + 1); if (!s) wakeAt.set(TICK + 1, s = new Set()); s.add(id); }
    if (r.status) applyStatus(r.status);
    if (r.migrate) for (const mig of r.migrate) { seatShard.set(mig.id, mig.tgt); admitQueue[mig.tgt].push(mig.state); }
  }
}

async function main() {
  await boot();
  const t0 = Date.now();
  // ---- JOIN ----
  let stable = 0;
  for (TICK = 0; ; TICK++) {
    await step(null);
    if (TICK > joinWindow + 50 && seatedSet.size === N && s1Set.size === Math.min(25, N)) { if (++stable > 100) break; } else stable = 0;
    if (TICK > MAXP) break;
  }
  report('after JOIN', N, t0);
  for (const w of workers) w.terminate();
  process.exit(0);
}

function report(label, expect, t0) {
  const ok = (n, c) => { if (!c) console.log('    FAIL — ' + n); return c; };
  let pass = 0, tot = 0;
  const chk = (n, c) => { tot++; if (ok(n, c)) pass++; };
  chk('all ' + expect + ' seated (' + seatedSet.size + ')', seatedSet.size === expect);
  chk('Section 1 FULL (' + s1Set.size + '/' + Math.min(25, expect) + ')', s1Set.size === Math.min(25, expect));
  console.log('  ' + label + ': ' + pass + '/' + tot + ' [seated=' + seatedSet.size + ', workers=' + W + ', ' + TICK + ' ticks, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, mem=' + (process.memoryUsage().heapUsed / 1e6 | 0) + 'MB]');
}

main();
