// e2e-status-map.js — A STATUS MUST NOT OUTLIVE ITS PEER (scale audit V2).
//
// `statusOf` (run.html) is every participant's mute/camera/blur/consent state,
// keyed by peer id and fed by the room-wide gossip flood. The scale audit
// (docs/scale-audit-2026-08-04.md, V2) names it as growing O(N) with room size
// with no cap — and names itself as having ZERO test coverage anywhere in the
// repo. This suite closes that gap.
//
// It does NOT assert a cap. There is no cap today; a test for one would be red
// on arrival, and a known-red is not a guard. What it asserts is the property a
// cap would break FIRST, and the one the map's two delete sites already claim:
// an entry lives exactly as long as its peer does. Both deletes — dropPeer's
// ("a stale status must not haunt the room's consensus") and confirmGone's —
// were unproven until now. If eviction ever arrives, this suite is what tells
// you whether it evicted the dead or the living.
//
// Measured with four browsers in one room over the local relay:
//   1. statusOf holds an entry per LIVE peer, and never the observer's own id
//      (my own state lives in `myStatus`, deliberately outside the map)
//   2. a departing peer's entry is GONE within a bounded time — the no-leak
//      property, i.e. the map tracks the room, it does not accumulate it
//   3. it does not resurrect: across many gossip beats after the departure
//      settles, the dead id never comes back
//   4. NEGATIVE CONTROL, so none of the above can pass vacuously: delete a LIVE
//      peer's entry by hand (`_corruptStatus`) and watch it (a) read as absent —
//      proving the accessor can see an absence, so assertion 2 is able to fail —
//      and (b) come BACK on the next pulse — proving statuses are still flowing,
//      so the dead peer's absence is death and not a silent room.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => String(id).slice(0, 8);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const room = 'stat' + Math.floor(Math.random() * 1e9).toString(36);
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { errs.push(name + ': ' + e.message); console.log('  [' + name + '] pageerror: ' + e.message); });
    await pg.goto(BASE + '/run.html#v=' + room, { waitUntil: 'domcontentloaded', timeout: 120000 });
    return { name, ctx, pg, id: null };
  };
  const nOf = (u) => u.pg.evaluate(() => { try { return window.__gifosVideo.participants(); } catch (e) { return 0; } });
  const idOf = (u) => u.pg.evaluate(() => { try { return window.__gifosVideo.debugDump().me.peer; } catch (e) { return null; } });
  const statusIds = (u) => u.pg.evaluate(() => { try { return window.__gifosVideo.statusIds(); } catch (e) { return null; } });
  const seated = (u) => u.pg.evaluate(() => { try { return !!window.__gifosVideo.meshCoord(); } catch (e) { return false; } }).catch(() => false);

  // ---- setup: four in one room, all seated, all counting each other ---------
  const users = [];
  for (const n of ['Hal', 'Ivy', 'Jon', 'Kim']) { users.push(await mk(n)); await sleep(1500); }
  {
    const t0 = Date.now();
    let counts = [], sits = [];
    while (Date.now() - t0 < 180000) {
      counts = await Promise.all(users.map(nOf));
      sits = await Promise.all(users.map(seated));
      if (counts.every((c) => c === 4) && sits.every(Boolean)) break;
      await sleep(1500);
    }
    if (!(counts.every((c) => c === 4) && sits.every(Boolean))) { console.log('JOIN STALL: counts=' + JSON.stringify(counts) + ' seated=' + JSON.stringify(sits)); process.exit(1); }
    for (const u of users) u.id = await idOf(u);
  }
  const [HAL, IVY, JON, KIM] = users;
  // Every status is a gossip beat away; give the room one settling window so a
  // slow last arrival is not read as a missing entry.
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      const ids = await statusIds(HAL);
      if (ids && users.filter((u) => u !== HAL).every((u) => ids.indexOf(u.id) >= 0)) break;
      await sleep(1000);
    }
  }

  // ---- 1. an entry per LIVE peer, and never my own -------------------------
  {
    const ids = await statusIds(HAL);
    const others = users.filter((u) => u !== HAL).map((u) => u.id);
    check('the observer holds a statusOf entry for every other live peer',
      !!ids && others.every((id) => ids.indexOf(id) >= 0), { held: (ids || []).map(short), want: others.map(short) });
    // Pinning the REAL behavior, not the assumed one: my own state lives in
    // `myStatus` and every reader branches `isMe ? myStatus : statusOf.get(id)`,
    // so the map is strictly about OTHER people. A self-entry appearing here
    // would mean the pulse loop started feeding itself.
    check('the observer\'s OWN id is not in the map (myStatus holds it, not statusOf)',
      !!ids && ids.indexOf(HAL.id) < 0, { me: short(HAL.id), held: (ids || []).map(short) });
    check('the map holds no id beyond the room — no strangers, no ghosts',
      !!ids && ids.every((id) => others.indexOf(id) >= 0), { held: (ids || []).map(short) });
  }

  // ---- 2. NEGATIVE CONTROL: absence is observable, and pulses are flowing ---
  // Delete a LIVE peer's entry under the observer's feet. If statusIds() cannot
  // report the hole, assertion 3 below could never fail and would be worthless.
  // Then it must REFILL: Jon is alive and pulsing, so the room is not quiet —
  // which is what makes Kim's later disappearance mean death and nothing else.
  {
    await HAL.pg.evaluate((id) => window.__gifosVideo._corruptStatus(id), JON.id);
    const holed = await statusIds(HAL);
    check('NEG CONTROL: a hand-deleted LIVE entry reads as ABSENT (so assertion 3 can fail)',
      !!holed && holed.indexOf(JON.id) < 0, { held: (holed || []).map(short) });
    const t0 = Date.now();
    let backMs = -1;
    while (Date.now() - t0 < 30000) {
      const ids = await statusIds(HAL);
      if (ids && ids.indexOf(JON.id) >= 0) { backMs = Date.now() - t0; break; }
      await sleep(400);
    }
    check('NEG CONTROL: a LIVE peer\'s entry comes back on the next pulse in '
      + (backMs < 0 ? 'NEVER (>30s)' : (backMs / 1000).toFixed(1) + 's') + ' — statuses are flowing',
      backMs >= 0, { backMs });
  }

  // ---- 3. THE NO-LEAK PROPERTY: a departure takes its status with it -------
  // Kim's whole context closes — the ordinary tab-close path (pagehide fires the
  // LEAVE; the transports die behind it). Either delete site may be the one that
  // runs; the guard is that ONE of them does.
  // The bound is DELIBERATELY loose. This asserts NO LEAK, not latency, and the
  // path is not fixed: measured 6.6s and 22.1s on back-to-back runs of the same
  // tree (a ctx.close does not reliably win the LEAVE race, so the D5 confirm is
  // often the site that fires). Tightening this toward the fast measure buys no
  // coverage and buys a flake. Latency of departure has its own guard —
  // test/drills/e2e-vanish-browser.js.
  {
    const t0 = Date.now();
    await KIM.ctx.close().catch(() => {});
    let goneMs = -1;
    while (Date.now() - t0 < 60000) {
      const ids = await statusIds(HAL);
      if (ids && ids.indexOf(KIM.id) < 0) { goneMs = Date.now() - t0; break; }
      await sleep(400);
    }
    check('a DEPARTED peer\'s statusOf entry is gone in '
      + (goneMs < 0 ? 'NEVER (>60s)' : (goneMs / 1000).toFixed(1) + 's') + ' (bound 60s)',
      goneMs >= 0, { goneMs });
    console.log('  MEASURE depart->status-evicted = ' + (goneMs < 0 ? 'never' : (goneMs / 1000).toFixed(1) + 's'));
    // …and it evicted the DEAD one only. A map swept empty would pass the line
    // above for the wrong reason.
    const ids = await statusIds(HAL);
    check('the survivors\' entries are untouched — the dead was evicted, not the map',
      !!ids && ids.indexOf(IVY.id) >= 0 && ids.indexOf(JON.id) >= 0, { held: (ids || []).map(short) });
  }

  // ---- 4. it does not resurrect -------------------------------------------
  // Statuses are first-party only (takeStatus keys on the SENDER, never on a
  // third-hand relay of someone else's), so no survivor may re-introduce Kim.
  // Watch well past several gossip beats.
  {
    let sawBack = 0, polls = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const ids = await statusIds(HAL); polls++;
      if (ids && ids.indexOf(KIM.id) >= 0) sawBack++;
      await sleep(1000);
    }
    check('the dead peer never returns to the map across 20s of gossip beats',
      sawBack === 0, { polls, sawBack });
    // The other observers agree — this is a property of the map everywhere, not
    // of one lucky page.
    //
    // BOUNDED WAIT, not an instant read. Eviction is per-observer: each page
    // ages out its own statusOf entry on its own beat, so Hal having evicted
    // Kim says nothing about when Ivy and Jon will. This leg used to read once,
    // immediately, and red whenever a survivor's eviction had not landed yet
    // (gate 2026-08-06: FLAKY, held 3 ids, green on retry). The ASSERTION is
    // unchanged — Kim absent AND Hal present — it is only given the same 60s
    // bound Hal's own eviction leg is held to. A survivor that never agrees
    // still fails, which is the property worth guarding.
    for (const u of [IVY, JON]) {
      const t1 = Date.now();
      let ids = null, agreeMs = -1;
      while (Date.now() - t1 < 60000) {
        ids = await statusIds(u);
        if (ids && ids.indexOf(KIM.id) < 0 && ids.indexOf(HAL.id) >= 0) { agreeMs = Date.now() - t1; break; }
        await sleep(400);
      }
      check(u.name + ' agrees: the departed id is absent, the survivors present'
        + ' (in ' + (agreeMs < 0 ? 'NEVER (>60s)' : (agreeMs / 1000).toFixed(1) + 's') + ', bound 60s)',
        agreeMs >= 0, { held: (ids || []).map(short) });
    }
  }

  check('zero page errors across the whole scenario', errs.length === 0, errs);
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
