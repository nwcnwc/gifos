'use strict';
// USE CASE 13 — the church small group. Pattern (b): the closing prayer.
// Everyone unmutes at once, 30 seconds of simultaneous audio, then the whole
// group departs within seconds of each other. Simultaneous full-mic must not
// destabilize a small room, and the near-simultaneous departure must not
// strand or wedge anyone on the way out.
const { scenario } = require('../lib/cast');

scenario('13b-smallgroup-unison', {
  ann: { profile: 'desktop' },
  ruth: { profile: 'phone' },
  sam: { profile: 'phone' },
  meg: { profile: 'phone' },
  joe: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(5);

  for (const a of cast.all()) await a.cmd('mic on');
  await check.steady('30s of everyone speaking at once: the room holds', async () => {
    const s = await cast.get('ann').state();
    return s.participants === 5 && s.dups === 0;
  }, { for: 30, every: 3, allow: 0 });

  // amen — coats on, near-simultaneous departure (one phone just pockets dark)
  await Promise.all([
    cast.get('ruth').cmd('leave'),
    cast.get('sam').cmd('leave'),
    cast.get('meg').cmd('leave'),
    cast.get('joe').cmd('die'),
  ]);
  await check.until('the departures leave Ann a clean solo room (no stragglers)', async () => {
    const s = await cast.get('ann').state();
    return s.participants === 1 && (s.roster || []).length === 0;
  }, { within: 240 });
  await cast.get('ann').cmd('leave');
  check.assert(true, 'the group departed without a wedge');
});
