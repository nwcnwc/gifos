/*
 * Capture screenshot.png — the store master. App frame only (no run.html
 * toolbar), so listing.json does not need coverCrop.
 *
 * Mid-test: serika-dark, lowercase common words, yellow caret after "on",
 * live timer + WPM. Monkeytype.coverShot paints that through the REAL
 * render path. Distinct from apps/typing's pixel-font passage.
 *
 *   python3 -m http.server 8765 -d apps/monkeytype
 *   node apps/monkeytype/tools/shoot.js
 */
const { chromium, CHROME } = require('../../../test/lib/pw');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const DIR = path.join(__dirname, '..');
const OUT = path.join(DIR, 'screenshot.png');
const PORT = process.env.SHOT_PORT || '18765';
const BASE = process.env.BASE || ('http://127.0.0.1:' + PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ping() {
  return new Promise((resolve) => {
    const req = http.get(BASE + '/', (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  let child = null;
  if (!(await ping())) {
    child = spawn('python3', ['-m', 'http.server', String(PORT), '-d', DIR], {
      stdio: 'ignore'
    });
    for (let i = 0; i < 40 && !(await ping()); i++) await sleep(50);
    if (!(await ping())) throw new Error('could not start http.server on ' + PORT);
  }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 720 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Monkeytype && window.Monkeytype.coverShot && document.getElementById('words'), null, { timeout: 20000 });
    const info = await page.evaluate(() => window.Monkeytype.coverShot());
    await page.waitForFunction(() => {
      const live = document.getElementById('live');
      const wpm = document.getElementById('liveWpm');
      const caret = document.getElementById('caret');
      const words = document.getElementById('words');
      return live && !live.hidden && wpm && wpm.textContent !== '-' &&
        caret && !caret.hidden && words && /on/.test(words.textContent || '');
    }, null, { timeout: 8000 });
    await sleep(200);
    await page.screenshot({ path: OUT });
    console.log('wrote ' + path.relative(process.cwd(), OUT), info);
  } finally {
    await browser.close();
    if (child) child.kill('SIGTERM');
  }
})().catch((e) => { console.error(e); process.exit(1); });
