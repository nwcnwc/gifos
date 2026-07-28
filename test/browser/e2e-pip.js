// e2e-pip.js — LEAVING THE APP LEAVES A FACE ON SCREEN (Picture-in-Picture).
//
// Stepping out to another phone app must not mean leaving the room: meet.html
// floats the meeting's best video in a PiP overlay on visibilitychange, the
// way native call apps do. Entry is best-effort per browser (Chrome auto-PiP
// via the MediaSession action, Safari via autoPictureInPicture, plus a direct
// attempt); what MUST hold everywhere is the source picker and the wiring:
//   1. alone and join-quiet (camera off), nothing is aimed — never a black box
//   2. alone with the camera ON, my own preview floats (the room is still open)
//   3. a peer whose camera is OFF never steals the aim (their track decodes
//      black frames — the picker goes by STATUS, not frames)
//   4. a peer with a live camera beats my own preview
//   5. a synthetic hide → show round-trip runs the enter/exit paths without a
//      single page error (headless Chromium may refuse to actually open the
//      overlay — no user gesture — so pip().active is reported, not required)
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--auto-accept-this-tab-capture', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'pip' + Math.floor(Math.random() * 1e9).toString(36);
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { errs.push(name + ': ' + e.message); console.log('  [' + name + '] pageerror: ' + e.message); });
    await pg.goto(BASE + '/meet.html#v=' + room);
    return pg;
  };

  // ---- 1: alone + join-quiet (camera off) → nothing aimed --------------------
  const A = await mk('Ann');
  await sleep(4000);
  check('alone and join-quiet, the PiP picker aims at nothing',
    (await A.evaluate(() => window.__gifosVideo.pip().aimed)) === null);

  // ---- 2: alone with the camera ON → my own preview floats -------------------
  await A.locator('#cam').click();
  await A.waitForFunction(() => window.__gifosVideo.pip().aimed === 'peer:me', null, { timeout: 10000 });
  check('alone with the camera on, the picker aims at MY preview', true);

  // ---- 3: a camera-off peer never steals the aim ------------------------------
  const B = await mk('Ben');
  // Gate on OPEN DataChannels (the 2026-07-27 ICE-vs-DC audit): the aim
  // assertions below need Ben's status/stream actually ARRIVING, and an
  // ICE-up/DC-closed forming pair delivers neither for its first ~12s.
  for (const pg of [A, B]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  for (let i = 0; i < 30; i++) {
    const st = [];
    for (const [n, pg] of [['A', A], ['B', B]]) st.push(n + '=' + await pg.evaluate(() => { try { return window.__gifosVideo.participants(); } catch (e) { return '?'; } }));
    if (st.every((x) => /=2/.test(x))) break;
    if (i === 29) { console.log('JOIN STALL:', st.join(' ')); process.exit(1); }
    await sleep(2000);
  }
  await sleep(3000); // status pulses settle
  check('a quiet (camera-off) peer does not steal the aim from my preview',
    (await A.evaluate(() => window.__gifosVideo.pip().aimed)) === 'peer:me');

  // ---- 4: a peer with a LIVE camera beats my own preview ----------------------
  await B.locator('#cam').click();
  await A.waitForFunction(() => /^peer:k/.test(window.__gifosVideo.pip().aimed || ''), null, { timeout: 15000 });
  check('the peer turning their camera on takes the aim', true);
  check('...and the other side aims at their peer too, never themselves',
    /^peer:k/.test(await B.evaluate(() => window.__gifosVideo.pip().aimed)));

  // ---- 3: hide → show round-trip runs enter/exit without page errors --------
  const fakeVisibility = (pg, hidden) => pg.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await fakeVisibility(A, true);
  await sleep(1500);
  const hiddenPip = await A.evaluate(() => window.__gifosVideo.pip());
  console.log('  (pip state while hidden: ' + JSON.stringify(hiddenPip) + ' — active is best-effort headless)');
  await fakeVisibility(A, false);
  await sleep(1000);
  check('returning to the tab leaves no PiP overlay up',
    (await A.evaluate(() => window.__gifosVideo.pip().active)) === false);
  // a direct gesture-backed enter must at least not blow up where unsupported
  await A.locator('body').click().catch(() => {});
  await A.evaluate(() => window.__gifosVideo.pipEnterForTest());
  await sleep(800);
  console.log('  (gesture-backed enter → active=' + JSON.stringify(await A.evaluate(() => window.__gifosVideo.pip().active)) + ')');
  await A.evaluate(() => { try { document.pictureInPictureElement && document.exitPictureInPicture(); } catch (e) {} });
  check('the whole hide/show/enter cycle produced zero page errors', errs.length === 0, errs);

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
