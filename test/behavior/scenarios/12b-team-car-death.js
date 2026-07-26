'use strict';
// USE CASE 12 — the sports team. Pattern (b): Ferg's phone dies at 1%.
// An abrupt vanish (D5) from a shared hotspot: the seat must free, the tile
// must go, and — the corpse-echo residual (#3), measured strictly — the
// occupancy must NOT flap in the two minutes after. Petra (same egress IP)
// must be untouched.
const { scenario } = require('../lib/cast');

scenario('12b-team-car-death', {
  cap: { profile: 'phone' },
  jo: { profile: 'phone' },
  min: { profile: 'phone' },
  petra: { profile: 'phone' },
  ferg: { profile: 'phone', battery: '0.03' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(5);
  await cast.sleep(20, 'the call is underway; Ferg is at 3% and fading');

  await cast.get('ferg').cmd('die');
  await check.until('D5: the room heals to 4, no Ferg ghost', async () => {
    const sts = await Promise.all(['cap', 'jo', 'min', 'petra'].map((r) => cast.get(r).state()));
    return sts.every((s) => s.participants === 4 && !(s.roster || []).some((x) => x.name === 'Ferg'));
  }, { within: 240 });

  // the corpse-echo window: 120s, zero flap allowed — this is the open
  // D-class residual's gate; a red here is the residual, documented live
  await check.steady('no corpse-echo occ flap for 120s after the vanish', async () => {
    const sts = await Promise.all(['cap', 'jo', 'min', 'petra'].map((r) => cast.get(r).state()));
    return sts.every((s) => s.participants === 4 && s.dups === 0);
  }, { for: 120, every: 3, allow: 0 });

  await check.until('Petra (same hotspot) was never disturbed', async () => {
    const s = await cast.get('petra').state();
    return !!s.coord && s.participants === 4;
  }, { within: 10 });
  await check.oneTree(4, { via: 'cap', within: 120 });
}, { timeoutMin: 15 });
