// e2e-r5-fork-pick.js — R5 / E5§2 door pick-one in a real browser.
//
// Complements test/mesh/r5-fork-pick.js, which drives the WHOLE mesh pipeline
// (GREETERS → multi-greeter probe → clusterForkSamples → onFork options) as
// units. This drill is the browser rung on top of that pipeline:
//
//   A. NEGATIVE (the 2026-07-26 monitor incident's regression guard): a
//      newcomer at a HEALTHY door must NEVER see the pick-one modal — the
//      false-positive fork parked a headless client at the modal forever.
//   B. UI RUNG: the modal itself — options render with tier + faces, a click
//      picks one, the modal dismisses. Driven via the committed DEBUG lever
//      (window.__gifosShowForkPick), the same function onFork calls.
//
// RE-SCOPED 2026-07-28: this drill used to FORGE a same-key tear (two
// forceSeat'd lone greeters with self-only rosters) and assert the modal
// fires. The fork law changed under it (95ca143): a blind/self-only door and
// a mutually-remembering tear now MERGE on purpose — they are one room. Every
// cheap tear a drill can manufacture (forceSeat, ICE-split halves, even
// whole-room instance churn) leaves SHARED evidence (live ids, or the same
// corpse ids gossip keeps fresh in both halves' rosters), so the law merges
// it — correctly. The genuine TRUE-FORK shape needs the incident's roster
// ASYMMETRY (each half remembering only the other's dead ids, faces
// disjoint), which no honest cheap forgery reaches; manufacturing it
// end-to-end is a recorded follow-up (task list), and the clustering law
// itself is unit-guarded in test/unit/mesh-fork.js + test/mesh/r5-fork-pick.
//
// Self-contained: own relay + site for THIS checkout. Safe from a worktree.
// Run: node test/drills/e2e-r5-fork-pick.js
// Prefer the browser-capable gate box. Needs node 22 + MEET_CHROME.
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

  const setup = (name) => ({
    content: 'window.GIFOS_SCALE={C:2};'
      + "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','" + name + "');"
      + "localStorage.setItem('gifos_meet_bar','0')}catch(e){}",
  });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('  [' + name + '] ' + m.text()); });
    return { name, ctx, page };
  };
  const meshDump = (u) => u.page.evaluate(() => {
    try { const s = window.__gifosVideo.meshState(); const c = window.__gifosVideo.meshCoord(); return { state: s && s.state, occ: s && s.occ, coord: c ? (c.pc + '/' + c.r + '.' + c.i) : null, paused: !!(window.__gifosVideo.forkPaused && window.__gifosVideo.forkPaused()) }; } catch (e) { return null; }
  }).catch(() => null);
  const waitSeat = async (u, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const d = await meshDump(u);
      if (d && d.coord && d.state === 3) return d;
      await sleep(800);
    }
    return await meshDump(u);
  };
  const modalState = (u) => u.page.evaluate(() => {
    const m = document.getElementById('fork-modal');
    return {
      shown: !!(m && (m.style.display === 'flex' || getComputedStyle(m).display === 'flex')),
      n: document.querySelectorAll('#fork-choices button').length,
      btns: Array.from(document.querySelectorAll('#fork-choices button')).map((b) => b.innerText.replace(/\n/g, ' ').slice(0, 90)),
    };
  }).catch(() => null);

  const room = 'r5f' + Math.random().toString(36).slice(2, 10);
  const link = BASE + '/run.html#v=' + room + '&relay=' + encodeURIComponent(RELAY) + '&DEBUG=on';
  console.log('room: ' + link);

  // ── A. a HEALTHY door never shows the pick-one modal ──────────────────────
  const ada = await newUser('Ada');
  await ada.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const adaD = await waitSeat(ada, 45000);
  check('Ada founded and seated', !!(adaD && adaD.coord && adaD.state === 3), adaD && adaD.coord);

  const ben = await newUser('Ben');
  await ben.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const benD = await waitSeat(ben, 45000);
  check('Ben seated through the same door', !!(benD && benD.coord && benD.state === 3), benD && benD.coord);

  const neo = await newUser('Newcomer');
  await neo.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Watch the WHOLE join window: the modal must never flash, and the join must land.
  let modalFlashed = false;
  const t0 = Date.now();
  let neoD = null;
  while (Date.now() - t0 < 45000) {
    const m = await modalState(neo);
    if (m && m.shown) { modalFlashed = true; break; }
    neoD = await meshDump(neo);
    if (neoD && neoD.coord && neoD.state === 3) break;
    await sleep(600);
  }
  check('healthy door: newcomer seats without EVER seeing the pick-one modal (monitor-incident guard)',
    !modalFlashed && !!(neoD && neoD.coord && neoD.state === 3),
    { modalFlashed, coord: neoD && neoD.coord, paused: neoD && neoD.paused });
  check('healthy door: not forkPaused', !!(neoD && neoD.paused === false), neoD && neoD.paused);

  // ── B. the modal UI rung: options render, a pick dismisses ────────────────
  // Injected via the committed DEBUG lever — the SAME function onFork calls
  // (mesh-wire onFork → showForkPick). Faces/tier rendering + pick behavior.
  const inject = await neo.page.evaluate(() => {
    try {
      window.__gifosShowForkPick([
        { id: 'optA', gkey: 'gkA', tier: 'stage', n: 2, stage: ['Alice'], stadium: [], faces: ['Alice'] },
        { id: 'optB', gkey: 'gkB', tier: 'stadium', n: 3, stage: [], stadium: ['Bob', 'Carol'], faces: ['Bob', 'Carol'] },
      ]);
      return true;
    } catch (e) { return String(e).slice(0, 80); }
  }).catch((e) => String(e).slice(0, 80));
  check('fork modal lever injects', inject === true, inject);
  await sleep(300);
  const mB = await modalState(neo);
  check('modal shows TWO meetings', !!(mB && mB.shown && mB.n === 2), mB);
  check('options carry tier + faces (Stage first, Stadium second)',
    !!(mB && /·\s*Stage\s*·/.test(mB.btns[0] || '') && /Alice/.test(mB.btns[0] || '')
        && /·\s*Stadium\s*·/.test(mB.btns[1] || '') && /Bob/.test(mB.btns[1] || '')), mB && mB.btns);
  await neo.page.locator('#fork-choices button').nth(1).click();
  await sleep(400);
  const mAfter = await modalState(neo);
  check('a pick dismisses the modal', !!(mAfter && !mAfter.shown), mAfter);

  await browser.close();
  cleanup();
  console.log(failures
    ? '\n' + failures + ' FAILED — R5 pick-one door (browser rung)'
    : '\nALL PASS — R5 browser rung: healthy door never forks; modal renders and picks clean');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e)); process.exit(2); });
