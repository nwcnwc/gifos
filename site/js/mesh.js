/*
 * mesh.js — the topology core of the introducer-mesh architecture, v2.
 * PURE ARITHMETIC: no relay, no WebRTC, no DOM. Every seat computes its wiring
 * from its own coordinate; this module is that computation, isolated for tests.
 *
 * v2 topology (2026-07-14, per the per-row-ownership redesign):
 *
 *  ADDRESS  { path, r, i } — section (base-C digit string), row r, column i.
 *
 *  LINKS (every seat holds exactly C+1: C-1 row-mesh + 1 "Cth" + 1 downlink):
 *   • ROW MESH   — C-1 links to the rest of my row (full clique).
 *   • CROSS-LINK — column>0 only: a hubless, symmetric FULL MESH among the C
 *       rows of my section (off-diagonal transposes (r,i)↔(i,r); each diagonal
 *       (r,r) pairs with row-0 seat (0,r), so row 0 joins without needing a
 *       column-0 seat, which is busy holding an uplink).
 *   • UP         — column 0 only: my ROW's uplink to its OWNER, a seat in the
 *       section above. up(path,r,0) = (parent, r, lastDigit(path)). SECTION 1
 *       HAS NO UP AT ALL (flag-day #2): there is no special root seat and no
 *       special row — the root of the tree is the whole 25-seat section,
 *       internally meshed by its own row meshes + cross-links. Section 1's rows
 *       self-heal like any other row; its heads phone no one, because Section 1
 *       IS the home.
 *   • DOWN       — every (non-leaf) seat OWNS one row of a child section: row r
 *       of child i, landing on that row's 0th seat. down(path,r,i) = (path·i,
 *       r, 0). This IS the child row's uplink target — one bidirectional edge
 *       shared as down-for-me / up-for-the-child. (Fixes the old C× up/down
 *       asymmetry: only column-0 child seats carry up-links.)
 *
 *  OWNERSHIP is per-ROW and fully distributed: every non-leaf seat owns exactly
 *  one child row (≤C seats) and talks to it through that row's 0th seat.
 */
(function (root, factory) {
  const M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  if (root) root.GifosMesh = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = 5; // seats per row; rows per section

  // ---- coordinates --------------------------------------------------------
  const key = (s) => s.path + '/' + s.r + '.' + s.i;
  const seat = (path, r, i) => ({ path: path, r: r, i: i });
  const eq = (a, b) => a.path === b.path && a.r === b.r && a.i === b.i;
  const isRoot = (s) => s.path === '';
  const parentPath = (path) => path.slice(0, -1);
  const childPath = (path, d) => path + String(d);
  const lastDigit = (path) => (path.length ? +path[path.length - 1] : -1);

  function sectionSeats(path) {
    const out = [];
    for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) out.push(seat(path, r, i));
    return out;
  }
  const childrenPaths = (path) => { const o = []; for (let d = 0; d < C; d++) o.push(childPath(path, d)); return o; };

  // ---- the wiring (pure functions of coordinate) --------------------------
  // 1. ROW MESH — C-1 links to the rest of my row.
  function rowMates(s) {
    const out = [];
    for (let j = 0; j < C; j++) if (j !== s.i) out.push(seat(s.path, s.r, j));
    return out;
  }

  // 2. CROSS-LINK — column>0 only. Hubless symmetric full mesh among the C rows.
  function crossLink(s) {
    const r = s.r, i = s.i;
    if (i === 0) return null;                 // column 0 carries the uplink, not a cross-link
    if (r === i) return seat(s.path, 0, i);   // diagonal (r,r) <-> row-0 seat (0,r)
    if (r === 0) return seat(s.path, i, i);   // row-0 seat (0,i) <-> diagonal (i,i)
    return seat(s.path, i, r);                // off-diagonal transpose (r,i) <-> (i,r)
  }

  // 3. UP — column 0 only: my row's uplink to its owner (a seat one level up).
  //    Section 1 has NO up at all: it IS the home — the root of the tree is the
  //    whole 25-seat section, meshed by its own row + cross links, not any one
  //    seat. (Flag-day #2: no special root seat, no special row 0.)
  function up(s) {
    if (s.i !== 0) return null;               // non-0 seats reach up THROUGH their row's 0th seat
    if (isRoot(s)) return null;               // Section 1 IS the home — nothing above it
    return seat(parentPath(s.path), s.r, lastDigit(s.path));
  }

  // 4. DOWN — I own row r of child section i; my downlink lands on its 0th seat.
  //    That same edge is the child row's up-link (bidirectional).
  function down(s) {
    return seat(childPath(s.path, s.i), s.r, 0);
  }

  // OWNER — the seat that owns me = where my ROW's 0th seat uplinks.
  function owner(s) { return up(seat(s.path, s.r, 0)); }

  // All links a seat OWNS (C+1: C-1 row-mesh + 1 cross-or-up + 1 down).
  function ownedLinks(s) {
    const out = rowMates(s);
    const x = crossLink(s); if (x) out.push(x);
    const u = up(s); if (u) out.push(u);
    out.push(down(s));                        // potential — the child row may be empty (leaf)
    return out;
  }

  // ---- tree helpers -------------------------------------------------------
  const pathToRoot = (path) => { const o = []; for (let n = path.length; n >= 0; n--) o.push(path.slice(0, n)); return o; };
  // Section 1 (root) occupants name the room (sealed identity), fetched on demand
  // by a greeter walking its uplink — NOT pushed by any beacon.
  const SECTION_ONE = () => sectionSeats('');
  const greeterPoolSize = (total) => Math.max(3, Math.round(2 * Math.log10(Math.max(1, total))));

  return {
    C: C,
    seat: seat, key: key, eq: eq, isRoot: isRoot,
    parentPath: parentPath, childPath: childPath, lastDigit: lastDigit,
    sectionSeats: sectionSeats, childrenPaths: childrenPaths,
    rowMates: rowMates, crossLink: crossLink, up: up, down: down, owner: owner, ownedLinks: ownedLinks,
    pathToRoot: pathToRoot, sectionOne: SECTION_ONE, greeterPoolSize: greeterPoolSize,
  };
});
