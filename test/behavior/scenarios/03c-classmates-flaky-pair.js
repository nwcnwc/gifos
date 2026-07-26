'use strict';
// USE CASE 3 — the classmates reunion. Pattern (c): Bo and Dev on bad wifi.
// Offset dropout cycles, three rounds. The room must never split (one tree,
// no dup coords) and each recovery must re-seat without disturbing the rest.
const { scenario } = require('../lib/cast');

scenario('03c-classmates-flaky-pair', {
  ana: { profile: 'phone' },
  bo: { profile: 'phone' },
  cleo: { profile: 'phone' },
  dev: { profile: 'phone' },
  em: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(5);

  for (let round = 1; round <= 3; round++) {
    await cast.get('bo').cmd('radio off');
    await cast.sleep(15);
    await cast.get('dev').cmd('radio off'); // overlap: both dark at once
    await cast.sleep(15);
    await cast.get('bo').cmd('radio on');
    await cast.sleep(10);
    await cast.get('dev').cmd('radio on');
    await check.converged(5, { desc: 'round ' + round + ': all five whole again', within: 120 });
    await check.steady('round ' + round + ': the stable three were never disturbed', async () => {
      const sts = await Promise.all(['ana', 'cleo', 'em'].map((r) => cast.get(r).state()));
      return sts.every((s) => !!s.coord && s.participants === 5);
    }, { for: 10, allow: 1 });
  }
  await check.oneTree(5, { via: 'ana', desc: 'after 3 flaky rounds: ONE tree, no dup coords' });
});
