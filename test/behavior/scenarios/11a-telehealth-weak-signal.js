'use strict';
// USE CASE 11 — the telehealth consult. Pattern (a): one bar of signal.
// Ren's rural link degrades in waves (15/30/45s dropouts) on a 35% battery.
// Audio is sacred: the call must never claim Ren left while the cap holds,
// every recovery must be automatic, and the consult must end whole.
const { scenario } = require('../lib/cast');

scenario('11a-telehealth-weak-signal', {
  osei: { profile: 'desktop' },              // Dr. Osei, clinic
  ren: { profile: 'phone', battery: '0.35' },
}, async (cast, check) => {
  const ren = cast.get('ren');
  await cast.joinAll();
  await check.converged(2);
  check.assert((await ren.state()).battTier === 2, 'Ren starts at tier 2 (35%)');

  for (const [i, dur] of [[1, 15], [2, 30], [3, 45]].values()) {
    await ren.cmd('radio off');
    // TWO soft-windows by law: event-less silence is governed by the starve
    // edge (~12s); a dropout that emits a REAL transport close (the young
    // rebuilt pair from the previous heal) is governed by D5's ~7s probe
    // window. The invariant every dropout honors: no blink in the first 5s.
    const soft = i === 1 ? 12 : 5;
    await check.steady('dropout ' + i + ' (' + dur + 's): the first ' + soft + 's never blink', async () => {
      const s = await cast.get('osei').state();
      return s.participants === 2;
    }, { for: soft, every: 2, allow: 1 });
    if (dur > soft) await cast.sleep(dur - soft, 'the dropout runs on');
    await ren.cmd('radio on');
    await check.converged(2, { desc: 'dropout ' + i + ' heals automatically', within: 180 });
  }

  await check.until('after the waves: video is live again both ways', async () => {
    const so = await cast.get('osei').state(), sr = await ren.state();
    return so.liveVid >= 1 && sr.liveVid >= 1;
  }, { within: 60 });
  await check.oneTree(2, { via: 'osei', desc: 'the consult ends whole' });
}, { timeoutMin: 15 });
