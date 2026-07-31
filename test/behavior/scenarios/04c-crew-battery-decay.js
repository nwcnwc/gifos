'use strict';
// USE CASE 4 — the emergency-response crew. Pattern (c): the hour of decay.
// Kofi's battery slides 62→45→22 (tiers 2 then 3); Ines's charger is losing
// ground (emergency tier while plugged in). Tiers must fire and release, and
// the room must never wobble because of them.
const { scenario } = require('../lib/cast');

scenario('04c-crew-battery-decay', {
  marta: { profile: 'desktop' },
  ines: { profile: 'phone', battery: '0.5' },
  kofi: { profile: 'phone', battery: '0.62' },
}, async (cast, check) => {
  const kofi = cast.get('kofi'), ines = cast.get('ines');
  await cast.joinAll();
  await check.converged(3);
  // The on-battery mapping changed 2026-07-31: tiers 1 and 2 were swallowed by
  // the IS_MOBILE floor of 2, so "on battery" bought a phone nothing between 25%
  // and 100% and 144p was unreachable outside a sub-25% emergency. Unplugged is
  // now tier 2, half a battery tier 3. The scenario's point is unchanged — the
  // tier DECAYS with the level and the room never notices — so the probes move
  // with the boundary rather than pinning the old constants.
  check.assert((await kofi.state()).battTier === 2, 'Kofi at 62% on battery: tier 2 (phone floor)');

  await kofi.cmd('battery 45');
  await check.until('45% → tier 3 (half a battery)', async () => (await kofi.state()).battTier === 3, { within: 15 });
  await check.steady('the deeper tier costs the ROOM nothing', async () => (await cast.get('marta').state()).participants === 3, { for: 20, allow: 1 });

  await kofi.cmd('battery 22');
  await check.until('22% → tier 3 (emergency)', async () => (await kofi.state()).battTier === 3, { within: 15 });

  await ines.cmd('battery 0.5,drain'); // plugged in, losing anyway — the overnight-Moto case
  await check.until("Ines's losing charger → drain tier 3 while PLUGGED IN", async () => {
    const s = await ines.state();
    return s.pow && s.pow.drain === 3;
  }, { within: 20 });

  await check.steady('both emergencies cost the room nothing (Marta holds 3)', async () => {
    const s = await cast.get('marta').state();
    return s.participants === 3;
  }, { for: 30, allow: 1 });

  await kofi.cmd('battery 40,charging'); // found a truck outlet
  await check.until('a real charger releases Kofi to tier 0', async () => (await kofi.state()).battTier === 0, { within: 15 });
  await ines.cmd('battery 0.55,charging'); // her charger wins again (level rising)
  await check.until("Ines's drain clears when the level rises", async () => {
    const s = await ines.state();
    return s.pow && s.pow.drain === 0;
  }, { within: 20 });
  await check.converged(3, { desc: 'crew clean after the battery hour' });
});
