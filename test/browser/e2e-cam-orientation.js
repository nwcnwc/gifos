// The camera must show the device's orientation — without us ever fighting
// the camera for it.
//
// History (all of it field-driven, 2026-07-31 → 2026-08-01):
// 1. adapt() read the capture orientation back from track.getSettings() — the
//    camera's answer to our OWN previous applyConstraints — and transposed the
//    rung to match. On a camera that answers with the opposite orientation
//    that's a feedback loop: the self-view flipped portrait<->landscape every
//    ~2s, forever. FIXED: the ask derives from the device viewport (stable).
// 2. Then the ask was made orientation-aware at getUserMedia time (720x1280 on
//    an upright phone) plus a corrective mid-call re-grab. REVERTED same-day:
//    some devices satisfy a portrait ask by delivering UNROTATED sensor frames
//    (the room shows up sideways — strictly worse), and mid-call sensor
//    restarts froze the self-view for seconds.
// 3. Final shape: NEVER command the camera (plain 1280x720 ask, no corrective
//    re-grab, no mid-call restarts) and normalize the frame SHAPE at the one
//    place we own the pixels — the canvas pipe center-crops to the device
//    orientation (blurred pipe and, via the level-0 crop-only pipe, the
//    unblurred path too). Desktop windows have no device orientation: no crop.
//
// The fake camera here mimics the stubborn field device exactly: it ALWAYS
// delivers landscape 640x480 no matter what is asked, and applyConstraints
// cannot change its aspect (the real Chromium contract).
//
// Needs RELAY + BASE.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

// A landscape-locked camera with Chromium's real contract: getUserMedia decides
// the shape (always 640x480 here, whatever is asked); applyConstraints can
// change NOTHING about aspect. Counts grabs + records asks for the guards.
function lockedCameraInit() {
  window.__gumCount = 0; window.__gumAsks = [];
  const md = navigator.mediaDevices;
  const real = md.getUserMedia ? md.getUserMedia.bind(md) : null;
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints && constraints.video) {
      window.__gumCount++;
      const v = constraints.video;
      const gw = (v.width && (v.width.ideal != null ? v.width.ideal : v.width)) || 640;
      const gh = (v.height && (v.height.ideal != null ? v.height.ideal : v.height)) || 480;
      window.__gumAsks.push(gw + 'x' + gh);
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480; // landscape-only hardware, always
      const c2 = canvas.getContext('2d');
      let n = 0;
      setInterval(() => {
        n++;
        c2.fillStyle = (n & 1) ? '#234' : '#432';
        c2.fillRect(0, 0, canvas.width, canvas.height);
        c2.fillStyle = '#fff';
        c2.fillRect((n * 11) % Math.max(1, canvas.width - 26), 8, 20, 20);
      }, 80);
      const stream = canvas.captureStream(15);
      const patch = (t) => {
        t.applyConstraints = () => Promise.resolve();   // Chromium truth: a live track's aspect is immutable
        t.getSettings = () => ({ width: canvas.width, height: canvas.height, frameRate: 15, deviceId: 'locked-cam', facingMode: 'user' });
        const oclone = t.clone.bind(t);
        t.clone = () => patch(oclone());
        return t;
      };
      const out = new MediaStream([patch(stream.getVideoTracks()[0])]);
      if (constraints.audio && real) { try { (await real({ audio: true })).getAudioTracks().forEach((t) => out.addTrack(t)); } catch (e) {} }
      return out;
    }
    return real ? real(constraints) : Promise.reject(new Error('no gUM'));
  };
}

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const orient = (k) => { const m = /^(\d+)x(\d+)@/.exec(k || ''); if (!m) return '?'; return (+m[1]) >= (+m[2]) ? 'landscape' : 'portrait'; };
// The ME tile is WYSIWYG: its srcObject IS the outbound track (raw camera or
// canvas pipe), so its settings are the shape the room receives.
const outShape = () => {
  const el = document.querySelector('.tile video');
  const s = el && el.srcObject; const t = s && s.getVideoTracks()[0];
  const st = t && t.getSettings ? t.getSettings() : null;
  return st && st.width && st.height ? (st.height > st.width ? 'portrait' : 'landscape') : null;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  // ---- PHONE: portrait device, landscape-locked camera ----------------------
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'],
    viewport: { width: 412, height: 915 }, userAgent: MOBILE_UA });
  await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Pia');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
  await ctx.addInitScript(lockedCameraInit);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [p] ' + e.message));
  await p.goto(BASE + '/meet.html');
  await p.locator('#lob-open').click();
  await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.camConstraint && window.__gifosVideo.camConstraint(), null, { timeout: 15000 });
  await p.evaluate(() => { if (window.__gifosVideo.camOff()) document.getElementById('cam').click(); });
  await p.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 5000 });

  // A. we never command the camera's orientation at grab time
  const firstAsk = await p.evaluate(() => window.__gumAsks[0]);
  const fm = /^(\d+)x(\d+)$/.exec(firstAsk || '');
  check('the camera grab asks plain landscape 16:9 (we never fight the sensor)',
    !!fm && (+fm[1]) > (+fm[2]), firstAsk);

  // B. blurred outbound (the no-password default) is PORTRAIT via the pipe crop
  await p.waitForFunction(() => {
    const el = document.querySelector('.tile video');
    const s = el && el.srcObject; const t = s && s.getVideoTracks()[0];
    const st = t && t.getSettings ? t.getSettings() : null;
    return !!st && st.height > st.width;
  }, null, { timeout: 15000 });
  check('blurred outbound is PORTRAIT on an upright phone (canvas crop, camera untouched)', true);

  // C. the adapt() ask stays stable across sweeps and blur levels (no flip loop)
  const asks = [];
  for (const lvl of [2, 1, 2, 1]) {
    await p.evaluate((l) => window.__gifosVideo.setBlur(l), lvl);
    await sleep(120);
    asks.push(orient(await p.evaluate(() => window.__gifosVideo.forceAdapt())));
  }
  check('the constraint ask holds ONE orientation across sweeps and blur flips', new Set(asks).size === 1, asks.join(','));
  // (wait: a blur-level change rebuilds the pipe, and a fresh canvas reports
  // its default 300x150 until the first governed paint sizes it)
  let flipShape = null;
  try {
    await p.waitForFunction(() => {
      const el = document.querySelector('.tile video');
      const s = el && el.srcObject; const t = s && s.getVideoTracks()[0];
      const st = t && t.getSettings ? t.getSettings() : null;
      return !!st && st.height > st.width;
    }, null, { timeout: 10000 });
    flipShape = 'portrait';
  } catch (e) { flipShape = await p.evaluate(outShape); }
  check('outbound is still portrait after the blur flips', flipShape === 'portrait', flipShape);

  // D. the freeze guard: NO mid-call re-grabs, ever — one grab, whatever happens
  const grabs = await p.evaluate(() => window.__gumCount);
  check('the camera was grabbed exactly ONCE (no mid-call restarts → no freezes)', grabs === 1, grabs + ' grabs');

  // E. the UNBLURRED path crops too (level-0 pipe): password + consent → No blur
  await p.locator('#pwbtn').click();
  await p.locator('#pw-new').fill('clubhouse');
  await p.locator('#pw-save').click();
  await p.evaluate(() => window.__gifosVideo.setBlur(0));
  await p.waitForFunction(() => window.__gifosVideo.outboundKind() === 'raw', null, { timeout: 10000 });
  await p.waitForFunction(() => {
    const el = document.querySelector('.tile video');
    const s = el && el.srcObject; const t = s && s.getVideoTracks()[0];
    const st = t && t.getSettings ? t.getSettings() : null;
    return !!st && st.height > st.width;
  }, null, { timeout: 10000 });
  check('unblurred outbound is ALSO portrait (crop-only pipe, full detail)', true);
  check('…and still no extra camera grabs', (await p.evaluate(() => window.__gumCount)) === 1);
  await ctx.close();

  // ---- DESKTOP: portrait window, landscape camera — must NOT crop -----------
  const dCtx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 500, height: 900 } });
  await dCtx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Des');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
  await dCtx.addInitScript(lockedCameraInit);
  const d = await dCtx.newPage();
  d.on('pageerror', (e) => console.log('  [d] ' + e.message));
  await d.goto(BASE + '/meet.html');
  await d.locator('#lob-open').click();
  await d.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.camConstraint && window.__gifosVideo.camConstraint(), null, { timeout: 15000 });
  await d.evaluate(() => { if (window.__gifosVideo.camOff()) document.getElementById('cam').click(); });
  await d.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 5000 });
  await d.waitForFunction(outShape, null, { timeout: 15000 });
  check('a DESKTOP in a tall window never crops — the webcam’s own shape ships',
    (await d.evaluate(outShape)) === 'landscape', await d.evaluate(outShape));
  await dCtx.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
