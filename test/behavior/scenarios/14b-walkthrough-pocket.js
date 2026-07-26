'use strict';
// USE CASE 14 — the contractor walkthrough. Pattern (b): the pocketed phone.
// Faye pockets the phone for 90s to move a ladder, talking the whole time.
// Her presence must hold, mates park video toward the pocket, and the
// unpocket must restore in seconds.
const { scenario } = require('../lib/cast');

scenario('14b-walkthrough-pocket', {
  faye: { profile: 'phone', battery: '0.6' },
  bill: { profile: 'desktop' },
  gil: { profile: 'phone' },
}, async (cast, check) => {
  const faye = cast.get('faye');
  await cast.joinAll();
  await check.converged(3);

  await faye.cmd('hide'); // into the pocket
  await check.until('mates park video toward the pocket', async () => {
    const sb = await cast.get('bill').state(), sg = await cast.get('gil').state();
    return ((sb.visParked || []).length + (sg.visParked || []).length) >= 1;
  }, { within: 45 });
  await check.steady('90s pocketed: Faye never stops being present (audio-first)', async () => {
    const s = await cast.get('bill').state();
    const r = (s.roster || []).find((x) => x.name === 'Faye');
    return s.participants === 3 && r && r.conn;
  }, { for: 90, every: 5, allow: 1 });

  await faye.cmd('show'); // ladder moved
  await check.until('unpocket restores video in seconds', async () => {
    const s = await faye.state();
    return s.liveVid >= 1 && ((await cast.get('bill').state()).visParked || []).length === 0;
  }, { within: 20 });
  await check.converged(3, { desc: 'walkthrough continues, all whole' });
});
