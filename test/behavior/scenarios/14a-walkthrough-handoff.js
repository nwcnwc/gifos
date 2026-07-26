'use strict';
// USE CASE 14 — the contractor walkthrough. Pattern (a): the basement.
// Faye's phone-tour hits the dead spot WHILE Gil is joining — the door must
// not depend on any one member, and the tour must survive the handoff.
const { scenario } = require('../lib/cast');

scenario('14a-walkthrough-handoff', {
  faye: { profile: 'phone', battery: '0.65' },
  bill: { profile: 'desktop' },
  gil: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll({ roles: ['faye', 'bill'] });
  await check.converged(2, { roles: ['faye', 'bill'] });
  await cast.sleep(15, 'the tour: kitchen, hallway…');

  await cast.get('faye').cmd('radio off'); // …the basement
  await cast.sleep(10);
  await cast.get('gil').join(cast.room);   // Gil dials in from work RIGHT NOW
  check.assert(await cast.get('gil').waitSeat(60), "Gil joins while Faye is in the dead spot (the door didn't need her)");
  await check.until('Bill and Gil see each other immediately', async () => {
    const sb = await cast.get('bill').state();
    return (sb.roster || []).some((r) => r.name === 'Gil' && r.conn);
  }, { within: 45 });

  await cast.sleep(10, 'Faye still in the basement (35s total)');
  await cast.get('faye').cmd('radio on');  // back up the stairs
  await check.converged(3, { desc: 'the tour survives the handoff — all three whole', within: 150 });
  await check.oneTree(3, { via: 'bill' });
});
