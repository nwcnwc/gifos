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
// make-before-break, the mirror re-parking. Run: node test/mirror-drill.js
//
// KNOWN BLOCKER (2026-07-18): the forceSeat teleports require POST-SEATING
// link formation (offers to socketless seats via the sponsor path), which is
// the exact pre-existing failure e2e-latejoin documents (fails identically on
// the baseline commit). Until that intake fix lands, phases (2)/(3) cannot
// complete: pairs for the child section stick in 'new'/'connecting' and the
// chain's streams never negotiate. What HAS been observed live despite it:
// producers ship 'sdnm:<dst>' born-parked ('·' in jobsActive) to the correct
// first hop of the computed route (both the r=0 and r=1 cases), and Section-1
// one-pipe behavior (primary 'w' + carrier copy parked '·'). Re-run this
// drill after the transport fix lands.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
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
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', 'site')], { stdio: 'ignore' });
  process.on('exit', () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} });
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
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
  const ids = await Promise.all(pages.map(idOf));
  const seed = {}; for (let k = 0; k < SEATS.length; k++) if (ids[k]) seed[SEATS[k]] = ids[k];
  // Every page gets a seeded (re)take — including the ones already on their
  // target seat: the seed teaches each occ the WHOLE drill topology at once,
  // because post-teleport occ gossip alone converges too slowly for a drill.
  for (let k = 0; k < SEATS.length; k++) {
    const m = /^(\d+)\/(\d+)\.(\d+)$/.exec(SEATS[k]);
    const res = await pages[k].page.evaluate((a) => __gifosVideo.forceSeat(a[0], a[1], a[2], a[3]), [m[1], m[2], m[3], seed]).catch((e) => String(e).slice(0, 60));
    console.log('  ' + NAMES[k] + ' → ' + SEATS[k] + ' ' + JSON.stringify(res));
    await sleep(700);
  }
  await sleep(6000);
  coords = await Promise.all(pages.map(coordOf));
  check('drill topology in place', coords.every((c, k) => c === SEATS[k]), coords.map((c, k) => NAMES[k] + '@' + c).join(' '));

  // ---- the mirror BUILDS dormant end-to-end --------------------------------
  const mosOf = (e) => e.page ? e.page.evaluate(() => __gifosVideo.mosaic()).catch(() => null) : null;
  let built = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 150000) {
    const m = await mosOf(pages[OBS]);
    if (m) {
      const pri = (m.claimVia || []).find((x) => x.rk === 'sdn');
      const std = (m.standbyVia || []).find((x) => x.rk === 'sdn');
      if (pri && std) { built = { pri, std, demand: m.demand }; break; }
    }
    await sleep(2500);
  }
  check('E holds sdn PRIMARY + mirror STANDBY', !!built, built && { pri: built.pri.via.slice(0, 8), std: built.std.via.slice(0, 8) });
  if (!built) { // diagnose: where did the chain stick?
    for (let k = 0; k < pages.length; k++) {
      if (!pages[k].page) continue;
      const d = await pages[k].page.evaluate((peerIds) => {
        const m = __gifosVideo.mosaic();
        const conns = peerIds.map((pid) => { const st = __gifosVideo.pcState(pid); return pid.slice(2, 6) + ':' + (st ? st.conn : 'NOPC'); });
        const occView = (__gifosVideo.debugDump().roster || []).map((r) => (r.name || '?') + '@' + (r.coord || '?')).join(' ');
        return { claims: m.claims, ann: m.ann.map((a) => a.slice(0, 10) + '…' + a.slice(a.indexOf('|'))), jobs: m.jobsActive, conns, occView };
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

  // ---- KILL the parent seat B: multi-hop demand-wake -----------------------
  const framesOf = () => pages[OBS].page.evaluate(() => {
    const f = (__gifosVideo.feedsInfo() || []).find((x) => x.key === 'sdn');
    const m = __gifosVideo.mosaic();
    return { t: Date.now(), frames: f ? f.frames : -1, held: !!f,
      via: ((m.claimVia || []).find((x) => x.rk === 'sdn') || {}).via || null };
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
  const finVia = series.length ? series[series.length - 1].via : null;
  if (stallStart == null) check('KILL: no visible sdn stall at all (wake under the sampling floor)', true);
  else {
    check('KILL: sdn resumed within MOS_GRACE via the mirror', gap != null && gap <= GRACE_MS, 'measured multi-hop wake gap = ' + (gap == null ? '>20000' : gap) + 'ms (target ≤2000, bound ' + GRACE_MS + ') loadavg=' + loadNow());
    console.log('   sdn freeze gap: ' + (gap == null ? '>20000' : gap) + 'ms');
  }
  check('KILL: sdn claim never torn down', !torn);
  check('KILL: sdn now rides the mirror (via F)', finVia === ids[MIRROR_END], { via: finVia && finVia.slice(0, 8), F: String(ids[MIRROR_END]).slice(0, 8) });

  // ---- HEAL + FAILBACK: direct path returns, mirror re-parks ---------------
  let back = null;
  const t3 = Date.now();
  while (Date.now() - t3 < 120000) {
    const m = await mosOf(pages[OBS]);
    if (m) {
      const occ01 = await pages[OBS].page.evaluate(() => { const s = __gifosVideo.debugDump(); const r = (s.rows && s.rows[0]) || []; return r[1] || null; }).catch(() => null);
      const pri = (m.claimVia || []).find((x) => x.rk === 'sdn');
      const std = (m.standbyVia || []).find((x) => x.rk === 'sdn');
      // failed back: primary via == the (healed) occupant of 0/0.1, mirror parked again as standby
      if (pri && occ01 && String(pri.via).indexOf(occ01) === 0 && std) { back = { pri: pri.via.slice(0, 8), std: std.via.slice(0, 8), occ01 }; break; }
    }
    await sleep(3000);
  }
  check('FAILBACK: sdn primary returned to the direct hop (healed 0/0.1) with the mirror re-parked as standby', !!back, back || 'no failback within 120s (heal may have consumed a mirror hop — see report)');

  await browser.close();
  console.log('loadavg at end: ' + loadNow());
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
