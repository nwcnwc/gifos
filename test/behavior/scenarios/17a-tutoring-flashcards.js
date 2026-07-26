'use strict';
// USE CASE 17 — language tutoring. Pattern (a): the flashcard reflex.
// Billie flips to a flashcard app every ~30s, ten cycles. Park/unpark
// cycling must be flap-free and CHEAP, with no degradation from repetition —
// cycle 10 must restore as fast as cycle 1, and session state must ride
// through untouched.
const { scenario } = require('../lib/cast');

scenario('17a-tutoring-flashcards', {
  mika: { profile: 'desktop' },
  billie: { profile: 'phone', battery: '0.6' },
}, async (cast, check) => {
  const billie = cast.get('billie');
  await cast.joinAll();
  await check.converged(2);
  await cast.get('mika').cmd('chat lesson: le subjonctif');

  const restoreTimes = [];
  let ok = 0;
  for (let cycle = 1; cycle <= 10; cycle++) {
    await billie.cmd('hide');
    await new Promise((r) => setTimeout(r, 18000)); // flashcards
    await billie.cmd('show');
    const t0 = Date.now();
    // restored = her video pipe is live again on Mika's side
    const good = await (async () => {
      for (let i = 0; i < 10; i++) {
        const s = await cast.get('mika').state();
        const r = (s.roster || []).find((x) => x.name === 'Billie');
        if (r && r.conn && r.vid) return true;
        await new Promise((rr) => setTimeout(rr, 1500));
      }
      return false;
    })();
    if (good) { ok++; restoreTimes.push((Date.now() - t0) / 1000); }
    await new Promise((r) => setTimeout(r, 8000)); // attention span
  }
  check.assert(ok >= 9, '≥9/10 cycles restore video promptly', ok + '/10, times=' + restoreTimes.map((t) => t.toFixed(1)).join(','));
  const early = restoreTimes.slice(0, 3), late = restoreTimes.slice(-3);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  check.assert(avg(late) <= avg(early) + 5, 'no degradation from repetition (late cycles as fast as early)',
    'early≈' + avg(early).toFixed(1) + 's late≈' + avg(late).toFixed(1) + 's');

  await check.until('session state rode through 10 cycles', async () => {
    const r = await billie.cmd('chat');
    return r.out.join('\n').includes('subjonctif');
  }, { within: 20 });
  await check.converged(2, { desc: 'lesson ends with a clean pair' });
}, { timeoutMin: 15 });
