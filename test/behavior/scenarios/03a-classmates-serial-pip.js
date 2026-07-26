'use strict';
// USE CASE 3 — the classmates reunion, 5 phones on couches. Pattern (a):
// serial arrivals, then everyone but the speaker multitasks (hidden) and
// drifts back in waves. Hidden-viewer economics: mains toward the hidden get
// parked (float source excepted), audio never parks, full restore on return.
const { scenario } = require('../lib/cast');

scenario('03a-classmates-serial-pip', {
  ana: { profile: 'phone' },
  bo: { profile: 'phone' },
  cleo: { profile: 'phone', battery: '0.45' },
  dev: { profile: 'phone' },
  em: { profile: 'phone', battery: '0.8' },
}, async (cast, check) => {
  await cast.joinAll({ stagger: 8 });
  await check.converged(5);

  // couch multitask: everyone but Ana hides
  for (const r of ['bo', 'cleo', 'dev', 'em']) await cast.get(r).cmd('hide');
  await check.until('parks appear toward the hidden four', async () => {
    const sts = await Promise.all(cast.all().map((a) => a.state()));
    return sts.reduce((n, s) => n + ((s.visParked || []).length), 0) >= 3;
  }, { within: 60 });
  await check.steady('the room never loses anyone while 4/5 are hidden', async () => {
    const s = await cast.get('ana').state();
    return s.participants === 5;
  }, { for: 45, allow: 1 });

  // waves back: bo+cleo, then dev+em
  for (const r of ['bo', 'cleo']) await cast.get(r).cmd('show');
  await cast.sleep(10);
  for (const r of ['dev', 'em']) await cast.get(r).cmd('show');
  await check.until('every park releases once all are back', async () => {
    const sts = await Promise.all(cast.all().map((a) => a.state()));
    return sts.reduce((n, s) => n + ((s.visParked || []).length), 0) === 0;
  }, { within: 60 });
  await check.converged(5, { desc: 'reunion whole after the waves' });
  await check.oneTree(5, { via: 'ana' });
});
