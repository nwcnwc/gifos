'use strict';
// USE CASE 10 — the job interview. Pattern (c): the note-taking recruiter.
// Scout is camera-off and hidden nearly the whole call, surfacing only to
// type. Chat from a hidden tab must deliver immediately; presence must stay
// honestly "away, never vanished"; senders park video toward the hidden tab.
const { scenario } = require('../lib/cast');

scenario('10c-interview-hidden-scout', {
  hunter: { profile: 'desktop' },
  scout: { profile: 'desktop', observe: true },
  devi: { profile: 'phone' },
}, async (cast, check) => {
  const scout = cast.get('scout');
  await cast.joinAll();
  await check.converged(3);

  await scout.cmd('hide');
  await check.until('senders park toward the hidden note-taker', async () => {
    const sh = await cast.get('hunter').state(), sd = await cast.get('devi').state();
    return ((sh.visParked || []).length + (sd.visParked || []).length) >= 1;
  }, { within: 60 });

  for (let i = 1; i <= 3; i++) {
    await cast.sleep(25, 'Scout typing notes elsewhere');
    await scout.cmd('show');
    await scout.cmd('chat note ' + i + ': strong answer');
    await check.until('note ' + i + ' delivers to the room promptly', async () => {
      const r = await cast.get('hunter').cmd('chat');
      return r.out.join('\n').includes('note ' + i);
    }, { within: 20 });
    await scout.cmd('hide');
  }

  await check.steady('hidden Scout never vanishes from the interview', async () => {
    const s = await cast.get('devi').state();
    const r = (s.roster || []).find((x) => x.name === 'Scout');
    return s.participants === 3 && r && r.conn;
  }, { for: 30, allow: 1 });
  await scout.cmd('show');
  await check.converged(3, { desc: 'clean trio at the end' });
});
