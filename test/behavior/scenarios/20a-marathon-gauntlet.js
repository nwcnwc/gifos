'use strict';
// USE CASE 20 — the cross-timezone holiday marathon. The kitchen sink: in one
// hour-long call (compressed ~12 min) everything above happens to somebody.
// Checkpoints after every act: ONE tree, no dups, honest rosters, every
// self-heal inside its law's deadline. The launch dress rehearsal.
// [relay-dev opportunistic]: if the real relay harness is up, a deploy fires
// mid-call; otherwise that act is skipped with a note.
const { scenario } = require('../lib/cast');

scenario('20a-marathon-gauntlet', {
  sol: { profile: 'desktop' },                    // grandpa's den PC
  tess: { profile: 'desktop' },                   // the laptop by the stove
  pia: { profile: 'phone', battery: '0.3' },      // aunt at 30%
  quinn: { profile: 'phone' },                    // the phone on the couch arm
  rio: { profile: 'phone', battery: '0.6' },      // cousin on the train
  uma: { profile: 'phone' },                      // joins for dessert
}, async (cast, check) => {
  // ACT 1 — staggered arrivals
  await cast.joinAll({ roles: ['sol', 'tess', 'pia', 'quinn', 'rio'], stagger: 6 });
  await check.converged(5, { roles: ['sol', 'tess', 'pia', 'quinn', 'rio'], desc: 'ACT 1: the family assembles (5)' });
  await check.oneTree(5, { via: 'sol', desc: 'ACT 1 census' });

  // ACT 2 — couch multitasking (hides) while dinner cooks
  await cast.get('quinn').cmd('hide');
  await cast.get('pia').cmd('hide');
  await check.until('ACT 2: parks flow toward the hidden phones', async () => {
    const sts = await Promise.all(['sol', 'tess', 'rio'].map((r) => cast.get(r).state()));
    return sts.reduce((n, s) => n + (s.visParked || []).length, 0) >= 1;
  }, { within: 60 });
  await cast.get('quinn').cmd('show');
  await cast.get('pia').cmd('show');

  // ACT 3 — Rio's train hits a tunnel (40s)
  await cast.get('rio').cmd('radio off');
  await check.steady('ACT 3: nobody loses Rio in the tunnel', async () =>
    (await cast.get('sol').state()).participants === 5, { for: 40, allow: 1 });
  await cast.get('rio').cmd('radio on');
  await check.converged(5, { desc: 'ACT 3: Rio back from the tunnel', within: 150, roles: ['sol', 'tess', 'pia', 'quinn', 'rio'] });

  // ACT 4 — Quinn's phone freezes on the couch (long app-switch), self-heals
  await cast.get('quinn').cmd('freeze');
  await cast.sleep(30, 'Quinn frozen');
  await cast.get('quinn').cmd('thaw 155');
  await check.until('ACT 4: Quinn self-heals back in', async () => {
    const s = await cast.get('quinn').state();
    return !s.err && !!s.coord && s.participants === 5;
  }, { within: 120 });
  await check.converged(5, { desc: 'ACT 4 checkpoint: five again', roles: ['sol', 'tess', 'pia', 'quinn', 'rio'], within: 240 });

  // ACT 5 — Pia's battery slides into emergency; Quinn parks on the couch arm
  await cast.get('pia').cmd('battery 22');
  await check.until('ACT 5: Pia reaches tier 3', async () => (await cast.get('pia').state()).battTier === 3, { within: 20 });
  await cast.get('quinn').cmd('idlemin 4');
  await check.until('ACT 5: Quinn parks', async () => (await cast.get('quinn').state()).pow.idle === 3, { within: 30 });

  // ACT 6 — the deploy (only with the real relay harness up)
  if (cast.relay.endsWith(':8794')) {
    await cast.deployRelay();
    await check.until('ACT 6: everyone survives the mid-call deploy', async () => {
      const sts = await Promise.all(['sol', 'tess', 'pia', 'quinn', 'rio'].map((r) => cast.get(r).state()));
      return sts.every((s) => !s.err && !!s.coord && s.participants === 5);
    }, { within: 120 });
  } else {
    cast.log('ACT 6 skipped: relay-dev not up (deploy act needs the real DO)');
  }

  // ACT 7 — Uma arrives for dessert (late join against a lived-in room)
  await cast.get('uma').join(cast.room);
  check.assert(await cast.get('uma').waitSeat(60), 'ACT 7: Uma seats into the lived-in room');
  await check.converged(6, { desc: 'ACT 7: six at the table' });
  await check.oneTree(6, { via: 'tess', desc: 'ACT 7 census: one tree of six' });

  // ACT 8 — goodnights: staggered leaves, one abrupt (Rio's battery dies)
  await cast.get('pia').cmd('leave');
  await cast.sleep(8);
  await cast.get('rio').cmd('die');
  await cast.sleep(8);
  await cast.get('quinn').cmd('leave');
  await check.until('ACT 8: the departures settle to three, no ghosts', async () => {
    const sts = await Promise.all(['sol', 'tess', 'uma'].map((r) => cast.get(r).state()));
    return sts.every((s) => s.participants === 3 &&
      !(s.roster || []).some((r) => ['Pia', 'Rio', 'Quinn'].includes(r.name)));
  }, { within: 240 });
  await check.oneTree(3, { via: 'sol', desc: 'FINALE: the last three hold a clean room', within: 120 });
  await check.steady('FINALE: and it is quiet', async () => {
    const sts = await Promise.all(['sol', 'tess', 'uma'].map((r) => cast.get(r).state()));
    return sts.every((s) => s.participants === 3 && s.dups === 0);
  }, { for: 45, allow: 0 });
}, { relayDev: 'opportunistic', timeoutMin: 30 });
