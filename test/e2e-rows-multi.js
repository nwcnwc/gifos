// MULTI-SESSION ROWS K-sweep (docs/rows.md phases 2–3). Six browsers at C=2
// force TWO leaf relay sessions (a leaf seats C²=4) plus the parent space:
// the walk seats them, delegates double-home, folds and the stage cross
// sessions, chat bridges the tree, and presence counts aggregate. The same
// lines of code that ran 21/21 in one session run here across three.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const mk = async (name, scale) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0');"
      + (scale ? 'window.GIFOS_SCALE=' + JSON.stringify(scale) + ';' : '') });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [' + name + ' PAGEERROR]', e.message));
    return p;
  };
  const st = (p) => p.evaluate(() => {
    const v = window.__gifosVideo;
    return { row: v.rowNum(), myRow: v.myRow(), up: v.upOn(), tot: v.totalCount(), parts: v.participants(),
      stadium: v.stadium().map((s) => ({ row: s.row, live: s.live })) };
  });

  const room = 'multi' + Math.floor(Math.random() * 1e9).toString(36);
  const names = ['Ada', 'Ben', 'Cyd', 'Dot', 'Eli', 'Fay'];
  const pages = [];
  for (const n of names) {
    // C=2 forces the structure; the tiny fold budget keeps 12 CI browsers on
    // one CPU from turning shared-core contention into fake protocol flakes —
    // production phones each own their compositor.
    const p = await mk(n, { C: 2, COMP_W: 160, COMP_H: 90, COMP_FPS: 4 });
    await p.goto(BASE + '/meet.html#v=' + room);
    pages.push(p);
    await sleep(500); // stagger: the walk's join-order seating is under test, not its races
  }

  // ---- the walk seats a leaf at C² and spills the rest --------------------
  let seated = true;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.rowNum() >= 1 && window.__gifosVideo.participants() >= 2, null, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!ok) seated = false;
  }
  await sleep(15000); // elections, uplinks, folds, totals settle
  const states = await Promise.all(pages.map(st));
  const leafOf = states.map((s) => s.row);
  check('walk: six people at C=2 split 4 + 2 across two leaf sessions',
    seated && leafOf.filter((r) => r === 1).length === 4 && leafOf.filter((r) => r === 2).length === 2);

  // ---- presence aggregates: every phone counts the WHOLE room -------------
  let countOk = true;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => window.__gifosVideo.participants() === 6, null, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok) countOk = false;
  }
  check('presence: participants() is 6 on every phone, whichever leaf it sits in', countOk);

  // ---- delegates double-home: EVENTUALLY exactly the local-row deacons hold
  // uplinks. (Teardown hysteresis keeps a flapped ex-delegate's socket warm
  // for 15s by design, so exactness is an eventual property, polled.)
  let upsOk = false;
  for (let t = 0; t < 25 && !upsOk; t++) {
    await sleep(2000);
    const flags = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo.upOn())));
    upsOk = flags.filter(Boolean).length === 3;
  }
  check('uplinks: exactly the three local-row deacons double-home (2 from the full leaf, 1 from the spill)', upsOk);

  // ---- the stadium spans sessions: every phone sees every row but its own,
  // live — leaf 1's two rows and leaf 2's one, folded and forwarded.
  let coverOk = true;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => {
      const v = window.__gifosVideo;
      const own = (v.rowNum() - 1) * v.scale().C + v.myRow();
      const want = [1, 2, 3].filter((r) => r !== own);
      const got = v.stadium();
      return got.length === want.length && want.every((r) => got.some((s) => s.row === r && s.live));
    }, null, { timeout: 40000 }).then(() => true).catch(() => false);
    if (!ok) coverOk = false;
  }
  check('stadium: every phone shows every global row but its own, LIVE, across sessions', coverOk);

  // ---- chat bridges the tree ----------------------------------------------
  await pages[0].locator('#chatbtn').click();
  await pages[0].locator('#chat-in').fill('one room, many sessions');
  await pages[0].locator('#chatform button[type=submit]').click();
  let chatOk = true;
  for (const p of pages) {
    const got = await p.waitForFunction(() => window.__gifosVideo.chatTexts().includes('one room, many sessions'), null, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!got) chatOk = false;
  }
  check('chat: a line from leaf 1 reaches every phone in every leaf (delegate bridge, deduped)', chatOk);

  // ---- the hand queue folds up the tree ------------------------------------
  const statesH = await Promise.all(pages.map(st));
  const hIdx = statesH.findIndex((s) => s.row === 2);
  await pages[hIdx].evaluate(() => window.__gifosVideo.raiseHand(true));
  let hqOk = true;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => window.__gifosVideo.handQueue().length === 1 && window.__gifosVideo.handqShown(), null, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!ok) hqOk = false;
  }
  check('hands: a raise in the spill leaf reaches every phone as ONE ordered queue', hqOk);
  await pages[hIdx].evaluate(() => window.__gifosVideo.raiseHand(false));
  let hqClear = true;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => window.__gifosVideo.handQueue().length === 0, null, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!ok) hqClear = false;
  }
  check('hands: lowering clears the queue everywhere (entries expire unless re-asserted)', hqClear);

  // ---- zoom = pick your depth (a folded row grows on tap) ------------------
  const zoomOk = await pages[0].evaluate(() => {
    const v = window.__gifosVideo;
    const s = v.stadium()[0];
    if (!s) return false;
    const grew = v.zoomRow(s.row);
    const back = !v.zoomRow(s.row);
    return grew && back;
  });
  check('zoom: a stadium tile grows on tap and hands the space back on the next', zoomOk);

  // ---- the stage crosses sessions -----------------------------------------
  const states2 = await Promise.all(pages.map(st)); // fresh: lingers have settled
  const spillIdx = states2.findIndex((s) => s.row === 2 && !s.up); // a plain member of leaf 2
  const stagePage = pages[spillIdx >= 0 ? spillIdx : states2.findIndex((s) => s.row === 2)];
  await stagePage.evaluate(() => window.__gifosVideo.setStageForTest(true));
  let stageOk = true;
  for (const [i, p] of pages.entries()) {
    if (p === stagePage) continue;
    const sameLeaf = states2[i].row === 2;
    const ok = await p.waitForFunction((sl) => {
      const v = window.__gifosVideo;
      if (sl) return v.stageIds().length === 1; // leaf mates see them on row 0 directly
      return v.stadium().some((s) => String(s.row).indexOf('s:') === 0 && s.live);
    }, sameLeaf, { timeout: 60000 }).then(() => true).catch(() => false);
    if (!ok) stageOk = false;
  }
  check('stage: a spill-leaf member steps up and reaches the OTHER session as a live stage tile', stageOk);
  await stagePage.evaluate(() => window.__gifosVideo.setStageForTest(false));
  let downOk = true;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => {
      const v = window.__gifosVideo;
      return v.stageIds().length === 0 && !v.stadium().some((s) => String(s.row).indexOf('s:') === 0);
    }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!ok) downOk = false;
  }
  check('stage: stepping down clears row 0 in every session', downOk);

  // ---- a delegate dies: its leaf re-elects, the new delegate double-homes,
  // and the stadium heals across sessions.
  const states3 = await Promise.all(pages.map(st)); // fresh again: pick a REAL current delegate
  const deadIdx = states3.findIndex((s) => s.row === 1 && s.up);
  await pages[deadIdx].close();
  const alive = pages.filter((_, i) => i !== deadIdx);
  let healOk = true;
  for (const p of alive) {
    const ok = await p.waitForFunction(() => {
      const v = window.__gifosVideo;
      const own = (v.rowNum() - 1) * v.scale().C + v.myRow();
      const want = [1, 2, 3].filter((r) => r !== own);
      const got = v.stadium();
      return v.participants() === 5 && got.length === want.length && want.every((r) => got.some((s) => s.row === r && s.live));
    }, null, { timeout: 90000 }).then(() => true).catch(() => false);
    if (!ok) healOk = false;
  }
  check('a dead delegate: the leaf re-elects, the new delegate double-homes, the stadium heals everywhere (and the count follows)', healOk);
  for (const p of alive) await p.close();

  // ---- K=∞ identity: a small room never opens an uplink -------------------
  const room2 = 'multident' + Math.floor(Math.random() * 1e9).toString(36);
  const pages2 = [];
  for (const n of ['Gil', 'Hal']) { const p = await mk(n); await p.goto(BASE + '/meet.html#v=' + room2); pages2.push(p); }
  for (const p of pages2) await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.participants() >= 2, null, { timeout: 25000 });
  await sleep(6000);
  const ident = await Promise.all(pages2.map((p) => p.evaluate(() => {
    const v = window.__gifosVideo;
    return v.rowNum() === 1 && !v.upOn() && v.stadium().length === 0 && v.participants() === 2;
  })));
  check('K=∞ identity: a small room is one session, no uplink, no stadium — today\'s meeting untouched', ident.every(Boolean));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
