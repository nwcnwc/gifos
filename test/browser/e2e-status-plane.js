// e2e-status-plane.js — THE STATUS PLANE PAST ONE SECTION, in real browsers.
//
// docs/status-plane-migration.md; healing-laws § G + G9. With the rollup
// digest on (window.GIFOS_DIGEST), a status heartbeat reaches only its sender's
// SECTION and the room-global facts ride the fold. At C=2 a section is 4 seats,
// so ten browsers span three or more sections — the smallest room where the
// plane is doing its job. Every leg asks one question a member of a big room
// asks, and asks it of a seat that can NOT hear the answer first-hand:
//
//   1. the count label reads the whole room on every seat (the fold's n, G2)
//   2. the status flood is CONFINED — no seat hears a fresh status from every
//      other seat (the O(N) cost this whole migration removes)
//   3. a hand raised deep in the tree reaches every seat's hand queue
//   4. a stage claim from a deep section reaches every seat's Stage
//   5. a moderation change reaches the whole room (G6: one flood per change)
//   6. clear-video consent is my SECTION's unanimity (G1): the whole
//      consenting room clears; one refuser blurs its own section only and
//      every other seat shows the room badge instead — never a stuck room.
//   7. statusOf is bounded by the plane (section + DataChannel pairs), not by
//      the room (scale-audit V2).
//
// Run: site on 8099 + relay on 8790 (test/servers/dev.sh), then
//   node test/browser/e2e-status-plane.js
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = +(process.env.N || 10);
const PW = 'plane-pw';
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cstr = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '?');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'plane' + Math.random().toString(36).slice(2, 8);
  const pages = [];
  const errs = [];
  const mk = async (i) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}; window.GIFOS_SCALE={C:2}; window.GIFOS_DIGEST=true;` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { errs.push('P' + i + ': ' + String(e).slice(0, 160)); console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 160)); });
    await page.goto(BASE + '/run.html#v=' + room);
    return page;
  };
  const sp = (pg) => pg.evaluate(() => window.__gifosVideo.statusPlane()).catch(() => null);
  const pwModalShown = (pg) => pg.evaluate(() => { const m = document.getElementById('pw-modal'); return !!m && getComputedStyle(m).display !== 'none'; }).catch(() => false);
  const waitAll = async (label, pred, ms) => {
    const t0 = Date.now(); let last = [];
    while (Date.now() - t0 < ms) {
      last = await Promise.all(pages.map(sp));
      if (last.every((x) => x && pred(x))) return { ok: true, secs: Math.round((Date.now() - t0) / 1000), last };
      await sleep(1500);
    }
    return { ok: false, secs: Math.round((Date.now() - t0) / 1000), last };
  };

  // ---- a locked room of N, joined one at a time -------------------------------
  const A = await mk(0);
  pages.push(A);
  await sleep(2500);
  await A.locator('#pwbtn').click();
  await A.locator('#pw-new').fill(PW);
  await A.locator('#pw-save').click();
  await A.waitForFunction((pw) => window.__gifosVideo.roomPw && window.__gifosVideo.roomPw() === pw, PW, { timeout: 15000 });
  for (let i = 1; i < N; i++) {
    const pg = await mk(i);
    pages.push(pg);
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      if (await pwModalShown(pg)) { try { await pg.locator('#pw-new').fill(PW); await pg.locator('#pw-save').click(); } catch (e) {} }
      const s = await sp(pg);
      if (s && s.coord) break;
      await sleep(1000);
    }
    await sleep(1200);
  }
  const seated = await waitAll('seated', (s) => !!s.coord, 90000);
  check('all ' + N + ' seated at C=2, the room past one section', seated.ok && seated.last.some((s) => s.coord.pc !== 0), seated.last.map((s) => s && cstr(s.coord)));
  if (!seated.ok) { await browser.close(); console.log('\n' + (failures || 1) + ' FAILED'); process.exit(1); }
  check('the digest is on in every page', seated.last.every((s) => s.mode === true));

  // ---- 1. the count: the fold's n, on every seat --------------------------------
  const counted = await waitAll('count', (s) => s.past && s.display === N, 90000);
  check('every seat reads the whole room: ' + N + ' in the meeting (fold n, G2)', counted.ok, { secs: counted.secs, display: counted.last.map((s) => s && s.display), n: counted.last.map((s) => s && s.n) });
  // The line repaints on the 2s UI beat, so give it one beat past the fold.
  const eventually = async (read, ok, ms) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await read(); if (ok(v)) return { ok: true, v }; await sleep(500); } return { ok: false, v }; };
  const labels = await eventually(() => Promise.all(pages.map((pg) => pg.evaluate(() => document.getElementById('status').textContent).catch(() => ''))),
    (ls) => ls.every((l) => l.indexOf(N + ' in the meeting') === 0), 6000);
  check('the status line says it too', labels.ok, labels.v.map((l) => l.slice(0, 24)));

  // ---- 2. confinement: nobody hears everybody -----------------------------------
  // At C=2 a section is 4 seats: a seat hears its 3 section-mates' heartbeats
  // plus the few DataChannel pairs fanOut's viaDc pulses directly (its up and
  // down links). Under the room flood every seat heard all N-1.
  await sleep(6000);
  const conf = await Promise.all(pages.map(sp));
  const heard = conf.map((s) => (s ? s.fresh.length : -1));
  const full = heard.filter((h) => h >= N - 1).length;
  check('the heartbeat is confined — at most one seat hears all ' + (N - 1) + ' others', full <= 1, { heard });
  check('the median seat hears under half the room first-hand', heard.slice().sort((a, b) => a - b)[Math.floor(N / 2)] < (N - 1) / 2 + 1, { heard });

  // Which seats are deep, and which pairs never share a section?
  const pids = conf.map((s) => s.id);
  const pcs = conf.map((s) => s.coord.pc);
  const deepIdx = pcs.map((pc, i) => ({ pc, i })).sort((a, b) => b.pc - a.pc || b.i - a.i)[0].i;
  const farFromDeep = pcs.map((pc, i) => i).filter((i) => pcs[i] !== pcs[deepIdx] && !conf[i].fresh.includes(pids[deepIdx]));
  console.log('  deep seat P' + deepIdx + ' at ' + cstr(conf[deepIdx].coord) + '; seats not hearing it first-hand: ' + farFromDeep.map((i) => 'P' + i).join(','));
  check('some seats do NOT hear the deep seat first-hand (the legs below are real)', farFromDeep.length > 0);

  // ---- 3. a hand from the deep end ------------------------------------------------
  await pages[deepIdx].evaluate(() => window.__gifosVideo.raiseHand(true));
  const handT0 = Date.now(); let handOk = false, hq = [];
  while (Date.now() - handT0 < 45000) {
    hq = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.handQueue().map((e) => e.id)).catch(() => [])));
    if (hq.every((q) => q.includes(pids[deepIdx]))) { handOk = true; break; }
    await sleep(1500);
  }
  check('the deep hand reaches every seat\'s queue', handOk, { secs: Math.round((Date.now() - handT0) / 1000), missing: hq.map((q, i) => (q.includes(pids[deepIdx]) ? null : 'P' + i)).filter(Boolean) });
  const bannerOk = await eventually(() => Promise.all(farFromDeep.map((i) => pages[i].evaluate(() => window.__gifosVideo.handqText()).catch(() => ''))),
    (ts) => ts.every((t) => /1 waiting: .*P/.test(t)), 6000);
  check('every far seat\'s banner names the deep hand', bannerOk.ok, bannerOk.v);
  await pages[deepIdx].evaluate(() => window.__gifosVideo.raiseHand(false));
  const lowered = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 45000) { const q = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.handQueue().length).catch(() => -1))); if (q.every((x) => x === 0)) return true; await sleep(1500); } return false; })();
  check('lowering it clears every queue', lowered);

  // ---- 4. a stage claim from the deep end ---------------------------------------
  const went = await pages[deepIdx].evaluate(() => window.__gifosVideo.stageForTest(true));
  check('the deep seat may take the Stage', went === true, went);
  const stT0 = Date.now(); let stOk = false, sids = [];
  while (Date.now() - stT0 < 45000) {
    sids = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.stageIds()).catch(() => [])));
    if (sids.every((s) => s.includes(pids[deepIdx]))) { stOk = true; break; }
    await sleep(1500);
  }
  check('every seat\'s Stage holds the deep stager', stOk, { secs: Math.round((Date.now() - stT0) / 1000), missing: sids.map((s, i) => (s.includes(pids[deepIdx]) ? null : 'P' + i)).filter(Boolean) });
  await pages[deepIdx].evaluate(() => window.__gifosVideo.stageForTest(false));
  const stOff = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 45000) { const s = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.stageIds().length).catch(() => -1))); if (s.every((x) => x === 0)) return true; await sleep(1500); } return false; })();
  check('stepping down empties every Stage', stOff);

  // ---- 5. a moderation change reaches the room -----------------------------------
  // A plain room takes anyone's word for a mod entry (takeMod → mergeMod), so
  // the deep seat mutes P0 for everyone and every seat must learn it.
  await pages[deepIdx].evaluate((t) => window.__gifosVideo.forgeModForTest(t, 'mute'), pids[0]);
  const modT0 = Date.now(); let modOk = false, co = [];
  while (Date.now() - modT0 < 30000) {
    co = await Promise.all(pages.map((pg) => pg.evaluate((t) => window.__gifosVideo.modOn(t, 'mute'), pids[0]).catch(() => null)));
    if (co.every(Boolean)) { modOk = true; break; }
    await sleep(1000);
  }
  check('a room-wide mod change from the deep end reaches every seat', modOk, { secs: Math.round((Date.now() - modT0) / 1000), co });

  // ---- 6. consent is my section's -------------------------------------------------
  for (const pg of pages) { await pg.locator('#cam').click().catch(() => {}); await pg.evaluate(() => window.__gifosVideo.setBlur(0)).catch(() => {}); await sleep(300); }
  const consT0 = Date.now(); let cons = [], consOk = false;
  while (Date.now() - consT0 < 60000) {
    cons = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.consensus()).catch(() => null)));
    if (cons.every((c) => c === true)) { consOk = true; break; }
    await sleep(1500);
  }
  check('a fully consenting room past one section clears everywhere', consOk, { secs: Math.round((Date.now() - consT0) / 1000), cons });
  const readyLbl = await Promise.all(pages.map(sp));
  check('the room badge reads ready once the fold agrees', await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { const s = await Promise.all(pages.map(sp)); if (s.every((x) => x && x.refuse === 0)) return true; await sleep(1500); } return false; })(), readyLbl.map((s) => s && s.refuse));

  await pages[deepIdx].evaluate(() => window.__gifosVideo.setBlur(2));
  const refT0 = Date.now(); let ref = [];
  let sectionBlurred = false, othersClear = false, badged = false;
  while (Date.now() - refT0 < 45000) {
    ref = await Promise.all(pages.map(async (pg, i) => ({ i, pc: pcs[i], c: await pg.evaluate(() => window.__gifosVideo.consensus()).catch(() => null), s: await sp(pg) })));
    // "My section" is the part of it I actually hear: a sparse deep section's
    // rows meet only through their owners, so a seat that hears the refuser
    // first-hand AND shares its section blurs with it, and a seat in another
    // section stays clear even when it hears the refuser over an up/down link.
    const mates = ref.filter((r) => r.i === deepIdx || (r.pc === pcs[deepIdx] && r.s && r.s.fresh.includes(pids[deepIdx])));
    const others = ref.filter((r) => r.pc !== pcs[deepIdx]);
    sectionBlurred = mates.every((r) => r.c === false);
    othersClear = others.every((r) => r.c === true);
    badged = others.every((r) => r.s && r.s.refuse >= 1 && /not ready yet/.test(r.s.label));
    if (sectionBlurred && othersClear && badged) break;
    await sleep(1500);
  }
  check('the refuser and the section-mates who hear it drop back to blurred', sectionBlurred, ref.map((r) => 'P' + r.i + '@' + r.pc + ':' + r.c));
  check('seats in other sections stay clear (section unanimity, not a stuck room)', othersClear, ref.map((r) => 'P' + r.i + '@' + r.pc + ':' + r.c));
  check('...and show the room badge "not ready yet" from the fold (display only, G1)', badged, ref.map((r) => r.s && ('P' + r.i + ' refuse=' + r.s.refuse)));

  // ---- 7. the map is bounded by the plane, not the room ------------------------
  // scale-audit V2: statusOf grew O(N). On the status plane an entry exists only
  // for a sender whose heartbeat reaches me — my section-mates and my open
  // DataChannel pairs (fanOut's viaDc) — and it expires with the holdover. Every
  // join above was long enough ago that no pre-growth room-wide entry survives.
  const fin = await Promise.all(pages.map(sp));
  const over = fin.map((x, i) => (x && x.statusN > 2 * 2 - 1 + x.dcLinks ? 'P' + i + ':' + x.statusN + '>' + (3 + x.dcLinks) : null)).filter(Boolean);
  check('every seat\'s statusOf <= C*C-1 + its open DataChannels (the V2 bound)', over.length === 0, { over, sizes: fin.map((x) => x && x.statusN) });

  check('no page errors', errs.length === 0, errs.slice(0, 5));
  await browser.close();
  console.log('\n' + (failures ? failures + ' FAILED' : 'ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — crashed: ' + (e && e.stack || e)); process.exit(1); });
