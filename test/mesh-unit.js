/*
 * mesh-unit.js — pure unit tests for the topology core (site/js/mesh.js).
 * No browser, no WebRTC: the wiring is arithmetic, so its invariants are
 * checkable directly. Run: node test/mesh-unit.js
 *
 * Proves the load-bearing properties every valid wiring must have (§1½):
 *   determinism, bounded degree, row/section reachability, tree-edge
 *   redundancy, whole-tree connectivity, and dense-before-deep seating.
 */
'use strict';
const M = require('../site/js/mesh.js');
const C = M.C;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL — ' + name); } };

// Build a densely-filled tree of `n` seats via the seating ping, and return
// the occupied Set (coord keys) + the seat list.
function fill(n) {
  const occ = new Set(), seats = [];
  for (let k = 0; k < n; k++) {
    const s = M.nearestVacancy(occ);
    if (!s) break;
    occ.add(M.key(s)); seats.push(s);
  }
  return { occ, seats };
}

// Undirected neighbour set of a seat, from owned links of BOTH endpoints
// (a link is bidirectional). Restricted to a given occupancy if provided.
function neighbours(s, occ) {
  const nb = new Set();
  for (const t of M.ownedLinks(s)) if (!occ || occ.has(M.key(t))) nb.add(M.key(t));
  // reverse edges: any seat that links TO s. For row/cross-row within s's
  // section and the tree edges, recompute from candidates cheaply by scanning
  // s's own section + parent + children (the only places a link to s can originate).
  const cand = [];
  for (const cs of M.sectionSeats(s.path)) cand.push(cs);
  const pp = s.path === '' ? null : M.parentPath(s.path);
  if (pp !== null) for (const cs of M.sectionSeats(pp)) cand.push(cs);
  for (const cp of M.childrenPaths(s.path)) for (const cs of M.sectionSeats(cp)) cand.push(cs);
  for (const c of cand) {
    if (M.eq(c, s)) continue;
    if (occ && !occ.has(M.key(c))) continue;
    for (const t of M.ownedLinks(c)) if (M.eq(t, s)) { nb.add(M.key(c)); break; }
  }
  return nb;
}

console.log('mesh-unit: topology invariants (C=' + C + ')');

// 1 — DETERMINISM: same coordinate → identical links, every time.
(() => {
  const s = M.seat('20', 3, 1);
  const a = M.ownedLinks(s).map(M.key).join('|');
  const b = M.ownedLinks(M.seat('20', 3, 1)).map(M.key).join('|');
  ok('wiring is deterministic', a === b && a.length > 0);
})();

// 2 — BOUNDED DEGREE: no seat exceeds ~2C neighbours (never O(section)).
(() => {
  const { occ, seats } = fill(C * C * (C + 2)); // several sections deep
  let maxDeg = 0;
  for (const s of seats) maxDeg = Math.max(maxDeg, neighbours(s, occ).size);
  ok('degree is bounded (<= 3C, no deacon-style hub) — max=' + maxDeg, maxDeg <= 3 * C);
})();

// 3 — ROW MESH is a symmetric full mesh of C-1.
(() => {
  const s = M.seat('', 2, 1);
  const mates = M.rowMates(s);
  let sym = mates.length === C - 1;
  for (const m of mates) sym = sym && M.rowMates(m).some((x) => M.eq(x, s));
  ok('row mesh is a symmetric C-1 clique', sym);
})();

// 4 — EVERY ROW REACHES EVERY OTHER ROW in a section via cross-row links.
(() => {
  let allReach = true;
  for (let r = 0; r < C; r++) {
    const reached = new Set();
    for (let i = 0; i < C; i++) { const cr = M.crossRow(M.seat('', r, i)); reached.add(cr.r); }
    for (let r2 = 0; r2 < C; r2++) if (r2 !== r && !reached.has(r2)) allReach = false;
  }
  ok('every row bridges to every other row in its section', allReach);
})();

// 5 — TREE EDGE REDUNDANCY: every occupied child section has >= C links to its
//     parent (so no single failure isolates a subtree).
(() => {
  const { occ } = fill(C * C * 3); // root + a couple child sections occupied
  const childPaths = new Set();
  for (const kkey of occ) { const p = kkey.split('/')[0]; if (p.length >= 1) childPaths.add(p); }
  let worst = Infinity;
  for (const cp of childPaths) {
    const pp = M.parentPath(cp);
    let edges = 0;
    // up-links from this child's occupied seats into the (occupied) parent
    for (const cs of M.sectionSeats(cp)) {
      if (!occ.has(M.key(cs))) continue;
      const u = M.up(cs); if (u && occ.has(M.key(u))) edges++;
    }
    // down-links from parent's occupied seats into this child
    for (const ps of M.sectionSeats(pp)) {
      if (!occ.has(M.key(ps))) continue;
      const d = M.down(ps); if (d.path === cp && occ.has(M.key(d))) edges++;
    }
    worst = Math.min(worst, edges);
  }
  ok('every occupied tree edge is >= C-fold redundant — worst=' + (worst === Infinity ? 'n/a' : worst),
     worst === Infinity || worst >= C);
})();

// 6 — WHOLE-TREE CONNECTIVITY: from any seat, the occupied graph is one
//     component (nobody is stranded).
(() => {
  const { occ, seats } = fill(C * C * 4 + 7);
  const start = M.key(seats[0]);
  const seen = new Set([start]);
  const stack = [seats[0]];
  while (stack.length) {
    const s = stack.pop();
    for (const nkey of neighbours(s, occ)) {
      if (!seen.has(nkey)) {
        seen.add(nkey);
        const [pathrow, ii] = nkey.split('.');
        const [path, r] = pathrow.split('/');
        stack.push(M.seat(path, +r, +ii));
      }
    }
  }
  ok('occupied tree is fully connected — reached ' + seen.size + '/' + occ.size, seen.size === occ.size);
})();

// 7 — SEATING fills DENSE BEFORE DEEP: the root section is full before any
//     child seat is used; a section is full before its children.
(() => {
  const { seats } = fill(C * C + 1); // just past one full section
  // first C² seats must all be in the root section (path === '')
  let dense = true;
  for (let k = 0; k < C * C; k++) if (seats[k].path !== '') dense = false;
  // the (C²+1)th seat is the first of a child section (depth 1)
  const overflow = seats[C * C];
  ok('root section fills completely before any child', dense && overflow.path.length === 1);
})();

// 8 — GREETER POOL SIZE: 3 for a handful, ~12 for a million (log growth).
(() => {
  ok('X(1)=3', M.greeterPoolSize(1) === 3);
  ok('X(10)=3', M.greeterPoolSize(10) === 3);
  ok('X(1e6)≈12', M.greeterPoolSize(1e6) === 12);
})();

// 9 — UP/DOWN reach the right sections (parent one level up; down into a child).
(() => {
  const s = M.seat('31', 2, 4);
  const u = M.up(s);
  const d = M.down(s);
  ok('up goes one level up, same (r,i)', u && u.path === '3' && u.r === 2 && u.i === 4);
  ok('down goes into a child of my path', d.path.length === 3 && d.path.slice(0, 2) === '31');
  ok('root has no up-link', M.up(M.seat('', 0, 0)) === null);
})();

console.log('mesh-unit: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
