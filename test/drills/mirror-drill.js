// mirror-drill.js — the sdn DORMANT-MIRROR drill (docs/media-plane.md,
// "The sdn dormant mirror — the missing standby"; Phase 2).
//
// Self-contained: spawns its own relay + static server, launches 8 browsers
// at GIFOS_SCALE C=2 and forceSeats them into the exact topology the mirror
// needs (a full 2×2 Section 1 plus a FULL child section 2 off S1 column 1):
//
//     A@0/0.0 (producer head)   B@0/0.1 (the direct sdn relay — KILL TARGET)
//     C@0/1.0                   D@0/1.1
//     E@2/0.0 (child branch head — the OBSERVER)   F@2/0.1
//     G@2/1.0                   H@2/1.1
//
//   direct:  A --sdx--> B --sdn--> E
//   mirror:  A -> C -> D -> G -> H -> F -> E   (sdnm:2_0_0, born parked;
//            transit row t=1 — fully link-disjoint, avoids B entirely)
//
// The drill proves: (1) the chain BUILDS dormant end-to-end (E holds 'sdn'
// primary via B + a PARKED standby via F; relays hold 'sdnmr:*' claims and
// parked 'sdnm:*' jobs); (2) killing B demand-wakes the chain end-to-end and
// E's sdn frames resume inside MOS_GRACE (5s) with no claim teardown; (3)
// after healing refills 0/0.1 the direct path returns and E fails back
// make-before-break, the mirror re-parking. Run: node test/drills/mirror-drill.js
//
// KNOWN BLOCKER (revised 2026-07-28 EVE — the childPid starvation is FIXED
// and the mirror BUILDS): Nathan's option (a) landed as 0eb0d74+77f3ff5 —
// childPid = occPid(down) || heirOf(cell) from Seat.childOf (PONG m.child,
// H-CHAIN), heir restricted to row-mates' columns (own-column heir minted a
// phantom producer from stale row-gossip, mirror-heir-1). Since then the
// whole BUILD phase is consistently green (mirror-heir-2/3): E holds sdn
// PRIMARY (real bytes) + a parked sdnm:2_0_0 STANDBY at zero, demand idle,
// chain head parked at A. WHAT REMAINS RED is the multi-hop DEMAND-WAKE
// reliability: the wake command fires every time (E flips the sdnm stream
// =w — asserted green), but the woken chain delivers frames only sometimes
// (heir-2 bridged in 921ms, well under the 2s target; heir-3 delivered
// nothing in 20s — a hop's parked pipe can be a zombie, the same class the
// PIPE WATCHDOG bench exists for). This is now the redundancy-wake problem
// (task #3, /tmp/redun-diag.js bench + REDUN_STRICT in known-unfixed.sh),
// not a mirror-specific one. Batch-1's other findings remain live hunts:
// stale occ post-teleport misdirecting jobs + stale seat-addressed claims,
// tracked with the wedge family (§HEARD landed for the fork half).
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');


const RELAY_PORT = parseInt(process.env.MIRROR_RELAY_PORT || '8875', 10);
const SITE_PORT = parseInt(process.env.MIRROR_SITE_PORT || '8877', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const GRACE_MS = 5000;
const SEATS = ['0/0.0', '0/0.1', '0/1.0', '0/1.1', '2/0.0', '2/0.1', '2/1.0', '2/1.1'];
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const KILL = 1;      // B — the direct relay
const OBS = 4;       // E — the child branch head
const MIRROR_END = 5; // F — the mirror's last hop into E

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); if (!c) failures++; };
const loadNow = () => { try { return parseFloat(require('fs').readFileSync('/proc/loadavg', 'utf8').split(' ')[0]); } catch (e) { return -1; } };

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  process.on('exit', () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} });
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });
  const room = 'mir' + Math.random().toString(36).slice(2, 7);
  const mkPage = async (name) => {
    for (let a = 0; ; a++) {
      const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      await ctx.addInitScript({ content: 'window.GIFOS_SCALE={C:2};'
        + `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','${name}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}` });
      const page = await ctx.newPage();
      try { await page.goto(BASE + '/meet.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 }); return page; }
      catch (e) { try { await ctx.close(); } catch (e2) {} if (a >= 1) throw e; }
    }
  };
  const pages = [];
  for (let k = 0; k < SEATS.length; k++) { pages.push({ name: NAMES[k], page: await mkPage(NAMES[k]) }); console.log('  launched ' + NAMES[k] + ' (loadavg ' + loadNow() + ')'); await sleep(1200); }

  const coordOf = (e) => e.page ? e.page.evaluate(() => { const c = window.__gifosVideo && __gifosVideo.meshCoord(); return c ? c.pc + '/' + c.r + '.' + c.i : null; }).catch(() => null) : null;
  const idOf = (e) => e.page ? e.page.evaluate(() => { try { return __gifosVideo.debugDump().me.peer; } catch (e2) { return null; } }).catch(() => null) : null;
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 120000) {
    coords = await Promise.all(pages.map(coordOf));
    if (coords.every(Boolean)) break;
    await sleep(2000);
  }
  check('all 8 joined + seated somewhere', coords.every(Boolean), coords);

  // ---- forceSeat everyone into the exact drill topology --------------------
  // CONFLICT-FREE ORDER (2026-07-28): a take() of an OCCUPIED seat is a
  // CONTESTED move under law T — the sitting occupant's claim contradicts the
  // mover, someone gets bounced into a fresh FIND and lands at the lawful
  // empty cell (section 1's head), dissolving the drill shape. The old code
  // teleported in launch order, which routinely dialed seats their current
  // holders had not vacated yet (the natural seats are a permutation of the
  // targets). So: move in PASSES, only ever dialing a currently-EMPTY seat;
  // park one member on a scratch seat to break permutation cycles; confirm
  // each move (coord landed, transit over) before the next.
  const ids = await Promise.all(pages.map(idOf));
  const seed = {}; for (let k = 0; k < SEATS.length; k++) if (ids[k]) seed[SEATS[k]] = ids[k];
  const doSeat = async (k, seatStr) => {
    const m = /^(\d+)\/(\d+)\.(\d+)$/.exec(seatStr);
    const res = await pages[k].page.evaluate((a) => __gifosVideo.forceSeat(a[0], a[1], a[2], a[3]), [m[1], m[2], m[3], seed]).catch((e) => String(e).slice(0, 60));
    console.log('  ' + NAMES[k] + ' → ' + seatStr + ' ' + JSON.stringify(res));
    const tm = Date.now(); // confirm the coord landed (the dual-hold vacate then follows within a beat)
    while (Date.now() - tm < 8000) {
      const c = await pages[k].page.evaluate(() => { const cc = __gifosVideo.meshCoord(); return cc ? cc.pc + '/' + cc.r + '.' + cc.i : null; }).catch(() => null);
      if (c === seatStr) break;
      await sleep(400);
    }
    await sleep(400);
  };
  const teleportAll = async () => {
    const cur = await Promise.all(pages.map(coordOf));
    const SCRATCHES = ['1/1.1', '1/1.0', '1/0.1']; // outside the target set
    for (let pass = 0; pass < 24; pass++) {
      const occupied = new Set(cur.filter(Boolean));
      const pending = [];
      for (let k = 0; k < SEATS.length; k++) if (cur[k] !== SEATS[k]) pending.push(k);
      if (!pending.length) break;
      let moved = false;
      for (const k of pending) {
        if (occupied.has(SEATS[k])) continue;
        occupied.delete(cur[k]); occupied.add(SEATS[k]);
        await doSeat(k, SEATS[k]); cur[k] = SEATS[k]; moved = true;
      }
      if (!moved) { // pure permutation cycle — park the first pending member aside
        const k = pending[0];
        const scratch = SCRATCHES.find((s) => !occupied.has(s));
        if (!scratch) break;
        occupied.delete(cur[k]); occupied.add(scratch);
        await doSeat(k, scratch); cur[k] = scratch;
      }
    }
  };
  await teleportAll();
  // The on-seat pages still get the seed: teach each occ the WHOLE drill
  // topology at once — post-teleport gossip alone converges too slowly.
  for (let k = 0; k < SEATS.length; k++) {
    const c = await coordOf(pages[k]);
    if (c === SEATS[k]) await doSeat(k, SEATS[k]);
  }
  await sleep(6000);
  coords = await Promise.all(pages.map(coordOf));
  if (!coords.every((c, k) => c === SEATS[k])) { // one repair pass absorbs a stray bounce
    console.log('  topology drifted (' + coords.map((c, k) => NAMES[k] + '@' + c).join(' ') + ') — repair pass');
    await teleportAll();
    await sleep(6000);
    coords = await Promise.all(pages.map(coordOf));
  }
  check('drill topology in place', coords.every((c, k) => c === SEATS[k]), coords.map((c, k) => NAMES[k] + '@' + c).join(' '));

  // ---- the mirror BUILDS dormant end-to-end --------------------------------
  const mosOf = (e) => e.page ? e.page.evaluate(() => __gifosVideo.mosaic()).catch(() => null) : null;
  // HOLD THE SHAPE WHILE IT BUILDS. The topology check above is a single
  // snapshot, and the forced 8-seat shape DECAYS during the long build wait:
  // measured on a build failure, G and H had drifted out of section 2 into
  // section 1 (F saw "H@1_1_1", H saw "G@1_1_0"), which makes the mirror route
  // impossible — the chain needs a FULL child section. Every downstream leg
  // then fails as collateral, which is what made this drill look like three
  // independent reds instead of one. A drifted seat is a manufacture problem,
  // not the law under test, so repair it the same way the setup does and say
  // so out loud when it happens.
  let built = null, repairs = 0;
  const t1 = Date.now();
  let lastCheck = Date.now();
  while (Date.now() - t1 < 150000) {
    const m = await mosOf(pages[OBS]);
    if (m) {
      const pri = (m.claimVia || []).find((x) => x.rk === 'sdn');
      const std = (m.standbyVia || []).find((x) => x.rk === 'sdn');
      if (pri && std) { built = { pri, std, demand: m.demand }; break; }
    }
    if (Date.now() - lastCheck > 15000) {
      lastCheck = Date.now();
      const now = await Promise.all(pages.map(coordOf));
      if (!now.every((c, k) => c === SEATS[k])) {
        repairs++;
        console.log('  topology drifted during build (' + now.map((c, k) => NAMES[k] + '@' + c).join(' ') + ') — repair ' + repairs);
        await teleportAll();
        await sleep(4000);
      }
    }
    await sleep(2500);
  }
  if (repairs) console.log('   MEASURE topology repairs needed during build: ' + repairs);
  check('E holds sdn PRIMARY + mirror STANDBY', !!built, built && { pri: built.pri.via.slice(0, 8), std: built.std.via.slice(0, 8) });
  if (!built) { // diagnose: where did the chain stick?
    for (let k = 0; k < pages.length; k++) {
      if (!pages[k].page) continue;
      const d = await pages[k].page.evaluate((peerIds) => {
        const m = __gifosVideo.mosaic();
        const conns = peerIds.map((pid) => { const st = __gifosVideo.pcState(pid); return pid.slice(2, 6) + ':' + (st ? st.conn : 'NOPC'); });
        const occView = (__gifosVideo.debugDump().roster || []).map((r) => (r.name || '?') + '@' + (r.coord || '?')).join(' ');
        return { claims: m.claims, annSid: m.annSid, jobs: m.jobsActive, conns, occView };
      }, ids).catch((e) => String(e).slice(0, 80));
      console.log('  [' + NAMES[k] + '] ' + JSON.stringify(d));
    }
  }
  if (built) {
    check('E: sdn primary rides the DIRECT hop (via B)', built.pri.via === ids[KILL], { via: built.pri.via.slice(0, 8), B: String(ids[KILL]).slice(0, 8) });
    check('E: sdn standby rides the MIRROR (via F)', built.std.via === ids[MIRROR_END], { via: built.std.via.slice(0, 8), F: String(ids[MIRROR_END]).slice(0, 8) });
    const mA = await mosOf(pages[0]);
    const mirJob = (mA.jobsActive || []).find((j) => j.indexOf('sdnm:') === 0);
    check('A ships the mirror chain head PARKED (jobsActive "·")', !!mirJob && /·$/.test(mirJob), mirJob);
    const idleStd = (built.demand || []).some((s) => s.indexOf(ids[MIRROR_END]) === 0 && s.indexOf('sdnm:') > 0 && /=i$/.test(s));
    check('E demands the mirror IDLE (parked standby)', idleStd, built.demand);
  }

  // steady bytes: E's std:sdn must be ~0
  if (built) {
    const s1 = await pages[OBS].page.evaluate(async () => ({ t: Date.now(), st: await __gifosVideo.avStats() }));
    await sleep(8000);
    const s2 = await pages[OBS].page.evaluate(async () => ({ t: Date.now(), st: await __gifosVideo.avStats() }));
    const dt = (s2.t - s1.t) / 1000;
    const am = new Map(s1.st.filter((s) => s.dir === 'in').map((s) => [s.pid + '|' + s.trk, s]));
    let inB = 0, stdB = 0;
    for (const s of s2.st) {
      if (s.dir !== 'in') continue;
      const p = am.get(s.pid + '|' + s.trk); if (!p) continue;
      const bps = ((s.bytes || 0) - (p.bytes || 0)) / dt;
      if (s.slot === 'in:sdn') inB += bps; if (s.slot === 'std:sdn') stdB += bps;
    }
    console.log('E steady rates: in:sdn=' + Math.round(inB) + ' B/s  std:sdn=' + Math.round(stdB) + ' B/s');
    check('E: direct sdn pipe flows, mirror standby ~zero', inB > 200 && stdB < Math.max(500, inB * 0.05), { inB: Math.round(inB), stdB: Math.round(stdB) });
  }

  // ---- FAILBACK on a RECOVERABLE outage ------------------------------------
  // YOU CANNOT FAIL BACK TO A CORPSE. The kill below removes the direct hop
  // PERMANENTLY, and measured across five runs the tree never hands 0/0.1 to a
  // third party inside any window a user would sit through: E itself climbs
  // into its dead owner's cell (the heir reattaching the subtree — 3 runs), or
  // the cell simply stays EMPTY (nothing refills it; compaction needs
  // COMPACT_SETTLE = 300 ticks = 150s of quiescence since the churn). So the
  // old failback leg sat for 120s waiting on a scenario the product does not
  // produce, and it could never go green — that was the quarantine's red #2,
  // mis-read at the time as "the heal may not refill 0/0.1".
  //
  // Failback is defined for a RECOVERABLE outage, so manufacture one instead of
  // waiting: sever E<->B, watch the mirror take over, lift the sever, and
  // require the DIRECT hop back as primary with the mirror re-parked as the
  // dormant standby. Same strict claim the drill always meant to make, against
  // a scenario that actually occurs — and it settles in seconds, not minutes.
  if (built) {
    const B8 = String(ids[KILL]).slice(0, 8), F8 = String(ids[MIRROR_END]).slice(0, 8);
    const sdnVia = async () => {
      const m = await mosOf(pages[OBS]);
      if (!m) return null;
      const pri = (m.claimVia || []).find((x) => x.rk === 'sdn');
      const std = (m.standbyVia || []).find((x) => x.rk === 'sdn');
      return { pri: pri ? String(pri.via) : null, std: std ? String(std.via) : null };
    };
    // MEDIA-ONLY OUTAGE, not a sever. severPair CLOSES the pc, which the mesh
    // correctly reads as transport death (D5): the pair evicts and re-admits,
    // E's peer record for B flaps (stable/connected -> NO-PEER-RECORD -> back)
    // and no preferred candidate ever stays live for the MOS_SETTLE window, so
    // failback cannot be observed through it AT ALL. Measured — and the earlier
    // "the stream never arrives" reading of that was wrong, an artifact of
    // passing an 8-char prefix to incomingIds(), which takes a FULL pid.
    // parkJobForTest pins B's sdn job at replaceTrack(null) while leaving the
    // pc, the DataChannel and every m-line up: the bytes stop, the mesh sees
    // nothing, and the media plane alone has to notice and recover.
    const FB_PARK = 15000;
    const parkRes = await pages[KILL].page.evaluate((a) => __gifosVideo.parkJobForTest('sdn', a.to, a.ms), { to: ids[OBS], ms: FB_PARK });
    console.log('  parked B\'s sdn job (media-only outage): ' + JSON.stringify(parkRes));
    check('the media-only outage was actually applied (B\'s sdn job parked)', !!(parkRes && parkRes.ok), parkRes);

    // 1. the mirror takes over while the direct hop carries no media
    let tookOver = null;
    const tF1 = Date.now();
    while (Date.now() - tF1 < 25000) {
      const v = await sdnVia();
      if (v && v.pri && v.pri.indexOf(B8) !== 0) { tookOver = v; break; }
      await sleep(500);
    }
    check('FAILOVER(media-only): sdn primary left the dark direct hop', !!tookOver,
      tookOver ? { pri: tookOver.pri.slice(0, 8), std: tookOver.std && tookOver.std.slice(0, 8) } : 'primary never left B within 25s');

    // 2. the pin expires -> the direct hop carries media again -> it is the
    //    PREFERRED path, so it stages as standby, wakes, and after MOS_SETTLE
    //    (5s) the roles swap make-before-break with the mirror re-parking.
    let backNow = null;
    const tF2 = Date.now();
    let fbLog = 0;
    while (Date.now() - tF2 < 60000) {
      const v = await sdnVia();
      if (v && v.pri && v.pri.indexOf(B8) === 0 && v.std) { backNow = v; break; }
      const el = Math.round((Date.now() - tF2) / 1000);
      if (el - fbLog >= 10) {
        fbLog = el;
        const eSide = await pages[OBS].page.evaluate((a) => {
          const d = __gifosVideo.debugDump() || {}, m = d.mosaic || {};
          const ps = __gifosVideo.pcState ? __gifosVideo.pcState(a.full) : null;
          return { pc: ps ? (ps.sig + '/' + ps.conn) : 'NO-PEER-RECORD',
            inc: __gifosVideo.incomingIds ? (__gifosVideo.incomingIds(a.full) || []).length : -1,
            annSid: (m.annSid || []).filter((x) => x.indexOf(a.pfx.slice(0, 14)) === 0),
            pri: (m.claimVia || []).map((c) => c.rk + '<-' + String(c.via).slice(0, 8)),
            std: (m.standbyVia || []).map((c) => c.rk + '<-' + String(c.via).slice(0, 8)) };
        }, { pfx: B8, full: ids[KILL] }).catch((e) => ({ err: String(e).slice(0, 60) }));
        console.log(`   [unpark +${el}s] E.pc=${eSide.pc} inc=${eSide.inc} annSid=${JSON.stringify(eSide.annSid)} pri=${JSON.stringify(eSide.pri)} std=${JSON.stringify(eSide.std)}`);
      }
      await sleep(1000);
    }
    check('FAILBACK(media-only): sdn primary returned to the DIRECT hop with the mirror re-parked as standby',
      !!backNow, backNow ? { pri: backNow.pri.slice(0, 8), std: backNow.std.slice(0, 8), B: B8, F: F8 }
        : 'no failback within 60s of the media returning — redundancy did not re-arm');

    // SETTLE BEFORE THE KILL. The kill phase below measures a demand-wake from
    // a DORMANT chain, so it needs the steady baseline the build phase had —
    // primary on the direct hop, mirror parked at zero. Firing it while the
    // failback swap is still re-parking catches the chain mid-reconfiguration
    // and times the wake against a moving target (measured: wake 6155ms and a
    // null via when the kill landed straight after the swap, versus a clean
    // pass once settled). Wait for the mirror to be demanded IDLE again.
    const tS = Date.now();
    let reParked = false;
    while (Date.now() - tS < 20000) {
      const m = await mosOf(pages[OBS]);
      const idle = m && (m.demand || []).some((s2) => s2.indexOf('sdnm:') > 0 && /=i$/.test(s2));
      const priB = m && ((m.claimVia || []).find((x) => x.rk === 'sdn') || {}).via;
      if (idle && priB && String(priB).indexOf(B8) === 0) { reParked = true; break; }
      await sleep(1000);
    }
    console.log('   MEASURE chain re-parked and steady before the kill: ' + reParked + ' (+' + Math.round((Date.now() - tS) / 1000) + 's)');
    // ...and wait for the mirror standby to be GENUINELY DORMANT again, by the
    // same measure the build phase used (std:sdn at ~zero bytes), not by a
    // sleep. Role flags flip the instant the swap completes, but the standby's
    // pipe takes longer to settle back to zero, and killing into that window
    // times a demand-wake against a pipe that is still winding down. A fixed
    // pad would just be guessing at that interval; this waits for the state.
    let dormant = false;
    for (let att = 0; att < 6 && !dormant; att++) {
      const q1 = await pages[OBS].page.evaluate(async () => ({ t: Date.now(), st: await __gifosVideo.avStats() })).catch(() => null);
      await sleep(3000);
      const q2 = await pages[OBS].page.evaluate(async () => ({ t: Date.now(), st: await __gifosVideo.avStats() })).catch(() => null);
      if (!q1 || !q2) break;
      const dt = (q2.t - q1.t) / 1000;
      const prev = new Map(q1.st.filter((x) => x.dir === 'in').map((x) => [x.pid + '|' + x.trk, x]));
      let inB = 0, stdB = 0;
      for (const x of q2.st) {
        if (x.dir !== 'in') continue;
        const pv = prev.get(x.pid + '|' + x.trk); if (!pv) continue;
        const bps = ((x.bytes || 0) - (pv.bytes || 0)) / dt;
        if (x.slot === 'in:sdn') inB += bps; if (x.slot === 'std:sdn') stdB += bps;
      }
      dormant = inB > 200 && stdB < Math.max(500, inB * 0.05);
      if (!dormant) console.log(`   (waiting for the mirror to re-park: in=${Math.round(inB)} std=${Math.round(stdB)} B/s)`);
    }
    check('the mirror standby is DORMANT again before the kill (a real baseline, not a pad)', dormant);
  }

  // ---- KILL the parent seat B: multi-hop demand-wake -----------------------
  const framesOf = () => pages[OBS].page.evaluate(() => {
    const f = (__gifosVideo.feedsInfo() || []).find((x) => x.key === 'sdn');
    const m = __gifosVideo.mosaic();
    return { t: Date.now(), frames: f ? f.frames : -1, held: !!f,
      via: ((m.claimVia || []).find((x) => x.rk === 'sdn') || {}).via || null,
      // did E command the MIRROR hot? (=w on an sdnm stream — the actual
      // demand-wake, robust against a failback beating the sampler)
      mirHot: (m.demand || []).some((s) => s.indexOf('sdnm:') > 0 && /=w$/.test(s)) };
  }).catch(() => null);
  console.log('killing B @0/0.1 (the direct sdn relay); producer A lives; loadavg=' + loadNow());
  const tKill = Date.now();
  try { await pages[KILL].page.context().close(); } catch (e) {}
  pages[KILL].page = null;
  const series = [];
  while (Date.now() - tKill < 20000) { const s = await framesOf(); if (s) series.push(s); await sleep(120); }
  let lastAdv = tKill, stallStart = null, gap = null, torn = false;
  for (let k = 1; k < series.length; k++) {
    if (!series[k].held) torn = true;
    if (series[k].frames > series[k - 1].frames) {
      if (stallStart != null) { gap = series[k].t - stallStart; break; }
      lastAdv = series[k].t;
    } else if (stallStart == null && series[k].t - lastAdv > 700) stallStart = lastAdv;
  }
  // WHERE DOES THE WAKE CASCADE STOP? A wake is supposed to propagate
  // end-to-end in ONE pass — each woken hop immediately demands its own
  // upstream awake (docs/media-plane.md). When the mirror never delivers, the
  // question is which hop stayed parked. Dumped AFTER the timed sampler so it
  // cannot distort the gap measurement. '+' = job active (carrying media),
  // '·' = parked at replaceTrack(null).
  {
    const chain = [[0, 'A'], [2, 'C'], [3, 'D'], [6, 'G'], [7, 'H'], [5, 'F'], [4, 'E']];
    const rows = [];
    for (const [idx, nm] of chain) {
      if (!pages[idx].page) { rows.push(nm + '=gone'); continue; }
      const st = await pages[idx].page.evaluate(() => {
        const m = (__gifosVideo.debugDump() || {}).mosaic || {};
        return { act: (m.jobsActive || []).filter((x) => x.indexOf('sdnm:') === 0 || x.indexOf('sdn>') === 0).map((x) => x.slice(0, 14) + x.slice(-1)),
          dem: (m.demand || []).filter((x) => x.indexOf('sdnm:') > 0).map((x) => x.slice(-1)) };
      }).catch(() => null);
      rows.push(nm + '[' + (st ? st.act.join(' ') + ' dem:' + st.dem.join('') : 'err') + ']');
    }
    console.log('  [wake cascade @+20s] ' + rows.join('  '));
  }
  const finVia = series.length ? series[series.length - 1].via : null;
  if (stallStart == null) check('KILL: no visible sdn stall at all (wake under the sampling floor)', true);
  else {
    check('KILL: sdn resumed within MOS_GRACE via the mirror', gap != null && gap <= GRACE_MS, 'measured multi-hop wake gap = ' + (gap == null ? '>20000' : gap) + 'ms (target ≤2000, bound ' + GRACE_MS + ') loadavg=' + loadNow());
    console.log('   sdn freeze gap: ' + (gap == null ? '>20000' : gap) + 'ms');
  }
  check('KILL: sdn claim never torn down', !torn);
  // The BRIDGE assertion (revised after mirror-heir-2): "final via === F"
  // raced the HEAL — failback to the freshly-healed 0/0.1 occupant can beat
  // the 20s sampler, and that is BETTER behavior, not a miss. The honest
  // contracts: (1) E commanded the mirror HOT (=w on an sdnm stream) at some
  // sample — the demand-wake actually fired; (2) the claim ended the window
  // OFF the corpse, riding SOMEONE live (F mid-bridge, or the healed direct).
  const sawMirHot = series.some((s) => s.mirHot) || series.some((s) => s.via === ids[MIRROR_END]);
  check('KILL: the mirror was demand-woken (E commanded an sdnm stream hot)', sawMirHot);
  // TWO LAWFUL OUTCOMES, and the fixed +20s sample races between them. Either
  // E still holds the sdn claim and it rides a LIVE via (the mirror), or E has
  // HEALED INTO the dead cell itself — the heir taking its dead owner's seat to
  // reattach the subtree — in which case it IS the direct hop, holds no sdn
  // claim at all, and via=null is CORRECT rather than a miss. Measured: the
  // cascade dump shows E carrying an outbound 'sdn>' job in exactly those runs.
  // The second branch is not a free pass: it requires E to have actually become
  // a provider AND to have ridden a live non-corpse via during the window.
  const eProvider = await pages[OBS].page.evaluate(() => {
    const m = (__gifosVideo.debugDump() || {}).mosaic || {};
    return (m.jobs || []).some((k) => k.indexOf('sdn>') === 0);
  }).catch(() => false);
  const lastLive = [...series].reverse().find((x) => x.via && x.via !== ids[KILL]);
  check('KILL: sdn rides a LIVE via (off the corpse), or E has become the direct hop itself',
    (!!finVia && finVia !== ids[KILL]) || (eProvider && !!lastLive),
    { via: finVia && finVia.slice(0, 8), eBecameTheDirectHop: eProvider,
      lastLiveVia: lastLive && String(lastLive.via).slice(0, 8) });

  // (The post-kill failback leg that used to live here is gone: it waited on a
  // heal that never comes. Failback is now proven above against a recoverable
  // outage, which is the scenario the law is actually about.)
  await browser.close();
  console.log('loadavg at end: ' + loadNow());
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
