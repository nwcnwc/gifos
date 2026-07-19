// e2e-vanish-browser.js — the BROWSER half of the D5 vanish measurement
// (test/e2e-vanish.js measures the mesh+wire stack; THIS measures the full
// meet.html plumbing: pagehide/beforeunload -> instant LEAVE, and dc.onclose /
// pc-hard-state -> seat.transportLost -> probe-gated early confirm).
//
// Scenario: 4 survivors in one shared chromium + 1 victim in its OWN chromium
// process. GRACEFUL: a survivor's page navigates away (pagehide) -> the seat
// frees ~instantly everywhere. CRASH: the victim's whole browser is SIGKILLed
// (no LEAVE, no unload handler — the true ungraceful death) -> survivors'
// transports die, the D5 early probe confirms, seat freed in seconds (report
// the honest measured number; pre-D5 this was the 30-40s PONG horizon).
//
// Self-contained: own relay (8814) + own static server for THIS checkout's
// site/ (8816) — safe to run from a worktree.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const RELAY_PORT = 8814, SITE_PORT = 8816;
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const ROOM = 'vanish-' + Date.now().toString(36);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

const LAUNCH_ARGS = ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns'];

(async () => {
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const GOTO = { timeout: 120000, waitUntil: 'domcontentloaded' };
  const roomUrl = BASE + '/meet.html#v=' + ROOM + '&relay=' + encodeURIComponent(RELAY);

  const mainBrowser = await chromium.launch({ executablePath: CHROME, headless: true, args: LAUNCH_ARGS });
  const users = [];
  async function join(browser, name) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    const page = await ctx.newPage();
    await page.goto(roomUrl, GOTO);
    const u = { name, ctx, page, id: null };
    users.push(u);
    return u;
  }
  const idOf = async (u) => u.page.evaluate(() => { const V = window.__gifosVideo; try { return V.debugDump().me.peer; } catch (e) { return null; } });
  const seated = async (u) => u.page.evaluate(() => { const V = window.__gifosVideo; const s = V.meshState(); return !!(s && s.state === 3); }).catch(() => false);
  // does this survivor still hold peer PREFIX anywhere in its C×C home grid?
  const seesPrefix = (u, prefix) => u.page.evaluate((pfx) => {
    try { const rows = window.__gifosVideo.debugDump().rows; return rows.some((r) => r.some((v) => v === pfx)); } catch (e) { return null; }
  }, prefix).catch(() => null); // null = watcher unreadable this poll (ignored), never a poisoned "sees it forever"

  // ---- join 4 survivors + 1 victim (its own OS process) ----------------------
  for (let i = 0; i < 4; i++) { await join(mainBrowser, 'surv' + i); await sleep(700); }
  // Mark the victim's chrome with a unique flag so we can SIGKILL its real OS
  // processes (this playwright build has no browser.process()).
  const MARK = '--gifos-vanish-victim=' + process.pid;
  const victimBrowser = await chromium.launch({ executablePath: CHROME, headless: true, args: LAUNCH_ARGS.concat([MARK]) });
  const victim = await join(victimBrowser, 'victim');
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const st = await Promise.all(users.map(seated));
      if (st.every(Boolean)) break;
      await sleep(700);
    }
    const st = await Promise.all(users.map(seated));
    check('setup: all 5 browsers seated in the mesh', st.every(Boolean), st);
    for (const u of users) u.id = await idOf(u);
  }
  // has the peer's TILE left this survivor's DOM? (the user-visible vanish)
  const tileGone = (u, fullId) => u.page.evaluate((id) => !document.querySelector('.tile[data-peer="' + id + '"]'), fullId).catch(() => null);

  // ---- 1. CRASH first (clean converged room): SIGKILL the victim browser -----
  {
    const vPfx = String(victim.id).slice(0, 8);
    const watchers = users.filter((u) => u !== victim);
    // find the victim chrome's OS pids via the unique mark, then SIGKILL them
    const pids = require('child_process').execSync("pgrep -f -- '" + MARK + "' || true").toString().trim().split('\n').filter(Boolean).map(Number);
    check('crash: found victim chrome pids via mark', pids.length > 0, { pids: pids.length });
    const t0 = Date.now();
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} } // ungraceful: no unload handlers, no LEAVE
    let freedMs = -1, tileMs = -1;
    while (Date.now() - t0 < 120000) {
      if (freedMs < 0) { const sees = await Promise.all(watchers.map((u) => seesPrefix(u, vPfx))); if (sees.every((s) => s === false)) freedMs = Date.now() - t0; }
      if (tileMs < 0) { const gone = await Promise.all(watchers.map((u) => tileGone(u, victim.id))); if (gone.every((g) => g === true)) tileMs = Date.now() - t0; }
      if (freedMs >= 0 && tileMs >= 0) break;
      await sleep(400);
    }
    // Honest target: <=15s wall for the SEAT. The fast signal is the relay
    // watching the victim's TCP socket die (~0.5s) -> D5 probe -> EARLY_HOLD
    // 6s -> confirm; desktop chromium's own pc state needs ~30s to reach
    // 'failed', which is why the pre-D5 path took the 30-40s+ horizon.
    check('CRASH (SIGKILLed browser) -> mesh seat freed across survivors in ' + (freedMs / 1000).toFixed(1) + 's (target <=15s; pre-D5 30s+)',
      freedMs >= 0 && freedMs <= 15000, { freedMs });
    // The HUMAN-visible vanish must FOLLOW the mesh within a beat now (the
    // event-driven D2/D5 removal): pre-rewire this rode ABSENT_GRACE and
    // measured ~20s; the D5 confirm lands ~7s, so <=12s is honest headroom.
    check('CRASH -> tile gone at every survivor in ' + (tileMs / 1000).toFixed(1) + 's (target <=12s; pre-rewire ~20s)',
      tileMs >= 0 && tileMs <= 12000, { tileMs });
    console.log('  MEASURE crash(browser): vanish->seat-freed = ' + (freedMs / 1000).toFixed(1) + 's; vanish->tile-gone = ' + (tileMs / 1000).toFixed(1) + 's');
  }

  // ---- 2. GRACEFUL: a page navigates away (pagehide -> LEAVE flushes) --------
  {
    const grace = users[3];
    const watchers = users.filter((u) => u !== grace && u !== victim);
    const t0 = Date.now();
    await grace.page.goto('about:blank'); // fires pagehide + beforeunload — the real close path
    // The mesh seat frees on the LEAVE instantly (proven at the wire level in
    // e2e-vanish.js: 2 ticks); a stale non-first-hand occ HINT can echo for a
    // while (pre-existing, tenure-free). The honest browser observable is the
    // user-visible one: the leaver's tile is gone from every survivor.
    let goneMs = -1;
    while (Date.now() - t0 < 60000) {
      const gone = await Promise.all(watchers.map((u) => tileGone(u, grace.id)));
      if (gone.every((g) => g === true)) { goneMs = Date.now() - t0; break; }
      await sleep(300);
    }
    // Event-driven now: the leaver fans a 'bye' gossip + the mesh LEAVE frees
    // the seat instantly — every survivor should drop the tile within ~1 beat
    // (target <=3s end-to-end; <=6s asserted for CI headroom; pre-rewire ~10s).
    check('GRACEFUL (pagehide) -> gone from every survivor in ' + (goneMs / 1000).toFixed(1) + 's (target <=6s; pre-rewire ~10s)',
      goneMs >= 0 && goneMs <= 6000, { goneMs });
    console.log('  MEASURE graceful(browser): vanish->gone = ' + (goneMs / 1000).toFixed(1) + 's (pre-pagehide, mobile closes fired NOTHING and took the silent path)');
    await grace.ctx.close().catch(() => {});
  }

  // ---- 3. COUNT: the Stadium arithmetic followed the removals ----------------
  {
    const remain = users.slice(0, 3); // victim crashed, users[3] left gracefully
    let counts = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      counts = await Promise.all(remain.map((u) => u.page.evaluate(() => window.__gifosVideo.participants()).catch(() => -1)));
      if (counts.every((c) => c === 3)) break;
      await sleep(500);
    }
    check('participant count settles to 3 on every remaining phone after both departures', counts.every((c) => c === 3), counts);
  }

  // ---- 4. BLIP PROTECTION: a dead TRANSPORT is not a dead PEER ---------------
  // Kill u0's pc to u1 (_failPeer — the fault-injection hook). u1 is alive and
  // answers the D5 probe over the mesh, so its seat never frees; the tile must
  // SURVIVE the whole outage (frozen at worst) while the sweeper rebuilds ICE.
  {
    const [a, b] = users;
    await a.page.evaluate((id) => window.__gifosVideo._failPeer(id), b.id);
    let vanished = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      const gone = await tileGone(a, b.id);
      if (gone === true) { vanished = true; break; }
      await sleep(500);
    }
    check('BLIP (pc killed a->b): b\'s tile never leaves a\'s grid during the outage', !vanished);
    let reconn = false;
    while (Date.now() - t0 < 45000) {
      const pairs = await a.page.evaluate(() => window.__gifosVideo.pairs()).catch(() => []);
      if (pairs.some((p) => p.id === String(b.id).slice(0, 8) && p.connected)) { reconn = true; break; }
      await sleep(700);
    }
    check('BLIP: the pair reconnects (sweeper ICE rebuild) with the tile intact', reconn && !(await tileGone(a, b.id)));
  }

  // ---- 5. AWAY PROTECTION: a locked phone keeps its seat AND its tile --------
  // users[2] simulates visibilitychange-hidden (the app-level away signal —
  // exactly what a locked phone fires). Its DC stays open, its status keeps
  // beating (12s hidden pulse < the 15s freshness window), so no removal path
  // may touch it: the tile stays, labeled away, for well past ABSENT_GRACE.
  {
    const away = users[2], watchers = users.slice(0, 2);
    await away.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    let vanished = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 18000) { // > ABSENT_GRACE (12s) and > the 15s freshness window
      const gone = await Promise.all(watchers.map((u) => tileGone(u, away.id)));
      if (gone.some((g) => g === true)) { vanished = true; break; }
      await sleep(600);
    }
    const seenAway = await Promise.all(watchers.map((u) => u.page.evaluate((id) => window.__gifosVideo.awayOf(id), away.id).catch(() => null)));
    check('AWAY (18s hidden): tile never removed at any watcher', !vanished);
    check('AWAY: watchers label the peer away, not gone', seenAway.every((x) => x === true), seenAway);
    await away.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  await mainBrowser.close().catch(() => {});
  await victimBrowser.close().catch(() => {});
  cleanup();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); cleanupSafe(); process.exit(1); });
function cleanupSafe() {}
