/*
 * mesh-unit.js — RETIRED (2026-07-18).
 *
 * This suite tested an OLD topology API that no longer exists: it required the
 * seating arithmetic (seat/ownedLinks/crossLink/up/down/owner/sectionSeats…)
 * straight off site/js/mesh.js, using path-STRING seats (seat('20', r, i)) and
 * asserting a UNIFORM degree bound of C+1 for EVERY seat.
 *
 * Two deliberate rewrites made every one of those assumptions wrong:
 *   1. The topo.h -> net.topo port (commit cd4aeeb, 2026-07-16) moved all
 *      topology arithmetic OUT of mesh.js into site/js/gifos-net.js
 *      (globalThis.GifOS.net.topo), and switched seats from path-strings to
 *      {pc, r, i} coords. mesh.js no longer exports any of these functions —
 *      requiring it standalone now throws (it reads net.topo at load).
 *   2. W7 (the rook's graph, docs/healing-laws.md): Section 1 is now the C×C
 *      rook's graph at uniform degree 2C-1 = 9 (row-mates + column-mates +
 *      down), NOT C+1. The "every seat has degree <= C+1" invariant this file
 *      asserted is now FALSE by design for the home ring.
 *
 * Its coverage is fully SUPERSEDED by test/topo.js (added by that same port as
 * the net.topo unit test), which pins the CURRENT invariants — rook degree 9
 * for Section 1, C+1 for deep sections, cross-link involution, up/down inverse,
 * rowMates/colMates, ckey round-trip. Run that instead:  node test/topo.js
 *
 * Kept as a stub (rather than deleted) so this note is discoverable and a
 * whole-suite runner sees a clean exit, not a load crash.
 */
'use strict';
console.log('mesh-unit: RETIRED — superseded by test/topo.js (topology moved to net.topo; Section 1 is now the degree-9 rook graph, not C+1). See header.');
process.exit(0);
