'use strict';
// USE CASE 1 — the busy household check-in. Pattern (a): rolling attendance.
// Dana (parent, desktop) founds; Maya (teen, phone) joins mid-walk; Pops
// (grandparent, phone on a weak charger) last. Maya leaves early, rejoins to
// say one more thing, leaves again. The room must seat every arrival into ONE
// tree and converge cleanly after every departure — no ghosts, no dups.
const { scenario } = require('../lib/cast');

scenario('01a-household-rolling', {
  dana: { profile: 'desktop' },
  maya: { profile: 'phone', battery: '0.62' },
  pops: { profile: 'phone', battery: '0.9,drain' },
}, async (cast, check) => {
  // Dana founds alone — a solo room is a real room
  await cast.get('dana').join(cast.room);
  check.assert(await cast.get('dana').waitSeat(60), 'Dana founds the room');

  await cast.sleep(8, 'Dana alone, waiting on the kids');
  await cast.get('maya').join(cast.room);
  check.assert(await cast.get('maya').waitSeat(60), 'Maya (phone) seats');
  await check.converged(2, { desc: 'Dana+Maya converge to 2' });

  await cast.sleep(5);
  await cast.get('pops').join(cast.room);
  check.assert(await cast.get('pops').waitSeat(60), 'Pops (phone, draining charger) seats');
  await check.converged(3, { desc: 'the household is 3' });
  await check.oneTree(3, { via: 'dana' });

  // Maya has to run — clean leave
  await cast.get('maya').cmd('leave');
  await check.converged(2, { desc: 'room converges to 2 after Maya leaves', within: 60 });
  await check.rosterLacks('dana', 'Maya', { desc: 'no Maya ghost on Dana', within: 45 });

  // ... one more thing — the rejoin
  await cast.sleep(6, 'Maya remembers one more thing');
  await cast.get('maya').join(cast.room);
  check.assert(await cast.get('maya').waitSeat(60), 'Maya rejoins into the SAME room');
  await check.converged(3, { desc: 'back to 3 after the rejoin' });
  await check.oneTree(3, { via: 'pops', desc: 'census from Pops: one tree of 3, no dup coords' });

  // and gone again; the call winds down
  await cast.get('maya').cmd('leave');
  await check.converged(2, { desc: 'clean 2 at the end' });
  await check.rosterLacks('pops', 'Maya', { desc: 'no Maya residue on Pops', within: 45 });
});
