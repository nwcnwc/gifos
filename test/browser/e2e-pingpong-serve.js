// End-to-end: the Ping Pong serve is a stroke, not a free point — and the
// buttons answer a finger.
//
// Two defects, both found by people playing rather than by reading code:
//
//  - A soft tap pitched so short that the ball died before any receiver,
//    standing as far forward as anyone is allowed to stand, could reach it:
//    EIGHT serves out of eight were unreturnable. Because serves alternate one
//    at a time from 10-10, the gap could never reach two and a match could not
//    end. One reached 57-56 and was still climbing.
//  - The computer read the serve's first bounce, which is on the SERVER's own
//    half, and positioned itself for a ball that was never coming.
//  - "New game" was a painted button on every phone: a finger's tap on it was
//    retargeted to the canvas underneath. With a mouse it always worked, so no
//    desktop suite could have seen it.
//
// It runs on its OWN page on purpose. Driving a serve from a page that has
// already been played with leaves a hover pointer and a match in progress, and
// the state it produces is not a serve anybody would make.
//
// Needs: static server on 8099.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openGame(context) {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(400);
  await page.locator('.icon.folder').filter({ hasText: /^Games$/ }).dblclick();
  await sleep(400);
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Ping Pong' }).first().dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 15000 });
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click({ timeout: 3000 }).catch(() =>
    app.locator('.perm-modal .done').click({ timeout: 2000 }).catch(() => {}));
  const frame = app.frames().find((f) => f !== app.mainFrame());
  await frame.waitForSelector('canvas#game', { timeout: 10000 });
  await frame.waitForFunction(() => typeof game === 'object' && typeof doServe === 'function', { timeout: 10000 });
  await sleep(400);
  return { page, app, frame };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  // ---- a serve has to be answerable ---------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
  const solo = await openGame(ctx);
  const serves = await solo.frame.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      let guard = 0;
      while ((!game.serving || Date.now() < freezeUntil) && guard++ < 120) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (game.serving !== 'host') { await new Promise((r) => setTimeout(r, 500)); continue; }
      // Every stance, from as far back as you may stand to as far forward, and
      // every kind of gesture: a poke, a hard swipe, a flick up, a flick down.
      game.hostY = clampY(HOST_MIN + (i % 5) * (STEP_IN - HOST_MIN) / 4, true);
      game.hostX = 0;
      const pt0 = game.pt, lets0 = game.lets || 0, t0 = Date.now();
      doServe('host', 0.25 + (i % 4) * 0.22, ((i % 3) - 1) * 40, ((i % 3) - 1) * 40);
      while (game.pt === pt0 && (game.lets || 0) === lets0 && Date.now() - t0 < 3600) {
        await new Promise((r) => setTimeout(r, 40));
      }
      out.push({ rally: game.rally, why: game.why, to: game.msgWho, lt: (game.lets || 0) !== lets0 });
    }
    return out;
  });
  const played = serves.filter((v) => !v.lt);
  const aces = played.filter((v) => v.to === 'host' && v.rally <= 1).length;
  check('a serve is not a free point — the receiver gets to most of them',
    played.length >= 4 && aces / played.length <= 0.4,
    aces + ' of ' + played.length + ' untouched: ' + JSON.stringify(serves));
  check('a serve that is returned starts a rally',
    played.some((v) => v.rally >= 2), JSON.stringify(played.map((v) => v.rally)));
  await solo.app.close();
  await ctx.close();

  // ---- the buttons answer a finger ----------------------------------------
  const tCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const t = await openGame(tCtx);
  await t.frame.evaluate(() => { game.hostScore = 4; game.guestScore = 6; pushGame(); });
  await sleep(500);
  await t.app.frameLocator('iframe').locator('#reset').tap();
  await sleep(800);
  const afterTap = await t.frame.evaluate(() => ({ hs: game.hostScore, gs: game.guestScore }));
  check('New game answers a finger, not only a mouse',
    afterTap.hs === 0 && afterTap.gs === 0, JSON.stringify(afterTap));

  await t.app.frameLocator('iframe').locator('#howto').tap();
  await sleep(600);
  const rules = await t.frame.evaluate(() => ({
    on: document.getElementById('rules').classList.contains('on'),
    txt: document.getElementById('rules').textContent,
  }));
  check('the ? opens something that teaches the game, not the same one-liner',
    rules.on === true && /where you take the ball/i.test(rules.txt) && /behind you/i.test(rules.txt)
      && /first to 11/i.test(rules.txt),
    JSON.stringify({ on: rules.on, chars: rules.txt.length }));

  await t.app.frameLocator('iframe').locator('#rulesClose').tap();
  await sleep(500);
  const closed = await t.frame.evaluate(() => document.getElementById('rules').classList.contains('on'));
  check('and closes again under a finger', closed === false);

  await t.app.close();
  await tCtx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
