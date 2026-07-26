'use strict';
// USE CASE 5 — the influencer panel show. Pattern (a): stage choreography.
// Guests rotate on/off Stage (self step-up in an open room). Stage membership
// must be exactly the CHOSEN set at every beat — never filled by seating —
// and step-down must release cleanly.
const { scenario } = require('../lib/cast');

scenario('05a-panel-stage-choreo', {
  rae: { profile: 'desktop' },     // host
  kiki: { profile: 'phone' },
  malik: { profile: 'phone' },
  sol: { profile: 'phone' },
  pat: { profile: 'desktop', observe: true }, // producer, camera off
}, async (cast, check) => {
  await cast.joinAll();
  await check.converged(5);
  const pid = {};
  for (const a of cast.all()) pid[a.role] = (await a.state()).pid;

  const stageIs = async (viewerRole, roles) => {
    const s = await cast.get(viewerRole).state();
    const want = roles.map((r) => pid[r]).sort();
    return JSON.stringify((s.stagers || []).slice().sort()) === JSON.stringify(want);
  };

  await cast.get('rae').cmd('stage up');
  await check.until('Rae opens the show on Stage (seen room-wide)', async () => stageIs('pat', ['rae']), { within: 30 });

  await cast.get('kiki').cmd('stage up');
  await check.until('Kiki steps up: Stage = {Rae, Kiki}', async () => stageIs('sol', ['rae', 'kiki']), { within: 30 });

  await cast.get('kiki').cmd('stage down');
  await cast.get('malik').cmd('stage up');
  await check.until('rotation: Stage = {Rae, Malik}', async () => stageIs('kiki', ['rae', 'malik']), { within: 30 });

  await cast.get('malik').cmd('stage down');
  await cast.get('sol').cmd('stage up');
  await check.until('rotation: Stage = {Rae, Sol}', async () => stageIs('malik', ['rae', 'sol']), { within: 30 });

  await cast.get('sol').cmd('stage down');
  await cast.get('rae').cmd('stage down');
  await check.until('curtain: Stage empties completely (no residue)', async () => stageIs('pat', []), { within: 30 });
  await check.converged(5, { desc: 'panel intact after the choreography' });
});
