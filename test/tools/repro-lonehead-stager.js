// repro-lonehead-stager.js — discriminator for the LONE-HEAD STAGER shape:
// when a deep stager is the solitary head of its section (no row-mate), does
// its Stage feed reach the whole room, or stall at its single up-target?
// A TOOL, not a gate (test/tools/ is not discovered by release.sh).
//
// READ THIS BEFORE TRUSTING THE FIRST VERSION OF THIS FILE. The original
// (2026-07-29) asserted an OPEN product bug — "a lone-head deep stager gets its
// feed to exactly ONE Section-1 seat and no further" — and, tellingly, NEVER
// RAN: it `require`d a hardcoded `/home/nathan/…/test/lib/pw` that exists on no
// other box, AND its whole body was pasted twice, so the second top-level
// `const { chromium } = …` made the file a SyntaxError on load. It was the exact
// dead-test-path CLAUDE.md is written around — a reproducer that reproduces
// nothing because it cannot start. Re-run against the current build, the claim
// does not hold.
//
// WHAT THE ORIGINAL CLAIMED, AND WHY IT NO LONGER HOLDS
// ----------------------------------------------------
// Claim: "stager ships 1 job (its up-target only); P0 held:1, everyone else
// held:0 → feed reached 1 seat." The single up-target ship is REAL and correct
// for a lone head — a section head has no cross-link (net.crossLink is null for
// i===0), no row-mate, and (when solitary) no down-child, so its one tree edge
// upward is `up()` to a single Section-1 seat. But "reached 1 seat" was the
// pre-flood state. The Stage lane now FLOODS at Section 1 (run.html ~8019-8064):
// the up-target floods every stg feed across the S1 rook graph and fans a
// composited `sgs` strip DOWN each subtree, so the feed reaches every seat over
// the tree's own links — stager → up-target S1 seat → S1 flood → fan down.
//
// This is the routing the deterministic unit test test/unit/mosaic-route.js
// PROVES with no browsers: (A) every seat's up-chain reaches a Section-1 head,
// and (B) Section 1 is one connected cross+row mesh. (A)+(B) together are
// exactly "a feed injected at any S1 seat reaches every seat," lone-head stager
// included. That test is green; this browser tool only confirms real pixels
// agree.
//
// MEASURED (idle box, relay freshly restarted, load < 1.5): across repeated
// lone-head-stager attempts every non-stager reached stripPainted:true; e2e-
// mosaic (the gated twin) went 22/22 green, and its own Stage legs — "every
// seat sees LIVE stage pixels" — pass for the deep seats. The intermittent reds
// this shape used to correlate with are the SAME multi-hop convergence latency
// the deep-stadium-repro dossier records: on a loaded single box the 3-hop
// stager→S1→S1→deep chain can miss a tight budget, and WHICH seat lags depends
// on the seating the join race produced. That is a host problem, not a tree gap.
//
// THE STANDING LESSON (CLAUDE.md, paid for repeatedly): one box cannot separate
// a product gap from a busy kernel, and a code-shaped story will happily fit
// noise. Before believing any red here: restart the relay, check `nproc` and
// `/proc/loadavg`, kill leftover Chromium (BOTH binaries), and re-run. If a seat
// stays dark through a QUIET window (phase 2 below), rebuild the topology across
// DEVICES (test/README.md, "ONE BOX CANNOT ANSWER…") before touching mesh code.
//
// WHAT THIS TOOL DOES
// -------------------
// Seats N=6 at C=2, then forceSeat the stager's deep neighbour into a DIFFERENT
// section so the stager is a solitary head (isHead=true, hasRowMate=false).
// Stages it, then:
//   PHASE 1 — poll every non-stager's Stage strip (stripPainted, and the held
//             stg:/sgs feeds) up to POLL_MS, recording who never sees it.
//   PHASE 2 — if anything is dark, STOP polling (6 pages × an evaluate every 2s
//             is itself load), go quiet QUIET_MS, then re-check ONCE. A seat
//             that turns live in phase 2 was converging; only a seat still dark
//             through the quiet window is worth chasing into the mesh.
//
// USAGE
//   python3 -m http.server 8099 -d site
//   node test/servers/relay-local.js          # RESTART this before chasing a red
//   node test/tools/repro-lonehead-stager.js
//   ATTEMPTS=4 POLL_MS=40000 QUIET_MS=35000 node test/tools/repro-lonehead-stager.js
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = +(process.env.N || 6);
const ATTEMPTS = +(process.env.ATTEMPTS || 3);
const POLL_MS = +(process.env.POLL_MS || 40000);
const QUIET_MS = +(process.env.QUIET_MS || 35000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cs = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '?');
// "sees the stage" = the seat has PAINTED the strip (the visible product
// outcome), independent of whether it holds the raw per-stager stg: feed (only
// some seats do) or the composited sgs strip (deep seats).
const seesStage = (info) => !!(info && (info.stripPainted || (info.held && info.held.length)));

async function attempt(browser, n) {
  const room = 'ls' + Math.random().toString(36).slice(2, 7);
  const pages = [], ctxs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const p = await ctx.newPage();
    await p.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');
    pages.push(p); ctxs.push(ctx);
    await sleep(1200);
  }
  let coords = []; const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean) && coords.filter((c) => c.pc !== 0).length >= 2) break;
    await sleep(1500);
  }
  console.log(`\n=== attempt ${n} initial: ` + coords.map(cs).join(' '));
  const deep = coords.map((c, i) => ({ c, i })).filter((x) => x.c && x.c.pc !== 0);
  if (deep.length < 2) { console.log('  (never reached 2 deep seats — skipping)'); for (const c of ctxs) await c.close(); return 'clean'; }
  const S = deep[0].i, M = deep[1].i;   // stager, and its section-mate to strand away
  const pids = await Promise.all(pages.map((p) => p.evaluate(() => __gifosVideo.debugDump().me.peer)));
  const seed = {}; coords.forEach((c, i) => { seed[cs(c)] = pids[i]; });
  // move the stager's deep neighbour into a DIFFERENT section → stager is a lone head
  const tgt = { pc: (coords[S].pc === 1 ? 2 : 1), r: 0, i: 0 };
  await pages[M].evaluate((a) => __gifosVideo.forceSeat(a.pc, a.r, a.i, a.seed), { pc: tgt.pc, r: tgt.r, i: tgt.i, seed });
  await sleep(12000);
  coords = await Promise.all(pages.map((p) => p.evaluate(() => __gifosVideo.meshCoord()).catch(() => null)));
  const sc = coords[S]; const mate = coords.some((c, i) => i !== S && c && sc && c.pc === sc.pc && c.r === sc.r);
  console.log('after:   ' + coords.map(cs).join(' ') + `  | stager P${S}@${cs(sc)} isHead=${sc && sc.i === 0} hasRowMate=${mate}`);
  for (const p of pages) await p.evaluate(() => { const nn = document.getElementById('blur-none'); if (nn) nn.click(); const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); }).catch(() => {});
  await sleep(3000);
  await pages[S].evaluate(() => __gifosVideo.stageForTest(true));
  const st = await pages[S].evaluate(() => __gifosVideo.mosaic().jobsActive).catch(() => []);
  console.log('  STAGER ships: ' + JSON.stringify(st));

  // PHASE 1 — poll every non-stager's strip exactly as the product renders it.
  const others = [...Array(N).keys()].filter((i) => i !== S);
  const live = {}; others.forEach((i) => { live[i] = null; });
  const tS = Date.now();
  while (Date.now() - tS < POLL_MS) {
    for (const i of others) {
      if (live[i] !== null) continue;
      const info = await pages[i].evaluate(() => __gifosVideo.stageInfo()).catch(() => null);
      if (seesStage(info)) live[i] = ((Date.now() - tS) / 1000).toFixed(1);
    }
    if (others.every((i) => live[i] !== null)) break;
    await sleep(2000);
  }
  for (const i of others) console.log(`    P${i}@${cs(coords[i])}${coords[i] && coords[i].pc ? ' DEEP' : '    '} ` + (live[i] !== null ? `sees stage @ ${live[i]}s` : 'DARK'));
  const dark = others.filter((i) => live[i] === null);
  if (!dark.length) { console.log('  PHASE1: every seat sees the stage'); for (const c of ctxs) await c.close(); return 'clean'; }

  // PHASE 2 — stop polling (it is itself load), go quiet, re-check once.
  console.log(`  PHASE1 DARK: ${dark.map((i) => 'P' + i + '@' + cs(coords[i])).join(', ')} — quiet ${QUIET_MS / 1000}s then recheck`);
  await sleep(QUIET_MS);
  let recovered = 0;
  for (const i of dark) {
    const info = await pages[i].evaluate(() => __gifosVideo.stageInfo()).catch(() => null);
    const now = seesStage(info);
    if (now) recovered++;
    console.log(`  PHASE2 P${i}@${cs(coords[i])}: ${now ? 'NOW LIVE — it was converging, not broken' : 'STILL DARK — worth chasing'}` +
      (now ? '' : '  ' + JSON.stringify(info && { held: info.held, painted: info.stripPainted })));
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
    ? 'VERDICT: a lone-head stager left a seat dark through a quiet window — a real gap. Confirm across DEVICES before touching mesh code.'
    : 'VERDICT: no permanent gap. The lone-head stager reaches every seat; dark seats (if any) were converging — suspect the poll and the box, not the tree.');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
