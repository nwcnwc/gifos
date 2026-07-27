'use strict';
// USE CASE 21 — the quiet room. Pattern (b): a knock on a silent door.
// Two people sit up late saying nothing; a third arrives DURING the
// silence. The laws: the door of a quiet room works exactly like the door
// of a busy one (seats ≤45s — R-door), the settled pair rides the
// admission unblinked, and conversation resumes for all three.
//
// The quiet-door case matters because entry (knock → greeter → WHOHOME →
// seat) is the path most starved of ambient traffic when the room is
// silent: nothing is flowing that could mask — or accidentally carry —
// the entry frames. A regression that only bites quiet rooms bites HERE.
const { scenario } = require('../lib/cast');

scenario('21b-quiet-door-knock', {
  vera: { profile: 'phone', battery: '0.4' },
  wes: { profile: 'desktop' },
  zoe: { profile: 'phone', battery: '0.8' },
}, async (cast, check) => {
  await cast.joinAll({ roles: ['vera', 'wes'] });
  await check.converged(2);
  await cast.get('wes').cmd('chat no need to talk. just stay on the line');
  // Settle past the young-pair window, then begin the vigil.
  await cast.sleep(60);
  await check.steady('a settled minute of silence before the knock', async () => {
    const sv = await cast.get('vera').state(), sw = await cast.get('wes').state();
    return sv.participants === 2 && sw.participants === 2;
  }, { for: 60, every: 5, allow: 1 });

  // The knock, into dead silence.
  await cast.get('zoe').join(cast.room);
  await check.seated('zoe', { within: 45, desc: 'zoe seats ≤45s through a silent door' });
  await check.converged(3, { desc: 'three on the line', within: 90 });

  // The pair that sat in silence must have ridden the admission unblinked.
  await check.steady('the settled pair holds through and after the admission', async () => {
    const sv = await cast.get('vera').state(), sw = await cast.get('wes').state();
    const vSeesW = (sv.roster || []).some((r) => r.name === 'Wes' && r.conn);
    const wSeesV = (sw.roster || []).some((r) => r.name === 'Vera' && r.conn);
    return sv.participants === 3 && sw.participants === 3 && vSeesW && wSeesV;
  }, { for: 30, every: 5, allow: 1 });

  await cast.get('zoe').cmd('chat sorry im late. hi both');
  for (const r of ['vera', 'wes']) {
    await check.until(r + ' hears the newcomer', async () => {
      const c = await cast.get(r).cmd('chat');
      return c.out.join('\n').includes('sorry im late');
    }, { within: 20 });
  }
  await check.oneTree(3, { via: 'wes' });
}, { timeoutMin: 15 });
