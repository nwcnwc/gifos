// e2e-latejoin.js — THE late-join deadlock regression (docs/meet-security.md
// §FWD, healing-laws R2). The bug: a late joiner's WebRTC offers target
// SOCKETLESS deep seats (R2 — seated peers drop their relay sockets), the
// relay silently dropped the frames, and the old sponsor-forward needed a
// mutual DataChannel friend the newcomer doesn't have yet — so conn stayed 0
// forever while relaySig climbed. The fix under test:
//   - greeter-DOOR sponsor entry + ttl-bounded unicast mesh hops (fsig/fmesh)
//   - explicit relay {t:'nosock'} bounce (both relays)
//   - mesh-wire wired(): an unwired seat keeps/reopens its relay socket
//
// Scenario (C=2 via GIFOS_SCALE — the K-sweep idiom, so a small room
// exercises a real multi-level stadium): 8 early users join, converge, and
// the wired deep seats drop their sockets. Then TWO late users join, one
// after the other. For each: every SOCKETLESS seat in its mesh link set must
// become a CONNECTED WebRTC pair within a tight bound — plus live media, and
// txStats proof that the sponsored path carried the signaling. Topology-
// independent on purpose: seating layout churns (a separate workstream); the
// deadlock invariant is about socketless link targets, wherever they sit.
//
// Self-contained: spawns its OWN relay-local (port 8811) and its OWN static
// server for THIS checkout's site/ (port 8813) — safe to run from a worktree.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const RELAY_PORT = parseInt(process.env.LATEJOIN_RELAY_PORT || '8811', 10);
const SITE_PORT = parseInt(process.env.LATEJOIN_SITE_PORT || '8813', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const TIGHT_MS = 15000;   // seated → connected to each socketless link target

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };
const pfx = (id) => String(id).slice(0, 12);

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
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
  const setup = (name) => ({ content: 'window.GIFOS_SCALE={C:2};'
    + "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const users = []; // { name, ctx, page, id }
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    const u = { name, ctx, page, id: null };
    users.push(u);
    return u;
  };
  const snap = (page) => page.evaluate(() => {
    const V = window.__gifosVideo, s = V.meshState() || {}, c = V.meshCoord();
    return { id: V.debugDump().me.peer, state: s.state, coord: c ? c.pc + '/' + c.r + '.' + c.i : null,
      relayUp: V.relayUp ? V.relayUp() : null, conn: V.liveLinks(), links: V.meshLinks(),
      connTo: (V.debugDump().roster || []).filter((r) => r.conn).map((r) => r.peer),
      tx: V.txStats() };
  });

  // ---- 1. eight early users; converge on unique seats ----
  const GOTO = { timeout: 90000, waitUntil: 'domcontentloaded' };
  const first = await newUser('E0');
  await first.page.goto(BASE + '/meet.html', GOTO);
  await first.page.locator('#lob-open').click();
  await first.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 20000 });
  const link = await first.page.evaluate(() => document.getElementById('share-url').value);
  console.log('room link: ' + link);
  for (let i = 1; i < 8; i++) {
    const u = await newUser('E' + i);
    await u.page.goto(link, GOTO);
    await sleep(1500); // gentle ramp
  }
  let conv = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const st = await Promise.all(users.map((u) => snap(u.page).catch(() => null)));
    const seated = st.filter((s) => s && s.state === 3 && s.coord);
    conv = { seated: seated.length, uniq: new Set(seated.map((s) => s.coord)).size, coords: st.map((s) => s && s.coord) };
    if (seated.length === 8 && conv.uniq === 8) break;
    await sleep(2000);
  }
  check('8 early users seated on unique coords', conv && conv.seated === 8 && conv.uniq === 8, conv && conv.coords);
  // Cameras on (media for step 4) — before the sockets drop.
  for (const u of users) await u.page.evaluate(() => { const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); }).catch(() => {});

  // ---- 2. wired deep seats drop their sockets (R2 scope) ----
  let socketless = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 60000) {
    const st = await Promise.all(users.map((u) => snap(u.page).catch(() => null)));
    users.forEach((u, i) => { if (st[i]) u.id = st[i].id; });
    socketless = users.filter((u, i) => st[i] && st[i].state === 3 && st[i].relayUp === false && st[i].conn >= 1);
    if (socketless.length >= 2) break;
    await sleep(2000);
  }
  check('≥2 wired seats are seated SOCKETLESS (the deadlock precondition)', socketless.length >= 2,
    socketless.map((u) => u.name).join(','));
  const preTx = await Promise.all(users.map((u) => snap(u.page).then((s) => s.tx).catch(() => null)));

  // ---- 3. late joiners: every socketless link target must connect fast ----
  // Bounds are per-leg: page-load is excluded (box-load noise), the seat dance
  // gets 25s from app-ready, and the DEADLOCK leg — seated → connected to
  // every socketless link target — gets the tight 15s.
  const lateResults = [];
  for (const lname of ['LATE1', 'LATE2', 'LATE3']) {
    const lu = await newUser(lname);
    await lu.page.goto(link, GOTO);
    await lu.page.waitForFunction(() => !!window.__gifosVideo, null, { timeout: 60000 }).catch(() => {});
    const tReady = Date.now();
    // 45s: the seat dance rides the SEATING laws (a separate workstream with
    // known churn at C=2); the deadlock leg below keeps the tight bound.
    const seatedOk = await lu.page.waitForFunction(() => {
      const V = window.__gifosVideo, s = V && V.meshState();
      return s && s.state === 3 && V.meshCoord();
    }, null, { timeout: 45000 }).then(() => true).catch(() => false);
    const tSeat = Date.now();
    const ls = seatedOk ? await snap(lu.page) : null;
    lu.id = ls && ls.id;
    check(lname + ' seats within 45s of app-ready (took ' + (tSeat - tReady) + 'ms)', seatedOk, ls && ls.coord);
    if (!seatedOk) { lateResults.push({ name: lname, socketlessTargets: [], connected: false }); continue; }
    // Identify this late joiner's SOCKETLESS link targets right now.
    const stNow = await Promise.all(users.filter((u) => u !== lu).map((u) => snap(u.page).catch(() => null)));
    const byId = new Map();
    users.filter((u) => u !== lu).forEach((u, i) => { if (stNow[i]) byId.set(pfx(stNow[i].id), stNow[i]); });
    const linkIds = (ls.links || []).map(pfx);
    const sockless = linkIds.filter((lid) => { const s = byId.get(lid); return s && s.state === 3 && s.relayUp === false; });
    console.log('  ' + lname + ' at ' + ls.coord + ' links=[' + linkIds.map((x) => x.slice(0, 6)).join(',') + '] socketless targets=[' + sockless.map((x) => x.slice(0, 6)).join(',') + ']');
    // The regression: each socketless target CONNECTED within the tight bound.
    let allOk = sockless.length === 0, waited = 0;
    const deadline = tSeat + TIGHT_MS;
    while (Date.now() < deadline) {
      const cs = await snap(lu.page);
      const connSet = new Set((cs.connTo || []).map(pfx));
      if (sockless.every((x) => connSet.has(x))) { allOk = true; waited = Date.now() - tSeat; break; }
      await sleep(500);
    }
    if (sockless.length) check(lname + ' CONNECTED to every socketless link target within ' + (TIGHT_MS / 1000) + 's of seating',
      allOk, allOk ? (waited + 'ms') : await lu.page.evaluate(() => window.__gifosVideo.pairs()).catch(() => null));
    check(lname + ' holds ≥1 live link within the bound', (await snap(lu.page)).conn >= 1,
      await lu.page.evaluate(() => window.__gifosVideo.pairs()).catch(() => null));
    lateResults.push({ name: lname, lu, socketlessTargets: sockless, connected: allOk });
  }
  const anyExercised = lateResults.some((r) => r.socketlessTargets.length > 0);
  check('the deadlock topology was actually exercised (a late joiner had a socketless link target)', anyExercised);

  // ---- 4. live media across a healed socketless link ----
  const mr = lateResults.find((r) => r.socketlessTargets.length && r.connected && r.lu);
  if (mr) {
    await mr.lu.page.evaluate(() => { const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); }).catch(() => {});
    let media = null;
    const t2 = Date.now();
    while (Date.now() - t2 < 30000) {
      media = await mr.lu.page.evaluate((targets) => {
        const d = window.__gifosVideo.debugDump();
        return (d.roster || []).filter((r) => targets.includes(r.peer)).map((r) => ({ p: r.peer.slice(0, 6), conn: r.conn, vid: r.vid }));
      }, mr.socketlessTargets);
      if (media.some((m) => m.vid)) break;
      await sleep(1000);
    }
    check('live media flows from a socketless-seat peer to the late joiner', !!(media && media.some((m) => m.vid)), media);
  } else {
    check('live media flows from a socketless-seat peer to the late joiner', false, 'no healed socketless link to measure');
  }

  // ---- 5. the SPONSORED path actually carried the signaling ----
  const lateTx = [];
  for (const r of lateResults) if (r.lu) lateTx.push(await snap(r.lu.page).then((s) => s.tx).catch(() => null));
  const lateSponsored = lateTx.reduce((a, t) => !t ? a : a + (t.fwdSig || 0) + (t.fwdMesh || 0) + (t.doorSig || 0), 0);
  const postTx = await Promise.all(users.slice(0, 8).map((u) => snap(u.page).then((s) => s.tx).catch(() => null)));
  const dHops = postTx.reduce((a, t, i) => (!t || !preTx[i]) ? a : a + (t.hopFwd - preTx[i].hopFwd) + (t.hopRelay - preTx[i].hopRelay), 0);
  console.log('late txStats: ' + JSON.stringify(lateTx));
  check('newcomers sent signaling over the sponsor path (fwdSig+fwdMesh+doorSig > 0)', lateSponsored > 0, lateSponsored);
  check('the mesh hop-forwarded envelopes for them (hopFwd+hopRelay deltas > 0)', dHops > 0, dHops);
  const nosockTotal = postTx.reduce((a, t, i) => (!t || !preTx[i]) ? a : a + (t.nosock - preTx[i].nosock), 0)
    + lateTx.reduce((a, t) => !t ? a : a + (t.nosock || 0), 0);
  console.log('nosock bounces observed: ' + nosockTotal + ' (informative)');

  for (const u of users) { try { await u.ctx.close(); } catch (e) {} }
  await browser.close();
  cleanup();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', (e && e.message) || e); process.exit(2); });
