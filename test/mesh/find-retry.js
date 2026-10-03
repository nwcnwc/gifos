// find-retry.js — a lost FIND or PLACE must cost a seeker one short retry, not
// the 60-tick (30 s) state-2 window, in a room with two or more greeters.
//
// Before FINDACK the seeker could not tell a FIND that never arrived from a
// slow admitter hand-off, so with more than one roster candidate it waited
// 60 ticks before re-asking (a sole candidate waited 12). Re-asking early is
// not safe on its own: the sim's join-patterns N=9 'serial 8' leaves a shape
// hole when a merely slow chain is abandoned and both chains vouch the seeker.
// Now (twins: site/js/mesh.js and test/sim/mesh_seat.inc):
//   - the greeter a seeker asked sends FINDACK on receipt (first hop only);
//   - no FINDACK within FIND_ACK_WAIT (12) => the FIND was lost, re-ask;
//   - after a FINDACK the old windows stand (a live chain is never raced);
//   - the admitter holding an unconfirmed vouch replays the PLACE once at
//     PLACE_REPLAY (12), and again on a still-seeking SITPONG;
//   - a door whose build does not acknowledge (mixed-build room: the greeter
//     list's `fa` omits it) keeps the old windows.
//
// Pure mesh.js on an in-memory fabric with the harness's delivery delays
// (first contact 4-8 ticks, then 1-2). Usage: node test/mesh/find-retry.js
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const net = globalThis.GifOS.net, mesh = globalThis.GifOS.mesh;
const ck = net.topo.ckey;

let fail = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) fail++;
};

let GSEED = 1;
const grnd = () => { GSEED = (Math.imul(GSEED, 1103515245) + 12345) & 0x7fffffff; return GSEED / 2147483648; };
const pairKey = (a, b) => (String(a) < String(b) ? a + '#' + b : b + '#' + a);
const SIGNED = new Set(['FINDLEAF', 'PLACE', 'CLAIM', 'HELLO', 'SITPONG', 'SITXFER', 'DRAIN']);

// opts.drop(m) => true drops the frame; opts.delay(m, d) => a new delay;
// opts.fa(list) => the `fa` field of a GREETERS reply (undefined = omit).
function makeFabric(opts) {
  const env = {
    TICK: 0, HEALING: true, COMPACTION: false,
    seats: new Map(), bus: new Map(), openPairs: new Set(), seq: 0,
    genesis: null, greeters: new Map(), log: [],
    bumpMoves() {}, bumpEvict() {}, wake() {},
    peek(id) { const s = env.seats.get(id); if (!s) return null; return { alive: s.alive, hasCoord: s.hasCoord, coord: s.coord, socketed: s.socketed(), gateway: s.gateway }; },
    send(from, to, m) {
      const pk = pairKey(from, to); let d;
      if (env.openPairs.has(pk)) d = 1 + (env.seq & 1);
      else { env.openPairs.add(pk); d = 4 + (env.seq % 5); }
      env.seq++;
      const f = Object.assign({}, m, { to, from });
      env.log.push({ at: env.TICK, t: f.t, from, to, nc: f.nc, tag: f.tag });
      if (opts.drop && opts.drop(f)) return;
      if (opts.delay) d = opts.delay(f, d);
      const at = env.TICK + d; let q = env.bus.get(at); if (!q) { q = []; env.bus.set(at, q); }
      q.push(f);
    },
    knock(id, key) {
      const R = env.greeters;
      for (const [sid, exp] of R) { const s = env.seats.get(sid); if (exp < env.TICK || !s || !s.alive) R.delete(sid); }
      if (R.size === 0) env.genesis = null;
      const list = []; for (const sid of R.keys()) if (sid !== id) list.push(sid);
      for (let k = list.length - 1; k > 0; k--) { const j = (grnd() * (k + 1)) | 0; const t = list[k]; list[k] = list[j]; list[j] = t; }
      const g = { t: 'GREETERS', list, to: id, from: null };
      if (opts.fa) { const fa = opts.fa(list); if (fa !== undefined) g.fa = fa; }
      const at = env.TICK + 1; let q = env.bus.get(at); if (!q) { q = []; env.bus.set(at, q); } q.push(g);
      if (R.size === 0) { env.genesis = mesh.keyHash(key); R.set(id, env.TICK + mesh.RELAY_TTL); }
      else if (mesh.keyHash(key) === env.genesis && R.size < mesh.RELAY_CAP) R.set(id, env.TICK + mesh.RELAY_TTL);
    },
  };
  return env;
}
function tick(env) {
  const q = env.bus.get(env.TICK);
  if (q) { for (const m of q) { const s = env.seats.get(m.to); if (!s || !s.alive) continue; if (SIGNED.has(m.t)) m.s4ok = true; s.recv(m); } env.bus.delete(env.TICK); }
  for (const s of env.seats.values()) if (s.alive) s.tick();
  env.TICK++;
}
function spawn(env, id) { const s = new mesh.Seat(id, env); s.alive = true; env.seats.set(id, s); s.join(); return s; }

// A settled room of n seats, then one seeker. Returns ticks from the seeker's
// spawn to its seat (or -1), plus the fabric for inspection.
function run(seed, n, opts) {
  GSEED = seed;
  const env = makeFabric(opts);
  for (let k = 0; k < n; k++) { spawn(env, 'k_' + seed + '_' + k); for (let t = 0; t < 40; t++) tick(env); }
  for (let t = 0; t < 400; t++) tick(env);
  const room = [...env.seats.values()];
  const seatedRoom = room.filter((s) => s.state === 3).length;
  const sid = 'k_' + seed + '_seeker';
  env.seeker = sid; env.t0 = env.TICK; env.log.length = 0;
  const s = spawn(env, sid);
  let at = -1;
  for (let t = 0; t < 400 && at < 0; t++) { tick(env); if (s.state === 3) at = env.TICK - env.t0; }
  for (let t = 0; t < 200; t++) tick(env);   // let any stray vouch play out
  const cells = new Map(); let dups = 0;
  for (const x of env.seats.values()) if (x.alive && x.state === 3) { const k = ck(x.coord); if (cells.has(k)) dups++; cells.set(k, x.id); }
  const greeters = new Set(env.log.filter((e) => e.t === 'FIND' && e.from === sid).map((e) => e.to));
  return { at, env, s, seatedRoom, dups, finds: env.log.filter((e) => e.t === 'FIND' && e.from === sid).length, greeters: greeters.size,
    acks: env.log.filter((e) => e.t === 'FINDACK' && e.to === sid).length, roster: s.roster.filter((e) => e.v !== sid).length };
}

const SEEDS = [11, 23, 37, 41, 59];
const N = 8;   // eight seats: all in Section 1, so every one is a greeter (roster > 1)
const res = { base: [], find: [], place: [], slow: [], mixed: [] };
for (const seed of SEEDS) {
  const base = run(seed, N, {});
  res.base.push(base.at);
  check(`seed ${seed}: the room settles (${base.seatedRoom}/${N}) with a roster of ${base.roster} candidates`, base.seatedRoom === N && base.roster >= 2, { roster: base.roster });
  check(`seed ${seed}: control, nothing lost — seated in ${base.at} ticks, 1 FIND, 1 FINDACK`, base.at > 0 && base.finds === 1 && base.acks === 1 && base.dups === 0, { at: base.at, finds: base.finds, acks: base.acks, dups: base.dups });

  // (1) the seeker's first FIND never reaches the greeter
  const lost = new Set();
  const lf = run(seed, N, { drop: (m) => m.t === 'FIND' && m.from === m.nc && String(m.from).endsWith('_seeker') && !lost.has(seed) && !!lost.add(seed) });
  res.find.push(lf.at);
  check(`seed ${seed}: lost FIND with ${lf.roster} candidates — seated in ${lf.at} ticks (control ${base.at}); the 60-tick window would be >= 61`,
    lf.at > 0 && lf.at <= base.at + 24 && lf.dups === 0, { at: lf.at, base: base.at, finds: lf.finds, dups: lf.dups });

  // (2) the admitter's first PLACE to the seeker is lost
  const placed = new Set();
  const lp = run(seed, N, { drop: (m) => m.t === 'PLACE' && !m.tag && String(m.to).endsWith('_seeker') && !placed.has(seed) && !!placed.add(seed) });
  res.place.push(lp.at);
  check(`seed ${seed}: lost PLACE — seated in ${lp.at} ticks (control ${base.at}) by the admitter's replay`,
    lp.at > 0 && lp.at <= base.at + 24 && lp.dups === 0, { at: lp.at, base: base.at, finds: lp.finds, dups: lp.dups });

  // (3) a SLOW chain is never raced: the greeter acknowledged, its hand-off
  // takes 30 ticks — the seeker must not re-ask (twin vouches, shape holes)
  const sl = run(seed, N, { delay: (m, d) => (m.t === 'FIND' && m.from !== m.nc && String(m.nc).endsWith('_seeker') ? 30 : d) });
  res.slow.push(sl.at);
  const handoff = sl.env.log.some((e) => e.t === 'FIND' && e.from !== e.nc && String(e.nc).endsWith('_seeker'));
  if (handoff) check(`seed ${seed}: slow hand-off after FINDACK — one FIND, no re-ask, seated in ${sl.at} ticks, no duplicate`, sl.at > 0 && sl.finds === 1 && sl.dups === 0, { at: sl.at, finds: sl.finds, dups: sl.dups });

  // (4) mixed-build room: no door advertises FINDACK — the old window stands
  // even though the greeter's ack is lost, so a lost FIND still costs 60
  const mixedLost = new Set();
  const mx = run(seed, N, { fa: () => [], drop: (m) => (m.t === 'FIND' && m.from === m.nc && String(m.from).endsWith('_seeker') && !mixedLost.has(seed) && !!mixedLost.add(seed)) });
  res.mixed.push(mx.at);
  check(`seed ${seed}: doors without FINDACK keep the old window — lost FIND re-asked after 60 (seated at ${mx.at})`, mx.at > 60 && mx.dups === 0, { at: mx.at, finds: mx.finds });
}
console.log('\nseat ticks per seed  control=' + JSON.stringify(res.base) + '  lostFIND=' + JSON.stringify(res.find) + '  lostPLACE=' + JSON.stringify(res.place) + '  slowHandoff=' + JSON.stringify(res.slow) + '  oldBuildDoors=' + JSON.stringify(res.mixed));
console.log(fail ? ('\n' + fail + ' FAIL') : '\nALL PASS');
process.exit(fail ? 1 : 0);
