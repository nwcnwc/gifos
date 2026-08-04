// Meeting Settings e2e — the gear that replaced the Mix button:
//   the Settings modal holds the SOUND MIX (same fader ids, new home — Mix
//   left the bar) and the VIDEO QUALITY picker: Auto (the adaptive ladder,
//   exactly the old behavior) + six fixed rungs 1080p→144p. A manual rung
//   pins what YOUR OWN camera records — capture ask and sender bitrate —
//   overriding room-size/power stepping; Auto restores the ladder; the
//   choice persists in localStorage and only ever shapes the SENDER side.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (name, cond, d) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (d ? '  (' + d + ')' : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    return ctx;
  };
  const room = 'set' + Math.floor(Math.random() * 1e9).toString(36);
  const A = await newUser('Ann');
  const a = await A.newPage();
  a.on('pageerror', (e) => console.log('  [a pageerror]', e.message));
  await a.goto(BASE + '/run.html#v=' + room);
  await a.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 30000 });

  // ---- the modal: Mix moved in, the bar button moved out ---------------------
  check('the bar has Settings and no Mix button',
    (await a.locator('#setbtn').isVisible()) && (await a.locator('#mixbtn').count()) === 0);
  await a.locator('#setbtn').click();
  await a.waitForSelector('#set-modal', { state: 'visible', timeout: 5000 });
  check('the sound mix lives INSIDE Settings (same faders, new home)',
    await a.evaluate(() => {
      const m = document.getElementById('set-modal');
      return ['mix-stage', 'mix-row', 'mix-stadium', 'timingrow'].every((id) => m.contains(document.getElementById(id)));
    }));
  const vqs = await a.evaluate(() => Array.from(document.querySelectorAll('#vqrow button')).map((b) => b.dataset.vq || 'auto'));
  check('the video-quality picker offers Auto + six rungs, highest to lowest',
    JSON.stringify(vqs) === JSON.stringify(['auto', '1080p', '720p', '480p', '360p', '240p', '144p']), vqs.join(','));
  check('Auto is the default (exactly the old adaptive behavior)',
    (await a.evaluate(() => window.__gifosVideo.vq())) === 'auto');

  // ---- a manual rung pins MY OWN capture + encode ---------------------------
  await a.locator('#vqrow button[data-vq="480p"]').click();
  await a.waitForFunction(() => window.__gifosVideo.vq() === '480p', null, { timeout: 5000 });
  await a.waitForFunction(() => window.__gifosVideo.camConstraint() === '854x480@24', null, { timeout: 10000 });
  check('480p pins the camera ask to the rung, immediately',
    (await a.evaluate(() => window.__gifosVideo.rungNow())) === '480p');
  check('the choice persists (localStorage)',
    (await a.evaluate(() => localStorage.getItem('gifos_vq'))) === '480p');

  // manual overrides the ROOM-SIZE stepping: a second joiner would normally
  // hold a 2-person room at 720p; the pinned 480p must not move
  const B = await newUser('Ben');
  const b = await B.newPage();
  b.on('pageerror', () => {});
  await b.goto(BASE + '/run.html#v=' + room);
  await b.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  await a.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  await a.evaluate(() => window.__gifosVideo.forceAdapt());
  check('the pin holds with peers in the room (no room-size re-step)',
    (await a.evaluate(() => window.__gifosVideo.camConstraint())) === '854x480@24');
  check('…and only shapes the SENDER side: the peer stays on Auto',
    (await b.evaluate(() => window.__gifosVideo.vq())) === 'auto');

  // ---- the deliberate 1080p spend (manual-only — no room auto-picks it) -----
  await a.evaluate(() => window.__gifosVideo.setVqForTest('1080p'));
  await a.waitForFunction(() => window.__gifosVideo.camConstraint() === '1920x1080@30', null, { timeout: 10000 });
  check('1080p exists as a deliberate manual choice', true);

  // ---- Auto restores the ladder ---------------------------------------------
  await a.locator('#vqrow button[data-vq=""]').click();
  await a.waitForFunction(() => window.__gifosVideo.vq() === 'auto', null, { timeout: 5000 });
  await a.evaluate(() => window.__gifosVideo.forceAdapt());
  await a.waitForFunction(() => window.__gifosVideo.camConstraint() === '1280x720@30', null, { timeout: 10000 });
  check('Auto returns to the adaptive rung (2-person room ⇒ 720p)',
    (await a.evaluate(() => window.__gifosVideo.rungNow())) === '720p'
    && (await a.evaluate(() => localStorage.getItem('gifos_vq'))) === null);

  // ---- a reload keeps a pinned choice ---------------------------------------
  await a.evaluate(() => window.__gifosVideo.setVqForTest('240p'));
  await sleep(400);
  await a.reload();
  await a.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 30000 });
  await a.waitForFunction(() => window.__gifosVideo.camConstraint() === '426x240@15', null, { timeout: 15000 });
  check('a pinned rung survives a reload (the phone-user reality)', (await a.evaluate(() => window.__gifosVideo.vq())) === '240p');

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
