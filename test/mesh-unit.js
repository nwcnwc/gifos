/*
 * mesh-unit.js — pure unit tests for the v2 topology core (site/js/mesh.js).
 * No browser, no WebRTC: the wiring is arithmetic, so its invariants are
 * checkable directly. Run: node test/mesh-unit.js
 *
 * v2 invariants (per-row ownership, bidirectional tree links):
 *   determinism; every seat holds C+1 links; the cross-links form a HUBLESS
 *   SYMMETRIC full mesh among the C rows; column-0-only up-links; and every
 *   tree link is ONE bidirectional edge (down-for-me = up-for-my-child).
 */
'use strict';
const M = require('../site/js/mesh.js');
const C = M.C, seat = M.seat, key = M.key, eq = M.eq;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  FAIL — ' + name); } };

console.log('mesh-unit: v2 topology invariants (C=' + C + ')');

// 1 — DETERMINISM.
(() => {
  const a = M.ownedLinks(seat('20', 3, 1)).map(key).join('|');
  const b = M.ownedLinks(seat('20', 3, 1)).map(key).join('|');
  ok('wiring is deterministic', a === b && a.length > 0);
})();

// 2 — EVERY SEAT HOLDS C+1 LINKS (C-1 row-mesh + 1 cross-or-up + 1 down).
(() => {
  let good = true;
  for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) {
    const s = seat('3', r, i);
    if (M.ownedLinks(s).length !== C + 1) good = false;
    // exactly one of {cross, up} present, never both, never neither
    const hasCross = !!M.crossLink(s), hasUp = !!M.up(s);
    if (hasCross === hasUp) good = false;         // XOR
  }
  ok('every seat holds C+1 links = (C-1) row + 1 (cross XOR up) + 1 down', good);
})();

// 3 — CROSS-LINKS: only column>0, symmetric involution, no column-0 partner.
(() => {
  let inv = true, noZero = true, colZeroHasNone = true;
  for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) {
    const s = seat('', r, i), x = M.crossLink(s);
    if (i === 0) { if (x) colZeroHasNone = false; continue; }
    if (!x) { inv = false; continue; }
    if (x.i === 0) noZero = false;                // never targets a column-0 (uplink) seat
    if (!eq(M.crossLink(x), s)) inv = false;       // self-inverse ⇒ symmetric, hubless
  }
  ok('cross-link is a symmetric involution on columns >0', inv);
  ok('cross-link never steals a column-0 (uplink) port', noZero);
  ok('column-0 seats hold no cross-link (they hold the uplink)', colZeroHasNone);
})();

// 4 — FULL ROW MESH: every row reaches every OTHER row via one cross-link.
(() => {
  let full = true;
  for (let r = 0; r < C; r++) {
    const reached = new Set();
    for (let i = 1; i < C; i++) reached.add(M.crossLink(seat('', r, i)).r);
    for (let r2 = 0; r2 < C; r2++) if (r2 !== r && !reached.has(r2)) full = false;
    if (reached.has(r)) full = false;             // and never a self-edge
  }
  ok('every row has a direct cross-edge to every other row (no self-edge)', full);
})();

// 5 — UP is column-0-only; row-0 of Section 1 excepted, the rest go to (0,0).
(() => {
  ok('non-column-0 seats have no up-link', M.up(seat('2', 3, 4)) === null);
  ok('column-0 up = (parent, r, lastDigit)', eq(M.up(seat('31', 2, 0)), seat('3', 2, 1)));
  ok('Section 1 row r head uplinks to (0,0,r) [internal 2-level tree]', eq(M.up(seat('', 4, 0)), seat('', 0, 4)));
  ok('(0,0) is the root (no up)', M.up(seat('', 0, 0)) === null);
})();

// 6 — BIDIRECTIONAL TREE LINKS: down-for-me IS up-for-my-child.
(() => {
  let bi = true;
  for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) {
    const s = seat('4', r, i), d = M.down(s);
    if (d.i !== 0) bi = false;                     // downlink always lands on a child row's 0th seat
    if (!eq(M.up(d), s)) bi = false;               // and that seat's up-link points straight back
  }
  // and the owner's down lands exactly on the column-0 seat that uplinked
  const c0 = seat('42', 3, 0);
  ok('down(s) is a child row 0th seat whose up() is s (one bidirectional edge)', bi);
  ok('down(owner(col-0 seat)) == that seat', eq(M.down(M.owner(c0)), c0));
})();

// 7 — DEGREE is bounded (hubless): C+1 for every non-root seat. Build a few full
//     sections + their children, count undirected neighbours over the occupied set.
(() => {
  const occ = new Set();
  const add = (p) => M.sectionSeats(p).forEach((s) => occ.add(key(s)));
  add(''); for (let d = 0; d < C; d++) add(String(d)); add('00'); add('34'); // root + all children + two grandchildren
  // undirected neighbour set from owned links of BOTH endpoints
  const neigh = (s) => {
    const nb = new Set();
    for (const t of M.ownedLinks(s)) if (occ.has(key(t))) nb.add(key(t));
    // reverse edges: scan my section + parent section + my child sections
    const scan = [];
    for (const cs of M.sectionSeats(s.path)) scan.push(cs);
    if (s.path !== '') for (const cs of M.sectionSeats(M.parentPath(s.path))) scan.push(cs);
    for (const cp of M.childrenPaths(s.path)) for (const cs of M.sectionSeats(cp)) scan.push(cs);
    for (const c of scan) { if (eq(c, s) || !occ.has(key(c))) continue; for (const t of M.ownedLinks(c)) if (eq(t, s)) { nb.add(key(c)); break; } }
    return nb;
  };
  let maxOrdinary = 0, s1r0Max = 0;
  for (const k of occ) {
    const [pr, ii] = k.split('.'); const [path, r] = pr.split('/'); const s = seat(path, +r, +ii);
    const d = neigh(s).size;
    if (path === '' && +r === 0) s1r0Max = Math.max(s1r0Max, d);   // Section-1 row 0 owns the internal tree (each seat holds an extra row)
    else maxOrdinary = Math.max(maxOrdinary, d);
  }
  ok('every seat outside Section-1 row 0 has degree <= C+1 (hubless) — max=' + maxOrdinary, maxOrdinary <= C + 1);
  ok('Section-1 row-0 seats carry the internal tree — max deg=' + s1r0Max + ' (<=C+2)', s1r0Max > C + 1 && s1r0Max <= C + 2);
})();

console.log('mesh-unit: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
