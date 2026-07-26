'use strict';
// USE CASE 2 — boss + reports, admin room. Pattern (b): Jae knocks late.
// A late join against a settled ADMIN room must complete through the greeter
// door: no founding, no fragment (the JOINING VEIL law), admin table intact.
const { scenario } = require('../lib/cast');

scenario('02b-boss-latecomer', {
  priya: { profile: 'desktop', adminPw: 'weekly-sync-pw' },
  sam: { profile: 'phone' },
  noor: { profile: 'phone' },
  jae: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll({ roles: ['priya', 'sam', 'noor'] });
  await check.converged(3, { roles: ['priya', 'sam', 'noor'] });
  await cast.sleep(120, 'the sync is underway; Jae is still parking the car');

  const jae = cast.get('jae');
  await jae.join(cast.room, { av: cast.avKnown() });
  check.assert(await jae.waitSeat(60), 'Jae seats through the greeter door of a settled admin room');
  const sj = await jae.state();
  check.assert(sj.participants === 4, 'Jae landed in THE room, not a fragment', 'participants=' + sj.participants);
  await check.converged(4);
  await check.oneTree(4, { via: 'priya' });
  check.assert(await cast.get('priya').eval('window.__gifosVideo.amAdmin()') === true, 'admin table intact after the late seat');
});
