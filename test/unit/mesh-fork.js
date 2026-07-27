// mesh-fork.js — R5 fork-probe clustering under Node: the pick-one modal must
// fire ONLY on positive disjointness evidence, never on a healthy room seen
// through two stale doors. Root incident (2026-07-26): the pi monitor knocked
// on production room "test", got two same-gkey HOMEs whose rosters shared no
// CURRENT instance id (the Motos had bounced through the DO-wedge era), and
// wedged forever at the pick-one modal — a headless client parked there is
// indistinguishable from a dead door.
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const { Seat } = globalThis.GifOS.mesh;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

// clusterForkSamples is pure (statics only) — drive it without a full Seat.
const cluster = (samples) => Seat.prototype.clusterForkSamples.call(null, samples);
const R = (...ids) => ids.map((v, i) => ({ k: i, v }));

// --- FALSE-FORK 1: S1 freshness lapse — each greeter's roster is just itself.
// One room, two doors, each saying "I can't vouch for my row right now."
// A blind roster is ignorance, not evidence of a separate room.
{
  const opts = cluster([
    { gkey: 'g1', gateway: 'motoA', roster: R('motoA'), stage: [], stadium: [], faces: ['motoA'] },
    { gkey: 'g1', gateway: 'motoB', roster: R('motoB'), stage: [], stadium: [], faces: ['motoB'] },
  ]);
  check('freshness lapse (roster = self only) is ONE room, not a fork', opts.length === 1, opts.map((o) => o.n));
}

// --- FALSE-FORK 2: instance-id churn — both phones reloaded, each roster still
// carries the other's DEAD old id. Rosters disjoint, but the app-layer Stadium
// faces (display identities, stable across reload) overlap ⇒ same room.
// This is the incident shape: both modal options named both Motos.
{
  const opts = cluster([
    { gkey: 'g1', gateway: 'A2', roster: R('A2', 'B1'), stage: [], stadium: ['Moto G', 'Moto E'], faces: ['A2', 'B1'] },
    { gkey: 'g1', gateway: 'B2', roster: R('B2', 'A1'), stage: [], stadium: ['Moto E', 'Moto G'], faces: ['B2', 'A1'] },
  ]);
  check('id churn with overlapping Stadium faces is ONE room, not a fork', opts.length === 1, opts.map((o) => o.n));
}

// --- FALSE-FORK 3: one stale door, one rich door — the blind rule must merge
// a self-only sample into an evidenced same-gkey cluster regardless of order.
{
  const a = cluster([
    { gkey: 'g1', gateway: 'A', roster: R('A', 'C', 'D'), stage: [], stadium: [], faces: ['A', 'C', 'D'] },
    { gkey: 'g1', gateway: 'B', roster: R('B'), stage: [], stadium: [], faces: ['B'] },
  ]);
  const b = cluster([
    { gkey: 'g1', gateway: 'B', roster: R('B'), stage: [], stadium: [], faces: ['B'] },
    { gkey: 'g1', gateway: 'A', roster: R('A', 'C', 'D'), stage: [], stadium: [], faces: ['A', 'C', 'D'] },
  ]);
  check('blind door merges into evidenced same-key cluster (both orders)', a.length === 1 && b.length === 1);
}

// --- TRUE FORK 1: multi-genesis (fragment founding) — different gkeys NEVER
// merge, whatever the rosters or faces say. The crypto key IS the room.
{
  const opts = cluster([
    { gkey: 'g1', gateway: 'A', roster: R('A', 'B'), stage: [], stadium: ['x', 'y'], faces: ['A', 'B'] },
    { gkey: 'g2', gateway: 'C', roster: R('C'), stage: [], stadium: ['x', 'y'], faces: ['C'] },
  ]);
  check('different genesis keys stay TWO options (real fork preserved)', opts.length === 2);
}

// --- TRUE FORK 2: same-key torn halves with SUBSTANCE — each half has third-
// party roster evidence and no shared face ⇒ still the human pick-one.
{
  const opts = cluster([
    { gkey: 'g1', gateway: 'A', roster: R('A', 'C'), stage: [], stadium: ['alice', 'carol'], faces: ['A', 'C'] },
    { gkey: 'g1', gateway: 'B', roster: R('B', 'D'), stage: [], stadium: ['bob', 'dave'], faces: ['B', 'D'] },
  ]);
  check('same-key halves with disjoint evidence stay TWO options (real tear preserved)', opts.length === 2);
}

// --- TRUE MERGE (pre-existing behavior): same gkey + overlapping rosters.
{
  const opts = cluster([
    { gkey: 'g1', gateway: 'A', roster: R('A', 'B'), stage: [], stadium: [], faces: ['A', 'B'] },
    { gkey: 'g1', gateway: 'B', roster: R('B', 'C'), stage: [], stadium: [], faces: ['B', 'C'] },
  ]);
  check('overlapping rosters still merge to ONE option', opts.length === 1);
}

// --- BRIDGE: a later sample overlapping two earlier disjoint clusters must
// pull them together (fixpoint, not first-match-only).
{
  const opts = cluster([
    { gkey: 'g1', gateway: 'A', roster: R('A', 'X'), stage: [], stadium: [], faces: ['A', 'X'] },
    { gkey: 'g1', gateway: 'B', roster: R('B', 'Y'), stage: [], stadium: [], faces: ['B', 'Y'] },
    { gkey: 'g1', gateway: 'C', roster: R('C', 'X', 'Y'), stage: [], stadium: [], faces: ['C', 'X', 'Y'] },
  ]);
  check('a bridging third sample collapses two clusters to ONE (fixpoint)', opts.length === 1);
}

process.exit(fails ? 1 : 0);
