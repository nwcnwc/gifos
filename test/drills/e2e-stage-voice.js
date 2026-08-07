// e2e-stage-voice.js — CAN THE ROOM HEAR A STAGER WHOSE CAMERA IS OFF?
//
// The bug this exists for (found 2026-08-06 chasing the redundancy quarantine,
// fixed the same night): `mySelfStream()` bailed on `if (!v) return null` and
// threw away the audio track it had just fetched. run.html boots JOIN-QUIET
// (`myStatus = { muted: true, camOff: true }`) and the camera idle-stop STOPS
// AND REMOVES the video track after 20s of camOff, so sentVideoTrack() goes
// null — and while staged that aux stream is the ONLY way anything leaves the
// device, because refreshOutbound parks the main senders ("stagers live on the
// Stage ONLY"). A staged member with the camera off therefore went SILENT to
// the whole room about twenty seconds in. Measured before the fix: at +10s
// every listener held the feed and heard it, at +20s the stager's stg jobs
// were 0, at +30s the listeners had dropped the claim entirely.
//
// THE SHAPE, and why it is timed the way it is: the failure only appears AFTER
// the 20s idle-stop, so every assertion here is made on the far side of that
// window. A test that samples at +10s passes against the broken build.
//
//   ARM A (the bug): three seats, one steps on stage CAMERA OFF and MUTED —
//     the join-quiet default, one click from a real user. Past the idle-stop
//     the stager must still be shipping and every listener must still hold the
//     feed; then it UNMUTES and every listener must HEAR it.
//   ARM B (the control): same room, camera ON. Everything above, plus the feed
//     must still carry VIDEO — the fix must not have traded the camera path.
//
// Self-contained: spawns its OWN relay + static server for THIS checkout's
// site/, like the other drills. Run: node test/drills/e2e-stage-voice.js
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const RELAY_PORT = parseInt(process.env.VOICE_RELAY_PORT || '8891', 10);
const SITE_PORT = parseInt(process.env.VOICE_SITE_PORT || '8893', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const N = 3;
// The camera idle-stop fires 20s after camOff (reactCamIdle). Every assertion
// about the bug lives past it, with margin for a loaded box: the continuity
// window below is 30s long and starts only once the feed is ESTABLISHED, so it
// always straddles the idle-stop however slowly the room came up.
const IDLE_STOP_MS = 20000;   // documented here because it is the clock this drill is timed against
const PAST_IDLE_MS = Math.max(30000, IDLE_STOP_MS + 10000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); if (!c) failures++; };
const loadNow = () => { try { return parseFloat(require('fs').readFileSync('/proc/loadavg', 'utf8').split(' ')[0]); } catch (e) { return -1; } };

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let relayErr = '', relayGone = null;
  relay.stderr.on('data', (b) => { relayErr = (relayErr + String(b)).slice(-2000); });
  relay.on('exit', (code) => { relayGone = code; });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  process.on('exit', () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} });
  await sleep(900);
  if (relayGone !== null) { check('the drill\'s own relay is up on ' + RELAY_PORT, false, 'exited ' + relayGone + ': ' + relayErr.slice(-200)); console.log('\n1 FAILED'); process.exit(1); }

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });

  // ---- one arm ------------------------------------------------------------
  // camOn=false is the bug's shape; camOn=true is the control.
  async function arm(camOn) {
    const tag = camOn ? 'CAMERA ON (control)' : 'CAMERA OFF';
    console.log('\n===== ARM: ' + tag + ' =====');
    const room = 'voice' + Math.random().toString(36).slice(2, 7);
    const pages = [];
    for (let i = 0; i < N; i++) {
      const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      await ctx.addInitScript({ content: 'window.GIFOS_SCALE={C:2};'
        + `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}` });
      const page = await ctx.newPage();
      await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 });
      pages.push(page);
      await sleep(1200);
    }
    const coordOf = (p) => p.evaluate(() => { const c = window.__gifosVideo && __gifosVideo.meshCoord(); return c ? c.pc + '/' + c.r + '.' + c.i : null; }).catch(() => null);
    let coords = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) { coords = await Promise.all(pages.map(coordOf)); if (coords.every(Boolean)) break; await sleep(2000); }
    check('[' + tag + '] all ' + N + ' seated', coords.every(Boolean), coords);

    // P0 is the stager. Its START state is the product's own default — asserted,
    // not assumed, because the whole bug lives in that default.
    const start = await pages[0].evaluate(() => ({
      micOff: document.getElementById('mic').classList.contains('off'),
      camOff: document.getElementById('cam').classList.contains('off'),
    }));
    check('[' + tag + '] the room boots JOIN-QUIET (mic muted, camera off)', start.micOff === true && start.camOff === true, start);
    if (camOn) {
      await pages[0].evaluate(() => { const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); }).catch(() => {});
      const up = await pages[0].waitForFunction(() => !document.getElementById('cam').classList.contains('off'), null, { timeout: 20000 }).then(() => true).catch(() => false);
      check('[' + tag + '] the stager turned its camera on', up);
    }
    const stagerId = await pages[0].evaluate(() => __gifosVideo.debugDump().me.peer);
    const staged = await pages[0].evaluate(() => __gifosVideo.stageForTest(true)).catch(() => null);
    check('[' + tag + '] the stager stepped on Stage', staged === true, staged);
    let agree = 0;
    for (const p of pages) if (await p.waitForFunction(() => __gifosVideo.stageIds().length === 1, null, { timeout: 30000 }).then(() => true).catch(() => false)) agree++;
    check('[' + tag + '] every seat agrees on the stage set', agree === N, { agree });

    // ---- ACROSS THE IDLE-STOP ---------------------------------------------
    // Poll from the moment it steps up until well past 20s: the stager must
    // never stop shipping, and no listener may lose the claim. Sampled, not
    // spot-checked at the end, because the broken build DID hold both for the
    // first ten seconds — the collapse is what has to be caught.
    const shipOf = () => pages[0].evaluate(() => {
      const m = __gifosVideo.mosaic();
      return { jobs: (m.jobs || []).filter((k) => k.indexOf('stg:') === 0).length,
        memo: (m.selfMemo || []).length, camOff: document.getElementById('cam').classList.contains('off') };
    }).catch(() => null);
    const heldOf = (i) => pages[i].evaluate((sid) => {
      const m = __gifosVideo.mosaic();
      const f = (__gifosVideo.feedsInfo() || []).find((x) => x.key === 'stg:' + sid);
      return { held: (m.claims || []).indexOf('stg:' + sid) >= 0, vw: f ? f.vw : -1,
        aTracks: f ? f.aTracks : -1, vTracks: f ? f.vTracks : -1,
        sid: ((m.claimVia || []).find((x) => x.rk === 'stg:' + sid) || {}).sid || null };
    }, stagerId).catch(() => null);

    // ESTABLISHED FIRST, THEN CONTINUOUS. The feed takes a sweep or two to
    // reach the listeners, so counting from the instant of stepping up would
    // measure the ship that has not happened yet — the first version of this
    // leg did exactly that and reported minJobs 0 in BOTH arms, including the
    // control, which is the test's clock and not the product. The property
    // this bug is about is different and sharper: the feed comes up and then
    // DIES at the idle-stop. So wait for it to be up, and require it to stay.
    let est = null;
    const tE0 = Date.now();
    while (Date.now() - tE0 < 45000) {
      const s = await shipOf();
      const hs = [];
      for (let i = 1; i < N; i++) hs.push(await heldOf(i));
      if (s && s.jobs > 0 && hs.every((h) => h && h.held)) { est = { atMs: Date.now() - tE0, jobs: s.jobs }; break; }
      await sleep(1500);
    }
    check('[' + tag + '] the stage feed reaches every listener at all', !!est, est || 'never established in 45s');

    const tS = Date.now();
    let minJobs = 99, everDropped = null, sids = [new Set(), new Set()], lastShip = null;
    while (Date.now() - tS < PAST_IDLE_MS) {
      const s = await shipOf(); if (s) { lastShip = s; minJobs = Math.min(minJobs, s.jobs); }
      for (let i = 1; i < N; i++) {
        const h = await heldOf(i);
        if (h) {
          if (h.sid) sids[i - 1].add(String(h.sid).slice(0, 8));
          if (!h.held && !everDropped) everDropped = { seat: 'P' + i, atMs: Date.now() - tS };
        }
      }
      await sleep(2000);
    }
    check('[' + tag + '] the ESTABLISHED stg feed never stops shipping (across the 20s camera idle-stop)',
      minJobs > 0, { minJobsSeen: minJobs, window: PAST_IDLE_MS + 'ms', ship: lastShip });
    check('[' + tag + '] no listener ever loses the stg claim', !everDropped, everDropped || 'held throughout');

    const held = [];
    for (let i = 1; i < N; i++) held.push(await heldOf(i));
    check('[' + tag + '] every listener still HOLDS the feed past the idle-stop', held.every((h) => h && h.held), held);
    check('[' + tag + '] the feed carries AUDIO at every listener', held.every((h) => h && h.aTracks > 0), held.map((h) => h && h.aTracks));
    if (camOn) {
      check('[' + tag + '] the camera path is unchanged: the feed still carries VIDEO, at content size',
        held.every((h) => h && h.vTracks > 0 && h.vw > 0), held.map((h) => h && { v: h.vTracks, vw: h.vw }));
    } else {
      check('[' + tag + '] a camera-off stager ships an AUDIO-ONLY feed (no video track to fake)',
        held.every((h) => h && h.vTracks === 0), held.map((h) => h && h.vTracks));
    }

    // ---- AND THE ROOM HEARS IT --------------------------------------------
    // The ear is the product's own: stageEarLevel() is the peak of the folded
    // per-stager audio a listener actually PLAYS. Muted first (reported, not
    // asserted — silence has its own guarantees), then unmuted, which is the
    // scenario itself: staged, camera off, and you unmute to speak.
    const earOf = (i) => pages[i].evaluate(() => __gifosVideo.stageEarLevel(1200)).catch(() => -1);
    const mutedLvl = [];
    for (let i = 1; i < N; i++) mutedLvl.push(await earOf(i));
    console.log('   MEASURE stage-ear peak while the stager is MUTED: ' + JSON.stringify(mutedLvl));
    await pages[0].evaluate(() => { const m = document.getElementById('mic'); if (m && m.classList.contains('off')) m.click(); }).catch(() => {});
    const unmuted = await pages[0].waitForFunction(() => !document.getElementById('mic').classList.contains('off'), null, { timeout: 15000 }).then(() => true).catch(() => false);
    check('[' + tag + '] the stager unmuted', unmuted);
    let heard = new Array(N - 1).fill(0);
    const tE = Date.now();
    while (Date.now() - tE < 20000) {
      for (let i = 1; i < N; i++) { const l = await earOf(i); if (l > heard[i - 1]) heard[i - 1] = l; }
      if (heard.every((l) => l > 0.02)) break;
      await sleep(1500);
    }
    check('[' + tag + '] EVERY listener HEARS the stager after it unmutes', heard.every((l) => l > 0.02),
      { peaks: heard.map((l) => Math.round(l * 1000) / 1000), afterMs: Date.now() - tE });

    // ---- and the fix must not have bought this with churn ------------------
    // Losing the camera legitimately re-ships ONCE (the container goes from two
    // m-lines to one). The memo exists to stop per-sweep re-minting, so the
    // count is the guard: 'first', plus at most the video-gone transition.
    const memo = await pages[0].evaluate(() => (__gifosVideo.mosaic().selfMemo || []).map((x) => x.why)).catch(() => []);
    check('[' + tag + '] the self stream is not churning (<=3 identity changes in the whole run)', memo.length <= 3, memo);
    for (let i = 1; i < N; i++) {
      check('[' + tag + '] listener P' + i + ' saw at most 2 container ids for the feed', sids[i - 1].size <= 2, [...sids[i - 1]]);
    }
    for (const p of pages) { try { await p.context().close(); } catch (e) {} }
  }

  console.log('loadavg at start: ' + loadNow());
  await arm(false);
  await arm(true);
  await browser.close();
  console.log('loadavg at end: ' + loadNow());
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
