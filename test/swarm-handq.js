#!/usr/bin/env node
/*
 * swarm-handq.js — hand-queue scale check (docs/meeting.md, "The hand queue").
 *
 * Launches N quiet bots (real meet.html clients — no camera turned on, no
 * mosaic painting to pay for: the bots exist to exercise STATUS GOSSIP) plus
 * TWO observer pages, staggers a `#hand` click across K of the bots, and then
 * asserts, from the outside:
 *   - each observer's derived queue reaches exactly K raised hands;
 *   - both observers converge on the IDENTICAL order — and that order is the
 *     raise schedule (time, then id);
 *   - the banner overflows correctly (first 8 names + '+K');
 * and MEASURES:
 *   - raise → queue-visible latency per raise, per observer (min/med/max);
 *   - queue flicker: polls where an already-seen pair inverted, or the queue
 *     transiently shrank while hands were only going up.
 *
 * Servers are NOT started here — point --base/--relay at a running site +
 * relay-local (see CLAUDE.md). SWARM_CHROME/MEET_CHROME picks the browser.
 *
 *   node test/swarm-handq.js --n 20 --raise 12 --gap 700 \
 *     --base http://127.0.0.1:8871 --relay ws://127.0.0.1:8872
 */
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const N = Math.max(3, parseInt(args.n || '20', 10));         // bots
const K = Math.min(N, Math.max(2, parseInt(args.raise || String(Math.min(N, 12)), 10))); // how many raise
const GAP = Math.max(100, parseInt(args.gap || '700', 10));  // ms between raises
const BASE = (args.base || 'http://127.0.0.1:8099').replace(/\/$/, '');
const RELAY = args.relay || 'ws://127.0.0.1:8790';
const ROOM = args.room || ('hswarm' + Math.floor(Math.random() * 1e9).toString(36));
const RAMP = Math.max(0, parseInt(args.ramp || '500', 10));  // ms between bot joins
const SETTLE = Math.max(5, parseInt(args.settle || '30', 10)); // s after last raise

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const CHROME = process.env.SWARM_CHROME || process.env.MEET_CHROME || undefined;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  const t0 = Date.now();
  console.log('[handq-swarm] N=' + N + ' bots, ' + K + ' raising, gap ' + GAP + 'ms → ' + BASE + ' room "' + ROOM + '"');
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required', '--process-per-site',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });
  const shutdown = async (code) => { try { await browser.close(); } catch (e) {} process.exit(code); };
  process.on('SIGINT', () => shutdown(2)); process.on('SIGTERM', () => shutdown(2));

  const openClient = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content:
      'localStorage.setItem(\'gifos_relay\',' + JSON.stringify(RELAY) + ');' +
      'localStorage.setItem(\'gifos_name\',' + JSON.stringify(name) + ');' +
      "localStorage.setItem('gifos_meet_bar','0');" });
    const pg = await ctx.newPage();
    pg.on('pageerror', () => {});
    await pg.goto(BASE + '/meet.html#v=' + ROOM, { timeout: 90000, waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 90000 });
    return pg;
  };

  // ---- observers first (they found the room), then the bot ramp ----
  const obsA = await openClient('Obs-A');
  const obsB = await openClient('Obs-B');
  const bots = [];
  for (let i = 0; i < N; i++) {
    try {
      bots.push({ i, name: 'Bot-' + i, pg: await openClient('Bot-' + i) });
    } catch (e) { console.log('[handq-swarm] bot ' + i + ' failed to open: ' + String(e).slice(0, 80)); }
    if (RAMP) await sleep(RAMP);
    if ((i + 1) % 10 === 0) console.log('[handq-swarm] ' + (i + 1) + '/' + N + ' bots launched');
  }
  check('bot launch: ' + bots.length + '/' + N + ' opened (need all)', bots.length === N);

  // ---- convergence: both observers must KNOW the whole room before raises ----
  const want = bots.length + 2;
  for (const [nm, pg] of [['Obs-A', obsA], ['Obs-B', obsB]]) {
    try {
      await pg.waitForFunction((n) => window.__gifosVideo.totalCount() >= n, want, { timeout: 180000 });
    } catch (e) {
      console.log('[handq-swarm] ' + nm + ' totalCount=' + (await pg.evaluate(() => window.__gifosVideo.totalCount()).catch(() => '?')) + '/' + want + ' after 180s');
    }
  }
  const seenA = await obsA.evaluate(() => window.__gifosVideo.totalCount());
  const seenB = await obsB.evaluate(() => window.__gifosVideo.totalCount());
  console.log('[handq-swarm] converged in ' + ((Date.now() - t0) / 1000 | 0) + 's: Obs-A sees ' + seenA + ', Obs-B sees ' + seenB + ' of ' + want);
  check('observers see the whole room before the raises', seenA >= want && seenB >= want);

  // ---- pollers: watch each observer's derived queue at 250ms ----
  const watch = (pg) => {
    const st = { firstSeen: new Map(), snaps: 0, inversions: 0, shrinks: 0, lastNames: [], stop: false, dead: 0 };
    st.loop = (async () => {
      while (!st.stop) {
        try {
          const names = await pg.evaluate(() => window.__gifosVideo.handQueue().map((e) => e.name));
          const now = Date.now();
          st.snaps++;
          for (const n of names) if (!st.firstSeen.has(n)) st.firstSeen.set(n, now);
          // flicker: an already-seen ADJACENT pair swapping, or the queue shrinking
          // while hands only ever go up in this test
          const pos = new Map(names.map((n, i) => [n, i]));
          for (let i = 1; i < st.lastNames.length; i++) {
            const a = st.lastNames[i - 1], b = st.lastNames[i];
            if (pos.has(a) && pos.has(b) && pos.get(a) > pos.get(b)) { st.inversions++; break; }
          }
          if (names.length < st.lastNames.length) st.shrinks++;
          st.lastNames = names;
        } catch (e) { st.dead++; }
        await sleep(250);
      }
    })();
    return st;
  };
  const wA = watch(obsA), wB = watch(obsB);

  // ---- the staggered raises (the REAL button, via page.evaluate click) ----
  const raisers = bots.slice(0, K);
  const schedule = []; // { name, at }
  for (const b of raisers) {
    const ok = await b.pg.evaluate(() => {
      const el = document.getElementById('hand');
      if (!el) return false;
      el.click(); return true;
    }).catch(() => false);
    schedule.push({ name: b.name, at: Date.now(), ok });
    if (!ok) console.log('[handq-swarm] ' + b.name + ' had no #hand button!');
    await sleep(GAP);
  }
  check('all ' + K + ' staggered raises clicked', schedule.every((s) => s.ok));

  // ---- settle, then judge ----
  const settleBy = Date.now() + SETTLE * 1000;
  let qa = [], qb = [];
  for (;;) {
    qa = await obsA.evaluate(() => window.__gifosVideo.handQueue().map((e) => e.name));
    qb = await obsB.evaluate(() => window.__gifosVideo.handQueue().map((e) => e.name));
    if ((qa.length === K && qb.length === K && qa.join() === qb.join()) || Date.now() > settleBy) break;
    await sleep(500);
  }
  wA.stop = wB.stop = true; await wA.loop; await wB.loop;

  const expect = schedule.map((s) => s.name);
  check('both observers hold exactly ' + K + ' raised hands (A=' + qa.length + ', B=' + qb.length + ')',
    qa.length === K && qb.length === K);
  check('the two observers hold the IDENTICAL ordered queue', qa.join() === qb.join());
  check('the order IS the raise schedule (time, then id)', qa.join() === expect.join());
  if (qa.join() !== expect.join()) {
    console.log('  expect: ' + expect.join(', '));
    console.log('  Obs-A : ' + qa.join(', '));
    console.log('  Obs-B : ' + qb.join(', '));
  }
  if (K > 8) {
    const bannerOk = async (pg) => pg.evaluate((k) => {
      const t = window.__gifosVideo.handqText();
      return new RegExp('✋ ' + k + ' waiting:.*, \\+' + (k - 8) + '$').test(t)
        && document.querySelectorAll('#handq .hq').length === 8;
    }, K);
    check('the banner overflows correctly on both observers (8 names, +' + (K - 8) + ')',
      (await bannerOk(obsA)) && (await bannerOk(obsB)));
  }

  // ---- latency + flicker report ----
  const lat = (w) => {
    const ls = schedule.filter((s) => w.firstSeen.has(s.name)).map((s) => w.firstSeen.get(s.name) - s.at).sort((x, y) => x - y);
    if (!ls.length) return null;
    return { n: ls.length, min: ls[0], med: ls[(ls.length / 2) | 0], max: ls[ls.length - 1] };
  };
  for (const [nm, w] of [['Obs-A', wA], ['Obs-B', wB]]) {
    const l = lat(w);
    console.log('[handq-swarm] ' + nm + ': raise→visible latency ' + (l ? ('min ' + l.min + 'ms, med ' + l.med + 'ms, max ' + l.max + 'ms over ' + l.n + '/' + K)
      : 'NO raises seen') + '; flicker: ' + w.inversions + ' inversion-polls, ' + w.shrinks + ' shrink-polls of ' + w.snaps + ' snaps' + (w.dead ? '; ' + w.dead + ' dead polls' : ''));
    check(nm + ' saw every raise', !!l && l.n === K);
    check(nm + ' queue never flickered (no inversions, no shrinks)', w.inversions === 0 && w.shrinks === 0);
  }

  console.log('[handq-swarm] done in ' + ((Date.now() - t0) / 1000 | 0) + 's — ' + (failures ? failures + ' FAILURE(S)' : 'ALL PASS'));
  await shutdown(failures ? 1 : 0);
})();
