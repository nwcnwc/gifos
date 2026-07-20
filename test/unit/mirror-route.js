// mirror-route.js — exhaustive verification of the sdn dormant-mirror route
// (mesh-media.js sdnMirrorRoute; docs/media-plane.md Phase 2). Pure Node, no
// browser. For every (pc, r, i, t) at C=5 (and spot cases at C=2):
//   1. every consecutive pair of route coords is a REAL topology link
//      (symmetric closure of topo.ownedLinks);
//   2. the route shares NO edge with the direct sdx/sdn legs
//      (head→(pc,r,i) row edge, (pc,r,i)→child-head down edge);
//   3. the avoided parent seat (pc,r,i) is never ON the route (except i==0,
//      where it IS the producer head — route[0] — by construction);
//   4. endpoints are exactly [parent head … child branch head];
//   5. at C=5 with FULL occupancy, EVERY (pc,r,i) has at least one valid t —
//      including r==0, i==r, i==0 and the S1-parent cases.
require('../../site/js/gifos-net.js');
const G = globalThis.GifOS;
require('../../site/js/mesh-media.js');
const topo = G.net.topo;
const route = G.meshMedia.sdnMirrorRoute;

let failures = 0, checks = 0;
const fail = (msg) => { failures++; console.log('FAIL — ' + msg); };
const ck = (c) => c.pc + '/' + c.r + '.' + c.i;

// symmetric link test straight from ownedLinks (each edge is owned by one side)
function linked(a, b) {
  const eq = (x, y) => x.pc === y.pc && x.r === y.r && x.i === y.i;
  return topo.ownedLinks(a).some((l) => eq(l, b)) || topo.ownedLinks(b).some((l) => eq(l, a));
}

function verify(C, pc, r, i, t) {
  const rt = route(topo, C, pc, r, i, t);
  if (!rt) return null;
  checks++;
  const cpc = topo.childPath(pc, i);
  const head = { pc, r, i: 0 }, avoided = { pc, r, i }, childHead = { pc: cpc, r, i: 0 };
  const eq = (x, y) => x.pc === y.pc && x.r === y.r && x.i === y.i;
  const tag = `C=${C} pc=${pc} r=${r} i=${i} t=${t} route=[${rt.map(ck).join(' → ')}]`;
  if (!eq(rt[0], head)) fail('route must start at the parent head: ' + tag);
  if (!eq(rt[rt.length - 1], childHead)) fail('route must end at the child branch head: ' + tag);
  for (let k = 1; k < rt.length; k++) {
    if (!linked(rt[k - 1], rt[k])) fail(`hop ${ck(rt[k - 1])}→${ck(rt[k])} is NOT a topology link: ` + tag);
  }
  // no shared edge with the direct legs (order-insensitive)
  const edge = (a, b) => [ck(a), ck(b)].sort().join('~');
  const directs = new Set([edge(head, avoided), edge(avoided, childHead)]);
  for (let k = 1; k < rt.length; k++) {
    if (directs.has(edge(rt[k - 1], rt[k]))) fail('route SHARES a direct-leg edge: ' + tag);
  }
  // the avoided seat never appears (for i>0; for i==0 it IS the producer head)
  if (i !== 0) { for (const co of rt) if (eq(co, avoided)) fail('route passes through the avoided parent seat: ' + tag); }
  else { for (let k = 1; k < rt.length; k++) if (eq(rt[k], avoided)) fail('i=0: the head may only appear as route[0]: ' + tag); }
  // no repeated seats (a loop would double-claim a slot at one seat)
  const seen = new Set(rt.map(ck));
  if (seen.size !== rt.length) fail('route revisits a seat: ' + tag);
  return rt;
}

// ---- C=5: every (r, i) for an S1 parent and two deep parents ---------------
const C5 = 5;
const parents = [0, topo.childPath(0, 2), topo.childPath(topo.childPath(0, 1), 3)]; // S1, depth-1, depth-2
for (const pc of parents) {
  for (let r = 0; r < C5; r++) for (let i = 0; i < C5; i++) {
    let ok = 0;
    for (let t = 0; t < C5; t++) if (verify(C5, pc, r, i, t)) ok++;
    if (!ok) fail(`NO valid transit row for pc=${pc} r=${r} i=${i} at C=5 (full occupancy)`);
  }
}
console.log('C=5: ' + checks + ' routes verified across ' + parents.length + ' parent sections (' + parents.length * C5 * C5 + ' (r,i) cases, each with ≥1 valid t)');

// ---- C=2 spot checks: S1 parent has routes; deep parents mostly cannot -----
const before = failures;
let c2 = 0;
for (let r = 0; r < 2; r++) for (let i = 0; i < 2; i++) for (let t = 0; t < 2; t++) if (verify(2, 0, r, i, t)) c2++;
if (c2 === 0) fail('C=2 S1 parent should still admit mirror routes');
console.log('C=2: ' + c2 + ' S1-parent routes verified (deep C=2 parents legitimately have none for r=1)');

console.log(failures === 0 ? 'ALL PASS (' + checks + ' routes)' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
