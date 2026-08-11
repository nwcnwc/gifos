/*
 * stage-solo-lag.js — HOW FAR BEHIND IS THE STAGE TILE IN A ROOM OF ONE?
 *
 * "The stage feels laggy even when there is just one person in the room."
 * That is answerable on ONE box, because in a solo room there is no topology
 * and no network in the path at all: every hop between the camera and the
 * Stage tile is local to the tab. (test/README.md's "ONE BOX CANNOT ANSWER…"
 * rule is about cross-device TIMING; this measures a within-tab delta — the
 * me tile and the strip, same page, same clock — which is exactly what one box
 * CAN answer.)
 *
 * The instrument is a COUNTING CAMERA. getUserMedia is faked to a canvas whose
 * whole field is a flat luminance code (code*8, 30 codes, stepped at 15Hz) and
 * every code is stamped with performance.now(). The page then decodes that
 * code back out of two <video> elements and subtracts:
 *   - '.tile.me video'          — what the seat sends/shows directly, and
 *   - '[data-row="sgs"] video'  — the composited Stage strip it watches itself
 *                                 through once it steps up.
 * FLAT, not a bar pattern, on purpose: blur is the privacy steady state
 * (myStatus.blur = 2, and blurLevelFor() floors at 1 in any room without a
 * password + full consent), so the me tile is ALREADY a blur-pipe canvas and
 * any fine pattern is destroyed before it reaches either video.
 *
 * Reads, on a fresh solo room, after stepping onto the Stage:
 *   lagP50/P90   the two videos' delay behind capture, in ms
 *   packer       stripPack.stats() + drawn/dropped/still per second
 *   outboundJobs the ships this composite feeds — [] in a room of one
 *
 * Self-contained (spawns its own relay + static server for THIS checkout).
 *   node test/tools/stage-solo-lag.js
 * Not a gate and not a guard: it asserts nothing, it MEASURES. Reading it is
 * the point.
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const RELAY_PORT = parseInt(process.env.SOLO_RELAY_PORT || '8894', 10);
const SITE_PORT = parseInt(process.env.SOLO_SITE_PORT || '8895', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const SITE = path.join(__dirname, '..', '..', 'site');
const SHOT = process.env.SOLO_SHOT || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FAKE_CAM = `(() => {
  const S = 240, STEP = 8, LEVELS = 30, HZ = 15;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const cx = cv.getContext('2d');
  window.__probeDraw = new Map(); window.__probeCode = { STEP, LEVELS };
  let n = 0;
  function tick() {
    const code = n % LEVELS; n++;
    const g = code * STEP;
    cx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; cx.fillRect(0, 0, S, S);
    cx.fillStyle = '#fff'; cx.fillRect((n * 7) % (S - 16), 2, 14, 14); // liveness marker, clear of the centre patch
    window.__probeDraw.set(code, performance.now());
  }
  setInterval(tick, 1000 / HZ); tick();
  const stream = cv.captureStream(30);
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    const want = c || {}; const out = new MediaStream();
    if (want.video) { const t = stream.getVideoTracks()[0].clone(); t.applyConstraints = () => Promise.resolve(); out.addTrack(t); }
    if (want.audio) { try { const a = await orig({ audio: want.audio }); a.getAudioTracks().forEach((t) => out.addTrack(t)); } catch (e) {} }
    return out;
  };
})();`;

// Decode the camera's code out of a <video>, once per PRESENTED frame.
// presentedFps is the browser's presentation rate (depressed in headless —
// compare the two videos to each other, never to 30); lag is the honest number.
const MEASURE = ([sel, ms]) => new Promise((resolve) => {
  const v = document.querySelector(sel);
  if (!v) return resolve({ err: 'no video ' + sel });
  const STEP = window.__probeCode.STEP, LEVELS = window.__probeCode.LEVELS;
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
  const lats = []; let frames = 0, misses = 0, lastCode = -1, changes = 0;
  const t0 = performance.now();
  const step = () => {
    const now = performance.now();
    const w = v.videoWidth, h = v.videoHeight;
    if (w && h) {
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      try { cx.drawImage(v, 0, 0, w, h); } catch (e) {}
      // a 9x9 patch at the centre: inside the flat field, clear of the strip's
      // burned name plate (bottom ~11%) and its green talking frame (edges)
      const d = cx.getImageData(Math.round(w / 2) - 4, Math.round(h / 2) - 4, 9, 9).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i];
      const lum = sum / (d.length / 4);
      const code = Math.round(lum / STEP);
      frames++;
      if (code !== lastCode) { changes++; lastCode = code; }
      // reject a level we cannot pin to a code (mid-transition), and any hit
      // older than the code wheel's own wrap (LEVELS/HZ = 2s)
      const drew = (code >= 0 && code < LEVELS && Math.abs(lum - code * STEP) < STEP * 0.35) ? window.__probeDraw.get(code) : undefined;
      if (drew !== undefined && now - drew < 1900) lats.push(now - drew); else misses++;
    }
    if (performance.now() - t0 < ms) { if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step); else setTimeout(step, 16); return; }
    const secs = (performance.now() - t0) / 1000;
    lats.sort((a, b) => a - b);
    const pct = (p) => (lats.length ? Math.round(lats[Math.min(lats.length - 1, Math.floor(lats.length * p))]) : -1);
    resolve({ presentedFps: Math.round(frames / secs * 10) / 10, samples: lats.length, misses,
      lagP50: pct(0.5), lagP90: pct(0.9), vw: v.videoWidth, vh: v.videoHeight });
  };
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step); else setTimeout(step, 16);
});

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', SITE], { stdio: 'ignore' });
  process.on('exit', () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} });
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await ctx.addInitScript({ content: FAKE_CAM
    + `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','Solo');localStorage.setItem('gifos_meet_bar','0')}catch(e){}` });
  const page = await ctx.newPage();
  const room = 'solo' + Math.random().toString(36).slice(2, 7);
  await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 });

  const seated = await page.waitForFunction(() => window.__gifosVideo && __gifosVideo.meshCoord(), null, { timeout: 60000 }).then(() => true).catch(() => false);
  console.log('seated:', seated, await page.evaluate(() => { const c = __gifosVideo.meshCoord(); return c ? c.pc + '/' + c.r + '.' + c.i : null; }).catch(() => null));

  await page.evaluate(() => { const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); });
  await page.waitForFunction(() => !document.getElementById('cam').classList.contains('off'), null, { timeout: 20000 }).catch(() => {});
  await sleep(2500);
  console.log('outbound:', await page.evaluate(() => __gifosVideo.outboundKind() + '  blurLvl=' + __gifosVideo.myBlur()).catch((e) => String(e)));

  console.log('\n--- OFF STAGE — the direct me tile (baseline) ---');
  console.log('me tile     ', await page.evaluate(MEASURE, ['.tile.me video', 6000]));

  const staged = await page.evaluate(() => __gifosVideo.stageForTest(true)).catch((e) => String(e));
  const strip = await page.waitForFunction(() => { const v = document.querySelector('[data-row="sgs"] video'); return !!(v && v.videoWidth); }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  console.log('\nstepped on stage:', staged, ' strip painted:', strip);
  await sleep(2500);

  console.log('\n--- ON STAGE, alone in the room ---');
  console.log('me tile     ', await page.evaluate(MEASURE, ['.tile.me video', 8000]));
  const s0 = await page.evaluate(() => __gifosVideo.stageInfo().strip);
  console.log('stage strip ', await page.evaluate(MEASURE, ['[data-row="sgs"] video', 8000]));
  const s1 = await page.evaluate(() => __gifosVideo.stageInfo().strip);
  console.log('packer      ', s1);
  console.log('  over 8s:  drawn/s=' + Math.round((s1.drawn - s0.drawn) / 8 * 10) / 10
    + '  dropped/s=' + Math.round((s1.dropped - s0.dropped) / 8 * 10) / 10
    + '  still/s=' + Math.round((s1.still - s0.still) / 8 * 10) / 10);
  console.log('mosaic      ', await page.evaluate(() => { const m = __gifosVideo.mosaic(); return { outboundJobs: m.jobs, claims: m.claims, stagers: m.stagers }; }).catch((e) => String(e)));
  console.log('on screen   ', await page.evaluate(() => ({
    meTileStillShown: !!document.querySelector('.tile.me'),
    meTileOnStageClass: document.querySelector('.tile.me').classList.contains('onstage'),
    stageFeedTiles: document.querySelectorAll('#stagefeed .rowtile').length,
  })));
  if (SHOT) { await page.screenshot({ path: SHOT }); console.log('screenshot  ', SHOT); }

  await browser.close();
  relay.kill(); site.kill();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
