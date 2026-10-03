// caption-bye-scope.js — A CAPTION LINE AND A FAREWELL MUST NOT COST THE ROOM.
//
// Two app messages rode the room-wide gossip flood (mesh.js gossip() with no
// scope): every caption line (run.html addTranscriptLine → sendAll({k:'tr'}))
// and every departure's farewell (sendMeshLeave → gossip({k:'bye'})). A flood
// costs O(N) deliveries per message, so with "Captions for everyone" each of N
// devices received the lines of all N, and each departure reached every seat.
// The status plane (docs/status-plane-migration.md, healing-laws § G) already
// bounds the heartbeat with `scope: 'section'`; this pins the same bound on
// these two, measured on mesh-harness's fabric at N = 25 (the room IS Section 1)
// and N = 625 (25 sections):
//
//   1. the scope run.html asks for — read by RUNNING run.html's own
//      fanOut/sendAll/addTranscriptLine/sendMeshLeave against a stub node, so
//      a later edit that drops the scope anywhere on the path turns this red;
//   2. one caption line costs a bounded, N-flat number of frames;
//   3. every device captioning at once: inbound per device is bounded and
//      N-flat, and every device still receives every ROW-MATE's lines (the
//      voices it hears first-hand);
//   4. a STAGER's line still reaches the whole room (the Stage is heard
//      everywhere);
//   5. one farewell costs a bounded, N-flat number of frames, reaches the
//      leaver's section, and still goes over every open channel and the mesh
//      LEAVE; a stager's farewell, and any farewell without the digest, floods.
'use strict';
const fs = require('fs'), path = require('path');
const _log = console.log; console.log = () => {};
const H = require('./mesh-harness.js');
console.log = _log;
const { net } = H;
const C = net.SCALE.C;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };
const tick = (env, n) => { for (let t = 0; t < n; t++) H.doTick(env); };

// ---- 1. run.html's own send path, against a stub node ----------------------
const RUN = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');
function fnSrc(name) { // the text of `function name(...) {...}` (brace-matched; these bodies hold no brace inside a string)
  const i = RUN.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const b = RUN.indexOf('{', RUN.indexOf(')', i));
  let d = 0;
  for (let j = b; j < RUN.length; j++) { const ch = RUN[j]; if (ch === '{') d++; else if (ch === '}' && --d === 0) return RUN.slice(i, j + 1); }
  return null;
}
const PATH = ['fanOut', 'sendAll', 'captionScope', 'byeScope', 'addTranscriptLine', 'sendMeshLeave'];
const SRC = PATH.map(fnSrc).filter(Boolean).join('\n');
check('run.html still has fanOut, sendAll, addTranscriptLine and sendMeshLeave', ['fanOut', 'sendAll', 'addTranscriptLine', 'sendMeshLeave'].every((n) => fnSrc(n)));
// What the app hands meshNode.gossip, for a speaker who is / is not on the
// Stage, with the digest on / off. Also counts the farewell's direct channels.
function appSends(world) {
  const sent = [], dc = []; let left = 0, u = 0;
  const peers = new Map([['pa', { id: 'pa', dc: { readyState: 'open' } }], ['pb', { id: 'pb', dc: { readyState: 'closed' } }]]);
  const ctx = {
    myId: 'me', myName: () => 'Me', uid: (p) => p + (++u), rosterNames: {}, peers,
    keepOwnTranscript: () => true, renderTranscript() {}, showCaption() {},
    stageIds: () => world.stage.slice(), digestMode: () => world.digest !== false,
    dcSend: (p, m) => dc.push([p.id, m.k]), gossipIds: () => [...peers.keys()], txStats: {},
    meshNode: { gossip: (payload, opts) => sent.push({ payload, opts }), leave: () => { left++; } },
  };
  const api = new Function('ctx', 'with (ctx) { let leftMesh = false, leaving = false;\n' + SRC + '\nreturn { addTranscriptLine, sendMeshLeave }; }')(ctx);
  if (world.act === 'tr') api.addTranscriptLine('a caption line of some length', 0, world.forId);
  else api.sendMeshLeave();
  return { sent, dc, left };
}
const trPlain = appSends({ act: 'tr', stage: [] });
const trStage = appSends({ act: 'tr', stage: ['me'] });
const trScribed = appSends({ act: 'tr', stage: ['st'], forId: 'st' }); // a scribe writing down a STAGER
const byePlain = appSends({ act: 'bye', stage: [] });
const byeStage = appSends({ act: 'bye', stage: ['me'] });
const byeNoDig = appSends({ act: 'bye', stage: [], digest: false });
const optsOf = (r, k) => { const s = r.sent.find((x) => x.payload && x.payload.msg && x.payload.msg.k === k); return s ? (s.opts || null) : undefined; };
const O = { tr: optsOf(trPlain, 'tr'), trStage: optsOf(trStage, 'tr'), trScribed: optsOf(trScribed, 'tr'), bye: optsOf(byePlain, 'bye'), byeStage: optsOf(byeStage, 'bye'), byeNoDig: optsOf(byeNoDig, 'bye') };
console.log('  app scopes: ' + JSON.stringify(O));
check('a caption line is gossiped exactly once', trPlain.sent.length === 1 && O.tr !== undefined, { n: trPlain.sent.length });
check("a caption line from a seat OFF the Stage is section-scoped ({ scope: 'section' })", !!(O.tr && O.tr.scope === 'section'), O.tr);
check('a caption line from a stager goes room-wide (the Stage is heard everywhere)', O.trStage === null);
check("a scribe's line for a stager goes room-wide too (the scope follows the SPEAKER)", O.trScribed === null);
check('a farewell is gossiped exactly once', byePlain.sent.length === 1 && O.bye !== undefined);
check("a farewell from a seat off the Stage is section-scoped ({ scope: 'section' })", !!(O.bye && O.bye.scope === 'section'), O.bye);
check("…and still goes over every OPEN channel (and only those), then the mesh LEAVE", byePlain.dc.length === 1 && byePlain.dc[0][0] === 'pa' && byePlain.dc[0][1] === 'bye' && byePlain.left === 1, byePlain.dc);
check("a stager's farewell floods (its tile is drawn room-wide)", byeStage.sent.length === 1 && O.byeStage === null);
check('without the digest every seat holds every status, so the farewell floods as before', byeNoDig.sent.length === 1 && O.byeNoDig === null);
const gopt = (o) => (o ? o : undefined); // the harness seat takes undefined for "room-wide"

// ---- the fabric ------------------------------------------------------------
function settledRoom(N) {
  H.seedRng(20261003);
  const env = H.makeFabric();
  env.DIGEST = true;
  env.GSP_GUARD = false;   // these legs measure what a send COSTS; the guard would hide a flood by dropping it
  env.S4_GOSSIP = false;   // counting, not authentication (status-plane.js leg 9 owns signed gossip)
  H.spawn(env, N);
  H.runJoin(env, N, 20000);
  tick(env, 600);
  return env;
}
const seatedOf = (env) => [...env.seats.values()].filter((s) => s.alive && s.state === 3 && s.hasCoord);
// Send `sends` ([seat, payload, opts]) in one tick, drain past the re-fan
// window, and count every gossip frame carrying `tag`: total, per receiver,
// and which authors each seat heard.
function measure(env, tag, sends) {
  const seated = seatedOf(env);
  const rx = new Map(seated.map((s) => [s.id, 0])), heard = new Map(seated.map((s) => [s.id, new Set()]));
  let total = 0;
  const base = env.send;
  env.send = (from, to, m) => { if (m && (m.t === 'GSP' || m.t === 'GSPS') && m.m && m.m.tag === tag) { total++; if (rx.has(to)) rx.set(to, rx.get(to) + 1); } base(from, to, m); };
  const prev = new Map(seated.map((s) => [s.id, s.onGossip]));
  for (const s of seated) s.onGossip = (src, m) => { if (m && m.tag === tag) heard.get(s.id).add(src); };
  for (const [s, payload, opts] of sends) s.gossip(Object.assign({ tag }, payload), opts);
  tick(env, 48); // > the 32-tick re-fan window
  env.send = base;
  for (const s of seated) s.onGossip = prev.get(s.id);
  const per = seated.map((s) => rx.get(s.id)).sort((a, b) => a - b);
  return { total, max: per[per.length - 1], heard, seated };
}
// Who a seat reaches under section scope: its section-mates over in-section links.
function sectionReach(env, s) {
  const byId = new Map([...env.seats.values()].map((x) => [x.id, x]));
  const seen = new Set([s.id]), q = [s];
  while (q.length) { const x = q.shift(); for (const p of x.sectionPeers()) { const y = byId.get(p); if (y && y.alive && y.state === 3 && !seen.has(p)) { seen.add(p); q.push(y); } } }
  seen.delete(s.id); return seen;
}

const NS = [25, 625];
const R = {};
for (const N of NS) {
  const t0 = Date.now();
  const env = settledRoom(N);
  const seated = seatedOf(env);
  const sections = new Set(seated.map((s) => s.coord.pc)).size;
  // Two speakers: a Section-1 seat (the rook: the densest section) and a seat
  // in the fullest deep section, when there is one. The cost is the worse one.
  const bySec = new Map(); for (const s of seated) bySec.set(s.coord.pc, (bySec.get(s.coord.pc) || 0) + 1);
  const deepPc = [...bySec.keys()].filter((pc) => pc !== 0).sort((a, b) => bySec.get(b) - bySec.get(a))[0];
  const speakers = [seated.find((s) => s.coord.pc === 0), deepPc !== undefined ? seated.find((s) => s.coord.pc === deepPc) : null].filter(Boolean);
  const speaker = speakers[speakers.length - 1];
  const line = { total: Math.max(...speakers.map((sp, k) => measure(env, 'L' + N + k, [[sp, { a: 1, msg: { k: 'tr' } }, gopt(O.tr)]]).total)) };
  const all = measure(env, 'A' + N, seated.map((s) => [s, { a: 1, msg: { k: 'tr' } }, gopt(O.tr)]));
  const stage = measure(env, 'S' + N, [[speaker, { a: 1, msg: { k: 'tr' } }, gopt(O.trStage)]]);
  const leaver = speakers[0];
  const bye = measure(env, 'B' + N, [[leaver, { a: 1, msg: { k: 'bye' } }, gopt(O.bye)]]);
  if (speakers.length > 1) bye.total = Math.max(bye.total, measure(env, 'B' + N + 'd', [[speakers[1], { a: 1, msg: { k: 'bye' } }, gopt(O.bye)]]).total);
  // ear: every seat must hold every row-mate's line from the all-devices round
  let missRow = 0, wantRow = 0;
  for (const s of seated) for (const y of seated) if (y !== s && y.coord.pc === s.coord.pc && y.coord.r === s.coord.r) { wantRow++; if (!all.heard.get(s.id).has(y.id)) missRow++; }
  const byeReach = sectionReach(env, leaver); let byeMiss = 0; for (const p of byeReach) if (!bye.heard.get(p) || !bye.heard.get(p).has(leaver.id)) byeMiss++;
  const stageHeard = seated.filter((s) => s !== speaker && stage.heard.get(s.id).has(speaker.id)).length;
  R[N] = { seated: seated.length, sections, line: line.total, allMax: all.max, missRow, wantRow, stageHeard, bye: bye.total, byeReach: byeReach.size, byeMiss };
  console.log(`  N=${N}: seated ${seated.length}, sections ${sections}; one caption line ${line.total} frames; every device captioning: max inbound ${all.max} frames/device; row-mates heard ${wantRow - missRow}/${wantRow}; stage line heard by ${stageHeard}/${seated.length - 1}; one farewell ${bye.total} frames, section reach ${byeReach.size - byeMiss}/${byeReach.size}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

// A section seat has at most 2C-1 in-section links (the Section-1 rook) and
// hands a message over each at most twice (the fan and one re-fan).
const PER_MSG = 2 * C * C * (2 * C - 1);          // frames one section-scoped message can cost in total
const PER_DEV = 2 * (C * C - 1) * (2 * C - 1);    // frames a device can take when all its section-mates speak once
console.log('\n=== 2) ONE CAPTION LINE — bounded and flat in N');
for (const N of NS) check(`N=${N}: one caption line costs ${R[N].line} frames <= ${PER_MSG} (C-derived)`, R[N].line > 0 && R[N].line <= PER_MSG, R[N]);
check(`one caption line is N-flat (${R[25].line} -> ${R[625].line} frames over 25x N)`, R[625].line <= R[25].line * 1.5 + 1);
console.log('\n=== 3) EVERY DEVICE CAPTIONING — inbound per device bounded, the row still heard');
for (const N of NS) check(`N=${N}: max inbound ${R[N].allMax} frames/device <= ${PER_DEV}`, R[N].allMax <= PER_DEV, R[N]);
check(`inbound per device is N-flat (${R[25].allMax} -> ${R[625].allMax} over 25x N)`, R[625].allMax <= R[25].allMax * 1.5 + 1);
for (const N of NS) check(`N=${N}: every device receives every row-mate's line (${R[N].wantRow - R[N].missRow}/${R[N].wantRow})`, R[N].missRow === 0 && R[N].wantRow > 0);
console.log('\n=== 4) THE STAGE IS HEARD EVERYWHERE — its lines too');
for (const N of NS) check(`N=${N}: a stager's line reaches every other seat (${R[N].stageHeard}/${R[N].seated - 1})`, R[N].stageHeard === R[N].seated - 1);
console.log('\n=== 5) ONE FAREWELL — bounded, flat, and still reaches the section');
for (const N of NS) check(`N=${N}: one farewell costs ${R[N].bye} frames <= ${PER_MSG}`, R[N].bye > 0 && R[N].bye <= PER_MSG, R[N]);
check(`one farewell is N-flat (${R[25].bye} -> ${R[625].bye} frames over 25x N)`, R[625].bye <= R[25].bye * 1.5 + 1);
for (const N of NS) check(`N=${N}: the farewell reaches every section-mate (${R[N].byeReach - R[N].byeMiss}/${R[N].byeReach})`, R[N].byeMiss === 0 && R[N].byeReach > 0);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
