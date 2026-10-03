// e2e-status-plane.js — THE STATUS PLANE PAST ONE SECTION, in real browsers.
//
// docs/status-plane-migration.md; healing-laws § G + G9. With the rollup
// digest on (the default), a status heartbeat reaches only its sender's
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
//   5b. one chat line is ONE room flood (nobody re-broadcasts it).
//   5c. a hostile room-wide heartbeat flood is refused by the attacker's
//       direct neighbours and reaches nobody else (Rule 1).
//   5d. gossip is signed: lines forged in another's name reach nobody.
//   5e. THE TRIPWIRE: twenty quiet seconds originate no room-wide flood and
//       deliver no seat more gossip than its section can send it.
//   6. clear video needs EVERYONE, at every size: the whole consenting room
//      clears; one refuser anywhere blurs every section (first-hand in its
//      own, by the fold's refusal count everywhere else); it clears again
//      when the refuser agrees.
//   Two of the ten pages run with clocks a minute wrong (one slow, one fast).
//   7. statusOf is bounded by the plane (section + DataChannel pairs), not by
//      the room (scale-audit V2).
//   8. history rides the pair, not the room: an 11th seat joining a room with
//      30 chat lines by one author holds all 30 and originates no room flood.
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
  // TWO PHONES WITH WRONG CLOCKS, because real rooms have them: P2 runs a
  // minute slow and P5 a minute fast. Every leg below must hold regardless —
  // a status is dated by when it ARRIVED on the reader's clock, never by the
  // sender's (a slow phone was once never fresh to anyone: uncounted, barred
  // from the Stage, and a permanent blur on everyone who heard it).
  const SKEW = { 2: -60000, 5: 60000 };
  const skewOf = (i) => (SKEW[i] ? `(function(){var D=Date.now.bind(Date),k=${SKEW[i]};Date.now=function(){return D()+k;};})();` : '');
  const mk = async (i) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}; window.GIFOS_SCALE={C:2};` + skewOf(i) });
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

  // ---- 5b. ONE chat line is ONE flood ------------------------------------------------
  // Every receiver used to re-broadcast a chat line on first sight: N floods a
  // line, O(N) frames per node per message. The author's flood is the carrier.
  const floods = () => Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.txStats().roomFlood || 0).catch(() => 0)));
  const f0 = await floods();
  const lineId = await pages[deepIdx].evaluate(() => window.__gifosVideo.sayForTest('hello from the deep end'));
  const said = await eventually(() => Promise.all(pages.map((pg) => pg.evaluate((id) => window.__gifosVideo.chatHas(id), lineId).catch(() => false))), (v) => v.every(Boolean), 30000);
  check('a chat line from the deep end reaches every seat', said.ok, said.v);
  await sleep(6000); // long enough for any re-broadcast to have happened
  const f1 = await floods();
  const made = f1.map((x, i) => x - f0[i]);
  check('…as ONE room flood — nobody re-broadcast it (' + made.reduce((a, b) => a + b, 0) + ' floods originated)', made.reduce((a, b) => a + b, 0) === 1 && made[deepIdx] === 1, { made });

  // ---- 5c. a hostile heartbeat flood dies at its first honest neighbours ---------------
  // RULE 1: a status is heard from my section or my own link, never off the
  // room-wide flood — and what a seat refuses it does not forward.
  const refused = () => Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.rxStats().statusRefused || 0).catch(() => -1)));
  const r0 = await refused();
  const pushed = await pages[deepIdx].evaluate(() => window.__gifosVideo.floodForTest(300, 'status'));
  await sleep(8000);
  const r1 = await refused();
  const hit = r1.map((x, i) => x - r0[i]);
  const hitSeats = hit.map((x, i) => (i !== deepIdx && x > 0 ? 'P' + i : null)).filter(Boolean);
  const dcOfBad = await pages[deepIdx].evaluate(() => window.__gifosVideo.liveDataLinks());
  check('the attacker pushed ' + pushed + ' room-wide statuses; its direct neighbours refused them', hitSeats.length > 0 && hitSeats.length <= dcOfBad, { hit, dcOfBad });
  check('…and NO seat beyond them ever saw one (refused means not forwarded)', hit.filter((x, i) => i !== deepIdx && x === 0).length === N - 1 - hitSeats.length && hitSeats.length < N - 1, { hitSeats });
  const calm = await Promise.all(pages.map(sp));
  check('the room is unharmed: every seat still counts ' + N, calm.every((x) => x && x.display === N), calm.map((x) => x && x.display));

  // ---- 5d. gossip is SIGNED: nobody speaks in another's name ----------------------
  const gs = () => Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.gossipStats()).catch(() => null)));
  const g0 = await gs();
  await pages[deepIdx].evaluate((v) => window.__gifosVideo.forgeGossipForTest(v, 5), pids[0]);
  await sleep(8000);
  const g1 = await gs();
  const forgedSeen = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.chatHas('forged_0')).catch(() => null)));
  const dropsAt = g1.map((x, i) => (x && g0[i] && x.forged - g0[i].forged > 0 ? 'P' + i : null)).filter(Boolean);
  check('five chat lines forged in P0\'s name reach NOBODY', forgedSeen.every((x) => x === false), forgedSeen);
  const badLinks = await pages[deepIdx].evaluate(() => window.__gifosVideo.meshLinks());
  const linkIdx = badLinks.map((id) => 'P' + pids.indexOf(id));
  check('…dropped as forgeries at the attacker\'s mesh neighbours only (the seats it gossips to)', dropsAt.length > 0 && dropsAt.every((x) => linkIdx.includes(x)), { dropsAt, links: linkIdx });

  // ---- 5e. THE TRIPWIRE: a quiet room costs nothing that grows with it -------------
  // Twenty quiet seconds. No seat originates a room-wide flood (heartbeats are
  // section-scoped; there is nothing else to say), and no seat receives more
  // gossip frames than its section and links can send it. A future shortcut
  // that puts anything periodic back on the room-wide path trips the first
  // line; one that widens the heartbeat's scope trips the second.
  const q0 = await gs();
  await sleep(20000);
  const q1 = await gs();
  const originated = q1.map((x, i) => (x && q0[i]) ? x.roomFlood - q0[i].roomFlood : -1);
  const received = q1.map((x, i) => (x && q0[i]) ? x.inAll - q0[i].inAll : -1);
  const C = 2, beats = 20000 / 4000;
  const rxBound = Math.ceil(beats * (C * C - 1) * (2 * C - 1) * 1.5) + 20; // the harness bound per beat (C²-1)(2C-1), re-fans included, plus slack for the two DC-pulse copies and the admin-less room's own churn
  check('QUIET ROOM, 20 s: no seat originated a room-wide flood', originated.every((x) => x === 0), { originated });
  check('QUIET ROOM, 20 s: gossip frames received per seat stay under the section bound (' + rxBound + ')', received.every((x) => x >= 0 && x <= rxBound), { received, rxBound });

  // ---- 6. consent needs everyone -------------------------------------------------
  for (const pg of pages) { await pg.locator('#cam').click().catch(() => {}); await pg.evaluate(() => window.__gifosVideo.setBlur(0)).catch(() => {}); await sleep(300); }
  const consT0 = Date.now(); let cons = [], consOk = false;
  while (Date.now() - consT0 < 60000) {
    cons = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.consensus()).catch(() => null)));
    if (cons.every((c) => c === true)) { consOk = true; break; }
    await sleep(1500);
  }
  check('a fully consenting room past one section clears everywhere', consOk, { secs: Math.round((Date.now() - consT0) / 1000), cons });
  const readyLbl = await Promise.all(pages.map(sp));
  check('the fold counts zero refusals at every seat', await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { const s = await Promise.all(pages.map(sp)); if (s.every((x) => x && x.refuse === 0)) return true; await sleep(1500); } return false; })(), readyLbl.map((s) => s && s.refuse));

  // ONE refuser, deep in the tree: the whole room goes back to blurred — the
  // seats that hear it first-hand at once, every other seat when the fold
  // carries the refusal to them. The rule is the same at every size.
  await pages[deepIdx].evaluate(() => window.__gifosVideo.setBlur(2));
  const refT0 = Date.now(); let ref = [], allBlur = false;
  while (Date.now() - refT0 < 60000) {
    ref = await Promise.all(pages.map(async (pg, i) => ({ i, pc: pcs[i], c: await pg.evaluate(() => window.__gifosVideo.consensus()).catch(() => null), s: await sp(pg) })));
    allBlur = ref.every((r) => r.c === false);
    if (allBlur) break;
    await sleep(1500);
  }
  check('one refuser blurs the WHOLE room, every section', allBlur, { secs: Math.round((Date.now() - refT0) / 1000), v: ref.map((r) => 'P' + r.i + '@' + r.pc + ':' + r.c) });
  const farSeats = ref.filter((r) => r.pc !== pcs[deepIdx] && !(r.s && r.s.fresh.includes(pids[deepIdx])));
  check('…including seats that never hear the refuser first-hand (the fold carried it)', farSeats.length > 0 && farSeats.every((r) => r.c === false && r.s && r.s.refuse >= 1), farSeats.map((r) => 'P' + r.i + ' refuse=' + (r.s && r.s.refuse)));
  const lbl = await eventually(() => pages[farSeats.length ? farSeats[0].i : 0].evaluate(() => document.getElementById('status').textContent), (t) => t.indexOf('(' + (N - 1) + '/' + N + ')') >= 0, 15000); // a one-line notice ("Back to blurred…") holds the line for a few seconds first
  check('a far seat\'s status line counts the room: ' + (N - 1) + '/' + N + ' ready', lbl.ok, String(lbl.v).slice(0, 140));
  // …and the room clears again when the refuser agrees.
  await pages[deepIdx].evaluate(() => window.__gifosVideo.setBlur(0));
  const back = await (async () => { const t0 = Date.now(); let c = []; while (Date.now() - t0 < 60000) { c = await Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.consensus()).catch(() => null))); if (c.every((x) => x === true)) return { ok: true, secs: Math.round((Date.now() - t0) / 1000) }; await sleep(1500); } return { ok: false, c }; })();
  check('the room clears again once the refuser agrees', back.ok, back);

  // ---- 7. the map is bounded by the plane, not the room ------------------------
  // scale-audit V2: statusOf grew O(N). On the status plane an entry exists only
  // for a sender whose heartbeat reaches me — my section-mates and my open
  // DataChannel pairs (fanOut's viaDc) — and it expires with the holdover. Every
  // join above was long enough ago that no pre-growth room-wide entry survives.
  const fin = await Promise.all(pages.map(sp));
  const over = fin.map((x, i) => (x && x.statusN > 2 * 2 - 1 + x.dcLinks ? 'P' + i + ':' + x.statusN + '>' + (3 + x.dcLinks) : null)).filter(Boolean);
  check('every seat\'s statusOf <= C*C-1 + its open DataChannels (the V2 bound)', over.length === 0, { over, sizes: fin.map((x) => x && x.statusN) });

  // ---- 8. HISTORY RIDES THE PAIR, NOT THE ROOM --------------------------------
  // A newcomer learns the chat over its channels' 'hi' replay. That replay once
  // (a) re-flooded every learned line room-wide — a join cost O(history × N)
  // frames, 30 floods here — and (b) ran through the live per-author limiter,
  // so of 30 lines by one author the newcomer kept 20 and never saw the rest.
  const hist = [];
  for (let i = 0; i < 30; i++) hist.push(await pages[0].evaluate((t) => window.__gifosVideo.sayForTest(t), 'history line ' + i));
  const heldAll = await eventually(() => Promise.all(pages.map((pg) => pg.evaluate((ids) => ids.every((id) => window.__gifosVideo.chatHas(id)), hist).catch(() => false))), (v) => v.every(Boolean), 30000);
  check('30 lines by one author reach every seated member (the author\'s own floods)', heldAll.ok, heldAll.v);
  const h0 = await floods();
  const late = await mk(N);
  pages.push(late);
  const lateT0 = Date.now(); let lateSeated = false;
  while (Date.now() - lateT0 < 120000) {
    if (await pwModalShown(late)) { try { await late.locator('#pw-new').fill(PW); await late.locator('#pw-save').click(); } catch (e) {} }
    const s = await sp(late);
    if (s && s.coord) { lateSeated = true; break; }
    await sleep(1000);
  }
  check('an 11th seat joins the room with history', lateSeated);
  const lateHeld = await eventually(() => late.evaluate((ids) => ids.filter((id) => window.__gifosVideo.chatHas(id)).length, hist).catch(() => -1), (n) => n === 30, 45000);
  check('the newcomer holds ALL 30 lines of the history, not 20 (the replay is backfill, past the live limiter)', lateHeld.ok, { held: lateHeld.v });
  await sleep(6000); // long enough for any re-flood of the replay to have happened
  const h1 = await floods();
  const joinFloods = h1.map((x, i) => x - (h0[i] || 0));
  check('the newcomer originated NO room-wide flood for the history it learned', joinFloods[N] === 0, { joinFloods });
  check('…and no seated member re-flooded anything for the join', joinFloods.slice(0, N).every((x) => x === 0), { joinFloods });

  check('no page errors', errs.length === 0, errs.slice(0, 5));
  await browser.close();
  console.log('\n' + (failures ? failures + ' FAILED' : 'ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — crashed: ' + (e && e.stack || e)); process.exit(1); });
