'use strict';
// USE CASE 21 — the quiet room. Pattern (a): the silent study hall.
// Four people co-work on an open line and nobody says ANYTHING for four
// minutes: no chat, no lever churn, no joins, no leaves. The laws: silence
// is not absence — a settled, quiet room never blinks; and the room is
// still ALIVE afterward (a message lands everywhere, instantly).
//
// WHY THIS EXISTS (2026-07-27): the starve-edge regression was invisible to
// every chattering scenario in this battery and was caught only by the quiet
// guest-perms drill — a healthy-but-quiet pair read as starving and was
// declared transport-dead (fixed in 6a23358: any DC receive is transport
// proof). This scenario makes minutes-long user silence a first-class
// battery reality so that class of regression is caught HERE.
const { scenario } = require('../lib/cast');

scenario('21a-quiet-study-hall', {
  omar: { profile: 'desktop' },
  pia: { profile: 'phone', battery: '0.5' },
  quinn: { profile: 'phone', battery: '0.65' },
  rosa: { profile: 'desktop' },
}, async (cast, check) => {
  const all = ['omar', 'pia', 'quinn', 'rosa'];
  await cast.joinAll();
  await check.converged(4);
  await cast.get('omar').cmd('chat pomodoro starts now — see you in a few');
  // Settle past the young-pair window (stillness is a SETTLED-pair law).
  await cast.sleep(60);

  await check.steady('four minutes of working silence: nobody blinks', async () => {
    for (const r of all) {
      const s = await cast.get(r).state();
      if (s.err || s.participants !== 4) return false;
    }
    return true;
  }, { for: 240, every: 5, allow: 1 });

  // The room is alive, not merely intact: a message lands everywhere fast.
  await cast.get('rosa').cmd('chat done — how did everyone do?');
  for (const r of ['omar', 'pia', 'quinn']) {
    await check.until(r + ' hears the first words after the silence', async () => {
      const c = await cast.get(r).cmd('chat');
      return c.out.join('\n').includes('how did everyone do');
    }, { within: 20 });
  }
  await check.converged(4, { desc: 'the study hall ends whole' });
  await check.oneTree(4, { via: 'omar' });
}, { timeoutMin: 15 });
