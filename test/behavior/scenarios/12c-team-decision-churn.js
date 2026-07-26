'use strict';
// USE CASE 12 — the sports team. Pattern (c): the decision under churn.
// The plan gets settled WHILE Min's tab freezes and Jo tunnels. Chat state
// must survive the churn, the returners must see the outcome, and the healed
// room must hold exactly one copy of everyone.
const { scenario } = require('../lib/cast');

scenario('12c-team-decision-churn', {
  cap: { profile: 'phone' },
  jo: { profile: 'phone' },
  min: { profile: 'phone' },
  petra: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(4);

  await cast.get('min').cmd('freeze');
  await cast.get('jo').cmd('radio off');
  await cast.get('cap').cmd('chat decision: 10am, red kits, Petra drives');
  await check.until('the decision lands for those present', async () => {
    const r = await cast.get('petra').cmd('chat');
    return r.out.join('\n').includes('red kits');
  }, { within: 30 });

  await cast.sleep(20, 'churn holds: Min frozen, Jo in the tunnel');
  await cast.get('jo').cmd('radio on');
  await check.until('Jo returns and the room re-includes him', async () => {
    const s = await cast.get('jo').state();
    return !s.err && !!s.coord && s.participants === 4;
  }, { within: 120 });

  await cast.get('min').cmd('thaw 155'); // long-gap return → self-heal reload
  await check.until('Min self-heals back in', async () => {
    const s = await cast.get('min').state();
    return !s.err && !!s.coord && s.participants === 4;
  }, { within: 120 });

  await check.converged(4, { desc: 'one copy of everyone after the churn' });
  await check.until('the returners can read the decision', async () => {
    const r = await cast.get('jo').cmd('chat');
    return r.out.join('\n').includes('red kits');
  }, { within: 30 });
  await check.oneTree(4, { via: 'cap', within: 240 });
});
