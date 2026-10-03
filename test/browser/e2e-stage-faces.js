// e2e-stage-faces.js — ONE SHARED SCREEN BESIDE OTHER FACES, at every seat.
//
// Six browsers at GIFOS_SCALE C=2 (a section is 2x2 = 4 seats, the stage
// holds 2) force deep seats, so "below Section 1" exists with few browsers.
// Two people are on the stage; one shares a screen. Every seat that is not on
// the stage must show the SAME stage: the shared screen itself, with the other
// stager's face on it. Before the fix a deep seat either showed the screen
// with nobody on it (the co-presenter's feed arrives audio-only below Section
// 1) or, when the sharer sat in another section, the strip with the screen
// square-cropped (statuses are section-scoped past one section). test/unit/
// stage-faces.js proves the rule; this proves the pixels arrive.
//
// Leg 1: the sharer and the co-presenter sit in Section 1.
// Leg 2: the sharer sits deep; the co-presenter sits in Section 1.
// Needs RELAY + BASE. Exit 3 = could not build the room (no verdict).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 6;
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--auto-select-desktop-capture-source=Entire screen'] });
  const room = 'stf' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 200)));
    await page.goto(BASE + '/run.html#v=' + room);
    pages.push(page);
    await sleep(1200);
  }
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 120000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean) && coords.filter((c) => c.pc !== 0).length >= 1) break;
    await sleep(1500);
  }
  const s1 = coords.map((c, i) => (c && c.pc === 0 ? i : -1)).filter((i) => i >= 0);
  const deep = coords.map((c, i) => (c && c.pc !== 0 ? i : -1)).filter((i) => i >= 0);
  check('all 6 seated, with deep seats', coords.every(Boolean) && deep.length >= 1 && s1.length >= 2, coords);
  if (!(coords.every(Boolean) && deep.length >= 1 && s1.length >= 2)) { await browser.close(); process.exit(3); }
  const pid = await Promise.all(pages.map((p) => p.evaluate(() => __gifosVideo.myPid())));
  for (const p of pages) {
    await p.evaluate(() => {
      const none = document.getElementById('blur-none'); if (none) none.click();
      const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
    }).catch(() => {});
  }
  await sleep(3000);

  const faces = (i) => pages[i].evaluate(() => __gifosVideo.stageFacesForTest()).catch((e) => ({ err: String(e).slice(0, 120) }));
  // Every seat not on the stage shows the screen with the co-presenter's face
  // live on it. Polled: the strip, the digest and the down-ships converge.
  async function everyoneSees(leg, sharer, other, budgetMs) {
    const watchers = pages.map((_, i) => i).filter((i) => i !== sharer && i !== other);
    const ok = new Map();
    const last = new Map();
    const t1 = Date.now();
    while (Date.now() - t1 < budgetMs && ok.size < watchers.length) {
      for (const i of watchers) {
        if (ok.has(i)) continue;
        const f = await faces(i);
        last.set(i, f);
        const face = f && f.faces && f.faces.find((x) => x.id === pid[other]);
        if (f && f.view === 'screen' && face && face.live && face.luma != null && face.luma > 0.02) ok.set(i, { view: f.view, cell: face.cell, luma: face.luma, ms: Date.now() - t1 });
      }
      if (ok.size < watchers.length) await sleep(2000);
    }
    for (const i of watchers) {
      const where = coords[i].pc === 0 ? 'Section 1' : 'deep';
      const f = last.get(i) || {};
      check(leg + ': P' + i + ' (' + where + ') shows the shared screen with the co-presenter\'s face on it', ok.has(i),
        ok.get(i) || { view: f.view, screenSid: f.screenSid && String(f.screenSid).slice(0, 8), faces: (f.faces || []).map((x) => ({ id: String(x.id).slice(0, 8), cell: x.cell, live: x.live, luma: x.luma })) });
    }
    return { watchers, ok };
  }

  // ---- leg 1: sharer and co-presenter in Section 1 -------------------------
  {
    const A = s1[0], B = s1[1];
    const upA = await pages[A].evaluate(() => __gifosVideo.stageForTest(true));
    await sleep(1500);
    const upB = await pages[B].evaluate(() => __gifosVideo.stageForTest(true));
    check('leg 1: two Section 1 seats step up', upA && upB, { upA, upB });
    await pages[A].evaluate(() => __gifosVideo.startScreenShareForTest());
    const r = await everyoneSees('leg 1', A, B, 150000);
    const deepCells = deep.filter((i) => r.ok.has(i)).map((i) => r.ok.get(i).cell);
    check('leg 1: a deep seat\'s face is cut out of the strip (no extra feed)', deepCells.length > 0 && deepCells.every(Boolean), deepCells);
    await pages[A].evaluate(() => __gifosVideo.stopScreenShareForTest());
    await pages[A].evaluate(() => __gifosVideo.stageForTest(false));
    await sleep(4000);
  }

  // ---- leg 2: the sharer sits deep, the co-presenter in Section 1 -----------
  {
    const A = deep[0], B = s1[1];
    let upA = false;
    const t2 = Date.now();
    while (!upA && Date.now() - t2 < 30000) { upA = await pages[A].evaluate(() => __gifosVideo.stageForTest(true)); if (!upA) await sleep(2000); }
    check('leg 2: a deep seat steps up beside the Section 1 co-presenter', upA);
    await pages[A].evaluate(() => __gifosVideo.startScreenShareForTest());
    await everyoneSees('leg 2', A, B, 150000);
    const fit = await pages[s1[0]].evaluate((id) => __gifosVideo.fitForTest(id), pid[A]);
    check('leg 2: Section 1 letterboxes the deep sharer\'s screen in the strip (knows the share from the fold)', fit === 'contain', fit);
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exit(4); });
