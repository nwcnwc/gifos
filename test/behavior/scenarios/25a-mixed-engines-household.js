'use strict';
// USE CASE 25 — the MIXED-ENGINE household. The same story as 01a/01b (a
// parent at a desk, two phones, one dead zone) with one difference that is the
// whole point: Maya's phone is NOT Chromium. Real rooms are never one engine,
// and every other scenario in this battery is Chromium on all sides — so the
// cross-engine facts (a VP8-only negotiation, a different WebRTC stack's ICE,
// a different visibility/beat implementation) have never been under a gate.
//
// What this pins, and why each is cross-engine rather than generic:
//  - a firefox participant SEATS into the same tree as chromium peers, and the
//    census sees ONE tree (not a same-engine fragment each).
//  - video crosses BOTH ways. Firefox has no H.264 in the playwright build, so
//    the call must negotiate VP8; if a codec front regresses to H.264-only,
//    this is the only scenario that goes red.
//  - a dead zone on the firefox side self-heals with no human action — the
//    battery's radio lever is page JS, so this proves the LEVERS carry across
//    engines too, which is what lets any future scenario mix them.
// Engine facts + traps: test/README § "Other ENGINES". WebKit is deliberately
// NOT used here: it cannot paint a remote tile and dies on an app share.
const { scenario, needEngines } = require('../lib/cast');

needEngines('firefox');

scenario('25a-mixed-engines-household', {
  dana: { profile: 'desktop', video: 1 },                     // chromium (default)
  maya: { profile: 'phone', battery: '0.62', engine: 'firefox', video: 2 },
  pops: { profile: 'phone', video: 3 },                       // chromium
}, async (cast, check) => {
  const dana = cast.get('dana'), maya = cast.get('maya');
  await cast.joinAll();
  await check.converged(3);
  await check.oneTree(3, { via: 'dana', desc: 'census: ONE tree across engines, 3 seats, no dups' });

  // mutual sight by NAME — a fragment per engine would still show 3 to each
  // side of a 2+1 split only if population lied, so name-level sight is the
  // honest cross-engine check
  await check.rosterHas('maya', 'Dana', { desc: 'the firefox phone sees the chromium desktop' });
  await check.rosterHas('dana', 'Maya', { desc: 'chromium sees the firefox phone' });

  // video BOTH ways. Firefox brings no H.264 (playwright build), so this only
  // passes if the call negotiated VP8 on both legs.
  await check.until('chromium peers see LIVE video from the firefox phone', async () => {
    const s = await dana.state();
    return (s.roster || []).some((r) => (r.name || '') === 'Maya' && r.vid);
  }, { within: 90 });
  await check.until('the firefox phone sees LIVE video from its chromium peers', async () => {
    const s = await maya.state();
    return (s.roster || []).filter((r) => r.vid).length >= 1;
  }, { within: 90 });

  // the dead zone, on the non-chromium side
  const seatBefore = (await maya.state()).coord;
  await maya.cmd('radio off');
  await check.steady('short dropout stays soft: Dana holds 3 through the 12s blip', async () => {
    const s = await dana.state();
    return s.participants === 3;
  }, { for: 12, every: 2, allow: 1 });
  await maya.cmd('radio on');
  await check.converged(3, { desc: 'household whole again after the short dropout', within: 90 });
  check.assert((await maya.state()).coord === seatBefore, 'a 12s dropout never cost the firefox phone its seat',
    seatBefore + ' → ' + (await maya.state()).coord);

  await maya.cmd('radio off');
  await cast.sleep(70, 'the long dead zone on the firefox side');
  await maya.cmd('radio on');
  await check.converged(3, { desc: 'the firefox phone self-heals out of the long dead zone', within: 180 });
  await check.oneTree(3, { via: 'dana', desc: 'census after the heal: still ONE tree across engines' });
});
