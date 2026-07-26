'use strict';
// USE CASE 15 — the new-baby share. Pattern (b): Vera watches the crib.
// Her phone is propped and untouched for 10 minutes (compressed): the phone
// PARKS (her sending cost drops) but the watched feed must keep flowing TO
// her — parking is about cost, never about taking the baby away. The poke
// when the baby stirs restores everything.
const { scenario } = require('../lib/cast');

scenario('15b-baby-propped-sleep', {
  nadia: { profile: 'phone' },  // camera on the crib
  vera: { profile: 'phone', battery: '0.45' },
  lou: { profile: 'desktop' },
}, async (cast, check) => {
  const vera = cast.get('vera');
  await cast.joinAll();
  await check.converged(3);
  await check.until('Vera is watching the crib feed', async () => (await vera.state()).liveVid >= 1, { within: 45 });

  await vera.cmd('idlemin 4'); // propped, untouched
  await check.until('the propped phone parks (idle floor engages)', async () => (await vera.state()).pow.idle === 3, { within: 30 });

  await check.steady('parked, the crib feed KEEPS FLOWING to Vera', async () => {
    const s = await vera.state();
    return s.pow.idle === 3 && s.liveVid >= 1 && s.participants === 3;
  }, { for: 120, every: 5, allow: 2 });

  await vera.cmd('poke'); // the baby stirs — she grabs the phone
  await check.until('the poke restores everything', async () => {
    const s = await vera.state();
    return s.pow.idle === 0 && s.liveVid >= 1;
  }, { within: 20 });
  await check.converged(3, { desc: 'family whole; nobody missed the moment' });
});
