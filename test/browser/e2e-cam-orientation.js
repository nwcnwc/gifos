// THE FRAME'S SHAPE BELONGS TO THE CAMERA. We size it; we never reshape it,
// never react to rotation, never restart the sensor.
//
// The regression this guards (2026-07-31 → 2026-08-01): the pixel-budget work
// added an orientation transpose to adapt()'s camera ask, and three successive
// "fixes" layered more orientation control on top (viewport-sourced transpose;
// a transposed getUserMedia ask + corrective mid-call re-grab; a canvas
// center-crop). Every layer broke a different real device:
//   - reading the transpose from getSettings() fed back → self-view flipped
//     portrait<->landscape every ~2s;
//   - Chromium satisfies a transposed constraint on a landscape capture by
//     CENTER-CROPPING → a ridiculously zoomed face;
//   - a transposed gUM ask made one device deliver UNROTATED sensor frames →
//     the room showed up sideways;
//   - mid-call corrective re-grabs → multi-second self-view freezes;
//   - the canvas crop stacked on the camera's own crop → double zoom.
// Meanwhile the pre-07-31 code had worked on every device, because every
// phone's camera pipeline already rotates the capture with the device.
//
// So the contract, asserted here with cameras that CANNOT be reshaped:
//   1. the gUM ask and the rung ask are always the literal landscape 16:9;
//   2. the outbound frame is exactly the camera's own shape, at every blur
//      level (the pipe scales, never crops);
//   3. the camera is grabbed exactly once — sweeps, blur flips, and viewport
//      rotations trigger no re-grab and no reshape.
//
// Needs RELAY + BASE.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

// A camera that ALWAYS delivers cw x ch, whatever is asked, and whose
// applyConstraints cannot change its aspect — the stubborn device class every
// round of the regression tripped on. Counts grabs, records asks.
function shapedCameraInit(shape) {
  window.__gumCount = 0; window.__gumAsks = [];
  const md = navigator.mediaDevices;
  const real = md.getUserMedia ? md.getUserMedia.bind(md) : null;
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints && constraints.video) {
      window.__gumCount++;
      const v = constraints.video;
      const gw = (v.width && (v.width.ideal != null ? v.width.ideal : v.width)) || 0;
      const gh = (v.height && (v.height.ideal != null ? v.height.ideal : v.height)) || 0;
      window.__gumAsks.push(gw + 'x' + gh);
      const canvas = document.createElement('canvas');
      canvas.width = shape.w; canvas.height = shape.h;
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
        t.applyConstraints = () => Promise.resolve();
        t.getSettings = () => ({ width: canvas.width, height: canvas.height, frameRate: 15, deviceId: 'shaped-cam', facingMode: 'user' });
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
const orient = (k) => { const m = /^(\d+)x(\d+)[@x]?/.exec(k || ''); if (!m) return '?'; return (+m[1]) >= (+m[2]) ? 'landscape' : 'portrait'; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  // scenario: [label, camera shape, viewport, UA, expected outbound orientation]
  const scenarios = [
    ['phone whose pipeline rotates (portrait camera, upright phone)', { w: 480, h: 640 }, { width: 412, height: 915 }, MOBILE_UA, 'portrait'],
    ['phone with a stubborn landscape camera (upright phone)', { w: 640, h: 480 }, { width: 412, height: 915 }, MOBILE_UA, 'landscape'],
    ['desktop webcam in a tall window', { w: 640, h: 480 }, { width: 500, height: 900 }, null, 'landscape'],
  ];

  for (const [label, cam, viewport, ua, want] of scenarios) {
    const opts = { permissions: ['camera', 'microphone'], viewport };
    if (ua) opts.userAgent = ua;
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Cam');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
    await ctx.addInitScript(shapedCameraInit, cam);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [' + label.slice(0, 12) + '] ' + e.message));
    await p.goto(BASE + '/run.html');
    await p.locator('#lob-open').click();
    await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.camConstraint && window.__gifosVideo.camConstraint(), null, { timeout: 15000 });
    await p.evaluate(() => { if (window.__gifosVideo.camOff()) document.getElementById('cam').click(); });
    await p.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 5000 });

    // 1. both asks are the literal landscape rung — never transposed
    const firstAsk = await p.evaluate(() => window.__gumAsks[0]);
    check(label + ': gUM asks literal landscape', orient(firstAsk) === 'landscape', firstAsk);
    check(label + ': rung ask is literal landscape', orient(await p.evaluate(() => window.__gifosVideo.camConstraint())) === 'landscape',
      await p.evaluate(() => window.__gifosVideo.camConstraint()));

    // 2. the outbound is the CAMERA'S shape (pipe scales, never crops/reshapes)
    await p.waitForFunction((w) => {
      const el = document.querySelector('.tile video');
      const s = el && el.srcObject; const t = s && s.getVideoTracks()[0];
      const st = t && t.getSettings ? t.getSettings() : null;
      if (!st || !st.width || !st.height) return false;
      return (st.height > st.width ? 'portrait' : 'landscape') === w;
    }, want, { timeout: 15000 });
    check(label + ': outbound is the camera’s own shape (' + want + ')', true);

    // 3. stability: sweeps + blur flips + a viewport rotation change NOTHING
    const asks = [];
    for (const lvl of [1, 2, 1, 2]) {
      await p.evaluate((l) => window.__gifosVideo.setBlur(l), lvl);
      await sleep(120);
      asks.push(orient(await p.evaluate(() => window.__gifosVideo.forceAdapt())));
    }
    await p.setViewportSize({ width: viewport.height, height: viewport.width }); // rotate the device
    await sleep(400);
    await p.evaluate(() => window.__gifosVideo.forceAdapt());
    asks.push(orient(await p.evaluate(() => window.__gifosVideo.camConstraint())));
    check(label + ': the ask never changes orientation (sweeps, blur, rotation)', new Set(asks).size === 1, asks.join(','));
    const grabs = await p.evaluate(() => window.__gumCount);
    check(label + ': camera grabbed exactly ONCE — no restarts, no freezes', grabs === 1, grabs + ' grabs');
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
