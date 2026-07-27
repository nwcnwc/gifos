'use strict';
// USE CASE 23 — the beehive. Pattern (b): a Section-1 seat dies under a tree.
// At C=2 with seven people, home seats ROOT subtrees. Kill a non-founder home
// seat abruptly while deep members exist: the E-laws must promote/heal so the
// tree never splits — census whole at six, ONE tree, no dup coords, every
// survivor seated. This is the first battery test of S1 healing WITH DEPTH.
const { scenario } = require('../lib/cast');

const rc = (s) => { const m = /^(.*)\/(\d+)\.(\d+)$/.exec(s.coord || ''); return m ? { pc: m[1], r: +m[2], i: +m[3] } : null; };

scenario('23b-beehive-anchor-death', {
  ana: { profile: 'desktop', meshC: 2 }, bo: { profile: 'phone', meshC: 2 },
  cai: { profile: 'phone', meshC: 2 }, dee: { profile: 'desktop', meshC: 2 },
  eli: { profile: 'phone', meshC: 2 }, fio: { profile: 'phone', meshC: 2 },
  gil: { profile: 'phone', meshC: 2 },
}, async (cast, check) => {
  const all = ['ana', 'bo', 'cai', 'dee', 'eli', 'fio', 'gil'];
  await cast.joinAll();
  await check.converged(7, { within: 180 });
  await check.until('the hive is deep before the blow (≥2 sections)', async () => {
    const pcs = new Set();
    for (const r of all) { const c = rc(await cast.get(r).state()); if (!c) return false; pcs.add(c.pc); }
    return pcs.size >= 2;
  }, { within: 120 });

  // Runtime pick: a HOME-section seat that is not the founder. Home = the
  // shortest pc among current coords.
  const coords = {};
  for (const r of all) coords[r] = rc(await cast.get(r).state());
  const homePc = Object.values(coords).map((c) => c.pc).sort((a, b) => a.length - b.length)[0];
  const victim = all.find((r) => r !== 'ana' && coords[r] && coords[r].pc === homePc);
  check.assert(!!victim, 'a non-founder home-section victim exists', victim + ' @ ' + (victim ? coords[victim].pc + '/' + coords[victim].r + '.' + coords[victim].i : '?'));
  await cast.get(victim).cmd('die');

  const rest = all.filter((r) => r !== victim);
  await check.converged(6, { desc: 'census heals to six (deep members survive their anchor)', within: 240, roles: rest });
  await check.oneTree(6, { via: 'ana', desc: 'ONE tree after the anchor death — no orphaned section' });
  await check.until('every survivor holds a REAL seat', async () => {
    for (const r of rest) { const c = rc(await cast.get(r).state()); if (!c) return false; }
    return true;
  }, { within: 60 });
}, { timeoutMin: 18 });
