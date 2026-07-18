// e2e-latejoin.js — THE late-join deadlock regression (docs/meet-security.md
// §FWD, healing-laws R2). The bug: a late joiner's WebRTC offers target
// SOCKETLESS deep seats (R2 — seated peers drop their relay sockets), the
// relay silently dropped the frames, and the old sponsor-forward needed a
// mutual DataChannel friend the newcomer doesn't have yet — so conn stayed 0
// forever while relaySig climbed. The fix: greeter-DOOR sponsor entry +
// ttl-bounded unicast mesh hops (fsig/fmesh), an explicit relay {t:'nosock'}
// bounce, and the wire holding a deep newcomer's socket until it is wired.
//
// Scenario (C=2 via GIFOS_SCALE — the K-sweep idiom, so a 9-browser room
// exercises a real two-level stadium):
//   1. 8 early users join and converge: 4 fill Section 1 (socketed greeters),
//      4 seat DEEP (heads of the four child rows) and DROP their sockets.
//   2. A LATE user joins. It is admitted next to a socketless deep head — the
//      exact deadlock topology. It must reach a CONNECTED WebRTC link to that
//      socketless head within a tight bound, and live media must flow.
//   3. The sponsored path must have actually carried the signaling (txStats:
//      fwdSig/fwdMesh/doorSig on the newcomer, hopFwd/hopRelay on the mesh).
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
const ROOM_TIGHT_MS = 15000; // the bound: seated → connected link to the socketless head

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

(async () => {
  // ---- own servers (worktree-safe) ----
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', 'site')], { stdio: 'ignore' });
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
  // Every context: C=2 (a 2×2 Section 1 — the K-sweep idiom) + our relay.
  const setup = (name) => ({ content: 'window.GIFOS_SCALE={C:2};'
    + "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const users = [];
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    users.push({ name, ctx, page });
    return page;
  };
  const evalV = (page, fn) => page.evaluate(fn);
  const mesh = (page) => evalV(page, () => {
    const V = window.__gifosVideo;
    return { coord: V.meshCoord(), state: (V.meshState() || {}).state, relayUp: V.relayUp ? V.relayUp() : null, conn: V.liveLinks() };
  });

  // ---- 1. eight early users converge; deep seats drop their sockets ----
  const GOTO = { timeout: 90000, waitUntil: 'domcontentloaded' }; // page-load patience under box load; assertions keep their own bounds
  const first = await newUser('E0');
  await first.goto(BASE + '/meet.html', GOTO);
  await first.locator('#lob-open').click();
  await first.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 20000 });
  const link = await evalV(first, () => document.getElementById('share-url').value);
  console.log('room link: ' + link);
  for (let i = 1; i < 8; i++) {
    const p = await newUser('E' + i);
    await p.goto(link, GOTO);
    await sleep(1200); // gentle ramp — let each seat land before the next knock
  }
  // Converge: all 8 seated, unique coords, 4 in Section 1 + 4 deep.
  let conv = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const st = await Promise.all(users.map((u) => mesh(u.page).catch(() => null)));
    const seated = st.filter((s) => s && s.state === 3 && s.coord);
    const keys = new Set(seated.map((s) => s.coord.pc + '_' + s.coord.r + '_' + s.coord.i));
    const s1 = seated.filter((s) => s.coord.pc === 0).length;
    conv = { seated: seated.length, uniq: keys.size, s1, st };
    if (seated.length === 8 && keys.size === 8 && s1 === 4) break;
    await sleep(1500);
  }
  check('8 early users seated on unique coords (4 Section-1 + 4 deep)',
    conv && conv.seated === 8 && conv.uniq === 8 && conv.s1 === 4,
    conv && { seated: conv.seated, uniq: conv.uniq, s1: conv.s1 });

  // Deep seats drop their relay sockets (R2 scope; wired() satisfied by their
  // owner link) — THE precondition of the deadlock.
  let deepIdx = [], dropOk = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 60000) {
    const st = await Promise.all(users.map((u) => mesh(u.page).catch(() => null)));
    deepIdx = st.map((s, i) => (s && s.coord && s.coord.pc !== 0) ? i : -1).filter((i) => i >= 0);
    if (deepIdx.length === 4 && deepIdx.every((i) => st[i].relayUp === false)) { dropOk = true; break; }
    await sleep(1500);
  }
  check('all 4 deep seats dropped their relay sockets (R2 greeting scope)', dropOk, { deep: deepIdx.length });
  // Deep seats hold a live link to their Section-1 owner (the room works).
  const preSt = await Promise.all(users.map((u) => mesh(u.page)));
  check('early room holds working links', deepIdx.every((i) => preSt[i].conn >= 1),
    deepIdx.map((i) => preSt[i].conn).join(','));
  // Turn the deep heads' cameras on so the late joiner has live media to receive.
  for (const i of deepIdx) await evalV(users[i].page, () => { const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); });

  const preTx = await Promise.all(users.map((u) => evalV(u.page, () => window.__gifosVideo.txStats())));

  // ---- 2. the LATE joiner ----
  const late = await newUser('LATE');
  const tJoin = Date.now();
  await late.goto(link, GOTO);
  await late.waitForFunction(() => { const V = window.__gifosVideo; const s = V && V.meshState(); return s && s.state === 3 && V.meshCoord(); }, null, { timeout: 30000 });
  const lc = await evalV(late, () => window.__gifosVideo.meshCoord());
  const tSeat = Date.now();
  console.log('late joiner seated at ' + lc.pc + '/' + lc.r + '.' + lc.i + ' after ' + (tSeat - tJoin) + 'ms');
  check('late joiner seats DEEP, beside a socketless head', lc.pc !== 0 && lc.i !== 0, lc);

  // THE deadlock link: the CONNECTED WebRTC pair with its row's socketless
  // head, within the tight bound.
  const headConn = await evalV(late, () => new Promise((resolve) => {
    const V = window.__gifosVideo, T = GifOS.net.topo;
    const t0 = Date.now();
    const iv = setInterval(() => {
      const c = V.meshCoord(); if (!c) return;
      const d = V.debugDump();
      const headK = c.pc + '_' + c.r + '_0';
      const head = (d.roster || []).find((r) => r.coord === headK);
      if (head && head.conn) { clearInterval(iv); resolve({ ok: true, ms: Date.now() - t0, head: head.peer }); }
      else if (Date.now() - t0 > 30000) { clearInterval(iv); resolve({ ok: false, ms: Date.now() - t0, roster: (d.roster || []).map((r) => ({ p: r.peer, c: r.coord, conn: r.conn })) }); }
    }, 300);
  }));
  const joinToConnMs = (tSeat - tJoin) + (headConn.ms || 0);
  check('late joiner CONNECTED to the socketless deep head within ' + (ROOM_TIGHT_MS / 1000) + 's of joining',
    headConn.ok && joinToConnMs <= ROOM_TIGHT_MS,
    { ok: headConn.ok, joinToConnMs, detail: headConn });
  check('late joiner holds ≥1 live link', (await evalV(late, () => window.__gifosVideo.liveLinks())) >= 1);

  // ---- 3. live media across the healed link ----
  await evalV(late, () => { const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); });
  let media = null;
  const t2 = Date.now();
  while (Date.now() - t2 < 25000) {
    media = await evalV(late, () => {
      const V = window.__gifosVideo, c = V.meshCoord();
      const d = V.debugDump();
      const head = (d.roster || []).find((r) => r.coord === (c.pc + '_' + c.r + '_0'));
      return head ? { conn: head.conn, vid: head.vid } : null;
    });
    if (media && media.vid) break;
    await sleep(1000);
  }
  check('live media flows from the socketless head to the late joiner', !!(media && media.vid), media);

  // ---- 4. the SPONSORED path actually carried the signaling ----
  const postTxLate = await evalV(late, () => window.__gifosVideo.txStats());
  const postTx = await Promise.all(users.slice(0, 8).map((u) => evalV(u.page, () => window.__gifosVideo.txStats()).catch(() => null)));
  const dHops = postTx.reduce((a, t, i) => !t ? a : a + (t.hopFwd - preTx[i].hopFwd) + (t.hopRelay - preTx[i].hopRelay), 0);
  const lateSponsored = (postTxLate.fwdSig || 0) + (postTxLate.fwdMesh || 0) + (postTxLate.doorSig || 0);
  console.log('late txStats: ' + JSON.stringify(postTxLate));
  console.log('mesh hop-forward deltas (early users): ' + dHops);
  check('newcomer sent signaling over the sponsor path (fwdSig+fwdMesh+doorSig > 0)', lateSponsored > 0, lateSponsored);
  check('the mesh hop-forwarded envelopes for the pair (hopFwd+hopRelay > 0)', dHops > 0, dHops);

  // The relay told senders the truth at least once OR the roster gate skipped
  // it entirely — nosock is informative, not required, so just report it.
  const nosockTotal = postTx.reduce((a, t, i) => !t ? a : a + (t.nosock - preTx[i].nosock), (postTxLate.nosock || 0));
  console.log('nosock bounces observed: ' + nosockTotal + ' (informative)');

  for (const u of users) { try { await u.ctx.close(); } catch (e) {} }
  await browser.close();
  cleanup();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', (e && e.message) || e); process.exit(2); });
