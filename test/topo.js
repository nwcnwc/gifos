// topo.js — unit test for net.topo, the JS port of sim/topo.h. Parity with the
// C++ is by-construction (line-for-line arithmetic); this pins the invariants
// the heal + media planes rely on, plus hand-computed values, so a future edit
// that drifts from topo.h fails loudly.
require('../site/js/gifos-net.js'); // IIFE — assigns globalThis.GifOS (top-level touches no browser API)
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

// bounded degree: <= C+1 everywhere; Section-1 head = C (no up, no cross).
let maxDeg = 0;
for (const s of seats) maxDeg = Math.max(maxDeg, topo.ownedLinks(s).length);
check('max ownedLinks degree <= C+1', maxDeg <= C + 1, maxDeg);
check('Section-1 head degree === C (row + down only)', topo.ownedLinks({ pc: 0, r: 1, i: 0 }).length === C, topo.ownedLinks({ pc: 0, r: 1, i: 0 }).length);

// ckey/unck round-trip.
check('ckey/unck round-trip', topo.eq(topo.unck(topo.ckey({ pc: 31, r: 4, i: 2 })), { pc: 31, r: 4, i: 2 }));

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
