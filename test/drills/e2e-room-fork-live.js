// e2e-room-fork-live.js — THE LIVE SHAPE OF THE 7-HOUR FORK, AND THE ALARM
// THAT MUST FIRE ON IT.
//
// THE FIELD BUG (bug ledger 2026-08-05 §6). Monitor room `test`, 17:30→00:34Z:
// two ONE-SEAT trees coexisted on ONE relay session for seven hours. The bot
// read `0/0.0 occ=1 links=0` — indistinguishable, from inside, from an empty
// room — while the phone sat in its own tree with live video. Two-ring
// reconciliation never dissolved it and joiners into that state survived 95s.
// The SIM family is gated (test/batteries/c-sweep.sh asserts dups=0 under
// total partition at every C), but the LIVE shape had no test at all, and the
// flap doc's `greeterTrace` observability was never built.
//
// WHAT THIS DRILL GUARDS — the ALARM, not the heal. Whether a fork of this
// shape should self-dissolve is healing-laws work (mesh-wire's fragment-rescue
// chain already owns every case where the door can SEE the other half; this
// one is precisely the case where it cannot). What is not negotiable is that
// it must never again be INVISIBLE. So:
//
//   1. HEALTHY   two seats in one tree — the watch must stay SILENT. A
//                detector that always fires is worse than no detector.
//   2. FORKED    the pair is severed both ways; each half heals itself into a
//                one-seat tree at 0/0.0, both still socketed to the SAME relay
//                session. The watch must fire on BOTH sides, name the other
//                half, and classify it `solo-fork`.
//   3. HEALED    the sever lifts, the halves reunite — the watch must CLEAR.
//
// The observation under test (test/tools/fork-detect.js): the relay broadcasts
// {t:'roster', peers:[…]} — every socket on the session, whatever tree its
// owner is in. One relay session is one stadium (healing-laws R2/R3), so a
// peer socketed here that holds no cell in my occupancy, past any lawful entry
// dance, IS a second tree. The manufacture is a partition; the relay is NOT
// partitioned from either half — exactly as in the field, where both halves
// held live sockets on one session the whole seven hours.
//
// Self-contained: own relay (8886) + own static server (8889) — worktree-safe.
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');
const { forkProbeInPage, makeForkWatch, forkLine } = require('../tools/fork-detect.js');

const RELAY_PORT = parseInt(process.env.FORKLIVE_RELAY_PORT || '8886', 10);
const SITE_PORT = parseInt(process.env.FORKLIVE_SITE_PORT || '8889', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const ROOM = 'forklive-' + Date.now().toString(36);
// The drill's dwell. Production is 90s (past ENTRY RESUME's worst case); here
// it is compressed to 6s so the SHAPE is what is asserted, not the constant.
const DWELL_MS = parseInt(process.env.FORKLIVE_DWELL_MS || '6000', 10);
const SEVER_MS = parseInt(process.env.FORKLIVE_SEVER_MS || '75000', 10); // must outlast: fork forms (~5-20s) + dwell + the observation window
const QUIET_MS = 14000;   // phase 1: how long the healthy room must stay silent (> 2x dwell)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

const LAUNCH_ARGS = ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'];

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: LAUNCH_ARGS });
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const page = await ctx.newPage();
    await page.goto(BASE + '/run.html#v=' + ROOM + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 });
    // Each side gets its OWN watch — the verdict is per-observer by
    // construction, and half of the point is that BOTH halves can see it.
    return { name, ctx, page, watch: makeForkWatch({ dwellMs: DWELL_MS }), last: null };
  };
  const idOf = (u) => u.page.evaluate(() => { try { return window.__gifosVideo.debugDump().me.peer; } catch (e) { return null; } }).catch(() => null);
  const seatOf = (u) => u.page.evaluate(() => {
    const d = window.__gifosVideo.debugDump();
    return { coord: d.me.coord, occ: d.me.occ, links: d.me.links, parts: d.participants };
  }).catch((e) => ({ err: String(e).slice(0, 60) }));
  // ONE sample of the thing under test: probe the page, feed the dwell clock.
  const sample = async (u) => {
    const p = await u.page.evaluate(forkProbeInPage).catch((e) => ({ err: String(e).slice(0, 80) }));
    u.last = u.watch.feed(p);
    return u.last;
  };

  // ---- 1. two seats, one tree -------------------------------------------
  const ada = await mk('Ada');
  await ada.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.debugDump().me.coord, null, { timeout: 40000 });
  const bob = await mk('Bob');
  await bob.page.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1 && window.__gifosVideo.debugDump().me.coord, null, { timeout: 60000 });
  await ada.page.waitForFunction(() => window.__gifosVideo.participants() >= 2, null, { timeout: 40000 }).catch(() => {});
  const adaId = await idOf(ada), bobId = await idOf(bob);
  check('setup: two seats in one tree', !!(adaId && bobId), { ada: await seatOf(ada), bob: await seatOf(bob) });

  // ---- 2. THE SILENT POLARITY. A healthy room must never trip the watch.
  // Each side IS socketed on the other's relay session and each holds a cell
  // in the other's occupancy — which is the whole distinction being tested.
  let falseFire = null;
  const tQuiet = Date.now();
  while (Date.now() - tQuiet < QUIET_MS) {
    for (const u of [ada, bob]) { const v = await sample(u); if (v.ok && v.fork && !falseFire) falseFire = { who: u.name, v }; }
    await sleep(700);
  }
  check('healthy room: the watch stays SILENT for ' + (QUIET_MS / 1000) + 's on both sides (dwell ' + (DWELL_MS / 1000) + 's)',
    !falseFire, falseFire ? { falseFire: forkLine(falseFire.v), who: falseFire.who } : { ada: forkLine(ada.last), bob: forkLine(bob.last) });

  // ---- 3. MANUFACTURE THE LIVE SHAPE. Sever the pair BOTH ways: transports
  // dead, every frame between them dropped — and both sockets still attached
  // to the one relay session, exactly the field's topology.
  const sv1 = await ada.page.evaluate((a) => window.__gifosVideo.severPair(a.pid, a.ms), { pid: bobId, ms: SEVER_MS });
  const sv2 = await bob.page.evaluate((a) => window.__gifosVideo.severPair(a.pid, a.ms), { pid: adaId, ms: SEVER_MS });
  check('pair severed both ways (transports dead, frames dropped, sockets kept)', !!(sv1 && sv1.ok && sv2 && sv2.ok), { sv1, sv2 });

  const tSever = Date.now();
  let forkedAt = -1;
  while (Date.now() - tSever < 45000) {
    const [sa, sb] = await Promise.all([seatOf(ada), seatOf(bob)]);
    if ((sa.occ || 9) <= 1 && (sb.occ || 9) <= 1) { forkedAt = Date.now() - tSever; break; }
    await sleep(600);
  }
  check('the room FORKED into two ONE-SEAT trees on one relay session' + (forkedAt >= 0 ? ' in ' + (forkedAt / 1000).toFixed(1) + 's' : ' — NEVER (the pair survived the sever)'),
    forkedAt >= 0, forkedAt >= 0 ? undefined : { ada: await seatOf(ada), bob: await seatOf(bob) });

  // ---- 4. THE ALARM. Both halves must SEE it — each names the other, and
  // classifies it solo-fork (I am a one-seat tree; someone else is here).
  const seen = { Ada: null, Bob: null };
  const tWatch = Date.now();
  const budget = DWELL_MS + 30000;
  while (Date.now() - tWatch < budget && !(seen.Ada && seen.Bob)) {
    for (const u of [ada, bob]) { const v = await sample(u); if (v.ok && v.fork && !seen[u.name]) seen[u.name] = { atMs: Date.now() - tWatch, v }; }
    await sleep(700);
  }
  for (const u of [ada, bob]) console.log('  [' + u.name + '] ' + forkLine(u.last));
  check('Ada SEES the fork (within ' + (budget / 1000) + 's of it forming)', !!seen.Ada, seen.Ada ? { atMs: seen.Ada.atMs, line: forkLine(seen.Ada.v) } : { line: forkLine(ada.last) });
  check('Bob SEES the fork', !!seen.Bob, seen.Bob ? { atMs: seen.Bob.atMs, line: forkLine(seen.Bob.v) } : { line: forkLine(bob.last) });
  check('Ada NAMES Bob as the peer outside her tree',
    !!(seen.Ada && seen.Ada.v.dwelled.some((p) => bobId.indexOf(p) === 0)), { dwelled: seen.Ada && seen.Ada.v.dwelled, bob: String(bobId).slice(0, 12) });
  check('Bob NAMES Ada', !!(seen.Bob && seen.Bob.v.dwelled.some((p) => adaId.indexOf(p) === 0)),
    { dwelled: seen.Bob && seen.Bob.v.dwelled, ada: String(adaId).slice(0, 12) });
  check('classified solo-fork on both sides (the ledger\'s shape: one seat each)',
    !!(seen.Ada && seen.Ada.v.kind === 'solo-fork' && seen.Bob && seen.Bob.v.kind === 'solo-fork'),
    { ada: seen.Ada && seen.Ada.v.kind, bob: seen.Bob && seen.Bob.v.kind });
  console.log('  MEASURE fork-live: formed@' + (forkedAt / 1000).toFixed(1) + 's; seen Ada@' + (seen.Ada ? (seen.Ada.atMs / 1000).toFixed(1) : 'never')
    + 's Bob@' + (seen.Bob ? (seen.Bob.atMs / 1000).toFixed(1) : 'never') + 's after the fork formed (dwell ' + (DWELL_MS / 1000) + 's)');

  // ---- 5. AND IT CLEARS. An alarm that cannot turn off is noise, and a
  // monitor that cries fork forever teaches everyone to ignore it.
  const tLift = tSever + SEVER_MS;
  await sleep(Math.max(0, tLift - Date.now()));
  let clear = { Ada: -1, Bob: -1 };
  while (Date.now() - tLift < 60000 && (clear.Ada < 0 || clear.Bob < 0)) {
    for (const u of [ada, bob]) { const v = await sample(u); if (v.ok && !v.fork && clear[u.name] < 0) clear[u.name] = Date.now() - tLift; }
    await sleep(700);
  }
  const secs = (ms) => (ms < 0 ? 'NEVER (>60s)' : (ms / 1000).toFixed(1) + 's');
  check('the alarm CLEARS on both sides after the halves reunite (Ada ' + secs(clear.Ada) + ', Bob ' + secs(clear.Bob) + ')',
    clear.Ada >= 0 && clear.Bob >= 0, { clear, ada: forkLine(ada.last), bob: forkLine(bob.last), adaSeat: await seatOf(ada), bobSeat: await seatOf(bob) });

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
