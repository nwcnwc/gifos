// topo.js — unit test for net.topo, the JS port of sim/topo.h. Parity with the
// C++ is by-construction (line-for-line arithmetic); this pins the invariants
// the heal + media planes rely on, plus hand-computed values, so a future edit
// that drifts from topo.h fails loudly.
require('../../site/js/gifos-net.js'); // IIFE — assigns globalThis.GifOS (top-level touches no browser API)
const { topo, SCALE } = globalThis.GifOS.net;
const C = SCALE.C;
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const K = (c) => c ? topo.ckey(c) : 'null';

// Enumerate a representative set of seats across a few levels.
const seats = [];
for (const pc of [0, 1, 4, 6, 25, 31]) for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) seats.push({ pc, r, i });

check('C is 5', C === 5, C);

// down/up are inverse edges: up(down(s)) === s for EVERY seat.
let ok = true;
for (const s of seats) { const u = topo.up(topo.down(s)); if (!u || !topo.eq(u, s)) { ok = false; break; } }
check('up(down(s)) === s for all seats', ok);

// down(up(head)) === head for every head (column 0, not Section 1).
ok = true;
for (const s of seats) { if (s.i === 0 && s.pc !== 0) { const d = topo.down(topo.up(s)); if (!topo.eq(d, s)) { ok = false; break; } } }
check('down(up(head)) === head for all heads', ok);

// Section-1 heads (pc=0, i=0) have NO up — Section 1 is the top.
check('Section-1 head has no up', topo.up({ pc: 0, r: 3, i: 0 }) === null);
// Non-heads have no up either (up is column-0 only).
check('non-head has no up', topo.up({ pc: 4, r: 2, i: 3 }) === null);
// Heads have no cross-link; non-heads do.
check('head has no cross-link', topo.crossLink({ pc: 4, r: 2, i: 0 }) === null);
check('non-head has a cross-link', topo.crossLink({ pc: 4, r: 2, i: 3 }) !== null);

// cross-link is an involution (transpose pair (r,i)<->(i,r)).
ok = true;
for (const s of seats) { const x = topo.crossLink(s); if (x) { const xx = topo.crossLink(x); if (!xx || !topo.eq(xx, s)) { ok = false; break; } } }
check('crossLink(crossLink(s)) === s for all non-heads', ok);

// path arithmetic round-trips for every digit 0..C-1.
ok = true;
for (const pc of [0, 1, 4, 31]) for (let d = 0; d < C; d++) { const cp = topo.childPath(pc, d); if (topo.parentPath(cp) !== pc || topo.lastDigit(cp) !== d) { ok = false; break; } }
check('parentPath/lastDigit invert childPath', ok);

// Hand-computed values against topo.h.
check('(0,2,3).down === (4,2,0)', topo.eq(topo.down({ pc: 0, r: 2, i: 3 }), { pc: 4, r: 2, i: 0 }), K(topo.down({ pc: 0, r: 2, i: 3 })));
check('up(4,2,0) === (0,2,3)', topo.eq(topo.up({ pc: 4, r: 2, i: 0 }), { pc: 0, r: 2, i: 3 }), K(topo.up({ pc: 4, r: 2, i: 0 })));
check('crossLink(0,2,3) === (0,3,2)', topo.eq(topo.crossLink({ pc: 0, r: 2, i: 3 }), { pc: 0, r: 3, i: 2 }), K(topo.crossLink({ pc: 0, r: 2, i: 3 })));
check('crossLink(0,3,3) === (0,0,3)  [r==i]', topo.eq(topo.crossLink({ pc: 0, r: 3, i: 3 }), { pc: 0, r: 0, i: 3 }));
check('crossLink(0,0,3) === (0,3,3)  [r==0]', topo.eq(topo.crossLink({ pc: 0, r: 0, i: 3 }), { pc: 0, r: 3, i: 3 }));

// rowMates: C-1 of them, none is self, all share (pc,r).
const rm = topo.rowMates({ pc: 4, r: 2, i: 3 });
check('rowMates has C-1 entries', rm.length === C - 1, rm.length);
check('rowMates excludes self, shares row', rm.every((m) => m.pc === 4 && m.r === 2 && m.i !== 3));

// W7: colMates — Section 1 only: C-1 of them, none is self, all share (pc,i).
const cm = topo.colMates({ pc: 0, r: 2, i: 3 });
check('colMates(pc==0) has C-1 entries', cm.length === C - 1, cm.length);
check('colMates excludes self, shares column', cm.every((m) => m.pc === 0 && m.i === 3 && m.r !== 2));
ok = true;
for (const s of seats) if (s.pc !== 0 && topo.colMates(s).length !== 0) { ok = false; break; }
check('colMates(pc!=0) is empty (deep tree keeps the sparse transpose)', ok);

// W7: Section 1 (pc==0) is the 5x5 ROOK'S GRAPH — uniform degree 2C-1 = 9
// (C-1 row + C-1 column + 1 down), heads included; structure is EXACTLY
// full row + full column + down, nothing else; no up-link. (sim/topo_test.cpp)
check('MAXLINKS === 2C-1', topo.MAXLINKS() === 2 * C - 1, topo.MAXLINKS());
let rookDeg = true, rookStruct = true, rookNoUp = true;
for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) {
  const s = { pc: 0, r, i }; const ol = topo.ownedLinks(s);
  if (ol.length !== 2 * C - 1) rookDeg = false;
  let rowCnt = 0, colCnt = 0, downCnt = 0, other = 0;
  for (const o of ol) {
    if (o.pc === 0 && o.r === r && o.i !== i) rowCnt++;
    else if (o.pc === 0 && o.i === i && o.r !== r) colCnt++;
    else if (o.pc === topo.childPath(0, i) && o.r === r && o.i === 0) downCnt++;
    else other++;
  }
  if (rowCnt !== C - 1 || colCnt !== C - 1 || downCnt !== 1 || other !== 0) rookStruct = false;
  if (topo.up(s) !== null) rookNoUp = false;
}
check('Section-1 rook degree === 9 (all 25 seats, heads too)', rookDeg);
check('Section-1 rook structure (full row + full column + down, nothing else)', rookStruct);
check('Section-1 no up-link', rookNoUp);

// rook is symmetric: b in ownedLinks(a) <=> a in ownedLinks(b), across Section 1.
let sym = true;
for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) {
  const a = { pc: 0, r, i };
  for (const b of topo.ownedLinks(a)) {
    if (b.pc !== 0) continue;
    if (!topo.ownedLinks(b).some((q) => q.pc === 0 && q.r === a.r && q.i === a.i)) sym = false;
  }
}
check('Section-1 rook symmetric', sym);

// bounded degree, DEEP tree only: <= C+1 (the sparse tree bound is load-bearing
// for scale); Section-1 seats are uniformly 2C-1 (asserted above).
let maxDeepDeg = 0;
for (const s of seats) if (s.pc !== 0) maxDeepDeg = Math.max(maxDeepDeg, topo.ownedLinks(s).length);
check('max DEEP ownedLinks degree <= C+1', maxDeepDeg <= C + 1, maxDeepDeg);
check('deep head degree === C+1 (row + up + down, no cross)', topo.ownedLinks({ pc: 4, r: 1, i: 0 }).length === C + 1, topo.ownedLinks({ pc: 4, r: 1, i: 0 }).length);

// ckey/unck round-trip.
check('ckey/unck round-trip', topo.eq(topo.unck(topo.ckey({ pc: 31, r: 4, i: 2 })), { pc: 31, r: 4, i: 2 }));

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
