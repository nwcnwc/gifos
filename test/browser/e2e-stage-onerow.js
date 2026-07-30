// e2e-stage-onerow.js — THE STAGE IN A ONE-ROW ROOM (the shape real meetings
// actually have).
//
// 2026-07-29, prod room "test", 4 people all seated in row 0 of section 0:
// the stager's feed reached every receiver as a ~2-frame flash followed by
// black, forever, cycling. Live forensics from the monitor showed the
// receiver's claimed stream id CHANGING every ~5 s (MOS_GRACE):
//
//   7caa12d6@nc … (4.5s) … none … 57fde0cb@moto … 2884e4a6@nc … 82d3d4bc@nc
//
// A NEW container id per cycle means the SENDER unshipped and re-shipped:
// shipMos mints a fresh container MediaStream per ship. Each teardown strips
// the tracks out of the container the receiver already claimed (vTracks
// 1 → 0), and — because every other seat re-floods the copy IT received —
// kills every relayed copy in the room at the same time. Nobody can hold a
// live stage feed; the Stage had never once worked in this shape.
//
// e2e-mosaic covers the DEEP stager in a multi-section tree and passes; this
// room never gets there. Here beyondRow is FALSE (one row is the whole room)
// and the Stage alone keeps the mosaic alive — a distinct code path.
//
// The bar: with the room stationary, a receiver's claimed stage feed must
// keep ONE stream id and keep decoding. Churn is the failure.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 4; // default C=5 ⇒ all four land in row 0 of section 0: ONE row
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'stg1' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','S${i}')}catch(e){}` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [S${i}] PAGEERROR`, String(e).slice(0, 200)));
    await page.goto(BASE + '/meet.html#v=' + room + '&DEBUG=on');
    pages.push(page);
    await sleep(1200);
  }
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 90000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean)) break;
    await sleep(1500);
  }
  const cstr = (c) => c ? c.pc + '/' + c.r + '.' + c.i : '?';
  const oneRow = coords.every((c) => c && c.pc === 0 && c.r === coords[0].r);
  check('all 4 seated in ONE row at Section 1 (the real-meeting shape)', oneRow, coords.map(cstr));

  // Consenting: camera on, No blur — these legs measure PIPES, not policy.
  for (const p of pages) {
    await p.evaluate(() => {
      const none = document.getElementById('blur-none'); if (none) none.click();
      const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
    }).catch(() => {});
  }
  await sleep(3000);

  const stagerIdx = 1; // a plain row seat, not the head — the prod case
  await pages[stagerIdx].evaluate(() => { const m = document.getElementById('mic'); if (m && m.classList.contains('off')) m.click(); }).catch(() => {});
  const stepped = await pages[stagerIdx].evaluate(() => window.__gifosVideo.stageForTest(true));
  check('the row seat steps onto the stage', stepped === true, { stager: 'S' + stagerIdx + '@' + cstr(coords[stagerIdx]) });
  let agree = 0;
  for (let i = 0; i < N; i++) {
    const ok = await pages[i].waitForFunction(() => window.__gifosVideo.stageIds().length === 1, null, { timeout: 25000 }).then(() => true).catch(() => false);
    if (ok) agree++;
  }
  check('every seat agrees on the stage set', agree === N, { agree });
  await sleep(12000); // let the lane settle before judging stability

  // ---- THE CHURN ASSERTION -------------------------------------------------
  // Sample a receiver's claimed stage feed for 30 s. A stationary room must
  // hold ONE stream id with tracks attached the entire time.
  const rxIdx = (stagerIdx + 1) % N;
  const sampleFor = async (idx, secs) => {
    const out = []; const tS = Date.now();
    while (Date.now() - tS < secs * 1000) {
      const s = await pages[idx].evaluate(() => {
        const cv = (window.__gifosVideo.mosaic().claimVia || []).find((x) => x.rk.indexOf('stg:') === 0);
        const f = (window.__gifosVideo.feedsInfo() || []).find((x) => x.key.indexOf('stg:') === 0);
        return { sid: cv ? cv.sid.slice(0, 8) : null, vt: f ? f.vTracks : -1, frames: f ? f.frames : -1 };
      }).catch(() => ({ sid: null, vt: -2, frames: -2 }));
      out.push(s);
      await sleep(1500);
    }
    return out;
  };
  const samples = await sampleFor(rxIdx, 30);
  const sids = [...new Set(samples.map((s) => s.sid).filter(Boolean))];
  const trackless = samples.filter((s) => s.vt === 0).length;
  const firstF = samples.find((s) => s.frames > 0), lastF = [...samples].reverse().find((s) => s.frames > 0);
  const advanced = !!(firstF && lastF && lastF.frames > firstF.frames + 10);

  check('the claimed stage feed keeps ONE stream id for 30 s (no re-ship churn)',
    sids.length === 1, { distinctSids: sids.length, sids, trail: samples.map((s) => (s.sid || 'none') + ':' + s.vt).join(' ') });
  check('the claimed stage feed never goes TRACKLESS (no husk under the claim)',
    trackless === 0, { tracklessSamples: trackless, of: samples.length });
  check('decoded frames advance steadily across the window (>10 in 30 s)',
    advanced, { first: firstF && firstF.frames, last: lastF && lastF.frames });

  // ---- TEARDOWN LEAVES NO PAINTED RESIDUE ---------------------------------
  // In a ONE-ROW room beyondRow is false, so the Stage alone keeps the mosaic
  // alive: stepping down drives exactly the teardown branch that stranded a
  // permanent black "The stadium" square in prod (collections empty, tile
  // still painted, so the sweep skipped stopMosaic forever). No departures,
  // no mesh timing — just the branch, deterministically.
  await pages[stagerIdx].evaluate(() => window.__gifosVideo.stageForTest(false));
  let cleared = 0;
  for (let i = 0; i < N; i++) {
    const ok = await pages[i].waitForFunction(
      () => window.__gifosVideo.stageIds().length === 0
        && !document.querySelector('#stagefeed video')
        && !document.querySelector('[data-row="sd"]'),
      null, { timeout: 30000 }).then(() => true).catch(() => false);
    if (ok) cleared++;
  }
  check('step-down clears BOTH painted surfaces everywhere (no residue)', cleared === N, { cleared, of: N });

  // ---- THE UNIVERSAL INVARIANT: NOBODY CLAIMS WHAT THEY PRODUCED -----------
  // Both 2026-07-29 echo bugs (the stage flood, and x2/sdrow after a move) are
  // one class: a seat claims a feed it originated, then re-ships it under the
  // key its OWN production already owns. mosResolve enforces this per-slot
  // (x1/sdm/sdn/sdx always did; stg/sdrow/x2 didn't). Assert the whole class
  // at once, on every seat, so the next slot to forget it fails here.
  const selfClaims = [];
  for (let i = 0; i < N; i++) {
    const v = await pages[i].evaluate(() => {
      const c = window.__gifosVideo.meshCoord(); if (!c) return [];
      const pid = (window.__gifosVideo.debugDump().me || {}).peer;
      return (window.__gifosVideo.mosaic().claims || []).filter((k) =>
        k === 'stg:' + pid || k === 'x2:' + c.r || (c.i === 0 && k === 'sdrow:' + c.r));
    }).catch(() => []);
    if (v.length) selfClaims.push({ seat: 'S' + i + '@' + cstr(coords[i]), claims: v });
  }
  check('no seat claims a feed it produced itself (stg/sdrow/x2 echo class)', selfClaims.length === 0, selfClaims);

  const fs = require('fs');
  const SHOTDIR = process.env.SHOTDIR || '/tmp/e2e-stage-onerow';
  fs.mkdirSync(SHOTDIR, { recursive: true });
  await pages[rxIdx].screenshot({ path: SHOTDIR + '/receiver-stage.png' }).catch(() => {});
  console.log('  screenshot → ' + SHOTDIR + '/receiver-stage.png');

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
