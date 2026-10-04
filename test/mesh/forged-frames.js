// forged-frames.js — a hostile MEMBER forges mesh control frames (docs:
// healing-laws.md law S, docs/meet-security.md §AUTH). Every case here was an
// eviction or a poisoning on main before the frame-authority change: YIELD,
// CONFIRM, LEAVE and MOVED were honoured from anyone, PHONE and PONG installed
// whatever cell and id they named, a signed HELLO/CLAIM was first-hand
// occupancy for ANY cell, and no cell key from the wire was ever checked.
//
// Part A drives mesh.js on the harness fabric (test/mesh/mesh-harness.js: real
// Ed25519 S4 identities, signed on send, verified on delivery). The hostile
// seat H is a real seated member with a real key. A frame is injected the way
// each transport would hand it over:
//   link   — a direct DataChannel from H: the transport names H (`lk`), and
//            whatever H wrote in `from` / `id` is H's word only;
//   relay  — the relay or a sponsor envelope: nothing proves the sender.
// Part B runs the PRODUCTION ingest (mesh-wire.js + relay-local.js + real
// WebCrypto + sealing) and forges through recvCtl and through a real relay
// socket that names the victim's peer id.
//
// Pure Node. Usage: node test/mesh/forged-frames.js   (PART=A or PART=B for one half)
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const H = require('./mesh-harness.js');
const { topo, ck } = H;
const net = globalThis.GifOS.net;
const C = () => net.SCALE.C;

let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

// ---------------------------------------------------------------- Part A ----
function room(seed) {
  H.seedRng(seed || 31337);
  const env = H.makeFabric();
  H.spawn(env, 40); H.runJoin(env, 40, 20000);
  env.COMPACTION = false;                  // hold the topology still while we attack it
  for (let t = 0; t < 300; t++) H.doTick(env);
  const seats = [...env.seats.values()].filter((s) => s.alive && s.state === 3 && s.hasCoord);
  return { env, seats };
}
const at = (seats, k) => seats.find((s) => s.state === 3 && s.hasCoord && ck(s.coord) === k) || null;
const run = (env, n) => { for (let t = 0; t < n; t++) H.doTick(env); };
// Hand `frame` to seat `to` on the next tick. link = the peer the transport
// names (a DataChannel), or null (relay / sponsor: nobody is proven).
function inject(env, to, frame, link) {
  const m = Object.assign({}, frame, { to: to.id });
  if (m.from === undefined) m.from = link != null ? link : 'k_unknown';
  m._lk = link == null ? null : link;
  let q = env.bus.get(env.TICK); if (!q) env.bus.set(env.TICK, q = []);
  q.push(m);
}
function signed(by, frame) { const m = Object.assign({}, frame); H.signFill(by.identity, m); return m; }
// Who holds a link to cell k in their own view (the seats a forged LEAVE /
// MOVED about k would mislead).
const watchers = (seats, k, id) => seats.filter((s) => s.id !== id && s.hasCoord && topo.ownedLinks(s.coord).some((c) => ck(c) === k) && s.occGet(k) === id);
// Track every way a seat can lose its cell.
function guard(s) {
  const g = { requeue: 0, rollback: 0, ck: ck(s.coord), id: s.id };
  const rq = s.requeue.bind(s), rb = s.rollbackMove.bind(s);
  s.requeue = (...a) => { g.requeue++; return rq(...a); };
  s.rollbackMove = (...a) => { g.rollback++; return rb(...a); };
  g.kept = () => g.requeue === 0 && s.state === 3 && s.hasCoord && ck(s.coord) === g.ck;
  return g;
}
// A deep non-head victim, its head (its phone target), and a hostile seat that
// is no neighbour of either.
function deepCase(r) {
  const V = r.seats.find((s) => s.coord.pc !== 0 && s.coord.i !== 0 && at(r.seats, ck({ pc: s.coord.pc, r: s.coord.r, i: 0 })));
  if (!V) return null;
  const head = at(r.seats, ck({ pc: V.coord.pc, r: V.coord.r, i: 0 }));
  const nearV = new Set([V.id, head.id]); for (const c of topo.ownedLinks(V.coord)) { const x = r.seats.find((s) => ck(s.coord) === ck(c)); if (x) nearV.add(x.id); }
  for (const c of topo.ownedLinks(head.coord)) { const x = r.seats.find((s) => ck(s.coord) === ck(c)); if (x) nearV.add(x.id); }
  const Hs = r.seats.filter((s) => !nearV.has(s.id)).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  return { V, head, Hs, vk: ck(V.coord) };
}
// The Section-1 victim with the HIGHEST id, a hostile seat with the LOWEST id
// that is not its rook neighbour (so every lower-id rule favours the attacker).
function s1Case(r) {
  const s1 = r.seats.filter((s) => s.coord.pc === 0).sort((a, b) => (a.id < b.id ? 1 : -1));
  const V = s1[0];
  const rook = new Set(topo.ownedLinks(V.coord).map(ck));
  const Hs = r.seats.filter((s) => s.id !== V.id && !rook.has(ck(s.coord))).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  return { V, Hs, vk: ck(V.coord) };
}

function partA() {
  console.log('── Part A: the harness fabric ──');
  // A1 YIELD naming the victim's cell — over H's own link, over the relay, and
  // with H wearing the victim's head's id.
  for (const [label, how] of [['link from H, unsigned', 'link'], ['relay, signed by H', 'relay-signed'], ['link from H wearing the head\'s id', 'spoof']]) {
    const r = room(); const d = deepCase(r); const g = guard(d.V);
    let f = { t: 'YIELD', ck: d.vk };
    if (how === 'relay-signed') f = signed(d.Hs, Object.assign(f, { id: d.Hs.id }));
    if (how === 'spoof') f = Object.assign(f, { id: d.head.id, from: d.head.id });
    inject(r.env, d.V, f, how === 'relay-signed' ? null : d.Hs.id);
    run(r.env, 150);
    check('A1 YIELD (' + label + ') does not unseat the victim', g.kept(), g);
  }
  // A2 CONFIRM, unsolicited, with a lower id than the victim's.
  for (const [label, how] of [['id 0 over H\'s link', 'zero'], ['signed by a lower-id H, over the relay', 'signed']]) {
    const r = room(); const d = s1Case(r); const g = guard(d.V);
    const f = how === 'zero' ? { t: 'CONFIRM', ck: d.vk, id: '0' } : signed(d.Hs, { t: 'CONFIRM', ck: d.vk, id: d.Hs.id });
    inject(r.env, d.V, f, how === 'zero' ? d.Hs.id : null);
    run(r.env, 150);
    check('A2 CONFIRM (' + label + ', never challenged) does not unseat the victim', g.kept(), g);
  }
  // A3 LEAVE in the victim's name, to every seat that links to its cell.
  for (const [label, link] of [['link from H, from/id = victim', 'H'], ['relay, from/id = victim', null]]) {
    const r = room(); const d = deepCase(r); const g = guard(d.V);
    const w = watchers(r.seats, d.vk, d.V.id);
    for (const s of w) inject(r.env, s, { t: 'LEAVE', ck: d.vk, id: d.V.id, from: d.V.id }, link === 'H' ? d.Hs.id : null);
    run(r.env, 2);
    const kept = w.filter((s) => s.occGet(d.vk) === d.V.id).length;
    run(r.env, 150);
    check('A3 LEAVE (' + label + '): every linked seat keeps the victim (' + kept + '/' + w.length + '), victim seated', w.length > 0 && kept === w.length && g.kept(), { kept, of: w.length, g });
  }
  // A4 MOVED in the victim's name, redirecting it to a Section-1 cell.
  for (const [label, link] of [['link from H', 'H'], ['relay', null]]) {
    const r = room(); const d = deepCase(r); const g = guard(d.V);
    const w = watchers(r.seats, d.vk, d.V.id); const x = ck({ pc: 0, r: C() - 1, i: C() - 1 });
    for (const s of w) inject(r.env, s, { t: 'MOVED', ck: d.vk, mvd: x, id: d.V.id, from: d.V.id }, link === 'H' ? d.Hs.id : null);
    run(r.env, 2);
    const kept = w.filter((s) => s.occGet(d.vk) === d.V.id && s.occGet(x) !== d.V.id).length;
    run(r.env, 150);
    check('A4 MOVED (' + label + '): no linked seat frees the victim or plants it elsewhere (' + kept + '/' + w.length + ')', w.length > 0 && kept === w.length && g.kept(), { kept, of: w.length, g });
  }
  // A5 PHONE: to the victim's head, a forged call that names the victim's cell
  // under a LOWER id (main installed it and YIELDed the victim), and a call in
  // the victim's own name claiming a row-mate's cell.
  for (const [label, link] of [['relay, id 0', null], ['H\'s link, id 0', 'H']]) {
    const r = room(); const d = deepCase(r); const g = guard(d.V);
    inject(r.env, d.head, { t: 'PHONE', coord: d.V.coord, tock: ck(d.head.coord), id: '0', from: '0' }, link === 'H' ? d.Hs.id : null);
    run(r.env, 2);
    const early = d.head.occGet(d.vk);                // the head's view right after: main installed '0' and YIELDed the victim
    run(r.env, 150);
    check('A5 PHONE (' + label + ', at the victim\'s cell) does not take the victim\'s cell at its head', early === d.V.id && g.kept() && d.head.occGet(d.vk) === d.V.id, Object.assign({ headSaw: early, headSees: d.head.occGet(d.vk) }, g));
  }
  {
    const r = room(); const d = deepCase(r);
    const mate = r.seats.find((s) => s.coord.pc === d.V.coord.pc && s.coord.r === d.V.coord.r && s.coord.i !== 0 && s.id !== d.V.id);
    const victim = mate || d.V; const imp = mate ? d.V : null;
    const g = guard(victim); const mk = ck(victim.coord);
    // H's link, wearing a lower id than the occupant's (the impersonated row-mate's, or 0)
    const wear = imp && imp.id < victim.id ? imp.id : '0';
    inject(r.env, d.head, { t: 'PHONE', coord: victim.coord, tock: ck(d.head.coord), id: wear, from: wear }, d.Hs.id);
    run(r.env, 2);
    const early = d.head.occGet(mk);
    run(r.env, 150);
    check('A5 PHONE (H\'s link, in another seat\'s name, claiming an occupied row cell) does not take that cell at the head', early === victim.id && g.kept() && d.head.occGet(mk) === victim.id, Object.assign({ headSaw: early, headSees: d.head.occGet(mk), wore: wear === '0' ? '0' : 'row-mate' }, g));
  }
  // A6 PONG: a forged answer to the victim's head-row view and a cousin flood.
  {
    const r = room(); const d = deepCase(r);
    const W = d.V; const rowK = ck({ pc: W.coord.pc, r: W.coord.r, i: W.coord.i === 1 ? 2 : 1 });
    const before = W.occGet(rowK);
    const bogusRow = [{ k: rowK, v: 'k_bogus' }, { k: ck({ pc: 0, r: 0, i: 0 }), v: 'k_bogus' }];
    const nbrs = []; for (let q = 0; q < 2000; q++) nbrs.push({ k: (q + 2) + '_0_0', v: 'k_x' + q });
    const cous0 = W.cousins.size;
    for (const link of [d.Hs.id, null]) inject(r.env, W, { t: 'PONG', coord: d.head.coord, id: d.head.id, from: d.head.id, owner: 'k_bogus', oCk: ck({ pc: 0, r: 4, i: 4 }), row: bogusRow, nbrs }, link);
    run(r.env, 2);
    check('A6 PONG (H\'s link and relay, in the head\'s name) does not rewrite the victim\'s row or flood its cousins', W.occGet(rowK) === before && W.occGet(ck({ pc: 0, r: 4, i: 4 })) !== 'k_bogus' && W.cousins.size <= Math.max(cous0, 4 * C()), { row: W.occGet(rowK), before, cousins: W.cousins.size });
  }
  // A7 HELLO and CLAIM signed by H for cells it does not hold.
  {
    const r = room(); const d = deepCase(r); const g = guard(d.V);
    const w = watchers(r.seats, d.vk, d.V.id);
    for (const s of w) inject(r.env, s, signed(d.Hs, { t: 'HELLO', ck: d.vk, id: d.Hs.id }), null);
    for (const s of w) inject(r.env, s, signed(d.Hs, { t: 'CLAIM', ck: d.vk, id: d.Hs.id }), null);
    run(r.env, 2);
    const kept = w.filter((s) => s.occGet(d.vk) === d.V.id).length;
    run(r.env, 150);
    check('A7 HELLO+CLAIM signed by H for the victim\'s cell (relay): linked seats keep the victim (' + kept + '/' + w.length + '), victim seated', w.length > 0 && kept === w.length && g.kept(), { kept, of: w.length, g });
  }
  {
    // the closed-door attack: H signs a HELLO and a CLAIM for EVERY Section-1
    // cell to every greeter; the room must still admit a newcomer.
    const r = room(); const greeters = r.seats.filter((s) => s.coord.pc === 0);
    const d = s1Case(r);
    for (const gS of greeters) for (let rr = 0; rr < C(); rr++) for (let ii = 0; ii < C(); ii++) {
      const k = ck({ pc: 0, r: rr, i: ii });
      inject(r.env, gS, signed(d.Hs, { t: 'HELLO', ck: k, id: d.Hs.id }), null);
      inject(r.env, gS, signed(d.Hs, { t: 'CLAIM', ck: k, id: d.Hs.id }), null);
    }
    run(r.env, 3);
    const planted = greeters.reduce((n, gS) => n + [...gS.occ.entries()].filter(([k, v]) => v === d.Hs.id && k !== ck(d.Hs.coord)).length, 0);
    const before = r.seats.filter((s) => s.state === 3).length;
    const evict0 = r.env.evict;
    const joiner = H.spawnOne(r.env);
    run(r.env, 400);
    check('A7 HELLO+CLAIM for every Section-1 cell to every greeter: H planted in ' + planted + ' greeter cells (<= 1 per greeter), nobody unseated, a newcomer still seats', planted <= greeters.length && r.env.evict === evict0 && joiner.state === 3 && H.counts(r.env).dups === 0, { planted, greeters: greeters.length, evicted: r.env.evict - evict0, joiner: joiner.state, seatedBefore: before, dups: H.counts(r.env).dups });
  }
  // A8 cell keys: malformed, out of range, and valid-but-unrelated, in bulk.
  {
    const r = room(); const d = s1Case(r); const W = d.V;
    const sz = () => ({ occ: W.occ.size, live: W.live.size, born: W.born.size, fhEver: W.fhEver.size, healTry: W.healTry.size, s1seen: W.s1seen.size, childOf: W.childOf.size, cousins: W.cousins.size, sitting: W.sitting.size });
    const s0 = sz();
    const bad = []; for (let q = 0; q < 10000; q++) bad.push(q % 4 === 0 ? 'x' + q : q % 4 === 1 ? '0_' + (q % 97 + C()) + '_0' : q % 4 === 2 ? (q + 7) + '_0_1' : '-1_0_' + q);
    const ent = bad.map((k) => ({ k, v: 'k_junk', age: 0, ch: 'k_junk' }));
    inject(r.env, W, { t: 'S1SYNC', ent, from: d.Hs.id }, d.Hs.id);
    inject(r.env, W, { t: 'PONG', coord: { pc: 0, r: 0, i: 0 }, id: 'k_junk', row: ent.slice(0, 5000), nbrs: ent.slice(5000), owner: 'k_junk', oCk: '9_9_9' }, d.Hs.id);
    for (let q = 0; q < 400; q++) inject(r.env, W, signed(d.Hs, { t: 'HELLO', ck: bad[q * 7], id: d.Hs.id }), null);
    for (let q = 0; q < 400; q++) inject(r.env, W, { t: 'ROUTED', tag: 1, target: { pc: q + 1, r: 0, i: 1 }, id: 'k_junk' + q }, d.Hs.id);
    for (let q = 0; q < 400; q++) inject(r.env, W, { t: 'LEAVE', ck: bad[q * 5], id: d.Hs.id, mvd: bad[q * 5 + 1] }, d.Hs.id);
    run(r.env, 3);
    const s1 = sz(); const grew = {}; let worst = 0;
    for (const k of Object.keys(s0)) { grew[k] = s1[k] - s0[k]; worst = Math.max(worst, grew[k]); }
    check('A8 10,000 junk cell keys (S1SYNC, PONG, HELLO, ROUTED, LEAVE): no map grows by more than 2C (' + worst + ')', worst <= 2 * C(), grew);
  }
  // A10 a signed HELLO claiming the RECEIVER'S OWN cell, from a higher id:
  // main wrote the claimant into the victim's own seat in its own view (and so
  // into the rosters it hands newcomers).
  for (const link of ['H', null]) {
    const r = room(); const s1 = r.seats.filter((s) => s.coord.pc === 0).sort((a, b) => (a.id < b.id ? -1 : 1));
    const V = s1[0]; const Hs = r.seats.slice().sort((a, b) => (a.id < b.id ? 1 : -1))[0]; const g = guard(V); const vk = ck(V.coord);
    inject(r.env, V, signed(Hs, { t: 'HELLO', ck: vk, id: Hs.id }), link === 'H' ? Hs.id : null);
    run(r.env, 2);
    const own = V.occGet(vk);
    const inRoster = V.s1Roster().filter((e) => e.k === vk).length;
    run(r.env, 150);
    check('A10 HELLO for the victim\'s own cell from a higher id (' + (link ? 'H\'s link' : 'relay') + ') is never written into the victim\'s own seat', own !== Hs.id && inRoster === 1 && g.kept(), { own: own === Hs.id ? 'H' : own === V.id ? 'V' : own, inRoster, g });
  }
  // A12 a neighbour, live at its OWN cell, claims the victim's cell to a
  // common arbiter in its own name with a lower id (PHONE over its own link).
  {
    const r = room(); const s1 = r.seats.filter((x) => x.coord.pc === 0).sort((a, b) => (a.id < b.id ? 1 : -1));
    const V = s1[0]; const vk = ck(V.coord);
    const mates = r.seats.filter((x) => x.coord.pc === 0 && x.coord.r === V.coord.r && x.id !== V.id).sort((a, b) => (a.id < b.id ? -1 : 1));
    const Hs = mates[0], W = mates[mates.length - 1];
    const g = guard(V);
    inject(r.env, W, { t: 'PHONE', coord: V.coord, tock: ck(W.coord), id: Hs.id }, Hs.id);
    run(r.env, 2);
    const early = W.occGet(vk);
    run(r.env, 150);
    check('A12 a row-mate live at its own cell claiming the victim\'s cell (its own lower id, its own link) takes nothing at the arbiter', Hs.id < V.id && early === V.id && g.kept(), { lower: Hs.id < V.id, arbiterSaw: early === V.id ? 'V' : early === Hs.id ? 'H' : early, g });
  }
  // A9 a replayed signed goodbye: H captures a seat's real signed LEAVE (with
  // where it went) and replays it with the destination changed.
  {
    const r = room(); const d = deepCase(r);
    const cap = [];
    const send0 = r.env.send;
    r.env.send = (from, to, m) => { if (m.t === 'LEAVE' && from === d.V.id) cap.push(JSON.parse(JSON.stringify(m))); return send0(from, to, m); };
    d.V.requeue();                                  // V says goodbye (signed in the fixed build)
    r.env.send = send0;
    run(r.env, 400);                                // V re-seats somewhere
    const x = ck({ pc: 0, r: C() - 1, i: 0 });
    const target = r.seats.find((s) => s.id !== d.V.id && s.state === 3 && s.coord.pc === 0 && s.occGet(x) !== d.V.id);
    const f = cap[0] ? Object.assign({}, cap[0], { mvd: x }) : { t: 'LEAVE', ck: d.vk, id: d.V.id, mvd: x };
    delete f.to; delete f.lk; delete f.s4ok;
    inject(r.env, target, f, null);
    run(r.env, 2);
    check('A9 a captured goodbye replayed with its destination re-pointed does not plant the seat (' + cap.length + ' captured)', target.occGet(x) !== d.V.id, { planted: target.occGet(x) === d.V.id, captured: cap.length });
  }
  {
    // ...and replayed UNCHANGED after the seat is gone and its row has packed
    // left over the hole: V sat at i=1 of a deep row with i=2 and i=3 behind
    // it; V leaves (a real signed goodbye), the row left-packs (i=2 -> 1,
    // i=3 -> 2), and then H replays V's goodbye to the seat now at i=2. The
    // cell it names is held by someone else, so it must free nothing and start
    // no heal (main left-packed the receiver into the occupied cell).
    H.seedRng(31337); const env = H.makeFabric(); H.spawn(env, 100); H.runJoin(env, 100, 20000); env.COMPACTION = false; run(env, 300);
    const seats = [...env.seats.values()].filter((x) => x.alive && x.state === 3 && x.hasCoord);
    const row = ['5_1', '5_2', '4_1', '2_2', '1_0', '1_1', '4_4'].find((pr) => [0, 1, 2, 3].every((q) => at(seats, pr + '_' + q)));
    if (!row) { check('A9 replay-after-pack: a deep row with cells 0..3 seated', false); }
    else {
      const V = at(seats, row + '_1'); const vk = ck(V.coord);
      const cap = []; const send0 = env.send;
      env.send = (from, to, m) => { if (m.t === 'LEAVE' && from === V.id) cap.push(JSON.parse(JSON.stringify(m))); return send0(from, to, m); };
      V.leave(); env.send = send0;
      run(env, 300);
      const live = [...env.seats.values()].filter((x) => x.alive && x.state === 3 && x.hasCoord);
      const holder = at(live, vk), recv = at(live, row + '_2');
      const moves0 = env.moves; const gh = holder ? guard(holder) : null, gr = recv ? guard(recv) : null;
      const f = Object.assign({}, cap[0] || { t: 'LEAVE', ck: vk, id: V.id }); delete f.to; delete f.lk; delete f.s4ok;
      if (recv) inject(env, recv, f, null);
      run(env, 150);
      check('A9 V\'s own goodbye replayed after its row packed over the hole (' + cap.length + ' captured) frees nothing and moves nobody', !!holder && !!recv && env.moves === moves0 && gh.kept() && gr.kept(), { row, holder: !!holder, recv: !!recv, moves: env.moves - moves0, holderKept: gh && gh.kept(), recvKept: gr && gr.kept() });
    }
  }
}

// ---------------------------------------------------------------- Part B ----
async function partB() {
  console.log('── Part B: the production ingest (mesh-wire + relay-local) ──');
  require('../../site/js/mesh-identity.js');
  require('../../site/js/mesh-wire.js');
  const wire = globalThis.GifOS.meshWire;
  const PORT = 8786, RELAY = 'ws://127.0.0.1:' + PORT;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(700);
  try {
    const key = await net.deriveMeetKey('forged-room', '', '');
    // The DC bus: a frame from `from` lands with via = from, direct = true,
    // exactly as run.html hands a DataChannel frame to recvCtl.
    const bus = new Map();
    const N = 8; const nodes = [];
    for (let i = 0; i < N; i++) {
      const node = wire.createMeshNode({ relayUrl: RELAY, sid: 'forged-sid', tok: 'T', key, tickMs: 30,
        sendDC: (to, m, from) => { const e = bus.get(to); if (e && !e.dead) { const c = JSON.parse(JSON.stringify(m)); const f = from || node.peer; setTimeout(() => { if (!e.dead) e.node.recvCtl(c, f, true); }, 4 + Math.random() * 10); } return true; } });
      await node.whenReady; bus.set(node.peer, { node, dead: false }); nodes.push(node); await sleep(40);
    }
    const t0 = Date.now();
    const conv = () => { const s = new Map(); let seated = 0, dups = 0; for (const n of nodes) { const st = n.stats(); if (st.state === 3 && st.coord) { seated++; const k = st.coord.pc + '_' + st.coord.r + '_' + st.coord.i; if (s.has(k)) dups++; else s.set(k, 1); } } return { seated, dups }; };
    while (Date.now() - t0 < 60000) { const c = conv(); if (c.seated === N && c.dups === 0) break; await sleep(300); }
    await sleep(1500);
    check('B setup: ' + N + ' nodes seated over the wire', conv().seated === N, conv());
    const by = nodes.slice().sort((a, b) => (a.peer < b.peer ? -1 : 1));
    const V = by[N - 1];                                      // the highest id
    const vk = ck(V.seat.coord);
    // H: the lowest id that is NOT the victim's arbiter (not a rook peer). An
    // arbiter's own YIELD is honoured by design (law S: it is its own link);
    // everything else here is a forgery.
    const rookV = new Set(topo.ownedLinks(V.seat.coord).filter((c) => c.pc === 0).map(ck));
    const Hn = by.find((n) => n !== V && !rookV.has(ck(n.seat.coord))) || by[0];
    const linked = nodes.filter((n) => n !== V && n.seat.hasCoord && topo.ownedLinks(n.seat.coord).some((c) => ck(c) === vk) && n.seat.occGet(vk) === V.peer);
    let requeues = 0; const rq = V.seat.requeue.bind(V.seat); V.seat.requeue = (...a) => { requeues++; return rq(...a); };
    // B1 forged frames over H's own DataChannel, in V's name.
    for (const w of linked) {
      w.recvCtl({ t: 'LEAVE', ck: vk, id: V.peer, from: V.peer }, Hn.peer, true);
      w.recvCtl({ t: 'MOVED', ck: vk, mvd: ck({ pc: 0, r: 4, i: 4 }), id: V.peer, from: V.peer }, Hn.peer, true);
    }
    V.recvCtl({ t: 'YIELD', ck: vk, from: Hn.peer }, Hn.peer, true);
    V.recvCtl({ t: 'CONFIRM', ck: vk, id: '0', from: Hn.peer }, Hn.peer, true);
    // B2 the same through a sponsor envelope that names V as its origin.
    for (const w of linked) w.recvCtl({ t: 'LEAVE', ck: vk, id: V.peer }, V.peer);
    V.recvCtl({ t: 'YIELD', ck: vk }, V.peer);
    V.recvCtl({ t: 'CONFIRM', ck: vk, id: '0' }, '0');
    // B3 the relay: H opens a socket under V's peer id and sends sealed frames.
    const sock = new WebSocket(RELAY + '/s/forged-sid?role=mesh&token=T&peer=' + encodeURIComponent(V.peer) + '&dev=forgerdev&gk=x');
    const opened = await new Promise((res) => { sock.addEventListener('open', () => res(true)); sock.addEventListener('error', () => res(false)); setTimeout(() => res(false), 3000); });
    let relayed = 0;
    if (opened) {
      for (const w of linked) {
        for (const m of [{ t: 'LEAVE', ck: vk, id: V.peer }, { t: 'PHONE', coord: V.seat.coord, tock: ck(w.seat.coord), id: '0' }]) {
          const b = await net.seal(key, { mw: 1, m }); sock.send(JSON.stringify({ t: 'peer', to: w.peer, msg: b })); relayed++;
        }
      }
      const b2 = await net.seal(key, { mw: 1, m: { t: 'YIELD', ck: vk } }); sock.send(JSON.stringify({ t: 'peer', to: V.peer, msg: b2 })); relayed++;
    }
    await sleep(400);
    const kept = linked.filter((w) => w.seat.occGet(vk) === V.peer).length;
    check('B forged LEAVE/MOVED/YIELD/CONFIRM/PHONE over H\'s link, a sponsor envelope and the relay (' + relayed + ' relayed, relay socket ' + (opened ? 'opened as V' : 'refused') + '): linked seats keep V (' + kept + '/' + linked.length + ')', linked.length > 0 && kept === linked.length, { kept, of: linked.length });
    await sleep(1500);
    check('B the victim was never unseated', requeues === 0 && V.seat.state === 3 && ck(V.seat.coord) === vk, { requeues, coord: V.seat.hasCoord ? ck(V.seat.coord) : null });
    try { sock.close(); } catch (e) {}
    for (const n of nodes) n.stop();
  } finally { relay.kill(); }
}

(async () => {
  const part = process.env.PART || 'AB';
  if (part.includes('A')) partA();
  if (part.includes('B')) await partB();
  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
