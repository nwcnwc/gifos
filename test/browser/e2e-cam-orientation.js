// The camera must not flip portrait<->landscape on its own.
//
// Field report (2026-07-31): on a phone held perfectly still, the self-view
// oscillated between portrait and landscape roughly every two seconds, and
// switching blur levels flipped it too. Root cause: adapt() read the capture
// ORIENTATION back from `track.getSettings()` — the camera's answer to our OWN
// previous applyConstraints — and transposed the rung to match. On a device
// whose camera answers a portrait request with a LANDSCAPE frame (and
// vice-versa: a real front-sensor mounting quirk), that reading is the
// TRANSPOSE of what we asked for, so every adapt() sweep flipped the decision,
// re-applied the opposite constraint, reconfigured the sensor, and the picture
// spun forever. The fix reads the orientation intent from the DEVICE viewport,
// which never changes on our own constraint — so the request is stable and the
// feedback loop can't form.
//
// This test installs a deliberately PERVERSE fake camera (its applyConstraints
// delivers the opposite orientation of the request — exactly the device class
// that triggered the bug) and asserts that across many adapt() sweeps the
// constraint adapt() asks for never changes orientation. On the pre-fix code
// this test oscillates and FAILS; on the fix it is rock stable.
//
// SECOND WAVE (2026-08-01, field report: "no longer cycles, but the chosen
// orientation is often WRONG — and toggling blur sometimes fixes it and it
// sticks"): the capture's SHAPE is decided at getUserMedia time; Chromium's
// applyConstraints can only downscale, never change aspect. The grab helper
// hard-coded a landscape 1280x720 ask, so an upright phone opened a landscape
// capture that adapt()'s portrait ask could never fix — until some incidental
// re-grab (idle-stop revive, black-cam watch) happened to open portrait and
// "fixed" it by luck. Fix: orientation-aware ask at every grab + ONE bounded
// corrective re-grab when the delivered shape mismatches the device (a latch,
// never a loop — a landscape-only desktop webcam is asked once and accepted).
// Sections D and E guard both halves with device models that mimic Chromium:
// honor orientation at open time, ignore it on applyConstraints.
//
// Needs RELAY + BASE.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

// A camera that answers every resolution request with the OPPOSITE orientation
// — the mounting-quirk device class that closed the old feedback loop. Installed
// before any page script runs, so meet.html grabs THIS as its camera.
function perverseCameraInit() {
  const md = navigator.mediaDevices;
  const real = md.getUserMedia ? md.getUserMedia.bind(md) : null;
  function makePerverse() {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;           // start landscape, like a webcam
    const c2 = canvas.getContext('2d');
    let n = 0;
    // A moving pattern so the captureStream actually produces frames.
    setInterval(() => {
      n++;
      c2.fillStyle = (n & 1) ? '#234' : '#432';
      c2.fillRect(0, 0, canvas.width, canvas.height);
      c2.fillStyle = '#fff';
      c2.fillRect((n * 11) % Math.max(1, canvas.width - 26), 8, 20, 20);
    }, 80);
    const stream = canvas.captureStream(15);
    const patch = (t) => {
      t.applyConstraints = (con) => {
        try {
          const gw = con && con.width && (con.width.ideal != null ? con.width.ideal : con.width);
          const gh = con && con.height && (con.height.ideal != null ? con.height.ideal : con.height);
          if (gw && gh) {
            const lo = Math.min(gw, gh), hi = Math.max(gw, gh);
            // PERVERSE: the answer's orientation is the OPPOSITE of the request.
            if (gh > gw) { canvas.width = hi; canvas.height = lo; }   // asked portrait  -> give landscape
            else { canvas.width = lo; canvas.height = hi; }           // asked landscape -> give portrait
          }
        } catch (e) {}
        return Promise.resolve();
      };
      t.getSettings = () => ({ width: canvas.width, height: canvas.height, frameRate: 15, deviceId: 'perverse-cam', facingMode: 'user' });
      const oclone = t.clone.bind(t);
      t.clone = () => patch(oclone());       // the blur pipe clones the track; keep the quirk on the clone
      return t;
    };
    return patch(stream.getVideoTracks()[0]);
  }
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints && constraints.video) {
      const out = new MediaStream();
      out.addTrack(makePerverse());
      if (constraints.audio && real) { try { (await real({ audio: true })).getAudioTracks().forEach((t) => out.addTrack(t)); } catch (e) {} }
      return out;
    }
    return real ? real(constraints) : Promise.reject(new Error('no gUM'));
  };
}

const orient = (k) => { const m = /^(\d+)x(\d+)@/.exec(k || ''); if (!m) return '?'; return (+m[1]) >= (+m[2]) ? 'landscape' : 'portrait'; };

// A camera that mimics Chromium's REAL contract: getUserMedia decides the
// capture shape (honoring the ask, or — in 'locked' mode — always landscape),
// and applyConstraints can change NOTHING about aspect. mode: 'honor' opens at
// the asked dims; 'locked' always opens 640x480 regardless of the ask.
function chromiumCameraInit(mode) {
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
      if (mode === 'locked') { canvas.width = 640; canvas.height = 480; }        // landscape-only hardware
      else { canvas.width = gw; canvas.height = gh; }                            // honors the ask at OPEN time
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
        t.getSettings = () => ({ width: canvas.width, height: canvas.height, frameRate: 15, deviceId: 'chromium-model-cam', facingMode: 'user' });
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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  // A PORTRAIT viewport — a phone held upright, the reported scenario.
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 412, height: 915 } });
  await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Nima');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
  await ctx.addInitScript(perverseCameraInit);

  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [page] ' + e.message));
  await p.goto(BASE + '/meet.html');
  await p.locator('#lob-open').click();
  await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  // Wait for the camera to be grabbed and the first adapt() to constrain it.
  await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.camConstraint && window.__gifosVideo.camConstraint(), null, { timeout: 15000 });
  // Camera ON — the reported scenario, and the corrective re-grab only acts on
  // a live, user-enabled camera (join-quiet camOff is the default).
  await p.evaluate(() => { if (window.__gifosVideo.camOff()) document.getElementById('cam').click(); });
  await p.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 5000 });

  // ---- A. drive many sweeps; the requested orientation must not oscillate ----
  const seq = [];
  for (let i = 0; i < 8; i++) {
    const k = await p.evaluate(() => window.__gifosVideo.forceAdapt());
    seq.push(k);
    await sleep(120); // let the (fake) reconfigure land, mirroring a real sweep gap
  }
  const orients = seq.map(orient);
  const distinct = Array.from(new Set(orients));
  check('adapt() asks for ONE stable orientation across sweeps (no flip loop)',
    distinct.length === 1, orients.join(','));
  check('an upright phone captures PORTRAIT (rung transposed to match the device)',
    distinct.length === 1 && distinct[0] === 'portrait', distinct.join('/'));

  // ---- B. flipping blur levels must not change the capture orientation ----
  // Without a room password every level is forced to at least Min, so all three
  // ride the blur canvas; the orientation must be identical at each.
  const perBlur = {};
  for (const lvl of [2, 1, 0, 2, 0, 1]) {
    await p.evaluate((l) => window.__gifosVideo.setBlur(l), lvl);
    await sleep(150);
    await p.evaluate(() => window.__gifosVideo.forceAdapt());
    await sleep(120);
    const k = await p.evaluate(() => window.__gifosVideo.camConstraint());
    (perBlur[lvl] = perBlur[lvl] || []).push(orient(k));
  }
  const allBlurOrients = Array.from(new Set([].concat.apply([], Object.values(perBlur))));
  check('blur level never changes the capture orientation',
    allBlurOrients.length === 1, JSON.stringify(perBlur));

  // ---- C. the self-view (outbound) tile settles to ONE orientation ----
  // Sample the actually-broadcast track over a couple seconds of live sweeps.
  const shots = [];
  for (let i = 0; i < 6; i++) {
    const dim = await p.evaluate(() => {
      const el = document.querySelector('.tile video') || (window.__gifosVideo.meDims ? null : null);
      // Prefer the ME tile's live track settings (WYSIWYG self-view = outbound).
      let vt = null;
      try {
        const s = el && el.srcObject; if (s) vt = s.getVideoTracks()[0];
      } catch (e) {}
      if (!vt) return null;
      const st = vt.getSettings ? vt.getSettings() : null;
      return st && st.width && st.height ? (st.width >= st.height ? 'landscape' : 'portrait') : null;
    });
    if (dim) shots.push(dim);
    await sleep(400);
  }
  const selfDistinct = Array.from(new Set(shots));
  check('the self-view tile holds ONE orientation (no visible flipping)',
    shots.length > 0 && selfDistinct.length === 1, shots.join(','));

  // ---- D. aspect-locked camera (the real Chromium model): an upright phone ----
  // must END UP with a portrait capture. The shape is fixed at getUserMedia
  // time, so this only works if the GRAB asks portrait (or the bounded
  // corrective re-grab fires). On the pre-fix code the hard-coded landscape
  // ask left this stuck landscape forever.
  const dCtx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 412, height: 915 } });
  await dCtx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Dee');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
  await dCtx.addInitScript(chromiumCameraInit, 'honor');
  const d = await dCtx.newPage();
  d.on('pageerror', (e) => console.log('  [d] ' + e.message));
  await d.goto(BASE + '/meet.html');
  await d.locator('#lob-open').click();
  await d.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.camConstraint && window.__gifosVideo.camConstraint(), null, { timeout: 15000 });
  await d.evaluate(() => { if (window.__gifosVideo.camOff()) document.getElementById('cam').click(); });
  await d.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 5000 });
  const firstAsk = await d.evaluate(() => window.__gumAsks[0]);
  const fm = /^(\d+)x(\d+)$/.exec(firstAsk || '');
  check('the very first camera grab ASKS portrait on an upright phone',
    !!fm && (+fm[2]) > (+fm[1]), firstAsk);
  let dSet = null;
  try {
    await d.waitForFunction(() => { const s = window.__gifosVideo.camSettings(); return !!s && s.h > s.w; }, null, { timeout: 10000 });
    dSet = await d.evaluate(() => window.__gifosVideo.camSettings());
  } catch (e) { dSet = await d.evaluate(() => window.__gifosVideo.camSettings()); }
  check('the capture the camera DELIVERS is portrait (shape decided at grab time)',
    !!dSet && dSet.h > dSet.w, JSON.stringify(dSet));
  for (let i = 0; i < 4; i++) { await d.evaluate(() => window.__gifosVideo.forceAdapt()); await sleep(150); }
  const dGrabs = await d.evaluate(() => window.__gumCount);
  check('no re-grab churn when the camera cooperates', dGrabs <= 2, dGrabs + ' grabs');
  await dCtx.close();

  // ---- E. landscape-only camera in a portrait window: the corrective ----
  // re-grab is a LATCH, not a loop. One attempt, then accept — the count must
  // stay put across many sweeps. (This is the guard that the orientation fix
  // can never become the oscillation it replaced.)
  const eCtx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 412, height: 915 } });
  await eCtx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Eve');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
  await eCtx.addInitScript(chromiumCameraInit, 'locked');
  const ep = await eCtx.newPage();
  ep.on('pageerror', (e) => console.log('  [e] ' + e.message));
  await ep.goto(BASE + '/meet.html');
  await ep.locator('#lob-open').click();
  await ep.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.camConstraint && window.__gifosVideo.camConstraint(), null, { timeout: 15000 });
  await ep.evaluate(() => { if (window.__gifosVideo.camOff()) document.getElementById('cam').click(); });
  await ep.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 5000 });
  await ep.evaluate(() => window.__gifosVideo.forceAdapt());
  await sleep(600); // let the one corrective attempt land
  const eBefore = await ep.evaluate(() => window.__gumCount);
  check('the corrective re-grab FIRED (once) on the mismatched capture — not skipped',
    eBefore === 2, eBefore + ' grabs (1 initial + 1 corrective)');
  const eAsks = [];
  for (let i = 0; i < 6; i++) { eAsks.push(orient(await ep.evaluate(() => window.__gifosVideo.forceAdapt()))); await sleep(200); }
  const eAfter = await ep.evaluate(() => window.__gumCount);
  check('a camera that CANNOT do portrait is asked once and accepted (no re-grab loop)',
    eAfter === eBefore, eBefore + ' -> ' + eAfter + ' grabs across 6 sweeps');
  check('the ask itself stays stable against an uncooperative camera',
    new Set(eAsks).size === 1, eAsks.join(','));
  await eCtx.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
