'use strict';
// USE CASE 6 — the couple. Pattern (c): Aki's commute home.
// Hidden in a pocket, two tunnels, one short REAL freeze (25s — no beat-gap,
// so NO drastic reload: the self-heal must stay proportionate), then home
// wifi. At N=2 the sacred law is the JOINING-VEIL/honest-roster pair: Ju must
// NEVER see a fake "everyone left" while Aki is under the cap.
const { scenario } = require('../lib/cast');

scenario('06c-couple-transit', {
  ju: { profile: 'phone' },
  aki: { profile: 'phone', battery: '0.45' },
}, async (cast, check) => {
  const ju = cast.get('ju'), aki = cast.get('aki');
  await cast.joinAll();
  await check.converged(2);

  await aki.cmd('hide'); // phone in the pocket, audio riding along
  const seatBefore = (await aki.state()).coord;

  await aki.cmd('radio off');
  await check.steady('tunnel 1 (30s): Ju never sees an empty room', async () => (await ju.state()).participants === 2, { for: 30, allow: 1 });
  await aki.cmd('radio on');
  await check.converged(2, { desc: 'out of tunnel 1', within: 90 });

  await aki.cmd('radio off');
  await check.steady('tunnel 2 (80s, under cap): Aki is HELD, not dropped', async () => (await ju.state()).participants === 2, { for: 80, allow: 2 });
  await aki.cmd('radio on');
  await check.converged(2, { desc: 'out of tunnel 2', within: 120 });

  // transfer at the interchange: a SHORT freeze — real 25s gap, under 150s
  await aki.cmd('freeze');
  await cast.sleep(25);
  await aki.cmd('thaw'); // real gap only — the drastic reload must stay holstered
  await check.converged(2, { desc: 'short freeze recovers in place', within: 60 });
  const seatAfter = (await aki.state()).coord;
  check.assert(seatAfter === seatBefore, 'proportionate healing: the short freeze never cost the seat (no reload)',
    seatBefore + ' → ' + seatAfter);

  await aki.cmd('show'); // home
  await check.until('home: video live both ways', async () => {
    const sj = await ju.state(), sa = await aki.state();
    return sj.liveVid >= 1 && sa.liveVid >= 1;
  }, { within: 30 });
  await check.oneTree(2, { via: 'ju' });
});
