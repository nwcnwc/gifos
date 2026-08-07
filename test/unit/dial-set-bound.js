// dial-set-bound.js — THE DIAL SET IS O(C), WHATEVER statusOf DOES (scale
// audit V2/V3, docs/scale-audit-2026-08-04.md "Guardrails to add with any fix":
// "a browser-side unit pin: dial-set size with a synthetic 10k-entry statusOf
// stays <= the row+duty bound").
//
// WHY THIS GUARD EXISTS, and what it is really pinning.
//
// V3 said the pc dial set was directory-scoped, so V2's O(N) `statusOf` fed
// O(N) connection attempts per node. That is REFUTED by the code: every
// dial-out site in run.html is gated on `linkTo()`, and `linkTo()` consults
// exactly ONE thing —
//
//     function linkTo(pid) { const s = meshSeat(); if (!s || !s.hasCoord) return false;
//                            return s.linkPeers().has(pid); }
//
// — the seat's own bounded neighbourhood in site/js/mesh.js. `statusOf` is not
// an input to it and never was. So the property that actually protects the
// transport plane is a property of `linkPeers()` alone, and that is what this
// file pins, at a size no browser suite can reach: an occ map with 10,000
// entries — every one of them a peer a flooded `statusOf` would have handed to
// a directory-scoped dialer — must still yield a link set of at most 2C-1+1.
//
// It is a UNIT test on purpose. The bound is arithmetic over the seat's coord,
// so a headless assertion is stronger evidence than a browser run: it can hold
// N at 10,000 (four browsers cannot), and it fails on the mechanism rather than
// on a symptom. The browser-side companion — that statusOf's contents cannot
// pull a stranger into the dial set through run.html's own linkTo — is
// test/browser/e2e-status-map.js.
//
// If someone ever re-scopes the dial set to the directory, this reds.
//
// Pure Node, no browser. Usage: node test/unit/dial-set-bound.js
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const net = globalThis.GifOS.net, mesh = globalThis.GifOS.mesh;
const topo = net.topo, ck = topo.ckey;
const C = net.SCALE.C;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };

// A seat with no fabric: linkPeers() is pure arithmetic over coord + occ, so it
// needs no transport, no relay and no ticks.
function seatAt(coord, id) {
  const s = new mesh.Seat(id || 'me_0000', { TICK: 0, HEALING: true, send() {}, knock() {} });
  s.coord = coord; s.hasCoord = true; s.state = 3;
  return s;
}
// The synthetic flood: N strangers at N distinct coords, spread across the
// whole tree — the shape a room-wide status flood produces in a directory.
function floodOcc(s, N) {
  let made = 0, pc = 0;
  while (made < N) {
    for (let r = 0; r < C && made < N; r++) for (let i = 0; i < C && made < N; i++) {
      const k = ck({ pc, r, i });
      if (s.hasCoord && k === ck(s.coord)) continue;
      s.occ.set(k, 'flood_' + made); made++;
    }
    pc++;
  }
  return made;
}

// THE BOUND, derived and then MEASURED below (the first cut of this file wrote
// 2C-1+1 on the assumption the owner was always an extra edge; it is not, and
// the "at the bound" leg caught it — kept here because the arithmetic is the
// point of the guard):
//   Section 1  — the C×C ROOK: (C-1) row + (C-1) column + down = 2C-1. No owner
//                (nothing above the home), so nothing is added. C=5 ⇒ 9.
//   deep HEAD  — (C-1) row + up + down = C+1; its owner IS that `up` edge, so
//                linkPeers adds nothing. C=5 ⇒ 6.
//   deep i>0   — (C-1) row + cross + down = C+1, plus the ROW's owner, which is
//                reached through the head and is NOT an owned link: C+2. ⇒ 7.
// 2C-1 dominates for every C ≥ 3, and Section 1 attains it.
const BOUND = 2 * C - 1;

// ---------------------------------------------------------------------------
console.log('=== the bound holds at every coord in the tree ===');
// Section 1 (the rook, the widest degree in the system), a deep head (which
// additionally holds an owner), and a deep non-head.
const cases = [
  ['Section 1 corner', { pc: 0, r: 0, i: 0 }],
  ['Section 1 middle', { pc: 0, r: 2, i: 3 }],
  ['deep head', { pc: 1, r: 0, i: 0 }],
  ['deep non-head', { pc: 1, r: 2, i: 4 }],
  ['deeper head', { pc: topo.childPath(topo.childPath(3, 2), 1), r: 1, i: 0 }],
];
for (const [label, coord] of cases) {
  const s = seatAt(coord);
  const made = floodOcc(s, 10000);
  const links = s.linkPeers();
  check(`${label} ${ck(coord)}: occ holds ${made} peers, the dial set holds ${links.size} (bound ${BOUND})`,
    made === 10000 && links.size <= BOUND, { occ: s.occ.size, links: links.size, bound: BOUND });
  // …and the members are EXACTLY the arithmetic neighbourhood, not a subset of
  // the flood that happened to be small. A cap that kept the wrong C peers
  // would pass a size-only assertion.
  const want = new Set();
  for (const olc of topo.ownedLinks(coord)) { const v = s.occGet(ck(olc)); if (v != null && v !== s.id) want.add(v); }
  const o = s.ownerId(); if (o != null && o !== s.id) want.add(o);
  const same = want.size === links.size && [...want].every((v) => links.has(v));
  check(`${label}: the dial set IS the owned-link neighbourhood (+ owner) — not an arbitrary ${links.size}`, same,
    { want: want.size, got: links.size });
}

// ---------------------------------------------------------------------------
console.log('\n=== the bound is N-INDEPENDENT (the V1 law, on this plane) ===');
// The whole point: 100 peers and 100,000 peers must produce the SAME dial set.
{
  const coord = { pc: 0, r: 1, i: 1 };
  const sizes = [];
  for (const N of [100, 1000, 10000, 100000]) {
    const s = seatAt(coord); floodOcc(s, N);
    sizes.push({ N, links: s.linkPeers().size, occ: s.occ.size });
  }
  console.log('  ' + sizes.map((x) => `N=${x.N} -> ${x.links}`).join('   '));
  check('the dial set does not grow with N at all (1000x range)',
    sizes.every((x) => x.links === sizes[0].links), sizes);
  check('…and a Section-1 seat sits AT the bound, so the test is not passing on an empty set',
    sizes[0].links === BOUND, { links: sizes[0].links, bound: BOUND });
}

// ---------------------------------------------------------------------------
console.log('\n=== an UNSEATED seat links NOBODY (the last unbounded path) ===');
// run.html's linkTo returns false before hasCoord, and this is the mechanism
// behind it: the join dance rides the greeter/relay path and needs no
// DataChannels. The old "bootstrap = whole roster" relic full-meshed a stalled
// joiner (27 RTCPeerConnections, every tile black).
{
  const s = new mesh.Seat('me_0000', { TICK: 0, HEALING: true, send() {}, knock() {} });
  s.hasCoord = false; s.state = 2;
  floodOcc(s, 10000);
  check('an unseated seat with a 10,000-entry occ map has an EMPTY dial set', s.linkPeers().size === 0, { links: s.linkPeers().size });
}

// ---------------------------------------------------------------------------
console.log('\n=== NEGATIVE CONTROL: the flood is reachable, so the bound is real ===');
// Every assertion above could pass vacuously if the synthetic occ entries were
// invisible to the seat. Prove they are not: the seat can see all 10,000 (a
// directory-scoped dialer would have found exactly these), and a peer PLACED on
// one of its owned links does enter the set. Absence above is the bound doing
// work, not an empty map.
{
  const coord = { pc: 0, r: 3, i: 2 };
  const s = seatAt(coord); floodOcc(s, 10000);
  let visible = 0; for (const v of s.occ.values()) if (v != null) visible++;
  check('the seat can SEE all 10,000 flooded peers (a directory dialer would dial them)', visible === 10000, { visible });
  const stranger = 'stranger_x';
  s.occ.set(ck({ pc: 999999, r: 0, i: 0 }), stranger);
  check('a peer at a NON-owned coord stays out of the dial set', !s.linkPeers().has(stranger));
  const mine = topo.ownedLinks(coord)[0];
  s.occ.set(ck(mine), stranger);
  check('the SAME peer at an OWNED-link coord enters it (so absence above means the bound, not a broken accessor)',
    s.linkPeers().has(stranger), { at: ck(mine) });
}

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
