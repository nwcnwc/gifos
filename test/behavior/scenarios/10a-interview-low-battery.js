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

  // the wobble: 23 ↔ 26 across the boundary — deterministic, room unharmed
  await devi.cmd('battery 26');
  await check.until('26% → tier 2', async () => (await devi.state()).battTier === 2, { within: 15 });
  await devi.cmd('battery 23');
  await check.until('23% → tier 3', async () => (await devi.state()).battTier === 3, { within: 15 });
  await check.steady('the wobble never disturbs the interview', async () => {
    const s = await cast.get('hunter').state();
    const r = (s.roster || []).find((x) => x.name === 'Devi');
    return s.participants === 3 && r && r.conn;
  }, { for: 30, allow: 1 });
  await check.converged(3, { desc: 'interview steady at the end' });
});
