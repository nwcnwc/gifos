// e2e-vis-park.js — HIDDEN-VIEWER DORMANCY (the demand law applied to mains).
//
// A hidden tab used to keep every row-mate running a full camera encoder AT
// it — N pocketed phones = N invisible encoders burning on every sender, and
// G1's holdover keeps those pockets in the room for the duration. Now a
// hidden viewer asks each mate to PARK the main video it sends (replaceTrack
// null — the m-line stays negotiated), except the one its PiP float shows.
// What MUST hold:
//   1. three phones, cameras on: nobody parks anything (all mains carry)
//   2. C hides → C asks for parks on every mate EXCEPT its float source; the
//      asked mate confirms remoteParkMain and its main VIDEO track toward C
//      goes null (the encoder is freed)
//   3. audio never parks — the asked mate still carries audio toward C
//   4. C returns → parks lift everywhere, main video tracks restored
//   5. zero page errors throughout
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'] });
  const room = 'vp' + Math.floor(Math.random() * 1e9).toString(36);
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { errs.push(name + ': ' + e.message); console.log('  [' + name + '] pageerror: ' + e.message); });
    await pg.goto(BASE + '/meet.html#v=' + room);
    return pg;
  };
  const fakeVisibility = (pg, hidden) => pg.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

  const A = await mk('Ann'), B = await mk('Ben'), C = await mk('Cyd');
  const pages = [['Ann', A], ['Ben', B], ['Cyd', C]];
  for (const [, pg] of pages) await pg.locator('#cam').click();
  for (let i = 0; i < 30; i++) {
    const ok = [];
    for (const [, pg] of pages) ok.push(await pg.evaluate(() => { try { return window.__gifosVideo.participants(); } catch (e) { return 0; } }));
    if (ok.every((n) => n === 3)) break;
    if (i === 29) { console.log('JOIN STALL:', ok.join(',')); process.exit(1); }
    await sleep(2000);
  }
  await sleep(4000); // pulses + adapt settle
  const cId = await C.evaluate(() => window.__gifosVideo.myPid());
  const mateOf = async (pid) => {
    for (const [n, pg] of [['Ann', A], ['Ben', B]]) if ((await pg.evaluate(() => window.__gifosVideo.myPid())) === pid) return [n, pg];
    return null;
  };

  // ---- 1: everyone visible → nothing parked ---------------------------------
  const parked0 = [];
  for (const [n, pg] of pages) parked0.push(n + ':' + JSON.stringify(await pg.evaluate(() => window.__gifosVideo.visParked())));
  check('all visible: no main is parked anywhere', parked0.every((s) => s.endsWith('[]')), parked0.join(' '));
  check('all visible: A sends main video to C', await A.evaluate((id) => window.__gifosVideo.mainSending(id), cId));
  check('all visible: B sends main video to C', await B.evaluate((id) => window.__gifosVideo.mainSending(id), cId));

  // ---- 2: C hides → mates park C's inbound mains except the float source ----
  await fakeVisibility(C, true);
  // parks ride the visibilitychange directly + the worker heartbeat re-aim
  await C.waitForFunction(() => window.__gifosVideo.visParkAsked().length >= 1, null, { timeout: 20000 });
  const asked = await C.evaluate(() => window.__gifosVideo.visParkAsked());
  check('hidden C asks mates to park (float source excepted → exactly 1 of 2)', asked.length === 1, asked);
  const floatAim = await C.evaluate(() => window.__gifosVideo.pip().aimed);
  check('C\'s float aims at the mate it did NOT park',
    typeof floatAim === 'string' && floatAim.indexOf('peer:') === 0 && !asked.includes(floatAim.slice(5)), { floatAim, asked });
  const hit = await mateOf(asked[0]);
  check('the asked mate exists among A/B', !!hit, asked[0]);
  if (hit) {
    const [hn, hp] = hit;
    await hp.waitForFunction((id) => window.__gifosVideo.visParked().includes(id), cId, { timeout: 15000 });
    check(hn + ' confirms the park request from C', true);
    await hp.waitForFunction((id) => !window.__gifosVideo.mainSending(id), cId, { timeout: 10000 });
    check(hn + '\'s main VIDEO toward C is parked (track null — encoder freed)', true);

    // ---- 3: audio never parks — C still hears the room -----------------------
    check(hn + ' still sends AUDIO to hidden C (calls never go silent in a pocket)',
      await hp.evaluate((id) => window.__gifosVideo.mainAudioSending(id), cId));
  }

  // ---- 4: C returns → everything lifts ---------------------------------------
  await fakeVisibility(C, false);
  await C.waitForFunction(() => window.__gifosVideo.visParkAsked().length === 0, null, { timeout: 20000 });
  check('C back: no parks outstanding on C', true);
  await A.waitForFunction((id) => !window.__gifosVideo.visParked().includes(id), cId, { timeout: 15000 });
  await B.waitForFunction((id) => !window.__gifosVideo.visParked().includes(id), cId, { timeout: 15000 });
  check('C back: A and B lifted the park', true);
  const resumed = [
    await A.evaluate((id) => window.__gifosVideo.mainSending(id), cId),
    await B.evaluate((id) => window.__gifosVideo.mainSending(id), cId)];
  check('C back: both mates\' main video toward C carries again', resumed.every(Boolean), resumed);

  // ---- 5: zero page errors ----------------------------------------------------
  check('zero page errors across the whole scenario', errs.length === 0, errs);

  await browser.close();
  console.log(failures ? failures + ' FAILURES' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
