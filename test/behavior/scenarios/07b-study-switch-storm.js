'use strict';
// USE CASE 7 — the study group. Pattern (b): the app-switch storm.
// Everyone hides/shows on their own 20-40s rhythm for ~4 minutes — the whole
// room is phones being phones. The park/unpark churn must not flap presence,
// and the room must converge perfectly the moment the storm ends.
const { scenario } = require('../lib/cast');

scenario('07b-study-switch-storm', {
  lena: { profile: 'desktop' },
  omar: { profile: 'phone' },
  tess: { profile: 'phone' },
  vik: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(4);

  // deterministic personal rhythms (secs hidden, secs visible)
  const rhythm = { omar: [20, 12], tess: [28, 10], vik: [36, 14] };
  const stormEnd = Date.now() + 240000;
  const storms = Object.entries(rhythm).map(async ([role, [h, v]]) => {
    const a = cast.get(role);
    while (Date.now() < stormEnd) {
      await a.cmd('hide');
      await new Promise((r) => setTimeout(r, h * 1000));
      await a.cmd('show');
      await new Promise((r) => setTimeout(r, v * 1000));
    }
    await a.cmd('show');
  });

  const held = check.steady('presence never flaps through the 4-minute storm', async () => {
    const s = await cast.get('lena').state();
    return s.participants === 4 && s.dups === 0;
  }, { for: 240, every: 5, allow: 3 });
  await Promise.all([...storms, held]);

  await check.converged(4, { desc: 'the storm ends; the room is instantly whole', within: 60 });
  await check.until('no park residue once everyone is visible', async () => {
    const sts = await Promise.all(cast.all().map((a) => a.state()));
    return sts.reduce((n, s) => n + (s.visParked || []).length, 0) === 0;
  }, { within: 60 });
  await check.oneTree(4, { via: 'lena' });
}, { timeoutMin: 15 });
