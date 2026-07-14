/*
 * mesh.js — the topology core of the introducer-mesh architecture
 * (docs/mesh-refactor.md §1½). PURE ARITHMETIC: no relay, no WebRTC, no DOM.
 * Every seat computes the entire wiring from its own coordinate; this module is
 * that computation, isolated so it can be unit-tested with no browser.
 *
 * There are NO deacons. Every seat is identical and owns a bounded, uniform set
 * of links. A seat's address is { path, r, i }:
 *   path : section position in a C-ary tree, a base-C digit string
 *          ("" = root, "2" = 3rd child of root, "20" = 1st child of that).
 *   r    : row within the section, 0..C-1.
 *   i    : seat within the row,    0..C-1.
 *
 * The seven links (§1½): C-1 row-mesh + 1 cross-row + 1 up + 1 down.
 * Media/audio/gossip/seat-finding all ride these same links; the tree is a
 * reduce(up)/broadcast(down) machine.
 */
(function (root, factory) {
  const M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  if (root) root.GifosMesh = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = 5; // seats per row; rows per section (§1½ "C = 5")

  // ---- coordinates --------------------------------------------------------
  const key = (s) => s.path + '/' + s.r + '.' + s.i;
  const seat = (path, r, i) => ({ path: path, r: r, i: i });
  const eq = (a, b) => a.path === b.path && a.r === b.r && a.i === b.i;
  const depth = (s) => s.path.length;
  const isRoot = (s) => s.path === '';

  // Every seat of a section, and the section that owns a path.
  function sectionSeats(path) {
    const out = [];
    for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) out.push(seat(path, r, i));
    return out;
  }
  const parentPath = (path) => path.slice(0, -1);
  const childPath = (path, d) => path + String(d);

  // ---- the wiring (pure functions of coordinate) --------------------------
  // 1. ROW MESH — C-1 links to the rest of my row.
  function rowMates(s) {
    const out = [];
    for (let j = 0; j < C; j++) if (j !== s.i) out.push(seat(s.path, s.r, j));
    return out;
  }

  // 2. CROSS-ROW — the transpose (r,i)<->(i,r), symmetric, so a row's C seats
  //    collectively bridge all C-1 other rows. Diagonal seats (r==i) have no
  //    transpose partner, so they form a cycle among themselves — one extra
  //    bridge to the next row, which is the redundancy the doc wants.
  function crossRow(s) {
    if (s.r !== s.i) return seat(s.path, s.i, s.r);        // transpose
    const k = (s.r + 1) % C;                                // diagonal -> next diagonal
    return seat(s.path, k, k);
  }

  // 3. UP — one link to the parent section, same (r,i) one level up. Root has none.
  function up(s) {
    if (isRoot(s)) return null;
    return seat(parentPath(s.path), s.r, s.i);
  }

  // 4. DOWN — one link into a child. Seat i of any row descends into child i,
  //    so a row's C seats cover the C children (one each) and each child
  //    receives C down-links (one per row) — C-fold redundancy on every tree
  //    edge. It lands on the child's column 0.
  function down(s) {
    return seat(childPath(s.path, s.i), s.r, 0);
  }

  // All links a seat OWNS (deterministic, bounded: C-1 + 1 + 1 + 1 = C+2).
  function ownedLinks(s) {
    const out = rowMates(s);
    out.push(crossRow(s));
    const u = up(s); if (u) out.push(u);
    out.push(down(s));
    return out;
  }

  // ---- tree helpers for reduce(up) / broadcast(down) ----------------------
  const childrenPaths = (path) => { const out = []; for (let d = 0; d < C; d++) out.push(childPath(path, d)); return out; };
  const pathToRoot = (path) => { const out = []; for (let n = path.length; n >= 0; n--) out.push(path.slice(0, n)); return out; };

  // Section 1 (the ROOT section) is the room's identity (§1½). A seat reaches it
  // by walking its up-link to depth 0; these are the coordinates whose occupants
  // (sealed identities) name the room. Two greeters are the same room iff their
  // Section-1 occupant sets match (mostly-overlapping tolerated mid-churn).
  const SECTION_ONE = () => sectionSeats(''); // the C² root coordinates

  // ---- seating: the Section-1-anchored downward search (§1½) ---------------
  // Given the occupied set (a Set of coord keys) and the root as anchor, return
  // the nearest empty coordinate by a breadth-first descent from Section 1:
  // fill the root section, then its children, then grandchildren — dense before
  // deep. Returns null only if the tree is impossibly full (unbounded in
  // practice; callers grow depth as needed).
  function nearestVacancy(occupied, maxDepth) {
    maxDepth = maxDepth == null ? 24 : maxDepth;
    // BFS over sections by path length, seats within a section in (r,i) order.
    let frontier = [''];
    for (let d = 0; d <= maxDepth; d++) {
      const next = [];
      for (const path of frontier) {
        for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) {
          const s = seat(path, r, i);
          if (!occupied.has(key(s))) return s;          // first (nearest) vacancy
        }
        // section full — its children are the next frontier level
        for (const cp of childrenPaths(path)) next.push(cp);
      }
      frontier = next;
    }
    return null;
  }

  // How full is the tree, sized to the occupancy — used to derive X and the
  // displayed count. `total` is just occupied.size (the reduce result); this is
  // the greeter-pool size that rides down with it.
  const greeterPoolSize = (total) => Math.max(3, Math.round(2 * Math.log10(Math.max(1, total))));

  return {
    C: C,
    seat: seat, key: key, eq: eq, depth: depth, isRoot: isRoot,
    sectionSeats: sectionSeats, parentPath: parentPath, childPath: childPath,
    rowMates: rowMates, crossRow: crossRow, up: up, down: down, ownedLinks: ownedLinks,
    childrenPaths: childrenPaths, pathToRoot: pathToRoot, sectionOne: SECTION_ONE,
    nearestVacancy: nearestVacancy, greeterPoolSize: greeterPoolSize,
  };
});
