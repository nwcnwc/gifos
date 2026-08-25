// Catch the Cat: a pinch must reach the browser; a tap must stay the game's.
//
// The board eats its own touches by design — but it used to eat ALL of them
// (`touch-action: none` + Phaser's touch capture preventDefault()ing every
// touchstart), which made the one page a phone user cannot zoom the one page
// whose dots run small. The fix is two halves, and BOTH are load-bearing:
//   - style.css opens `touch-action: pinch-zoom` on #board AND (!important,
//     because Phaser stamps `touch-action:none` inline at boot) on the canvas;
//   - boot.js clears Phaser's touch capture so its touchstart listener stops
//     preventDefault()ing the gesture that touch-action just allowed.
// Either half alone leaves pinch dead, so both are asserted separately.
//
// A DELIBERATE MECHANISM TEST, not a gesture test: headless Chromium cannot
// synthesize a real touch pinch (see e2e-icon-lock — gestureSourceType
// 'touch' moves nothing), so this guards what the browser consults to allow
// one (effective touch-action, defaultPrevented) and then proves a
// single-finger touch tap still plays the game.
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
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

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
  await page.waitForSelector('#board canvas', { timeout: 30000 });
  check('the game boots solo from source (canvas up)', true);

  // ---- half one: touch-action opens exactly the pinch, nothing else --------
  const ta = await page.evaluate(() => {
    const board = document.getElementById('board');
    const canvas = board.querySelector('canvas');
    return {
      board: getComputedStyle(board).touchAction,
      canvas: getComputedStyle(canvas).touchAction,
      inline: canvas.style.touchAction || '(none set)',
    };
  });
  check('#board declares touch-action: pinch-zoom (two fingers zoom, one finger stays a tap)',
    ta.board === 'pinch-zoom', ta.board);
  check('…and so does the canvas, OUT-RANKING the touch-action Phaser stamps inline',
    ta.canvas === 'pinch-zoom', 'computed ' + ta.canvas + ', inline ' + ta.inline);

  // ---- half two: Phaser no longer preventDefault()s the gesture's opening --
  // A two-finger touchstart on the canvas is the first thing the browser sees
  // of a pinch; if any listener cancels it, touch-action never gets a say.
  const prevented = await page.evaluate(() => {
    const c = document.querySelector('#board canvas');
    const r = c.getBoundingClientRect();
    const mk = (id, x, y) => new Touch({ identifier: id, target: c, clientX: r.x + x, clientY: r.y + y });
    const fingers = [mk(1, 40, 40), mk(2, 120, 120)];
    const ev = new TouchEvent('touchstart', { cancelable: true, bubbles: true, touches: fingers, targetTouches: fingers, changedTouches: fingers });
    c.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  check('a two-finger touchstart on the canvas is NOT preventDefault()ed (Phaser capture is off)', prevented === false);

  // ---- and the game still plays by touch -----------------------------------
  // Walk a few board positions until a tap lands on an open dot (a miss — a
  // gap, the cat, a pre-scattered wall — moves nothing and counts nothing).
  const box = await page.locator('#board canvas').boundingBox();
  const spots = [[0.2, 0.25], [0.8, 0.3], [0.25, 0.75], [0.75, 0.7], [0.5, 0.2], [0.3, 0.5]];
  let taps = '0';
  for (const [fx, fy] of spots) {
    await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(250);
    taps = await page.evaluate(() => (document.getElementById('clicks').textContent || '').trim());
    if (!/^0 /.test(taps)) break;
  }
  check('a single-finger touch tap still walls a dot (the game lost nothing)', /^[1-9]/.test(taps), taps);

  await browser.close();
  srv.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — suite crashed: ' + e.message); process.exit(1); });
