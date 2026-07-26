'use strict';
// USE CASE 18 — the support circle. Pattern (c): faces optional.
// Three of five keep cameras off for the whole session. The consent tally
// must honestly name the blockers throughout (no clear video, ever), the
// camera-off members must be FULLY present (chat, presence), and the 20s
// idle-stop must release their actual sensors.
const { scenario } = require('../lib/cast');

const PW = 'one-day-at-a-time';
scenario('18c-circle-camoff', {
  faith: { profile: 'phone', ensurePass: PW },
  gray: { profile: 'phone', pass: PW, observe: true },
  hope: { profile: 'phone', pass: PW, observe: true },
  ivy: { profile: 'phone', pass: PW, observe: true },
  jude: { profile: 'phone', pass: PW },
}, async (cast, check) => {
  await cast.get('faith').join(cast.room);
  check.assert(await cast.get('faith').waitSeat(60), 'Faith founds');
  await check.until('door locked', async () =>
    (await cast.get('faith').eval("localStorage.getItem('gifos_vpw_' + '" + cast.room + "') || ''")) === PW, { within: 30 });
  await cast.joinAll({ roles: ['gray', 'hope', 'ivy', 'jude'] });
  await check.converged(5);

  await cast.sleep(30, 'sharing begins; three faces stay dark by choice');
  check.assert(await cast.get('gray').eval('window.__gifosVideo.camTrackLive()') === false,
    "a camera off past the idle-stop releases the SENSOR (nothing records a support circle)");

  await check.steady('the whole session: blockers named, cam-off members fully present', async () => {
    const s = await cast.get('faith').state();
    const offs = (s.roster || []).filter((r) => r.camOff === true).length;
    return s.participants === 5 && offs === 3 && s.consent !== 'clear';
  }, { for: 90, every: 5, allow: 1 });

  await cast.get('hope').cmd('chat it helped to hear that, thank you');
  await check.until('a camera-off member is heard like anyone else (chat delivers)', async () => {
    const r = await cast.get('jude').cmd('chat');
    return r.out.join('\n').includes('helped to hear');
  }, { within: 20 });
  await check.converged(5, { desc: 'the circle holds, faces optional' });
});
