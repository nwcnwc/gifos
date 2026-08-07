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
//   5. THE V3 CONTAINMENT (added 2026-08-06): the map's SIZE cannot move the
//      DIAL SET. The audit's V3 claimed the pc dial set was directory-scoped,
//      so V2's O(N) map fed O(N) connection attempts per node. That is refuted
//      by the code — every dial-out site is gated on `linkTo()`, which reads
//      the seat's bounded neighbourhood and nothing else — and this leg pins
//      the refutation at the real site, in a real browser: stuff `statusOf`
//      with 10,000 synthetic strangers (`_floodStatus`, exactly the shape a
//      room-wide flood produces at scale) and assert that not one becomes a
//      peer, not one is linkable, and the real peers are untouched. The
//      arithmetic half of the same guard, at sizes no browser can reach, is
//      test/unit/dial-set-bound.js.
//   6. THE CORPSE'S LAST BREATH (added 2026-08-07, after this suite caught a
//      real 71.2s leak at the 0.9.5 gate): a status arriving just AFTER its
//      peer's death verdict must not un-bury the entry, and one arriving past
//      the grace must still be taken. Leg 3 catches the same defect end to end,
//      but only when the race falls the losing way — this drives both halves of
//      the rule deterministically, on synthetic ids.
//   7. THE STRUCTURAL FLOOR (added with 6): both delete sites are EVENT-driven,
//      so an entry that never gets a verdict aimed at it — a far peer heard
//      only over the flood has none to miss — was reachable by neither and sat
//      in the map for the life of the page. The sweeper's aged-out sweep must
//      take a stale unreachable entry AND leave a fresh one alone.
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
  //
  // THIS LEG WAS RIGHT AND THE PRODUCT WAS WRONG (0.9.5 gate, 2026-08-07). It
  // red TWICE at NEVER(>60s), on all three observers at once. The cause was a
  // real leak, not this bound: Kim's final status pulse arrived ~650ms AFTER
  // Hal's own 'bye' verdict, and takeStatus — which knew nothing of the
  // tombstone confirmGone had just set — put the entry straight back. From
  // there NEITHER delete site could reach it (no peers record for dropPeer; the
  // tombstone made confirmGone early-return), so it sat in the map until the
  // 60s tombstone GC let the corpse's seat be re-dialled and a second death
  // verdict landed: 71.2s, measured, and unbounded had the healed tree not
  // named that seat again. Fixed in takeStatus (TOMB_GRACE) plus the sweeper's
  // structural floor; leg 6 below drives the same race deterministically.
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

  // ---- 5. V3 CONTAINMENT: statusOf's SIZE cannot move the dial set ---------
  // The map grows with the room (V2, still true and still uncapped — the cap is
  // blocked on run.html migrating off the flood, healing-laws § G / scale-audit
  // sequencing step 4). What must NEVER follow from that growth is a growing
  // set of RTCPeerConnections. Flood the map far past anything four browsers
  // could produce and watch the transport plane refuse to notice.
  {
    const FLOOD = 10000;
    const before = await HAL.pg.evaluate(() => ({ peers: window.__gifosVideo.peerCount(), ids: window.__gifosVideo.statusIds().length }));
    const put = await HAL.pg.evaluate((n) => window.__gifosVideo._floodStatus(n), FLOOD);
    check(`injected ${put} synthetic statuses (statusOf ${before.ids} -> ${before.ids + put})`, put === FLOOD, { put });
    // Give the reconcile sweep several passes — this is where a directory-scoped
    // dialer would have gone to work.
    await sleep(12000);
    const after = await HAL.pg.evaluate(() => {
      const V = window.__gifosVideo;
      const ids = V.statusIds();
      const flooded = ids.filter((i) => i.indexOf('k_flood') === 0);
      return { peers: V.peerCount(), ids: ids.length, flooded: flooded.length,
        linkable: flooded.filter((i) => V.linkToPeer(i)).length };
    });
    check('the flood really is IN the map (so the leg is not vacuous)', after.flooded === FLOOD, { flooded: after.flooded, ids: after.ids });
    check('NOT ONE of the 10,000 is linkable — linkTo reads the seat, never the map', after.linkable === 0, { linkable: after.linkable });
    check('the peer connection count did not move at all', after.peers === before.peers, { before: before.peers, after: after.peers });
    await HAL.pg.evaluate(() => window.__gifosVideo._floodClear());
    await sleep(2000);
    const back = await statusIds(HAL);
    check('after clearing the flood the real room is intact — survivors still held',
      !!back && back.indexOf(IVY.id) >= 0 && back.indexOf(JON.id) >= 0 && back.every((i) => i.indexOf('k_flood') < 0),
      { held: (back || []).map(short) });
  }

  // ---- 6. THE CORPSE'S LAST BREATH, deterministically ----------------------
  // Leg 3 is the end-to-end property and it caught this — but only because the
  // race fell the losing way twice in a row. A guard that fires on a coin flip
  // is a guard that will go quiet. So drive the two halves of the tombstone
  // rule directly, on SYNTHETIC ids that were never peers (the live room is
  // untouched): confirmGone, then a status delivered at a chosen delay.
  //   inside the grace  -> REFUSED, the entry stays buried (the leak)
  //   past the grace    -> TAKEN,  the entry returns (proof of life)
  // The second half is what stops the fix from being a blanket "never accept a
  // status for anyone we ever buried", which would strand a peer that really
  // came back. Mutation-tested: dropping the guard in takeStatus turns the
  // first assertion red immediately, with no dependence on any race.
  {
    const ghostA = 'k_tomb' + Math.floor(Math.random() * 1e12).toString(16);
    const ghostB = 'k_tomb' + Math.floor(Math.random() * 1e12).toString(16);
    const inside = await HAL.pg.evaluate(([id]) => window.__gifosVideo._lastBreath(id, 200), [ghostA]);
    check('a status arriving INSIDE the departure grace is refused — the burial holds'
      + ' (delivered ' + inside.afterMs + 'ms after the verdict, grace ' + inside.grace + 'ms)',
      inside.took === false && inside.held === false, inside);
    const outside = await HAL.pg.evaluate(([id, g]) => window.__gifosVideo._lastBreath(id, g + 900), [ghostB, inside.grace || 1500]);
    check('a status arriving PAST the grace is still taken — a peer that truly returns is not stranded'
      + ' (delivered ' + outside.afterMs + 'ms after the verdict)',
      outside.took === true && outside.held === true, outside);
    // and the room is exactly as it was: no ghost may linger in the real map
    await HAL.pg.evaluate(([a, b]) => { window.__gifosVideo._corruptStatus(a); window.__gifosVideo._corruptStatus(b); }, [ghostA, ghostB]);
    const clean = await statusIds(HAL);
    check('the synthetic ids left no residue — the map still holds exactly the survivors',
      !!clean && clean.indexOf(IVY.id) >= 0 && clean.indexOf(JON.id) >= 0
        && clean.every((i) => i.indexOf('k_tomb') < 0 && i.indexOf('k_flood') < 0),
      { held: (clean || []).map(short) });
  }

  // ---- 7. THE STRUCTURAL FLOOR: an entry no event can reach still goes ------
  // Both delete sites are EVENT-driven — dropPeer needs a peers record,
  // confirmGone needs a verdict aimed at this id. An entry with neither (a far
  // peer heard only over the room-wide flood has no verdict to miss in the
  // first place) was unreachable by both and sat in the map for the life of the
  // page. The sweeper now buries anything with no link, no seat and total
  // silence past the holdover. Both directions, so the sweep is AGEING and not
  // a blanket wipe: the stale ghost must go, the fresh one must stay.
  {
    const stale = 'k_ghost' + Math.floor(Math.random() * 1e12).toString(16);
    const fresh = 'k_ghost' + Math.floor(Math.random() * 1e12).toString(16);
    const put = await HAL.pg.evaluate(([a, b]) => {
      const V = window.__gifosVideo;
      return [V._ghostStatus(a, 70000), V._ghostStatus(b, 0)];
    }, [stale, fresh]);
    check('two ghosts injected — one aged past the holdover, one brand new', put[0] === true && put[1] === true, { put });
    const t0 = Date.now();
    let sweptMs = -1;
    while (Date.now() - t0 < 12000) {
      const ids = await statusIds(HAL);
      if (ids && ids.indexOf(stale) < 0) { sweptMs = Date.now() - t0; break; }
      await sleep(500);
    }
    check('the unreachable STALE entry is swept in '
      + (sweptMs < 0 ? 'NEVER (>12s)' : (sweptMs / 1000).toFixed(1) + 's')
      + ' — no link, no seat, no verdict, and it still goes', sweptMs >= 0, { sweptMs });
    const after = await statusIds(HAL);
    check('the FRESH entry survived the same sweep — the floor ages, it does not wipe',
      !!after && after.indexOf(fresh) >= 0, { held: (after || []).map(short) });
    await HAL.pg.evaluate(([b]) => window.__gifosVideo._corruptStatus(b), [fresh]);
    const end = await statusIds(HAL);
    check('and the real room is still exactly itself after both ghost legs',
      !!end && end.indexOf(IVY.id) >= 0 && end.indexOf(JON.id) >= 0
        && end.every((i) => i.indexOf('k_ghost') < 0 && i.indexOf('k_tomb') < 0 && i.indexOf('k_flood') < 0),
      { held: (end || []).map(short) });
  }

  check('zero page errors across the whole scenario', errs.length === 0, errs);
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
