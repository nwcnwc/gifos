'use strict';
// USE CASE 5 — the panel show. Pattern (c): the producer lurks the whole hour
// — camera off, tab hidden, never speaks. The economics must hold for the
// duration: senders park their mains toward the hidden tab, and the consent
// tally honestly counts the camera-off producer as a clear-video blocker.
const { scenario } = require('../lib/cast');

scenario('05c-panel-silent-producer', {
  rae: { profile: 'desktop' },
  kiki: { profile: 'phone' },
  malik: { profile: 'phone' },
  pat: { profile: 'desktop', observe: true }, // camera OFF by design
}, async (cast, check) => {
  const pat = cast.get('pat');
  await cast.joinAll();
  await check.converged(4);

  await pat.cmd('hide');
  await check.until('the show parks video toward the hidden producer', async () => {
    const sts = await Promise.all(['rae', 'kiki', 'malik'].map((r) => cast.get(r).state()));
    return sts.reduce((n, s) => n + (s.visParked || []).length, 0) >= 1;
  }, { within: 60 });

  // "the whole hour", compressed: 4 minutes of steady-state economics
  await check.steady('the hour holds: parks persist, Pat stays present, cam-off visible to all', async () => {
    const sts = await Promise.all(['rae', 'kiki', 'malik'].map((r) => cast.get(r).state()));
    const parks = sts.reduce((n, s) => n + (s.visParked || []).length, 0);
    return parks >= 1 && sts.every((s) => {
      const r = (s.roster || []).find((x) => x.name === 'Pat');
      return s.participants === 4 && r && r.camOff === true;
    });
  }, { for: 240, every: 10, allow: 3 });

  check.assert((await cast.get('rae').state()).consent !== 'clear',
    'consent tally never reads clear while a camera-off member sits in the room');

  await pat.cmd('show');
  await check.until('wrap: parks toward Pat release when the tab surfaces', async () => {
    const sts = await Promise.all(['rae', 'kiki', 'malik'].map((r) => cast.get(r).state()));
    return sts.reduce((n, s) => n + (s.visParked || []).length, 0) === 0;
  }, { within: 60 });
  await check.converged(4, { desc: 'the show ends whole' });
});
