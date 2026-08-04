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
// The guard under test (run.html prodPack loop): a peer's own heartbeat
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
    // GIFOS_COMPACTION=false — the browser twin of the sim's `compacton 0`:
    // this suite MANUFACTURES a pinned topology (sever + forceSeat), and Q2
    // compaction is free to move the deep head out from under it — the
    // mover's up-chain then vanishes, it legally drains and rejoins, and the
    // assert races the rejoin (measured: mover coord=null at assert, ~1 run
    // in 4). The disown-guard under test is orthogonal to packing.
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','D${i}')}catch(e){}; window.GIFOS_SCALE={C:2}; window.GIFOS_COMPACTION=false;` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [D${i}] PAGEERROR`, String(e).slice(0, 200)));
    await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');
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
  //
  // RE-DERIVE THE OBSERVER — SEATS MOVE (2026-08-01). This leg used to
  // interrogate pages[deepIdx] — the seat that was deep at SETUP time — and
  // assume it was still the head of the mover's row at ASSERT time. Compaction
  // is free to break that, and here it is actively invited to: the mover
  // vacating 0/0.1 leaves a hole in an otherwise-full section 0, and a lone
  // deep seat is the RIGHTMOST occupant of its row, which is exactly the seat
  // tryCompact's clean-departure gate lets climb into that hole (site/js/mesh.js).
  // Measured on a failing run:
  //
  //   coords@assert ["0/0.0","1/1.0","0/1.0","0/1.1","0/0.1"]
  //   observer 2/1.0 -> 0/0.1   mover -> 1/1.0, ALONE as head of its own row
  //
  // The observer had climbed into section 0, so the old wait polled a page in a
  // DIFFERENT SECTION for a row-mate it could never have: a deterministic 60s
  // timeout that reads exactly like a paint bug. (The previous attempt to fix
  // this accepted "or any visible direct tile" instead, which passes on a
  // topology the test never built — the mover is not at that row at all.)
  // So ask the topology where the mover IS, and judge the seat that is actually
  // responsible for carrying it.
  //
  // TRACK THE MOVER BY ITS PAGE, NOT BY THE ID IT HAD AT SETUP. A peer severed
  // for 30s can be declared gone and REJOIN with a fresh identity, and then the
  // setup-time pid names nobody: measured, mover k_3dda94 -> k_4c8dd2, and this
  // leg failed hunting a pid that no longer exists while the row head was
  // faithfully composing the mover under its NEW id. Leg 1 above still uses the
  // OLD pid on purpose — it asks whether the stale entry at the OLD seat stops
  // being painted, which is exactly the disown guard under test — but "is this
  // person visible at their new home" is a question about the PAGE, so it must
  // read the page's current id. A rotation is reported, never silently
  // absorbed: it changes what leg 1 proved (the old face can vanish because the
  // identity rotated rather than because the guard fired).
  const pidNow = (idx) => pages[idx].evaluate(() => (window.__gifosVideo.debugDump().me || {}).peer).catch(() => null);
  const settle = async () => {
    const cs = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo.meshCoord()).catch(() => null)));
    const mC = cs[mIdx];
    if (!mC) return null;
    const now = await pidNow(mIdx);
    return { cs, mC, now8: now ? String(now).slice(0, 8) : null,
      headIdx: cs.findIndex((c) => c && c.pc === mC.pc && c.r === mC.r && c.i === 0),
      alone: !cs.some((c, k) => k !== mIdx && c && c.pc === mC.pc && c.r === mC.r) };
  };

  let topo = null, df = [], ship = [], via = 'NEITHER';
  const t2 = Date.now();
  while (Date.now() - t2 < 90000) {
    topo = await settle();
    if (topo && topo.headIdx >= 0 && topo.headIdx !== mIdx) {
      // Somebody else heads the mover's row: the row product MUST carry the
      // moved face. This is the original claim, asserted at the right seat.
      df = await rowFacesAt(topo.headIdx);
      if (topo.now8 && df.some((f) => f.pid === topo.now8)) { via = 'row-product'; break; }
    } else if (topo && topo.alone) {
      // No other seat shares the mover's row, so no row product anywhere can
      // hold its face — and that is a lawful, stable shape (5 people at C=2 is
      // a full section 0 plus one deep seat). The room sees a lone deep seat
      // through the BOTTOM-UP assembly instead: it composites its own product
      // and ships it up its up-link, where the parent folds it in as a
      // sub-block and the section-0 head packs it into the Stadium
      // (docs/media-plane.md). Measured present on both sides of an A/B of
      // this build, so it is a real mechanism and not an excuse: the lone seat
      // carries jobSig ["sub>…"] and its parent claims sub:0 from it.
      ship = await pages[mIdx].evaluate(() => ((window.__gifosVideo.debugDump().mosaic || {}).jobSig || []).map((x) => x.split('|')[0])).catch(() => []);
      if (ship.some((k) => k.indexOf('sub>') === 0)) { via = 'up-ship'; break; }
    }
    await sleep(2000);
  }

  const cstrs = topo ? topo.cs.map(cstr) : null;
  const rotated = !!(topo && topo.now8 && topo.now8 !== m8);
  console.log('   MEASURE topology@assert ' + JSON.stringify(cstrs) +
    '  mover=' + cstr(topo && topo.mC) + '  alone=' + !!(topo && topo.alone) +
    '  rowHeadIdx=' + (topo ? topo.headIdx : -1));
  console.log('   MEASURE mover identity setup=' + m8 + ' now=' + (topo && topo.now8) +
    (rotated ? '  ROTATED (it rejoined during the sever — leg 1 above proved less than it looks)' : '  stable'));

  // The manufacture must still hold at assert time, or the leg below proves
  // nothing: the teleport put the mover in a DEEP section and it must not have
  // been compacted back into section 0 before we judged it.
  check('the mover is still seated deep at assert time (the manufacture held)',
    !!(topo && topo.mC && topo.mC.pc !== 0), { mover: cstr(topo && topo.mC) });

  if (via === 'NEITHER') {
    const fx = await pages[mIdx].evaluate(() => {
      const V = window.__gifosVideo, d = V.debugDump() || {};
      return { coord: V.meshCoord(), mesh: V.meshState ? V.meshState() : null,
        rows: (d.rows || []).map((r) => r.map((x) => x || '-').join(',')),
        mosaicHead: (d.mosaic || {}).head, rowFaces: (d.mosaic || {}).rowFaces,
        jobSig: (d.mosaic || {}).jobSig, claimVia: (d.mosaic || {}).claimVia,
        parts: V.participants() };
    }).catch((e) => ({ err: String(e).slice(0, 120) }));
    console.log('  [mover forensics] ' + JSON.stringify(fx));
    if (topo && topo.headIdx >= 0 && topo.headIdx !== mIdx) {
      const hx = await pages[topo.headIdx].evaluate(() => {
        const d = window.__gifosVideo.debugDump() || {};
        return { coord: (d.me || {}).coord, rowFaces: (d.mosaic || {}).rowFaces,
          claimVia: (d.mosaic || {}).claimVia, rows: (d.rows || []).map((r) => r.map((x) => x || '-').join(',')) };
      }).catch((e) => ({ err: String(e).slice(0, 120) }));
      console.log('  [row-head forensics] ' + JSON.stringify(hx));
    }
  }
  check('the moved face is carried at its NEW row (row product, or the up-ship when it seats alone)',
    via !== 'NEITHER',
    { via, mover: cstr(topo && topo.mC), moverPid: topo && topo.now8, idRotated: rotated,
      alone: !!(topo && topo.alone), rowFaces: df, ship, coords: cstrs });

  const fs = require('fs');
  const SHOTDIR = process.env.SHOTDIR || '/tmp/e2e-stadium-dup';
  fs.mkdirSync(SHOTDIR, { recursive: true });
  await pages[hIdx].screenshot({ path: SHOTDIR + '/head-after-heal.png' }).catch(() => {});
  console.log('  screenshot → ' + SHOTDIR + '/head-after-heal.png');

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
