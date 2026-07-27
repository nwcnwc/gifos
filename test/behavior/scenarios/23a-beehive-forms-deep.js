'use strict';
// USE CASE 23 — the beehive. Pattern (a): seven people at C=2 grow a TREE.
// The K-sweep doctrine live in the battery: at C=2 a section is 2×2, so seven
// browsers exercise MULTI-SECTION structure (Section 1 + deep sections) that
// would need 26+ people at C=5. The laws: everyone seats, the room converges
// across section boundaries (gossip rides the tree), the structure is ONE
// tree with ≥2 sections and no dup coords, and a LATE knock still seats
// through sponsor forwarding into the deep room.
const { scenario } = require('../lib/cast');

const rc = (s) => { const m = /^(.*)\/(\d+)\.(\d+)$/.exec(s.coord || ''); return m ? { pc: m[1], r: +m[2], i: +m[3] } : null; };

scenario('23a-beehive-forms-deep', {
  ana: { profile: 'desktop', meshC: 2 }, bo: { profile: 'phone', meshC: 2 },
  cai: { profile: 'phone', meshC: 2 }, dee: { profile: 'desktop', meshC: 2 },
  eli: { profile: 'phone', meshC: 2 }, fio: { profile: 'phone', meshC: 2 },
  gil: { profile: 'phone', meshC: 2 },
  hana: { profile: 'phone', meshC: 2 }, // the late knock
}, async (cast, check) => {
  const seven = ['ana', 'bo', 'cai', 'dee', 'eli', 'fio', 'gil'];
  await cast.joinAll({ roles: seven });
  await check.converged(7, { within: 180, roles: seven });

  await check.until('the hive is MULTI-SECTION (≥2 distinct section paths, all seated)', async () => {
    const pcs = new Set();
    for (const r of seven) { const c = rc(await cast.get(r).state()); if (!c) return false; pcs.add(c.pc); }
    return pcs.size >= 2;
  }, { within: 120 });
  await check.oneTree(7, { via: 'ana', desc: 'one tree across sections, no dup coords' });

  // The deep-room door: a latecomer knocks into a tree, not a row.
  await cast.get('hana').join(cast.room);
  await check.seated('hana', { within: 60, desc: 'the late knock seats into the tree ≤60s (sponsor forwarding)' });
  await check.converged(8, { within: 150 });
  await check.oneTree(8, { via: 'dee', desc: 'eight in one tree' });
}, { timeoutMin: 18 });
