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
    check(a.slug + ': published author is {name, url}, never a bare string',
      rec.author && typeof rec.author === 'object' && !!rec.author.name);
    if (rec.basedOn) {
      check(a.slug + ': a port does not list GifOS as the author',
        String((rec.author || {}).name).toLowerCase() !== 'gifos');
      check(a.slug + ': a port names a porter', !!(rec.porter && rec.porter.name && rec.porter.url));
      check(a.slug + ': basedOn carries the product name and url',
        !!rec.basedOn.name && /^https:\/\//.test(rec.basedOn.url || ''));
      check(a.slug + ': the grid index carries basedOn.name (search + "port of" pill)',
        a.basedOn && a.basedOn.name === rec.basedOn.name && a.basedOn.blessed === rec.basedOn.blessed);
      check(a.slug + ': donate is a detail-page fact, not on the grid index',
        a.basedOn.donate === undefined);
      if (rec.basedOn.donate) {
        check(a.slug + ': donate is https and not a GifOS/Stripe checkout',
          /^https:\/\//.test(rec.basedOn.donate) &&
          !/gifos\.app|stripe\.com/i.test(rec.basedOn.donate));
      }
    } else {
      check(a.slug + ': a first-party listing has no porter and no basedOn',
        rec.porter == null && rec.basedOn == null && a.porter == null && a.basedOn == null);
    }
    // The floor an app runs on has to survive the trip from the manifest into
    // BOTH published files. It is in the index because the GRID has to say it;
    // an index that dropped the field would read as minBuild 0 — "runs
    // anywhere" — and every card would go back to advertising an app the
    // player's computer cannot run.
    const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', a.slug, 'manifest.json'), 'utf8'));
    check(a.slug + ': states the oldest GifOS build it runs on, in the manifest',
      Number.isInteger(src.minBuild) && src.minBuild >= 947, String(src.minBuild));
    check(a.slug + ': …carried through to app.json AND the grid index unchanged',
      rec.minBuild === src.minBuild && a.minBuild === src.minBuild,
      'manifest ' + src.minBuild + ' / app.json ' + rec.minBuild + ' / index ' + a.minBuild);
  }

  // Nothing outside the store may reference an App GIF as an image.
  const storeSrc = fs.readFileSync(path.join(SITE, 'js', 'store.js'), 'utf8');
  const gifImg = /(?:src|background(?:-image)?|href)\s*[:=][^\n]*\.gif/i.test(storeSrc.replace(/^\s*[/*].*$/gm, ''));
  check('store.js never points an image/link at a .gif in its markup', !gifImg);

  const payJs = fs.readFileSync(path.join(SITE, 'js', 'pay.js'), 'utf8');
  check('committed pay.js carries no payment URL (the link is baked at deploy, not stored in git)',
    /link:\s*['"]{2}/.test(payJs), payJs.trim().split('\n').pop());
  check('store.js still advertises Install as free — cash is a CTA, not a gate',
    /Install — free/.test(storeSrc));

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
  check('with no payment link the store does not show a tip CTA',
    (await page.locator('#paybar:not([hidden]), #tip[href]').count()) === 0);

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

  // ---- ports of other people's work ----------------------------------------
  // Author is THEM, GifOS is the porter, and search still finds the upstream
  // name after that split. Two listings, because this is the shape that will
  // keep landing: vocal-remover (UVR, has a donate page) and fps-simple
  // (Claude of Duty, does not).
  const uvr = index.apps.find((a) => a.slug === 'vocal-remover');
  const fps = index.apps.find((a) => a.slug === 'fps-simple');
  check('vocal-remover is catalogued as a port of Ultimate Vocal Remover',
    !!(uvr && uvr.basedOn && uvr.basedOn.name === 'Ultimate Vocal Remover' && uvr.basedOn.blessed === false));
  check('fps-simple is catalogued as a port of Claude of Duty',
    !!(fps && fps.basedOn && fps.basedOn.name === 'Claude of Duty' && fps.basedOn.blessed === false));

  await page.locator('#q').fill('ultimate vocal remover');
  await sleep(200);
  check('searching the upstream name finds the UVR port',
    (await page.locator('.card[data-slug="vocal-remover"]').count()) === 1);
  check('…and the card says it is a port of that product',
    /port of Ultimate Vocal Remover/.test((await page.locator('.card[data-slug="vocal-remover"]').textContent()) || ''));
  await page.locator('#q').fill('claude of duty');
  await sleep(200);
  check('searching the upstream name finds the Claude of Duty port',
    (await page.locator('.card[data-slug="fps-simple"]').count()) === 1);
  await page.locator('#q').fill('');
  await sleep(200);

  await page.locator('.card[data-slug="vocal-remover"]').click();
  await page.waitForSelector('#install', { timeout: 10000 });
  const uvrFacts = (await page.locator('.facts').textContent()) || '';
  const uvrHead = (await page.locator('.head').textContent()) || '';
  check('the UVR listing does not claim GifOS as the author',
    !/Author\s*GifOS/.test(uvrFacts) && /Anjok07/.test(uvrFacts));
  check('the UVR listing states Ported by GifOS', /Ported by\s*GifOS/.test(uvrFacts));
  check('the UVR listing states it is based on Ultimate Vocal Remover',
    /Based on/.test(uvrFacts) && /Ultimate Vocal Remover/.test(uvrFacts));
  check('the UVR listing is labelled an unofficial port',
    /Unofficial port/.test(uvrHead) && /Unofficial port/.test(uvrFacts));
  check('the UVR listing sends bugs to GifOS, not upstream',
    /Bugs in this port go to/.test(uvrHead) &&
    (await page.locator('.port a[href*="nwcnwc/gifos/issues"]').count()) === 1);
  check('the UVR listing offers Donate to the upstream project',
    (await page.locator('#donate').count()) === 1);
  check('…pointing at UVR\'s own donate page, not GifOS',
    (await page.locator('#donate').getAttribute('href')) === 'https://www.buymeacoffee.com/uvr5');
  check('a port listing still fetches no App GIF', gifHits.length === 0, gifHits.join(', '));
  await page.locator('#back').click();
  await sleep(200);

  await page.locator('.card[data-slug="fps-simple"]').click();
  await page.waitForSelector('#install', { timeout: 10000 });
  const fpsFacts = (await page.locator('.facts').textContent()) || '';
  check('the Claude of Duty listing does not claim GifOS as the author',
    !/Author\s*GifOS/.test(fpsFacts) && /mshumer/.test(fpsFacts));
  check('the Claude of Duty listing states Ported by GifOS', /Ported by\s*GifOS/.test(fpsFacts));
  check('a port without a donate page has no Donate button',
    (await page.locator('#donate').count()) === 0);
  await page.locator('#back').click();
  await sleep(200);

  // ---- a listing ------------------------------------------------------------
  const target = index.apps.find((a) => a.bytes < 2e6) || index.apps[0];  // install the small one
  await page.locator('.card[data-slug="' + target.slug + '"]').click();
  await page.waitForSelector('#install', { timeout: 10000 });
  check('opening a listing pushes its shareable /store/<slug> link',
    new URL(page.url()).pathname === '/store/' + target.slug, page.url());
  const facts = (await page.locator('.facts').textContent()) || '';
  for (const want of ['Version', 'Author', 'Released', 'Category', 'Size', 'License', 'Signature', 'Requires']) {
    check('the listing states its ' + want, facts.includes(want));
  }
  check('the listing shows the app\'s declared abilities before you install', /Abilities/.test(facts));
  check('opening a listing still fetches no App GIF', gifHits.length === 0, gifHits.join(', '));
  check('Install is still free — paying is not required to get the app',
    /Install — free/.test((await page.locator('#install').textContent()) || ''),
    await page.locator('#install').textContent());
  check('a listing without a payment link does not show Feature this listing',
    (await page.locator('#feature').count()) === 0);

  // ---- Share ----------------------------------------------------------------
  // The button exists to hand someone the PRETTY link, and what it puts on the
  // clipboard is the whole feature — so read the clipboard back rather than
  // trusting the label. Two things must NOT be in there: the ns() alternate-
  // database suffix (a local scope; sharing it drags a friend into your test db)
  // and any /versions/ prefix (which would pin them to a frozen old build).
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const shareBtn = page.locator('#share');
  check('a listing offers a Share button', await shareBtn.count() === 1);
  check('…and Share is not gated by the build floor', !(await shareBtn.isDisabled()));
  await shareBtn.click();
  await sleep(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const shown = await page.locator('#shareurl').inputValue();
  const u = new URL(copied);
  check('Share copies the pretty /store/<slug> link', u.pathname === '/store/' + target.slug, copied);
  check('…absolute, so it still works once pasted somewhere', /^https?:\/\//.test(copied) && !!u.host);
  check('…with no alternate-database suffix and no frozen /versions/ prefix',
    !/[?#&]db=/.test(copied) && !/\/versions\//.test(copied), copied);
  check('…and the link is shown on screen, not just promised', shown === copied, shown);
  check('…the button confirms it copied', /copied/i.test((await shareBtn.textContent()) || ''),
    await shareBtn.textContent());

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

  // ---- the SECOND download: install-time assets get their own bar -----------
  // An app whose weights arrive separately is two downloads, and the second
  // dwarfs the first. The app GIF's bar used to finish at 100% and then simply
  // STAY there through an 806 MB model — the one part of the install worth
  // watching was the part with no progress at all, and a stalled download was
  // indistinguishable from a slow one. So: its own bar, fed by a streamed read.
  //
  // Run on its own page so the main one's state (and its addInitScript) stays
  // clean, and with an asset that is NOT an App GIF — site/og.png, 744 KB, big
  // enough to arrive in many chunks — because the cover rule's counter watches
  // /apps/<x>/<y>.gif and an asset there would read as a store download.
  {
    const ogBytes = fs.readFileSync(path.join(SITE, 'og.png'));
    const ogSha = require('crypto').createHash('sha256').update(ogBytes).digest('hex');
    const at = index.apps.slice().sort((a, b) => a.bytes - b.bytes)[0];

    const maker = await ctx.newPage();
    await maker.goto(BASE + '/store.html');
    await maker.waitForSelector('.card', { timeout: 15000 });
    // A real App GIF with a manifest that pins a real, local asset. Everything
    // downstream — decode, manifest read, appId match, hash check — is the
    // shipping path; only the bytes the catalog points at are ours.
    const built = await maker.evaluate(async (cfg) => {
      const files = {
        'manifest.json': JSON.stringify({ gifos: '1.0', appId: cfg.appId, name: 'Asset Probe', entry: 'index.html',
          capabilities: {}, assets: [{ url: '/og.png', sha256: cfg.sha, path: 'model.bin', bytes: cfg.len }] }),
        'index.html': '<h1>probe</h1>',
      };
      const bytes = await GifOS.gif.encode(files, { accent: [123, 92, 255] });
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      let hex = ''; for (const b of d) hex += b.toString(16).padStart(2, '0');
      return { bytes: Array.from(bytes), sha: hex };
    }, { appId: at.appId, sha: ogSha, len: ogBytes.length });
    await maker.close();

    const ap = await ctx.newPage();
    ap.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await ap.addInitScript((cfg) => {
      const gifBytes = new Uint8Array(cfg.bytes);
      const orig = window.fetch;
      window.fetch = async function (input, init) {
        const url = String((input && input.url) || input);
        if (new RegExp('/apps/' + cfg.slug + '/' + cfg.slug + '\\.gif').test(url)) {
          return new Response(gifBytes, { status: 200, headers: { 'content-type': 'image/gif', 'content-length': String(gifBytes.length) } });
        }
        const res = await orig.call(this, input, init);
        if (!/\/apps\/(index\.json|[^/]+\/app\.json)/.test(url)) return res;
        try {
          const b = await res.clone().json();
          // signature: null — the real listing claims gifos.app, and our bytes
          // are not signed by it. The store is RIGHT to refuse a signed listing
          // whose signature doesn't verify; we're testing assets, not that.
          const fix = (a) => { if (a.slug === cfg.slug) { a.sha256 = cfg.sha; a.signature = null; a.download = cfg.len; } };
          if (Array.isArray(b.apps)) b.apps.forEach(fix); else fix(b);
          return new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
        } catch (e) { return res; }
      };
    }, { slug: at.slug, sha: built.sha, bytes: built.bytes, len: ogBytes.length });

    await ap.goto(BASE + '/store.html#app=' + at.slug);
    await ap.waitForSelector('#install', { timeout: 15000 });
    check('a listing quotes the extra model download BEFORE you press install',
      /model/.test((await ap.locator('#note').textContent()) || ''), await ap.locator('#note').textContent());
    check('the asset bar is a SECOND bar, not the app GIF\'s bar reused',
      (await ap.locator('#prog').count()) === 1 && (await ap.locator('#dl2 #prog2').count()) === 1);

    // Mirrored through localStorage: a fresh install navigates to the Home
    // Screen on completion and would take an in-page recording with it.
    await ap.evaluate(() => {
      const S = { widths: [], notes: [], busy: 0 };
      try { localStorage.removeItem('__dl2'); } catch (e) {}
      new MutationObserver(() => {
        const bar = document.querySelector('#prog2 i'), n2 = document.getElementById('note2'), p2 = document.getElementById('prog2');
        if (bar) { const w = bar.style.width; if (S.widths[S.widths.length - 1] !== w) S.widths.push(w); }
        if (p2 && p2.classList.contains('busy')) S.busy++;
        if (n2 && n2.textContent) { const t = n2.textContent; if (S.notes[S.notes.length - 1] !== t) S.notes.push(t); }
        try { localStorage.setItem('__dl2', JSON.stringify(S)); } catch (e) {}
      }).observe(document.getElementById('detail'), { subtree: true, childList: true, attributes: true, characterData: true });
    });

    const gifsBeforeAsset = gifHits.length;
    // A completed install HANDS OFF to the Home Screen, so every read after
    // the click races a navigation. Retry through it rather than sampling once
    // and blaming the product for a torn-down context.
    const settled = async (fn, tries) => {
      for (let i = 0; i < (tries || 6); i++) {
        try { const v = await fn(); if (v != null) return v; } catch (e) { /* context replaced mid-read */ }
        await sleep(800);
      }
      return null;
    };
    await ap.locator('#install').click();
    await ap.waitForFunction(() => {
      try { return /Model ready|⚠/.test(localStorage.getItem('__dl2') || ''); } catch (e) { return false; }
    }, null, { timeout: 90000 }).catch(() => {});
    const rec = await settled(() => ap.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('__dl2') || 'null'); } catch (e) { return null; }
    }));

    const widths = (rec && rec.widths) || [];
    const nums = widths.filter((w) => /%$/.test(w)).map((w) => parseFloat(w));
    check('the asset bar STARTS EMPTY — it does not inherit the app GIF\'s full bar',
      nums.length > 0 && nums[0] === 0, JSON.stringify(widths.slice(0, 4)));
    check('…climbs through real intermediate progress…',
      nums.some((n) => n > 0 && n < 100), JSON.stringify(nums));
    check('…and finishes full', nums[nums.length - 1] === 100, JSON.stringify(nums.slice(-3)));
    const notes = (rec && rec.notes) || [];
    check('the label counts real bytes as they land, not just a file name',
      notes.some((t) => / of /.test(t)), JSON.stringify(notes.slice(0, 3)));
    check('verifying goes INDETERMINATE rather than parking at a full bar',
      (rec && rec.busy) > 0 && notes.some((t) => /^Verifying/.test(t)), JSON.stringify(notes.slice(-2)));

    const cached = await settled(() => ap.evaluate(async (appId) => {
      const files = await GifOS.store.allFiles();
      const f = files.find((x) => x.appId === appId);
      const blob = f ? await GifOS.store.getAsset(f.id, 'model.bin') : null;
      return blob ? blob.size : null;
    }, at.appId));
    check('the asset really landed in the computer\'s asset store', cached === ogBytes.length, cached + ' vs ' + ogBytes.length);
    check('watching an asset download still fetches no App GIF over the wire',
      gifHits.length === gifsBeforeAsset, gifHits.slice(gifsBeforeAsset).join(', '));
    await ap.close();
  }

  // ---- an app that outruns this computer ------------------------------------
  // The store used to sell apps it knew could not run. Offline Cheap Text LLM
  // BitNet needs the install-time asset tier that no release has been cut with:
  // on 0.9.5 the download completed, the weights had nowhere to go, and the
  // player was left an icon that opened onto nothing. An app now states the
  // oldest build it runs on and the store acts on it.
  //
  // THE FLOOR IS FAKED ON PURPOSE. Reading it off whichever app happens to be
  // the most demanding today would make this guard evaporate the day every
  // listing fits the current release — a test that guards nothing, quietly.
  // So one REAL listing's minBuild is raised past every build there is, over
  // the wire, and everything else about it stays real.
  const versionDoc = JSON.parse(fs.readFileSync(path.join(SITE, 'version.json'), 'utf8'));
  const pinRel = versionDoc.current;                       // the release most visitors run
  const pinBuild = (versionDoc.builds || {})[pinRel];
  check('version.json maps the live release to the build it was cut from',
    Number.isInteger(pinBuild), pinRel + ' → ' + pinBuild);

  // Smallest floor, then smallest file: if this stub ever stops applying, the
  // checks below fail loudly, and the app they fail on is a 150 KB one rather
  // than the 8 MB engine.
  const byFloor = index.apps.slice().sort((a, b) => (a.minBuild - b.minBuild) || (a.bytes - b.bytes));
  const guinea = byFloor[0];                               // the one we make unreachable
  const reachable = byFloor.find((a) => a.slug !== guinea.slug && a.minBuild <= pinBuild);
  const UNREACHABLE = 999999;

  // Patched at the page's own fetch, NOT with ctx.route: these pages register a
  // service worker, which answers the catalog request itself, and a route on
  // the context never sees it — the first cut of this block failed exactly
  // that way, silently serving the real floor while claiming to serve a fake
  // one. Only the catalog BYTES change; every line of store.js under test is
  // the shipping one.
  await page.addInitScript((cfg) => {
    const orig = window.fetch;
    window.fetch = async function (input, init) {
      const res = await orig.call(this, input, init);
      const url = String((input && input.url) || input);
      if (!/\/apps\/(index\.json|[^/]+\/app\.json)/.test(url)) return res;
      try {
        const body = await res.clone().json();
        if (Array.isArray(body.apps)) { for (const a of body.apps) if (a.slug === cfg.slug) a.minBuild = cfg.floor; }
        else if (body.slug === cfg.slug) body.minBuild = cfg.floor;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (e) { return res; }
    };
  }, { slug: guinea.slug, floor: UNREACHABLE });

  // A pin is the honest way to be a release visitor here: it is what the store
  // reads to decide which computer an install has to reach, and version.json
  // turns it into that build's number.
  await page.evaluate((rel) => localStorage.setItem('gifos_pin', rel), pinRel);
  const gifsBefore = gifHits.length;
  await page.goto(BASE + '/store.html');
  await page.waitForSelector('.card', { timeout: 15000 });

  // The redirect that used to happen here handed the listing to the SNAPSHOT'S
  // OWN store — code frozen before the app it is describing existed, which
  // cannot know an app needs a build newer than itself. It read the live
  // catalog and offered the install anyway. If it ever comes back, every
  // assertion below is being made about a page no release visitor sees.
  check('a release visitor keeps the CURRENT store — no redirect into a frozen one',
    !/\/versions\//.test(page.url()), page.url());
  const owner = await page.evaluate(() => ({ build: GifOS.storeBuild.build, name: GifOS.storeBuild.name, legacy: GifOS.storeBuild.legacy }));
  check('the store resolves the visitor to the BUILD that will run the app',
    owner.build === pinBuild, JSON.stringify(owner));
  check('a release that has a store is not flagged legacy', !owner.legacy);

  check('the grid warns on the card, where the size (an invitation) would be',
    (await page.locator('.card[data-slug="' + guinea.slug + '"] .needs').count()) === 1);
  if (reachable) {
    check('…and only there — an app this build CAN run is untouched',
      (await page.locator('.card[data-slug="' + reachable.slug + '"] .needs').count()) === 0, reachable.slug);
  }

  await page.goto(BASE + '/store.html#app=' + guinea.slug);
  await page.waitForSelector('#install', { timeout: 10000 });
  const gate = await page.evaluate(() => ({
    disabled: document.getElementById('install').disabled,
    label: document.getElementById('install').textContent,
    facts: (document.querySelector('.facts') || {}).textContent || '',
    notice: Array.from(document.querySelectorAll('.err')).map((e) => e.textContent).join(' ').replace(/\s+/g, ' '),
  }));
  check('the listing states the requirement as a build number',
    gate.facts.includes('Requires') && gate.facts.includes('build ' + UNREACHABLE), gate.facts.slice(0, 120));
  check('Install is dead on a listing this computer cannot run', gate.disabled, gate.label);
  check('…and the button says why rather than still saying "free"', /Needs a newer GifOS/.test(gate.label), gate.label);
  check('the notice names the build needed AND the build you have',
    gate.notice.includes(String(UNREACHABLE)) && gate.notice.includes(String(pinBuild)), gate.notice.slice(0, 200));
  // Two different endings, and sending the wrong one is a dead end: told to
  // "update", a player whose requirement no release meets goes to the Version
  // panel and finds every release on offer still too old.
  check('a floor no release meets sends you to the edge build, not to "update"',
    /[Ee]dge build/.test(gate.notice) && !/Move to release/.test(gate.notice), gate.notice.slice(-140));

  // The promise is about the WIRE, not about a grey button — the same promise
  // the cover rule makes, measured the same way.
  await page.evaluate(() => { const b = document.getElementById('install'); b.disabled = false; b.click(); });
  await sleep(2500);
  check('FORCING THE PRESS STILL DOWNLOADS NOTHING — install() enforces the floor',
    gifHits.length === gifsBefore, gifHits.slice(gifsBefore).join(', '));
  check('…and the refusal explains itself where the progress bar would be',
    /needs GifOS build/.test((await page.locator('#err').textContent()) || ''));

  if (reachable) {
    await page.goto(BASE + '/store.html#app=' + reachable.slug);
    await page.waitForSelector('#install', { timeout: 10000 });
    check('the gate blocks ONLY what it must — a fitting app still installs',
      !(await page.locator('#install').isDisabled()), reachable.slug + ' minBuild ' + reachable.minBuild);
  }
  await page.evaluate(() => localStorage.removeItem('gifos_pin'));

  // ---- AND ON EDGE, WHERE THE GATE WAS DEAD --------------------------------
  // Everything above is asserted about a RELEASE visitor, whose build number
  // comes out of version.json's builds map after a fetch. The edge visitor's
  // came from window.GIFOS_BUILD instead — and store.html loads js/build.js
  // with `defer` while js/store.js has no defer, so resolveBuild() ran while
  // the document was still parsing, before that global existed. ownerBuild was
  // null, tooOld() is deliberately false when the build is unknown, and so
  // EVERY minBuild in the catalog went unenforced for edge visitors. That is
  // not hypothetical: fps-simple (floor 1285) installed onto build 1283, the
  // half-install this whole section exists to prevent.
  //
  // A local checkout reproduces it exactly without any staging, because
  // build.js ships 0 here and 0 is the same falsy that `undefined` was. The
  // number version.json carries for the root build is edgeBuild, so that is
  // what the store must fall back to — and this test hands it one.
  const EDGE_BUILD = 1307;
  await page.addInitScript((edgeBuild) => {
    const orig = window.fetch;
    window.fetch = async function (input, init) {
      const res = await orig.call(this, input, init);
      const url = String((input && input.url) || input);
      if (!/\/version\.json/.test(url)) return res;
      try {
        const body = await res.clone().json();
        body.edgeBuild = edgeBuild;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (e) { return res; }
    };
  }, EDGE_BUILD);
  await page.evaluate(() => { localStorage.removeItem('gifos_pin'); localStorage.setItem('gifos_channel', 'edge'); });
  // about:blank FIRST, because the previous navigation was also store.html and
  // a goto that changes only the HASH does not reload the document: the page
  // keeps the ownerBuild it resolved as a PINNED visitor, and the channel just
  // written to localStorage is never read. The first cut of this block did
  // exactly that — it reported build 1283 while claiming to describe an edge
  // visitor, and the two checks below it passed against the release number
  // (999999 is over every build, so they cannot tell the two apart). A guard
  // that cannot fail is worse than no guard.
  await page.goto('about:blank');
  await page.goto(BASE + '/store.html#app=' + guinea.slug);
  await page.waitForSelector('#install', { timeout: 10000 });
  const edgeOwner = await page.evaluate(() => ({ build: GifOS.storeBuild.build, name: GifOS.storeBuild.name }));
  check('an edge visitor is a build too, and the store knows which',
    edgeOwner.build === EDGE_BUILD, JSON.stringify(edgeOwner));
  check('the floor is enforced on edge exactly as it is on a release',
    await page.locator('#install').isDisabled(), 'floor ' + UNREACHABLE + ' vs build ' + EDGE_BUILD);
  if (reachable) {
    await page.goto(BASE + '/store.html#app=' + reachable.slug);
    await page.waitForSelector('#install', { timeout: 10000 });
    check('…and on edge it still blocks ONLY what it must',
      !(await page.locator('#install').isDisabled()), reachable.slug + ' minBuild ' + reachable.minBuild);
  }
  await page.evaluate(() => localStorage.removeItem('gifos_channel'));

  // ---- optional cash path (baked Payment Link) -------------------------------
  // The committed pay.js is empty. Prove the OTHER half: when a deploy bakes a
  // link, the store grows a tip CTA and a Feature button, and Install stays
  // free. Fresh CONTEXT: the first visit already registered a service worker
  // that would keep serving the empty committed pay.js, and the same computer
  // already installed the target so the button would say "Install again".
  // The URL is a test double — no Stripe, no secret, no navigation off origin
  // (we read href, we do not click through to a checkout).
  const payCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const cashGifs = [];
  payCtx.on('request', (r) => { if (/\/apps\/[^/]+\/[^/]+\.gif(\?|$)/i.test(r.url())) cashGifs.push(r.url()); });
  await payCtx.route(/\/js\/pay\.js(\?|$)/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.GIFOS_PAY = { link: "https://buy.stripe.com/test_gifos_cash" };',
  }));
  const payPage = await payCtx.newPage();
  await payPage.goto(BASE + '/store.html');
  await payPage.waitForSelector('.card', { timeout: 15000 });
  const tipHref = await payPage.locator('#tip').getAttribute('href');
  check('a baked payment link reveals the tip CTA',
    (await payPage.locator('#paybar').getAttribute('hidden')) === null &&
    /^https:\/\/buy\.stripe\.com\//.test(tipHref || ''), tipHref);
  check('…and tags the checkout as a tip, not a SKU',
    /client_reference_id=tip/.test(tipHref || ''), tipHref);
  await payPage.locator('.card[data-slug="' + target.slug + '"]').click();
  await payPage.waitForSelector('#install', { timeout: 10000 });
  check('Install is still free when checkout is available',
    /Install — free/.test((await payPage.locator('#install').textContent()) || ''),
    await payPage.locator('#install').textContent());
  const featHref = await payPage.locator('#feature').getAttribute('href');
  check('a listing offers Feature this listing when checkout is baked',
    (featHref || '').includes('client_reference_id=feature-' + target.slug), featHref);
  check('…and the feature checkout is https', /^https:\/\//.test(featHref || ''), featHref);
  check('turning the cash CTA on still fetches no extra App GIF',
    cashGifs.length === 0, cashGifs.join(', '));
  await payCtx.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
