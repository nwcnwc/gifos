// Sing Together: the always-on grid + song mode, end to end.
//  - Clocks sync over the DataChannels (NTP-style): both sides agree on the
//    offset (same test machine ⇒ true offset ≈ 0, so |off| must be small).
//  - TALK grid: near-field audio receivers get a COMMON delay target (the
//    anti-smear tier) applied via jitterBufferTarget.
//  - SONG mode: leader taps 🎵 → room state gossips; targets stretch to the
//    cathedral tiers (stage anchor / row behind / far behind); the leader's
//    mic re-grabs in music mode (speech pipeline off) and everyone's faders
//    move to the song preset — then everything restores when the song ends.
// Needs RELAY + BASE.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name) => { const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] }); await ctx.addInitScript(setup(name)); return ctx; };

  const aCtx = await newUser('Ada');
  const a = await aCtx.newPage();
  a.on('pageerror', (e) => console.log('  [a] ' + e.message));
  await a.goto(BASE + '/meet.html');
  await a.locator('#lob-open').click();
  await a.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  const link = await a.evaluate(() => document.getElementById('share-url').value);

  const bCtx = await newUser('Ben');
  const b = await bCtx.newPage();
  b.on('pageerror', (e) => console.log('  [b] ' + e.message));
  await b.goto(link);
  await a.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await b.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });

  // ---- clocks: wait for the first sync round, then check agreement ----
  await a.waitForFunction(() => { const g = window.__gifosVideo.grid(); return Object.values(g.clocks).some((c) => c.n >= 1); }, null, { timeout: 20000 });
  await b.waitForFunction(() => { const g = window.__gifosVideo.grid(); return Object.values(g.clocks).some((c) => c.n >= 1); }, null, { timeout: 20000 });
  const gA = await a.evaluate(() => window.__gifosVideo.grid());
  const gB = await b.evaluate(() => window.__gifosVideo.grid());
  const cA = Object.values(gA.clocks)[0], cB = Object.values(gB.clocks)[0];
  check('clocks sync over the DCs (rtt sane on localhost)', cA && cB && cA.rtt >= 0 && cA.rtt < 300, JSON.stringify({ a: cA, b: cB }));
  // Same machine ⇒ the true clock offset between the two pages' performance
  // clocks is a CONSTANT; each side's estimate must land near the negation of
  // the other's. Allow generous slack for crypto/queue asymmetry.
  check('the two sides agree on the offset (|offA + offB| small)', Math.abs((cA.off || 0) + (cB.off || 0)) < 60, 'offA=' + cA.off + ' offB=' + cB.off);

  // ---- talk grid: near-field alignment applied ----
  await a.waitForFunction(() => { const g = window.__gifosVideo.grid(); return Object.values(g.targets).length >= 1; }, null, { timeout: 10000 });
  const tA = await a.evaluate(() => window.__gifosVideo.grid());
  const tgt = Object.values(tA.targets)[0];
  check('talk mode aligns the near field (row target, jitterBufferTarget set)', tgt && tgt.bus === 'row' && tgt.D > 0 && tgt.set === true, JSON.stringify(tgt));
  check('nobody is singing yet', tA.sing === false && tA.mic === 'voice');
  check('CONVERSATION is the default timing', tA.timing === 'chat', 'timing=' + tA.timing);

  // ---- conversation vs unison: the GLOBAL clock proof ----
  // B pretends its links need a 200ms grid and gossips that need. In the
  // default CONVERSATION mode A ignores it (local, snappy); after opting into
  // UNISON, A widens its target to the ROOM's slowest ear even though A's own
  // links are ~instant.
  await b.evaluate(() => window.__gifosVideo.gdForTest(200));
  await sleep(4500); // a heartbeat + a grid tick — time enough for the need to arrive
  const chatT = Object.values((await a.evaluate(() => window.__gifosVideo.grid())).targets)[0];
  check('CONVERSATION (default): A ignores B\'s gossiped need — local and snappy', chatT && chatT.D < 200, JSON.stringify(chatT));
  await a.evaluate(() => window.__gifosVideo.timingForTest('unison'));
  await a.waitForFunction(() => { const g = window.__gifosVideo.grid(); const t = Object.values(g.targets)[0]; return g.timing === 'unison' && t && t.D >= 200; }, null, { timeout: 15000 });
  const uniT = Object.values((await a.evaluate(() => window.__gifosVideo.grid())).targets)[0];
  check('UNISON (opt-in): A meets the room\'s slowest ear (D rises to B\'s gossiped need)', uniT && uniT.D >= 200 && uniT.D <= 280, JSON.stringify(uniT));
  await a.evaluate(() => window.__gifosVideo.timingForTest('chat'));
  await b.evaluate(() => window.__gifosVideo.gdForTest(0));
  await a.waitForFunction(() => { const g = window.__gifosVideo.grid(); const t = Object.values(g.targets)[0]; return g.timing === 'chat' && t && t.D < 200; }, null, { timeout: 15000 });

  const mixBefore = (await b.evaluate(() => window.__gifosVideo.grid())).mixNow;

  // ---- the leader taps 🎵 (steps on stage + starts the song) ----
  await a.evaluate(() => window.__gifosVideo.singForTest(true));
  await b.waitForFunction(() => window.__gifosVideo.grid().sing === true, null, { timeout: 15000 });
  check('song state reaches the room (gossip-derived, no command)', true);
  // The music-mode mic swap is an async re-grab — poll, don't peek.
  const micOk = await a.waitForFunction(() => window.__gifosVideo.grid().mic === 'music', null, { timeout: 10000 }).then(() => true).catch(() => false);
  check('the leader\'s mic switched to MUSIC mode (speech pipeline off)', micOk, 'mic=' + (await a.evaluate(() => window.__gifosVideo.grid())).mic);
  await sleep(3500); // one grid tick with the song tiers
  const sB = await b.evaluate(() => window.__gifosVideo.grid());
  const stageTgt = Object.values(sB.targets).find((t) => t.bus === 'stage');
  check('the follower aligns the STAGE to the unison anchor (D=280)', stageTgt && stageTgt.D === 280 && stageTgt.set === true, JSON.stringify(stageTgt));
  // Stepping on stage moves the leader to row 0, so their old rowmates classify
  // as the ROOM around the stage — the far tier. The leader hears the
  // congregation answer from behind: the cathedral echo, by construction.
  const roomTgtA = Object.values((await a.evaluate(() => window.__gifosVideo.grid())).targets)[0];
  check('the leader hears the congregation on the FAR tier (the cathedral echo, D=840)', roomTgtA && roomTgtA.D === 840 && roomTgtA.set === true, JSON.stringify(roomTgtA));
  check('the follower\'s faders moved to the song preset (stage featured)', sB.mixNow.stage === 1 && sB.mixNow.row === 0.55, JSON.stringify(sB.mixNow));

  // ---- headphones plugged in mid-song: the mic session restarts ----
  // Mobile browsers pick the speaker-vs-headset route when the mic capture
  // STARTS; a devicechange must re-grab the mic (same mode) so the route is
  // re-evaluated. Simulate the plug event and watch the track swap.
  const beforePlug = await a.evaluate(() => window.__gifosVideo.grid());
  await a.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await a.waitForFunction((prev) => { const g = window.__gifosVideo.grid(); return g.micTrack && g.micTrack !== prev; }, beforePlug.micTrack, { timeout: 8000 });
  const afterPlug = await a.evaluate(() => window.__gifosVideo.grid());
  check('plugging headphones restarts the mic session (fresh track, fresh route)', afterPlug.micTrack !== beforePlug.micTrack, 'track changed');
  // Meetings join QUIET by design — the swap must preserve the mute state
  // exactly as it was, whatever it was, and stay in music mode.
  check('…still in MUSIC mode with the mute state preserved', afterPlug.mic === 'music' && afterPlug.micOn === beforePlug.micOn, JSON.stringify({ mic: afterPlug.mic, on: afterPlug.micOn, was: beforePlug.micOn }));

  // ---- the song ends: everything unwinds ----
  await a.evaluate(() => window.__gifosVideo.singForTest(false));
  await b.waitForFunction(() => window.__gifosVideo.grid().sing === false, null, { timeout: 15000 });
  await sleep(3500); // one grid tick back on talk tiers
  const voiceOk = await a.waitForFunction(() => window.__gifosVideo.grid().mic === 'voice', null, { timeout: 10000 }).then(() => true).catch(() => false);
  const eB = await b.evaluate(() => window.__gifosVideo.grid());
  check('the leader\'s mic restored to VOICE mode', voiceOk, 'mic=' + (await a.evaluate(() => window.__gifosVideo.grid())).mic);
  check('faders restored to what they were before the song', JSON.stringify(eB.mixNow) === JSON.stringify(mixBefore), JSON.stringify(eB.mixNow));
  const backTgt = Object.values(eB.targets)[0];
  check('targets back on the talk tier', backTgt && backTgt.D <= 280, JSON.stringify(backTgt));

  await aCtx.close(); await bCtx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
