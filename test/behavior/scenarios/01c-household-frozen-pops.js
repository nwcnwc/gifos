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
  // Since the D5 starve edge (2026-07-27): a fully frozen phone is total
  // silence — the room holds the first beats, then honestly confirms and
  // drops (no zombie tile); the law is the RETURN: automatic, clean, fast.
  await check.steady('freeze: the first 14s never blink', async () => {
    const s = await cast.get('dana').state();
    return s.participants === 3;
  }, { for: 14, every: 2, allow: 1 });
  await cast.sleep(46, 'frozen on — an honest D5 drop may follow');

  await pops.cmd('thaw 155'); // return with a >150s backdated gap → self-heal fires
  await check.until('resume self-heal re-seats Pops (no human action)', async () => {
    const s = await pops.state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 180 }); // multi-stage heal budget (cf. 08c)
  await check.converged(3, { desc: 'household converges to 3, zero dups' });
  await check.oneTree(3, { via: 'maya', within: 240, desc: 'census: one clean tree (corpse refs gone ≤cap)' });
});
