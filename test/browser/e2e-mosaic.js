// e2e-mosaic.js — the fractal mosaic K-sweep (docs/media-plane.md, 3b).
// Six browsers at GIFOS_SCALE C=2 (a section is 2×2 = 4 seats) force a
// depth-2 tree: two members seat DEEP, the room is multi-section, and the
// mosaic engine activates. The claim under test is the media plane's whole
// point: a seat that is NOT directly linked to most of the room still SEES
// the room — the Stadium tile carries live pixels at every seat, assembled
// hop-by-hop over the tree's own links (product up, S1 exchange, fan down).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 6;
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'mos' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 200)));
    await page.goto(BASE + '/meet.html#v=' + room + '&DEBUG=on'); // DEBUG=on: the stage legs sever pairs
    pages.push(page);
    await sleep(1200);
  }

  // Everyone seats; at least one lands deep (6 people, 4 Section-1 seats).
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 90000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean) && coords.some((c) => c.pc !== 0)) break;
    await sleep(1500);
  }
  const deepIdx = coords.findIndex((c) => c && c.pc !== 0);
  const s1Idx = coords.findIndex((c) => c && c.pc === 0);
  check('all 6 seated; at least one DEEP seat exists', coords.every(Boolean) && deepIdx >= 0, coords);

  // Consenting participants: camera ON, No blur. A raw page joins camOff +
  // blur Max, and a camOff stager broadcasts a black canvas — which is a
  // legitimate state, but these legs measure the PIPES, so the content must
  // be provably bright (the fake device's animation).
  for (const p of pages) {
    await p.evaluate(() => {
      const none = document.getElementById('blur-none'); if (none) none.click();
      const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
    }).catch(() => {});
  }
  let camsOn = 0;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => { const cam = document.getElementById('cam'); return cam && !cam.classList.contains('off'); }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    if (ok) camsOn++;
  }
  check('all 6 cameras ON (No blur)', camsOn === N, { camsOn });

  // The Stadium tile goes LIVE at a deep seat and at a Section-1 seat.
  const liveAt = async (idx) => {
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      const m = await pages[idx].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
      if (m && m.tile && m.tile.live) return m;
      await sleep(2000);
    }
    return await pages[idx].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
  };
  const mDeep = await liveAt(deepIdx);
  check('DEEP seat renders live Stadium pixels', !!(mDeep && mDeep.tile && mDeep.tile.live), mDeep);
  const mS1 = await liveAt(s1Idx);
  check('Section-1 seat renders live Stadium pixels', !!(mS1 && mS1.tile && mS1.tile.live), mS1);

  // ---- THE STAGE MUST CARRY LIVE PIXELS AND SOUND TO EVERY NON-STAGER -------
  // 2026-07-29, prod room "test": the stage was a BLACK SQUARE at every
  // receiver, on every attempt, while every health flag stayed green. A
  // stager parks its MAIN senders and lives on the 'stg:' feed ALONE
  // (docs/media-plane.md), so a starved stage feed is a TOTAL blackout of
  // that person — no fallback, and (the bug) no healer: the fb starve
  // tracker never armed for 'stg:*'. The bar here is therefore PIXELS AND
  // SOUND, never flags: the strip <video> must be non-black AND changing,
  // decoded frames must advance, the stage EAR must register the stager's
  // tone, and all of it must survive the stager toggling the mic (the prod
  // correlate) AND the loss of the current provider (recovery ≤ 22 s, the
  // media starve-rebuild budget). Screenshots saved for human confirmation.
  const fs = require('fs');
  const SHOTDIR = process.env.SHOTDIR || '/tmp/e2e-mosaic-stage';
  fs.mkdirSync(SHOTDIR, { recursive: true });
  const coordStr = (i) => coords[i] ? coords[i].pc + '/' + coords[i].r + '.' + coords[i].i : '?';
  const pixSample = (pg) => pg.evaluate(() => {
    const v = document.querySelector('#stagefeed video');
    if (!v) return { err: 'no strip video' };
    if (!v.videoWidth) return { err: 'strip video 0x0' };
    const c = document.createElement('canvas'); c.width = 48; c.height = 27;
    const x = c.getContext('2d'); x.drawImage(v, 0, 0, 48, 27);
    const d = x.getImageData(0, 0, 48, 27).data;
    let sum = 0, mx = 0; const sig = [];
    for (let i2 = 0; i2 < d.length; i2 += 4) { const l = d[i2] + d[i2 + 1] + d[i2 + 2]; sum += l; if (l > mx) mx = l; }
    // signature strided across the WHOLE frame — a corner-only sample reads a
    // static letterbox bar as "frozen" while the content moves
    const step = Math.max(4, (d.length >> 6) & ~3);
    for (let i2 = 0; i2 < d.length; i2 += step) sig.push(d[i2]);
    return { w: v.videoWidth, h: v.videoHeight, mean: +(sum / (d.length / 4) / 765).toFixed(4), max: +(mx / 765).toFixed(3), sig: sig.join(',') };
  }).catch((e) => ({ err: String(e).slice(0, 120) }));
  // live = non-black AND the pixel signature CHANGES between two samples.
  const stripLiveAt = async (idx, secs) => {
    const t2 = Date.now(); let a = null, b = null;
    while (Date.now() - t2 < secs * 1000) {
      a = await pixSample(pages[idx]);
      if (!a.err && a.max > 0.05) {
        await sleep(1200);
        b = await pixSample(pages[idx]);
        if (!b.err && b.max > 0.05 && b.sig !== a.sig) return { ok: true, mean: b.mean };
      }
      await sleep(1500);
    }
    return { ok: false, a: a && { err: a.err, mean: a.mean, max: a.max }, b: b && { err: b.err, mean: b.mean, max: b.max } };
  };
  // decoded frames must ADVANCE for the stage feed (sgs at deep seats,
  // stg:* at Section-1) — the flag-proof decode-liveness bar.
  const framesAdvance = async (idx) => {
    // frames rides the RENDER path (getVideoPlaybackQuality), which Chrome
    // throttles for tiny/offscreen elements — the watchdog-v1 lesson. One
    // frozen 2s window is not evidence; retry for up to 20s.
    const grab = () => pages[idx].evaluate(() => (window.__gifosVideo.feedsInfo() || [])
      .filter((f) => f.key === 'sgs' || f.key.indexOf('stg:') === 0)
      .map((f) => ({ key: f.key.slice(0, 14), frames: f.frames, vw: f.vw }))).catch(() => []);
    const tF = Date.now(); let f1 = await grab(), f2 = f1;
    while (Date.now() - tF < 20000) {
      await sleep(2000); f2 = await grab();
      for (const b2 of f2) { const a2 = f1.find((x) => x.key === b2.key); if (a2 && b2.frames > a2.frames && b2.frames > 0) return { ok: true, key: b2.key, frames: b2.frames }; }
      f1 = f2;
    }
    return { ok: false, before: f1, after: f2 };
  };

  const stagerIdx = deepIdx; // the prod shape: the stager sat outside row 0
  // The stager speaks: mic ON (fake device = a tone the EAR legs can measure);
  // everyone else stays muted so the only room audio IS the stage.
  await pages[stagerIdx].evaluate(() => { const m = document.getElementById('mic'); if (m && m.classList.contains('off')) m.click(); }).catch(() => {});
  const stepped = await pages[stagerIdx].evaluate(() => window.__gifosVideo.stageForTest(true));
  check('the deep seat steps onto the stage (self-owned)', stepped === true, { stager: 'P' + stagerIdx + '@' + coordStr(stagerIdx) });
  let agree = 0;
  for (let i = 0; i < N; i++) {
    const ok = await pages[i].waitForFunction(() => window.__gifosVideo.stageIds().length === 1, null, { timeout: 25000 }).then(() => true).catch(() => false);
    if (ok) agree++;
  }
  check('every seat agrees on the stage set', agree === N, { agree });

  for (let i = 0; i < N; i++) {
    if (i === stagerIdx) continue;
    const r = await stripLiveAt(i, 60);
    check('P' + i + ' @' + coordStr(i) + ' sees LIVE stage pixels (non-black, changing)', r.ok, r);
    await pages[i].screenshot({ path: SHOTDIR + '/p' + i + '-stage.png' }).catch(() => {});
  }
  console.log('  stage screenshots → ' + SHOTDIR);
  const fDeep = await framesAdvance(s1Idx === stagerIdx ? (stagerIdx + 1) % N : s1Idx);
  check('stage feed DECODED FRAMES advance at a Section-1 seat', fDeep.ok, fDeep);
  const earAt = async (idx, secs) => { // poll: the fold takes a beat to attach a fresh stg feed
    const tE = Date.now(); let lvl = -2;
    while (Date.now() - tE < secs * 1000) {
      lvl = await pages[idx].evaluate(() => window.__gifosVideo.stageEarLevel(900)).catch(() => -2);
      if (lvl > 0.01) return lvl;
      await sleep(1500);
    }
    return lvl;
  };
  const ear = await earAt(s1Idx === stagerIdx ? (stagerIdx + 1) % N : s1Idx, 25);
  check('the stage EAR hears the stager (peak level > 0.01)', ear > 0.01, { ear });

  // The prod correlate: the stager toggles the mic — the feed must SURVIVE.
  await pages[stagerIdx].click('#mic').catch(() => {});
  await sleep(1500);
  await pages[stagerIdx].click('#mic').catch(() => {});
  await sleep(4000);
  const rxIdx = [...Array(N).keys()].find((i) => i !== stagerIdx && coords[i] && coords[i].pc !== (coords[stagerIdx] || {}).pc)
    ?? (stagerIdx + 1) % N;
  const rTog = await stripLiveAt(rxIdx, 30);
  check('stage pixels SURVIVE the stager mic toggle at P' + rxIdx + ' @' + coordStr(rxIdx), rTog.ok, rTog);
  const earTog = await earAt(rxIdx, 25);
  check('stage SOUND survives the mic toggle', earTog > 0.01, { ear: earTog });
  await pages[rxIdx].screenshot({ path: SHOTDIR + '/p' + rxIdx + '-after-mic-toggle.png' }).catch(() => {});

  // STARVE DRILL: kill the receiver's pair to its CURRENT stage provider —
  // a redundant copy exists by design ('^x' cross copies), so the stage must
  // RESUME within the ~22 s starve-rebuild budget. (2026-07-29: it never
  // resumed — fb never arms for 'stg:*', so darkness is invisible.)
  const feedVia = await pages[rxIdx].evaluate(() => (window.__gifosVideo.feedsInfo() || [])
    .filter((f) => (f.key === 'sgs' || f.key.indexOf('stg:') === 0) && f.key.indexOf('^') < 0 && f.vw > 0)
    .map((f) => f.via)[0] || null);
  if (feedVia) {
    // sever for 45 s — past the 22 s media budget, so recovery MUST come from
    // the redundant copy, not from the transport healing back first
    const severed = await pages[rxIdx].evaluate((pref) => window.__gifosVideo.severByPrefixForTest(pref, 45000), feedVia);
    const t3 = Date.now();
    const rec = await stripLiveAt(rxIdx, 22);
    check('stage RECOVERS within 22 s of losing its provider (redundant copy promoted)', rec.ok,
      { severed, tookMs: Date.now() - t3, then: rec.ok ? undefined : rec });
    await pages[rxIdx].screenshot({ path: SHOTDIR + '/p' + rxIdx + '-after-starve.png' }).catch(() => {});
  } else {
    check('stage RECOVERS within 22 s of losing its provider (redundant copy promoted)', false, { err: 'no live stage feed to sever at P' + rxIdx });
  }

  // Step down: the strip must CLEAR everywhere.
  await pages[stagerIdx].evaluate(() => window.__gifosVideo.stageForTest(false));
  let cleared = 0;
  for (let i = 0; i < N; i++) {
    const ok = await pages[i].waitForFunction(() => window.__gifosVideo.stageIds().length === 0 && !document.querySelector('#stagefeed video'), null, { timeout: 20000 }).then(() => true).catch(() => false);
    if (ok) cleared++;
  }
  check('step-down clears the strip everywhere', cleared === N, { cleared });

  // Small-room regression guard: mosaic must stay OFF below one section.
  const small = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await small.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','Solo')}catch(e){}` });
  const sp = await small.newPage();
  await sp.goto(BASE + '/meet.html#v=solo' + Math.random().toString(36).slice(2, 6));
  await sleep(6000);
  const mSolo = await sp.evaluate(() => __gifosVideo.mosaic()).catch(() => null);
  check('single-section room keeps the mosaic OFF', !!(mSolo && !mSolo.multi && !mSolo.jobs.length), mSolo);

  // SHRINK-TO-ONE-ROW dismantles the mosaic COMPLETELY — including the painted
  // tile. (2026-07-29, prod: a room that fell back to a single row kept a
  // permanent black "The stadium" square — the claim had been dropped through
  // another path, the teardown guard saw empty collections and never ran
  // stopMosaic, and the tile froze on its last dead frame.)
  // clean LEAVEs (pagehide), not silent deaths — a silent death is confirmed
  // on the mesh's E-timers (minutes) and would stall this leg legitimately
  for (let i = 2; i < N; i++) { try { await pages[i].evaluate(() => window.dispatchEvent(new Event('pagehide'))); } catch (e) {} }
  await sleep(500);
  for (let i = 2; i < N; i++) { try { await pages[i].context().close(); } catch (e) {} }
  let tileGone = 0;
  for (const idx of [0, 1]) {
    // 180s: the tile clears once the LEAVEs propagate (with margin for gossip
    // races) — the wedge this guards against never cleared at all.
    const ok = await pages[idx].waitForFunction(
      () => !document.querySelector('[data-row="sd"]') && !document.querySelector('#stagefeed video'),
      null, { timeout: 180000 }).then(() => true).catch(() => false);
    if (ok) tileGone++;
    else {
      const dbg = await pages[idx].evaluate(() => {
        const d = window.__gifosVideo.debugDump(); const m = d.mosaic || {};
        return { occ: (d.me || {}).occ, rows: d.rows, jobs: m.jobsActive, claims: m.claims,
          tile: m.tile, sdEl: !!document.querySelector('[data-row="sd"]'), sgsV: !!document.querySelector('#stagefeed video'), stagers: m.stagers };
      }).catch((e) => String(e).slice(0, 200));
      console.log('  [shrink-dbg P' + idx + '] ' + JSON.stringify(dbg));
    }
  }
  check('shrink to one row REMOVES the stadium tile (no permanent black square)', tileGone === 2, { tileGone });

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
