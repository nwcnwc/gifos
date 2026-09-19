// e2e-sing-relay.js — Sing Together across the TREE (2026-09-18).
// Six browsers at GIFOS_SCALE C=2 (a section is 2×2 = 4 seats) force a
// depth-2 tree: at least two members seat DEEP, where the leader's voice does
// not arrive on a direct link at all — it rides the per-stager 'stg:' feed,
// relayed hop by hop over the tree's own carriers (stage lane). The bug this
// guards: the delay tier used to be chosen per CARRIER PEER, so a deep seat
// got the leader on its up-link's stadium tier (840) or a row-mate's row tier
// (560) — the anchor arriving BEHIND the row, the cathedral inverted. Now:
//  - every 'stg:' audio track carries its own per-track target (the stage
//    tier) whatever link it rides — visible as `stg` on the carrier's target
//    whose own bus is NOT 'stage';
//  - a relayed copy accounts for what the relay spent: the deep seat's
//    gossiped playout (sp) exceeds the direct floor (280) by at least one hop;
//  - row-mates converge on ONE stage target (stageT), so they sing to the
//    same beat even when their copies took different paths.
// Needs RELAY + BASE. Heavy (6 browsers) — run on a box with memory.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 6;
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'sng' + Math.random().toString(36).slice(2, 7);
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

  // Everyone seats; at least one lands deep (6 people, 4 Section-1 seats).
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 90000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean) && coords.some((c) => c.pc !== 0)) break;
    await sleep(1500);
  }
  const deepIdx = coords.findIndex((c) => c && c.pc !== 0);
  const leadIdx = coords.findIndex((c) => c && c.pc === 0);
  const coordStr = (i) => coords[i] ? coords[i].pc + '/' + coords[i].r + '.' + coords[i].i : '?';
  check('all 6 seated; at least one DEEP seat exists', coords.every(Boolean) && deepIdx >= 0 && leadIdx >= 0, coords.map((c, i) => 'P' + i + '@' + coordStr(i)));
  if (deepIdx < 0 || leadIdx < 0) { await browser.close(); process.exit(1); }

  // ---- a Section-1 seat leads the song ----
  await pages[leadIdx].evaluate(() => window.__gifosVideo.singForTest(true));
  let singAll = 0;
  for (const p of pages) { if (await p.waitForFunction(() => window.__gifosVideo.grid().sing === true, null, { timeout: 30000 }).then(() => true).catch(() => false)) singAll++; }
  check('the song state reaches every seat, deep ones included', singAll === N, { singAll });

  // ---- the deep seat holds the leader's voice RELAYED, not direct ----
  const feedsAt = (pg) => pg.evaluate(() => (window.__gifosVideo.feedsInfo() || []).filter((f) => f.key.indexOf('stg:') === 0).map((f) => ({ key: f.key, via: f.via, a: f.aTracks, h: f.meta && f.meta.h }))).catch(() => []);
  let deepFeeds = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 120000) {
    deepFeeds = await feedsAt(pages[deepIdx]);
    if (deepFeeds.some((f) => f.a > 0)) break;
    await sleep(2000);
  }
  const relayed = deepFeeds.find((f) => f.a > 0 && f.key.slice(4, 12) !== f.via);
  check('DEEP seat holds the leader\'s stage feed with audio, via a RELAY (not the leader\'s own link)', !!relayed, deepFeeds);

  // ---- feed-keyed tier: the carrier is not 'stage', but the stg track has its own target ----
  await sleep(7000); // two grid ticks with the song tiers
  const gDeep = await pages[deepIdx].evaluate(() => window.__gifosVideo.grid());
  const carrier = Object.values(gDeep.targets).find((t) => t.stg && Object.keys(t.stg).length);
  check('the carrier link at the deep seat gets a per-track STAGE target for the relayed stg track', !!carrier && carrier.set === true, carrier && { bus: carrier.bus, D: carrier.D, jbt: carrier.jbt, stg: carrier.stg, stageT: carrier.stageT });
  check('…and that carrier\'s own bus is NOT the stage (the old code used its tier for everything on it)', !!carrier && carrier.bus !== 'stage', carrier && carrier.bus);
  // The relay re-encodes its own playout: a copy one hop down has incurred the
  // relay's stage playout (≥280) plus the hop cost — so the deep seat's own
  // playout target sits at least one hop above the direct floor.
  check('the deep seat\'s gossiped stage playout exceeds the direct floor by ≥ one hop (sp ≥ 380)', gDeep.sp >= 380 && gDeep.sp <= 3000, { sn: gDeep.sn, sp: gDeep.sp });

  // ---- row-mates converge on one stage target ----
  const rowOf = (i) => coords[i] ? coords[i].pc + '/' + coords[i].r : '?';
  let pair = null;
  for (let i = 0; i < N && !pair; i++) for (let j = i + 1; j < N; j++) if (rowOf(i) === rowOf(j) && i !== leadIdx && j !== leadIdx) { pair = [i, j]; break; }
  if (pair) {
    let a = null, b = null; const t2 = Date.now();
    while (Date.now() - t2 < 40000) {
      a = await pages[pair[0]].evaluate(() => window.__gifosVideo.grid()).catch(() => null);
      b = await pages[pair[1]].evaluate(() => window.__gifosVideo.grid()).catch(() => null);
      const ta = a && Object.values(a.targets).map((t) => t.stageT).find(Boolean);
      const tb = b && Object.values(b.targets).map((t) => t.stageT).find(Boolean);
      if (ta && tb && ta === tb) break;
      await sleep(3000);
    }
    const ta = a && Object.values(a.targets).map((t) => t.stageT).find(Boolean);
    const tb = b && Object.values(b.targets).map((t) => t.stageT).find(Boolean);
    check('row-mates P' + pair[0] + ' and P' + pair[1] + ' (' + rowOf(pair[0]) + ') converge on ONE stage target', !!ta && ta === tb, { ta, tb, sn: [a && a.sn, b && b.sn], sp: [a && a.sp, b && b.sp] });
  } else console.log('  (no non-leader row pair — skipping the convergence leg)');

  // ---- the song ends everywhere ----
  await pages[leadIdx].evaluate(() => window.__gifosVideo.singForTest(false));
  let offAll = 0;
  for (const p of pages) { if (await p.waitForFunction(() => window.__gifosVideo.grid().sing === false, null, { timeout: 30000 }).then(() => true).catch(() => false)) offAll++; }
  check('the song ends at every seat', offAll === N, { offAll });

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', (e && e.stack) || (e && e.message) || e); process.exit(2); });
