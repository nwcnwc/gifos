// DEPTH-3 K-sweep (docs/rows.md phase 3): the recursion for real. Ten
// browsers at C=2 make three leaves (4+4+2); their five delegates outgrow
// the first parent space (seats C²=4), so the fifth walks to 'u2' — and the
// deacons among the delegates meet in 'uu', swapping FOLDS OF FOLDS. Every
// phone still shows the whole room: its own branch's rows individually,
// foreign branches as one folded tile each, one count, one chat, one queue.
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
  const room = 'deep' + Math.floor(Math.random() * 1e9).toString(36);
  const names = ['Ada', 'Ben', 'Cyd', 'Dot', 'Eli', 'Fay', 'Gil', 'Hal', 'Ivy', 'Jem'];
  const pages = [];
  for (const n of names) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + n + "');localStorage.setItem('gifos_meet_bar','0');window.GIFOS_SCALE={C:2,COMP_W:160,COMP_H:90,COMP_FPS:4};" });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [' + n + ' PAGEERROR]', e.message));
    pages.push(p);
    await p.goto(BASE + '/meet.html#v=' + room);
    await sleep(600);
  }
  const st = (p) => p.evaluate(() => {
    const v = window.__gifosVideo;
    return { row: v.rowNum(), myRow: v.myRow(), up: v.upOn(), upNum: v.upNum(), up2: v.up2On(), parts: v.participants(),
      stadium: v.stadium().map((s) => ({ row: s.row, live: s.live, cnt: s.cnt })) };
  });

  // ---- the walk stacks three leaves ----------------------------------------
  await sleep(20000);
  const s0 = await Promise.all(pages.map(st));
  const leaves = s0.map((s) => s.row);
  check('walk: ten people at C=2 stack into leaves of 4+4+2',
    leaves.filter((r) => r === 1).length === 4 && leaves.filter((r) => r === 2).length === 4 && leaves.filter((r) => r === 3).length === 2);

  // ---- the recursion: delegates outgrow 'u', one walks, deacons meet in 'uu'
  let liftOk = false;
  for (let t = 0; t < 45 && !liftOk; t++) {
    await sleep(2000);
    const s = await Promise.all(pages.map(st));
    const ups = s.filter((x) => x.up).length;
    const up2s = s.filter((x) => x.up2).length;
    const walked = s.some((x) => x.up && x.upNum > 1);
    liftOk = ups === 5 && up2s >= 2 && walked;
  }
  check('recursion: five delegates double-home, the parent space splits, and level-2 delegates meet in uu', liftOk);

  // All ten phones wait IN PARALLEL — serial 90s budgets would outrun any
  // sane suite timeout long before the tree is done converging.
  const allWait = async (fn, arg, ms) =>
    (await Promise.all(pages.map((p) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true).catch(() => false)))).every(Boolean);

  // ---- presence: one number for the whole room, three sessions deep --------
  check('presence: participants() is 10 on every phone across three leaves and two branches',
    await allWait(() => window.__gifosVideo.participants() === 10, null, 150000));

  // ---- the stadium at depth: own-branch rows individually (there may be
  // none — a lone-row branch sees everything else as branches), foreign
  // branches as one live folded tile each.
  const stadiumOk = await allWait(() => {
    const v = window.__gifosVideo;
    const got = v.stadium();
    const numerics = got.filter((s) => typeof s.row === 'number');
    const branches = got.filter((s) => String(s.row).indexOf('b:') === 0);
    return numerics.every((s) => s.live) && branches.length >= 1 && branches.every((s) => s.live);
  }, null, 120000);
  check('stadium: every phone holds its branch\'s rows AND a live folded tile per foreign branch', stadiumOk);
  if (!stadiumOk) { // autopsy: which phone, which hop
    for (const [i, p] of pages.entries()) {
      console.log('  [autopsy] ' + names[i], JSON.stringify(await p.evaluate(() => {
        const v = window.__gifosVideo;
        return { row: v.rowNum(), up: v.upOn(), upN: v.upNum(), up2: v.up2On(), b: v.branchActive(),
          stad: v.stadium().map((s) => String(s.row) + (s.live ? '+' : '-') + '@' + String(s.via).slice(0, 6)),
          deep: v.deepState(), fwd: v.compFwdKeys(), log: v.compLog().slice(-6) };
      })));
    }
  }

  // ---- one chat across three sessions and two branches ---------------------
  await pages[0].locator('#chatbtn').click();
  await pages[0].locator('#chat-in').fill('to the last row of the stadium');
  await pages[0].locator('#chatform button[type=submit]').click();
  check('chat: one line reaches all ten phones through the delegate tree',
    await allWait(() => window.__gifosVideo.chatTexts().includes('to the last row of the stadium'), null, 40000));

  // ---- one hand queue across branches --------------------------------------
  const s1 = await Promise.all(pages.map(st));
  const spillIdx = s1.findIndex((s) => s.row === 3);
  await pages[spillIdx].evaluate(() => window.__gifosVideo.raiseHand(true));
  check('hands: a raise in the far leaf reaches all ten phones as one queue (branch authority)',
    await allWait(() => window.__gifosVideo.handQueue().length === 1, null, 60000));
  await pages[spillIdx].evaluate(() => window.__gifosVideo.raiseHand(false));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
