// sdrow-chain-drill.js — the x1 -> x2 -> sdrow backup chain is PARKED at rest
// and WAKES end to end when a head loses the direct row product.
//
// Self-contained: spawns its own relay + static server and seats 4 browsers
// in a full 2×2 Section 1 at GIFOS_SCALE C=2:
//
//     A@0/0.0 (row-0 head, the producer)   B@0/0.1 (carries x1 down column 1)
//     C@0/1.0 (row-1 head, the OBSERVER)   D@0/1.1 (hands x2 to C as sdrow:0)
//
//   direct:  A --sdrow:0--> C                       (the 1-hop primary)
//   backup:  A --x1--> B --x2--> D --sdrow:0--> C   (born parked, CHAIN-PARK)
//
// The x1 leg leaves A from a local canvas, so a hot x1 is a real encoder that
// nobody watches. The drill proves:
//   1. at rest C holds sdrow:0 primary via A and standby via D, and A's x1
//      job is parked;
//   2. a media-only outage of A's direct ship (parkJobForTest) moves C onto
//      the chain inside MOS_GRACE (5s) — the want cascades D -> B -> A;
//   3. while C rides the chain, every hop of it is hot;
//   4. after the outage lifts, C fails back to A and A's x1 parks again.
// Run: node test/drills/sdrow-chain-drill.js
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const RELAY_PORT = parseInt(process.env.SDROW_RELAY_PORT || '8879', 10);
const SITE_PORT = parseInt(process.env.SDROW_SITE_PORT || '8881', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const SEATS = ['0/0.0', '0/0.1', '0/1.0', '0/1.1'];
const NAMES = ['A', 'B', 'C', 'D'];
const GRACE_MS = 5000;
const PARK_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); if (!c) failures++; };
const loadNow = () => { try { return parseFloat(require('fs').readFileSync('/proc/loadavg', 'utf8').split(' ')[0]); } catch (e) { return -1; } };

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  process.on('exit', () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} });
  await sleep(900);

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROME, headless: true,
      args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
    });
  } catch (e) { console.log('NO-VERDICT — browser did not start: ' + String(e).slice(0, 120)); process.exit(4); }
  const room = 'sdr' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let k = 0; k < SEATS.length; k++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: 'window.GIFOS_SCALE={C:2};'
      + `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','${NAMES[k]}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}` });
    const page = await ctx.newPage();
    await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 });
    pages.push(page);
    console.log('  launched ' + NAMES[k] + ' (loadavg ' + loadNow() + ')');
    await sleep(1500);
  }
  const coordOf = (p) => p.evaluate(() => { const c = window.__gifosVideo && __gifosVideo.meshCoord(); return c ? c.pc + '/' + c.r + '.' + c.i : null; }).catch(() => null);
  const idOf = (p) => p.evaluate(() => { try { return __gifosVideo.debugDump().me.peer; } catch (e) { return null; } }).catch(() => null);
  const mosOf = (p) => p.evaluate(() => __gifosVideo.mosaic()).catch(() => null);

  // Seat by coordinate: whoever sits at a drill coord plays that role.
  let coords = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    coords = await Promise.all(pages.map(coordOf));
    if (SEATS.every((s) => coords.includes(s))) break;
    await sleep(2000);
  }
  check('the 4 pages fill Section 1 (2×2)', SEATS.every((s) => coords.includes(s)), coords);
  if (!SEATS.every((s) => coords.includes(s))) { await browser.close(); process.exit(1); }
  const role = {}; // name -> page index
  SEATS.forEach((s, k) => { role[NAMES[k]] = coords.indexOf(s); });
  const P = (n) => pages[role[n]];
  const ids = {}; for (const n of NAMES) ids[n] = await idOf(P(n));
  const jobState = (m, key, to) => { const j = (m && m.jobsActive || []).find((x) => x.slice(0, -1) === key + '>' + to); return j ? j.slice(-1) : null; };
  const sdrowAt = async () => {
    const m = await mosOf(P('C'));
    const pri = m && (m.claimVia || []).find((x) => x.rk === 'sdrow:0');
    const std = m && (m.standbyVia || []).find((x) => x.rk === 'sdrow:0');
    return { pri: pri ? pri.via : null, std: std ? std.via : null };
  };

  // ---- 1. REST: direct primary, chain standby, x1 parked ---------------------
  let rest = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 90000) {
    const s = await sdrowAt();
    if (s.pri === ids.A && s.std === ids.D) { rest = s; break; }
    await sleep(2000);
  }
  check('C holds sdrow:0 primary via A and standby via D', !!rest, await sdrowAt());
  if (!rest) {
    for (const n of NAMES) { const m = await mosOf(P(n)); console.log('  [' + n + '] ' + JSON.stringify({ claims: m && m.claims, jobs: m && m.jobsActive })); }
    await browser.close(); process.exit(1);
  }
  await sleep(6000); // let demands settle
  const mA0 = await mosOf(P('A')), mB0 = await mosOf(P('B')), mD0 = await mosOf(P('D'));
  const rest3 = { x1: jobState(mA0, 'x1', ids.B), x2: jobState(mB0, 'x2', ids.D), sdrowRelay: jobState(mD0, 'sdrow:0', ids.C) };
  console.log('   MEASURE chain at rest (+ hot, · parked): A x1=' + rest3.x1 + ' B x2=' + rest3.x2 + ' D sdrow:0=' + rest3.sdrowRelay);
  check('A\'s x1 backup encoder is parked at rest', rest3.x1 === '·', rest3);
  check('the relayed sdrow:0 standby is parked at rest', rest3.sdrowRelay === '·', rest3);

  // ---- 2. FAILOVER: a media-only outage of the direct ship -------------------
  const park = await P('A').evaluate((a) => __gifosVideo.parkJobForTest('sdrow:0', a.to, a.ms), { to: ids.C, ms: PARK_MS });
  check('A\'s direct sdrow:0 ship pinned parked', !!(park && park.ok), park);
  const tk = Date.now();
  let swapMs = -1;
  while (Date.now() - tk < 25000) {
    const s = await sdrowAt();
    if (s.pri === ids.D) { swapMs = Date.now() - tk; break; }
    await sleep(250);
  }
  console.log('   MEASURE failover to the chain: ' + (swapMs < 0 ? 'NEVER in 25s' : swapMs + 'ms') + ' (grace ' + GRACE_MS + ') loadavg=' + loadNow());
  check('C moves onto the chain (the swap requires decoded flow)', swapMs >= 0, { swapMs });
  check('the failover lands inside MOS_GRACE', swapMs >= 0 && swapMs <= GRACE_MS, { swapMs });

  // ---- 3. every hop is hot while C rides the chain --------------------------
  if (swapMs >= 0) {
    const mA1 = await mosOf(P('A')), mB1 = await mosOf(P('B')), mD1 = await mosOf(P('D'));
    const hot3 = { x1: jobState(mA1, 'x1', ids.B), x2: jobState(mB1, 'x2', ids.D), sdrowRelay: jobState(mD1, 'sdrow:0', ids.C) };
    check('the whole chain is hot while it carries the row', hot3.x1 === '+' && hot3.x2 === '+' && hot3.sdrowRelay === '+', hot3);
  }

  // ---- 4. FAILBACK, then the chain parks again -------------------------------
  await P('A').evaluate((a) => __gifosVideo.unparkJobForTest('sdrow:0', a.to), { to: ids.C }).catch(() => null);
  const tb = Date.now();
  let backMs = -1;
  while (Date.now() - tb < 45000) {
    const s = await sdrowAt();
    if (s.pri === ids.A) { backMs = Date.now() - tb; break; }
    await sleep(500);
  }
  check('C fails back to the direct ship', backMs >= 0, { backMs });
  let reparkMs = -1;
  const tr = Date.now();
  while (backMs >= 0 && Date.now() - tr < 30000) {
    const mA2 = await mosOf(P('A'));
    if (jobState(mA2, 'x1', ids.B) === '·') { reparkMs = Date.now() - tr; break; }
    await sleep(500);
  }
  console.log('   MEASURE failback ' + backMs + 'ms, x1 re-parked ' + reparkMs + 'ms after it');
  check('A\'s x1 parks again after the failback', reparkMs >= 0, { reparkMs });

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — drill crashed: ' + String(e && e.stack || e).slice(0, 300)); process.exit(1); });
