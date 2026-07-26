'use strict';
// USE CASE 13 — the church small group. Pattern (a): the long quiet hour.
// Four phones on knees and coffee tables all park (staggered); the discussion
// carries on. Four simultaneous parked phones must be STABLE — no flap storm,
// no audio loss — and each poke must restore independently.
const { scenario } = require('../lib/cast');

scenario('13a-smallgroup-parked-hour', {
  ann: { profile: 'desktop' },   // Pastor Ann, at the desk
  ruth: { profile: 'phone' },
  sam: { profile: 'phone', battery: '0.5' },
  meg: { profile: 'phone' },
  joe: { profile: 'phone', battery: '0.4' },
}, async (cast, check) => {
  const phones = ['ruth', 'sam', 'meg', 'joe'];
  await cast.joinAll();
  await check.converged(5);

  for (const r of phones) { await cast.get(r).cmd('idlemin 4'); await cast.sleep(5); }
  await check.until('all four phones reach the parked floor', async () => {
    const sts = await Promise.all(phones.map((r) => cast.get(r).state()));
    return sts.every((s) => s.pow && s.pow.idle === 3);
  }, { within: 60 });

  await check.steady('the parked hour is STABLE (presence, no flap storm)', async () => {
    const s = await cast.get('ann').state();
    return s.participants === 5 && s.dups === 0 &&
      (s.roster || []).filter((r) => r.conn).length === 4;
  }, { for: 120, every: 5, allow: 2 });

  // two get poked by their turn to read
  await cast.get('ruth').cmd('poke');
  await cast.get('meg').cmd('poke');
  await check.until('Ruth and Meg wake independently; Sam and Joe stay parked', async () => {
    const [r, s, m, j] = await Promise.all(phones.map((x) => cast.get(x).state()));
    return r.pow.idle === 0 && m.pow.idle === 0 && s.pow.idle === 3 && j.pow.idle === 3;
  }, { within: 30 });
  await check.converged(5, { desc: 'group whole through the quiet hour' });
});
