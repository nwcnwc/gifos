// compact-slot.js — a compaction admit skips a cell that would pin the mover.
//
// serveCompact used to take the first free cell of the nearest shallower row
// whose down-child was empty. compactEligible lets only the rightmost occupant
// leave, so a mover seated left of a row-mate who will not move never departs.
// At depth >= 3 that row-mate is any occupant to the right. Shallower than
// that, it is a row-mate who already has a down-child. A trailing cell is
// still taken. Twin of compactDensifyCol in test/sim/mesh_seat.inc.
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const mesh = globalThis.GifOS.mesh;
const topo = globalThis.GifOS.net.topo;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };

// pc at depth d, digit 0 each step. Section 1 is depth 0.
function pcAt(depth) {
  let pc = 0;
  for (let i = 0; i < depth; i++) pc = pc * 6 + 1;
  return pc;
}

function head(depth) {
  const env = { TICK: 0, HEALING: true, COMPACTION: true, send() {}, knock() {}, wake() {} };
  const s = new mesh.Seat('head', env);
  s.state = 3;
  s.hasCoord = true;
  s.coord = { pc: pcAt(depth), r: 0, i: 0 };
  s.occ.set(topo.ckey(s.coord), s.id);
  const up = topo.up(s.coord);
  if (up) s.occ.set(topo.ckey(up), 'owner');
  const sent = [];
  s.emit = (to, m) => { sent.push({ to, t: m && m.t, i: m && m.coord && m.coord.i }); };
  return { s, sent };
}

function probe(s) {
  const seekerPc = s.coord.pc * 6 + 1; // one level deeper, so this row is strictly shallower
  s.serveCompact({ t: 'FIND', nc: 'seek', tag: 1, coord: { pc: seekerPc, r: 0, i: 0 }, ttl: 8 });
}

function seatedCol(s) {
  const hit = [];
  for (let j = 1; j < 5; j++) {
    const id = s.occ.get(topo.ckey({ pc: s.coord.pc, r: 0, i: j }));
    if (id === 'seek') hit.push(j);
  }
  return hit;
}

// Depth 3, rightmost column occupied, the cells to its left free. Every free
// cell has an occupant to its right, so none is a slot. The probe climbs.
{
  const { s, sent } = head(3);
  check('the fixture is depth 3', topo.pcDepth(s.coord.pc) === 3, topo.pcDepth(s.coord.pc));
  s.occ.set(topo.ckey({ pc: s.coord.pc, r: 0, i: 4 }), 'mate');
  probe(s);
  check('a depth-3 row with no trailing free cell does not seat the mover', seatedCol(s).length === 0, seatedCol(s));
  check('the probe climbs to the owner', sent.some((e) => e.t === 'FIND' && e.to === 'owner'), sent);
}

// Depth 3, column 2 occupied. Column 1 has that mate to its right, so it is
// pinned. Column 3 has nobody to its right, so it is the slot.
{
  const { s } = head(3);
  s.occ.set(topo.ckey({ pc: s.coord.pc, r: 0, i: 2 }), 'mate');
  probe(s);
  check('the first unpinned cell is taken and the pinned cell is not', JSON.stringify(seatedCol(s)) === '[3]', seatedCol(s));
}

// Depth 2, a row-mate to the right with no down-child. The left cell is still
// a slot: only a down-child, or depth >= 3, pins.
{
  const { s } = head(2);
  check('the fixture is depth 2', topo.pcDepth(s.coord.pc) === 2, topo.pcDepth(s.coord.pc));
  s.occ.set(topo.ckey({ pc: s.coord.pc, r: 0, i: 3 }), 'mate');
  probe(s);
  check('a depth-2 row still seats the first free cell left of a childless mate', JSON.stringify(seatedCol(s)) === '[1]', seatedCol(s));
}

// Depth 2, the row-mate to the right has a down-child. Column 1 is pinned.
// Column 3 has nobody to its right, so it is still taken.
{
  const { s } = head(2);
  const mate = { pc: s.coord.pc, r: 0, i: 2 };
  s.occ.set(topo.ckey(mate), 'mate');
  s.occ.set(topo.ckey(topo.down(mate)), 'child');
  probe(s);
  check('a down-child to the right pins the left cell', JSON.stringify(seatedCol(s)) === '[3]', seatedCol(s));
}

process.exit(fails ? 1 : 0);
