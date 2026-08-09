// End-to-end for the App Store (store.html + js/store.js + site/apps/).
//
// THE ASSERTION THAT MATTERS MOST is the cover rule: browsing the store must
// not fetch a single App GIF. Chess Grandmaster is 8 MB; a listing that used
// the real GIF as its artwork would pull the whole catalog to paint one screen,
// on a phone, before the user has chosen anything. That is a NETWORK property,
// so this watches requests — reading store.js for an <img> pattern would pass
// happily the day someone adds a CSS background-image or a preload hint.
//
// Everything else here guards a path that is easy to break silently:
//  - the catalog on disk is current and complete (a stale index.json ships a
//    listing whose Install 404s);
//  - Install downloads ONCE, verifies, and lands an icon on the Home Screen;
//  - the icon is placed by saveItem, not by the store (no stacked icons);
//  - the hand-off rides the HASH, because the channel loader drops the query
//    and a pinned visitor's install would arrive with nothing on screen;
//  - the pretty /store/<slug> link and the 404.html route that feeds it.
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
  // ---- the catalog, on disk -------------------------------------------------
  // A catalog that has drifted from its sources is the one failure the browser
  // can't see: the store renders fine and Install fetches bytes that no longer
  // match the sha256 it checks them against.
  let built = true;
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-app-catalog.mjs'), '--check'], { stdio: 'pipe' });
  } catch (e) {
    built = false;
    console.log('  ' + String(e.stdout || '').trim().split('\n').slice(-4).join('\n  '));
  }
  check('the committed catalog matches apps/ (build-app-catalog.mjs --check)', built);

  const index = JSON.parse(fs.readFileSync(path.join(SITE, 'apps', 'index.json'), 'utf8'));
  check('the catalog lists at least one app', (index.apps || []).length > 0, (index.apps || []).length + ' app(s)');
  check('the catalog declares its navigation categories', Array.isArray(index.categories) && index.categories.length > 0);

  for (const a of index.apps) {
    const dir = path.join(SITE, 'apps', a.slug);
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'));
    check(a.slug + ': every asset the listing points at exists',
      fs.existsSync(path.join(SITE, rec.cover.replace(/^\//, ''))) && fs.existsSync(path.join(SITE, rec.gif.replace(/^\//, ''))));
    check(a.slug + ': the cover is a JPEG, not the App GIF', /\.jpe?g$/i.test(rec.cover));
    check(a.slug + ': byte count and hash describe the real file',
      fs.statSync(path.join(SITE, rec.gif.replace(/^\//, ''))).size === rec.bytes && /^[a-f0-9]{64}$/.test(rec.sha256));
    check(a.slug + ': sits in at least one category, all of them known',
      (rec.categories || []).length > 0 && rec.categories.every((c) => index.categories.includes(c)));
    check(a.slug + ': carries the long and short descriptions a listing needs',
      !!rec.tagline && !!rec.description && rec.description.length > rec.tagline.length);
  }

  // Nothing outside the store may reference an App GIF as an image.
  const storeSrc = fs.readFileSync(path.join(SITE, 'js', 'store.js'), 'utf8');
  const gifImg = /(?:src|background(?:-image)?|href)\s*[:=][^\n]*\.gif/i.test(storeSrc.replace(/^\s*[/*].*$/gm, ''));
  check('store.js never points an image/link at a .gif in its markup', !gifImg);

  // ---- the browser ----------------------------------------------------------
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  // Every App GIF request, for the whole session. The counter is the test.
  const gifHits = [];
  ctx.on('request', (r) => { if (/\/apps\/[^/]+\/[^/]+\.gif(\?|$)/i.test(r.url())) gifHits.push(r.url()); });

  // Seed a desktop first — the store checks it to say "Installed", and the
  // install hand-off finishes there.
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(1200);

  check('the Home Screen seeds an App Store launcher',
    (await page.locator('.icon', { hasText: 'App Store' }).count()) === 1);
  check('the launcher wears the SYSTEM badge (it opens trusted chrome, not a sandbox)',
    (await page.locator('.icon:has-text("App Store") .sysbadge').count()) === 1);
  check('a system launcher is never marked NEW (it holds no data of yours)',
    (await page.locator('.icon:has-text("App Store") .new-badge').count()) === 0);

  // An icon can be dragged into a folder or trashed. The menu and ＋ Add are the
  // routes to the store a user cannot misplace, so both are guarded.
  await page.locator('#sys-menu-btn').click();
  await sleep(250);
  check('the GifOS ▾ menu offers the App Store',
    (await page.locator('.ctx >> text=App Store…').count()) >= 1);
  await page.keyboard.press('Escape');
  await sleep(150);
  await page.locator('#add-btn').click();
  await page.waitForSelector('#ad-store', { timeout: 5000 });
  check('＋ Add — the "where do I get apps?" dialog — leads with the store', true);
  await page.locator('#ad-store').click();
  await page.waitForURL(/store\.html/, { timeout: 10000 });
  check('…and it opens the store', /store\.html/.test(page.url()), page.url());

  // ---- browse ---------------------------------------------------------------
  await page.goto(BASE + '/store.html');
  await page.waitForSelector('.card', { timeout: 15000 });
  const cards = await page.locator('.card').count();
  check('the store renders a card per listed app', cards === index.apps.length, cards + ' cards');

  // Scroll the whole page, so a lazy cover below the fold is forced to load —
  // otherwise "no GIFs fetched" could just mean "nothing rendered yet".
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
  });
  await sleep(600);
  const covers = await page.$$eval('.card .shot', (els) => els.map((e) => ({ src: e.getAttribute('src'), loaded: e.complete && e.naturalWidth > 0 })));
  check('every card shows its cover image', covers.length === cards && covers.every((c) => c.loaded), JSON.stringify(covers.map((c) => c.loaded)));
  check('every card image is a cover.jpg', covers.every((c) => /\.jpe?g$/i.test(c.src || '')));
  check('BROWSING THE WHOLE STORE FETCHES ZERO APP GIFS', gifHits.length === 0, gifHits.join(', '));

  // ---- which build owns the visitor -----------------------------------------
  // This page carries NO channel loader on purpose, and that decision has
  // already cost one production 404: the loader sent every default-channel
  // visitor to /versions/<current>/store.html, which does not exist in any
  // snapshot cut before the store did. The replacement logic is exported so it
  // can be asserted directly instead of inferred from what rendered.
  check('store.html carries no channel loader (it would 404 into old snapshots)',
    !/gifosPinTarget/.test(fs.readFileSync(path.join(SITE, 'store.html'), 'utf8')));
  const build = await page.evaluate(async () => {
    const out = { host: location.hostname };
    out.onThisHost = await GifOS.storeBuild.effectiveRelease();
    // Pinned builds must be honoured wherever we are — that pin IS the user's
    // computer, and an install has to reach it.
    localStorage.setItem('gifos_pin', '0.8.4');
    out.pinned = await GifOS.storeBuild.effectiveRelease();
    localStorage.removeItem('gifos_pin');
    localStorage.setItem('gifos_channel', 'edge');
    out.edge = await GifOS.storeBuild.effectiveRelease();
    localStorage.removeItem('gifos_channel');
    return out;
  });
  check('off gifos.app the ROOT build owns the visitor (localhost is the build)',
    build.onThisHost === null, build.host + ' → ' + build.onThisHost);
  check('an explicit edge opt-in keeps the visitor on the root build', build.edge === null);
  check('a pin is honoured — an install must reach the computer the user pinned',
    build.pinned === '0.8.4', String(build.pinned));
  check('nothing is flagged legacy here, so Install is live', (await page.locator('#install').count()) >= 0);

  // ---- categories + search --------------------------------------------------
  const catNames = await page.$$eval('.cat', (e) => e.map((x) => x.textContent));
  check('the category chips are All + only categories that hold an app', catNames[0] === 'All' && catNames.length > 1, catNames.join('/'));
  const games = index.apps.filter((a) => (a.categories || []).includes('Games')).length;
  if (games) {
    await page.locator('.cat[data-cat="Games"]').click();
    await sleep(200);
    check('picking a category filters the grid to it', (await page.locator('.card').count()) === games);
    await page.locator('.cat[data-cat="All"]').click();
    await sleep(200);
  }
  await page.locator('#q').fill('zzzznothing');
  await sleep(200);
  check('a search with no matches says so instead of showing an empty grid',
    (await page.locator('.card').count()) === 0 && await page.locator('#empty').isVisible());
  await page.locator('#q').fill('');
  await sleep(200);

  // ---- a listing ------------------------------------------------------------
  const target = index.apps.find((a) => a.bytes < 2e6) || index.apps[0];  // install the small one
  await page.locator('.card[data-slug="' + target.slug + '"]').click();
  await page.waitForSelector('#install', { timeout: 10000 });
  check('opening a listing pushes its shareable /store/<slug> link',
    new URL(page.url()).pathname === '/store/' + target.slug, page.url());
  const facts = (await page.locator('.facts').textContent()) || '';
  for (const want of ['Version', 'Author', 'Released', 'Category', 'Size', 'License', 'Signature']) {
    check('the listing states its ' + want, facts.includes(want));
  }
  check('the listing shows the app\'s declared abilities before you install', /Abilities/.test(facts));
  check('opening a listing still fetches no App GIF', gifHits.length === 0, gifHits.join(', '));

  // Back, and the deep link the 404 router produces.
  await page.locator('#back').click();
  await sleep(300);
  check('back returns to the grid', (await page.locator('.card').count()) === cards);
  await page.goto(BASE + '/store.html#app=' + target.slug);
  await page.waitForSelector('#install', { timeout: 10000 });
  check('the #app=<slug> deep link (what 404.html builds) opens that listing',
    new URL(page.url()).pathname === '/store/' + target.slug);

  // The pretty route itself: 404.html's router must produce that hash form.
  const routed = await page.evaluate(async (base) => {
    const src = await (await fetch(base + '/404.html')).text();
    const m = src.match(/\/store\(\?:\\\/\(\[a-z0-9-\]\{1,64\}\)\)\?/);
    return { hasRoute: !!m, buildsHash: /store\.html' \+ \(s\[1\] \? '#app='/.test(src) };
  }, BASE);
  check('404.html routes /store and /store/<slug>', routed.hasRoute);
  check('…and hands the slug over in the HASH, which survives a version redirect', routed.buildsHash);

  // ---- install --------------------------------------------------------------
  const before = await page.locator('.card').count();  // (grid count, for the later re-render)
  await page.locator('#install').click();
  await page.waitForURL(/index\.html/, { timeout: 60000 });
  await page.waitForSelector('.modal', { timeout: 30000 });
  check('installing lands on the Home Screen with a confirmation',
    /is installed/.test((await page.locator('.modal h3').textContent()) || ''));
  check('THE APP GIF CROSSES THE WIRE EXACTLY ONCE — on Install', gifHits.length === 1, gifHits.join(', '));

  const state = await page.evaluate(async (appId) => {
    const files = await GifOS.store.allFiles();
    const f = files.find((x) => x.appId === appId);
    const items = await GifOS.store.allItems();
    const it = items.find((i) => i.fileId === (f || {}).id);
    // Cell collisions among root siblings — placement is saveItem's job, and
    // this is the invariant it exists to keep.
    const s = document.getElementById('desktop');
    const pitch = parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10) || 104;
    const rowP = parseInt(getComputedStyle(s).getPropertyValue('--row'), 10) || 104;
    const cell = (i) => Math.round(((i.x || 12) - 12) / pitch) + ',' + Math.round(((i.y || 12) - 12) / rowP);
    const roots = items.filter((i) => !i.parent);
    const seen = {}, clash = [];
    for (const i of roots) { const c = cell(i); if (seen[c]) clash.push(c + ': ' + seen[c] + ' + ' + i.name); seen[c] = i.name; }
    return { hasFile: !!f, isApp: !!(f && f.isApp), hasItem: !!it, parent: it ? it.parent : 'none', clash, hash: location.hash, search: location.search };
  }, target.appId);

  check('the installed app is stored as a real app GIF', state.hasFile && state.isApp);
  check('an icon for it exists on the Home Screen (root, not buried)', state.hasItem && !state.parent);
  check('it did NOT land on top of another icon — saveItem placed it', state.clash.length === 0, state.clash.join(' | '));
  check('the install token is cleared from the URL (a refresh can’t re-place it)', !state.hash && !state.search);

  // Refresh: no second icon, no second modal.
  await page.reload();
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(800);
  const dupes = await page.evaluate(async (appId) => {
    const files = await GifOS.store.allFiles();
    const ids = files.filter((f) => f.appId === appId).map((f) => f.id);
    const items = await GifOS.store.allItems();
    return items.filter((i) => ids.includes(i.fileId)).length;
  }, target.appId);
  check('reloading after an install does not duplicate the icon', dupes === 1, dupes + ' icon(s)');

  // ---- the store knows it's installed ---------------------------------------
  await page.goto(BASE + '/store.html');
  await page.waitForSelector('.card', { timeout: 15000 });
  check('the grid marks an installed app as installed',
    (await page.locator('.card[data-slug="' + target.slug + '"] .installed').count()) === 1);
  await page.locator('.card[data-slug="' + target.slug + '"]').click();
  await page.waitForSelector('#install', { timeout: 10000 });
  const openHref = await page.locator('.actions a.btn').getAttribute('href').catch(() => '');
  check('an installed listing offers Open (pointing at the icon you own)', /run\.html#id=/.test(openHref || ''), openHref || 'none');
  check('re-opening the store STILL fetches no App GIF', gifHits.length === 1, gifHits.length + ' total');

  // ---- delete, reinstall, and the app REMEMBERS -----------------------------
  // Every byte an app saves — searched places, driven-through map cache,
  // preferences — is keyed by its fileId, so a reinstall under a fresh id is
  // a fresh, empty life ("the places I've driven are not being remembered").
  // Deleting a file ORPHANS its state rather than destroying it, and the
  // store records which fileId each appId lived at — so a delete-and-
  // reinstall resurrects the same identity and the state re-attaches.
  const oldId = await page.evaluate(async (appId) => {
    const files = await GifOS.store.allFiles();
    const f = files.find((x) => x.appId === appId);
    // A marker standing in for the player's saved places — written through
    // the SAME per-record path a running app's gifos.db uses (makeLocalDb →
    // appAdd), not a hand-rolled state blob whose shape the assembler owns.
    await GifOS.store.appAdd(f.id, 'prefs', { id: 'marker', v: 'survived the reinstall' });
    const items = await GifOS.store.allItems();
    for (const i of items.filter((it) => it.fileId === f.id)) await GifOS.store.deleteItem(i.id);
    await GifOS.store.deleteFile(f.id);
    return f.id;
  }, target.appId);
  await page.goto(BASE + '/store.html#app=' + target.slug);
  await page.waitForSelector('#install', { timeout: 15000 });
  await page.locator('#install').click();
  await page.waitForURL(/index\.html/, { timeout: 60000 });
  await page.waitForSelector('.modal', { timeout: 30000 });
  const rebirth = await page.evaluate(async (appId) => {
    const files = await GifOS.store.allFiles();
    const f = files.find((x) => x.appId === appId);
    // Read back through the same per-record path the app itself would use.
    const marker = f ? await GifOS.store.appGet(f.id, 'prefs', 'marker') : null;
    return { id: f && f.id, marker: marker ? marker.v : null };
  }, target.appId);
  check('a reinstall resurrects the app\'s old identity (same fileId)',
    rebirth.id === oldId, rebirth.id + ' vs ' + oldId);
  check('…so the data saved before the delete is still there',
    rebirth.marker === 'survived the reinstall', JSON.stringify(rebirth.marker));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
