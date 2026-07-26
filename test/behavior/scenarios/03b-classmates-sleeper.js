'use strict';
// USE CASE 3 — the classmates reunion. Pattern (b): Em drifts off.
// A phone nobody touches parks (wake lock released, rung floored) while the
// call carries on; her AV keeps flowing to the others; a poke revives her.
const { scenario } = require('../lib/cast');

scenario('03b-classmates-sleeper', {
  ana: { profile: 'phone' },
  bo: { profile: 'phone' },
  em: { profile: 'phone', battery: '0.35' },
}, async (cast, check) => {
  const em = cast.get('em');
  await cast.joinAll();
  await check.converged(3);

  await em.cmd('idlemin 4'); // nobody has touched Em's phone in 4 minutes
  await check.until('the parked-phone floor engages on Em', async () => {
    const s = await em.state();
    return s.pow && s.pow.idle === 3;
  }, { within: 30 });
  await check.steady('the call carries on around sleeping Em (she stays present)', async () => {
    const sa = await cast.get('ana').state();
    const r = (sa.roster || []).find((x) => x.name === 'Em');
    return sa.participants === 3 && r && r.conn;
  }, { for: 90, allow: 1 });

  await em.cmd('poke'); // she stirs
  await check.until('the poke revives Em (idle tier releases)', async () => (await em.state()).pow.idle === 0, { within: 15 });
  await check.converged(3, { desc: 'clean trio at the end' });
});
