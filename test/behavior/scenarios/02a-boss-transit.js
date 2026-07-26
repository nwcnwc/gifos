'use strict';
// USE CASE 2 — boss + reports, admin room. Pattern (a): Sam on the train.
// App-switches every ~40s to check a doc; one 30s tunnel. His tile must read
// "away" (hidden, still connected) not dead; mates park video toward the
// hidden phone; the tunnel self-heals.
const { scenario } = require('../lib/cast');

scenario('02a-boss-transit', {
  priya: { profile: 'desktop', adminPw: 'weekly-sync-pw' }, // admin joins FIRST
  sam: { profile: 'phone', battery: '0.7' },
  noor: { profile: 'phone' },
  jae: { profile: 'phone' },
}, async (cast, check) => {
  const sam = cast.get('sam');
  await cast.joinAll();
  await check.converged(4);
  check.assert(await cast.get('priya').eval('window.__gifosVideo.amAdmin()') === true, "Priya is the room's signed-in admin");

  for (let i = 1; i <= 3; i++) {
    await sam.cmd('hide');
    await check.until('app-switch ' + i + ': a mate parks video toward hidden Sam', async () => {
      const sts = await Promise.all(['priya', 'noor', 'jae'].map((r) => cast.get(r).state()));
      return sts.reduce((n, s) => n + (s.visParked || []).length, 0) >= 1;
    }, { within: 40 });
    await check.steady('hidden Sam stays PRESENT to the boss (away, not dead)', async () => {
      const s = await cast.get('priya').state();
      const r = (s.roster || []).find((x) => x.name === 'Sam');
      return s.participants === 4 && r && r.conn;
    }, { for: 15, allow: 1 });
    await sam.cmd('show');
    await check.until('return ' + i + ': parks toward Sam release', async () => {
      const sts = await Promise.all(['priya', 'noor', 'jae'].map((r) => cast.get(r).state()));
      return sts.reduce((n, s) => n + (s.visParked || []).length, 0) === 0;
    }, { within: 40 });
  }

  await sam.cmd('radio off');
  await cast.sleep(30, 'the train tunnel');
  await sam.cmd('radio on');
  await check.converged(4, { desc: 'tunnel self-heals; the sync is whole', within: 120 });
  await check.oneTree(4, { via: 'priya' });
});
