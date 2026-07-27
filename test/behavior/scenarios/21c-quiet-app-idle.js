'use strict';
// USE CASE 21 — the quiet room. Pattern (c): the shared app nobody talks over.
// The guest-perms drill's exact shape, battery-ized: a 2-person room, a
// network-capable app shared into it, then MINUTES of total user silence.
// This is the room the starve-edge regression actually killed (the guest saw
// the app header over blank space — the demo-killer class, fixed 6a23358).
// The laws: the app stays MOUNTED on both sides through the silence, the
// quiet pair never blinks, and the room is alive afterward.
const { scenario } = require('../lib/cast');

scenario('21c-quiet-app-idle', {
  hana: { profile: 'desktop', seedDesktop: true }, // the host needs a store with apps
  iggy: { profile: 'phone', battery: '0.6' },
}, async (cast, check) => {
  const hana = cast.get('hana'), iggy = cast.get('iggy');
  await cast.joinAll();
  await check.converged(2);

  await hana.cmd('app run'); // the Bible Browser — network-capable, like the drill
  await check.until('the app mounts on BOTH sides (host + auto-mounting guest)', async () => {
    const sh = await hana.state(), si = await iggy.state();
    return sh.app === true && sh.appIfr === true && si.appIfr === true;
  }, { within: 45 });

  // Settle past the young-pair window, then the long quiet: both just read.
  await cast.sleep(60);
  await check.steady('four minutes of app-share silence: pair whole, app mounted on both sides', async () => {
    const sh = await hana.state(), si = await iggy.state();
    return sh.participants === 2 && si.participants === 2 &&
      sh.appIfr === true && si.appIfr === true;
  }, { for: 240, every: 5, allow: 1 });

  await iggy.cmd('chat ok this chapter is wild');
  await check.until('hana hears the first words after the silence', async () => {
    const c = await hana.cmd('chat');
    return c.out.join('\n').includes('this chapter is wild');
  }, { within: 20 });
  await check.converged(2, { desc: 'the reading session ends whole' });
  await check.oneTree(2, { via: 'hana' });
}, { timeoutMin: 18 }); // the desktop seed alone is ~90s
