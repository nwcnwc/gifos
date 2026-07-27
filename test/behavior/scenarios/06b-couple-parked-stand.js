'use strict';
// USE CASE 6 — the couple. Pattern (b): the phone on the kitchen stand.
// Ju props the phone while cooking loudly: activity (speech/touch pokes)
// must keep it from parking; true silence parks it; the first touch restores.
const { scenario } = require('../lib/cast');

scenario('06b-couple-parked-stand', {
  ju: { profile: 'phone', battery: '0.7' },
  aki: { profile: 'phone' },
}, async (cast, check) => {
  const ju = cast.get('ju');
  await cast.joinAll();
  await check.converged(2);

  // cooking loudly: backdate idle, then keep "speaking" — pokes must win
  await ju.cmd('idlemin 4');
  await ju.cmd('poke');
  for (let i = 0; i < 3; i++) { await cast.sleep(15); await ju.cmd('poke'); }
  check.assert((await ju.state()).pow.idle === 0, 'speech/touches keep the propped phone awake');

  // the pot simmers; silence falls
  await ju.cmd('idlemin 4');
  await check.until('true silence parks the propped phone', async () => (await ju.state()).pow.idle === 3, { within: 30 });
  await check.steady('parked, PRESENCE never blinks', async () => {
    const s = await cast.get('aki').state();
    return s.participants === 2;
  }, { for: 60, allow: 1 });
  await check.until('parked, the pair is connected (renegotiation beats settle)', async () => {
    const s = await cast.get('aki').state();
    const r = (s.roster || []).find((x) => x.name === 'Ju');
    return r && r.conn;
  }, { within: 30 });

  await ju.cmd('poke'); // she picks it up
  await check.until('first touch restores', async () => (await ju.state()).pow.idle === 0, { within: 15 });
  await check.converged(2, { desc: 'clean pair at the end' });
});
