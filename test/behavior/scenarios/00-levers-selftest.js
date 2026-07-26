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

  // radio: a SHORT blip proves the lever toggles and heals. (The full
  // 150s+ vouch-cap tunnel is USE-CASE territory — 02c/11a and friends — and
  // its compound after-effects are findings F2/F3/F4, not lever questions.
  // Cap-scale arcs here made the tool gate 15+ min and entangled it with the
  // 4-core box's saturation; a gate must stay fast and unambiguous.)
  await ann.cmd('radio off');
  await cast.sleep(15, 'a short dead spot');
  await ann.cmd('radio on');
  await check.converged(3, { desc: 'short radio blip heals invisibly', within: 90, roles: ['ann', 'bob', 'cyd'] });

  // freeze: JS fully stops (real tab freeze); thaw with a backdated >150s
  // beat gap must fire the resume self-heal (auto reload → rejoin)
  await ann.cmd('freeze');
  await cast.sleep(20, 'Ann frozen (long app-switch)');
  await ann.cmd('thaw 155');
  await check.until('thaw(155s gap): resume self-heal re-seats Ann', async () => {
    const s = await ann.state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 120 });

  // die, from a CLEAN history: Dot joins fresh, seats, dies 30s later. The
  // compound-history die (tunnel+freeze survivor dying) is scenario work —
  // it exposed finding F4 (a peer wedges holding the corpse's occupancy).
  await cast.get('dot').join(cast.room);
  check.assert(await cast.get('dot').waitSeat(60), 'Dot (fresh 4th) seats');
  await cast.sleep(20, 'Dot settles (links complete)');
  await cast.get('dot').cmd('die');
  await check.until('die: the others drop Dot (no permanent ghost)', async () => {
    const sts = await Promise.all([bob, cyd].map((a) => a.state()));
    return sts.every((s) => !s.err && !(s.roster || []).some((r) => r.name === 'Dot' && r.conn));
  }, { within: 240 });
}, { timeoutMin: 12 });
