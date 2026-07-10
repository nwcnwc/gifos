// Recording an app-in-meeting. The on-device recorder composites the video
// tiles and CANNOT reach a sandboxed app iframe's pixels — so when an app is on
// stage, clicking Record now asks: tiles-only, or capture this tab (getDisplayMedia)
// so the app rides along. If an app is shared AFTER a tiles recording starts,
// the recorder is warned to restart to capture it. getDisplayMedia is stubbed
// here (a fake canvas stream) so app-mode recording is deterministic headless.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Ada');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  // Stub getDisplayMedia so "Record with the app" starts deterministically.
  await ctx.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (md) md.getDisplayMedia = async () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      c.getContext('2d').fillRect(0, 0, 320, 240);
      return c.captureStream(5);
    };
  });

  // Seed a desktop so the meeting has an app to run, grab a runnable app id.
  const desk = await ctx.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon');
  const appId = await desk.evaluate(async () => {
    const fs = await window.GifOS.store.allFiles();
    const app = fs.find((f) => f.isApp && f.appId !== 'meet' && f.appId !== 'video');
    return app ? app.id : null;
  });
  check('seeded desktop exposes a runnable app', !!appId);

  const m = await ctx.newPage();
  m.on('pageerror', (e) => console.log('  [meet pageerror]', e.message));
  await m.goto(BASE + '/meet.html#v=recroom' + Math.floor(Math.random() * 1e6).toString(36));
  await m.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 12000 });

  // ---- 1. No app on stage → Record goes straight to tiles, no chooser ----------
  await m.locator('#recbtn').click();
  await m.waitForFunction(() => window.__gifosVideo.recording(), null, { timeout: 8000 });
  check('with no app, Record starts immediately (no chooser)',
    (await m.locator('#rec-choose').count()) === 0 && (await m.evaluate(() => window.__gifosVideo.recMode())) === 'tiles');

  // ---- 2. Share an app mid-recording → the tiles recorder is warned ------------
  await m.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'Shared App'), appId);
  await m.waitForSelector('#appmount iframe', { timeout: 15000 });
  await m.waitForSelector('#rec-warn', { timeout: 8000 });
  check('sharing an app during a tiles recording warns you to restart', true);
  await m.locator('#rw-keep').click(); // keep tiles for now
  await m.locator('#recbtn').click(); // stop the tiles recording
  await m.waitForFunction(() => !window.__gifosVideo.recording(), null, { timeout: 8000 });

  // ---- 3. App on stage → Record offers the choice; pick "with the app" ---------
  check('the app is still on stage', await m.evaluate(() => window.__gifosVideo.appActive()));
  await m.locator('#recbtn').click();
  await m.waitForSelector('#rec-choose', { timeout: 8000 });
  check('with an app on stage, Record offers a choice', true);
  check('the chooser offers both tiles-only and record-with-app',
    (await m.locator('#rc-tiles').isVisible()) && (await m.locator('#rc-app').isVisible()));
  await m.locator('#rc-app').click();
  await m.waitForFunction(() => window.__gifosVideo.recording() && window.__gifosVideo.recMode() === 'app', null, { timeout: 10000 });
  check('"Record with the app" starts an app-mode (tab-capture) recording', true);
  await m.locator('#recbtn').click(); // stop
  await m.waitForFunction(() => !window.__gifosVideo.recording(), null, { timeout: 8000 });
  check('stopping ends the recording cleanly', true);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
