'use strict';
// USE CASE 10 — the job interview. Pattern (b): the interviewer's 12s blip.
// A sub-cap wifi hiccup mid-question must cost NOTHING: no seat loss, no
// roster drop anywhere, media resumes, and the drastic reload lever stays
// holstered (healing is proportionate).
const { scenario } = require('../lib/cast');

scenario('10b-interview-blip', {
  hunter: { profile: 'desktop' },
  scout: { profile: 'desktop', observe: true },
  devi: { profile: 'phone', battery: '0.6' },
}, async (cast, check) => {
  const hunter = cast.get('hunter');
  await cast.joinAll();
  await check.converged(3);
  const seatBefore = (await hunter.state()).coord;

  await hunter.cmd('radio off');
  await check.steady('12s blip: nobody drops the interviewer', async () => {
    const sd = await cast.get('devi').state(), ss = await cast.get('scout').state();
    return sd.participants === 3 && ss.participants === 3;
  }, { for: 12, every: 2, allow: 0 });
  await hunter.cmd('radio on');

  await check.converged(3, { desc: 'the blip heals invisibly', within: 60 });
  const seatAfter = (await hunter.state()).coord;
  check.assert(seatAfter === seatBefore, 'no reload, no reseat — proportionate healing', seatBefore + ' → ' + seatAfter);
  await check.until("Devi still sees the interviewer's video after the blip", async () => {
    const s = await cast.get('devi').state();
    const r = (s.roster || []).find((x) => x.name === 'Hunter');
    return r && r.conn && r.vid;
  }, { within: 45 });
});
