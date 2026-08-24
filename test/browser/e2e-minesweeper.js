// End-to-end: seeded Minesweeper — first-click safe, flags, win/lose, densities.
// Needs: static server on 8099.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 15000 });
  await sleep(400);
  await page.locator('.icon.folder').filter({ hasText: /^Games$/ }).dblclick();
  await sleep(400);
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Minesweeper' }).first().dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 12000 });
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click({ timeout: 3000 }).catch(() =>
    app.locator('.perm-modal .done').click({ timeout: 2000 }).catch(() => {}));
  const frame = app.frames().find((f) => f !== app.mainFrame());
  await frame.waitForSelector('#grid', { timeout: 8000 });
  await frame.waitForFunction(() => window.__mine, { timeout: 8000 });

  check('default board is Medium 10×10 / 15',
    (await frame.locator('.c').count()) === 100
    && (await frame.evaluate(() => __mine.state().n)) === 15);

  let booms = 0, opened = 0;
  for (let i = 0; i < 12; i++) {
    await frame.evaluate(() => { __mine.fresh('medium'); __mine.reveal(0); });
    const s = await frame.evaluate(() => __mine.state());
    if (s.over && !s.win) booms++;
    opened += s.rev;
  }
  check('the first tap is always safe (12 corner opens, 0 booms)', booms === 0, 'booms=' + booms + ' opened=' + opened);
  check('a first tap opens a region (neighbour-safe)', opened > 12, 'opened=' + opened);

  await frame.evaluate(() => __mine.fresh('easy'));
  check('Easy is 9×9 / 10',
    (await frame.locator('.c').count()) === 81
    && (await frame.evaluate(() => __mine.state().n)) === 10);

  await frame.evaluate(() => __mine.fresh('hard'));
  check('Hard is 16×16 / 40',
    (await frame.locator('.c').count()) === 256
    && (await frame.evaluate(() => __mine.state().n)) === 40);

  await frame.evaluate(() => __mine.fresh('expert'));
  check('Expert is 30×16 / 99',
    (await frame.locator('.c').count()) === 480
    && (await frame.evaluate(() => __mine.state().n)) === 99);

  await frame.evaluate(() => {
    __mine.fresh('medium');
    __mine.flag(3);
  });
  check('flagging a covered square plants a flag',
    (await frame.evaluate(() => __mine.state().flags)) === 1
    && (await frame.locator('.c').nth(3).textContent()) === '🚩');

  await frame.evaluate(() => {
    const mines = [0];
    const rev = [];
    for (let i = 0; i < 100; i++) rev.push(i !== 0 && i !== 1);
    __mine.load({ id: 'game', dens: 'medium', w: 10, h: 10, n: 1, mines, rev, flags: {}, over: false, win: false, t0: Date.now() - 1500, elapsed: 0 });
    __mine.reveal(1);
  });
  const won = await frame.evaluate(() => __mine.state());
  check('clearing the last safe square wins', won.over && won.win, JSON.stringify({ over: won.over, win: won.win, rev: won.rev }));
  check('a win auto-flags remaining mines', won.flags === 1, 'flags=' + won.flags);
  check('the clock freezes on a win', /Cleared in 0:0/.test(await frame.locator('#status').textContent()));

  await frame.evaluate(() => {
    __mine.load({ id: 'game', dens: 'easy', w: 9, h: 9, n: 1, mines: [4], rev: Array(81).fill(false), flags: {}, over: false, win: false, t0: Date.now(), elapsed: 0 });
    __mine.reveal(4);
  });
  const lost = await frame.evaluate(() => __mine.state());
  check('opening a mine loses', lost.over && lost.win === false && lost.hit === 4, JSON.stringify({ over: lost.over, win: lost.win, hit: lost.hit }));
  check('the face shows the boom', (await frame.locator('#face').textContent()) === '😵');

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
