// e2e-r5-fork-pick.js — R5 / E5§2 door pick-one in a real browser.
//
// Complements test/mesh/r5-fork-pick.js (pure mesh.js clustering + faces).
// This drill is the missing browser rung: same genesis key, two greeter
// halves with DISJOINT S1 rosters, newcomer sees the fork modal, picks ONE,
// and seats only into that half (never auto-bridges).
//
// How the same-key tear is forced (no new product surface):
//   1. LeftIsle founds; RightIsle joins the same room (one genesis).
//   2. Symmetric __gifosBlockIce so they cannot re-learn each other over DC.
//   3. forceSeat each to a DIFFERENT S1 cell with empty occSeed — doMove
//      clears occ, so s1Roster() is self-only. Both stay Section-1 greeters
//      under the same genKey (the real torn-home door case).
//
// Self-contained: own relay + site for THIS checkout. Safe from a worktree.
// Run: node test/drills/e2e-r5-fork-pick.js
// Prefer nvidia-laptop (browser). Needs node 22 + MEET_CHROME.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || (require('fs').existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome'
      : '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
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
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
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

  // ── Phase 1: one room, two greeters, same genesis ─────────────────────────
  // Pre-baked #v=…&DEBUG=on like adversary-room / mirror-drill — lob-open
  // rewrites the hash and would drop DEBUG=on, which gates forceSeat.
  const room = 'r5f' + Math.random().toString(36).slice(2, 10);
  const link = BASE + '/meet.html#v=' + room + '&relay=' + encodeURIComponent(RELAY) + '&DEBUG=on';
  console.log('room: ' + link);

  const left = await newUser('LeftIsle');
  await left.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const leftDump = await waitSeat(left, 45000);
  check('LeftIsle founded and seated (Section-1 greeter)', !!(leftDump && leftDump.coord && leftDump.state === 3), leftDump && leftDump.coord);
  left.id = leftDump && leftDump.peer;

  // RightIsle joins the same room (learns the same genKey via the dance).
  // ICE to Left is blocked from the start so media never wires — control plane
  // still seats via the greeter door (same as e2e-peer-relay-reunion).
  const right = await newUser('RightIsle', left.id ? [left.id] : ['*']);
  await right.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const rightDump = await waitSeat(right, 45000);
  check('RightIsle seated in the same room', !!(rightDump && rightDump.coord && rightDump.state === 3), rightDump && rightDump.coord);
  right.id = rightDump && rightDump.peer;

  // Symmetric ICE blackhole so the tear cannot re-merge over DataChannels.
  if (right.id) await left.page.evaluate((pid) => { window.__gifosBlockIce = [pid]; }, right.id);
  if (left.id) await right.page.evaluate((pid) => { window.__gifosBlockIce = [pid]; }, left.id);

  // ── Phase 2: force same-key dual greeter halves (disjoint S1 rosters) ─────
  // forceSeat to a *different* S1 cell with empty occSeed: doMove refuses a
  // same-coord teleport, and empty nbrs leave s1Roster() = {self} only.
  // Both remain pc=0 greeters; genKey is unchanged (not re-minted).
  const tearLeft = await left.page.evaluate(() => {
    const V = window.__gifosVideo, c = V.meshCoord();
    if (!c) return { err: 'no coord' };
    // Prefer a different row so we always move (0/0.0 → 0/1.0).
    const r = c.r === 0 ? 1 : 0;
    return V.forceSeat(0, r, 0, {});
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  const tearRight = await right.page.evaluate(() => {
    const V = window.__gifosVideo, c = V.meshCoord();
    if (!c) return { err: 'no coord' };
    const r = c.r === 0 ? 1 : 0;
    const i = 1; // avoid colliding with Left's 0/r.0
    return V.forceSeat(0, r, i, {});
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  check('LeftIsle forceSeat tear (self-only occ)', !!(tearLeft && tearLeft.seated), tearLeft);
  check('RightIsle forceSeat tear (self-only occ)', !!(tearRight && tearRight.seated), tearRight);
  console.log('  tear left→' + (tearLeft && tearLeft.seated) + ' right→' + (tearRight && tearRight.seated));

  // Brief settle so greeter re-knocks land after the move.
  await sleep(2500);
  const leftAfter = await dump(left);
  const rightAfter = await dump(right);
  check('both greeters still seated after tear',
    !!(leftAfter && leftAfter.coord && rightAfter && rightAfter.coord),
    { left: leftAfter && leftAfter.coord, right: rightAfter && rightAfter.coord });
  // occ should be small (self-only after empty seed; may hold 1).
  check('LeftIsle occ is island-small after tear', !!(leftAfter && leftAfter.occ <= 2), leftAfter && leftAfter.occ);
  check('RightIsle occ is island-small after tear', !!(rightAfter && rightAfter.occ <= 2), rightAfter && rightAfter.occ);

  // Stage LeftIsle so pick-one faces distinguish the halves (Stage > Stadium).
  // Without this, homeFaces() stadium still lists both names from the pre-tear
  // UI roster, so both buttons show the same peer prefixes.
  const staged = await left.page.evaluate(() => {
    try { return window.__gifosVideo.stageForTest(true); } catch (e) { return false; }
  }).catch(() => false);
  check('LeftIsle stepped onto Stage (face label for Meeting A)', !!staged, staged);
  await sleep(500);

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
  const leftP = pfx(left.id), rightP = pfx(right.id);
  const knowsLeft = names.includes('LeftIsle')
    || peers.some((p) => leftP && (p === leftP || p.startsWith(leftP.slice(0, 8))));
  const knowsRight = names.includes('RightIsle')
    || peers.some((p) => rightP && (p === rightP || p.startsWith(rightP.slice(0, 8))));
  const connLeft = !!(neoFinal && neoFinal.roster || []).find((r) => r.conn && r.name === 'LeftIsle');
  const connRight = !!(neoFinal && neoFinal.roster || []).find((r) => r.conn && r.name === 'RightIsle');
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
