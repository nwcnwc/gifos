/*
 * pair-probe.js — watch a TWO-PERSON pair form, second by second.
 *
 * Not an assertion test: a diagnostic. It reproduces e2e-sing's exact setup
 * (host opens a room, guest follows the share link) and then samples, once a
 * second for 30s, the four things that distinguish the ways a pair can be
 * half-alive:
 *
 *   live    liveLinks()  — peers whose ICE is connected
 *   roster  who I think is in the room
 *   pairs   pair objects I hold
 *   clk     per-peer clock samples (n) — these REQUIRE an open DataChannel,
 *           because the grid's metronome only pings when
 *           p.dc && p.dc.readyState === 'open'
 *
 * WHY IT EXISTS. e2e-sing flakes ~20-40% on an 8-core box, always at the same
 * line: the first clock-sync round. This probe caught the reason, which is not
 * a race in the clock code:
 *
 *    0s-7s   A[live=1 pairs=1 clk=NONE]   B[live=1 pairs=1 clk=NONE]
 *    8s      A[live=0 ...]                B[live=0 ...]
 *   18s      A[live=0 roster=0 pairs=0]   B[live=1 roster=1 pairs=1]
 *
 * Eight seconds of a "connected" pair with ZERO clock samples means ICE came up
 * and the DataChannel never did — the half-open pair run.html already names
 * ("its ondatachannel never fired"). Then the link collapses, and the two sides
 * end up disagreeing about whether the other is even present.
 *
 * Note the trap this exposes for anyone writing a meeting test: liveLinks()
 * counts p.connected (ICE), NOT an open DataChannel. Gating on it and then
 * asserting anything that needs the DC — clocks, chat, app state — can wait
 * forever on a half-open pair.
 *
 * Run (needs site:8099 + relay:8790, e.g. test/servers/dev.sh):
 *   node test/tools/pair-probe.js
 *   BASE=... RELAY=... SECONDS=60 node test/tools/pair-probe.js
 */
const { chromium, CHROME } = require('../lib/pw');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const SECONDS = parseInt(process.env.SECONDS || '30', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const snap = () => {
  const v = window.__gifosVideo;
  const g = v.grid();
  const clocks = Object.entries(g.clocks || {}).map(([pid, c]) => pid.slice(0, 8) + ':n=' + c.n);
  const sv = window.__starve || {};
  return {
    live: v.liveLinks(),
    dl: (v.liveDataLinks ? v.liveDataLinks() : -1),
    roster: (v.rosterIdsNow ? v.rosterIdsNow().length : -1),
    pairs: (v.pairs ? v.pairs().length : -1),
    clocks: clocks.length ? clocks.join(',') : 'NONE',
    kicked: sv.kicked || 0,
    dcwatch: (sv.why && sv.why.dcwatch) || 0,
  };
};
const fmt = (s) => 'live=' + s.live + ' dl=' + s.dl + ' roster=' + s.roster + ' pairs=' + s.pairs + ' clk=' + s.clocks + ' kick=' + s.kicked + ' dcw=' + s.dcwatch;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    return ctx;
  };

  const aCtx = await newUser('Ada');
  const a = await aCtx.newPage();
  await a.goto(BASE + '/run.html');
  await a.locator('#lob-open').click();
  await a.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  const link = await a.evaluate(() => document.getElementById('share-url').value);

  const bCtx = await newUser('Ben');
  const b = await bCtx.newPage();
  await b.goto(link);
  await a.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await b.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  console.log('both ICE-connected at t=0 — sampling every 1s for ' + SECONDS + 's\n');

  let first = -1;
  for (let t = 0; t <= SECONDS; t++) {
    const A = await a.evaluate(snap).catch((e) => ({ err: e.message, live: '?', roster: '?', pairs: '?', clocks: 'ERR' }));
    const B = await b.evaluate(snap).catch((e) => ({ err: e.message, live: '?', roster: '?', pairs: '?', clocks: 'ERR' }));
    console.log(String(t).padStart(3) + 's  A[' + fmt(A) + ']   B[' + fmt(B) + ']');
    if (first < 0 && A.clocks !== 'NONE' && !/n=0/.test(A.clocks)) first = t;
    await sleep(1000);
  }
  console.log('\nfirst clock sample on A: ' + (first < 0
    ? 'NEVER — ICE was up but the DataChannel never carried a round trip'
    : first + 's'));
  await browser.close();
})();
