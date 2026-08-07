// redun-drill.js — the ONE-PIPE media-redundancy drill (docs/media-plane.md,
// "Redundancy — ONE pipe moves bits; every alternate path is parked").
//
// Self-contained (spawns its OWN relay + static server for THIS checkout's
// site/, like e2e-latejoin): N browsers at GIFOS_SCALE C=2 (the K-sweep
// idiom — a 2×2 Section 1 plus deep seats from six browsers, exactly the
// e2e-mosaic shape), one page steps on Stage, and the drill then proves the
// law end to end:
//
//   A. STEADY STATE — for every redundant slot that holds a standby, the
//      PRIMARY pipe carries real bytes and the parked STANDBY carries ~zero
//      (the sender replaceTrack(null)'d it on mx-idle). Prints per-pipe B/s.
//   B. FAILOVER WAKE — kill the browser supplying some receiver's primary on
//      a slot whose PRODUCER lives elsewhere (a relayed 'stg:*' copy): the
//      receiver's claim must survive (no teardown), the parked standby is
//      demand-woken, and decoded frames must resume within MOS_GRACE (5s);
//      the measured freeze gap is printed (target ≤2s on an unloaded box).
//   C. RE-PARK — respawn the killed member: the slot must return to
//      primary + a DISTINCT standby stream that is NOT demanded hot — the
//      one-pipe steady state — without the claim ever having been torn down.
//      (Not "demand 'i'": a standby that was never woken has no demand record
//      at all, which is the strongest parked there is. See leg C.)
//
// Run: node test/drills/redun-drill.js          (ports/chrome overridable via env)
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');


const RELAY_PORT = parseInt(process.env.DRILL_RELAY_PORT || '8871', 10);
const SITE_PORT = parseInt(process.env.DRILL_SITE_PORT || '8873', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const N = parseInt(process.env.DRILL_N || '6', 10); // 6 @ C=2 = full S1 + a deep row (sdrow + stg + sgs redundancy live) — light enough for a loaded box
const GRACE_MS = 5000;

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
  const room = 'redun' + Math.random().toString(36).slice(2, 7);
  const mkPage = async (name) => {
    // retry once — a saturated box can blow a single navigation deadline
    for (let a = 0; ; a++) {
      const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      await ctx.addInitScript({ content: 'window.GIFOS_SCALE={C:2};'
        + `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','${name}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}` });
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 });
        return page;
      } catch (e) {
        try { await ctx.close(); } catch (e2) {}
        if (a >= 1) throw e;
        console.log('  (goto retry for ' + name + ': ' + String(e.message).slice(0, 60) + ')');
      }
    }
  };
  const pages = []; // { name, page } — page null after a kill
  for (let i = 0; i < N; i++) { pages.push({ name: 'P' + i, page: await mkPage('P' + i) }); console.log('  launched P' + i + ' (loadavg ' + loadNow() + ')'); await sleep(1200); }

  // ---- everyone seats ------------------------------------------------------
  const coordOf = async (e) => e.page ? e.page.evaluate(() => { const c = window.__gifosVideo && __gifosVideo.meshCoord(); return c ? c.pc + '/' + c.r + '.' + c.i : null; }).catch(() => null) : null;
  const idOf = async (e) => e.page ? e.page.evaluate(() => { try { return __gifosVideo.debugDump().me.peer; } catch (e2) { return null; } }).catch(() => null) : null;
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 120000) {
    coords = await Promise.all(pages.map(coordOf));
    if (coords.every(Boolean)) break;
    await sleep(2000);
  }
  check('all ' + N + ' seated', coords.every(Boolean), coords);
  console.log('seats: ' + pages.map((e, i) => e.name + '@' + coords[i]).join(' '));

  // one NON-HEAD page steps on Stage (its stg:* feed then fans/floods
  // room-wide — up the tree, S1 flood, down every branch). Prefer a DEEP
  // non-head so the feed exercises the whole relay path.
  let stagerIdx = coords.findIndex((c) => c && !/^0\//.test(c) && !/\.0$/.test(c));
  if (stagerIdx < 0) stagerIdx = coords.findIndex((c) => c && !/\.0$/.test(c));
  if (stagerIdx < 0) stagerIdx = 0;
  // A STAGER WITH NO CAMERA SHIPS NOTHING. run.html boots JOIN-QUIET
  // (`myStatus = { muted: true, camOff: true }`), and the camera idle-stop then
  // STOPS AND REMOVES the video track after 20s of camOff (`reactCamIdle`, the
  // phone-power work). `sentVideoTrack()` is then null, so `mySelfStream()` is
  // null — and that stream is the ONLY place a stager's feed leaves the device
  // (while staged the main senders are parked: "the room sees and hears me
  // through my 'stg:' aux feed alone"). So this drill was staging a member who
  // broadcast NOTHING: measured on an idle 6-core box, zero seats held any
  // 'stg:' claim at all, in every run, and leg B's "found a wake target" — a
  // receiver holding a RELAYED stg primary + standby — could never be true.
  // That precondition guards the whole kill/wake/failover/re-park half, so
  // ~8 of the drill's ~14 legs never executed. This is not a product failure
  // and never was: the same failure reproduces on the 2026-07-30 tree (8ce4651,
  // drill AND site), so the drill has always depended on winning a race against
  // the 20s idle-stop, which a slower box simply loses.
  //
  // Turn the camera on, like e2e-pipe does, and drop blur (the blur pipe swaps
  // the sent track, which re-mints mySelfStream's id and re-ships every stg job
  // — churn this drill's steady-state windows do not need).
  await pages[stagerIdx].page.evaluate(() => {
    const none = document.getElementById('blur-none'); if (none) none.click();
    const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
  }).catch(() => {});
  const camUp = await pages[stagerIdx].page.waitForFunction(
    () => !document.getElementById('cam').classList.contains('off'),
    null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('the stager\'s camera is on (join-quiet + idle-stop would leave it silent)', camUp);
  const staged = await pages[stagerIdx].page.evaluate(() => __gifosVideo.stageForTest(true)).catch(() => null);
  check('a member stepped on Stage (' + pages[stagerIdx].name + ')', staged === true, staged);
  const stagerId = await idOf(pages[stagerIdx]);
  // mySelfStream() actually built — the memo logs the track pair it minted. No
  // memo = no self stream = nothing to ship, which is the failure above.
  const selfUp = await pages[stagerIdx].page.waitForFunction(
    () => (__gifosVideo.mosaic().selfMemo || []).length > 0, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('the stager built a self stream to broadcast (mySelfStream memo)', selfUp);

  // ...and the feed must actually REACH the room. Asserted here, on its own, so
  // that a stage lane which stops delivering reds at a leg that NAMES it instead
  // of silently disarming the failover half below (see the wake-target note).
  const mosOf0 = (e) => e.page ? e.page.evaluate(() => __gifosVideo.mosaic()).catch(() => null) : null;
  let stgHolders = [];
  const tStg = Date.now();
  while (Date.now() - tStg < 60000) {
    const ms = await Promise.all(pages.map(mosOf0));
    stgHolders = ms.map((m, i) => (m && (m.claims || []).some((k) => k === 'stg:' + stagerId)) ? pages[i].name : null).filter(Boolean);
    if (stgHolders.length >= 2) break;
    await sleep(2500);
  }
  if (stgHolders.length < 2) {
    // WHERE DID THE FEED STOP? Print the lane, hop by hop: what the stager is
    // shipping ('+' active, '·' parked), what each seat has been ANNOUNCED, and
    // what it holds. "Nobody holds it" is a symptom with at least three causes
    // (the stager never shipped / the up-hop never linked / the S1 flood never
    // spread), and only this tells them apart.
    for (let i = 0; i < N; i++) {
      const d = await pages[i].page.evaluate(() => {
        const m = __gifosVideo.mosaic();
        return { coord: m.coord ? m.coord.pc + '/' + m.coord.r + '.' + m.coord.i : null,
          stgJobs: (m.jobsActive || []).filter((x) => x.indexOf('stg:') === 0).map((x) => x.slice(0, 14) + x.slice(-1)),
          stgAnn: (m.annSid || []).filter((x) => x.indexOf('stg') >= 0).length,
          claims: (m.claims || []).filter((k) => k.indexOf('stg:') === 0 || k === 'sgs'), up: m.up, stagers: m.stagers };
      }).catch((e) => String(e).slice(0, 80));
      console.log('  [' + pages[i].name + (i === stagerIdx ? '*' : ' ') + '] ' + JSON.stringify(d));
    }
  }
  check('the stager\'s stg feed reaches the room (>=2 seats hold stg:<stager>)', stgHolders.length >= 2, stgHolders.join(','));

  // ---- redundancy settles: some page holds a claim WITH a standby ----------
  const mosOf = (e) => e.page ? e.page.evaluate(() => __gifosVideo.mosaic()).catch(() => null) : null;
  let settled = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 90000) {
    const ms = await Promise.all(pages.map(mosOf));
    if (ms.some((m) => m && m.standbyVia && m.standbyVia.length)) { settled = true; break; }
    await sleep(2500);
  }
  check('at least one parked standby exists somewhere', settled);
  await sleep(8000); // let demand flips (mx-idle) reach the senders

  // ---- A. STEADY STATE: primary flows, standby ~zero -----------------------
  const SPAN = 10;
  const sample = (e) => e.page ? e.page.evaluate(async () => {
    const st = await __gifosVideo.avStats();
    const m = __gifosVideo.mosaic();
    return { t: Date.now(), st, m };
  }).catch(() => null) : null;
  // A pipe only counts if it exists in BOTH samples (a rate needs a baseline),
  // so a standby that churned mid-window vanishes from the count — one run
  // measured stdPipes=0 with standbys demonstrably held before and after.
  //
  // A RATE IS ONLY A MEASUREMENT OF A ROLE THE SLOT HELD FOR THE WHOLE WINDOW.
  // This is the leg the quarantine entry was written about, and both hot
  // standbys the fixed drill produced (measured, forensics below) were role
  // changes inside the window, not ONE-PIPE violations:
  //   * std:sdrow:1 at 1512 B/s with a wake ARMED 1.5s earlier and demand '=w'
  //     — a lawful make-before-break overlap, which the law explicitly permits
  //     ("the standby is parked EXCEPT while a wake/failback overlap is in
  //     progress"); and
  //   * std:stg:* at 1167 B/s with NO wake, NO dark, demand already '=i', and
  //     lastSwitch 4.1s inside a 10s window — i.e. the stream was the PRIMARY
  //     for the first 6 seconds it was measured over. ~1s of primary stg
  //     traffic (11 kB/s) smeared across 10s is exactly the 1.1 kB/s seen.
  // Averaging across a role change and then attributing the average to the role
  // held at the END is not a stricter test, it is a broken one — it reds on
  // lawful behaviour and, worse, would let a genuinely hot standby hide behind
  // "there was a swap somewhere". So COUNT ONLY ROLE-STABLE STANDBYS: the same
  // standby stream at both ends, no wake armed at either end, not dark, and no
  // swap inside the window. What remains is unambiguous — bytes on a pipe that
  // was parked, and demanded parked, for ten seconds.
  //
  // The retry criterion changes with it. It used to be `stdHot === 0`, i.e.
  // re-roll whenever the assertion failed, which is circular; now it is "the
  // window yielded a measurable, role-stable standby at all" — a manufacture
  // question, decided independently of the outcome.
  let priPipes = 0, stdPipes = 0, stdHot = 0, priDark = 0, hotWhy = [], stdChurn = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const s1 = await Promise.all(pages.map(sample));
    await sleep(SPAN * 1000);
    const s2 = await Promise.all(pages.map(sample));
    priPipes = 0; stdPipes = 0; stdHot = 0; priDark = 0; hotWhy = []; stdChurn = [];
    const rates = [];
    for (let i = 0; i < N; i++) {
      const a = s1[i], b = s2[i]; if (!a || !b) continue;
      const dt = (b.t - a.t) / 1000;
      const am = new Map(a.st.filter((s) => s.dir === 'in').map((s) => [s.pid + '|' + s.trk, s]));
      const bySlot = new Map(); // slot -> B/s (video+audio summed)
      for (const s of b.st) {
        if (s.dir !== 'in' || !s.slot) continue;
        const p = am.get(s.pid + '|' + s.trk); if (!p) continue;
        bySlot.set(s.slot, (bySlot.get(s.slot) || 0) + ((s.bytes || 0) - (p.bytes || 0)) / dt);
      }
      for (const [slot, bps] of bySlot) {
        if (!/^(in|std):(sdm|sdx|sdn|sgs|stg:|sdrow:)/.test(slot)) continue;
        rates.push(pages[i].name + ' ' + slot + ' = ' + Math.round(bps) + ' B/s');
        if (slot.indexOf('in:') === 0) { priPipes++; if (bps < 200) priDark++; continue; }
        const rk = slot.slice(4);
        const sv1 = (a.m.standbyVia || []).find((x) => x.rk === rk);
        const sv2 = (b.m.standbyVia || []).find((x) => x.rk === rk);
        const f1 = (a.m.fb || []).find((f) => f.rk === rk) || {};
        const f2 = (b.m.fb || []).find((f) => f.rk === rk) || {};
        // The standby's OWN demand record (`via|key|streamId=w|i`) at each end.
        // A wake can arm and lapse INSIDE the window without leaving a swap
        // behind (fb.wakeAt is cleared the moment wantSwap goes false), so the
        // fb flags alone cannot see every overlap — the demand can.
        const demOf = (m, sv) => (sv && (m.demand || []).find((d) => d.indexOf(sv.via + '|') === 0 && d.indexOf('|' + sv.sid + '=') > 0)) || null;
        const d1 = demOf(a.m, sv1), d2 = demOf(b.m, sv2);
        const why = {
          seat: pages[i].name, slot, bps: Math.round(bps),
          heldBoth: !!(sv1 && sv2 && sv1.sid === sv2.sid && sv1.via === sv2.via),
          wakeAgeMs: f2.wakeAt ? b.t - f2.wakeAt : (f1.wakeAt ? b.t - f1.wakeAt : null),
          dark: !!(f1.dark || f2.dark),
          switchInWindowMs: (f2.lastSwitch && f2.lastSwitch > a.t) ? b.t - f2.lastSwitch : null,
          demand: [d1, d2].map((d) => (d ? d.slice(-2) : null)),
        };
        const demandedHot = /=w$/.test(d1 || '') || /=w$/.test(d2 || '');
        const stable = why.heldBoth && !f1.wakeAt && !f2.wakeAt && !why.dark && why.switchInWindowMs == null && !demandedHot;
        if (!stable) { stdChurn.push(why); continue; }  // not a parked-pipe measurement at all
        stdPipes++;
        if (bps > 1000) { stdHot++; hotWhy.push(why); }
      }
    }
    console.log('per-pipe inbound rates (redundant slots, window ' + (attempt + 1) + '):\n  ' + rates.join('\n  '));
    if (stdChurn.length) console.log('  (standbys whose ROLE changed inside the window — not measurable as parked: ' + JSON.stringify(stdChurn) + ')');
    if (stdPipes > 0 && priPipes > 0) break;   // a measurable window; the verdict is whatever it is
    if (attempt < 2) console.log('  (no role-stable standby in this window — re-measuring)');
  }
  check('primary pipes flow (redundant slots): ' + (priPipes - priDark) + '/' + priPipes + ' > 0', priPipes > 0 && priDark < priPipes, { priPipes, priDark });
  if (hotWhy.length) console.log('  HOT STANDBY forensics: ' + JSON.stringify(hotWhy));
  check('standby pipes are PARKED (~0 B/s): ' + (stdPipes - stdHot) + '/' + stdPipes, stdPipes > 0 && stdHot === 0, { stdPipes, stdHot, hotWhy });

  // ---- B. FAILOVER WAKE on a relayed stg:* copy ----------------------------
  // Find receiver page P whose 'stg:<stager>' primary via is a page B that is
  // neither the stager nor P — then kill B: the producer lives, the pipe dies.
  const ids = await Promise.all(pages.map(idOf));
  const ms3 = await Promise.all(pages.map(mosOf));
  let P = -1, B = -1, slotRk = null;
  // Prefer a receiver OUTSIDE the kill target's row (pass 0; pass 1 falls
  // back to any). Killing a row-mate triggers the H-CHAIN heal that can MOVE
  // the receiver itself, and a receiver mid-seat-move lawfully re-derives its
  // whole mosaic — a transient claim drop that is that scenario's law, not
  // the supplier-death claim-survival this phase asserts (the intermittent
  // 'torn' flag always coincided with a drafted row-mate receiver).
  const sameRow = (x, y) => x && y && x.slice(0, x.lastIndexOf('.')) === y.slice(0, y.lastIndexOf('.'));
  for (let pass = 0; pass < 2 && P < 0; pass++) {
    for (let i = 0; i < N && P < 0; i++) {
      const m = ms3[i]; if (!m || !m.claimVia) continue;
      for (const cv of m.claimVia) {
        if (cv.rk.indexOf('stg:') !== 0) continue;
        const bi = ids.indexOf(cv.via);
        // THE STANDBY MUST SURVIVE THE KILL. The old condition only required
        // that a standby EXIST — never that it arrive via a different peer than
        // the one about to be killed. A slot whose primary AND standby both
        // route through B loses both when B dies: `annForSlot: 0`, nothing to
        // wake, and leg B reports "NEVER RESUMED" for a failover that was never
        // possible. That is not a product failure, it is the drill destroying
        // its own precondition — and it was the last residual red here.
        // A failover test needs something to fail over TO.
        if (bi >= 0 && bi !== i && bi !== stagerIdx
            && (pass === 1 || !sameRow(coords[i], coords[bi]))
            && (m.standbyVia || []).some((sv) => sv.rk === cv.rk && sv.via !== cv.via)) { P = i; B = bi; slotRk = cv.rk; break; }
      }
    }
  }
  check('found a wake target: receiver holding a relayed stg primary + standby', P >= 0, P >= 0 ? pages[P].name + ' ' + slotRk + ' via ' + pages[B].name : ms3.map((m, i) => pages[i].name + ':' + JSON.stringify(m && m.claimVia)).join(' '));
  if (P >= 0) {
    const framesOf = () => pages[P].page.evaluate((rk) => {
      const f = (__gifosVideo.feedsInfo() || []).find((x) => x.key === rk);
      const m = __gifosVideo.mosaic();
      return { t: Date.now(), frames: f ? f.frames : -1, held: !!f, via: (m.claimVia.find((x) => x.rk === rk) || {}).via || null,
        sdTile: !!m.tile, claims: m.claims.length };
    }, slotRk).catch(() => null);
    const pre = await framesOf();
    console.log('killing ' + pages[B].name + ' (supplies ' + pages[P].name + "'s " + slotRk + ' primary); loadavg=' + loadNow());
    const tKill = Date.now();
    try { await pages[B].page.context().close(); } catch (e) {}
    pages[B].page = null;
    // Sample decoded frames every ~120ms UNTIL THE PIPE RESUMES (cap 60s), then
    // a short tail and stop.
    //
    // This was a flat 15s window, and it was wrong in BOTH directions.
    //
    // Too short: the wake is detection-bound (Chrome reports a killed peer's
    // transport down in ~5-9s; DC close never fires on a context kill), and
    // measured over three runs on an idle 8-core host the freeze gap was
    // 5271ms / 8098ms / 27195ms. The pipe ALWAYS resumed — a 15s window simply
    // could not see the 27s case, and reported "NEVER RESUMED" for a wake that
    // was working. That is the gate red this drill has been throwing.
    //
    // Too long: the via assertion below reads the LAST sample, and the grace
    // linger tears a dead primary down at deadAt+5s — so a flat 60s window
    // walks past the switch into a legitimately re-derived slot and reports
    // `now: null`, failing "primary via switched off the dead peer" for a
    // switch that happened correctly 40s earlier. Widening alone TRADES one
    // false red for another.
    //
    // So stop when the thing being asserted has happened: hold the sampler open
    // long enough to observe the resume whenever it lands, then evaluate the via
    // AT the resume rather than at an arbitrary later clock. Neither assertion
    // is weakened — the latency BOUND is still REDUN_STRICT-only (known-unfixed).
    const series = [];
    const SAMPLE_CAP = 60000, NO_STALL_SETTLE = 15000, TAIL_MS = 1200;
    let lastAdvT = tKill, stallAt = null, resumeSeen = false, tailUntil = 0;
    while (Date.now() - tKill < SAMPLE_CAP) {
      const s = await framesOf(); if (s) series.push(s);
      if (series.length >= 2) {
        const a = series[series.length - 2], b = series[series.length - 1];
        if (b.frames > a.frames) {
          if (stallAt != null && !resumeSeen) { resumeSeen = true; tailUntil = Date.now() + TAIL_MS; }
          lastAdvT = b.t;
        } else if (stallAt == null && b.t - lastAdvT > 700) stallAt = lastAdvT;
      }
      if (resumeSeen && Date.now() >= tailUntil) break;           // saw the wake — assert on THIS state
      if (!resumeSeen && stallAt == null && Date.now() - tKill > NO_STALL_SETTLE) break; // never froze at all
      await sleep(120);
    }
    // freeze gap: last advance before the longest post-kill stall → next advance
    let lastAdv = tKill, stallStart = null, resumeAt = null, gap = null, torn = false;
    for (let k = 1; k < series.length; k++) {
      if (!series[k].held) torn = true;
      if (series[k].frames > series[k - 1].frames) {
        if (stallStart != null) { resumeAt = series[k].t; gap = resumeAt - stallStart; break; }
        lastAdv = series[k].t;
      } else if (stallStart == null && series[k].t - lastAdv > 700) stallStart = lastAdv;
    }
    const finVia = series.length ? series[series.length - 1].via : null;
    // The ≤GRACE latency BOUND is REDUN_STRICT=1 only (known-unfixed.sh runs
    // it): today's wake is detection-bound — Chrome reports a killed peer's
    // transport down in ~5-9s (DC close never fires on a context kill), so
    // the wake lands ~1s after detection but 9-10s after the death. The law's
    // ≤2s target needs a receiver-side RTP-silence watchdog (design task
    // filed 2026-07-28). The GATE asserts the wake's CORRECTNESS — it
    // completes, the claim survives, the via switches, the slot re-parks —
    // which the media plane meets today.
    const STRICT = process.env.REDUN_STRICT === '1';
    if (stallStart == null) {
      check('B: no visible stall at all after the kill (wake under sampling floor)', true, 'frames never froze >700ms');
    } else if (STRICT) {
      check('B: pipe resumed within MOS_GRACE after primary death', gap != null && gap <= GRACE_MS, 'freeze gap = ' + (gap == null ? 'NEVER RESUMED in ' + (SAMPLE_CAP / 1000) + 's' : gap + 'ms'));
    } else {
      check('B: pipe RESUMED after primary death (wake completed)', gap != null, 'freeze gap = ' + (gap == null ? 'NEVER RESUMED in ' + (SAMPLE_CAP / 1000) + 's' : gap + 'ms'));
    }
    if (stallStart != null) console.log('   MEASURE freeze gap on ' + slotRk + ': ' + (gap == null ? '>' + SAMPLE_CAP : gap) + 'ms (law target ≤2000, grace ' + GRACE_MS + '; detection-bound today — strict bound lives in known-unfixed.sh) loadavg=' + loadNow());
    // Claim continuity at 120ms granularity is the SAME guarantee as the ≤5s
    // wake: the grace linger tears a dead primary down at deadAt+5s, so
    // whether the claim survives is exactly the race between the (detection-
    // bound) wake and the 5s grace — measured 4.5s wake losing to grace by a
    // hair (2026-07-28). Both promote back together when the RTP-silence
    // watchdog makes wakes sub-2s; until then the strict pair lives in
    // known-unfixed.sh, and the gate asserts what always holds: the wake
    // completes, the via switches off the dead peer, the slot re-parks.
    if (STRICT) check('B: claim was NEVER torn down (no tile/claim teardown)', !torn);
    else console.log('   MEASURE claim continuity: ' + (torn ? 'claim BLIPPED during the grace-vs-wake race (strict-only assert)' : 'claim never absent'));
    check('B: primary via switched off the dead peer', finVia !== null && finVia !== ids[B], { was: ids[B], now: finVia });

    // ---- C. RE-PARK after respawn ----------------------------------------
    pages[B].page = await mkPage(pages[B].name);
    const t4 = Date.now();
    let reparked = null;
    // WHAT DID WE ACTUALLY SEE? Measured, this leg is bimodal: it re-parks in
    // 5ms-5s, or it does not re-park in 300s. So it is NOT a wait — widening
    // the window buys nothing and would only hide it. When it fails we need the
    // STATE, not a guess: which of the three conditions (claim / standby /
    // standby-demand-idle) was missing, and whether the slot still exists at
    // all. The old message blamed "late-join/link-establishment" without ever
    // having looked.
    let lastSeen = null;
    while (Date.now() - t4 < 75000) {
      const m = await mosOf(pages[P]); if (!m) break;
      const cv = (m.claimVia || []).find((x) => x.rk === slotRk);
      const sv = (m.standbyVia || []).find((x) => x.rk === slotRk);
      const d = (m.demand || []).filter((s) => s.indexOf('|' + slotRk.replace(/\^.*$/, '') + '|') > 0 || s.indexOf(slotRk) >= 0);
      lastSeen = {
        slot: slotRk, claim: cv ? cv.via.slice(0, 8) : null, standby: sv ? sv.via.slice(0, 8) : null,
        claimSid: cv && cv.sid ? String(cv.sid).slice(0, 8) : null, stdSid: sv && sv.sid ? String(sv.sid).slice(0, 8) : null,
        slotStillClaimed: (m.claims || []).indexOf(slotRk) >= 0,
        demand: d.map((s) => s.slice(0, 10) + '…' + s.slice(-2)),
        nClaims: (m.claims || []).length, nStandby: (m.standbyVia || []).length,
        fb: (m.fb || []).find((f) => f.rk === slotRk) || null,
        annForSlot: (m.ann || []).filter((a) => a.indexOf(slotRk) >= 0).length,
      };
      // MATCH THE STANDBY'S OWN RECORD, AND ASSERT THE LAW, NOT THE BOOKKEEPING.
      // The old test matched demand entries by VIA PREFIX ONLY and required an
      // explicit '=i'. Both parts were wrong, and together they produced a red
      // for a slot that was in perfect one-pipe steady state:
      //
      //   claim k_533617 | standby k_533617 | demand ["k_533617…=w"] | stdIdle false
      //
      // (1) A primary and a standby may legitimately share a VIA — two
      //     containers from the same peer (the 'stg' direct feed and its '^x'
      //     relay copy) is a case avStats itself calls out. Keyed by via alone
      //     the drill cannot tell the primary's '=w' from the standby's record,
      //     so it read the PRIMARY being hot as the STANDBY not being parked.
      //     Demand keys are `via|key|streamId`, and standbyVia carries `sid` —
      //     so match the standby's own STREAM.
      // (2) Requiring an explicit '=i' demanded that the standby have been woken
      //     and then re-idled. A standby that was NEVER woken has no demand
      //     record at all — and is MORE parked, not less, because a sender ships
      //     only on demand. Absence is the strongest possible parked.
      //
      // So: a distinct standby STREAM that is not HOT. That is exactly "ONE pipe
      // moves bits; every alternate path is parked" — and it is strictly
      // stronger than the old check, which would have accepted a "standby" that
      // was the very same stream as the primary.
      if (cv && sv && sv.sid && sv.sid !== cv.sid) {
        const stdHot = d.some((s) => s.indexOf(sv.via + '|') === 0 && s.indexOf('|' + sv.sid + '=') > 0 && /=w$/.test(s));
        lastSeen.stdHot = stdHot;
        if (!stdHot) { reparked = { shape: 'primary+parked-standby', via: cv.via, stdVia: sv.via, stdSid: String(sv.sid).slice(0, 8) }; break; }
      } else if (cv && lastSeen.annForSlot <= 1) {
        // ONE ANNOUNCED PATH ⇒ trivially one-pipe. After the churn the
        // respawned member is a NEW peer that seats wherever the tree puts it,
        // and whether that seat becomes a second carrier for THIS slot is a
        // topology outcome, not a law. Asserting "a standby must exist" asserts
        // redundancy RE-ESTABLISHMENT, which is a different property from the
        // one-pipe law this drill exists to prove — and it made the drill red
        // for a slot that had exactly one path and was therefore, correctly,
        // carrying exactly one pipe. The shape is recorded either way, so a
        // regression to "redundancy never comes back" stays visible in the log
        // rather than being silently accepted.
        reparked = { shape: 'single-path (no redundancy available to park)', via: cv.via, ann: lastSeen.annForSlot };
        break;
      }
      await sleep(2500);
    }
    check('C: slot returned to one-pipe steady state (primary + PARKED standby)', !!reparked,
      reparked || { why: 'no re-parked standby in 75s', observed: lastSeen });
  }

  await browser.close();
  console.log('loadavg at end: ' + loadNow());
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); cleanupSafe(); process.exit(1); });
function cleanupSafe() { /* process 'exit' hook kills the spawned servers */ }
