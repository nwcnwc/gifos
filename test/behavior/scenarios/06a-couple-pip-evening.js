'use strict';
// USE CASE 6 — the long-distance couple, the every-evening open line.
// Pattern (a): both multitask in long hidden stretches with brief mutual
// returns. At N=2 the one remote IS the PiP float source (exempt from
// parking), so the laws here are: presence never blinks, the pair survives
// double-hidden, and video restores instantly on every return.
const { scenario } = require('../lib/cast');

scenario('06a-couple-pip-evening', {
  ju: { profile: 'phone', battery: '0.7' },
  aki: { profile: 'phone', battery: '0.55' },
}, async (cast, check) => {
  const ju = cast.get('ju'), aki = cast.get('aki');
  await cast.joinAll();
  await check.converged(2);

  for (let round = 1; round <= 3; round++) {
    await ju.cmd('hide');                    // cooking
    await cast.sleep(20);
    await aki.cmd('hide');                   // BOTH away — the line stays open
    await check.steady('round ' + round + ': double-hidden, the line never drops', async () => {
      const sj = await ju.state(), sa = await aki.state();
      return sj.participants === 2 && sa.participants === 2;
    }, { for: 40, allow: 1 });
    await aki.cmd('show');
    await ju.cmd('show');
    await check.until('round ' + round + ': both back, video live both ways', async () => {
      const sj = await ju.state(), sa = await aki.state();
      return sj.liveVid >= 1 && sa.liveVid >= 1;
    }, { within: 30 });
  }
  await check.converged(2, { desc: 'the evening ends with a clean pair' });
  await check.oneTree(2, { via: 'ju' });
});
