// e2e-deep-pair-heal.js — A PARTITIONED DEEP PAIR REJOINS THE ROOM.
//
// A head composites and ships its product UP only when `beyondRow` holds —
// some occupant outside its own pc/row (meet.html reconcileMosaic). So a deep
// pair whose occ contains ONLY their own row composites nothing for anyone
// above and ships nothing up: invisible to the rest of the room. That state was
// seen once as a snapshot during churn (2026-08-01, the e2e-stadium-dup
// forensics) and written down as a suspected invisible-participant bug:
//
//   coord {pc:2,r:0,i:0}  occ 2  parts 2
//   rows ["k_da2146,k_657c8a", "-,-"]   rowFaces []
//
// Measured, it is NOT a bug — it is what a PARTITION looks like from inside,
// and it heals itself. This suite pins that, because the difference between
// "transient partition" and "permanently invisible participant" is the whole
// product, and nothing else guards it.
//
// MANUFACTURE. forceSeat alone cannot hold the state: doMove clears occ, but
// the seat keeps LIVE links to everyone above and gossip refills occ inside 2s
// (measured — occ back to 3-4 with 'sub>' already shipping). The ingredient is
// the PARTITION. So sever both deep peers from everyone above, THEN seat them
// into one deep row seeded with only each other. Both legs are asserted: that
// the isolation is real (or the recovery leg proves nothing), and that it ends.
//
// NOTE the law under test is the UP-SHIP, not a direct tile: a deep member is
// seen as pixels inside the Stadium composite, never as its own tile up there.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 6;                                  // C=2: section 0 holds 4, two go deep
const SEVER_MS = +(process.env.SEVER_MS || 45000);
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cstr = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '?');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'dpair' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 160)));
    await page.goto(BASE + '/meet.html#v=' + room + '&DEBUG=on');
    pages.push(page);
    await sleep(1200);
  }
  const coordsOf = () => Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 90000) {
    coords = await coordsOf();
    if (coords.every(Boolean) && coords.some((c) => c.pc !== 0)) break;
    await sleep(1500);
  }
  check('all 6 seated, with deep seats below a full section 0', coords.every(Boolean) && coords.some((c) => c.pc !== 0), coords.map(cstr));
  if (!coords.every(Boolean)) { await browser.close(); console.log('\n' + failures + ' FAILED'); process.exit(1); }

  const pids = await Promise.all(pages.map((p) => p.evaluate(() => (window.__gifosVideo.debugDump().me || {}).peer).catch(() => null)));
  const order = coords.map((c, i) => ({ i, c })).filter((x) => x.c)
    .sort((a, b) => (b.c.pc - a.c.pc) || (b.c.r - a.c.r) || (b.c.i - a.c.i));
  const A = order[0].i, B = order[1].i;
  const DPC = Math.max(1, coords[A].pc);
  const aboveIdx = []; for (let k = 0; k < N; k++) if (k !== A && k !== B) aboveIdx.push(k);

  const probe = (idx) => pages[idx].evaluate(() => {
    const V = window.__gifosVideo, d = V.debugDump() || {}, m = d.mosaic || {};
    return { coord: (d.me || {}).coord, occ: (d.me || {}).occ,
      rowFaces: (m.rowFaces || []).map((f) => f.pid),
      ships: (m.jobSig || []).map((x) => x.split('|')[0]),
      claims: (m.claimVia || []).map((c) => ({ rk: c.rk, via: String(c.via || '') })) };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  const upShipping = (p) => (p.ships || []).some((x) => x.indexOf('sub>') === 0);
  // EXACT: a seat above claiming a 'sub' feed whose VIA is one of the pair.
  // Matching on the key alone counts a stale pre-sever claim and reports
  // recovery that has not happened (it did, in the first draft of this probe).
  const claimedAbove = async () => {
    const out = [];
    for (const k of aboveIdx) {
      const q = await probe(k);
      if ((q.claims || []).some((c) => String(c.rk).indexOf('sub') === 0 && (c.via === pids[A] || c.via === pids[B]))) out.push('P' + k);
    }
    return out;
  };

  // ---- partition, then seat them knowing only each other --------------------
  // The sever is applied TWICE, on purpose. forceSeat's doMove RE-DIALS the
  // neighbourhood as it lands, which rebuilds exactly the links we just cut —
  // measured: one peer came out of the move already holding its parent in occ
  // and shipping 'sub>' up, so the "isolated" state never existed and the heal
  // leg had nothing to prove (it reported healing 23s BEFORE the lift). Cut,
  // seat, then cut again so the partition survives the move.
  const severAll = async () => {
    for (const idx of [A, B]) {
      for (const k of aboveIdx) {
        await pages[idx].evaluate((a) => window.__gifosVideo.severByPrefixForTest(a.p, a.ms), { p: pids[k].slice(0, 8), ms: a2ms }).catch(() => {});
      }
    }
  };
  let a2ms = SEVER_MS;
  await severAll();
  await sleep(1000);
  const seedA = {}; seedA[DPC + '/0.1'] = pids[B];
  const seedB = {}; seedB[DPC + '/0.0'] = pids[A];
  await pages[A].evaluate((a) => window.__gifosVideo.forceSeat(a.pc, 0, 0, a.seed), { pc: DPC, seed: seedA });
  await sleep(1500);
  await pages[B].evaluate((a) => window.__gifosVideo.forceSeat(a.pc, 0, 1, a.seed), { pc: DPC, seed: seedB });
  await sleep(1500);
  const severedAt = Date.now();          // the clock starts at the LAST cut
  await severAll();

  // LET GRACE EXPIRE BEFORE READING. The media plane is deliberately
  // grace-not-teardown (docs/media-plane.md): an outbound ship stays up until
  // it has been unwanted for the full MOS_GRACE, and announces age out at ~12s.
  // So immediately after the move BOTH sides still show the OLD world — the
  // peer that had been a head at its previous seat still carried a 'sub>' job
  // it could not legitimately have at i=1, and seats above still held the
  // matching claim. Reading at +2s therefore measured the grace window, not the
  // partition, and failed this leg every run. Wait it out.
  await sleep(20000);

  const z = await probe(A), zb = await probe(B);
  const z0Above = await claimedAbove();
  console.log('   MEASURE isolated A=' + JSON.stringify(z) + ' B=' + JSON.stringify(zb) + ' claimedAbove=' + JSON.stringify(z0Above));
  // The manufacture must actually isolate them, or the heal leg proves nothing.
  // The claim is SENDER-SIDE: neither of them ships its product up. A receiver's
  // claim list is NOT usable here — it is a cache with its own ageing, so a
  // pre-sever claim lingers above and reads as "still connected" long after the
  // sender stopped. occ size is likewise only how we get there, not the law.
  check('the severed pair really is cut off (neither ships its product up)',
    !upShipping(z) && !upShipping(zb),
    { aOcc: z.occ, bOcc: zb.occ, aShips: z.ships, bShips: zb.ships, staleClaimsAbove: z0Above });

  // ---- while partitioned it stays isolated (no phantom recovery) ------------
  await sleep(10000);
  const mA = await probe(A), mB = await probe(B);
  check('while the partition holds, they still ship nothing up',
    !upShipping(mA) && !upShipping(mB),
    { aShips: mA.ships, bShips: mB.ships });

  // ---- and when it lifts, they rejoin --------------------------------------
  // Bound generously: the sever must expire, transports rebuild, the seat
  // re-learn the tree and re-announce. Measured recovery ~9s after the lift.
  // Sender-side again, for the same reason: a lingering claim above would
  // otherwise report recovery that has not happened (it did, reporting a heal
  // 23s BEFORE the partition lifted).
  let healed = false, healedAt = null, above = [];
  const deadline = severedAt + SEVER_MS + 120000;
  while (Date.now() < deadline) {
    const pa = await probe(A), pb = await probe(B);
    if (upShipping(pa) || upShipping(pb)) {
      healed = true; healedAt = Math.round((Date.now() - severedAt - SEVER_MS) / 1000);
      above = await claimedAbove();
      console.log('   MEASURE healed A=' + JSON.stringify(pa) + ' B=' + JSON.stringify(pb));
      break;
    }
    await sleep(3000);
  }
  check('once the partition lifts the deep pair ships its product up again (≤120s after the lift)',
    healed, { secondsAfterLift: healedAt, claimedAbove: above });

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
