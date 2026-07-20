// Reproduces the two parent-call bugs and verifies the fixes:
//  A) browser denies camera/mic at boot (mom on DuckDuckGo) — buttons must
//     explain, and a tap must be able to re-ask and JOIN the video mesh late.
//  B) camera delivers black video (dad's iPhone) — the watchdog must notice
//     and re-grab the camera automatically.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
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
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });

  // Ada hosts with a working camera.
  const aCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await aCtx.addInitScript(setup('Ada'));
  const aPage = await aCtx.newPage();
  aPage.on('console', (m) => { if (m.type() === 'error') console.log('  [ada]', m.text()); });
  await aPage.goto(BASE + '/meet.html');
  await aPage.locator('#lob-open').click();
  await aPage.waitForFunction(() => {
    const el = document.getElementById('share-url');
    return el && el.value && /#v=.*&relay=/.test(el.value);
  }, null, { timeout: 10000 });
  const link = await aPage.locator('#share-url').inputValue();

  // ---------- A: Mia's browser blocks the camera at boot ----------
  const mCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await mCtx.addInitScript(setup('Mia'));
  // DuckDuckGo-style: getUserMedia exists but the ask is refused — until the
  // user "switches browsers" (we flip __allowGum and tap again).
  await mCtx.addInitScript({ content: `
    window.__allowGum = false;
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c) => window.__allowGum ? real(c)
      : Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
  ` });
  const mPage = await mCtx.newPage();
  mPage.on('console', (m) => { if (m.type() === 'error') console.log('  [mia]', m.text()); });
  await mPage.goto(link);
  await mPage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 20000 });
  check('A: denied-camera browser still joins (view-only)', true);
  check('A: view-only note tells her the buttons can re-ask',
    await mPage.evaluate(() => /tap the mic or camera button/i.test(document.querySelector('.tile.me .note')?.textContent || '')));

  // Tapping camera while denied: no dead button — a clear explanation.
  await mPage.locator('#cam').click();
  await mPage.waitForFunction(() => /refused|can’t share|No usable/i.test(document.getElementById('status').textContent), null, { timeout: 8000 });
  check('A: tapping the dead camera button explains WHY instead of doing nothing', true);

  // She fixes permissions (≈ switching browsers) and taps again — no reload.
  await mPage.evaluate(() => { window.__allowGum = true; });
  await mPage.locator('#cam').click();
  await mPage.waitForFunction(() => {
    const v = document.querySelector('.tile.me video');
    return v && v.style.display !== 'none' && v.videoWidth > 0 && !window.__gifosVideo.camOff();
  }, null, { timeout: 15000 });
  check('A: after permission returns, one tap turns the camera on — no reload', true);
  // ...and her video actually reaches Ada (the late-added tracks renegotiated).
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Mia'));
    if (!t || t.classList.contains('cam-off')) return false;
    const v = t.querySelector('video');
    return v && v.videoWidth > 0;
  }, null, { timeout: 20000 });
  check('A: her late camera renegotiates into the mesh — Ada renders her frames', true);

  // ---------- B: Don's camera turns on but sends pure black ----------
  const dCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await dCtx.addInitScript(setup('Don'));
  // Dad's iPhone: the FIRST camera grab succeeds but the hardware delivers
  // pure black frames. The re-grab (call #2+) gets the real camera back.
  await dCtx.addInitScript({ content: `
    window.__gumCalls = 0;
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const n = ++window.__gumCalls;
      const s = await real(c);
      if (!c || !c.video || n >= 2) return s;
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
      const x = cv.getContext('2d'); x.fillStyle = '#000';
      setInterval(() => x.fillRect(0, 0, 320, 180), 100);
      const bt = cv.captureStream(10).getVideoTracks()[0];
      const out = new MediaStream([...s.getAudioTracks(), bt]);
      for (const t of s.getVideoTracks()) t.stop();
      return out;
    };
  ` });
  const dPage = await dCtx.newPage();
  dPage.on('console', (m) => { if (m.type() === 'error') console.log('  [don]', m.text()); });
  await dPage.goto(link);
  await dPage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 2, null, { timeout: 25000 });
  await dPage.locator('#cam').click(); // camera on
  await dPage.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 8000 });

  await dPage.waitForFunction(() => window.__gumCalls >= 2, null, { timeout: 25000 });
  check('B: watchdog notices ~9s of black video and re-grabs the camera', true);
  // The re-grab rebuilds the self-view from the fresh (bright fake) camera.
  await dPage.waitForFunction(() => {
    const v = document.querySelector('.tile.me video');
    if (!v || !v.videoWidth) return false;
    const c = document.createElement('canvas'); c.width = 32; c.height = 18;
    const x = c.getContext('2d'); x.drawImage(v, 0, 0, 32, 18);
    const d = x.getImageData(0, 0, 32, 18).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 12 || d[i + 1] > 12 || d[i + 2] > 12) return true;
    return false;
  }, null, { timeout: 15000 });
  check('B: self-view is bright again after the automatic restart', true);
  // ...and his real video reaches Ada.
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Don'));
    if (!t || t.classList.contains('cam-off')) return false;
    const v = t.querySelector('video');
    return v && v.videoWidth > 0;
  }, null, { timeout: 20000 });
  check('B: after the restart his video flows to Ada', true);
  await sleep(7000); // two more watchdog ticks on the healthy camera
  const calls = await dPage.evaluate(() => window.__gumCalls);
  check('B: a healthy camera is left alone (no revive loop; calls=' + calls + ')', calls <= 2);

  await browser.close();
  console.log(failures ? 'FAILURES: ' + failures : 'ALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
