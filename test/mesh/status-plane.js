// status-plane.js — THE HEARTBEAT MUST NOT GROW WITH THE ROOM (scale-audit V1).
//
// Every participant re-sends its status every period. As a room-wide gossip
// flood that is O(N) frames per node per period — the one per-node cost that
// grew with room size (docs/status-plane-migration.md). This gauges the
// heartbeat over mesh-harness's fabric (the same brain as the gate) and pins
// the section-scoped heartbeat that replaces it:
//
//   1. BOUNDED + FLAT — section heartbeat frames/node/beat stay under a C-derived
//      bound at every N, and do not grow from N=100 to N=400;
//   2. COMPLETE + CONFINED — every seat hears every section-mate reachable over
//      in-section links, and nothing from outside its section;
//   3. G8 — at N <= C² (the room IS Section 1) the section heartbeat delivers
//      exactly what the room flood delivers;
//   4. NEGATIVE CONTROL — the room flood's frames/node/beat grow with N, so the
//      gauge demonstrably sees the thing it guards;
//   6. MIXED VERSIONS — seats running the pre-plane gossip code (they know only
//      'GSP' and re-flood whatever they take to every link) cannot leak a
//      scoped heartbeat out of its section: they never take one. The control
//      feeds them the scope-as-a-field encoding and must leak.
//   5. BACKLOG — ephemeral heartbeats never enter the re-fan backlog, and a chat
//      line gossiped room-wide still reaches every seat while they flow.
'use strict';

const _log = console.log; console.log = () => {};
const H = require('./mesh-harness.js');
console.log = _log;
const { topo, ck, net } = H;
const C = net.SCALE.C;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };
const run = (env, n) => { for (let t = 0; t < n; t++) H.doTick(env); };
const BEAT = 8;   // phone-beat ticks (4 s at the production 500 ms tick)
const BEATS = 8;

function settledRoom(N) {
  H.seedRng(20260928);
  const env = H.makeFabric();
  env.DIGEST = true;
  H.spawn(env, N);
  H.runJoin(env, N, 20000);
  run(env, 600);
  return env;
}

// Run BEATS heartbeats from every seated seat in `mode` ('room' | 'section'),
// counting GSP frames delivered to each seat and which sources each one heard.
function heartbeat(env, mode) {
  const seated = [...env.seats.values()].filter((s) => s.alive && s.state === 3 && s.hasCoord);
  const rx = new Map(), heard = new Map();
  for (const s of seated) { rx.set(s.id, 0); heard.set(s.id, new Set()); }
  const baseSend = env.send;
  env.send = (from, to, m) => { if (m && (m.t === 'GSP' || m.t === 'GSPS') && rx.has(to)) rx.set(to, rx.get(to) + 1); baseSend(from, to, m); };
  const prev = new Map();
  for (const s of seated) { prev.set(s.id, s.onGossip); s.onGossip = (src, m) => { if (m && m.hb) heard.get(s.id).add(src); }; }
  for (let b = 0; b < BEATS; b++) {
    for (const s of seated) s.gossip({ hb: 1, b }, mode === 'section' ? { scope: 'section', ephemeral: true } : undefined);
    run(env, BEAT);
  }
  run(env, BEAT * 2); // drain
  env.send = baseSend;
  for (const s of seated) s.onGossip = prev.get(s.id);
  const per = seated.map((s) => rx.get(s.id) / BEATS).sort((a, b) => a - b);
  return { seated, per, max: per[per.length - 1], p50: per[per.length >> 1], heard };
}

// Who a seat SHOULD hear under section scope: the section-mates reachable from
// it over in-section links (holes can split a partly-filled section).
function sectionReach(env, s) {
  const byId = new Map([...env.seats.values()].map((x) => [x.id, x]));
  const seen = new Set([s.id]), q = [s];
  while (q.length) {
    const x = q.shift();
    for (const p of x.sectionPeers()) { const y = byId.get(p); if (y && y.alive && y.state === 3 && !seen.has(p)) { seen.add(p); q.push(y); } }
  }
  seen.delete(s.id);
  return seen;
}

// Each mode gets its OWN room (same seed ⇒ same seating): a room-mode beat is
// remembered and keeps re-fanning, so measuring both on one room mixes them.
const NS = [20, 100, 400];
const rooms = {}, R = {}, S = {};
for (const N of NS) { R[N] = heartbeat(settledRoom(N), 'room'); rooms[N] = settledRoom(N); S[N] = heartbeat(rooms[N], 'section'); }
for (const N of NS) {
  const pcs = new Set(S[N].seated.map((s) => s.coord.pc));
  const hr = S[N].seated.map((s) => R[N].heard.get(s.id) ? R[N].heard.get(s.id).size : 0).sort((a, b) => a - b);
  const hs = S[N].seated.map((s) => S[N].heard.get(s.id).size).sort((a, b) => a - b);
  console.log(`  N=${N}  sections=${pcs.size}  room flood frames/node/beat max=${R[N].max.toFixed(1)} p50=${R[N].p50.toFixed(1)} heard p50=${hr[hr.length >> 1]}   section max=${S[N].max.toFixed(1)} p50=${S[N].p50.toFixed(1)} heard p50=${hs[hs.length >> 1]}   (seated ${S[N].seated.length})`);
}

console.log('\n=== 1) BOUNDED + FLAT');
// A seat has at most 2C-1 in-section links (the Section-1 rook) and hears each
// of its <= C²-1 section-mates' beat at most once per link.
const bound = (C * C - 1) * (2 * C - 1);
for (const N of NS) check(`N=${N}: section heartbeat frames/node/beat max ${S[N].max.toFixed(1)} <= ${bound} (C-derived)`, S[N].max <= bound);
check(`section heartbeat is flat in N (max ${S[100].max.toFixed(1)} -> ${S[400].max.toFixed(1)} over 4x N)`, S[400].max <= S[100].max * 1.5 + 1);

console.log('\n=== 2) COMPLETE + CONFINED');
for (const N of [100, 400]) {
  const env = rooms[N];
  let missing = 0, leaked = 0, want = 0;
  for (const s of S[N].seated) {
    const reach = sectionReach(env, s), got = S[N].heard.get(s.id);
    want += reach.size;
    for (const p of reach) if (!got.has(p)) missing++;
    for (const p of got) { const y = env.seats.get(p); if (!y || !y.hasCoord || y.coord.pc !== s.coord.pc) leaked++; }
  }
  check(`N=${N}: every seat hears every reachable section-mate (${want - missing}/${want})`, missing === 0, { missing });
  check(`N=${N}: no seat hears a beat from outside its section`, leaked === 0, { leaked });
}

console.log('\n=== 3) G8 — below C², the section heartbeat IS the room flood');
{
  const inS1 = S[20].seated.every((s) => s.coord.pc === 0);
  check('N=20: the whole room is seated in Section 1 (the G8 premise)', inS1);
  let diff = 0;
  for (const s of S[20].seated) {
    const rs = R[20].seated.find((x) => x.id === s.id);
    const a = [...(R[20].heard.get(s.id) || [])].sort().join(','), b = [...S[20].heard.get(s.id)].sort().join(',');
    if (!rs || a !== b) diff++;
  }
  check(`N=20: every seat hears the identical set under both scopes (${S[20].seated.length - diff}/${S[20].seated.length})`, diff === 0, { diff });
}

console.log('\n=== 4) NEGATIVE CONTROL — the room flood grows with N');
check(`room flood frames/node/beat grows with N (p50 ${R[100].p50.toFixed(1)} -> ${R[400].p50.toFixed(1)} over 4x N)`, R[400].p50 >= R[100].p50 * 2.5);

console.log('\n=== 5) BACKLOG — heartbeats stay out of it; a chat line still re-fans');
{
  const env = rooms[100];
  const seated = [...env.seats.values()].filter((s) => s.alive && s.state === 3);
  const got = new Set(); const prev = new Map();
  for (const s of seated) { prev.set(s.id, s.onGossip); s.onGossip = (src, m) => { if (m && m.chat) got.add(s.id); }; }
  seated[0].gossip({ chat: 'hello room' });   // room-scoped, remembered
  got.add(seated[0].id);
  for (let b = 0; b < 6; b++) { for (const s of seated) s.gossip({ hb: 1 }, { scope: 'section', ephemeral: true }); run(env, BEAT); }
  let ephInBacklog = 0; for (const s of seated) for (const e of (s.grecent || [])) if (e.m && e.m.hb) ephInBacklog++;
  for (const s of seated) s.onGossip = prev.get(s.id);
  check('no ephemeral heartbeat sits in any re-fan backlog', ephInBacklog === 0, { ephInBacklog });
  check(`the chat line reached every seat while section heartbeats flowed (${got.size}/${seated.length})`, got.size === seated.length);
}

console.log('\n=== 6) MIXED VERSIONS — an old client cannot re-flood a scoped heartbeat');
// Every rollout is a mixed room. The pre-plane _gspRecv (main, 2026-09) knows
// nothing of scope: it forwards what it takes to EVERY link as a plain 'GSP'.
// `leaky` is the control: the same old seat handed scoped frames as if scope
// were a field on 'GSP' (the first encoding) — measured then: ONE old seat at
// N=400 carried section heartbeats to 385 seats.
function mixedRoom(N, nOld, leaky) {
  const env = settledRoom(N);
  const seated = [...env.seats.values()].filter((s) => s.alive && s.state === 3 && s.hasCoord);
  const byId = new Map(seated.map((s) => [s.id, s]));
  const olds = seated.filter((s) => s.coord.pc !== 0).filter((s, i) => i % 7 === 0).slice(0, nOld);
  for (const o of olds) {
    const recv = o.recv.bind(o);
    o.recv = (m) => { if (m && m.t === 'GSPS') { if (!leaky) return; m = Object.assign({}, m, { t: 'GSP' }); } recv(m); }; // an old recv() drops a type it does not know
    o._gspRecv = function (m) {
      const g = this.gseen = this.gseen || new Map();
      if (g.has(m.gid)) return; g.set(m.gid, this.TICK);
      if (this.onGossip) { try { this.onGossip(m.src, m.m); } catch (e) {} }
      this._gspRemember(m.gid, m.src, m.m);
      for (const p of this.linkPeers()) if (p !== m.src) this.emit(p, { t: 'GSP', gid: m.gid, src: m.src, m: m.m });
    };
  }
  const oldIds = new Set(olds.map((o) => o.id));
  const rx = new Map(); let leaks = 0; const leakedTo = new Set();
  for (const s of seated) { rx.set(s.id, 0); s.onGossip = (src, m) => { if (!m || !m.hb || oldIds.has(src)) return; const y = byId.get(src); if (y && y.coord.pc !== s.coord.pc) { leaks++; leakedTo.add(s.id); } }; }
  const base = env.send;
  env.send = (f, t, m) => { if (m && (m.t === 'GSP' || m.t === 'GSPS') && rx.has(t)) rx.set(t, rx.get(t) + 1); base(f, t, m); };
  for (let b = 0; b < BEATS; b++) { for (const s of seated) if (!oldIds.has(s.id)) s.gossip({ hb: 1, b }, { scope: 'section', ephemeral: true }); run(env, BEAT); }
  run(env, BEAT * 2);
  const per = seated.map((s) => rx.get(s.id) / BEATS).sort((a, b) => a - b);
  return { olds: olds.length, leaks, leakedTo: leakedTo.size, seats: seated.length, max: per[per.length - 1], p50: per[per.length >> 1] };
}
{
  const m = mixedRoom(400, 5, false);
  check(`N=400 with ${m.olds} old clients: NOT ONE new heartbeat heard outside its section`, m.olds === 5 && m.leaks === 0, m);
  check(`…and frames/node/beat stay under the section bound (max ${m.max.toFixed(0)} <= ${bound})`, m.max <= bound, m);
  const c = mixedRoom(400, 1, true);
  check(`control: scope as a FIELD on GSP leaks through ONE old client (${c.leakedTo}/${c.seats} seats)`, c.leakedTo > c.seats / 2, c);
}

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
