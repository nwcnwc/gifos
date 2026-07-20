// The relay-cost fixes, end to end. The relay is a hibernated Durable Object
// that is WOKEN AND BILLED for every frame and every connection — the two ways
// a meeting burned the daily budget were (1) status heartbeats riding the relay
// forever (~43k/day for two idle tabs) and (2) the same-device double-tab
// eviction ping-pong (~45k connects overnight — the July 12 incident).
//   A. Once P2P connects, heartbeats move to the DataChannel: the relay goes
//      QUIET while status still flows.
//   B. Opening the same room in a second tab on the SAME device evicts the
//      first ONCE (close 4000) — the evicted tab stays down, no reconnect war.
// Needs RELAY + BASE.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name) => { const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] }); await ctx.addInitScript(setup(name)); return ctx; };

  // ---- A. heartbeats ride the DataChannel; the relay goes quiet ----
  const aCtx = await newUser('Ada');
  const a = await aCtx.newPage();
  a.on('pageerror', (e) => console.log('  [a] ' + e.message));
  await a.goto(BASE + '/meet.html');
  await a.locator('#lob-open').click();
  await a.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  const link = await a.evaluate(() => document.getElementById('share-url').value);

  const bCtx = await newUser('Ben');
  const b = await bCtx.newPage();
  b.on('pageerror', (e) => console.log('  [b] ' + e.message));
  await b.goto(link);
  await a.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await b.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await sleep(2500); // DCs open + first beats settle

  const t0a = await a.evaluate(() => window.__gifosVideo.txStats());
  const t0b = await b.evaluate(() => window.__gifosVideo.txStats());
  await sleep(13000); // > 3 heartbeat ticks
  const t1a = await a.evaluate(() => window.__gifosVideo.txStats());
  const t1b = await b.evaluate(() => window.__gifosVideo.txStats());
  const dDc = (t1a.dcStatus - t0a.dcStatus) + (t1b.dcStatus - t0b.dcStatus);
  const dRelay = (t1a.relayStatus - t0a.relayStatus) + (t1b.relayStatus - t0b.relayStatus);
  check('heartbeats keep flowing over the DataChannel', dDc >= 3, dDc + ' DC beats in 13s');
  check('the RELAY carries (almost) none of them', dRelay <= 1, dRelay + ' relay beats in 13s');
  check('the room stays converged on the free path', await a.evaluate(() => window.__gifosVideo.liveLinks()) >= 1
    && await b.evaluate(() => window.__gifosVideo.liveLinks()) >= 1);

  // ---- B. same-device second tab: ONE eviction, no reconnect war ----
  // Same context ⇒ same localStorage device id, fresh sessionStorage peer id —
  // exactly the "opened my own meeting twice" foot-gun from the incident.
  const b2 = await bCtx.newPage();
  b2.on('pageerror', (e) => console.log('  [b2] ' + e.message));
  await b2.goto(link);
  await b2.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  await sleep(4000); // in the bad old world, several eviction cycles happen here
  const warStats = await Promise.all([b, b2].map((p) => p.evaluate(() => {
    const conns = (window.__gifosConns || []).map((c) => ({ state: c.state, rejected: c.rejected || 0 }));
    return conns;
  })));
  const rejectedCount = warStats.flat().filter((c) => c.rejected === 4000).length;
  const upCount = warStats.flat().filter((c) => c.state === 'up').length;
  check('exactly one tab was evicted (close 4000) and STAYS down', rejectedCount >= 1, JSON.stringify(warStats));
  check('the other tab holds the seat', upCount >= 1, upCount + ' sockets up');
  // The war test: sample again — a ping-pong would flip states/rack up churn.
  const before = JSON.stringify(warStats);
  await sleep(5000);
  const after = JSON.stringify(await Promise.all([b, b2].map((p) => p.evaluate(() => (window.__gifosConns || []).map((c) => ({ state: c.state, rejected: c.rejected || 0 }))))));
  check('no eviction ping-pong (states stable over 5s)', before === after, 'before=' + before + ' after=' + after);

  await aCtx.close(); await bCtx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
