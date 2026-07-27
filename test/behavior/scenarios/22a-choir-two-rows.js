'use strict';
// USE CASE 22 — the choir. Pattern (a): seven singers, two rows.
// The FIRST battery scenario past one row. H7's law is row-major fill: the
// first C people are ROW-MATES (the near field), the next start row 1. The
// laws: the formation is exactly row-major (5 + 2, one section), a back-row
// member can leave and return without disturbing the shape, and the room is
// ONE tree throughout.
const { scenario } = require('../lib/cast');

const rc = (s) => { const m = /^(.*)\/(\d+)\.(\d+)$/.exec(s.coord || ''); return m ? { pc: m[1], r: +m[2], i: +m[3] } : null; };

scenario('22a-choir-two-rows', {
  al: { profile: 'desktop' }, bea: { profile: 'phone' }, cy: { profile: 'phone' },
  di: { profile: 'phone', battery: '0.6' }, ed: { profile: 'desktop' },
  fay: { profile: 'phone' }, gus: { profile: 'phone', battery: '0.5' },
}, async (cast, check) => {
  const all = ['al', 'bea', 'cy', 'di', 'ed', 'fay', 'gus'];
  await cast.joinAll();
  await check.converged(7, { within: 150 });

  const shape = async () => {
    const rows = { r0: 0, r1: 0, other: 0 }; const pcs = new Set();
    for (const r of all) {
      const c = rc(await cast.get(r).state());
      if (!c) return null;
      pcs.add(c.pc);
      if (c.r === 0) rows.r0++; else if (c.r === 1) rows.r1++; else rows.other++;
    }
    rows.pcs = pcs.size;
    return rows;
  };
  await check.until('row-major formation: front row FULL (5), back row 2, one section', async () => {
    const s = await shape();
    return s && s.r0 === 5 && s.r1 === 2 && s.other === 0 && s.pcs === 1;
  }, { within: 90 });
  await check.oneTree(7, { via: 'al' });

  // A back-row singer steps out and returns — the shape must not wobble.
  const backRow = [];
  for (const r of all) { const c = rc(await cast.get(r).state()); if (c && c.r === 1) backRow.push(r); }
  const out = backRow[0];
  await cast.get(out).cmd('leave');
  await check.converged(6, { desc: 'six after ' + out + ' steps out', within: 90 });
  await check.until('the front row is STILL full at six (no hole migrated forward)', async () => {
    const s = await shape2(cast, all.filter((r) => r !== out));
    return s && s.r0 === 5;
  }, { within: 60 });
  await cast.get(out).join(cast.room);
  await check.converged(7, { desc: 'seven again after the return', within: 120 });
  await check.until('return lands row-major: 5 + 2 again', async () => {
    const s = await shape();
    return s && s.r0 === 5 && s.r1 === 2;
  }, { within: 90 });
  await check.oneTree(7, { via: 'ed', desc: 'the choir ends ONE tree' });

  function shape2(cast2, roles) {
    return (async () => {
      const rows = { r0: 0, r1: 0 };
      for (const r of roles) {
        const c = rc(await cast2.get(r).state());
        if (!c) return null;
        if (c.r === 0) rows.r0++; else if (c.r === 1) rows.r1++;
      }
      return rows;
    })();
  }
}, { timeoutMin: 14 });
