// e2e-mosaic.js — the fractal mosaic K-sweep (docs/media-plane.md, 3b).
// Six browsers at GIFOS_SCALE C=2 (a section is 2×2 = 4 seats) force a
// depth-2 tree: two members seat DEEP, the room is multi-section, and the
// mosaic engine activates. The claim under test is the media plane's whole
// point: a seat that is NOT directly linked to most of the room still SEES
// the room — the Stadium tile carries live pixels at every seat, assembled
// hop-by-hop over the tree's own links (product up, S1 exchange, fan down).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 6;
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const room = 'mos' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 200)));
    await page.goto(BASE + '/meet.html#v=' + room);
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

  // Small-room regression guard: mosaic must stay OFF below one section.
  const small = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await small.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','Solo')}catch(e){}` });
  const sp = await small.newPage();
  await sp.goto(BASE + '/meet.html#v=solo' + Math.random().toString(36).slice(2, 6));
  await sleep(6000);
  const mSolo = await sp.evaluate(() => __gifosVideo.mosaic()).catch(() => null);
  check('single-section room keeps the mosaic OFF', !!(mSolo && !mSolo.multi && !mSolo.jobs.length), mSolo);

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
