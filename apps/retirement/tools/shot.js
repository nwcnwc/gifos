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

/* The cover is shot CLOSE, and LIGHT, and on the states chart.
 *
 * The store card is 248px wide (`aspect-ratio: 16/10; object-fit: cover;
 * object-position: top center`), and what decides whether anything on it reads
 * is the ratio of CSS pixels to card pixels. deviceScaleFactor cannot help —
 * that only adds sharpness to something still too small.
 *
 * Two rejected covers got us here. A full 1400px desktop screenshot is a 5.6x
 * reduction and the card is grey mush. Reshooting at 840px and clipping to the
 * verdict plus the fan got it to 3.4x — necessary and still insufficient, and a
 * blind ranking put it last of ten against this catalog's own covers.
 *
 * Three changes, all of which keep the rule that the art is THE APP, mid-use,
 * with its own real numbers — no composed marketing image, no invented copy:
 *
 *   THE STATES CHART, NOT THE FAN. "Rich, broke, or gone" is 100%-stacked, so
 *   it fills its plot edge to edge with four flat saturated masses. That
 *   survives any reduction. The fan is thin lines over translucent bands and
 *   does not. It is also the better idea to lead with — the most-linked page in
 *   this entire category is called "Rich, Broke or Dead".
 *
 *   LIGHT. In dark, the grey "not here any more" band merges into the
 *   background at exactly the point the story turns. In light it stands as its
 *   own mass — and the catalog grid is overwhelmingly dark, so a light card
 *   pops in it.
 *
 *   CLOSER. 640 CSS px, so the app's own type lands around 13px on the card
 *   instead of 5px. Same app, same live numbers, framed at a size where the
 *   card can do its job.
 */
const VIEW = PHONE ? { width: 390, height: 844 }
  : COVER ? { width: 640, height: 720 }
    : { width: 1280, height: 860 };
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
    // The store master has to catch the app MID-USE, with its own real numbers
    // on screen — never a cold first boot, which is a wall of default UI and
    // sells nothing.
    await frame.waitForFunction(
      () => document.querySelectorAll('#adviceList .advice').length > 0,
      null, { timeout: 60000 }
    ).catch(() => {});
    await frame.evaluate(() => {
      if (document.documentElement.getAttribute('data-theme') !== 'light') {
        document.getElementById('btnTheme').click();
      }
    });
    await sleep(1800);
    await frame.evaluate(() => window.scrollTo(0, 0));
    await sleep(400);

    // Verdict on top, states chart under it — composited from two ELEMENT
    // screenshots rather than one clipped viewport.
    //
    // Clipping needs both elements on screen at once, and they are 3,400px
    // apart in a document whose header is position:sticky — so the verdict's
    // rect stays pinned at the top while the chart is far below it, and the
    // naive clip between the two asks for a 640x3288 image. Scrolling one to
    // meet the other turned out to depend on which element is the scroller and
    // on when the theme switch finishes re-rendering, which is exactly the kind
    // of thing that works on one box and produces a blank cover on another.
    //
    // Element screenshots scroll themselves into view and cannot miss. Sharp is
    // a devDependency of the catalog, not of the app, so nothing here ships.
    const sharp = require('sharp');
    // The reading paragraph and the table drawer are the first things the card
    // crops anyway, and leaving them in only makes everything above them
    // smaller. Hiding them is a crop, not a fabrication — every pixel that
    // remains is the running app.
    await frame.evaluate(() => {
      var c = document.getElementById('cardStates');
      // Everything the card would crop anyway, plus the chrome that is not
      // content: the subtitle, the who-picker, the reading paragraph and the
      // table drawer. What is left is the verdict, the chart's own title and
      // the chart. Hiding is a crop, not a fabrication — every pixel that
      // remains is the running app with its real numbers in it.
      ['.sub', '.read', '.tabledrop', '.segmented'].forEach(function (sel) {
        var e = c.querySelector(sel);
        if (e) e.style.display = 'none';
      });
    });
    await sleep(300);
    const fl = USE_GIF ? page.frameLocator('#appmount iframe') : page;
    const top = await fl.locator('#verdict').screenshot();
    const mid = await fl.locator('#cardStates').screenshot();
    const a = await sharp(top).metadata();
    const bmeta = await sharp(mid).metadata();
    const W = Math.max(a.width, bmeta.width);
    const H = a.height + bmeta.height;
    const plane = await frame.evaluate(() =>
      getComputedStyle(document.body).backgroundColor);
    await sharp({
      create: { width: W, height: H, channels: 3, background: plane || '#f2f2ee' }
    })
      .composite([{ input: top, left: 0, top: 0 }, { input: mid, left: 0, top: a.height }])
      .png().toFile(OUT);
    await browser.close();
    console.log('wrote ' + OUT + '  (' + W + 'x' + H + ', '
      + (W / H).toFixed(2) + ':1 — the card is 1.60:1)');
    process.exit(0);
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
