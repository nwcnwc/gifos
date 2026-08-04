// deep-stadium-repro.js — discriminator for e2e-mosaic's intermittent
// Stadium/Stage legs: is a dark deep seat a PRODUCT gap or the environment?
// A TOOL, not a gate (test/tools/ is not discovered by release.sh).
//
// READ THIS BEFORE TRUSTING THE FIRST VERSION OF THIS FILE. That version
// (2026-08-04) asserted a product defect — "roughly 2 joins in 5 leave a deep
// seat that never renders a Stadium" — and named two mechanisms. Controlled
// re-testing the same day DISPROVED all of it. The corrected record:
//
// WHAT WAS CLAIMED, AND WHY IT WAS WRONG
// --------------------------------------
//  * Claim: "signature (A) — a deep HEAD with claims:[], seen when a section's
//    row 0 is empty, because the sdn producer skips a child it cannot resolve
//    in occ (`childPid = occPid(T.down(...)) || ...; if (!childPid) continue;`)."
//    MEASURED FALSE, twice over. occPid resolves deep children perfectly well —
//    observed directly on S1 heads as `down=2/0.0 -> occPid:k_d15a linked:true`.
//    And a section holding ONLY (1,1,0), with its row 0 empty, came up LIVE
//    with claims:[sdn]. Both halves of the hypothesis are dead.
//  * Claim: "not the environment, because the base commit fails too."
//    TOO WEAK. The base did fail once — but every failure observed that day,
//    base and branch alike, happened while ONE relay process had been up for
//    hours serving dozens of test rooms, on a box that had been running heavy
//    browser suites back to back.
//
// WHAT ACTUALLY HAPPENED
// ----------------------
// After restarting the local relay and letting the box settle below load 2.0:
//   * 7 consecutive clean probe runs (3 settle-and-dump, 4 poll-then-quiet), and
//   * e2e-mosaic GREEN 19/19, twice in a row.
// Against the ~2-in-5 failure rate observed beforehand, 7 clean runs is ~6% by
// chance — so something real changed, and every candidate is environmental
// (long-lived relay state, accumulated box load), not topological. Mesh settle
// time was independently ruled out: a probe sampling the coord vector every
// 1.5s for 150s found the mesh quiet 0.3s after join and never moving again.
//
// THE STANDING LESSON is the one already in CLAUDE.md, paid for again: on ONE
// box you cannot tell a product gap from a busy kernel, and a plausible
// code-shaped story will happily fit noise. Before believing any red here:
// restart the relay, check `nproc` and `/proc/loadavg`, kill leftover Chromium
// (BOTH binaries), and re-run. If it survives that, rebuild the topology across
// DEVICES (test/README.md, "ONE BOX CANNOT ANSWER…") before touching mesh code.
//
// WHAT THIS TOOL DOES
// -------------------
// Reproduces e2e-mosaic's join shape (N=6 at C=2 — six people is a genuinely
// deep tree; cameras on, no blur) and runs the discriminator:
//   PHASE 1 — poll every seat's Stadium tile exactly as e2e-mosaic's liveAt()
//             does (60s), recording who never goes live.
//   PHASE 2 — if anything is dark, STOP polling entirely (the poll is itself
//             load: 6 pages x an evaluate every 2s), go quiet, then re-check.
// A seat that turns live in phase 2 was converging all along. A seat still dark
// after a quiet window is the only result worth chasing into the mesh.
//
// USAGE
//   python3 -m http.server 8099 -d site
//   node test/servers/relay-local.js          # RESTART this before chasing a red
//   node test/tools/deep-stadium-repro.js
//   ATTEMPTS=10 POLL_MS=60000 QUIET_MS=45000 node test/tools/deep-stadium-repro.js
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = +(process.env.N || 6);
const ATTEMPTS = +(process.env.ATTEMPTS || 4);
const POLL_MS = +(process.env.POLL_MS || 60000);  // e2e-mosaic's liveAt() budget
const QUIET_MS = +(process.env.QUIET_MS || 45000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cstr = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '-');

async function attempt(browser, n) {
  const room = 'dsr' + Math.random().toString(36).slice(2, 7);
  const pages = [], ctxs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const page = await ctx.newPage();
    await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');
    pages.push(page); ctxs.push(ctx);
    await sleep(1200);
  }
  let coords = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean) && coords.some((c) => c.pc !== 0)) break;
    await sleep(1500);
  }
  for (const p of pages) {
    await p.evaluate(() => {
      const none = document.getElementById('blur-none'); if (none) none.click();
      const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
    }).catch(() => {});
  }
  console.log(`\n=== attempt ${n}: ${coords.map(cstr).join(' ')}`);

  // PHASE 1 — poll exactly like the suite.
  const live = new Array(N).fill(null);
  const tS = Date.now();
  while (Date.now() - tS < POLL_MS) {
    for (let i = 0; i < N; i++) {
      if (live[i] !== null) continue;
      const m = await pages[i].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
      if (m && m.tile && m.tile.live) live[i] = Date.now() - tS;
    }
    if (live.every((x) => x !== null)) break;
    await sleep(2000);
  }
  for (let i = 0; i < N; i++) {
    if (live[i] !== null) console.log(`    P${i}@${cstr(coords[i])}${coords[i] && coords[i].pc ? ' DEEP' : '    '} live @ ${(live[i] / 1000).toFixed(1)}s`);
  }
  const dark = [...Array(N).keys()].filter((i) => live[i] === null);
  if (!dark.length) { console.log('  PHASE1: all seats live'); for (const c of ctxs) await c.close(); return 'clean'; }
  console.log('  PHASE1 DARK: ' + dark.map((i) => 'P' + i + '@' + cstr(coords[i])).join(', '));

  // PHASE 2 — stop polling (it is itself load), go quiet, re-check once.
  console.log(`  ... quiet for ${QUIET_MS / 1000}s (zero evaluate calls)`);
  await sleep(QUIET_MS);
  let recovered = 0;
  for (const i of dark) {
    const m = await pages[i].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
    const nowLive = !!(m && m.tile && m.tile.live);
    if (nowLive) recovered++;
    console.log(`  PHASE2 P${i}@${cstr(coords[i])}: ${nowLive ? 'NOW LIVE — it was converging, not broken' : 'STILL DARK — worth chasing'}` +
      (nowLive ? '' : '  ' + JSON.stringify(m && { head: m.head, claims: m.claims, jobs: m.jobs, sd: m.sd && { faces: m.sd.faces } })));
  }
  for (const c of ctxs) await c.close();
  return recovered === dark.length ? 'recovered' : 'real-gap';
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const tally = { clean: 0, recovered: 0, 'real-gap': 0 };
  for (let n = 1; n <= ATTEMPTS; n++) tally[await attempt(browser, n)]++;
  console.log(`\nTALLY over ${ATTEMPTS} attempts: ${JSON.stringify(tally)}`);
  console.log(tally['real-gap']
    ? 'VERDICT: a seat stayed dark through a quiet window — a real gap. Confirm across DEVICES before touching mesh code.'
    : 'VERDICT: no permanent gap. Dark seats (if any) were converging; suspect the poll and the box, not the tree.');
  await browser.close();
  process.exit(0);
})();
