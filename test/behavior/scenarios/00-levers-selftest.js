'use strict';
// The battery's own gate: every phone-reality lever, proven by its OBSERVABLE
// effect. When a use-case scenario goes red, run THIS first — it says whether
// the lever machinery or the app broke. Not a use case; the tool test.
//
// Timing facts it leans on (the app's laws, not tunables of this test):
// - a silenced-but-open DataChannel is the zombie shape; the roster drops it
//   at the transport-vouch cap (~180s of pulse silence)
// - visibility parking has a PiP-float exception: the float source never
//   parks, so observing a park needs ≥3 participants (at N=2 the only remote
//   IS the float source)
// - thaw with a >150s beat gap must trigger the resume self-heal (a reload)
const { scenario } = require('../lib/cast');

scenario('00-levers-selftest', {
  ann: { profile: 'phone', battery: '0.9' },
  bob: { profile: 'desktop' },
  cyd: { profile: 'phone' },
  dot: { profile: 'phone' }, // joins fresh late — the clean-history `die` probe
}, async (cast, check) => {
  const ann = cast.get('ann'), bob = cast.get('bob'), cyd = cast.get('cyd');
  await cast.joinAll({ roles: ['ann', 'bob', 'cyd'] });
  await check.converged(3, { roles: ['ann', 'bob', 'cyd'] });

  // profile: ann IS a phone to the app (policy: a phone is never tier 0)
  const st0 = await ann.state();
  check.assert(st0.pow && st0.pow.mobile === 1, 'phone profile: IS_MOBILE seen by the app', JSON.stringify(st0.pow));
  check.assert(st0.battTier === 1, 'fake battery: 90% on-battery reads tier 1', 'battTier=' + st0.battTier);

  // battery lever drives the real tier machine
  await ann.cmd('battery 40');
  await check.until('battery 40% → tier 2', async () => (await ann.state()).battTier === 2, { within: 15 });
  await ann.cmd('battery 20');
  await check.until('battery 20% → tier 3', async () => (await ann.state()).battTier === 3, { within: 15 });
  await ann.cmd('battery 90,charging');
  await check.until('charger restores tier 0', async () => (await ann.state()).battTier === 0, { within: 15 });

  // hide: somebody (bob or cyd — one of them is the float source and exempt)
  // parks the main they send toward hidden ann
  await ann.cmd('hide');
  await check.until('hide: a mate parks its main toward hidden Ann', async () => {
    const sb = await bob.state(), sc = await cyd.state();
    return ((sb.visParked || []).length + (sc.visParked || []).length) >= 1;
  }, { within: 40 });
  await ann.cmd('show');
  await check.until('show: all parks toward Ann release', async () => {
    const sb = await bob.state(), sc = await cyd.state();
    return ((sb.visParked || []).length + (sc.visParked || []).length) === 0;
  }, { within: 40 });

  // idle/poke: the parked-phone machinery
  await ann.cmd('idlemin 4');
  await check.until('idlemin 4: parked-phone idle tier engages', async () => {
    const s = await ann.state();
    return s.pow && s.pow.idle === 3;
  }, { within: 30 });
  await ann.cmd('poke');
  await check.until('poke: idle releases', async () => (await ann.state()).pow.idle === 0, { within: 15 });

  // radio: a REAL tunnel — silence with no close events, long enough to cross
  // the vouch cap. Verifies launch-hardening fix 3 locally: no zombie tile
  // past ~180s; then radio-on must self-heal Ann back in with no human action.
  await ann.cmd('radio off');
  await cast.sleep(150, 'Ann in the tunnel (silent, sockets open)');
  await check.until('radio off: Ann drops from the others at the vouch cap (no 30-min zombie)', async () => {
    const sb = await bob.state();
    return sb.participants === 2;
  }, { within: 120 });
  await ann.cmd('radio on');
  await check.until('radio on: Ann self-heals back to a seat', async () => {
    const s = await ann.state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 300 }); // observed ~220s on 2026-07-26: slow (finding F2) but real
  await check.converged(3, { desc: 'trio clean after the tunnel', within: 90, roles: ['ann', 'bob', 'cyd'] });

  // freeze: JS fully stops (real tab freeze); thaw with a backdated >150s
  // beat gap must fire the resume self-heal (auto reload → rejoin)
  await ann.cmd('freeze');
  await cast.sleep(30, 'Ann frozen (long app-switch)');
  await ann.cmd('thaw 155');
  await check.until('thaw(155s gap): resume self-heal re-seats Ann', async () => {
    const s = await ann.state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 120 });
  await check.converged(3, { desc: 'trio clean after the freeze arc', within: 90, roles: ['ann', 'bob', 'cyd'] });
  // census residue (orphan refs to the pre-reload identity) was observed to
  // outlive 60s; corpse cleanup is cap-scale, so give it the cap (finding F3)
  await check.oneTree(3, { via: 'bob', within: 240, desc: 'census heals to one clean tree of 3 (≤cap)' });

  // die, from a CLEAN history: Dot joins fresh, seats, dies 30s later. The
  // compound-history die (tunnel+freeze survivor dying) is scenario work —
  // it exposed finding F4 (a peer wedges holding the corpse's occupancy).
  await cast.get('dot').join(cast.room);
  check.assert(await cast.get('dot').waitSeat(60), 'Dot (fresh 4th) seats');
  await check.converged(4, { roles: ['ann', 'bob', 'cyd'], desc: 'room is 4 with Dot in' });
  await cast.sleep(30, 'Dot settles (links complete)');
  await cast.get('dot').cmd('die');
  await check.until('die: room heals to 3, no Dot ghost anywhere', async () => {
    const sts = await Promise.all([ann, bob, cyd].map((a) => a.state()));
    return sts.every((s) => !s.err && s.participants === 3 && !(s.roster || []).some((r) => r.name === 'Dot'));
  }, { within: 240 });
  await check.oneTree(3, { via: 'cyd', within: 120, desc: 'final census: one tree of 3' });
});
