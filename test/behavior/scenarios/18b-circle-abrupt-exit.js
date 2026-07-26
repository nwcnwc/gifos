'use strict';
// USE CASE 18 — the support circle. Pattern (b): the abrupt exit.
// Someone needs OUT mid-share — the privacy exit is a kill, not a goodbye.
// The vanish must be fast and total (D5): seat freed, tile gone, no media
// residue; the circle re-converges and consent recomputes to those present.
const { scenario } = require('../lib/cast');

const PW = 'one-day-at-a-time';
scenario('18b-circle-abrupt-exit', {
  faith: { profile: 'phone', ensurePass: PW },
  gray: { profile: 'phone', pass: PW },
  hope: { profile: 'phone', pass: PW },
  ivy: { profile: 'phone', pass: PW },
  jude: { profile: 'phone', pass: PW },
}, async (cast, check) => {
  await cast.get('faith').join(cast.room);
  check.assert(await cast.get('faith').waitSeat(60), 'Faith founds');
  await check.until('door locked', async () =>
    (await cast.get('faith').eval("localStorage.getItem('gifos_vpw_' + '" + cast.room + "') || ''")) === PW, { within: 30 });
  await cast.joinAll({ roles: ['gray', 'hope', 'ivy', 'jude'] });
  await check.converged(5);
  await cast.sleep(20, 'the circle is sharing');

  await cast.get('hope').cmd('die'); // she has to go, NOW
  await check.until('the vanish is total: circle heals to 4, no Hope residue anywhere', async () => {
    const sts = await Promise.all(['faith', 'gray', 'ivy', 'jude'].map((r) => cast.get(r).state()));
    return sts.every((s) => s.participants === 4 && !(s.roster || []).some((x) => x.name === 'Hope'));
  }, { within: 240 });
  await check.steady('the healed circle is quiet (no echo of the departure)', async () => {
    const sts = await Promise.all(['faith', 'gray', 'ivy', 'jude'].map((r) => cast.get(r).state()));
    return sts.every((s) => s.participants === 4 && s.dups === 0);
  }, { for: 60, every: 3, allow: 0 });
  await check.oneTree(4, { via: 'faith', within: 120, desc: 'four seats, one tree, nothing held for the departed' });
}, { timeoutMin: 15 });
