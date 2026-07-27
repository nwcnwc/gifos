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

  // short dropout — the corner by the Hendersons' hedge. The app's soft
  // window is ~12-18s (the starve edge governs beyond it), so "short" means
  // the blip law: 12s, never a blink.
  await maya.cmd('radio off');
  await check.steady('short dropout stays soft: Dana holds 3 through the 12s blip', async () => {
    const s = await cast.get('dana').state();
    return s.participants === 3;
  }, { for: 12, every: 2, allow: 1 });
  await maya.cmd('radio on');
  await check.converged(3, { desc: 'family whole again after the short dropout', within: 90 });
  const seatAfterShort = (await maya.state()).coord;
  check.assert(seatAfterShort === seatBefore, 'a 25s dropout never cost Maya her seat', seatBefore + ' → ' + seatAfterShort);

  // the long dead zone — since the D5 starve edge (2026-07-27), a fully
  // dark transport is honestly confirmed at ~15-20s; the law is the early
  // hold + a fast automatic reunion, never a zombie tile
  // this zone follows a heal — a YOUNG pair's honest drop can come ~3-8s in
  // (close event + fast D5 confirm); stillness is only guaranteed on settled
  // pairs (the short-blip leg above). Here the law is the RECOVERY.
  await maya.cmd('radio off');
  await cast.sleep(70, 'the long dead zone — an honest early drop may follow');
  await maya.cmd('radio on');
  await check.converged(3, { desc: 'Maya self-heals out of the long dead zone', within: 180 });
  await check.oneTree(3, { via: 'dana' });
});
