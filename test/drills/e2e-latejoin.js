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
// the wired deep seats drop their sockets. Then opportunistic late joiners
// exercise whatever socketless neighbours seating hands them; the ARRANGED
// leg force-places a joiner next to a socketless seat so the deadlock is
// measured every run (seating layout churns; the invariant does not).
//
// Self-contained: spawns its OWN relay-local (port 8811) and its OWN static
// server for THIS checkout's site/ (port 8813) — safe to run from a worktree.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || '/opt/google/chrome/chrome';
const RELAY_PORT = parseInt(process.env.LATEJOIN_RELAY_PORT || '8811', 10);
const SITE_PORT = parseInt(process.env.LATEJOIN_SITE_PORT || '8813', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const TIGHT_MS = 15000;   // seated → connected to each socketless link target

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };
const pfx = (id) => String(id || '').slice(0, 12);

(async () => {
  // RELAY_DEV=1 is mandatory: without it the local relay keeps the production
  // frame-rate meter (3 frames/s sustained). A friendless newcomer's door
  // fan + ICE candidates burn that budget, frames get silently dropped, and
  // the failure looks exactly like the deadlock under test. adversary-room
  // already learned this; latejoin had only TRUSTED_IPS (bypasses the per-IP
  // socket cap, NOT the frame meter).
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: {
      ...process.env,
      RELAY_PORT: String(RELAY_PORT),
      RELAY_DEV: '1',
      TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1',
    },
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
      tx: V.txStats(), rx: V.rxStats ? V.rxStats() : null, pairs: V.pairs ? V.pairs() : null };
  });

  // ---- 1. eight early users; converge on unique seats ----
  const GOTO = { timeout: 90000, waitUntil: 'domcontentloaded' };
  const first = await newUser('E0');
  // DEBUG=on: forceSeat is gated on it. Every user loads with it so a
  // force-placed seat and its neighbours share the same diagnostics surface.
  await first.page.goto(BASE + '/meet.html#DEBUG=on', GOTO);
  await first.page.locator('#lob-open').click();
  await first.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 20000 });
  const link = (await first.page.evaluate(() => document.getElementById('share-url').value)) + '&DEBUG=on';
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
    if (seated.length === 8 && conv.uniq === 8) {
      users.forEach((u, i) => { if (st[i] && st[i].id) u.id = st[i].id; });
      break;
    }
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
    users.forEach((u, i) => { if (st[i] && st[i].id) u.id = st[i].id; });
    socketless = users.filter((u, i) => st[i] && st[i].state === 3 && st[i].relayUp === false && st[i].conn >= 1);
    if (socketless.length >= 2) break;
    await sleep(2000);
  }
  check('≥2 wired seats are seated SOCKETLESS (the deadlock precondition)', socketless.length >= 2,
    socketless.map((u) => u.name).join(','));
  const preTx = await Promise.all(users.map((u) => snap(u.page).then((s) => s.tx).catch(() => null)));

  // ---- 3. opportunistic late joiners (informative; seating churn may starve them) ----
  // Bounds are per-leg: page-load is excluded (box-load noise), the seat dance
  // gets 45s from app-ready, and the DEADLOCK leg — seated → connected to
  // every socketless link target — gets the tight 15s. One opportunistic late
  // is enough to sample natural seating; the ARRANGED leg below is the gate.
  const lateResults = [];
  for (const lname of ['LATE1']) {
    const lu = await newUser(lname);
    await lu.page.goto(link, GOTO);
    await lu.page.waitForFunction(() => !!window.__gifosVideo, null, { timeout: 60000 }).catch(() => {});
    const tReady = Date.now();
    const seatedOk = await lu.page.waitForFunction(() => {
      const V = window.__gifosVideo, s = V && V.meshState();
      return s && s.state === 3 && V.meshCoord();
    }, null, { timeout: 45000 }).then(() => true).catch(() => false);
    const tSeat = Date.now();
    const ls = seatedOk ? await snap(lu.page) : null;
    lu.id = ls && ls.id;
    check(lname + ' seats within 45s of app-ready (took ' + (tSeat - tReady) + 'ms)', seatedOk, ls && ls.coord);
    if (!seatedOk) { lateResults.push({ name: lname, socketlessTargets: [], connected: false }); continue; }
    const stNow = await Promise.all(users.filter((u) => u !== lu).map((u) => snap(u.page).catch(() => null)));
    const byId = new Map();
    users.filter((u) => u !== lu).forEach((u, i) => { if (stNow[i] && stNow[i].id) byId.set(pfx(stNow[i].id), stNow[i]); });
    const linkIds = (ls.links || []).map(pfx);
    const sockless = linkIds.filter((lid) => { const s = byId.get(lid); return s && s.state === 3 && s.relayUp === false; });
    console.log('  ' + lname + ' at ' + ls.coord + ' links=[' + linkIds.map((x) => x.slice(0, 6)).join(',') + '] socketless targets=[' + sockless.map((x) => x.slice(0, 6)).join(',') + ']');
    let allOk = sockless.length === 0, waited = 0;
    const deadline = tSeat + TIGHT_MS;
    while (Date.now() < deadline) {
      const cs = await snap(lu.page);
      const connSet = new Set((cs.connTo || []).map(pfx));
      if (sockless.every((x) => connSet.has(x))) { allOk = true; waited = Date.now() - tSeat; break; }
      await sleep(500);
    }
    if (sockless.length) {
      check(lname + ' CONNECTED to every socketless link target within ' + (TIGHT_MS / 1000) + 's of seating',
        allOk, allOk ? (waited + 'ms') : await lu.page.evaluate(() => window.__gifosVideo.pairs()).catch(() => null));
      check(lname + ' holds ≥1 live link within the bound', (await snap(lu.page)).conn >= 1,
        await lu.page.evaluate(() => window.__gifosVideo.pairs()).catch(() => null));
    } else {
      // No socketless neighbour this seating — the ARRANGED leg is the gate.
      // A deep late joiner still wiring a socketed uplink is not the deadlock
      // under test; don't fail the suite on that race.
      console.log('  ' + lname + ' has no socketless link target this run (conn='
        + (await snap(lu.page)).conn + ') — ARRANGED leg measures the deadlock');
    }
    lateResults.push({ name: lname, lu, socketlessTargets: sockless, connected: allOk });
  }

  // ---- 3b. the ARRANGED leg: THE gate — never hope seating produces the scenario ----
  // Census from DIRECT snaps of every early page — NOT probeTree. probeTree rides
  // mesh gossip; when deep seats are socketless and some S1 links are thin, the
  // flood returns census=1 (only the prober) and the leg cannot pick a cell.
  // Every early page already knows its own id+coord; that is the ground truth.
  const stAll = await Promise.all(users.map((u) => snap(u.page).catch(() => null)));
  const occSeed = {};
  const idAtCoord = {};
  users.forEach((u, i) => {
    const s = stAll[i];
    if (!s || !s.coord || !s.id) return;
    u.id = s.id;
    occSeed[s.coord] = s.id;
    idAtCoord[s.coord] = s.id;
  });
  const socklessCoords = stAll.filter((s) => s && s.state === 3 && s.coord && s.relayUp === false).map((s) => s.coord);
  console.log('  occSeed=' + Object.keys(occSeed).length + ' seats, socketless=[' + socklessCoords.join(',') + ']');

  let arranged = null;
  if (socklessCoords.length) {
    // Pick the cell on an early page that already has topo loaded — does not
    // depend on the joiner seating first.
    const pick = await users[0].page.evaluate(({ occ, sockless }) => {
      const T = window.GifOS.net.topo;
      const parse = (s) => { const m = /^(\d+)\/(\d+)\.(\d+)$/.exec(s); return m ? { pc: +m[1], r: +m[2], i: +m[3] } : null; };
      const key = (c) => c.pc + '/' + c.r + '.' + c.i;
      for (const sc of sockless) {
        const S = parse(sc); if (!S) continue;
        for (const cand of T.ownedLinks(S)) {
          const ck = key(cand);
          if (occ[ck]) continue; // taken
          const targets = T.ownedLinks(cand).map(key).filter((k) => sockless.includes(k));
          if (targets.length) return { cell: ck, targets };
        }
      }
      return null;
    }, { occ: occSeed, sockless: socklessCoords }).catch(() => null);
    check('an empty cell adjacent to a SOCKETLESS seat exists to place the joiner in',
      !!(pick && pick.targets.length), pick ? (pick.cell + ' -> targets ' + pick.targets.join(',')) : 'none found');

    if (pick) {
      const au = await newUser('ARRANGED');
      await au.page.goto(link, GOTO);
      // Mesh node must exist (room key derived, seat object built). Natural
      // admission is NOT required: forceSeat's take() path seats an unseated
      // node at the chosen cell — the deadlock under test is post-seat
      // signaling to a socketless neighbour, not the admission dance.
      const meshReady = await au.page.waitForFunction(() => {
        const V = window.__gifosVideo;
        return !!(V && V.meshState && V.meshState());
      }, null, { timeout: 60000 }).then(() => true).catch(() => false);
      check('ARRANGED joiner has a live mesh node (app ready)', meshReady);
      // Prefer natural seating when it is fast — doMove is the everyday path —
      // but do not block the gate on it.
      const seatedOk = meshReady && await au.page.waitForFunction(() => {
        const V = window.__gifosVideo, s = V && V.meshState();
        return s && s.state === 3 && V.meshCoord();
      }, null, { timeout: 20000 }).then(() => true).catch(() => false);
      console.log('  ARRANGED natural seat: ' + (seatedOk ? 'yes' : 'no (will forceSeat via take/doMove)'));

      const res = await au.page.evaluate(({ cell, seed }) => {
        const m = /^(\d+)\/(\d+)\.(\d+)$/.exec(cell);
        return window.__gifosVideo.forceSeat(+m[1], +m[2], +m[3], seed);
      }, { cell: pick.cell, seed: occSeed }).catch((e) => ({ err: String(e) }));
      const tPlaced = Date.now();
      const landed = await au.page.waitForFunction((cell) => {
        const c = window.__gifosVideo.meshCoord();
        return !!c && (c.pc + '/' + c.r + '.' + c.i) === cell;
      }, pick.cell, { timeout: 10000 }).then(() => true).catch(() => false);
      check('ARRANGED joiner is placed at ' + pick.cell, landed, JSON.stringify(res));

      // Teach each socketless target about the joiner (the effect of a delivered
      // HELLO). forceSeat + announce() already try to HELLO over §FWD; when that
      // path is lossy the far side never learns and never re-opens its relay
      // socket (wired() is all-named-links). Natural admission would have put
      // the newcomer in neighbours' occ via PLACE; we mirror that so the thing
      // under test is the offer/answer over sponsor/door, not the HELLO race.
      const arrId = landed ? (await snap(au.page).catch(() => null) || {}).id : null;
      if (arrId) {
        for (const tc of pick.targets) {
          const tid = idAtCoord[tc];
          const tu = users.find((u) => u.id && pfx(u.id) === pfx(tid));
          if (!tu) continue;
          await tu.page.evaluate(({ cell, pid }) => {
            return window.__gifosVideo.learnOcc(cell, pid);
          }, { cell: pick.cell, pid: arrId }).catch(() => null);
        }
      }

      const want = pick.targets.map((c) => idAtCoord[c]).filter(Boolean).map(pfx);
      let ok = false, waited = 0;
      let lastPairs = null;
      while (Date.now() - tPlaced < TIGHT_MS + 5000) {
        const cs = await snap(au.page).catch(() => null);
        if (cs) {
          lastPairs = cs.pairs;
          const connSet = new Set((cs.connTo || []).map(pfx));
          if (want.every((x) => connSet.has(x))) { ok = true; waited = Date.now() - tPlaced; break; }
        }
        await sleep(500);
      }
      const finalSnap = await snap(au.page).catch(() => null);
      check('ARRANGED: connected to every SOCKETLESS link target within ' + ((TIGHT_MS + 5000) / 1000) + 's',
        ok && want.length > 0, ok ? (waited + 'ms, targets=' + want.join(',')) : ('want=[' + want.join(',') + '] '
          + 'pairs=' + JSON.stringify(lastPairs)
          + ' tx=' + JSON.stringify(finalSnap && finalSnap.tx)
          + ' rx=' + JSON.stringify(finalSnap && finalSnap.rx)));
      arranged = { name: 'ARRANGED', lu: au, socketlessTargets: want, connected: ok };
      lateResults.push(arranged);
    }
  } else {
    check('an empty cell adjacent to a SOCKETLESS seat exists to place the joiner in', false, 'no socketless seat in the room at all');
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
