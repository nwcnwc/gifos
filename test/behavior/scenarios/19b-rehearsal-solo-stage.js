'use strict';
// USE CASE 19 — the musicians' rehearsal. Pattern (b): the solo.
// Bea steps onto the Stage for the bridge and back down. At N=3 the stage
// path must route cleanly, and step-down must leave zero residual claim.
const { scenario } = require('../lib/cast');

scenario('19b-rehearsal-solo-stage', {
  ash: { profile: 'desktop' },
  bea: { profile: 'phone' },
  cy: { profile: 'phone' },
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(3);
  const beaPid = (await cast.get('bea').state()).pid;
  const k8 = (x) => String(x || '').slice(0, 8);

  await cast.get('bea').cmd('stage up');
  await check.until('the solo: Bea on Stage room-wide', async () => {
    const sa = await cast.get('ash').state(), sc = await cast.get('cy').state();
    return [sa, sc].every((s) => (s.stagers || []).map(k8).includes(k8(beaPid)));
  }, { within: 30 });
  await cast.sleep(20, 'the bridge');

  await cast.get('bea').cmd('stage down');
  await check.until('step-down: the Stage empties with zero residue', async () => {
    const sts = await Promise.all(cast.all().map((a) => a.state()));
    return sts.every((s) => (s.stagers || []).length === 0);
  }, { within: 30 });
  await check.converged(3, { desc: 'back to the round — rehearsal intact' });
});
