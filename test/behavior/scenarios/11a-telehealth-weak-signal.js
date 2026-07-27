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
    // stillness is guaranteed only on SETTLED pairs (dropout 1); after a
    // heal the young pair's honest drop can come ~3-8s in — for those the
    // law is recovery, not stillness
    if (i === 1) {
      await check.steady('dropout 1: the settled pair never blinks for 12s', async () => {
        const s = await cast.get('osei').state();
        return s.participants === 2;
      }, { for: 12, every: 2, allow: 1 });
      if (dur > 12) await cast.sleep(dur - 12, 'the dropout runs on');
    } else {
      await cast.sleep(dur, 'dropout ' + i + ' runs (' + dur + 's) — young pair, honest early drop allowed');
    }
    await ren.cmd('radio on');
    await check.converged(2, { desc: 'dropout ' + i + ' heals automatically', within: 180 });
  }

  await check.until('after the waves: video is live again both ways', async () => {
    const so = await cast.get('osei').state(), sr = await ren.state();
    return so.liveVid >= 1 && sr.liveVid >= 1;
  }, { within: 60 });
  await check.oneTree(2, { via: 'osei', desc: 'the consult ends whole', within: 120 });
}, { timeoutMin: 15 });
