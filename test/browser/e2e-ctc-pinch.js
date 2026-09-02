// Catch the Cat: a pinch zooms the board; a tap stays the game's.
//
// The board OWNS its gestures now (view.js): one finger turns the plate, two
// fingers pinch it, and a pointer that never moved past SLOP is a tap on the
// hex pad under it. That is the opposite of the previous design, where the
// board was a Phaser canvas and the fix was to hand the pinch BACK to the
// browser (`touch-action: pinch-zoom`, Phaser's touch capture off). Both
// halves of that guard now describe a mechanism that no longer exists — the
// canvas is a hidden engine with its loop stopped — so this suite guards the
// three things the new design must keep true:
//   1. #stage declares `touch-action: none`: the browser is told the app takes
//      every touch, so a two-finger gesture reaches view.js instead of
//      page-zooming a screen that cannot scroll anyway.
//   2. Two pointers moving apart ZOOM the view (GifCat.view.state().zoom
//      grows), and neither of them counts as a tap (#clicks unchanged) — a
//      second finger must never wall a dot.
//   3. A single pointer down/up on a hex pad still walls it.
//
// The fingers are REAL touches: CDP Input.dispatchTouchEvent with two touch
// points, which Chromium turns into the pointer events view.js listens for
// (with ids it will setPointerCapture — a synthetic PointerEvent has no active
// pointer behind it and that call throws). e2e-icon-lock's gestureSourceType
// 'touch' finding is about synthesized SCROLL gestures; touch points move fine.
//
// Needs: nothing — spawns its own static server over apps/catch-the-cat
// (the app SOURCE; the committed GIF is the signed build of exactly these
// files, and the suite must not depend on a rebuild that needs the sign key).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const DIR = path.join(__dirname, '..', '..', 'apps', 'catch-the-cat');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

(async () => {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(DIR, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(p.endsWith(path.sep) || p === DIR ? path.join(DIR, 'index.html') : p, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ hasTouch: true, viewport: { width: 412, height: 900 } });
  page.on('pageerror', (e) => console.log('  [ctc] ' + e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.GifCat && window.GifCat.rules && window.GifCat.view && document.querySelector('.cell .hit') && document.querySelector('.cat'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  check('the game boots solo from source (board up)', true);

  // ---- 1. the stage takes every touch ---------------------------------------
  const ta = await page.evaluate(() => getComputedStyle(document.getElementById('stage')).touchAction);
  check('#stage declares touch-action: none (the app owns the pinch and the turn)', ta === 'none', ta);

  // ---- 2. two fingers pinch — and neither is a tap ---------------------------
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) });
  const before = await page.evaluate(() => ({ zoom: window.GifCat.view.state().zoom, clicks: window.GifCat.rules.clicks() }));
  // Both fingers land ON hex pads — the strictest case: a pad under a finger
  // is exactly what must not read as a tap once a second finger is down.
  const [A, B] = await page.evaluate(() => {
    const pads = [...document.querySelectorAll('.cell .hit')].filter((h) => !window.GifCat.rules.isWall(+h.dataset.i, +h.dataset.j));
    const c = (h) => { const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    return [c(pads[Math.floor(pads.length * 0.3)]), c(pads[Math.floor(pads.length * 0.7)])];
  });
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  await touch('touchStart', [A, B]);
  for (let s = 1; s <= 8; s++) {
    await touch('touchMove', [{ x: A.x - ux * 5 * s, y: A.y - uy * 5 * s }, { x: B.x + ux * 5 * s, y: B.y + uy * 5 * s }]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ zoom: window.GifCat.view.state().zoom, clicks: window.GifCat.rules.clicks() }));
  check('two fingers spreading apart zoom the board in', after.zoom > before.zoom * 1.05, { was: before.zoom, now: after.zoom });
  check('…and neither finger walls a dot (a second finger is never a tap)', after.clicks === before.clicks, { before: before.clicks, after: after.clicks });

  // ---- 3. one finger down and up on a pad is still a tap ---------------------
  const pad = await page.evaluate(() => {
    const R = window.GifCat.rules, E = window.GifCat.engine, me = R.myCat();
    // neither wall nor cat, and not on the rim (the cat must not escape on this
    // one tap — that would end the board, not just wall a dot)
    const h = [...document.querySelectorAll('.cell .hit')].find((h) => {
      const i = +h.dataset.i, j = +h.dataset.j;
      return !R.isWall(i, j) && !(i === me.i && j === me.j) && !E.onRim(i, j);
    });
    const r = h.getBoundingClientRect();
    return { i: +h.dataset.i, j: +h.dataset.j, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(pad.x, pad.y);
  await page.waitForTimeout(300);
  const tapped = await page.evaluate(([i, j]) => ({ clicks: window.GifCat.rules.clicks(), walled: window.GifCat.rules.isWall(i, j) }), [pad.i, pad.j]);
  check('a single-finger touch tap on a hex pad still walls it (the game lost nothing)', tapped.walled && tapped.clicks === after.clicks + 1, tapped);
  const shown = await page.evaluate(() => (document.getElementById('clicks').textContent || '').trim());
  check('…and the tap counter shows it', /^1\b/.test(shown), shown);

  await browser.close();
  srv.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — suite crashed: ' + e.message); process.exit(1); });
