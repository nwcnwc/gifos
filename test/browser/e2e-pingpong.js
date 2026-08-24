// End-to-end: seeded Ping Pong is table tennis you can actually rally.
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
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 15000 });
  await sleep(400);
  await page.locator('.icon.folder').filter({ hasText: /^Games$/ }).dblclick();
  await sleep(400);
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Ping Pong' }).first().dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 12000 });
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click({ timeout: 3000 }).catch(() =>
    app.locator('.perm-modal .done').click({ timeout: 2000 }).catch(() => {}));
  const frame = app.frames().find((f) => f !== app.mainFrame());
  await frame.waitForSelector('canvas#game', { timeout: 8000 });
  await frame.waitForFunction(() => typeof game === 'object' && typeof doServe === 'function', { timeout: 8000 });
  await sleep(400);

  const idle = await frame.evaluate(() => ({
    serving: game.serving,
    hs: game.hostScore,
    gs: game.guestScore,
    status: (document.getElementById('status') || {}).textContent || '',
    hint: (document.getElementById('hint') || {}).textContent || '',
  }));
  check('opens on your serve at 0–0', idle.serving === 'host' && idle.hs === 0 && idle.gs === 0,
    JSON.stringify(idle));
  check('status tells you to serve', /serve/i.test(idle.status) && /tap|swipe/i.test(idle.status), idle.status);
  check('hint says the paddle hits for you (not “touch the ball”)',
    /hits for you/i.test(idle.hint) && !/touch the ball/i.test(idle.hint), idle.hint);

  const rally = await frame.evaluate(async () => {
    let maxRally = 0, lastWhy = '', lastHs = 0, lastGs = 0;
    const t0 = Date.now();
    const bot = setInterval(function () {
      var x = game.bx;
      if (x > 6.9) x = 6.9;
      if (x < -6.9) x = -6.9;
      game.hostX = x;
      if (game.serving === 'host') doServe('host', 0.55, 0);
      if ((game.rally || 0) > maxRally) maxRally = game.rally || 0;
      lastWhy = game.why || '';
      lastHs = game.hostScore;
      lastGs = game.guestScore;
    }, 16);
    await new Promise((r) => setTimeout(r, 8000));
    clearInterval(bot);
    return { maxRally, lastWhy, lastHs, lastGs, t: Date.now() - t0 };
  });
  check('a tracking paddle rallies at least 6 shots vs the computer',
    rally.maxRally >= 6, JSON.stringify(rally));
  check('points can actually be scored (score moves off 0–0 or a rally is live)',
    rally.lastHs + rally.lastGs > 0 || rally.maxRally >= 6, JSON.stringify(rally));

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
