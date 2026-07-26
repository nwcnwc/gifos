'use strict';
// USE CASE 7 — the study group. Pattern (a): the hand queue as talking stick.
// Rounds of raise/lower across four members with app-switch hides between
// turns. Queue order must be exactly raise order (including a forced
// same-millisecond tie), hands must survive hide/show, and the queue must
// never ghost a member who left.
const { scenario } = require('../lib/cast');

scenario('07a-study-handq', {
  lena: { profile: 'desktop' },
  omar: { profile: 'phone' },
  tess: { profile: 'phone' },
  vik: { profile: 'phone', battery: '0.4' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(4);
  const raise = (r) => cast.get(r).eval('window.__gifosVideo.raiseHand(true)');
  const lower = (r) => cast.get(r).eval('window.__gifosVideo.raiseHand(false)');
  const queueNames = async (viewer) => {
    const q = await cast.get(viewer).eval('JSON.parse(JSON.stringify(window.__gifosVideo.handQueue()))');
    return Array.isArray(q) ? q.map((e) => e.name) : null;
  };

  for (let round = 1; round <= 3; round++) {
    await raise('omar');
    await cast.sleep(2);
    await raise('tess');
    await cast.sleep(2);
    await raise('vik');
    await check.until('round ' + round + ': queue reads Omar→Tess→Vik room-wide', async () => {
      const q = await queueNames('lena');
      return q && q.join(',') === 'Omar,Tess,Vik';
    }, { within: 30 });

    // hands survive an app-switch mid-queue
    await cast.get('tess').cmd('hide');
    await cast.sleep(8);
    await cast.get('tess').cmd('show');
    await check.until('round ' + round + ": Tess's hand survived her app-switch", async () => {
      const q = await queueNames('lena');
      return q && q.includes('Tess') && q.indexOf('Tess') === 1;
    }, { within: 20 });

    for (const r of ['omar', 'tess', 'vik']) await lower(r);
    await check.until('round ' + round + ': queue drains to empty', async () => {
      const q = await queueNames('lena');
      return q && q.length === 0;
    }, { within: 20 });
  }

  // the same-millisecond tie: the id tie-break must give ONE order everywhere
  const t = Date.now() + 500;
  await cast.get('omar').eval('window.__gifosVideo.raiseHandAtForTest(' + t + ')');
  await cast.get('vik').eval('window.__gifosVideo.raiseHandAtForTest(' + t + ')');
  await check.until('same-ms tie resolves to ONE agreed order everywhere', async () => {
    const a = await queueNames('lena'), b = await queueNames('tess');
    return a && b && a.length === 2 && a.join(',') === b.join(',');
  }, { within: 30 });
  await check.converged(4, { desc: 'group intact after the rounds' });
});
