// deep-stadium-repro.js — the reproducer for e2e-mosaic's flaky Stadium/Stage
// legs. A TOOL, not a gate (test/tools/ is explicitly not discovered by
// release.sh): it prints evidence, it does not assert a product law.
//
// WHY THIS EXISTS
// ---------------
// e2e-mosaic fails intermittently on three legs — "DEEP seat renders live
// Stadium pixels", "P<i> sees LIVE stage pixels", "stage RECOVERS within 30s".
// Every one of them is a liveness poll with a generous budget, so the natural
// reading is "six browsers on one box, just slow" — the reading CLAUDE.md warns
// is unfalsifiable on a single machine. It is worth being precise instead,
// because a real gap and a busy kernel look identical from the suite's output.
//
// WHAT WAS RULED OUT (2026-08-04, 4-core box, load < 2.0 before every run)
// -----------------------------------------------------------------------
//  * NOT the stage-quality work (STAGE_CELL/stageCeilingKbps). The same legs
//    fail on the commit BEFORE it, and across four runs the changed source went
//    green twice and red twice with a DIFFERENT leg each time — including once
//    on a Stadium leg whose packer that work never touched.
//  * NOT mesh settle time. A sibling probe sampled the coord vector every 1.5s
//    for 150s: the mesh is quiet 0.3s after join and never moves again. The
//    suite's readiness gate (every seat has a coord, one is deep) fires at the
//    same instant, so its topology snapshot is NOT stale.
//  * NOT one single budget. Failures appear at 60s (Stadium) and at 120s
//    (stage strip) alike, and the dark seats show claims:[] / jobs:[] — a state
//    that is not converging slowly, it is not converging.
//
// WHAT IT ACTUALLY IS
// -------------------
// Roughly 2 joins in 5 leave at least one DEEP seat that never renders a
// Stadium inside the suite's budget, and WHICH seat depends on the seating the
// join race produces. Two distinct dark signatures have been captured:
//
//   (A) a deep HEAD with claims:[] jobs:[] sd.faces:0 — nothing ever arrives.
//       Seen when both deep seats landed in section 1 ROW 1, leaving that
//       section's row 0 empty.
//   (B) a deep NON-HEAD with claims:['sdm'] — it DID claim its row head's
//       finished view, and still rendered nothing, while the head itself was
//       live.
//
// (A) points at the sdn producer, run.html:7842-7863:
//       childPid = occPid(T.down({pc,r,i})) || (i !== c.i ? heirOf(...) : null)
//       if (!childPid) continue;          // ships NOTHING, silently
//     For a head's OWN column (i === c.i) the heir fallback is deliberately not
//     used (the phantom-producer lesson in that comment), so a parent that
//     cannot resolve its deep child in occ never ships 'sdn' at all — and occ
//     gossip is documented S1-only right above it.
// (B) is a different failure and is NOT explained by that path.
//
// Both are control-plane behaviour, so the fix is sim-first: test/sim/mesh.cpp
// is source of truth for the mesh laws (CLAUDE.md), and any seating/heir change
// belongs there before it belongs here.
//
// USAGE
//   python3 -m http.server 8099 -d site
//   node test/servers/relay-local.js
//   node test/tools/deep-stadium-repro.js            # 4 attempts, stops at the first dark one
//   ATTEMPTS=10 BUDGET_MS=90000 node test/tools/deep-stadium-repro.js
//
// Reproduces e2e-mosaic's join shape exactly: N=6 at C=2 (so 6 people is a
// genuinely deep tree), cameras on, no blur.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = +(process.env.N || 6);
const ATTEMPTS = +(process.env.ATTEMPTS || 4);
const BUDGET_MS = +(process.env.BUDGET_MS || 60000); // e2e-mosaic's liveAt() budget
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cstr = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '-');
const parentPath = (pc) => Math.floor((pc - 1) / 6);
const lastDigit = (pc) => (pc - 1) % 6;

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
  // Flag the seating that produced signature (A): a section holding occupants
  // in some row while its row 0 is empty.
  const bySection = new Map();
  coords.forEach((c) => { if (c && c.pc !== 0) { if (!bySection.has(c.pc)) bySection.set(c.pc, []); bySection.get(c.pc).push(c); } });
  for (const [pc, cs] of bySection) {
    if (!cs.some((c) => c.r === 0)) console.log(`    NOTE section ${pc} has NO row-0 occupant (rows: ${[...new Set(cs.map((c) => c.r))].join(',')})`);
  }

  const live = new Array(N).fill(null);
  const tS = Date.now();
  while (Date.now() - tS < BUDGET_MS) {
    for (let i = 0; i < N; i++) {
      if (live[i] !== null) continue;
      const m = await pages[i].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
      if (m && m.tile && m.tile.live) live[i] = Date.now() - tS;
    }
    if (live.every((x) => x !== null)) break;
    await sleep(2000);
  }
  const dark = [...Array(N).keys()].filter((i) => live[i] === null);
  for (let i = 0; i < N; i++) {
    if (live[i] !== null) console.log(`    P${i}@${cstr(coords[i])}${coords[i] && coords[i].pc ? ' DEEP' : '     '}  live @ ${(live[i] / 1000).toFixed(1)}s`);
  }
  if (!dark.length) { console.log('    all seats live — not the failing config'); for (const c of ctxs) await c.close(); return false; }

  console.log('    DARK: ' + dark.map((i) => 'P' + i + '@' + cstr(coords[i])).join(', '));
  for (const i of dark) {
    const c = coords[i];
    const d = await pages[i].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
    console.log(`    P${i}@${cstr(c)} SELF  ` + JSON.stringify(d && { head: d.head, up: d.up && d.up.pid, claims: d.claims, jobs: d.jobs, sd: d.sd && { faces: d.sd.faces, w: d.sd.w } }));
    if (c.i !== 0) { console.log('      signature (B): a NON-HEAD — its Stadium is the sdm its row head ships. Check whether the head is live and whether sdm is claimed.'); continue; }
    const pcc = { pc: parentPath(c.pc), r: c.r, i: lastDigit(c.pc) };
    const pIdx = coords.findIndex((x) => x && x.pc === pcc.pc && x.r === pcc.r && x.i === pcc.i);
    if (pIdx < 0) { console.log(`      PARENT ${cstr(pcc)} is occupied by NO page — this seat has no producer above it at all`); continue; }
    const pd = await pages[pIdx].evaluate(() => { const m = __gifosVideo.mosaic(); return { head: m.head, jobs: m.jobs, claims: m.claims, sd: m.sd && { faces: m.sd.faces } }; }).catch((e) => ({ err: String(e).slice(0, 120) }));
    console.log(`      PARENT P${pIdx}@${cstr(pcc)}  ` + JSON.stringify(pd));
    console.log('      >>> did the parent ship an sdn job? ' +
      (pd.jobs ? (pd.jobs.some((j) => String(j).indexOf('sdn') === 0) ? 'YES — look downstream of the ship' : 'NO — signature (A), the producer skipped this child') : '?'));
  }
  for (const c of ctxs) await c.close();
  return true;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  let hit = false;
  for (let n = 1; n <= ATTEMPTS && !hit; n++) hit = await attempt(browser, n);
  console.log(hit ? '\nREPRODUCED — a deep seat never rendered a Stadium inside the budget.'
    : `\nnot reproduced in ${ATTEMPTS} attempts (observed rate is roughly 2 in 5; raise ATTEMPTS).`);
  await browser.close();
  process.exit(0);
})();
