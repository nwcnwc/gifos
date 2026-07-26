'use strict';
// USE CASE 5 — the panel show. Pattern (b): the star freezes mid-segment ON
// Stage. The Stage slot must resolve honestly: no permanent black Stage tile
// — either she resumes, or the slot releases within cap-scale time. The
// stage list must never carry a pid the roster no longer knows.
const { scenario } = require('../lib/cast');

scenario('05b-panel-star-freeze', {
  rae: { profile: 'desktop' },
  kiki: { profile: 'phone', battery: '0.5' },
  malik: { profile: 'phone' },
  sol: { profile: 'phone' },
}, async (cast, check) => {
  const kiki = cast.get('kiki');
  await cast.joinAll();
  await check.converged(4);
  await kiki.cmd('stage up');
  const kikiPid = (await kiki.state()).pid;
  await check.until('Kiki is on Stage room-wide', async () => ((await cast.get('sol').state()).stagers || []).includes(kikiPid), { within: 30 });

  await kiki.cmd('freeze');
  await cast.sleep(45, 'Kiki frozen mid-sentence, on Stage');
  await kiki.cmd('thaw 155'); // return fires the resume self-heal (reload)
  await check.until('Kiki is back in the room after the self-heal', async () => {
    const s = await kiki.state();
    return !s.err && !!s.coord && s.participants === 4;
  }, { within: 120 });

  // the honest-stage law: whatever happened to her slot, the stage list must
  // only ever name pids the room actually knows (no corpse on the marquee)
  await check.until('Stage carries NO corpse pid (old identity gone or re-adopted)', async () => {
    const sts = await Promise.all(['rae', 'malik', 'sol'].map((r) => cast.get(r).state()));
    const k8 = (x) => String(x || '').slice(0, 8); // id fields may be 8-char truncated
    return sts.every((s) => {
      const known = new Set([k8(s.pid)].concat((s.roster || []).map((r) => k8(r.peer))));
      return (s.stagers || []).every((id) => known.has(k8(id)));
    });
  }, { within: 240 });
  await check.converged(4, { desc: 'panel whole after the star freeze' });
  await check.oneTree(4, { via: 'rae', within: 240 });
});
