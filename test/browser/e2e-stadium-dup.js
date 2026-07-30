// e2e-stadium-dup.js — A SEAT'S FACE BELONGS TO ITS SELF-REPORTED OWNER.
//
// 2026-07-29, prod room "test": a bot that compaction had moved (0/0.4 →
// 0/0.3) rendered TWICE in the stadium for the whole session, and the census
// showed occ=7 with 6 participants. Root: occ gossip never evicts (E2), and
// tlSweep cannot kill a stale entry whose pid still ANSWERS probes — it is
// alive, just seated elsewhere. Wherever the LEAVE was missed, the old entry
// lingers and that seat's face is composed into the row product at BOTH
// coords, forever.
//
// The guard under test (meet.html prodPack loop): a peer's own heartbeat
// carries its seat (myStatus.seat); a FRESH self-report that disowns a seat
// vetoes the draw at that seat. occ itself is untouched (E2 stands) — the
// packer just declines to paint a disowned seat.
//
// Manufacture (deterministic): sever the head from its row-mate so the LEAVE
// is missed, forceSeat the mate into a deep row mid-sever, lift, and require
// the head's row product to DROP the moved face once fresh status arrives.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 5; // C=2: section 0 fills 2×2, P4 seats deep — a real target row for the move
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'sdup' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','D${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [D${i}] PAGEERROR`, String(e).slice(0, 200)));
    await page.goto(BASE + '/meet.html#v=' + room + '&DEBUG=on');
    pages.push(page);
    await sleep(1200);
  }
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 90000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean) && coords.some((c) => c.pc !== 0)) break;
    await sleep(1500);
  }
  const cstr = (c) => c ? c.pc + '/' + c.r + '.' + c.i : '?';
  const deepIdx = coords.findIndex((c) => c && c.pc !== 0);
  check('all 5 seated; one deep seat exists', coords.every(Boolean) && deepIdx >= 0, coords.map(cstr));

  const pids = await Promise.all(pages.map((p) => p.evaluate(() => (window.__gifosVideo.debugDump().me || {}).peer).catch(() => null)));
  // head H = the seat at 0/0.0; mate M = its row-mate 0/0.1
  const hIdx = coords.findIndex((c) => c && c.pc === 0 && c.r === 0 && c.i === 0);
  const mIdx = coords.findIndex((c) => c && c.pc === 0 && c.r === 0 && c.i === 1);
  const dC = coords[deepIdx];
  check('head and row-mate identified', hIdx >= 0 && mIdx >= 0 && pids[hIdx] && pids[mIdx], { h: cstr(coords[hIdx]), m: cstr(coords[mIdx]) });

  const rowFacesAt = (idx) => pages[idx].evaluate(() => { const d = window.__gifosVideo.debugDump().mosaic; return (d && d.rowFaces) || []; }).catch(() => []);
  const m8 = pids[mIdx].slice(0, 8);
  const before = await rowFacesAt(hIdx);
  check('head composes its row-mate before the move', before.some((f) => f.pid === m8), { before });

  // 1. sever H<->M (H will MISS the LEAVE), 2. teleport M next to the deep seat
  await pages[hIdx].evaluate((pref) => window.__gifosVideo.severByPrefixForTest(pref, 30000), pids[mIdx].slice(0, 8));
  await sleep(500);
  const seed = {}; seed[dC.pc + '/' + dC.r + '.' + dC.i] = pids[deepIdx];
  const moved = await pages[mIdx].evaluate((a) => window.__gifosVideo.forceSeat(a.pc, a.r, a.i, a.seed), { pc: dC.pc, r: dC.r, i: 1 - dC.i, seed });
  await sleep(2000);
  const mNow = await pages[mIdx].evaluate(() => window.__gifosVideo.meshCoord()).catch(() => null);
  check('mate teleported into the deep row mid-sever', !!(mNow && mNow.pc === dC.pc), { moved, mNow: cstr(mNow) });

  // While severed the head cannot know better (no status path) — the stale
  // face may linger. The claim under test is AFTER the sever lifts: fresh
  // heartbeats carry M's new seat, and the disowned face must drop even
  // though H's occ still holds the stale entry (occ gossip never evicts).
  const t1 = Date.now();
  let hf = [];
  while (Date.now() - t1 < 75000) { // 30s sever + transport rebuild + status beat + sweep
    hf = await rowFacesAt(hIdx);
    if (hf.length && !hf.some((f) => f.pid === m8)) break;
    await sleep(2000);
  }
  check('the disowned face DROPS from the head\'s row product (≤75s incl. 30s sever)',
    hf.length > 0 && !hf.some((f) => f.pid === m8), { rowFaces: hf, tookMs: Date.now() - t1 });

  // …and the mover's face lives at its NEW row's product.
  // TWO CLAIMS, not one (same lesson as e2e-mosaic's shrink leg): the deep
  // seat must first SEE the mover as its row-mate — a mesh fact whose timing
  // varies with the host — and only then can its packer be judged. Folded
  // together, a slow mesh reported as `rowFaces: []` and read like a paint
  // bug (red on the 8-core host, green here).
  const t2 = Date.now();
  let seated = false;
  while (Date.now() - t2 < 60000) {
    seated = await pages[deepIdx].evaluate((p) => {
      const c = window.__gifosVideo.meshCoord(); if (!c) return false;
      const rows = window.__gifosVideo.debugDump().rows || [];
      return (rows[c.r] || []).some((x) => x && p.indexOf(x) === 0);
    }, m8).catch(() => false);
    if (seated) break;
    await sleep(2000);
  }
  check('the deep row SEES the mover as its row-mate (mesh precondition)', seated, { waitedMs: Date.now() - t2 });

  let df = [];
  if (seated) {
    const t3 = Date.now();
    while (Date.now() - t3 < 30000) {
      df = await rowFacesAt(deepIdx);
      if (df.some((f) => f.pid === m8)) break;
      await sleep(2000);
    }
  }
  check('the moved face is composed at its NEW row', seated && df.some((f) => f.pid === m8), { rowFaces: df });

  const fs = require('fs');
  const SHOTDIR = process.env.SHOTDIR || '/tmp/e2e-stadium-dup';
  fs.mkdirSync(SHOTDIR, { recursive: true });
  await pages[hIdx].screenshot({ path: SHOTDIR + '/head-after-heal.png' }).catch(() => {});
  console.log('  screenshot → ' + SHOTDIR + '/head-after-heal.png');

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
