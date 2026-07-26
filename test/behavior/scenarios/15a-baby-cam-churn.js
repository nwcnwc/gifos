'use strict';
// USE CASE 15 — the new-baby share. Pattern (a): cameras chase the moment.
// The privacy reflex: rapid cam on/off across everyone while Tom joins as
// the 4th mid-churn. The consent tally must be correct at every settle, no
// tile may wedge, and the late join must seat clean through the churn.
const { scenario } = require('../lib/cast');

scenario('15a-baby-cam-churn', {
  nadia: { profile: 'phone' },
  vera: { profile: 'phone', battery: '0.5' },
  lou: { profile: 'desktop' },
  tom: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll({ roles: ['nadia', 'vera', 'lou'] });
  await check.converged(3, { roles: ['nadia', 'vera', 'lou'] });

  // churn begins (baby stirs); Tom joins mid-churn
  await cast.get('nadia').cmd('cam off');
  await cast.get('vera').cmd('cam off');
  await cast.get('tom').join(cast.room);
  await cast.get('nadia').cmd('cam on');
  check.assert(await cast.get('tom').waitSeat(60), 'Tom seats clean through the cam churn');
  await cast.get('vera').cmd('cam on');
  await cast.get('lou').cmd('cam off');
  await cast.get('lou').cmd('cam on');
  await check.converged(4, { desc: 'family of 4 mid-churn' });

  // two more quick rounds
  for (let i = 0; i < 2; i++) {
    await cast.get('nadia').cmd('cam off');
    await cast.get('vera').cmd('cam off');
    await cast.sleep(6);
    await cast.get('nadia').cmd('cam on');
    await cast.get('vera').cmd('cam on');
  }

  // settle: every roster agrees every camera is ON (nothing wedged)
  await check.until('after the churn: every tile live, every roster agrees cams are on', async () => {
    const sts = await Promise.all(cast.all().map((a) => a.state()));
    return sts.every((s) => s.participants === 4 && (s.roster || []).every((r) => r.camOff === false));
  }, { within: 60 });
  await check.oneTree(4, { via: 'lou' });
});
