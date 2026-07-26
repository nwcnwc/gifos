'use strict';
// USE CASE 8 — family tech support. Pattern (a): Gigi reloads at every hiccup.
// THE OPEN FAST-REJOIN RACE (#2) AS A SCENARIO: five reloads, some back-to-
// back before seating completes, some from a settled seat. After EVERY reload
// she must land in the SAME room as Kai — never a solo fragment.
const { scenario } = require('../lib/cast');

scenario('08a-techsupport-reload-mash', {
  kai: { profile: 'desktop' },
  gigi: { profile: 'phone', battery: '0.8' },
}, async (cast, check) => {
  const gigi = cast.get('gigi');
  await cast.joinAll();
  await check.converged(2);

  // reloads 1-2: back-to-back, the second BEFORE the first finishes seating
  await gigi.cmd('reload');
  await gigi.cmd('reload'); // no waitseat between — the mash
  check.assert(await gigi.waitSeat(60), 'Gigi seats after the back-to-back mash');
  await check.converged(2, { desc: 'mash reloads 1-2: same room as Kai (no fragment)', within: 90 });

  // reload 3: from a settled seat
  await cast.sleep(15, 'settled');
  await gigi.cmd('reload');
  check.assert(await gigi.waitSeat(60), 'Gigi seats after reload 3');
  await check.converged(2, { desc: 'reload 3: same room', within: 90 });

  // reloads 4-5: quick again, then let it land
  await gigi.cmd('reload');
  await cast.sleep(3);
  await gigi.cmd('reload');
  check.assert(await gigi.waitSeat(60), 'Gigi seats after reloads 4-5');
  await check.converged(2, { desc: 'reloads 4-5: same room', within: 90 });
  await check.oneTree(2, { via: 'kai', desc: 'final census: ONE tree of 2 (the race never forked the room)' });
});
