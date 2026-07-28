// e2e-r5-fork-pick.js — R5 / E5§2 door pick-one in a real browser.
//
// Complements test/mesh/r5-fork-pick.js (pure mesh.js clustering + faces).
// This drill is the missing browser rung: same genesis key, two greeter
// halves with DISJOINT S1 rosters, newcomer sees the fork modal, picks ONE,
// and seats only into that half (never auto-bridges).
//
// How the same-key tear is built (re-encoded 2026-07-28 for fork law 95ca143
// — blind doors merge; a TRUE fork needs third-party evidence per half):
//   1. L1 founds; L2 joins and wires — the Left half is a real 2-member pair.
//   2. R1+R2 join through the door with the whole Left half ICE-blocked from
//      birth (and reverse-blocked): one genesis, but the cross pairs starve,
//      D5 confirms, and the room tears into two wired 2-member islands.
//   3. Each half's greeters answer HOME with an evidenced 2-member roster and
//      half-local faces — the law's real pick-one door.
//
// Self-contained: own relay + site for THIS checkout. Safe from a worktree.
// Run: node test/drills/e2e-r5-fork-pick.js
// Prefer nvidia-laptop (browser). Needs node 22 + MEET_CHROME.
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');


const RELAY_PORT = parseInt(process.env.R5FORK_RELAY_PORT || '8841', 10);
const SITE_PORT = parseInt(process.env.R5FORK_SITE_PORT || '8843', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) failures++;
};
const pfx = (id) => String(id || '').slice(0, 12);

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), RELAY_DEV: '1',
      TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d',
    path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });

  // C=2 keeps the greeter pool in Section 1 with a tiny room (K-sweep idiom).
  const setup = (name, iceBlock) => ({
    content: 'window.GIFOS_SCALE={C:2};'
      + (iceBlock ? 'window.__gifosBlockIce=' + JSON.stringify(iceBlock) + ';' : '')
      + "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','" + name + "');"
      + "localStorage.setItem('gifos_meet_bar','0')}catch(e){}",
  });

  const newUser = async (name, iceBlock) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name, iceBlock));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('  [' + name + '] ' + m.text()); });
    return { name, ctx, page, id: null };
  };

  const dump = async (u) => u.page.evaluate(() => {
    try {
      const V = window.__gifosVideo, d = V.debugDump(), s = V.meshState();
      return {
        peer: d && d.me && d.me.peer, coord: d && d.me && d.me.coord,
        state: s && s.state, occ: s && s.occ,
        forkPaused: V.forkPaused ? V.forkPaused() : false,
        roster: (d && d.roster || []).map((r) => ({ peer: r.peer, name: r.name, conn: r.conn })),
      };
    } catch (e) { return null; }
  }).catch(() => null);

  const waitSeat = async (u, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const d = await dump(u);
      if (d && d.coord && d.state === 3) { u.id = d.peer; return d; }
      await sleep(800);
    }
    return await dump(u);
  };

  // ── Phase 1: one room, TWO WIRED HALVES, same genesis ─────────────────────
  // RE-ENCODED 2026-07-28 per the fork law 95ca143 ("same-key split needs
  // POSITIVE disjointness evidence"): the old forgery — forceSeat two lone
  // greeters into self-only rosters — produces exactly the BLIND DOORS the
  // false-fork fix now merges on purpose (mesh-fork.js FALSE-FORK 1), and
  // their surviving DataChannel re-merged occ anyway. The law's TRUE FORK
  // needs each half to carry THIRD-PARTY roster evidence with no shared
  // faces (TRUE FORK 2) — so the drill now builds the real thing: a 4-member
  // room torn into two wired pairs that can never cross-connect. Each half's
  // greeters answer HOME with an evidenced 2-member roster; the halves'
  // faces are disjoint once the cross pair-objects drop. That is the door a
  // newcomer must be ASKED about.
  const room = 'r5f' + Math.random().toString(36).slice(2, 10);
  const link = BASE + '/meet.html#v=' + room + '&relay=' + encodeURIComponent(RELAY) + '&DEBUG=on';
  console.log('room: ' + link);

  const left = await newUser('LeftIsle');           // L1
  await left.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const leftDump = await waitSeat(left, 45000);
  check('L1 founded and seated (Section-1 greeter)', !!(leftDump && leftDump.coord && leftDump.state === 3), leftDump && leftDump.coord);
  left.id = leftDump && leftDump.peer;

  const left2 = await newUser('LeftMate');          // L2 — wires with L1 freely
  await left2.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const left2Dump = await waitSeat(left2, 45000);
  check('L2 seated and wired into the Left half', !!(left2Dump && left2Dump.coord && left2Dump.state === 3), left2Dump && left2Dump.coord);
  left2.id = left2Dump && left2Dump.peer;

  // The Right half joins with the ENTIRE Left half ICE-blocked from birth —
  // control plane still seats via the greeter door (reunion's pattern), but
  // no cross transport ever forms, so the cross pair-objects starve, D5
  // confirms, and the room TEARS along the block: two wired islands, one
  // genesis key. Reverse blocks land on the Left pages as each R id is known.
  const lIds = [left.id, left2.id].filter(Boolean);
  const right = await newUser('RightIsle', lIds);   // R1
  await right.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const rightDump = await waitSeat(right, 60000);
  check('R1 seated in the same room (through the door)', !!(rightDump && rightDump.coord && rightDump.state === 3), rightDump && rightDump.coord);
  right.id = rightDump && rightDump.peer;
  for (const u of [left, left2]) if (right.id) await u.page.evaluate((pid) => { window.__gifosBlockIce = [pid]; }, right.id).catch(() => {});

  const right2 = await newUser('RightMate', lIds);  // R2 — wires with R1 only
  await right2.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const right2Dump = await waitSeat(right2, 60000);
  check('R2 seated and wired into the Right half', !!(right2Dump && right2Dump.coord && right2Dump.state === 3), right2Dump && right2Dump.coord);
  right2.id = right2Dump && right2Dump.peer;
  for (const u of [left, left2]) await u.page.evaluate((ids) => { window.__gifosBlockIce = ids; }, [right.id, right2.id].filter(Boolean)).catch(() => {});

  // ── Phase 2: let the tear SETTLE — each half converges to its own pair ────
  // The cross pairs starve (no transport, D5/starve-edge confirms), occ frees,
  // and each page's world shrinks to its half: participants()==2 everywhere.
  // Faces separate as the dropped cross pair-objects purge statusOf. Budget
  // honors the codified law: reap-bound settling gets the long window.
  const halves = [left, left2, right, right2];
  let settled = false;
  const tSettle = Date.now();
  while (Date.now() - tSettle < 200000 && !settled) {
    const ps = await Promise.all(halves.map((u) => u.page.evaluate(() => {
      try { return { p: window.__gifosVideo.participants(), s: window.__gifosVideo.meshState().state }; } catch (e) { return null; }
    }).catch(() => null)));
    settled = ps.every((x) => x && x.p === 2 && x.s === 3);
    if (!settled) await sleep(2000);
  }
  const halfSnap = await Promise.all(halves.map(async (u) => ({ name: u.name, d: await dump(u) })));
  check('the tear settled: each half is a 2-member island (participants==2 all four)',
    settled, halfSnap.map((h) => h.name + ':' + (h.d && h.d.occ) + '/' + (h.d && h.d.state)));

  // Stage L1 so pick-one faces distinguish the halves (Stage > Stadium): the
  // Left option shows the Stage face, the Right option its Stadium names.
  const staged = await left.page.evaluate(() => {
    try { return window.__gifosVideo.stageForTest(true); } catch (e) { return false; }
  }).catch(() => false);
  check('L1 stepped onto Stage (face label for Meeting A)', !!staged, staged);
  await sleep(1500);

  // ── Phase 3: newcomer at the door sees TWO clusters → pick-one modal ─────
  const neo = await newUser('Newcomer');
  await neo.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await neo.page.waitForFunction(() => !!window.__gifosVideo, null, { timeout: 30000 }).catch(() => {});

  // Modal: #fork-modal becomes display:flex with ≥2 choice buttons.
  let modalOk = false;
  const tModal = Date.now();
  while (Date.now() - tModal < 35000) {
    modalOk = await neo.page.evaluate(() => {
      const m = document.getElementById('fork-modal');
      if (!m) return false;
      const shown = m.style.display === 'flex' || getComputedStyle(m).display === 'flex';
      const n = document.querySelectorAll('#fork-choices button').length;
      return shown && n >= 2;
    }).catch(() => false);
    if (modalOk) break;
    // Also accept forkPaused without UI race (mesh brain settled).
    const paused = await neo.page.evaluate(() => {
      try { return window.__gifosVideo.forkPaused && window.__gifosVideo.forkPaused(); } catch (e) { return false; }
    }).catch(() => false);
    if (paused) {
      modalOk = await neo.page.evaluate(() => {
        const m = document.getElementById('fork-modal');
        return !!(m && (m.style.display === 'flex' || getComputedStyle(m).display === 'flex'));
      }).catch(() => false);
      if (modalOk) break;
    }
    await sleep(500);
  }
  const modalSnap = await neo.page.evaluate(() => {
    const m = document.getElementById('fork-modal');
    const btns = Array.from(document.querySelectorAll('#fork-choices button')).map((b) => b.innerText.slice(0, 120));
    let paused = false;
    try { paused = !!(window.__gifosVideo && window.__gifosVideo.forkPaused && window.__gifosVideo.forkPaused()); } catch (e) {}
    return {
      display: m ? m.style.display : null,
      n: btns.length, btns, paused,
      state: (() => { try { return window.__gifosVideo.meshState(); } catch (e) { return null; } })(),
    };
  }).catch(() => null);
  check('R5 fork modal shows ≥2 meetings (same-key dual greeter door)',
    modalOk && modalSnap && modalSnap.n >= 2, modalSnap);

  // Prefer the non-Stage option (RightIsle island — Left alone is on Stage).
  // Falls back to second button. Assert we land with that greeter, not both.
  let picked = null;
  if (modalSnap && modalSnap.n >= 2) {
    // Labels are "· Stage ·" / "· Stadium ·" — do not match Stage inside Stadium.
    const stadiumI = modalSnap.btns.findIndex((t) => /·\s*Stadium\s*·/i.test(t));
    const stageI = modalSnap.btns.findIndex((t) => /·\s*Stage\s*·/i.test(t));
    check('one option is Stage (LeftIsle), one is Stadium (RightIsle)',
      stageI >= 0 && stadiumI >= 0 && stageI !== stadiumI,
      { stageI, stadiumI, btns: modalSnap.btns });
    const clickI = stadiumI >= 0 ? stadiumI : 1;
    await neo.page.locator('#fork-choices button').nth(clickI).click();
    picked = { clickI, wantRight: true, stageI, stadiumI };
    console.log('  picked choice #' + clickI + (stadiumI >= 0 ? ' (Stadium = RightIsle half)' : ' (fallback second)'));
  } else {
    check('had fork options to click', false, modalSnap);
  }

  // Modal dismisses; join proceeds into ONE half only.
  await sleep(800);
  const afterPick = await neo.page.evaluate(() => {
    const m = document.getElementById('fork-modal');
    let paused = false;
    try { paused = !!(window.__gifosVideo && window.__gifosVideo.forkPaused && window.__gifosVideo.forkPaused()); } catch (e) {}
    return { display: m ? m.style.display : null, paused };
  }).catch(() => null);
  check('fork modal dismissed after pick', !!(afterPick && afterPick.display === 'none'), afterPick);
  check('not forkPaused after pick', !!(afterPick && afterPick.paused === false), afterPick);

  // Seat into the chosen half.
  const neoSeated = await waitSeat(neo, 45000);
  check('Newcomer seats after pick-one', !!(neoSeated && neoSeated.coord && neoSeated.state === 3), neoSeated && neoSeated.coord);

  // Chosen half only: after Stadium pick the newcomer knows RightIsle and not
  // LeftIsle (control-plane roster / names). Bridging both would mean auto-merge.
  // Link-completeness (conn) is latejoin/swarm's bar — R5 is the door pick.
  const neoFinal = await dump(neo);
  const names = (neoFinal && neoFinal.roster || []).map((r) => r.name).filter(Boolean);
  const peers = (neoFinal && neoFinal.roster || []).map((r) => pfx(r.peer));
  const halfIds = (us) => us.map((u) => pfx(u.id)).filter(Boolean);
  const knowsHalf = (halfNames, ids) => halfNames.some((n) => names.includes(n))
    || peers.some((p) => ids.some((hp) => p === hp || p.startsWith(hp.slice(0, 8))));
  const knowsLeft = knowsHalf(['LeftIsle', 'LeftMate'], halfIds([left, left2]));
  const knowsRight = knowsHalf(['RightIsle', 'RightMate'], halfIds([right, right2]));
  const connLeft = !!(neoFinal && neoFinal.roster || []).find((r) => r.conn && /^Left/.test(r.name || ''));
  const connRight = !!(neoFinal && neoFinal.roster || []).find((r) => r.conn && /^Right/.test(r.name || ''));
  check('Newcomer does not bridge both halves',
    !(knowsLeft && knowsRight) && !(connLeft && connRight),
    { knowsLeft, knowsRight, connLeft, connRight, roster: neoFinal && neoFinal.roster, picked });

  if (picked && picked.wantRight && neoSeated) {
    check('Stadium pick seats into RightIsle half (knows Right, not Left)',
      knowsRight && !knowsLeft, { knowsLeft, knowsRight, coord: neoSeated.coord });
  }

  await browser.close();
  cleanup();
  console.log(failures
    ? '\n' + failures + ' FAILED — R5 same-key dual greeter pick-one'
    : '\nALL PASS — R5 browser: same-key dual greeter door → modal → pick-one → no bridge');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e)); process.exit(2); });
