'use strict';
// USE CASE 22 — the choir. Pattern (b): a front-row singer's phone dies.
// The first multi-row HEAL: an abrupt death in the FULL front row while a
// back row exists. THE LAWS, PER THE SIM (source of truth — mesh.cpp, seed 7
// init 7, killat /0.2 silent, 900 ticks): the census heals to six and stays
// ONE tree, but the freed mid-row cell is a LEGAL, PERSISTENT hole — no law
// repacks a row (Q2 compacts tree depth, not intra-section rows; moves=0),
// and a NEWCOMER seats at the row-major FRONTIER (/1.2), not the hole. The
// first AWS run of this scenario asserted a 5+1 repack that does not exist;
// the sim corrected the scenario, not the code.
const { scenario } = require('../lib/cast');

const rc = (s) => { const m = /^(.*)\/(\d+)\.(\d+)$/.exec(s.coord || ''); return m ? { pc: m[1], r: +m[2], i: +m[3] } : null; };

scenario('22b-choir-front-row-loss', {
  al: { profile: 'desktop' }, bea: { profile: 'phone' }, cy: { profile: 'phone' },
  di: { profile: 'phone', battery: '0.6' }, ed: { profile: 'desktop' },
  fay: { profile: 'phone' }, gus: { profile: 'phone' },
  hal: { profile: 'phone' }, // the newcomer, after the loss
}, async (cast, check) => {
  const all = ['al', 'bea', 'cy', 'di', 'ed', 'fay', 'gus'];
  await cast.joinAll({ roles: all });
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
  // The sim's steady state: the hole is legal and NOBODY is displaced — the
  // survivors hold exactly the seats they held (4 front, 2 back).
  await check.steady('the legal steady shape holds: 4 front + 2 back, hole undisturbed', async () => {
    let r0 = 0, r1 = 0;
    for (const r of rest) { const c = rc(await cast.get(r).state()); if (!c) return false; if (c.r === 0) r0++; if (c.r === 1) r1++; }
    return r0 === 4 && r1 === 2;
  }, { for: 45, every: 5, allow: 1 });
  // …and the DOOR still works over the hole: a new singer seats promptly.
  await cast.get('hal').join(cast.room);
  await check.seated('hal', { within: 60, desc: 'a new singer seats ≤60s despite the front-row corpse' });
  await check.converged(7, { desc: 'seven again — six survivors + the newcomer', within: 120, roles: rest.concat(['hal']) });
  await check.oneTree(7, { via: 'ed', desc: 'the choir ends whole' });
}, { timeoutMin: 18 });
