'use strict';
// USE CASE 17 — language tutoring. Pattern (b): the losing charger.
// Billie is plugged in but the level keeps FALLING (the overnight-Moto case):
// emergency tier must engage while plugged in, hold without flapping, and
// release the moment the charger starts winning again.
const { scenario } = require('../lib/cast');

scenario('17b-tutoring-charger-loser', {
  mika: { profile: 'desktop' },
  billie: { profile: 'phone', battery: '0.5,drain' },
}, async (cast, check) => {
  const billie = cast.get('billie');
  await cast.joinAll();
  await check.converged(2);

  await check.until('the losing charger reads emergency (drain tier 3, while PLUGGED IN)', async () => {
    const s = await billie.state();
    return s.pow && s.pow.drain === 3;
  }, { within: 30 });
  await check.steady('emergency holds steadily for the lesson (no tier flap, lesson unharmed)', async () => {
    const s = await billie.state(), sm = await cast.get('mika').state();
    return s.pow.drain === 3 && sm.participants === 2;
  }, { for: 60, every: 5, allow: 1 });

  await billie.cmd('battery 0.55,charging'); // the charger wins (level rising)
  await check.until('a rising level releases the emergency', async () => {
    const s = await billie.state();
    return s.pow && s.pow.drain === 0 && s.battTier === 0;
  }, { within: 20 });
  await check.steady('no flap at the boundary after release', async () => (await billie.state()).pow.drain === 0, { for: 30, allow: 0 });
  await check.converged(2, { desc: 'lesson steady end to end' });
});
