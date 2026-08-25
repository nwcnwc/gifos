/*
 * Drive the app in a real browser and photograph it. Two ways to run:
 *
 *   BARE  — the source served straight from apps/retirement/, no GifOS around
 *           it. Fast, and what you want while building.
 *   GIF   — the finished App GIF mounted in the real GifOS sandbox, which is
 *           the only thing worth judging. Needs the site on 8099 and a built
 *           GIF in site/apps/retirement/.
 *
 *   python3 -m http.server 8077 -d apps/retirement
 *   node apps/retirement/tools/shot.js                     # bare, desktop
 *   node apps/retirement/tools/shot.js --phone             # bare, phone
 *   node apps/retirement/tools/shot.js --gif               # in the sandbox
 *   node apps/retirement/tools/shot.js --gif --cover       # the store master
 *
 * Anything the page logs, throws, or fails to fetch is printed. A silent
 * screenshot of a broken app is the failure mode this exists to prevent.
 */
const { chromium, CHROME } = require('../../../test/lib/pw');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const PHONE = has('--phone');
const USE_GIF = has('--gif') || has('--cover');
const COVER = has('--cover');
const APP = process.env.APP_BASE || 'http://127.0.0.1:8077';
const SITE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = path.resolve(val('--out', COVER
  ? path.join(__dirname, '..', 'screenshot.png')
  : path.join('/tmp', 'retirement' + (PHONE ? '-phone' : '') + (USE_GIF ? '-gif' : '') + '.png')));

const VIEW = PHONE ? { width: 390, height: 844 } : { width: 1280, height: 860 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: COVER ? 2 : 1,
    isMobile: PHONE,
    hasTouch: PHONE
  });
  const page = await context.newPage();

  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || m.type() === 'warning') problems.push('[' + m.type() + '] ' + t);
    else if (process.env.VERBOSE) console.log('   .', t);
  });
  page.on('pageerror', (e) => problems.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => problems.push('[404?] ' + r.url() + ' ' + (r.failure() || {}).errorText));

  let shotTarget = page;

  if (USE_GIF) {
    const gif = path.join(__dirname, '..', '..', '..', 'site', 'apps', 'retirement', 'retirement.gif');
    if (!existsSync(gif)) throw new Error('build the GIF first: node apps/retirement/build.mjs');
    const b64 = readFileSync(gif).toString('base64');
    await page.goto(SITE + '/index.html');
    await page.waitForSelector('.icon', { timeout: 60000 });
    const fid = await page.evaluate(async (b) => {
      const bin = atob(b); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: 'retirement.gif', bytes, kind: 'gif', isApp: true, appId: 'retirement', mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Retirement Calculator.gif', parent: null, x: 180, y: 180, iconSize: 64 });
      return fid;
    }, b64);
    await page.goto(SITE + '/run.html#id=' + fid);
    await page.waitForSelector('#appmount iframe', { timeout: 60000 });
    shotTarget = page.locator('#appmount iframe');
  } else {
    await page.goto(APP + '/index.html');
  }

  const frame = USE_GIF
    ? await (await page.$('#appmount iframe')).contentFrame()
    : page.mainFrame();

  // The verdict only stops saying "Working it out" when a real sweep landed.
  await frame.waitForFunction(
    () => { const h = document.getElementById('vHead'); return h && h.textContent && !/Working it out/.test(h.textContent); },
    null, { timeout: 30000 }
  ).catch(() => problems.push('[stuck] the verdict never resolved'));
  await sleep(COVER ? 1800 : 900);

  if (process.env.SCROLL) {
    await frame.evaluate((sel) => {
      const e = document.querySelector(sel);
      if (e) e.scrollIntoView({ block: 'start' });
    }, process.env.SCROLL);
    await sleep(700);
  }

  if (COVER) {
    // Catch the app mid-use, not at a cold first boot: open the panel that
    // shows the app has depth, and park the crosshair on a real year.
    await frame.evaluate(() => {
      const d = document.getElementById('secIncome');
      if (d) d.open = true;
      window.scrollTo(0, 0);
    });
    await sleep(500);
  }

  const state = await frame.evaluate(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
    return {
      head: t('vHead'), sub: t('vSub'),
      retire: t('vRetire'), spend: t('vSpend'),
      fanRead: t('fanRead'), curveRead: t('curveRead'),
      stackRead: t('stackRead'), worstHead: t('worstHead'),
      adviceHead: t('adviceHead'), adviceSub: t('adviceSub'),
      statesRead: t('statesRead'),
      advice: Array.prototype.map.call(document.querySelectorAll('#adviceList .advice'),
        (e) => e.querySelector('b').textContent + ' — ' + e.querySelector('p').textContent),
      charts: document.querySelectorAll('svg.chart').length,
      paths: document.querySelectorAll('svg.chart path').length,
      height: document.body.scrollHeight
    };
  });

  await shotTarget.screenshot({ path: OUT, ...(COVER ? {} : { fullPage: false }) });
  await browser.close();

  console.log('--- app state ---');
  for (const k of Object.keys(state)) {
    if (Array.isArray(state[k])) { console.log(k + ':'); state[k].forEach((v) => console.log('   •', v)); }
    else console.log(String(k).padEnd(11), state[k]);
  }
  if (problems.length) {
    console.log('\n--- PROBLEMS (' + problems.length + ') ---');
    for (const p of problems.slice(0, 40)) console.log(' ', p);
  } else {
    console.log('\nno console errors, no failed requests.');
  }
  console.log('\nwrote ' + OUT);
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
