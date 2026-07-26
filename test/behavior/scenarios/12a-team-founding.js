'use strict';
// USE CASE 12 — the sports-team logistics call. Pattern (a): Sunday's plan.
// Cap founds; the team piles in near-simultaneously; the plan gets made in
// chat; the captain takes the Stage briefly to settle it. Founding under a
// pile-in must be SINGLE; the decision must reach everyone.
const { scenario } = require('../lib/cast');

scenario('12a-team-founding', {
  cap: { profile: 'phone' },
  jo: { profile: 'phone' },
  min: { profile: 'phone' },
  petra: { profile: 'phone' },
  ferg: { profile: 'phone' },
}, async (cast, check) => {
  // Cap founds first, the rest pile in with barely a gap
  await cast.get('cap').join(cast.room);
  check.assert(await cast.get('cap').waitSeat(60), 'Cap founds');
  await cast.joinAll({ roles: ['jo', 'min', 'petra', 'ferg'], serial: false, stagger: 1 });
  await check.converged(5, { desc: 'the pile-in lands in ONE room', within: 120 });
  await check.oneTree(5, { via: 'cap', desc: 'single genesis, five seats' });

  await cast.get('cap').cmd('chat game at 10, kit run — who drives?');
  await cast.get('petra').cmd('chat I drive, Ferg rides with me');
  await check.until('the plan reaches the whole team', async () => {
    const r = await cast.get('min').cmd('chat');
    const t = r.out.join('\n');
    return t.includes('who drives') && t.includes('Ferg rides');
  }, { within: 30 });

  await cast.get('cap').cmd('stage up'); // "OK — 10am, Petra drives. Done."
  const capPid = (await cast.get('cap').state()).pid;
  await check.until('the captain settles it from the Stage', async () =>
    ((await cast.get('jo').state()).stagers || []).map((x) => String(x).slice(0, 8)).includes(String(capPid).slice(0, 8)), { within: 30 });
  await cast.get('cap').cmd('stage down');
  await check.converged(5, { desc: 'team call steady at the end' });
});
