'use strict';
// USE CASE 9 — the remote standup, three times in a row. The same room is
// founded → burst-filled → emptied, three cycles. Every cycle must found
// EXACTLY once (no dueling genesis — this is the burst-join hunter; finding
// F1 came from exactly this shape), seat all five, and empty so cleanly that
// cycle 3 behaves like cycle 1.
const { scenario } = require('../lib/cast');

scenario('09a-standup-triple-burst', {
  ada: { profile: 'phone' },
  ben: { profile: 'phone' },
  cam: { profile: 'phone' },
  dia: { profile: 'desktop' },
  eli: { profile: 'desktop' },
}, async (cast, check) => {
  for (let cycle = 1; cycle <= 3; cycle++) {
    // the burst: everyone clicks the link within seconds
    await cast.joinAll({ serial: false, stagger: 1 });
    await check.converged(5, { desc: 'cycle ' + cycle + ': burst of 5 lands in ONE room', within: 120 });
    await check.oneTree(5, { via: 'dia', desc: 'cycle ' + cycle + ': census — single genesis, no dup coords' });

    // the round: a quick word each (chat as the standup proxy)
    for (const a of cast.all()) await a.cmd('chat ' + a.name + ': done X, doing Y, no blockers');
    await check.until('cycle ' + cycle + ': the round reached everyone', async () => {
      const r = await cast.get('ada').cmd('chat');
      return (r.out.join('\n').match(/no blockers/g) || []).length >= 5;
    }, { within: 30 });

    // scatter: a mix of clean leaves and outright kills
    await cast.get('ada').cmd('leave');
    await cast.get('ben').cmd('leave');
    await cast.get('cam').cmd('die');
    await cast.get('dia').cmd('leave');
    await cast.get('eli').cmd('die');
    await cast.sleep(12, 'cycle ' + cycle + ' scattered; the room should be gone');
  }
  // surviving three found→fill→empty cycles with identical behavior IS the pass
});
