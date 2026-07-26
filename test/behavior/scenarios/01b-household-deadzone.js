'use strict';
// USE CASE 1 — the busy household. Pattern (b): Maya's dead zone.
// A 25s dropout must stay SOFT (nobody loses her seat, tile returns); a 70s
// dropout is still under the vouch cap, so the family must HOLD her honestly
// and she must come back with no human action.
const { scenario } = require('../lib/cast');

scenario('01b-household-deadzone', {
  dana: { profile: 'desktop' },
  maya: { profile: 'phone', battery: '0.62' },
  pops: { profile: 'phone' },
}, async (cast, check) => {
  const maya = cast.get('maya');
  await cast.joinAll();
  await check.converged(3);
  const seatBefore = (await maya.state()).coord;

  // short dropout — the corner by the Hendersons' hedge
  await maya.cmd('radio off');
  await check.steady('short dropout stays soft: Dana holds 3 the whole 25s', async () => {
    const s = await cast.get('dana').state();
    return s.participants === 3;
  }, { for: 25, allow: 1 });
  await maya.cmd('radio on');
  await check.converged(3, { desc: 'family whole again after the short dropout', within: 90 });
  const seatAfterShort = (await maya.state()).coord;
  check.assert(seatAfterShort === seatBefore, 'a 25s dropout never cost Maya her seat', seatBefore + ' → ' + seatAfterShort);

  // the long dead zone — under the cap, so she is HELD, not dropped
  await maya.cmd('radio off');
  await check.steady('70s dead zone: family holds Maya (no premature drop, no fake leave)', async () => {
    const sd = await cast.get('dana').state(), sp = await cast.get('pops').state();
    return sd.participants === 3 && sp.participants === 3;
  }, { for: 70, allow: 2 });
  await maya.cmd('radio on');
  await check.converged(3, { desc: 'Maya self-heals out of the long dead zone', within: 180 });
  await check.oneTree(3, { via: 'dana' });
});
