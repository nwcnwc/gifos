// End-to-end for App Store reviews (roadmap §6b): stars + comments that live
// in the GitHub repo as one JSON file per reviewer per app, landed by pull
// request, aggregated into site/apps/reviews.json — GitHub is the only server.
//
// What is guarded, and why each one:
//  - the committed reviews.json matches apps/*/reviews/ (a generated-but-
//    committed artifact with no drift gate is a second copy waiting to lie);
//  - the store paints stars on the grid card and the full comments on the
//    listing, from ONE fetch of reviews.json;
//  - review text is THIRD-PARTY content and must render as text, never as
//    markup — the one review-shaped XSS the store could ship;
//  - every listing carries a Write a review button that deep-links GitHub's
//    prefilled new-file page under apps/<slug>/reviews/, plus a link to the
//    how-to (apps/README.md#reviews) so people AND their AI agents can find
//    the recipe from the store itself;
//  - a store with NO reviews (or no reviews.json at all) still renders every
//    listing — reviews are decoration on the catalog, never a dependency.
//
// Needs: static server on 8099 serving site/.
const { chromium, CHROME } = require('../lib/pw');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- the data, on disk ------------------------------------------------------
  let current = true, why = '';
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-app-reviews.mjs'), '--check'], { stdio: 'pipe' });
  } catch (e) {
    current = false;
    why = String((e.stdout || '') + (e.stderr || '')).trim().split('\n').slice(0, 3).join(' | ');
  }
  check('committed reviews.json matches apps/*/reviews/ (build-app-reviews.mjs --check)', current, why || undefined);

  const published = JSON.parse(fs.readFileSync(path.join(SITE, 'apps', 'reviews.json'), 'utf8'));
  check('reviews.json declares its catalog version and an apps map',
    published.catalog === '1.0' && published.apps && typeof published.apps === 'object');

  const index = JSON.parse(fs.readFileSync(path.join(SITE, 'apps', 'index.json'), 'utf8'));
  const slug = index.apps[0].slug;

  // ---- the browser, with reviews INJECTED ------------------------------------
  // The committed file is legitimately empty until real people review real
  // apps, so the rendering is asserted against an injected reviews.json — the
  // same fetch-shim pattern e2e-app-store.js uses to stage minBuild floors.
  // One of the two bodies is an XSS probe: reviews are the first third-party
  // TEXT the store renders, and it must land as text.
  const XSS = 'Nice app <img src=x onerror="document.title=\'owned\'"> five stars';
  const FAKE = {
    catalog: '1.0',
    apps: {},
  };
  FAKE.apps[slug] = {
    stars: 4.5, count: 2,
    reviews: [
      { user: 'octocat', stars: 5, review: 'Installed it from one link. It is a GIF. I own it.', date: '2026-08-22' },
      { user: 'mona-lisa', stars: 4, review: XSS, date: '2026-08-21' },
    ],
  };

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.addInitScript((fake) => {
    const orig = window.fetch;
    window.fetch = async function (input, init) {
      const url = String((input && input.url) || input);
      if (/\/apps\/reviews\.json/.test(url)) {
        return new Response(JSON.stringify(fake), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return orig.call(this, input, init);
    };
  }, FAKE);

  await page.goto(BASE + '/store.html');
  await page.waitForSelector('.card', { timeout: 15000 });

  // ---- grid ----
  const card = page.locator('.card[data-slug="' + slug + '"]');
  check('the reviewed app\'s card shows its stars and count',
    /★ 4\.5 \(2\)/.test((await card.textContent()) || ''), (await card.locator('.stars').textContent().catch(() => '')) || 'no .stars');
  const others = await page.locator('.card .stars').count();
  check('…and only reviewed apps wear stars', others === 1, others + ' starred card(s)');

  // ---- listing ----
  await card.click();
  await page.waitForSelector('#reviews', { timeout: 10000 });
  const sum = (await page.locator('#reviews .revsum').textContent()) || '';
  check('the listing sums it up (average + count)', /4\.5/.test(sum) && /2 reviews/.test(sum), sum.trim());
  check('every review is on the page', (await page.locator('#reviews .review').count()) === 2);
  check('a review names its reviewer, linked to their GitHub profile',
    (await page.locator('#reviews .review a[href="https://github.com/octocat"]').count()) === 1);
  check('newest review first',
    /octocat/.test((await page.locator('#reviews .review').first().textContent()) || ''));

  // The one that matters: third-party text renders as TEXT.
  check('review text cannot inject markup — the XSS probe is literal text',
    (await page.locator('#reviews .review img').count()) === 0 &&
    ((await page.locator('#reviews').textContent()) || '').includes('<img src=x'),
    'title=' + (await page.title()));
  check('…and nothing it did reached the page', (await page.title()) !== 'owned');

  // ---- the write path ----
  const href = (await page.locator('#write-review').getAttribute('href')) || '';
  check('Write a review deep-links GitHub\'s new-file page in THIS app\'s reviews folder',
    href.startsWith('https://github.com/nwcnwc/gifos/new/main/apps/' + slug + '/reviews'), href.slice(0, 80));
  check('…prefilled with a template that already validates (stars, review, date)',
    /filename=/.test(href) && /stars/.test(decodeURIComponent(href)) && /\d{4}-\d{2}-\d{2}/.test(decodeURIComponent(href)));
  check('…beside a how-to link agents and humans can follow (apps/README.md#reviews)',
    (await page.locator('#reviews a[href*="apps/README.md#reviews"]').count()) === 1);

  // The prefilled template must actually PASS the validator it will meet in CI.
  const m = /value=([^&]+)/.exec(href);
  let tmplOk = false, tmplWhy = '';
  try {
    const mod = await import(path.join(ROOT, 'scripts', 'build-app-reviews.mjs'));
    const probs = mod.validateReview(slug, 'octocat', decodeURIComponent(m[1]));
    tmplOk = probs.length === 0; tmplWhy = probs.join(' | ');
  } catch (e) { tmplWhy = e.message; }
  check('the prefilled template passes validateReview as-is', tmplOk, tmplWhy || undefined);

  // ---- and WITHOUT any reviews (the real, committed state today) -------------
  const bare = await ctx.newPage();
  // The hash route — the pretty /store/<slug> is a Pages 404.html rewrite that
  // a plain static server doesn't have.
  await bare.goto(BASE + '/store.html#app=' + slug);
  await bare.waitForSelector('#reviews', { timeout: 15000 });
  const anyReal = Object.keys(published.apps).length > 0;
  if (!anyReal) {
    check('with no reviews committed, the listing says so and still offers the button',
      /No reviews yet/.test((await bare.locator('#reviews').textContent()) || '') &&
      (await bare.locator('#write-review').count()) === 1);
  } else {
    check('committed reviews render on the live listing',
      (await bare.locator('#reviews .revsum').count()) === 1);
  }
  check('the bare listing still renders its facts (reviews are never a dependency)',
    (await bare.locator('.facts').count()) === 1 && (await bare.locator('#install').count()) >= 1);

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
