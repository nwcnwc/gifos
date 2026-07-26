'use strict';
// USE CASE 18 — the support circle. Pattern (a): the locked room.
// The founder locks at genesis (keeper); four members come through the
// password door, one after a wrong try. No unlocked window a stranger could
// slip through; a wrong password never founds and never fragments.
const { scenario } = require('../lib/cast');

const PW = 'one-day-at-a-time';
scenario('18a-circle-locked', {
  faith: { profile: 'phone', ensurePass: PW },
  gray: { profile: 'phone', pass: PW },
  hope: { profile: 'phone', pass: PW },
  ivy: { profile: 'phone' },            // will fumble first
  jude: { profile: 'phone', pass: PW },
}, async (cast, check) => {
  await cast.get('faith').join(cast.room);
  check.assert(await cast.get('faith').waitSeat(60), 'Faith founds the circle');
  await check.until('the keeper locks the door at genesis', async () =>
    (await cast.get('faith').eval("localStorage.getItem('gifos_vpw_' + '" + cast.room + "') || ''")) === PW, { within: 30 });

  await cast.joinAll({ roles: ['gray', 'hope'] });
  await check.converged(3, { roles: ['faith', 'gray', 'hope'], desc: 'two through the locked door' });

  // Ivy fumbles
  await cast.get('ivy').join(cast.room, { pass: 'one-day-at-a-tim' });
  check.assert(!(await cast.get('ivy').waitSeat(20)), "the wrong password doesn't seat Ivy");
  check.assert(!(await cast.get('ivy').state()).coord, 'the bounce founded nothing (no fragment)');
  await cast.get('ivy').join(cast.room, { pass: PW });
  check.assert(await cast.get('ivy').waitSeat(60), 'Ivy in on the second try');

  await cast.joinAll({ roles: ['jude'] });
  await check.converged(5, { desc: 'the circle of five, all through the door' });
  await check.oneTree(5, { via: 'faith' });
});
