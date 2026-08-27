/*
 * Boot the built Bible app GIF in the real GifOS sandbox and drive it.
 *
 *   node test/tools/bible-shot.js                 # boot, report, screenshots
 *   node test/tools/bible-shot.js --phone         # phone viewport
 *   node test/tools/bible-shot.js --do <script>   # also run a named routine
 *
 * Screenshots land in test/out/bible/ (gitignored). This is a TOOL for humans
 * and critics, not a gate — the assertions are in test/browser/e2e-bible.js.
 *
 * Needs: the static site on 8099 (python3 -m http.server 8099 -d site).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'test', 'out', 'bible');
fs.mkdirSync(OUT, { recursive: true });

const PHONE = process.argv.includes('--phone');
const viewport = PHONE ? { width: 390, height: 844 } : { width: 1280, height: 800 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appFrame = (page) => page.frames().find((f) => f !== page.mainFrame());

async function seed(page, slug) {
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });
  const b64 = fs.readFileSync(path.join(ROOT, 'site', 'apps', slug, slug + '.gif')).toString('base64');
  return page.evaluate(async ([b, s]) => {
    const bin = atob(b); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: s + '.gif', bytes, kind: 'gif', isApp: true, appId: s, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: s + '.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    return fid;
  }, [b64, slug]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: PHONE ? 3 : 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('page: ' + m.text().slice(0, 200)); });

  const fid = await seed(page, 'bible');
  await page.goto(BASE + '/run.html#id=' + fid);
  // The OS asks about the app's declared capabilities before first mount.
  await page.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.perm-modal', { state: 'detached', timeout: 6000 }).catch(() => {});
  await page.waitForSelector('#appmount iframe', { timeout: 60000 });
  await sleep(1500);

  const f = appFrame(page);
  if (!f) { console.log('FAIL no app frame'); process.exit(1); }
  f.on('console', (m) => { if (m.type() === 'error') errors.push('app: ' + m.text().slice(0, 200)); });

  // Wait for the first chapter to paint.
  try {
    await f.waitForSelector('#cols .chapter .v', { timeout: 30000 });
  } catch (e) {
    const body = await f.evaluate(() => document.body ? document.body.textContent.slice(0, 400) : '(no body)');
    console.log('FAIL first chapter never painted. Body says: ' + body.replace(/\s+/g, ' '));
    for (const e2 of errors) console.log('  ' + e2);
    await page.screenshot({ path: path.join(OUT, 'boot-failed.png') });
    process.exit(1);
  }

  const state = await f.evaluate(() => ({
    ref: document.getElementById('place-ref').textContent,
    trans: document.getElementById('trans-name').textContent,
    verses: document.querySelectorAll('#cols .v').length,
    heads: document.querySelectorAll('#cols .b-head').length,
    poetry: document.querySelectorAll('#cols .b-q').length,
    wj: document.querySelectorAll('#cols .wj').length,
  }));
  console.log('BOOTED', JSON.stringify(state));

  const suffix = PHONE ? '-phone' : '';
  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name + suffix + '.png') });
    console.log('shot', name + suffix + '.png');
  };

  await shot('01-boot');

  const closeSheet = async () => {
    await f.evaluate(() => { if (window.bibleReader) bibleReader.closeSheets(); });
    await sleep(200);
  };

  // The books sheet.
  await f.click('#b-place');
  await sleep(400);
  await shot('02-books');
  await closeSheet();

  // Psalm 23 — poetry.
  await f.evaluate(() => { bibleReader.go({ code: 'PSA', chapter: 23 }); });
  await sleep(400);
  await shot('03-psalm23');

  // Matthew 5 — red letter + headings.
  await f.evaluate(() => { bibleReader.go({ code: 'MAT', chapter: 5 }); });
  await sleep(400);
  await shot('04-matthew5');

  // The verse sheet on Matthew 5:3.
  await f.locator('.v[data-v="3"]').first().click();
  await sleep(400);
  await shot('05-verse-sheet');
  await closeSheet();

  // Translations sheet.
  await f.click('#b-trans');
  await sleep(400);
  await shot('06-translations');
  await closeSheet();

  // Search.
  await f.click('#b-search');
  await f.fill('#q', 'shepherd');
  await sleep(700);
  await shot('07-search');
  await closeSheet();

  // Settings.
  await f.click('#b-more');
  await sleep(400);
  await shot('08-settings');
  await closeSheet();

  // Paper theme, John 1.
  await f.evaluate(() => {
    bibleReader.prefs.theme = 'paper';
    GifosBibleChrome(bibleReader.prefs);
    bibleReader.go({ code: 'JHN', chapter: 1 });
  });
  await sleep(400);
  await shot('09-paper-john1');

  if (errors.length) {
    console.log('CONSOLE ERRORS (' + errors.length + '):');
    for (const e of errors.slice(0, 12)) console.log('  ' + e);
  } else console.log('no console errors');

  await browser.close();
})();
