'use strict';
// USE CASE 4 — the emergency-response crew. Pattern (a): coverage churn.
// Three field phones cycle through staggered dropouts for ~5 minutes while
// the coordinator talks. After every wave the census must re-converge to one
// tree; the room is simply never allowed to be the problem.
const { scenario } = require('../lib/cast');

scenario('04a-crew-coverage-churn', {
  marta: { profile: 'desktop' },
  ray: { profile: 'phone', battery: '0.8' },
  ines: { profile: 'phone', battery: '0.6' },
  kofi: { profile: 'phone', battery: '0.7' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(4);

  // wave 1: short staggered blips (15-25s each, overlapping)
  await cast.get('ray').cmd('radio off');
  await cast.sleep(8);
  await cast.get('ines').cmd('radio off');
  await cast.sleep(12);
  await cast.get('ray').cmd('radio on');
  await cast.get('kofi').cmd('radio off');
  await cast.sleep(15);
  await cast.get('ines').cmd('radio on');
  await cast.get('kofi').cmd('radio on');
  await check.converged(4, { desc: 'wave 1 (short blips): crew whole', within: 120 });
  await check.oneTree(4, { via: 'marta', desc: 'wave 1 census: one tree' });

  // wave 2: a LONG dropout (90s, under the cap) while another blips
  await cast.get('kofi').cmd('radio off');
  await cast.sleep(40);
  await cast.get('ray').cmd('radio off');
  await cast.sleep(20);
  await cast.get('ray').cmd('radio on');
  await cast.sleep(30, 'Kofi still dark at 90s');
  await cast.get('kofi').cmd('radio on');
  await check.converged(4, { desc: 'wave 2 (90s + blip): crew whole', within: 180 });

  // wave 3: everyone blips at once — the nightmare intersection
  for (const r of ['ray', 'ines', 'kofi']) await cast.get(r).cmd('radio off');
  await cast.sleep(20, 'all three field phones dark');
  for (const r of ['ray', 'ines', 'kofi']) await cast.get(r).cmd('radio on');
  await check.converged(4, { desc: 'wave 3 (all dark at once): crew whole', within: 180 });
  await check.oneTree(4, { via: 'marta', desc: 'final census: one tree, no dups, no orphans' });
}, { timeoutMin: 20 });
