// flood-guards.js — the mesh flood and signature guards that do not need a room.
//
// A peer-named cell key must not enter occ. A PONG confirms a move only when
// it is signed and it comes from the new phone or an owned link. requeue
// tells the owner, not only the owned links. A ring probe goes out once,
// then at most every 6 ticks. Gossip does not echo to the arrival link, and
// that link's "already holds it" mark stays 2 while the author stays at 1.
// An unsigned YIELD does not unseat. A down-child ledger installs a named
// cell and keeps a cell the list omitted.
//
// Pure Node. Usage: node test/mesh/flood-guards.js
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const mesh = globalThis.GifOS.mesh;
const topo = globalThis.GifOS.net.topo;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };

function pcAt(depth) {
  let pc = 0;
  for (let i = 0; i < depth; i++) pc = pc * 6 + 1;
  return pc;
}

function makeSeat(id, coord) {
  const env = { TICK: 100, HEALING: true, COMPACTION: true, GSP_GUARD: false, send() {}, knock() {}, wake() {} };
  const s = new mesh.Seat(id, env);
  s.state = 3;
  s.hasCoord = true;
  s.coord = coord;
  s.occ.set(topo.ckey(coord), id);
  return { env, s };
}

const ck = (c) => topo.ckey(c);

// --- cell keys ---------------------------------------------------------------
{
  const { s } = makeSeat('me', { pc: 0, r: 0, i: 0 });
  s.setOcc('not-a-cell', 'x');
  s.setOcc('0_9_0', 'x');
  s.setOcc('0_0_1', 'peer');
  s.noteS1('0_0_1');
  s.noteS1('1_0_0');
  check('a bad cell key does not enter occ', !s.occ.has('not-a-cell') && !s.occ.has('0_9_0') && s.occ.get('0_0_1') === 'peer');
  check('noteS1 records a Section-1 key only', s.s1seen.has('0_0_1') && !s.s1seen.has('1_0_0'));
}

// --- move evidence -------------------------------------------------------------
{
  const coord = { pc: pcAt(1), r: 0, i: 2 };
  const { s } = makeSeat('me', coord);
  s.moving = true;
  const phone = { pc: coord.pc, r: 0, i: 0 };
  const elsewhere = { pc: 0, r: 1, i: 1 };
  check('a signed PONG from the new phone confirms the move', s.moveEvidence({ t: 'PONG', coord: phone, s4ok: true }) === true);
  check('a signed PONG from another cell does not', s.moveEvidence({ t: 'PONG', coord: elsewhere, s4ok: true }) === false);
  check('an unsigned PONG does not confirm the move', s.moveEvidence({ t: 'PONG', coord: phone }) === false);
}

// --- owner LEAVE ----------------------------------------------------------------
{
  const coord = { pc: pcAt(1), r: 0, i: 1 };
  const { s } = makeSeat('me', coord);
  const owner = topo.up({ pc: coord.pc, r: 0, i: 0 });
  s.occ.set(ck(owner), 'owner');
  const sent = [];
  s.emit = (to, m) => { sent.push({ to, t: m && m.t }); };
  s.requeue();
  check('requeue sends LEAVE to the owner', sent.some((e) => e.to === 'owner' && e.t === 'LEAVE'));
}

// --- ring probe pace ------------------------------------------------------------
{
  const { env, s } = makeSeat('me', { pc: 0, r: 0, i: 0 });
  let probes = 0;
  s.routeTo = () => { probes++; };
  const hole = { pc: 0, r: 0, i: 2 };
  s.ringConfirmDead(hole);
  s.ringConfirmDead(hole);
  check('the ring probe fires once inside the 6-tick pace', probes === 1, { probes });
  env.TICK = 106;
  s.ringConfirmDead(hole);
  check('the ring probe fires again after 6 ticks', probes === 2, { probes });
}

// --- gossip echo -----------------------------------------------------------------
{
  const coord = { pc: pcAt(1), r: 0, i: 0 };
  const { s } = makeSeat('me', coord);
  const owner = topo.up(coord);
  s.occ.set(ck(owner), 'owner');
  s.occ.set(ck({ pc: coord.pc, r: 0, i: 1 }), 'mate');
  const sent = [];
  s.emit = (to, m) => { sent.push({ to, t: m && m.t }); };
  s._gspRecv({ t: 'GSP', gid: 'owner:1', src: 'owner', from: 'mate', m: { hi: 1 } });
  const e = s.grecent && s.grecent[0];
  const txOwner = e && e.tx && e.tx.get('owner');
  const txMate = e && e.tx && e.tx.get('mate');
  check('gossip does not echo to the arrival link', !sent.some((x) => x.to === 'mate' || x.to === 'owner'), { sent });
  check('the author stays at one copy and the arrival link stays at two', txOwner === 1 && txMate === 2, { txOwner, txMate });
  s.grecent = [{ gid: 'a:1', src: 'a', m: { n: 1 }, sc: 9, at: 0, tx: new Map() }];
  const replay = [];
  s.emit = (to, m) => { replay.push(m && m.sc); };
  s._gspReplay('newbie', 1);
  check('a scoped replay skips another section', replay.length === 0);
  s._gspReplay('newbie', 9);
  check('a scoped replay still hands the matching section', replay.length === 1 && replay[0] === 9);
}

// --- unsigned YIELD --------------------------------------------------------------
{
  const { s } = makeSeat('me', { pc: 0, r: 0, i: 0 });
  s.recv({ t: 'YIELD', ck: ck(s.coord) });
  check('an unsigned YIELD does not unseat', s.hasCoord === true && s.state === 3);
}

// --- row ledger ------------------------------------------------------------------
{
  const { env, s } = makeSeat('owner', { pc: 0, r: 0, i: 0 });
  const down = topo.down(s.coord);
  const ghost = { pc: down.pc, r: down.r, i: 2 };
  const stay = { pc: down.pc, r: down.r, i: 3 };
  const mate = { pc: down.pc, r: down.r, i: 1 };
  s.occ.set(ck(ghost), 'ghost');
  s.occ.set(ck(stay), 'stay');
  s.live.set(ck(stay), env.TICK);
  s.onPhone({ t: 'PHONE', id: 'child', coord: down, tock: ck(s.coord), row: [{ k: ck(mate), v: 'mate' }] });
  check('a ledger installs a named row cell', s.occ.get(ck(mate)) === 'mate');
  check('a ledger keeps a cell the row omitted', s.occ.get(ck(ghost)) === 'ghost');
  check('a ledger keeps a first-hand cell the row omitted', s.occ.get(ck(stay)) === 'stay');
}

if (fails) { console.log(fails + ' FAILED'); process.exit(1); }
console.log('ALL PASS');
