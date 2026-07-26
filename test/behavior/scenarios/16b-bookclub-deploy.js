'use strict';
// USE CASE 16 — the book club. Pattern (b): the mid-chapter deploy.
// [relay-dev] The long-settled companion to 04b (open bug #1): the relay DO
// restarts under a DEEPLY settled seated room, the discussion continues, and
// THEN Leo knocks. Seated members must re-register (R2/R3) and the newcomer
// must complete WHOHOME. EXPECTED RED until the stall is fixed.
const { scenario } = require('../lib/cast');

scenario('16b-bookclub-deploy', {
  ruth: { profile: 'desktop' },
  ida: { profile: 'phone' },
  june: { profile: 'phone' },
  kaz: { profile: 'phone' },
  leo: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll({ roles: ['ruth', 'ida', 'june', 'kaz'] });
  await check.converged(4, { roles: ['ruth', 'ida', 'june', 'kaz'] });
  await cast.sleep(150, 'the room settles deep before the deploy');

  await cast.deployRelay();
  await check.until('the settled four survive the DO restart (re-registration ≤60s)', async () => {
    const sts = await Promise.all(['ruth', 'ida', 'june', 'kaz'].map((r) => cast.get(r).state()));
    return sts.every((s) => !s.err && !!s.coord && s.participants === 4);
  }, { within: 90 });
  await cast.sleep(30, 'discussion continues on the fresh DO');

  const leo = cast.get('leo');
  await leo.join(cast.room);
  const seated = await leo.waitSeat(60);
  check.assert(seated, 'BUG #1 GATE (settled-room variant): post-deploy newcomer completes WHOHOME ≤60s');
  if (seated) {
    await check.converged(5, { desc: 'Leo in; the club is 5' });
    await check.oneTree(5, { via: 'ruth' });
  } else {
    const s = await leo.state();
    check.assert(!s.coord, 'stalled Leo holds the honest veil (no fake empty room, no fragment)',
      JSON.stringify({ coord: s.coord, participants: s.participants }));
  }
}, { relayDev: true, timeoutMin: 20 });
