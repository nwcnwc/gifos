'use strict';
// USE CASE 22 — the choir. Pattern (b): a front-row singer's phone dies.
// The first multi-row HEAL: an abrupt death in the FULL front row while a
// back row exists. The laws: the room census heals to six (D-laws), stays
// ONE tree with no dup coords, and the shape returns to row-major legality —
// the hole does not live in the front row while the back row holds people
// (H-laws fill it; Q2 compaction guarantees the end shape: 5 + 1).
const { scenario } = require('../lib/cast');

const rc = (s) => { const m = /^(.*)\/(\d+)\.(\d+)$/.exec(s.coord || ''); return m ? { pc: m[1], r: +m[2], i: +m[3] } : null; };

scenario('22b-choir-front-row-loss', {
  al: { profile: 'desktop' }, bea: { profile: 'phone' }, cy: { profile: 'phone' },
  di: { profile: 'phone', battery: '0.6' }, ed: { profile: 'desktop' },
  fay: { profile: 'phone' }, gus: { profile: 'phone' },
}, async (cast, check) => {
  const all = ['al', 'bea', 'cy', 'di', 'ed', 'fay', 'gus'];
  await cast.joinAll();
  await check.converged(7, { within: 150 });
  await check.until('formation is row-major 5 + 2 before the loss', async () => {
    let r0 = 0, r1 = 0;
    for (const r of all) { const c = rc(await cast.get(r).state()); if (!c) return false; if (c.r === 0) r0++; if (c.r === 1) r1++; }
    return r0 === 5 && r1 === 2;
  }, { within: 90 });

  // Pick a MID front-row victim at runtime (never the founder al — that is a
  // different, spicier scenario; here the law under test is the row heal).
  let victim = null;
  for (const r of all) { if (r === 'al') continue; const c = rc(await cast.get(r).state()); if (c && c.r === 0) { victim = r; break; } }
  check.assert(!!victim, 'a non-founder front-row victim exists', victim);
  await cast.get(victim).cmd('die'); // battery hit 0%: no goodbye

  const rest = all.filter((r) => r !== victim);
  await check.converged(6, { desc: 'census heals to six after the silent death', within: 180, roles: rest });
  await check.oneTree(6, { via: 'al', desc: 'still ONE tree after the heal' });
  await check.until('the shape returns to row-major legality (front row full: 5 + 1)', async () => {
    let r0 = 0, r1 = 0;
    for (const r of rest) { const c = rc(await cast.get(r).state()); if (!c) return false; if (c.r === 0) r0++; if (c.r === 1) r1++; }
    return r0 === 5 && r1 === 1;
  }, { within: 300 }); // heal + Q2 compaction settle (quiescence window is ~150s alone)
  await check.oneTree(6, { via: 'ed', desc: 'the choir ends whole' });
}, { timeoutMin: 18 });
