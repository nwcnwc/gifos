// THE KNOCK WAITS FOR NOBODY — the regression guard for the 2026-08-04 demo.
//
// The bug this guards: bootIntoRoom() awaited getUserMedia before joinRoom(),
// and a permission prompt is ALLOWED TO NEVER SETTLE — iOS leaves it pending
// until a human decides; an in-app webview can hang it indefinitely. A joiner
// wedged there never sent the FIRST entry frame: the monitor bot recorded
// three straight hours of demo-night join attempts in which not one knock
// reached the room, while phones sat on a page that looked like connecting.
//
// WHY NO GATE CAUGHT IT: every simulated phone here is Chromium with
// --use-fake-ui-for-media-stream (prompts auto-grant in milliseconds) or the
// meet.js canvas shim (instant), so knock-after-gUM was indistinguishable
// from knock-first in every test universe the gate had. The state "the
// prompt never settles" had simply never been manufactured. It does not need
// an iPhone: this file overrides getUserMedia with a Promise that never
// resolves — the exact iOS shape — in plain Chromium.
//
// The contract asserted: with gUM permanently pending,
//   (1) the entrant still SEATS (the dance never waited on media),
//   (2) a normal second party sees them (occ=2 — they are a real participant),
//   (3) their page is honest about it (no crash; the me-tile carries no
//       stream yet), and
//   (4) media arriving LATE (the prompt finally settling) attaches without a
//       reload — the lateMedia/bootGumPending path (the second half of the
//       fix: a tap during the pending ask must JOIN it, never race it).
//
// Needs: python3 -m http.server 8099 -d site ; node test/servers/relay-local.js
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'knockfirst-' + Math.random().toString(36).slice(2, 8);

  // ---- the iPhone-shaped entrant: a prompt that NEVER settles --------------
  const iCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await iCtx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Pending')}catch(e){}");
  await iCtx.addInitScript(() => {
    // The pending prompt, verbatim: gUM returns and never settles. Keep a
    // hook so act 4 can settle it late, like a human finally tapping Allow.
    window.__settleGum = null;
    const mk = () => new Promise((res) => {
      window.__settleGum = () => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 180;
        const x = c.getContext('2d'); const paint = () => { x.fillStyle = '#264'; x.fillRect(0, 0, 320, 180); };
        paint(); setInterval(paint, 500);
        res(c.captureStream(5));
      };
    });
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = mk;
  });
  const ip = await iCtx.newPage();
  ip.on('pageerror', (e) => console.log('  [pending] ' + e.message));
  await ip.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');

  // (1) seated while the prompt is still pending
  let seated = null;
  for (let t = 0; t < 30 && !seated; t++) { await sleep(1000); seated = await ip.evaluate(() => window.__gifosVideo.meshCoord()).catch(() => null); }
  check('the entrant SEATS while getUserMedia is still pending (the knock never waited)', !!seated, { seated });

  // (3) honest, alive page: no stream on the me-tile, mesh state 3
  const st = await ip.evaluate(() => { const V = window.__gifosVideo; const vv = document.querySelector('video'); return { mesh: (V.meshState ? V.meshState() : {}).state, haveStream: !!(vv && vv.srcObject) }; }).catch(() => null);
  check('…mesh state 3 with NO local stream (view-only-shaped, not crashed)', !!st && st.mesh === 3 && !st.haveStream, st);

  // ---- (2) a normal second party sees a real participant -------------------
  const nCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await nCtx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Norm')}catch(e){}");
  const np = await nCtx.newPage();
  await np.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');
  let both = false;
  for (let t = 0; t < 30 && !both; t++) {
    await sleep(1000);
    const o = await np.evaluate(() => (window.__gifosVideo.meshState ? window.__gifosVideo.meshState() : {}).occ).catch(() => null);
    if (o >= 2) both = true;
  }
  check('a normal joiner sees the pending-prompt entrant as a REAL participant (occ>=2)', both);

  // ---- (4) the prompt finally settles: media attaches, no reload -----------
  await ip.evaluate(() => window.__settleGum && window.__settleGum());
  let got = false;
  for (let t = 0; t < 15 && !got; t++) {
    await sleep(1000);
    got = await ip.evaluate(() => { const vv = document.querySelector('video'); return !!(vv && vv.srcObject && vv.srcObject.getVideoTracks().length); }).catch(() => false);
  }
  check('the LATE grant attaches the camera with no reload (bootGumPending / lateMedia path)', got);

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
