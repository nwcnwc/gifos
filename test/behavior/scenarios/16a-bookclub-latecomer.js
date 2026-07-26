'use strict';
// USE CASE 16 — the book club. Pattern (a): Perpetually Late Leo.
// The room runs long enough to be deeply settled (steady sockets, greeter
// rotation), then Leo knocks — 40 minutes late as always. A late join
// against a LONG-settled room must seat promptly and disturb nothing.
const { scenario } = require('../lib/cast');

scenario('16a-bookclub-latecomer', {
  ruth: { profile: 'desktop' },
  ida: { profile: 'phone' },
  june: { profile: 'phone' },
  kaz: { profile: 'phone', battery: '0.55' },
  leo: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll({ roles: ['ruth', 'ida', 'june', 'kaz'] });
  await check.converged(4, { roles: ['ruth', 'ida', 'june', 'kaz'] });
  await cast.sleep(180, 'chapter 12 discussion — the room settles DEEP (compressed 40 min)');
  await check.oneTree(4, { via: 'ruth', desc: 'the settled room is one clean tree before Leo' });

  const t0 = Date.now();
  await cast.get('leo').join(cast.room);
  const seated = await cast.get('leo').waitSeat(45);
  check.assert(seated, 'Leo seats through the greeter door of the long-settled room ≤45s',
    'took ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  await check.converged(5, { desc: 'Leo is IN (book club of 5)' });
  await check.steady('the settled four were never disturbed by the late join', async () => {
    const sts = await Promise.all(['ruth', 'ida', 'june', 'kaz'].map((r) => cast.get(r).state()));
    return sts.every((s) => !!s.coord && s.participants === 5 && s.dups === 0);
  }, { for: 30, allow: 0 });
  await check.oneTree(5, { via: 'ruth' });
}, { timeoutMin: 15 });
