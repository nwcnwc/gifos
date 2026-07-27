'use strict';
// USE CASE 19 — the musicians' rehearsal. Pattern (a): mid-song freeze.
// Cy's phone freezes 30s mid-song and returns. The other two must keep their
// link to EACH OTHER completely untouched (a dropped beat is worse than a
// dropped frame), and Cy must re-sync automatically.
const { scenario } = require('../lib/cast');

scenario('19a-rehearsal-song-freeze', {
  ash: { profile: 'desktop' },
  bea: { profile: 'phone' },
  cy: { profile: 'phone', battery: '0.5' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(3);
  for (const a of cast.all()) await a.cmd('mic on');

  await cast.get('cy').cmd('freeze');
  await check.steady("Ash↔Bea never miss a beat while Cy is frozen", async () => {
    const sa = await cast.get('ash').state(), sb = await cast.get('bea').state();
    const ok = (s, name) => { const r = (s.roster || []).find((x) => x.name === name); return r && r.conn; };
    return ok(sa, 'Bea') && ok(sb, 'Ash');
  }, { for: 30, every: 2, allow: 0 });

  await cast.get('cy').cmd('thaw 155'); // return → the self-heal re-syncs him
  await check.until('Cy re-syncs into the song', async () => {
    const s = await cast.get('cy').state();
    return !s.err && !!s.coord && s.participants === 3;
  }, { within: 180 }); // multi-stage heal budget (cf. 08c)
  await check.converged(3, { desc: 'the trio plays on', within: 240 }); // rejoin-ghost lifetime (F5 family): the corpse identity may be counted up to cap-scale before the reap clears it
  await check.oneTree(3, { via: 'ash', within: 240 });
});
