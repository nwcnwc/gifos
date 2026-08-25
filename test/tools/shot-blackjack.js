// Screenshot the Blackjack app mid-hand, for apps/blackjack/screenshot.png.
// Runs the app standalone (no window.gifos → solo table), deals until the
// hand is a plain hit/stand/double decision, then shoots 1200×720.
const { chromium, CHROME } = require('../lib/pw');
const { spawn } = require('child_process');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'apps', 'blackjack');
const OUT = path.join(DIR, 'screenshot.png');
const PORT = 8123;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '-d', DIR], { stdio: 'ignore' });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1200, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let ok = false;
  for (let tries = 0; tries < 40 && !ok; tries++) {
    await page.goto('http://127.0.0.1:' + PORT + '/index.html');
    await page.waitForSelector('#deal');
    await page.click('#deal');
    await sleep(250);
    const msg = (await page.textContent('#msg')) || '';
    const you = (await page.textContent('#pHands')) || '';
    const total = Number((you.match(/You\s*(\d+)/) || [])[1]);
    ok = msg === 'Hit, stand, or double.' && total >= 19 && total <= 20;
  }
  if (!ok) throw new Error('never dealt a clean hit/stand/double hand');
  await sleep(300);
  await page.screenshot({ path: OUT });
  console.log('wrote apps/blackjack/screenshot.png');
  await browser.close();
  srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
