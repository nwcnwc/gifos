'use strict';
// USE CASE 8 — family tech support. Pattern (c): Gigi's tab frozen 4 REAL
// minutes (FULL tier). The complete S10 arc on the real clock: corpse removal
// at the vouch cap, resume self-heal on return, re-seat, and NO occ-flap
// echoes in the minute after (the corpse-echo residual, measured strictly).
const { scenario } = require('../lib/cast');

scenario('08c-techsupport-frozen-gigi', {
  kai: { profile: 'desktop' },
  rosa: { profile: 'phone' },
  gigi: { profile: 'phone', battery: '0.6' },
}, async (cast, check) => {
  const gigi = cast.get('gigi');
  await cast.joinAll();
  await check.converged(3);

  await gigi.cmd('freeze');
  await check.until('corpse removal at the vouch cap', async () => {
    const sk = await cast.get('kai').state(), sr = await cast.get('rosa').state();
    return sk.participants === 2 && sr.participants === 2;
  }, { within: 240 });
  await cast.sleep(60, 'Gigi still frozen; the healed room must be quiet');

  await gigi.cmd('thaw'); // real gap ≈ 4-5 min > 150s — self-heal on its own clock
  await check.until('return: the self-heal re-seats Gigi', async () => {
    const s = await gigi.state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 180 }); // reload + rejoin + possibly one starve-heal cycle — a 5-min-frozen phone's honest budget
  await check.converged(3, { desc: 'family of 3 again' });

  // the corpse-echo measurement: 60s with ZERO occupancy flap allowed
  await check.steady('no occ-flap echoes in the minute after the return', async () => {
    const sts = await Promise.all(cast.all().map((a) => a.state()));
    return sts.every((s) => s.participants === 3 && s.dups === 0);
  }, { for: 60, every: 3, allow: 0 });
  await check.oneTree(3, { via: 'kai', within: 240 });
}, { timeoutMin: 25 });
