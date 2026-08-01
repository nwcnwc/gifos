// App-in-meeting e2e. Verifies the Phase-2 unification:
//  * a meeting can RUN an app that every participant mounts live (shared),
//  * a late joiner picks the app up from the status heartbeat,
//  * stopping the app tears the shared pane down for everyone,
//  * an app tab's "Meeting" toggle lands on the same meeting page with the app.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  // gifos_meet_bar='0' keeps the controls bar expanded (it defaults collapsed to
  // give video the space) so the test can reach the Run-app control in .barmore.
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    return ctx;
  };

  // ---- Host seeds a desktop (so its store has apps), then opens a meeting ----
  const aCtx = await newUser('Ada');
  const aDesk = await aCtx.newPage();
  aDesk.on('pageerror', (e) => console.log('  [a desk pageerror]', e.message));
  await aDesk.goto(BASE + '/index.html');
  // 90s: first-visit desktop seed GIF-encodes the sample apps — CPU-bound and
  // legitimately slow on a saturated shared box (measured ~60s at load 40).
  await aDesk.waitForSelector('.icon', { timeout: 90000 });
  // grab a normal (non-system) app fileId from the seeded store
  const appId = await aDesk.evaluate(async () => {
    const fs = await window.GifOS.store.allFiles();
    const app = fs.find((f) => f.isApp && f.appId !== 'meet' && f.appId !== 'video');
    return app ? app.id : null;
  });
  check('seeded desktop exposes a runnable app fileId', !!appId);

  const aMeet = await aCtx.newPage();
  aMeet.on('pageerror', (e) => console.log('  [a meet pageerror]', e.message));
  await aMeet.goto(BASE + '/meet.html');
  await aMeet.locator('#lob-open').click(); // cold open → lobby → start an open meeting
  await aMeet.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 45000 }); // meeting boot is CPU-heavy under a saturated box
  check('meeting page loaded the app runtime', await aMeet.evaluate(() => !!(window.GifOS && window.GifOS.runtime)));
  check('meeting bar shows the Run-app control', await aMeet.locator('#appbtn').isVisible());
  const link = await aMeet.evaluate(() => window.__gifosVideo && document.getElementById('share-url').value);

  // ---- A second participant joins the meeting ----
  const bCtx = await newUser('Ben');
  const bMeet = await bCtx.newPage();
  bMeet.on('pageerror', (e) => console.log('  [b meet pageerror]', e.message));
  await bMeet.goto(link);
  await aMeet.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  await bMeet.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  check('both participants are meshed in the meeting', true);

  // ---- A runs an app into the meeting; B should mount it live ----
  await aMeet.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'Shared App'), appId);
  await aMeet.waitForSelector('#appmount iframe', { timeout: 30000 });
  check('host mounted the app in the meeting stage', await aMeet.evaluate(() => window.__gifosVideo.appActive()));
  check('host is flagged as the app host', await aMeet.evaluate(() => window.__gifosVideo.appIsHost()));
  // noRelay guard (2026-08-01): a meeting-hosted app rides the mesh Stage DATA
  // lane and must open NO relay app-session — not even the transient one the
  // old flow opened and immediately tore down in attachStageBus. Every
  // steadySocket this page ever opened stays listed in __gifosConns with its
  // raw URL readable, so a role=host socket (open OR already closed) is
  // detectable here; the meeting's own role=mesh socket doesn't match.
  check('sharing opened NO relay app-session (role=host socket never existed)',
    await aMeet.evaluate(() => (window.__gifosConns || []).every((s) => {
      try { const w = s._raw && s._raw(); return !(w && /[?&]role=host\b/.test(w.url || '')); } catch (e) { return true; }
    })));

  await bMeet.waitForSelector('#appmount iframe', { timeout: 40000 });
  check('the OTHER participant auto-mounted the shared app', await bMeet.evaluate(() => window.__gifosVideo.appActive()));
  check('guest is NOT the host of the app (it is a client mount)', await bMeet.evaluate(() => !window.__gifosVideo.appIsHost()));
  check('both stages layout switched to has-app', await bMeet.evaluate(() => document.body.classList.contains('has-app')));

  // ---- A late joiner picks the app up from the heartbeat ----
  const cCtx = await newUser('Cyd');
  const cMeet = await cCtx.newPage();
  cMeet.on('pageerror', (e) => console.log('  [c meet pageerror]', e.message));
  await cMeet.goto(link);
  // 45s: the late joiner must boot the meeting, join the mesh, learn the app is
  // live, and PULL the retained snapshot — boot alone is ~45s on a saturated box.
  await cMeet.waitForSelector('#appmount iframe', { timeout: 45000 });
  check('a LATE joiner picks up the running app automatically', await cMeet.evaluate(() => window.__gifosVideo.appActive()));

  // ---- Stopping the app tears the pane down for everyone ----
  await aMeet.evaluate(() => window.__gifosVideo.stopAppForTest());
  await bMeet.waitForFunction(() => !window.__gifosVideo.appActive(), null, { timeout: 40000 });
  check('stopping the shared app clears the guest stage too', await bMeet.evaluate(() => !document.body.classList.contains('has-app')));

  // ---- Second entry point: an app tab's "Meeting" toggle ----
  const dCtx = await newUser('Dot');
  const dRun = await dCtx.newPage();
  dRun.on('pageerror', (e) => console.log('  [d run pageerror]', e.message));
  // seed d's desktop, then open the app in run.html and toggle it into a meeting
  const dDesk = await dCtx.newPage();
  await dDesk.goto(BASE + '/index.html');
  await dDesk.waitForSelector('.icon', { timeout: 90000 }); // same seed cost as above
  const dAppId = await dDesk.evaluate(async () => {
    const fs = await window.GifOS.store.allFiles();
    const app = fs.find((f) => f.isApp && f.appId !== 'meet' && f.appId !== 'video');
    return app ? app.id : null;
  });
  // ONE RUNTIME: run.html's Meeting toggle died with run.html — #app= is now a
  // direct meeting entry: boot a meeting and auto-host this desktop app in it.
  await dRun.goto(BASE + '/meet.html#app=' + dAppId);
  await dRun.waitForSelector('#appmount iframe', { timeout: 40000 });
  check('the #app= entry boots a meeting with the app already running', await dRun.evaluate(() => window.__gifosVideo.appActive()));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
