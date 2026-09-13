// End-to-end: seeded Ping Pong is table tennis you can actually rally, played
// in three dimensions, on a clock that does not lie.
//
// Every check here guards a defect that shipped:
//  - the paddle was pinned to a constant y (hostY/guestY re-assigned to the
//    home constant three times a tick), so the game under the perspective was
//    2-D Pong. A vertical drag must move the paddle up and back the table.
//  - the host adopted its own db.put echo, which rewound the ball: a served
//    ball bounced twice on its own half and the SERVER lost the point. A serve
//    must stay served.
//  - physics ran on clamp(now - lastNow, 8, 48) off a setInterval, so under
//    load the whole game ran at 40% speed. Simulated time must track the wall.
//  - the arena, floor and net mesh were redrawn every frame (19 fps measured
//    against 60 on an empty page). They are static bitmaps now; a frame must
//    not repaint them.
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
  await sleep(500);

  // ---- opening state -------------------------------------------------------
  const idle = await frame.evaluate(() => ({
    serving: game.serving,
    hs: game.hostScore,
    gs: game.guestScore,
    status: (document.getElementById('status') || {}).textContent || '',
    hint: (document.getElementById('hint') || {}).textContent || '',
    board: (document.getElementById('board') || {}).textContent || '',
  }));
  check('opens on your serve at 0–0', idle.serving === 'host' && idle.hs === 0 && idle.gs === 0, JSON.stringify(idle));
  check('status tells you to serve', /serve/i.test(idle.status) && /tap|swipe/i.test(idle.status), idle.status);
  check('hint says the paddle hits for you (not “touch the ball”)',
    /hits for you/i.test(idle.hint) && !/touch the ball/i.test(idle.hint), idle.hint);
  check('the hint teaches the second axis, not just side to side',
    /up the table|toward the net|depth|forward/i.test(idle.hint), idle.hint);
  check('a scoreboard is on screen that a paddle cannot park on top of',
    /0/.test(idle.board), JSON.stringify(idle.board));

  // ---- THE PADDLE MOVES IN THREE DIMENSIONS --------------------------------
  // A real vertical drag, through the same pointer path a finger takes.
  const box = await app.locator('iframe').boundingBox();
  const cx = box.x + box.width / 2;
  const depth = async (yFrac) => {
    await app.mouse.move(cx, box.y + box.height * yFrac, { steps: 6 });
    await sleep(120);
    return frame.evaluate(() => ({ y: game.hostY, x: game.hostX, z: game.hostZ }));
  };
  await app.mouse.move(cx, box.y + box.height * 0.95);
  await app.mouse.down();
  const back = await depth(0.95);
  const mid = await depth(0.72);
  const fwd = await depth(0.45);
  await app.mouse.move(cx + box.width * 0.22, box.y + box.height * 0.72, { steps: 6 });
  await sleep(120);
  const side = await frame.evaluate(() => ({ y: game.hostY, x: game.hostX }));
  await app.mouse.up();

  check('dragging up the screen walks the paddle up the table',
    fwd.y > mid.y + 0.4 && mid.y > back.y + 0.4,
    'back=' + back.y.toFixed(2) + ' mid=' + mid.y.toFixed(2) + ' fwd=' + fwd.y.toFixed(2));
  check('the reach spans at least half a metre of table',
    fwd.y - back.y >= 5, 'span=' + (fwd.y - back.y).toFixed(2) + ' dm');
  check('the depth band reaches the bottom of the screen (a thumb rests low)',
    back.y <= -3.4, 'y at 95% down the screen = ' + back.y.toFixed(2));
  check('across and along are independent axes',
    Math.abs(side.x - fwd.x) > 1 && Math.abs(side.y - mid.y) < 0.6,
    'x moved ' + (side.x - fwd.x).toFixed(2) + ' while y moved ' + (side.y - mid.y).toFixed(2));

  // ---- a serve stays served ------------------------------------------------
  const serve = await frame.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      while (!game.serving || Date.now() < freezeUntil) await new Promise((r) => setTimeout(r, 60));
      const who = game.serving;
      const pt0 = game.pt, lets0 = game.lets || 0;
      doServe(who, 0.55, 0, -30);
      const served = game.serving === null;
      const t0 = Date.now();
      let resurrected = false;
      while (Date.now() - t0 < 400) {
        await new Promise((r) => setTimeout(r, 25));
        // Coming back to "serving" without a point having been scored means the
        // serve was undone by a stale record, not played.
        // A net-cord serve is a let and is deliberately replayed; that is not
        // the same thing as a serve being undone.
        if (game.serving === who && game.pt === pt0 && (game.lets || 0) === lets0) resurrected = true;
      }
      out.push({ who, served, resurrected });
    }
    return out;
  });
  check('a served ball is never un-served by a stale echo of the host’s own write',
    serve.every((s) => s.served && !s.resurrected), JSON.stringify(serve));

  // ---- the clock -----------------------------------------------------------
  const clock = await frame.evaluate(async () => {
    const s0 = timeSimmed, d0 = timeDropped, t0 = Date.now();
    await new Promise((r) => setTimeout(r, 4000));
    return { real: Date.now() - t0, sim: Math.round(timeSimmed - s0), dropped: Math.round(timeDropped - d0) };
  });
  // Time is either simulated or explicitly refused (a frame so late that
  // catching up would teleport the ball). What must never happen is time
  // vanishing into a clamp, which is how the whole game ran at 40% speed.
  const accounted = (clock.sim + clock.dropped) / clock.real;
  check('no simulated time vanishes into a clamp',
    accounted > 0.9 && accounted < 1.12,
    'sim ' + clock.sim + ' + dropped ' + clock.dropped + ' of ' + clock.real + 'ms = ' + accounted.toFixed(3));

  // ---- the hall is painted once, not sixty times a second ------------------
  const paints = await frame.evaluate(async () => {
    let arena = 0, table = 0, frames = 0;
    const oa = window.drawArena, ot = window.drawTable, orr = window.render;
    window.drawArena = function () { arena++; return oa.apply(this, arguments); };
    window.drawTable = function () { table++; return ot.apply(this, arguments); };
    window.render = function () { frames++; return orr.apply(this, arguments); };
    await new Promise((r) => setTimeout(r, 1500));
    window.drawArena = oa; window.drawTable = ot; window.render = orr;
    return { arena, table, frames };
  });
  check('a drawn frame does not repaint the hall or the table',
    paints.frames > 10 && paints.arena === 0 && paints.table === 0, JSON.stringify(paints));

  // ---- it plays, through the real control path -----------------------------
  // The paddle is driven by MOVING THE MOUSE, not by writing game.hostX: the
  // whole point is that a finger position becomes a place on the table in two
  // axes. Poking the state would test the physics and skip the game.
  await frame.evaluate(() => { window._pp = { max: 0, ends: [], pt: game.pt }; });
  const watch = () => frame.evaluate(() => {
    if ((game.rally || 0) > _pp.max) _pp.max = game.rally;
    if (game.pt !== _pp.pt) { _pp.pt = game.pt; _pp.ends.push({ to: game.msgWho, why: game.why }); }
    if (game.serving === 'host') return { serve: true };
    if (game.vy >= 0 || game.paused) return { sx: CX, sy: padBot - 12 };
    // where the ball will arrive, and how far up the table to stand for it
    const r = fly(game.hostY, false);
    const land = fly(null, true);
    const vy = clamp(land.bounced ? land.y * 0.5 - 1.2 : 0, HOST_MIN, STEP_IN);
    const f = (STEP_IN - vy) / (STEP_IN - HOST_MIN);
    const s = scaleAt(vy);
    return { sx: CX + clampX(r.x) * s * K, sy: padTop + f * (padBot - padTop) };
  });
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const t = await watch();
    if (t.serve) {
      await app.mouse.down();
      await sleep(40);
      await app.mouse.up();
      await sleep(60);
    } else {
      await app.mouse.move(box.x + t.sx, box.y + t.sy);
    }
  }
  const rally = await frame.evaluate(() => ({
    maxRally: _pp.max, ends: _pp.ends, hs: game.hostScore, gs: game.guestScore,
  }));
  check('a tracking paddle rallies at least 6 shots against the computer',
    rally.maxRally >= 6, JSON.stringify({ maxRally: rally.maxRally, hs: rally.hs, gs: rally.gs }));
  check('points are actually scored', rally.ends.length >= 2, rally.ends.length + ' points');
  check('both players can win a point (the game is not one-sided by construction)',
    rally.ends.some((e) => e.to === 'host') && rally.ends.some((e) => e.to === 'guest'),
    JSON.stringify(rally.ends.slice(0, 12)));
  check('every point has a stated reason',
    rally.ends.every((e) => e.why), JSON.stringify(rally.ends.slice(0, 12)));

  // ---- the match survives being closed -------------------------------------
  // Hold the ball first, so the score cannot move between reading it and
  // closing the window.
  const before = await frame.evaluate(() => {
    freezeUntil = Date.now() + 9e5;
    return { hs: game.hostScore, gs: game.guestScore };
  });
  await sleep(600);
  await app.close();
  await sleep(700);
  const [app2] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Ping Pong' }).first().dblclick(),
  ]);
  await app2.waitForSelector('iframe', { timeout: 12000 });
  await app2.locator('.perm-box .done', { hasText: 'Confirm' }).click({ timeout: 3000 }).catch(() =>
    app2.locator('.perm-modal .done').click({ timeout: 2000 }).catch(() => {}));
  const frame2 = app2.frames().find((f) => f !== app2.mainFrame());
  await frame2.waitForSelector('canvas#game', { timeout: 8000 });
  const after = await frame2.evaluate(async () => {
    // Hold the ball before reading, or the computer scores while we are still
    // waiting for the banner and the comparison measures the wrong instant.
    freezeUntil = Date.now() + 9e5;
    const hs = game.hostScore, gs = game.guestScore;
    let banner = '';
    for (let i = 0; i < 30; i++) {
      const t = (document.getElementById('bt') || {}).textContent || '';
      if (/still/i.test(t)) { banner = t; break; }
      if (t && !banner) banner = t;
      await new Promise((r) => setTimeout(r, 60));
    }
    return { hs, gs, banner };
  });
  check('closing and reopening comes back to the same match',
    after.hs === before.hs && after.gs === before.gs && before.hs + before.gs > 0,
    JSON.stringify({ before, after }));
  check('and says so, instead of replaying the title card',
    before.hs + before.gs === 0 || /still/i.test(after.banner), JSON.stringify(after.banner));

  await app2.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
