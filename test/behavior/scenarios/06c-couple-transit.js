'use strict';
// USE CASE 6 — the couple. Pattern (c): Aki's commute home.
// Hidden in a pocket, two tunnels, one short REAL freeze, then home wifi.
// THE LAWS THIS ASSERTS (corrected 2026-07-26 after the first red taught us
// the difference): a SHORT dropout is held (ICE grace covers it); a LONG
// dropout MAY evict once the transport dies and every path fails the D5
// probe — that is law-correct honesty, not a bug — but the return must
// AUTOMATICALLY reunite the pair into ONE room (never two lasting fragments,
// never a ghost); and a short freeze on a healthy pair costs nothing.
const { scenario } = require('../lib/cast');

scenario('06c-couple-transit', {
  ju: { profile: 'phone' },
  aki: { profile: 'phone', battery: '0.45' },
}, async (cast, check) => {
  const ju = cast.get('ju'), aki = cast.get('aki');
  await cast.joinAll();
  await check.converged(2);

  await aki.cmd('hide'); // phone in the pocket, audio riding along

  // tunnel 1 — short: the blip law is 12s (the starve edge legally fires at
  // 12s of TOTAL radio silence — no DC receives exist to prove transport on
  // a radio-dark pair), and one violating sample is a lone blip, not a flap
  // (01b's canonical encoding, d7b07d0). 14s/allow:0 was stricter than the
  // law on both axes and drew a boundary red in the 2026-07-27 cert sweep.
  await aki.cmd('radio off');
  await check.steady('tunnel 1: a ≤12s blip never drops her', async () => (await ju.state()).participants === 2, { for: 12, every: 2, allow: 1 });
  await aki.cmd('radio on');
  await check.converged(2, { desc: 'out of tunnel 1', within: 120 });

  // tunnel 2 — long (80s): once the transport dies and every path fails the
  // D5 probe, an honest drop is LEGAL (~15s+); what the law demands is the
  // RETURN: automatic, fast (the online event kicks the socket), ONE room.
  await aki.cmd('radio off');
  await cast.sleep(80, 'the tunnel runs long — a D5 drop after transport death is honest');
  await aki.cmd('radio on');
  await check.until('return: the pair reunites into ONE room automatically (fast — online kick)', async () => {
    const sj = await ju.state(), sa = await aki.state();
    return sj.participants === 2 && sa.participants === 2;
  }, { within: 150 }); // reunion latency tail (F2): automatic is the law, speed has a distribution
  await check.oneTree(2, { via: 'ju', desc: 'reunion is ONE tree (no lasting fragments)', within: 120 });

  // the interchange: a SHORT freeze on the now-healthy pair — under the 150s
  // detector, so the drastic reload stays holstered and the seat survives
  const seatBefore = (await aki.state()).coord;
  await aki.cmd('freeze');
  await cast.sleep(25);
  await aki.cmd('thaw');
  await check.converged(2, { desc: 'short freeze recovers in place', within: 90 });
  const seatAfter = (await aki.state()).coord;
  check.assert(seatAfter === seatBefore, 'proportionate healing: the short freeze never cost the seat', seatBefore + ' → ' + seatAfter);

  await aki.cmd('show'); // home
  await check.until('home: video live both ways', async () => {
    const sj = await ju.state(), sa = await aki.state();
    return sj.liveVid >= 1 && sa.liveVid >= 1;
  }, { within: 60 });
}, { timeoutMin: 15 });
