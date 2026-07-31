'use strict';
// USE CASE 10 — the job interview. Pattern (a): the candidate at 23%.
// Devi arrives already in emergency tier. She must seat fine, send a live
// usable tile at the floor quality, and the tier must follow the level
// deterministically as it wobbles across the 25% boundary. (If boundary
// flapping proves noisy in real use, hysteresis is a DESIGN change to raise
// with Nathan — this script asserts the current law, not a wish.)
const { scenario } = require('../lib/cast');

scenario('10a-interview-low-battery', {
  hunter: { profile: 'desktop' },
  scout: { profile: 'desktop', observe: true },
  devi: { profile: 'phone', battery: '0.23' },
}, async (cast, check) => {
  const devi = cast.get('devi');
  await cast.joinAll();
  await check.converged(3);
  check.assert((await devi.state()).battTier === 3, 'Devi arrives in tier 3 (23%, on battery)');

  await check.until("the interviewer sees Devi's tile LIVE despite tier 3", async () => {
    const s = await cast.get('hunter').state();
    const r = (s.roster || []).find((x) => x.name === 'Devi');
    return r && r.conn && r.vid;
  }, { within: 60 });

  // The wobble: cross THE boundary and back — deterministic, room unharmed.
  // The boundary moved (2026-07-31). It used to sit at 25%, so 23 ↔ 26 crossed
  // it. On-battery tiers 1 and 2 were being swallowed whole by the IS_MOBILE
  // floor of 2, which made "on battery" mean nothing on a phone between 25% and
  // 100% and left 144p reachable only in a sub-25% emergency; unplugged is now
  // tier 2 and half a battery is tier 3, so the only boundary a phone has is at
  // 50%. 23 ↔ 26 is now entirely inside tier 3 and no longer wobbles anything.
  // Same assertion, same intent — the tier tracks the level in BOTH directions,
  // promptly, without disturbing the call — probed at the boundary that exists.
  await devi.cmd('battery 60');
  await check.until('60% → tier 2', async () => (await devi.state()).battTier === 2, { within: 15 });
  await devi.cmd('battery 23');
  await check.until('23% → tier 3', async () => (await devi.state()).battTier === 3, { within: 15 });
  await check.steady('the wobble never disturbs the interview', async () => {
    const s = await cast.get('hunter').state();
    const r = (s.roster || []).find((x) => x.name === 'Devi');
    return s.participants === 3 && r && r.conn;
  }, { for: 30, allow: 1 });
  await check.converged(3, { desc: 'interview steady at the end' });
});
