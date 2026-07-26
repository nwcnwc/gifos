'use strict';
// USE CASE 2 — boss + reports. Pattern (c): Noor frozen for 6 REAL minutes
// (the S10 incident, real clock, FULL tier). The zombie tile must go at the
// vouch cap; the seat heals; Noor's return self-heals via the real >150s gap
// (no backdating — the freeze itself is long enough).
const { scenario } = require('../lib/cast');

scenario('02c-boss-frozen-report', {
  priya: { profile: 'desktop', adminPw: 'weekly-sync-pw' },
  sam: { profile: 'phone' },
  noor: { profile: 'phone', battery: '0.55' },
}, async (cast, check) => {
  const noor = cast.get('noor');
  await cast.joinAll();
  await check.converged(3);

  await noor.cmd('freeze');
  await check.until('the zombie tile goes at the vouch cap (≤180s + pulse slack)', async () => {
    const s = await cast.get('priya').state();
    return s.participants === 2 && !(s.roster || []).some((r) => r.name === 'Noor' && r.conn);
  }, { within: 240 });
  await check.steady('the healed room is stable at 2 while Noor is gone', async () => {
    const sp = await cast.get('priya').state(), ss = await cast.get('sam').state();
    return sp.participants === 2 && ss.participants === 2;
  }, { for: 60, allow: 1 });

  await noor.cmd('thaw'); // REAL gap (6+ min) — the self-heal must fire on its own clock
  await check.until('Noor self-heals back in (reload → re-seat)', async () => {
    const s = await noor.state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 120 });
  await check.converged(3, { desc: 'the sync is whole again' });
  await check.oneTree(3, { via: 'sam', within: 240 });
}, { timeoutMin: 25 });
