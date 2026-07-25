// e2e-relay-blip.js — A RELAY BLIP MUST NOT UNMAN THE DOOR.
//
// The relay's greeter pool is pure socket-attachment state: an entry dies WITH
// its socket (relay.js greeterList — "a greeter's attachment dies with its
// socket"). Before the wire-level re-registration fix, a seated Section-1
// greeter only restored its entry on the E3 timer — randomized 100-200s away —
// so ANY relay blip (deploy, Durable Object eviction, NAT reset, wifi hiccup)
// left the pool EMPTY for minutes while the room sat healthy behind it:
//
//   - a newcomer knocking in that window found a dead door and stalled at
//     hold-mint-gap (measured: 105s+ at "participants: 1" with a live 3-member
//     room right there), or
//   - knocking before any old member's socket reconnected, met an EMPTY
//     registry, FOUNDED a second meeting under a fresh genesis key — the
//     production room tear behind the R5 "two meetings" picker and the
//     participant counts that bounced 1-3 with three real people in the room.
//
// The fix (mesh-wire): a seated S1 greeter re-registers on every socket
// reconnect (sock.onopen), on any greeters reply showing an empty pool, and on
// a 55s idle keepalive whose missing reply exposes a zombie socket. This drill
// is the regression gate for the first two: blip the relay, then require that
// joiners seat FAST and the room stays ONE meeting.
//
// Self-contained: spawns its OWN relay and static server for THIS checkout's
// site/, so it is safe from a worktree and never touches production.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || (require('fs').existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
      : require('fs').existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome'
      : '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
const RELAY_PORT = parseInt(process.env.BLIP_RELAY_PORT || '8831', 10);
const SITE_PORT = parseInt(process.env.BLIP_SITE_PORT || '8833', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const SEAT_MS = 20000;   // post-blip joiners must seat within this (pre-fix: 105s+)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) failures++;
};

(async () => {
  const spawnRelay = () => {
    const r = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
      env: { ...process.env, RELAY_PORT: String(RELAY_PORT), RELAY_DEV: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    r.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
    return r;
  };
  let relay = spawnRelay();
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const room = 'blip' + Math.random().toString(36).slice(2, 10);
  const url = BASE + '/meet.html#v=' + room + '&relay=' + encodeURIComponent(RELAY);

  const users = [];
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content:
      "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','" + name + "');"
      + "localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    await page.goto(url).catch(() => {});
    const u = { name, ctx, page };
    users.push(u);
    return u;
  };

  const dump = async (u) => u.page.evaluate(() => {
    const g = (f, d) => { try { return f(); } catch (e) { return d; } };
    const d = g(() => window.__gifosVideo.debugDump(), null);
    if (!d) return null;
    return { coord: d.me.coord, pop: d.participants, occ: d.me.occ, dups: d.dups || [],
             trace: g(() => window.__gifosVideo.greeterTrace(), []) };
  }).catch(() => null);

  const waitSeat = async (u, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const d = await dump(u); if (d && d.coord) return { d, took: Date.now() - t0 }; await sleep(500); }
    return { d: await dump(u), took: Date.now() - t0 };
  };

  // ---- 3 members seat and converge -------------------------------------------
  const A = await newUser('A'); await sleep(2000);
  const B = await newUser('B'); await sleep(2000);
  const C = await newUser('C');
  for (const u of [A, B, C]) { const { d } = await waitSeat(u, 15000); check(u.name + ' seated pre-blip', !!(d && d.coord), d && d.coord); }
  await sleep(3000);

  // ---- the blip: every relay socket dies; registry state dies with them ------
  relay.kill();
  await sleep(1200);
  relay = spawnRelay();
  await sleep(1500); // relay back; steadySocket backoff reconnects land around here

  // ---- D joins in what used to be the dead-door window -----------------------
  const D = await newUser('D');
  const rd = await waitSeat(D, SEAT_MS);
  check('D seats fast after the blip (pre-fix: 105s+ stall)', !!(rd.d && rd.d.coord), { coord: rd.d && rd.d.coord, ms: rd.took });

  // an old member must show the wire-level re-registration in its forensics
  const da = await dump(A);
  const reg = (da && da.trace || []).some((t) => String(t.action || '').indexOf('re-register') === 0);
  check('a seated greeter re-registered on reconnect (greeterTrace)', reg,
    da && da.trace ? da.trace.map((t) => t.action).slice(-6) : null);

  // ---- E joins a beat later — one meeting, no tear ----------------------------
  await sleep(5000);
  const E = await newUser('E');
  const re = await waitSeat(E, SEAT_MS);
  check('E seats fast too', !!(re.d && re.d.coord), { coord: re.d && re.d.coord, ms: re.took });

  await sleep(6000);
  const views = [];
  for (const u of users) views.push({ name: u.name, d: await dump(u) });
  for (const v of views) {
    check(v.name + ' sees the whole room (pop=5)', !!(v.d && v.d.pop === 5), v.d && { pop: v.d.pop, occ: v.d.occ });
    check(v.name + ' has no duplicate-coord claims', !!(v.d && (v.d.dups || []).length === 0), v.d && v.d.dups);
  }

  await browser.close();
  cleanup();
  console.log(failures ? 'FAILURES: ' + failures : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
