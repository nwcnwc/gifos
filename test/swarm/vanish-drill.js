#!/usr/bin/env node
/*
 * vanish-drill.js — swarm-scale measurement of the HUMAN-visible vanish
 * (docs/healing-laws.md D2/D5 + the event-driven removal in meet.html).
 *
 * Topology: a swarm shard of N bots (test/swarm/swarm.js, solid-swatch cams) plus
 * TWO real observer clients in a separate chromium. One bot is CRASHED
 * (CDP Page.crash via the swarm ctrl file — renderer dies, no unload, no
 * LEAVE) and one bot LEAVES gracefully (about:blank navigation — pagehide
 * fires the mesh LEAVE + farewell). At BOTH observers we measure, per mode:
 *   - vanish -> tile element gone from the DOM (dropPeer ran)
 *   - vanish -> participant count settled to the new total
 * and then assert the count HOLDS (no collateral removals, no ghost return).
 *
 * Self-contained: spawns its own relay + static server for THIS checkout,
 * like e2e-vanish-browser.js. Loose bounds gate the exit code (crash <=12s,
 * graceful <=6s — targets 10/3); the MEASURE lines carry the honest numbers.
 *
 *   node test/swarm/vanish-drill.js [--bots 6]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
// Default 3 bots: 5 participants = ONE full row, every pair wired — the clean
// regression guard for the event-driven removal itself. Larger rooms (e.g.
// --bots 6) span sections and currently inherit the WIP seating-port's
// under-wired pairs (see e2e-latejoin), which measures mesh healing latency,
// not the UI's: useful as a diagnostic, not as a pass/fail gate.
const BOTS = Math.max(1, parseInt(args.bots || '3', 10));
const CHROME = process.env.MEET_CHROME || process.env.SWARM_CHROME
  || '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const RELAY_PORT = 8824, SITE_PORT = 8826;
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const ROOM = 'vdrill-' + Date.now().toString(36);
const CTRL = path.join(require('os').tmpdir(), 'vanish-drill-ctrl-' + process.pid);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  let swarm = null;
  const cleanup = () => {
    for (const c of [relay, site, swarm]) { try { c && c.kill(); } catch (e) {} }
    try { fs.unlinkSync(CTRL); } catch (e) {}
  };
  process.on('exit', cleanup);
  await sleep(900);

  // ---- the swarm shard (its own chromium; ctrl file drives the faults) ------
  swarm = spawn('node', [path.join(__dirname, 'swarm.js'),
    '--room', ROOM, '--n', String(BOTS), '--base', BASE, '--relay', RELAY,
    '--ramp', '700', '--chat', '0', '--speak', '0', '--videos', '/nonexistent',
    '--ctrl', CTRL],
    { env: { ...process.env, SWARM_CHROME: CHROME }, stdio: ['ignore', 'pipe', 'pipe'] });
  let swarmLog = '';
  swarm.stdout.on('data', (d) => { swarmLog += d; process.stdout.write('[swarm] ' + d); });
  swarm.stderr.on('data', (d) => { swarmLog += d; });

  // ---- two observers (a separate chromium — real meet.html clients) ---------
  const browser = await chromium.launch({ executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const observers = [];
  for (const name of ['obs-A', 'obs-B']) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const page = await ctx.newPage();
    await page.goto(BASE + '/meet.html#v=' + ROOM + '&relay=' + encodeURIComponent(RELAY) + '&DEBUG=on', { timeout: 120000, waitUntil: 'domcontentloaded' });
    observers.push({ name, page });
  }

  // ---- convergence: both observers see the whole room -----------------------
  const TOTAL = BOTS + 2;
  {
    const t0 = Date.now();
    let ns = [];
    while (Date.now() - t0 < 180000) {
      ns = await Promise.all(observers.map((o) => o.page.evaluate(() => window.__gifosVideo.participants()).catch(() => 0)));
      if (ns.every((n) => n === TOTAL)) break;
      await sleep(1000);
    }
    check('setup: both observers converge on ' + TOTAL + ' participants', ns.every((n) => n === TOTAL), ns);
  }

  // ---- census: map bot names -> full peer ids (DEBUG probeTree gossip) ------
  let census = null;
  const idOfBot = {};
  for (let attempt = 0; attempt < 4 && Object.keys(idOfBot).length < BOTS; attempt++) {
    census = await observers[0].page.evaluate(() => window.__gifosVideo.probeTree(5000));
    for (const r of (Array.isArray(census) ? census : [])) {
      if (r && r.name && /^Bot-\d+$/.test(r.name)) idOfBot[r.name] = r.from;
    }
    if (!Array.isArray(census)) { console.log('  census error: ' + JSON.stringify(census)); await sleep(2000); }
    else if (Object.keys(idOfBot).length < BOTS) { console.log('  census attempt ' + attempt + ': ' + census.length + ' replies, bots so far ' + Object.keys(idOfBot).length); await sleep(2000); }
  }
  check('census resolved every bot name -> peer id', Object.keys(idOfBot).length === BOTS, Object.keys(idOfBot).sort());

  const tileGone = (o, fullId) => o.page.evaluate((id) => !document.querySelector('.tile[data-peer="' + id + '"]'), fullId).catch(() => null);
  const countOf = (o) => o.page.evaluate(() => window.__gifosVideo.participants()).catch(() => -1);

  // One vanish leg: fire `cmd idx` at the swarm, then measure both observers.
  async function leg(label, cmd, idx, expectTotal, boundMs) {
    const vid = idOfBot['Bot-' + idx];
    check(label + ': victim Bot-' + idx + ' resolved', !!vid, String(vid).slice(0, 8));
    if (!vid) return;
    const pre = await Promise.all(observers.map((o) => o.page.evaluate((id8) => (window.__gifosVideo.pairs().find((q) => q.id === id8) || null), String(vid).slice(0, 8)).catch(() => null)));
    console.log('  victim pair pre A/B: ' + JSON.stringify(pre));
    fs.writeFileSync(CTRL, cmd + ' ' + idx + '\n');
    const t0 = Date.now();
    const tileMs = [-1, -1], cntMs = [-1, -1];
    while (Date.now() - t0 < 90000) {
      for (let i = 0; i < 2; i++) {
        if (tileMs[i] < 0 && (await tileGone(observers[i], vid)) === true) tileMs[i] = Date.now() - t0;
        if (cntMs[i] < 0 && (await countOf(observers[i])) === expectTotal) cntMs[i] = Date.now() - t0;
      }
      if (tileMs.every((x) => x >= 0) && cntMs.every((x) => x >= 0)) break;
      await sleep(300);
    }
    const worstTile = Math.max(...tileMs.map((x) => (x < 0 ? 1e9 : x)));
    const worstCnt = Math.max(...cntMs.map((x) => (x < 0 ? 1e9 : x)));
    check(label + ' -> tile gone at BOTH observers in ' + (worstTile / 1000).toFixed(1) + 's (bound <=' + boundMs / 1000 + 's)',
      worstTile <= boundMs, { tileMs });
    check(label + ' -> count settled to ' + expectTotal + ' at both in ' + (worstCnt / 1000).toFixed(1) + 's', worstCnt <= Math.max(boundMs, 20000), { cntMs });
    console.log('  MEASURE ' + label + ': tile-gone A/B = ' + tileMs.map((x) => (x / 1000).toFixed(1)).join('/')
      + 's; count-settled A/B = ' + cntMs.map((x) => (x / 1000).toFixed(1)).join('/') + 's');
    const dep = await Promise.all(observers.map((o) => o.page.evaluate(() => window.__gifosVideo.departed()).catch(() => null)));
    console.log('  departed-tombstones A/B: ' + JSON.stringify(dep));
    // stability: the count HOLDS (no collateral drops, no ghost resurrection)
    await sleep(10000);
    const after = await Promise.all(observers.map(countOf));
    check(label + ': count still ' + expectTotal + ' after 10s (no collateral removal / ghost return)', after.every((n) => n === expectTotal), after);
  }

  await leg('CRASH (renderer killed)', 'crash', 1, TOTAL - 1, 12000);
  await leg('GRACEFUL (pagehide)', 'leave', 2, TOTAL - 2, 6000);

  await browser.close().catch(() => {});
  cleanup();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
