'use strict';
// USE CASE 1 — the busy household. Pattern (c): Pops's phone freezes.
// The recliner nap: Android freezes the tab (JS fully stops). On return the
// resume self-heal must auto-rejoin him — reload, re-seat, zero dups — with
// nobody touching anything.
const { scenario } = require('../lib/cast');

scenario('01c-household-frozen-pops', {
  dana: { profile: 'desktop' },
  maya: { profile: 'phone' },
  pops: { profile: 'phone', battery: '0.9,drain' },
}, async (cast, check) => {
  const pops = cast.get('pops');
  await cast.joinAll();
  await check.converged(3);

  await pops.cmd('freeze');
  await check.steady('60s freeze: the family holds Pops (under the cap)', async () => {
    const s = await cast.get('dana').state();
    return s.participants === 3;
  }, { for: 60, allow: 2 });

  await pops.cmd('thaw 155'); // return with a >150s backdated gap → self-heal fires
  await check.until('resume self-heal re-seats Pops (<45s, no human action)', async () => {
    const s = await pops.state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 45 });
  await check.converged(3, { desc: 'household converges to 3, zero dups' });
  await check.oneTree(3, { via: 'maya', within: 240, desc: 'census: one clean tree (corpse refs gone ≤cap)' });
});
