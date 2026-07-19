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
//      primary + PARKED standby (demand 'i', ~zero bytes) — the one-pipe
//      steady state — without the claim ever having been torn down.
//
// Run: node test/redun-drill.js          (ports/chrome overridable via env)
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
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
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
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
        await page.goto(BASE + '/meet.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 });
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
  const staged = await pages[stagerIdx].page.evaluate(() => __gifosVideo.stageForTest(true)).catch(() => null);
  check('a member stepped on Stage (' + pages[stagerIdx].name + ')', staged === true, staged);
  const stagerId = await idOf(pages[stagerIdx]);

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
  const s1 = await Promise.all(pages.map(sample));
  await sleep(SPAN * 1000);
  const s2 = await Promise.all(pages.map(sample));
  let priPipes = 0, stdPipes = 0, stdHot = 0, priDark = 0;
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
      if (slot.indexOf('in:') === 0) { priPipes++; if (bps < 200) priDark++; }
      else { stdPipes++; if (bps > 1000) stdHot++; }
    }
  }
  console.log('per-pipe inbound rates (redundant slots):\n  ' + rates.join('\n  '));
  check('primary pipes flow (redundant slots): ' + (priPipes - priDark) + '/' + priPipes + ' > 0', priPipes > 0 && priDark < priPipes, { priPipes, priDark });
  check('standby pipes are PARKED (~0 B/s): ' + (stdPipes - stdHot) + '/' + stdPipes, stdPipes > 0 && stdHot === 0, { stdPipes, stdHot });

  // ---- B. FAILOVER WAKE on a relayed stg:* copy ----------------------------
  // Find receiver page P whose 'stg:<stager>' primary via is a page B that is
  // neither the stager nor P — then kill B: the producer lives, the pipe dies.
  const ids = await Promise.all(pages.map(idOf));
  const ms3 = await Promise.all(pages.map(mosOf));
  let P = -1, B = -1, slotRk = null;
  for (let i = 0; i < N && P < 0; i++) {
    const m = ms3[i]; if (!m || !m.claimVia) continue;
    for (const cv of m.claimVia) {
      if (cv.rk.indexOf('stg:') !== 0) continue;
      const bi = ids.indexOf(cv.via);
      if (bi >= 0 && bi !== i && bi !== stagerIdx
          && (m.standbyVia || []).some((sv) => sv.rk === cv.rk)) { P = i; B = bi; slotRk = cv.rk; break; }
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
    // sample decoded frames every ~120ms for 15s
    const series = [];
    while (Date.now() - tKill < 15000) { const s = await framesOf(); if (s) series.push(s); await sleep(120); }
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
    if (stallStart == null) {
      check('B: no visible stall at all after the kill (wake under sampling floor)', true, 'frames never froze >700ms');
    } else {
      check('B: pipe resumed within MOS_GRACE after primary death', gap != null && gap <= GRACE_MS, 'freeze gap = ' + (gap == null ? 'NEVER RESUMED in 15s' : gap + 'ms'));
      console.log('   measured freeze gap on ' + slotRk + ': ' + (gap == null ? '>15000' : gap) + 'ms (target ≤2000, hard bound ' + GRACE_MS + ') loadavg=' + loadNow());
    }
    check('B: claim was NEVER torn down (no tile/claim teardown)', !torn);
    check('B: primary via switched off the dead peer', finVia !== null && finVia !== ids[B], { was: ids[B], now: finVia });

    // ---- C. RE-PARK after respawn ----------------------------------------
    pages[B].page = await mkPage(pages[B].name);
    const t4 = Date.now();
    let reparked = null;
    while (Date.now() - t4 < 75000) {
      const m = await mosOf(pages[P]); if (!m) break;
      const cv = (m.claimVia || []).find((x) => x.rk === slotRk);
      const sv = (m.standbyVia || []).find((x) => x.rk === slotRk);
      if (cv && sv) {
        const d = (m.demand || []).filter((s) => s.indexOf('|' + slotRk.replace(/\^.*$/, '') + '|') > 0 || s.indexOf(slotRk) >= 0);
        const stdIdle = d.some((s) => s.indexOf(sv.via) === 0 && /=i$/.test(s));
        if (stdIdle) { reparked = { via: cv.via, stdVia: sv.via }; break; }
      }
      await sleep(2500);
    }
    check('C: slot returned to one-pipe steady state (primary + PARKED standby)', !!reparked, reparked || 'no re-parked standby within 75s (late-join/link-establishment may be broken — see e2e-latejoin)');
  }

  await browser.close();
  console.log('loadavg at end: ' + loadNow());
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); cleanupSafe(); process.exit(1); });
function cleanupSafe() { /* process 'exit' hook kills the spawned servers */ }
