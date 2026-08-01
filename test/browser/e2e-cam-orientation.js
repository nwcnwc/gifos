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

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
