'use strict';
// USE CASE 4 — the emergency-response crew. Pattern (b): a relay deploy mid-
// incident. THE OPEN WHOHOME BUG (#1, 2026-07-26) AS A SCENARIO: a room is
// seated and stable, the relay Durable Object restarts (a real deploy under
// wrangler dev), and then a newcomer knocks. Prod behavior: the newcomer gets
// decryptable greeter blobs but the WHOHOME dance never completes until a
// seated member re-enters. EXPECTED RED until the bug is fixed — this script
// is the lab repro the fix will be verified against.
const { scenario } = require('../lib/cast');

scenario('04b-crew-deploy', {
  marta: { profile: 'desktop' },
  ray: { profile: 'phone' },
  ines: { profile: 'phone' },
  kofi: { profile: 'phone' },
  ted: { profile: 'phone' }, // the tow truck, dispatched late
}, async (cast, check) => {
  await cast.joinAll({ roles: ['marta', 'ray', 'ines', 'kofi'] });
  await check.converged(4, { roles: ['marta', 'ray', 'ines', 'kofi'] });
  await cast.sleep(45, 'the incident runs; the room settles (sockets drop to steady state)');

  await cast.deployRelay(); // a REAL DO restart under the seated room

  await check.until('seated crew survives the deploy (re-registration, R2/R3)', async () => {
    const sts = await Promise.all(['marta', 'ray', 'ines', 'kofi'].map((r) => cast.get(r).state()));
    return sts.every((s) => !s.err && !!s.coord && s.participants === 4);
  }, { within: 90 });

  const ted = cast.get('ted');
  await ted.join(cast.room);
  const seated = await ted.waitSeat(60);
  check.assert(seated, 'BUG #1 GATE: the post-deploy newcomer completes WHOHOME to a seat ≤60s');
  if (seated) {
    await check.converged(5, { desc: 'Ted is IN the crew room (not a fragment)' });
    await check.oneTree(5, { via: 'marta' });
  } else {
    // document the stall precisely for the fix: does he at least hold the veil?
    const s = await ted.state();
    check.assert(s.err || !s.coord, 'stalled Ted shows the honest joining veil, never a fake empty room',
      JSON.stringify({ coord: s.coord, participants: s.participants }));
  }
}, { relayDev: true, timeoutMin: 20 });
