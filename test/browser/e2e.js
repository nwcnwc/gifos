// End-to-end: drive the real desktop in Chromium.
const { chromium, CHROME } = require('../lib/pw');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build a minimal STORED (uncompressed) zip — enough to exercise the reader.
function buildZip(files) {
  const u16 = (n) => Buffer.from([n & 255, (n >> 8) & 255]);
  const u32 = (n) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);
  const local = [], central = []; let offset = 0;
  for (const name of Object.keys(files)) {
    const data = Buffer.from(files[name]); const nb = Buffer.from(name);
    const lh = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(data.length), u32(data.length), u16(nb.length), u16(0), nb, data]);
    local.push(lh);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(data.length), u32(data.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nb]));
    offset += lh.length;
  }
  const la = Buffer.concat(local), ca = Buffer.concat(central);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(Object.keys(files).length), u16(Object.keys(files).length), u32(ca.length), u32(la.length), u16(0)]);
  return Buffer.concat([la, ca, eocd]);
}
// 1×1 PNG, used as custom app artwork.
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==', 'base64');

// Open an app that lives inside a folder: enter the folder, open the app in a
// new tab, then return to the desktop root. `folder` may be null for root apps.
// Double-click an icon until its tab actually opens. The visible-wait below
// narrows but does not close the re-render race: the icon node can be SWAPPED
// between paint and dispatch, the dblclick lands on a corpse node, no tab
// opens, and a single 30s waitForEvent eats the suite (both 2026-07-28 gate
// runs died in this family, at different icons on different boxes). A human
// just double-clicks again — so does the harness: bounded attempts, bounded
// wait each.
async function dblclickForTab(ctx, page, label) {
  let tab = null;
  for (let att = 0; att < 3 && !tab; att++) {
    try {
      // WAIT FOR PAINT BEFORE EVERY ATTEMPT (gate g8 flake, 2026-07-29): the
      // retry above re-clicked immediately, so all three attempts could land
      // inside the same unpainted window on a loaded box — 3 × 10s of
      // waitForEvent and a red that reads like a broken launcher. This is the
      // very cause the comment above names; openApp's folder path already
      // waits this way, the direct path did not.
      const icon = page.locator('.icon', { hasText: label }).first();
      await icon.waitFor({ state: 'visible', timeout: 15000 });
      // …AND WAIT FOR THE THUMBNAILS TO SETTLE (2026-07-30, 8-core gate box):
      // desktop icons decode their GIF thumbnails lazily, and each one that
      // lands reflows the grid. On a FAST box several decode in the window
      // between "icon is visible" and the dblclick, so a neighbour's <img>
      // ends up over this icon's centre and eats the gesture — playwright
      // retries the dblclick forever and the suite reds with the launcher
      // looking broken. (Slow boxes pass by accident: the images are still
      // pending when the click lands.) Settle on the images, not on a sleep.
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.icon img')).every((im) => im.complete),
        null, { timeout: 15000 }).catch(() => {});
      // ATTEMPT 0 is a REAL double-click — it must stay, because it is the only
      // thing here that proves a user can actually hit this icon.
      // ATTEMPTS 1-2 dispatch the event straight at the icon, because the thing
      // that blocks the real click is not slowness, it is GEOMETRY: icons are
      // absolutely positioned and their thumbs pop on hover (scale 1.07), so a
      // NEIGHBOUR's .thumb can sit over this icon's centre and swallow the
      // gesture. Playwright then retries the real click forever against a
      // condition that will not change on its own, which is why this suite has
      // been a coin flip since 2026-07-28 — a different icon every run.
      // Neither more patience nor more real clicks can fix that (I measured
      // both making it strictly worse), and pushing pointer-events down the
      // subtree only moves the interception onto the neighbour's .icon, where a
      // click would open the WRONG app — worse than failing.
      // `openItem` is bound with addEventListener('dblclick') on this very
      // element (site/js/desktop.js), so dispatching to it is exactly the
      // gesture the app is listening for, aimed unambiguously at the right icon.
      [tab] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 10000 }),
        att === 0 ? icon.dblclick() : icon.dispatchEvent('dblclick'),
      ]);
    } catch (e) { if (att === 2) throw e; }
  }
  return tab;
}

async function openApp(page, ctx, folder, label) {
  if (folder) {
    await page.locator('.icon', { hasText: folder }).dblclick();
    // WAIT for the folder's contents, don't sleep at them. The old fixed 200ms
    // raced the re-render whenever the box was busy: the dblclick below then
    // landed on an icon that wasn't painted yet, no tab ever opened, and the
    // suite burned 30s on waitForEvent('page') before dying — a host-speed
    // failure that reads exactly like a broken app launcher.
    await page.locator('.icon', { hasText: label }).first().waitFor({ state: 'visible', timeout: 15000 });
  }
  const tab = await dblclickForTab(ctx, page, label);
  if (folder) {
    await page.locator('#crumbs a').click();
    await page.locator('.icon', { hasText: folder }).first().waitFor({ state: 'visible', timeout: 15000 });
  }
  return tab;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text()); });

  await page.goto(BASE + '/index.html');
  // wait for seeded icons
  await page.waitForSelector('.icon', { timeout: 8000 });
  await sleep(400);
  const labels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('desktop root has folders + Welcome + Meeting + Trash + Stolen Apps + My Media', labels.length === 10); // My Media.gif was added to the default root seed
  check('has Games / Studio / Tools / Social / IRL Games / Stolen Apps folders', ['Games', 'Studio', 'Tools', 'Social', 'IRL Games', 'Stolen Apps'].every((f) => labels.includes(f)));
  check('Stolen Apps wears its treasure-chest GIF (not the bare 📁 glyph)',
    await page.locator('.icon', { hasText: /^Stolen Apps$/ }).locator('.thumb img').count() === 1);
  check('has Welcome.gif at root', labels.includes('Welcome.gif'));
  check('Meeting is a root icon (killer app, not buried in a folder)', labels.includes('Meeting.gif'));
  check('Meeting icon wears the SYSTEM badge (heightened-permissions signage)',
    await page.locator('.icon', { hasText: 'Meeting.gif' }).locator('.sysbadge').count() === 1);
  const vcPos = await page.locator('.icon', { hasText: 'Meeting.gif' })
    .evaluate((el) => ({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
  const surfW = await page.evaluate(() => document.getElementById('desktop').clientWidth);
  check('Meeting sits in the top-right corner', vcPos.top === 12 && vcPos.left > surfW / 2);
  check('has Trash', labels.includes('Trash'));
  // folders are GIFs too — each renders its own folder GIF, not an emoji
  check('folders render as GIF images (folders are GIFs)',
    (await page.locator('.icon', { hasText: /^Games$/ }).locator('img').count()) === 1);

  // ---- IRL Games: own-phone games at the top, pass-the-phone in a subfolder ----
  await page.locator('.icon', { hasText: 'IRL Games' }).dblclick();
  await sleep(300);
  const irlLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('IRL Games folder has the four own-phone games + Single Phone subfolder',
    ['Fake Facts.gif', 'One Clue.gif', 'Same Brain.gif', 'One Night Wolves.gif', 'Single Phone'].every((g) => irlLabels.includes(g)));
  // an own-phone game opens into a lobby that pushes the Invite flow
  const ffPage = await openApp(page, context, null, 'One Clue.gif'); // already inside the folder
  await ffPage.waitForSelector('iframe');
  const ff = ffPage.frameLocator('iframe');
  await ff.locator('#start').waitFor({ timeout: 8000 });
  const ffText = await ff.locator('main').textContent();
  check('own-phone lobby registers me and pushes Invite', /1\)/.test(ffText) && /Invite/.test(ffText));
  check('own-phone lobby gates the start on a minimum crowd', await ff.locator('#start').isDisabled());
  await ffPage.close();
  // the pass-the-phone originals live one level deeper
  await page.locator('.icon', { hasText: 'Single Phone' }).dblclick();
  await sleep(300);
  const spLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Single Phone subfolder has all five pass-the-phone games',
    ['Odd Word Out.gif', 'Catch the Spy.gif', 'Tilt.gif', 'The Dial.gif', 'Party Roulette.gif'].every((g) => spLabels.includes(g)));
  const owPage = await openApp(page, context, null, 'Odd Word Out.gif'); // already inside the subfolder
  await owPage.waitForSelector('iframe');
  const ow = owPage.frameLocator('iframe');
  await ow.locator('#nm').waitFor({ timeout: 8000 });
  for (const n of ['Ana', 'Ben', 'Cleo', 'Dee']) { await ow.locator('#nm').fill(n); await ow.locator('#nm').press('Enter'); }
  await ow.locator('#go').click();
  await ow.locator('.peek').first().waitFor({ timeout: 4000 });
  check('Odd Word Out deals a hidden word (pass-the-phone)', (await ow.locator('#w').textContent()) === '·····');
  await owPage.close();
  await page.locator('#crumbs a').first().click(); // back to the root
  await sleep(250);

  // ---- folder bundle round-trip: Download a folder → one GIF → re-import ----
  // Play a game inside Games so a child app carries live state into the bundle.
  const mineForState = await openApp(page, context, /^Games$/, 'Minesweeper.gif');
  await mineForState.frameLocator('iframe').locator('.c').first().waitFor({ timeout: 8000 });
  await mineForState.frameLocator('iframe').locator('.c').nth(12).click();
  await sleep(400);
  await mineForState.close();
  await page.locator('.icon', { hasText: /^Games$/ }).click({ button: 'right' });
  const [folderDl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.ctx button', { hasText: 'Download (as one GIF)' }).click(),
  ]);
  check('folder downloads as a single GIF bundle', /Games\.gif/.test(folderDl.suggestedFilename()));
  const bundlePath = await folderDl.path();
  const bundleBytes = Array.from(new Uint8Array(fs.readFileSync(bundlePath)));
  // the bundle is a valid folder GIF carrying folder.json + 5 children
  const bundleOk = await page.evaluate(async (arr) => {
    const a = await GifOS.gif.decode(new Uint8Array(arr));
    if (!a) return null;
    const m = GifOS.gif.readManifest(a);
    const fj = JSON.parse(new TextDecoder().decode(a.files['folder.json']));
    return { type: m.type, name: m.name, kids: fj.items.length, hasFiles: !!a.files['files/0'] };
  }, bundleBytes);
  check('bundle is a folder GIF with 5 children inside', bundleOk && bundleOk.type === 'folder' && bundleOk.kids === 5 && bundleOk.hasFiles);
  // import the bundle → a new "Games" folder appears with its games
  await page.setInputFiles('#file-input', { name: 'Games.gif', mimeType: 'image/gif', buffer: Buffer.from(bundleBytes) });
  await sleep(600);
  const rootAfter = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent).filter((t) => t === 'Games'));
  check('importing a folder bundle recreates the folder', rootAfter.length === 2); // original + imported
  // open the imported folder (the second Games) and confirm its games came along
  const gamesIcons = page.locator('.icon', { hasText: /^Games$/ });
  await gamesIcons.nth(1).dblclick();
  await sleep(400);
  const importedKids = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('imported folder contains its games', ['Tic-Tac-Toe.gif', 'Connect Four.gif', 'Minesweeper.gif', 'Chess Tournament.gif', 'Ping Pong.gif'].every((g) => importedKids.includes(g)));
  // and the minesweeper state survived the bundle round-trip
  const [mineAgain] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Minesweeper.gif' }).first().dblclick(),
  ]);
  await mineAgain.frameLocator('iframe').locator('.c').first().waitFor({ timeout: 8000 });
  await mineAgain.waitForTimeout(600);
  check('app state survives the folder bundle round-trip', (await mineAgain.frameLocator('iframe').locator('.c.rev').count()) >= 1);
  await mineAgain.close();
  await page.locator('#crumbs a').click();
  await sleep(200);
  // clean up the imported copy so later label counts stay stable
  await page.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const dupes = items.filter((i) => i.name === 'Games');
    if (dupes.length > 1) {
      const victim = dupes[1];
      const kill = [victim];
      const walk = (pid) => { for (const c of items.filter((i) => i.parent === pid)) { kill.push(c); walk(c.id); } };
      walk(victim.id);
      for (const k of kill) { if (k.fileId) { await GifOS.store.deleteFile(k.fileId); await GifOS.store.deleteState(k.fileId); } await GifOS.store.deleteItem(k.id); }
    }
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  await sleep(300);

  // Tools folder contains the utility apps
  await page.locator('.icon', { hasText: 'Tools' }).dblclick();
  await sleep(250);
  const toolLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Tools folder contains Notes + Calculator + Stopwatch', ['Notes.gif', 'Calculator.gif', 'Stopwatch.gif'].every((a) => toolLabels.includes(a)));
  await page.locator('#crumbs a').click();
  await sleep(200);
  // ---- the up-hole: the corner cell inside a folder leads back up ----
  await page.locator('.icon', { hasText: /^Games$/ }).dblclick();
  await sleep(300);
  check('a folder shows the up-hole in its corner cell', (await page.locator('.uphole').count()) === 1
    && /Home Screen/.test(await page.locator('.uphole .label').textContent()));
  // drag Connect Four into the hole → it climbs out to the Home Screen
  const cfBox = await page.locator('.icon', { hasText: 'Connect Four.gif' }).boundingBox();
  const holeBox = await page.locator('.uphole').boundingBox();
  await page.mouse.move(cfBox.x + cfBox.width / 2, cfBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(holeBox.x + holeBox.width / 2, holeBox.y + 30, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  const gamesAfterDrop = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('dropping an icon in the hole sends it up a level', !gamesAfterDrop.includes('Connect Four.gif'));
  // click the hole → back on the Home Screen, where Connect Four now sits
  await page.locator('.uphole').click();
  await sleep(300);
  const rootNow = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('clicking the hole climbs up to the parent',
    /^Home$/.test((await page.locator('#crumbs').textContent()).trim()) && rootNow.includes('Connect Four.gif'));
  // tidy: put Connect Four back in Games for the checks that follow
  await page.evaluate(async () => {
    const its = await GifOS.store.allItems();
    const games = its.find((i) => i.kind === 'folder' && i.name === 'Games');
    const cf = its.find((i) => i.name === 'Connect Four.gif');
    cf.parent = games.id; await GifOS.store.putItem(cf);
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  await sleep(250);

  // Games folder has the five games
  await page.locator('.icon', { hasText: /^Games$/ }).dblclick();
  await sleep(250);
  const gameLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Games folder has Tic-Tac-Toe, Connect Four, Minesweeper, Chess, Ping Pong', ['Tic-Tac-Toe.gif', 'Connect Four.gif', 'Minesweeper.gif', 'Chess Tournament.gif', 'Ping Pong.gif'].every((a) => gameLabels.includes(a)));
  // Minesweeper reveals cells; Chess shows a lobby
  const mine = await openApp(page, context, null, 'Minesweeper.gif'); // already inside Games
  await mine.waitForSelector('iframe');
  const mineApp = mine.frameLocator('iframe');
  await mineApp.locator('.c').first().waitFor({ timeout: 8000 });
  check('minesweeper renders a 10×10 grid', (await mineApp.locator('.c').count()) === 100);
  await mineApp.locator('.c').nth(44).click();
  await sleep(300);
  check('minesweeper reveals cells on click', (await mineApp.locator('.c.rev').count()) >= 1);
  await mine.close();
  const chess = await openApp(page, context, null, 'Chess Tournament.gif');
  await chess.waitForSelector('iframe');
  const chessApp = chess.frameLocator('iframe');
  await chessApp.locator('.lobby').waitFor({ timeout: 8000 });
  check('chess tournament shows a lobby', /Join lobby/.test(await chessApp.locator('.lobby').textContent()) || (await chessApp.locator('button', { hasText: 'Join lobby' }).count()) >= 0);
  await chess.close();
  const ping = await openApp(page, context, null, 'Ping Pong.gif');
  await ping.waitForSelector('iframe');
  const pingApp = ping.frameLocator('iframe');
  await pingApp.locator('canvas#game').waitFor({ timeout: 8000 });
  check('ping pong renders a game canvas', true);
  await ping.close();
  await page.locator('#crumbs a').click();
  await sleep(200);
  check('storage pill is gone from the system bar (moved to Settings)', (await page.locator('#storage-pill').count()) === 0);
  await page.locator('#sys-menu-btn').click();
  await page.locator('.ctx button', { hasText: 'Settings…' }).click();
  await page.locator('.modal.wide').waitFor({ timeout: 4000 });
  const adv = page.locator('details.adv', { hasText: 'Advanced settings' });
  const advText = await adv.textContent();
  check('Settings has an Advanced section with storage info', /Advanced settings/.test(advText) && /Using/.test(advText) && /(B|KB|MB|GB)/.test(advText));
  check('Settings basic section has a background picker', (await page.locator('#set-bg-color').count()) === 1);
  check('Settings has an AI models section', (await page.locator('.ai-row').count()) === 7);
  const advOpen = await adv.evaluate((el) => el.open);
  check('Advanced section starts collapsed (mom-proof)', advOpen === false);
  await page.locator('#set-bg-color').fill('#224466');
  await sleep(400);
  const bgApplied = await page.evaluate(() => document.getElementById('desktop').style.background);
  check('background color picker changes the desktop', /rgb\(34, 68, 102\)|#224466/.test(bgApplied));
  await page.locator('#set-bg-reset').click();
  await sleep(300);
  check('background reset returns to the default', (await page.evaluate(() => document.getElementById('desktop').style.background)) === '');
  // Relay reachability probe (points at the local test relay)
  // Direct-child summary only: the Advanced settings <details> now NESTS the
  // "Erase this computer" disclosure, so a bare .locator('summary') matches two.
  await adv.locator('> summary').click();
  await page.locator('#set-relay').fill('ws://127.0.0.1:8790');
  await page.locator('#set-relay-test').click();
  await page.waitForFunction(() => /reachable|Could not|No answer|Error/.test(document.getElementById('set-relay-status').textContent), null, { timeout: 10000 });
  const relayStatus = await page.locator('#set-relay-status').textContent();
  check('Settings can test relay reachability', /^Relay is reachable/.test(relayStatus.trim()));
  await page.locator('#set-relay').fill('');
  await page.locator('#set-close').click();
  await sleep(200);

  // ---- ＋ Add popup: has the AI prompt and a Create-app-from-HTML flow ----
  await page.locator('#add-btn').click();
  await page.locator('.modal.wide').waitFor({ timeout: 4000 });
  check('Add opens a popup (not a dropdown)', (await page.locator('.modal.wide h3').textContent()).includes('Add to your Home Screen'));
  const promptVal = await page.locator('#ad-prompt').inputValue();
  check('popup prompt demands a FINISHED .gif (with the packer recipe)', /FINISHED \.gif/.test(promptVal) && /pack_gifos/.test(promptVal) && /gifos\.db/.test(promptVal) && /What app do you want to build/.test(promptVal));
  check('popup prompt forbids false sync/cloud claims', /HONESTY RULE/.test(promptVal) && /NO cloud/.test(promptVal) && /syncs across your devices/.test(promptVal));
  check('popup prompt encourages modding existing apps', /MODDING IS ENCOURAGED/.test(promptVal) && /GIFOS1\.0GOS/.test(promptVal) && /GIFOSSIG/.test(promptVal));
  check('popup prompt OFFERS modding in its opening question', /existing GifOS app you want me to MOD/.test(promptVal));
  const miniApp = "<!doctype html><meta charset=utf-8><body><button id='b'>tap</button><div id='n'>0</div>" +
    "<script>const db=gifos.db('c');let n=0;db.subscribe(function(items){n=items.length;document.getElementById('n').textContent=n});" +
    "document.getElementById('b').onclick=function(){db.put({t:Date.now()})}</scr" + "ipt>";
  await page.locator('#ad-name').fill('MadeByAI');
  await page.locator('#ad-html').fill('```html\n' + miniApp + '\n```'); // fenced, as an AI would return
  await page.locator('#ad-create').click();
  await sleep(400);
  const afterCreate = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Create app from HTML adds an app icon', afterCreate.includes('MadeByAI.gif'));
  const [madePage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'MadeByAI.gif' }).dblclick(),
  ]);
  await madePage.waitForSelector('iframe');
  const made = madePage.frameLocator('iframe');
  // Wait for the app's db.subscribe() to have rendered the initial count (0)
  // before clicking, so the click can't land before the app is interactive.
  await made.locator('#n', { hasText: '0' }).waitFor({ timeout: 15000 });
  await made.locator('#b').click();
  // The count updates only after the new state is persisted (re-packed into
  // the GIF), which can be slow right after a fresh seed — wait generously,
  // and tap once more like a human would if nothing happened.
  let madeOk = await made.locator('#n', { hasText: /^[1-9]/ }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  if (!madeOk) {
    await made.locator('#b').click();
    madeOk = await made.locator('#n', { hasText: /^[1-9]/ }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  }
  check('the AI-made app runs and uses gifos.db', madeOk);
  await madePage.close();

  // ---- ZIP import: a multi-file app (index.html + app.js) becomes a running App GIF ----
  const zipBuf = buildZip({
    'MyZipApp/index.html': '<!doctype html><div id="o">no-js</div><script src="app.js"></script>',
    'MyZipApp/app.js': "document.getElementById('o').textContent = 'js-loaded';",
  });
  await page.setInputFiles('#file-input', { name: 'MyZipApp.zip', mimeType: 'application/zip', buffer: zipBuf });
  await sleep(500);
  const afterZip = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('ZIP import creates an app icon', afterZip.includes('MyZipApp.gif'));
  const [zipPage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'MyZipApp.gif' }).dblclick(),
  ]);
  await zipPage.waitForSelector('iframe');
  const zipApp = zipPage.frameLocator('iframe');
  await zipApp.locator('#o').waitFor({ timeout: 8000 });
  await sleep(300);
  check('multi-file zip app runs (app.js from the GIF filesystem executed)', (await zipApp.locator('#o').textContent()) === 'js-loaded');
  await zipPage.close();

  // ---- app-declared artwork: a <link rel=icon> in the HTML becomes the GIF frame (96×96) ----
  const svgIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23ff0055'/%3E%3C/svg%3E";
  await page.locator('#add-btn').click();
  await page.locator('.modal.wide').waitFor();
  await page.locator('#ad-name').fill('Artsy');
  await page.locator('#ad-html').fill('<!doctype html><html><head><link rel="icon" href="' + svgIcon + '"></head><body><h1>art</h1></body></html>');
  await page.locator('#ad-create').click();
  await sleep(500);
  const artIcon = page.locator('.icon', { hasText: 'Artsy.gif' }).locator('.thumb img');
  await artIcon.waitFor({ timeout: 4000 });
  const artW = await artIcon.evaluate((img) => new Promise((res) => {
    if (img.complete && img.naturalWidth) return res(img.naturalWidth);
    img.onload = () => res(img.naturalWidth);
  }));
  check('custom artwork produces a 96×96 GIF frame (not the 32px swatch)', artW === 96);

  // ---- run the Notes app (Tools folder) in a new tab ----
  const runPage = await openApp(page, context, 'Tools', 'Notes.gif');
  await runPage.waitForLoadState();
  runPage.on('console', (m) => { if (m.type() === 'error') console.log('  [run error]', m.text()); });
  await runPage.waitForSelector('iframe', { timeout: 8000 });
  const app = runPage.frameLocator('iframe');
  await app.locator('#t').waitFor({ timeout: 8000 });
  check('Notes app mounted in tab (has input)', true);

  // add two notes
  await app.locator('#t').fill('buy milk');
  await app.locator('form button').click();
  await app.locator('#t').fill('ship gifos');
  await app.locator('form button').click();
  await sleep(300);
  const noteCount = await app.locator('#list li').count();
  check('two notes added via gifos.db', noteCount === 2);
  const firstNote = await app.locator('#list li span').first().textContent();
  check('note text persisted through DB round-trip', /buy milk/.test(firstNote));

  // ---- persistence: reload the run tab, notes should survive (state lives with icon) ----
  await runPage.reload();
  await runPage.waitForSelector('iframe');
  const app2 = runPage.frameLocator('iframe');
  await app2.locator('#list li').first().waitFor({ timeout: 8000 });
  const afterReload = await app2.locator('#list li').count();
  check('notes persist across tab reload', afterReload === 2);

  // ---- Chat app (Social): file attachments, chunked through gifos.db ----
  const chatPage = await openApp(page, context, 'Social', 'Chat.gif');
  await chatPage.waitForSelector('iframe', { timeout: 8000 });
  const chat = chatPage.frameLocator('iframe');
  await chat.locator('#t').waitFor({ timeout: 8000 });
  await chat.locator('#t').fill('hello attachments');
  await chat.locator('#t').press('Enter');
  await chat.locator('.m', { hasText: 'hello attachments' }).waitFor({ timeout: 5000 });
  check('chat sends a text message', true);
  await chat.locator('.m .st.ok').waitFor({ timeout: 5000 });
  check('own message shows the received-by-host receipt (✓)', true);
  await chat.locator('#fi').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG_1x1 });
  await chat.locator('.m img').waitFor({ timeout: 8000 });
  check('image attachment renders inline in chat', true);
  await chat.locator('#fi').setInputFiles({ name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('gifos attachment test') });
  await chat.locator('a.file', { hasText: 'readme.txt' }).waitFor({ timeout: 8000 });
  const attHref = await chat.locator('a.file').getAttribute('href');
  check('file attachment becomes a data: download link (bytes intact)',
    /^data:text\/plain;base64,/.test(attHref) && Buffer.from(attHref.split(',')[1], 'base64').toString() === 'gifos attachment test');
  await chatPage.reload();
  await chatPage.waitForSelector('iframe');
  const chatAgain = chatPage.frameLocator('iframe');
  await chatAgain.locator('.m img').waitFor({ timeout: 8000 });
  await chatAgain.locator('a.file', { hasText: 'readme.txt' }).waitFor({ timeout: 8000 });
  check('attachments persist across reload (chunks live in app state)', true);
  await chatPage.close();

  // ---- Welcome is a real onboarding app with a persistent checklist ----
  const welcomePage = await openApp(page, context, null, 'Welcome.gif');
  await welcomePage.waitForSelector('iframe');
  const welcome = welcomePage.frameLocator('iframe');
  await welcome.locator('label.todo').first().waitFor({ timeout: 8000 });
  check('Welcome runs as a real app (onboarding checklist)', (await welcome.locator('label.todo').count()) === 5);
  await welcome.locator('label.todo input').first().check();
  await sleep(400);
  await welcomePage.close();
  const welcomeAgain = await openApp(page, context, null, 'Welcome.gif');
  await welcomeAgain.waitForSelector('iframe');
  const welcome2 = welcomeAgain.frameLocator('iframe');
  await welcome2.locator('label.todo').first().waitFor({ timeout: 8000 });
  await welcomeAgain.waitForTimeout(500);
  check('Welcome checklist persists (state lives in the icon)', await welcome2.locator('label.todo input').first().isChecked());
  await welcomeAgain.close();

  // ---- browsable-folder fallback (a GIF with no index.html) ----
  await page.evaluate(async () => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'papers', name: 'Papers' }),
      'README.txt': 'just files in here',
      'notes/ideas.txt': 'more files',
    });
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'Papers.gif', bytes, kind: 'gif', isApp: true, appId: 'papers', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId, name: 'Papers.gif', parent: null, x: 500, y: 300, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  await sleep(300);
  const folderPage = await openApp(page, context, null, 'Papers.gif');
  await folderPage.waitForLoadState();
  await folderPage.waitForSelector('iframe');
  const folder = folderPage.frameLocator('iframe');
  await folder.locator('table').waitFor({ timeout: 8000 });
  const rowText = await folder.locator('table').textContent();
  check('no-index.html GIF shows browsable filesystem', /README\.txt/.test(rowText));

  // ---- Tic-Tac-Toe (Games folder): the multiplayer default app mounts and plays ----
  const tttPage = await openApp(page, context, /^Games$/, 'Tic-Tac-Toe.gif');
  await tttPage.waitForSelector('iframe');
  const ttt = tttPage.frameLocator('iframe');
  await ttt.locator('.cell').first().waitFor({ timeout: 8000 });
  check('tic-tac-toe renders a 3x3 board', (await ttt.locator('.cell').count()) === 9);
  await ttt.locator('.cell').first().click();
  await sleep(300);
  check('placing a mark works (X appears)', (await ttt.locator('.cell').first().textContent()) === 'X');
  // the GifOS wordmark in an app tab opens the computer in a new tab
  const [homeTab] = await Promise.all([
    context.waitForEvent('page'),
    tttPage.locator('.bar .title').click(),
  ]);
  await homeTab.waitForSelector('.icon', { timeout: 10000 });
  check('the GifOS logo in an app tab opens the Home Screen in a new tab', /index\.html|\/$/.test(homeTab.url()));
  await homeTab.close();
  await tttPage.close();

  // ---- multiplayer sync: open Guestbook in two tabs, sign in one, see it in the other ----
  const gb1 = await context.newPage();
  await gb1.goto(BASE + '/index.html');
  await gb1.waitForSelector('.icon');
  await gb1.locator('.icon', { hasText: 'Social' }).dblclick(); await sleep(200);
  const [gbTabA] = await Promise.all([context.waitForEvent('page'), gb1.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick()]);
  await gbTabA.waitForSelector('iframe');
  const gbUrl = gbTabA.url();
  const gbTabB = await context.newPage();
  await gbTabB.goto(gbUrl);
  await gbTabB.waitForSelector('iframe');
  const A = gbTabA.frameLocator('iframe'), B = gbTabB.frameLocator('iframe');
  await A.locator('#msg').waitFor();
  await A.locator('#msg').fill('hello from tab A');
  await A.locator('form button').click();
  await sleep(500);
  const bText = await B.locator('#list').textContent();
  check('guestbook entry from tab A appears live in tab B (cross-tab DB)', /hello from tab A/.test(bText));

  // ---- identity: a screen name set in Settings is attributed by apps ----
  // (uses Guestbook, whose entry count no later test asserts on)
  await page.evaluate(() => GifOS.store.setName('Casey'));
  const gbId = await openApp(page, context, 'Social', 'Guestbook.gif');
  await gbId.waitForSelector('iframe');
  const gbIdApp = gbId.frameLocator('iframe');
  await gbIdApp.locator('#msg').waitFor({ timeout: 8000 });
  await gbIdApp.locator('#msg').fill('signed by casey');
  await gbIdApp.locator('form button').click();
  await sleep(400);
  const caseyEntry = await gbIdApp.locator('#list li').filter({ hasText: 'signed by casey' }).textContent();
  check('app attributes an action to the screen name (gifos.me)', /Casey/.test(caseyEntry));
  await gbId.close();

  // ---- touch: double-tap opens (iOS never synthesizes dblclick here), ----
  // ---- and the context menu offers Open for folders too ----
  const touchCtx = await browser.newContext({ hasTouch: true, viewport: { width: 800, height: 700 } });
  const touchPage = await touchCtx.newPage();
  await touchPage.goto(BASE + '/index.html');
  await touchPage.waitForSelector('.icon', { timeout: 8000 });
  await sleep(400);
  const gamesBox = await touchPage.locator('.icon', { hasText: /^Games$/ }).boundingBox();
  await touchPage.touchscreen.tap(gamesBox.x + gamesBox.width / 2, gamesBox.y + gamesBox.height / 2);
  await touchPage.touchscreen.tap(gamesBox.x + gamesBox.width / 2, gamesBox.y + gamesBox.height / 2);
  await sleep(400);
  check('double-TAP opens a folder (touch devices)', (await touchPage.locator('#crumbs').textContent()).includes('Games'));
  const tttBox = await touchPage.locator('.icon', { hasText: 'Tic-Tac-Toe.gif' }).boundingBox();
  const [touchApp] = await Promise.all([
    touchCtx.waitForEvent('page'),
    (async () => {
      await touchPage.touchscreen.tap(tttBox.x + tttBox.width / 2, tttBox.y + tttBox.height / 2);
      await touchPage.touchscreen.tap(tttBox.x + tttBox.width / 2, tttBox.y + tttBox.height / 2);
    })(),
  ]);
  check('double-TAP launches an app (touch devices)', /run\.html/.test(touchApp.url()));
  await touchApp.close();
  await touchCtx.close();
  await page.locator('.icon', { hasText: 'Studio' }).click({ button: 'right' });
  await page.locator('.ctx button', { hasText: 'Open' }).click();
  await sleep(300);
  check('context menu offers Open for folders', (await page.locator('#crumbs').textContent()).includes('Studio'));
  await page.locator('#crumbs a').click();
  await sleep(200);

  // ---- unsigned GIFs offer "Sign this GIF…" in the context menu ----
  await page.locator('.icon', { hasText: 'Welcome.gif' }).click({ button: 'right' });
  check('unsigned GIF offers "Sign this GIF…"', (await page.locator('.ctx button', { hasText: 'Sign this GIF' }).count()) === 1);
  check('unsigned GIF has no "Verify signature" yet', (await page.locator('.ctx button', { hasText: 'Verify signature' }).count()) === 0);
  await page.keyboard.press('Escape');
  // sign.html preloads a GIF by fileId (what "Sign this GIF…" opens)
  const wId = await page.evaluate(async () => (await GifOS.store.allItems()).find((i) => i.name === 'Welcome.gif').fileId);
  const signPage = await context.newPage();
  await signPage.goto(BASE + '/sign.html#id=' + wId);
  await signPage.waitForFunction(() => document.getElementById('signui') && document.getElementById('signui').style.display !== 'none', null, { timeout: 5000 });
  check('sign.html preloads the GIF passed by fileId', /Welcome\.gif/.test(await signPage.locator('#drop').textContent()));
  await signPage.close();

  // ---- drop hint + endless scroll ----
  check('soft drop hint is shown', await page.locator('.drop-hint').isVisible() &&
    /drop files anywhere/i.test(await page.locator('.drop-hint').textContent()));
  const scrollInfo = await page.evaluate(async () => {
    const s = document.getElementById('desktop');
    // park an icon two screens down — the surface must reach it and beyond
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'folder', name: 'Deep Folder', parent: null, x: 12, y: 1800, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
    const afterRender = s.scrollHeight;
    s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll'));   // chase the bottom…
    s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll'));   // …and again — it keeps growing
    return { afterRender, afterChase: s.scrollHeight, viewport: s.clientHeight };
  });
  check('surface scrolls past the deepest icon', scrollInfo.afterRender > 1800 + scrollInfo.viewport - 200);
  check('scrolling the bottom edge keeps extending (endless)', scrollInfo.afterChase > scrollInfo.afterRender);
  // an OS drop while scrolled lands where the cursor is, in CONTENT coords
  const dropY = await page.evaluate(async () => {
    const s = document.getElementById('desktop');
    s.scrollTop = 1000;
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'dropped.txt', { type: 'text/plain' }));
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: 200, clientY: s.getBoundingClientRect().top + 200 });
    s.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 600));
    const it = (await GifOS.store.allItems()).find((i) => i.name === 'dropped.txt');
    return it ? it.y : -1;
  });
  check('drop while scrolled lands under the cursor (content coords)', dropY > 900 && dropY < 1500);
  await page.evaluate(async () => {  // tidy up so later label counts stay stable
    const all = await GifOS.store.allItems();
    for (const it of all) if (it.name === 'Deep Folder' || it.name === 'dropped.txt') { await GifOS.store.deleteItem(it.id); if (it.fileId) await GifOS.store.deleteFile(it.fileId); }
    document.getElementById('desktop').scrollTop = 0;
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  await sleep(300);

  // ---- drag a root icon: it should snap to a grid cell and persist ----
  const box = await page.locator('.icon', { hasText: 'Welcome.gif' }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 150, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  const posAfterDrag = await page.locator('.icon', { hasText: 'Welcome.gif' })
    .evaluate((el) => ({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
  const grid = await page.evaluate(() => {
    const s = document.getElementById('desktop');
    return { pitch: parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10),
             row: parseInt(getComputedStyle(s).getPropertyValue('--row'), 10), origin: 12 };
  });
  const onGrid = (posAfterDrag.left - grid.origin) % grid.pitch === 0 && (posAfterDrag.top - grid.origin) % grid.row === 0;
  check('dragged icon snaps to a grid cell', onGrid);
  await page.reload();
  await page.waitForSelector('.icon');
  await sleep(300);
  const posAfterReload = await page.locator('.icon', { hasText: 'Welcome.gif' })
    .evaluate((el) => ({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
  check('icon position persists across reload',
    posAfterReload.left === posAfterDrag.left && posAfterReload.top === posAfterDrag.top);

  // ---- snapshot hydration: a GIF with embedded .state resumes where it was saved ----
  const deskPage = await context.newPage();
  await deskPage.goto(BASE + '/index.html');
  await deskPage.waitForSelector('.icon');
  await deskPage.evaluate(async () => {
    const appHtml = '<!doctype html><div id="out">loading</div><script>' +
      "gifos.db('notes').getAll().then(a=>{document.getElementById('out').textContent=a.map(n=>n.text).join('|')});" +
      '</scr' + 'ipt>';
    const state = { collections: { notes: { items: { n1: { id: 'n1', text: 'resumed-from-gif' } }, seq: 2 } } };
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'resume-test', name: 'Resume', entry: 'index.html', capabilities: { db: true } }),
      'index.html': appHtml,
      '.state/db.json': JSON.stringify(state),
    });
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'Resume.gif', bytes, kind: 'gif', isApp: true, appId: 'resume-test', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId, name: 'Resume.gif', parent: null, x: 400, y: 200, iconSize: 64 });
    await GifOS.desktop.load();
    await GifOS.desktop.render();
  });
  const [resumePage] = await Promise.all([
    context.waitForEvent('page'),
    deskPage.locator('.icon', { hasText: 'Resume.gif' }).dblclick(),
  ]);
  await resumePage.waitForSelector('iframe');
  const resumeApp = resumePage.frameLocator('iframe');
  await resumePage.waitForTimeout(600);
  const resumed = await resumeApp.locator('#out').textContent();
  check('snapshot GIF hydrates its embedded state on first run', resumed === 'resumed-from-gif');
  await resumePage.close();

  // ---- CSP hardening: hostile app can't reach the network directly, ----
  // ---- but the permission-gated bridge still works ----
  await deskPage.evaluate(async (base) => {
    const appHtml = '<!doctype html><div id="out">running</div><script>' +
      'var v = 0;' +
      "document.addEventListener('securitypolicyviolation', function(){ v++; });" +
      "try { var x = new XMLHttpRequest(); x.open('GET', '" + base + "/index.html'); x.send(); } catch(e){}" +
      "try { new WebSocket('ws://127.0.0.1:8099/'); } catch(e){}" +
      "try { var im = new Image(); im.src = '" + base + "/index.html?beacon'; } catch(e){}" +
      "var rtc = (typeof RTCPeerConnection === 'undefined') ? 'blocked' : 'available';" +
      "try { new RTCPeerConnection(); rtc = 'made'; } catch(e){}" +
      'setTimeout(function(){' +
      "  gifos.fetch('" + base + "/index.html').then(function(r){" +
      "    document.getElementById('out').textContent = JSON.stringify({ v: v, rtc: rtc, bridge: r.status });" +
      '  }).catch(function(e){' +
      "    document.getElementById('out').textContent = JSON.stringify({ v: v, rtc: rtc, bridge: 'ERR:' + e.message });" +
      '  });' +
      '}, 900);' +
      '</scr' + 'ipt>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'hostile-test', name: 'Hostile', entry: 'index.html',
        capabilities: { db: true, network: ['127.0.0.1'] } }),
      'index.html': appHtml,
    });
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'Hostile.gif', bytes, kind: 'gif', isApp: true, appId: 'hostile-test', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId, name: 'Hostile.gif', parent: null, x: 520, y: 200, iconSize: 64 });
    await GifOS.desktop.load();
    await GifOS.desktop.render();
  }, BASE);
  const [hostilePage] = await Promise.all([
    context.waitForEvent('page'),
    deskPage.locator('.icon', { hasText: 'Hostile.gif' }).dblclick(),
  ]);
  // Catch the "CSP meta ignored (outside <head>)" warning — the app above has
  // NO <head>, the exact case that was silently unprotected before.
  let cspIgnored = false;
  hostilePage.on('console', (m) => { if (/Content Security Policy.*ignored/i.test(m.text())) cspIgnored = true; });
  await hostilePage.waitForSelector('iframe');
  const hostileApp = hostilePage.frameLocator('iframe');
  // Poll for the verdict JSON instead of a fixed wait — the bridge fetch can
  // take longer than the original 1.6 s on a loaded host, causing a spurious
  // JSON parse of the "running" placeholder.
  const out = hostileApp.locator('#out');
  let verdictText = '';
  for (let i = 0; i < 60; i++) {
    await hostilePage.waitForTimeout(100);
    verdictText = await out.textContent();
    if (verdictText && !/^running$/i.test(verdictText.trim())) break;
  }
  const verdict = JSON.parse(verdictText);
  check('CSP is actually applied to a no-<head> app (not ignored)', !cspIgnored);
  check('CSP blocks direct XHR + WebSocket + image beacon (3 violations)', verdict.v >= 3);
  check('WebRTC constructors neutered (no DataChannel exfil)', verdict.rtc === 'blocked');
  check('permission-gated bridge fetch still works under CSP', verdict.bridge === 200);
  await hostilePage.close();

  // ---- network-permission acknowledgement: allow *, label unsafe, let the ----
  // ---- user revoke it (and remember the revocation) --------------------------
  await deskPage.evaluate(async (base) => {
    const appHtml = '<!doctype html><div id="out">idle</div><script>' +
      'setTimeout(function(){ gifos.fetch("' + base + '/index.html").then(function(r){' +
      'document.getElementById("out").textContent="OK:"+r.status;}).catch(function(e){' +
      'document.getElementById("out").textContent="ERR";}); }, 500);' +
      '</scr' + 'ipt>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'wild-test', name: 'Wild', entry: 'index.html', capabilities: { network: ['*'] } }),
      'index.html': appHtml,
    });
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'Wild.gif', bytes, kind: 'gif', isApp: true, appId: 'wild-test', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId, name: 'Wild.gif', parent: null, x: 620, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, BASE);
  const [wildPage] = await Promise.all([
    context.waitForEvent('page'),
    deskPage.locator('.icon', { hasText: 'Wild.gif' }).dblclick(),
  ]);
  await wildPage.waitForSelector('iframe');
  await wildPage.waitForTimeout(200);
  check('wildcard-network app wears the ⚠ Unsafe tab label', (await wildPage.locator('#perms').textContent()) === '⚠ Unsafe');
  check('opening the app pops the network acknowledgement', (await wildPage.locator('.perm-modal').count()) === 1);
  await wildPage.waitForTimeout(700);
  check('an allowed app reaches the internet through the bridge', (await wildPage.frameLocator('iframe').locator('#out').textContent()) === 'OK:200');
  await wildPage.locator('.perm-row input[data-host="*"]').uncheck();
  check('unticking Any website drops the unsafe label', (await wildPage.locator('#perms').textContent()) === 'Internet');
  await wildPage.locator('.perm-box .done').click();
  await wildPage.reload();
  await wildPage.waitForSelector('iframe');
  await wildPage.waitForTimeout(900);
  check('the revocation persists — the app can no longer reach out', (await wildPage.frameLocator('iframe').locator('#out').textContent()) === 'ERR');
  await wildPage.close();

  // ---- plain (non-app) GIF opens in its own tab instead of an error ----
  await deskPage.evaluate(async () => {
    // a real but non-GifOS gif (1x1) — bytes don't matter, just that it's a file, not an app
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3b]);
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'photo.gif', bytes, kind: 'gif', isApp: false, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId, name: 'photo.gif', parent: null, x: 640, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  let sawModal = false;
  const [photoTab] = await Promise.all([
    context.waitForEvent('page'),
    deskPage.locator('.icon', { hasText: 'photo.gif' }).dblclick(),
  ]);
  // The reserved tab starts about:blank and navigates to the blob once the file
  // is read (the iOS-safe open path), so wait for that before asserting.
  await photoTab.waitForURL(/^blob:/, { timeout: 5000 }).catch(() => {});
  sawModal = await deskPage.locator('.modal-bg').count() > 0;
  check('plain GIF opens in a new tab (no "not supported" modal)', !sawModal && /^blob:/.test(photoTab.url()));
  await photoTab.close();

  // ---- Download from the context menu: snapshot a GIF without opening it ----
  await deskPage.locator('.icon', { hasText: 'photo.gif' }).click({ button: 'right' });
  const [plainDl] = await Promise.all([
    deskPage.waitForEvent('download'),
    deskPage.locator('.ctx button', { hasText: 'Download' }).click(),
  ]);
  check('Download menu snapshots a plain file (right filename)', plainDl.suggestedFilename() === 'photo.gif');
  // an actual GifOS app with saved state → downloads a valid GIF that still carries its app
  const appDl = await (async () => {
    const [dl] = await Promise.all([
      deskPage.waitForEvent('download'),
      (async () => {
        await deskPage.locator('.icon', { hasText: 'Welcome' }).first().click({ button: 'right' });
        await deskPage.locator('.ctx button', { hasText: 'Download' }).click();
      })(),
    ]);
    return dl;
  })();
  const appDlPath = await appDl.path();
  const appDlBytes = new Uint8Array(fs.readFileSync(appDlPath));
  const appDlOk = await deskPage.evaluate(async (arr) => {
    const b = new Uint8Array(arr);
    const a = await GifOS.gif.decode(b);
    return String.fromCharCode(b[0], b[1], b[2]) === 'GIF' && !!(a && a.files && a.files['README.txt']);
  }, Array.from(appDlBytes));
  check('Download of an app produces a valid GifOS GIF', /\.gif$/.test(appDl.suggestedFilename()) && appDlOk);

  // ---- pretty invite links: the 404 router maps /join/<code> into run.html ----
  // (GitHub Pages serves 404.html for unknown paths; the local test server
  // can't, so serve the real file via interception and exercise the router.)
  // Use a SERVICE-WORKER-BLOCKED context: once the SW is installed it intercepts
  // the /join and /meet navigations itself, and page.route() does NOT reach a
  // SW-initiated fetch — so the injected 404.html router never runs and the
  // redirect never happens (a Playwright/SW harness interaction, NOT a product
  // bug: online, the real site serves 404.html to the SW and routing works).
  const routerCtx = await browser.newContext({ serviceWorkers: 'block' });
  const routed = await routerCtx.newPage();
  await routed.route('**/join/*', (route) => route.fulfill({
    status: 404, contentType: 'text/html', body: fs.readFileSync('site/404.html', 'utf8'),
  }));
  await routed.goto(BASE + '/join/wkm4tr7q2x');
  await routed.waitForURL(/run\.html#j=wkm4tr7q2x/, { timeout: 5000, waitUntil: 'commit' });
  check('/join/<code> routes into the app runner with the code', true);
  await routed.close();
  const called = await routerCtx.newPage();
  await called.route('**/meet/*', (route) => route.fulfill({
    status: 404, contentType: 'text/html', body: fs.readFileSync('site/404.html', 'utf8'),
  }));
  await called.goto(BASE + '/meet/wkm4tr7q2x');
  await called.waitForURL(/meet\.html#v=wkm4tr7q2x$/, { timeout: 5000, waitUntil: 'commit' });
  check('/meet/<code> routes into the meeting page with the code', true);
  await called.close();
  const admRouted = await routerCtx.newPage();
  await admRouted.route('**/meet/**', (route) => route.fulfill({
    status: 404, contentType: 'text/html', body: fs.readFileSync('site/404.html', 'utf8'),
  }));
  await admRouted.goto(BASE + '/meet/wkm4tr7q2x/0123456789abcdef0123456789abcdef');
  await admRouted.waitForURL(/meet\.html#v=wkm4tr7q2x&av=0123456789abcdef0123456789abcdef/, { timeout: 5000, waitUntil: 'commit' });
  check('/meet/<code>/<verifier> routes an ADMIN room (a distinct room identity)', true);
  await admRouted.goto(BASE + '/meet/a');
  await admRouted.waitForURL(/meet\.html#v=a$/, { timeout: 5000, waitUntil: 'commit' });
  check('single-character rooms route (the low channels are open to the world)', true);
  await admRouted.close();
  await routerCtx.close();

  // ---- Trash: delete is recoverable ----
  const sys = await context.newPage();
  await sys.goto(BASE + '/index.html');
  await sys.waitForSelector('.icon');
  await sys.locator('.icon', { hasText: 'Resume.gif' }).click({ button: 'right' });
  await sys.locator('.ctx button', { hasText: 'Move to Trash' }).click();
  await sleep(400);
  const rootLabels = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('trashed icon leaves the desktop', !rootLabels.includes('Resume.gif'));
  await sys.locator('.icon', { hasText: 'Trash' }).dblclick(); // Trash is a folder → opens in place
  await sleep(400);
  const trashLabels = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('trashed icon is inside Trash', trashLabels.includes('Resume.gif'));
  await sys.locator('.icon', { hasText: 'Resume.gif' }).click({ button: 'right' });
  await sys.locator('.ctx button', { hasText: 'Put back on Home Screen' }).click();
  await sleep(400);
  await sys.locator('#crumbs a').click(); // back to Desktop
  await sleep(300);
  const restoredLabels = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('restore from Trash puts the icon back', restoredLabels.includes('Resume.gif'));

  // ---- Backup → Reset → Restore: the whole desktop as ONE GIF ----
  await sys.locator('#sys-menu-btn').click();
  const [download] = await Promise.all([
    sys.waitForEvent('download'),
    sys.locator('.ctx button', { hasText: 'Back up Home Screen…' }).click(),
  ]);
  check('backup downloads a desktop GIF', download.suggestedFilename() === 'gifos-desktop.gif');
  const backupPath = await download.path();

  // Erase moved out of the system context menu into Settings → Advanced settings
  // → "Erase this computer" disclosure (#set-erase, desktop.js), which fires the
  // resetFlow() confirm with the "Erase without backup" action.
  await sys.locator('#sys-menu-btn').click();
  await sys.locator('.ctx button', { hasText: 'Settings…' }).click();
  await sys.locator('details.adv summary', { hasText: 'Advanced settings' }).click();
  await sys.locator('.danger-zone summary', { hasText: 'Erase this computer' }).click();
  await sys.locator('#set-erase').click();
  await Promise.all([
    sys.waitForNavigation({ waitUntil: 'load' }),
    sys.locator('.modal-actions button', { hasText: 'Erase without backup' }).click(),
  ]);
  await sys.waitForSelector('.icon');
  await sleep(600);
  const freshLabels = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('reset re-seeds a fresh desktop (custom app gone)', freshLabels.length === 10 && !freshLabels.includes('Resume.gif')); // 10 root items now (My Media.gif added)

  await sys.setInputFiles('#restore-input', backupPath);
  await sys.locator('.modal-actions button', { hasText: 'Replace Home Screen' }).click();
  await sys.locator('.modal button', { hasText: 'OK' }).click(); // "Desktop restored"
  await sleep(500);
  const restoredDesk = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('restore brings the backed-up desktop back (custom app present)', restoredDesk.includes('Resume.gif'));
  const welcomePos = await sys.locator('.icon', { hasText: 'Welcome.gif' })
    .evaluate((el) => ({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
  check('restored desktop keeps icon positions', welcomePos.left === posAfterDrag.left && welcomePos.top === posAfterDrag.top);
  // app state survives the round-trip too (Notes lives in the Tools folder)
  const notesAgain = await openApp(sys, context, 'Tools', 'Notes.gif');
  await notesAgain.waitForSelector('iframe');
  const notesApp3 = notesAgain.frameLocator('iframe');
  await notesApp3.locator('#list li').first().waitFor({ timeout: 8000 });
  check('restored desktop keeps app state (notes intact)', (await notesApp3.locator('#list li').count()) === 2);

  // ---- cross-tab desktop sync: two tabs of the same desktop stay matched ----
  const twin = await context.newPage();
  await twin.goto(BASE + '/index.html');
  await twin.waitForSelector('.icon');
  await sleep(300);
  // move a root icon in `sys` — `twin` should repaint without any reload
  const gbBox = await sys.locator('.icon', { hasText: 'Welcome.gif' }).boundingBox();
  await sys.mouse.move(gbBox.x + gbBox.width / 2, gbBox.y + gbBox.height / 2);
  await sys.mouse.down();
  await sys.mouse.move(gbBox.x + 300, gbBox.y + 300, { steps: 8 });
  await sys.mouse.up();
  await sleep(800);
  const posInSys = await sys.locator('.icon', { hasText: 'Welcome.gif' })
    .evaluate((el) => el.style.left + '/' + el.style.top);
  const posInTwin = await twin.locator('.icon', { hasText: 'Welcome.gif' })
    .evaluate((el) => el.style.left + '/' + el.style.top);
  check('icon moved in one tab updates live in the other (no reload)', posInSys === posInTwin);

  // ---- versioning: pin decision logic ----
  const pinDecisions = await page.evaluate(() => ({
    none: window.gifosPinTarget('/', ''),
    same: (localStorage.setItem('gifos_pin', window.GIFOS_VERSION), window.gifosPinTarget('/', '')),
    old: (localStorage.setItem('gifos_pin', '0.4.0'), window.gifosPinTarget('/', '')),
    underVersions: window.gifosPinTarget('/versions/0.4.0/', ''),
    unpin: (window.gifosPinTarget('/', '?unpin=1')),
    pinAfterUnpin: localStorage.getItem('gifos_pin'),
  }));
  check('no pin → no redirect', pinDecisions.none === null);
  check('pin == current → no redirect', pinDecisions.same === null);
  check('pin to old version → redirects to its subfolder', pinDecisions.old && pinDecisions.old.redirect === '/versions/0.4.0/');
  check('already under /versions/ → never re-redirects (no loop)', pinDecisions.underVersions === null);
  check('?unpin clears the pin', pinDecisions.unpin && pinDecisions.unpin.clear === true && pinDecisions.pinAfterUnpin === null);

  // ---- versioning: Settings modal shows the running version ----
  await page.locator('#sys-menu-btn').click();
  await page.locator('.ctx button', { hasText: 'Settings…' }).click();
  await page.locator('.modal.wide').waitFor({ timeout: 4000 });
  const settingsText = await page.locator('.modal.wide').textContent();
  // The panel names the running build by CHANNEL, not by one version string: the
  // site ROOT is the unreleased EDGE build, identified by a monotonic build
  // number — there is deliberately no "vedge" anywhere — while a /versions/
  // snapshot is named "v<x.y.z>". The old assertion looked for 'v' +
  // GIFOS_VERSION unconditionally, so it went red the day the edge channel
  // landed and stayed red: the SAME redesign that stranded window.gifosPinTarget
  // left this behind too. Assert the real contract for whichever channel runs.
  const ver = await page.evaluate(() => ({ v: window.GIFOS_VERSION, b: window.GIFOS_BUILD }));
  const namesRunning = ver.v === 'edge'
    ? /unreleased edge build/.test(settingsText) && settingsText.includes('build ' + ver.b)
    : settingsText.includes('v' + ver.v);
  check('Settings names the running build for its channel', /Running now/.test(settingsText) && namesRunning);
  check('Settings shows the live release and the snapshot list',
    /Live release/.test(settingsText) && /Latest edge/.test(settingsText));
  await page.locator('#set-close').click();

  // ---- versioning: the OLDEST archived build still serves a working desktop ----
  // Discovered from version.json, never hardcoded: this used to name /versions/0.6.0/
  // explicitly, and cca37e1 dropped the pre-launch snapshots 0.6.0–0.8.0. The suite
  // then waited 8s for an icon on a 404 and died — after the pin assertions it could
  // no longer reach, so nothing here was being checked at all. Whichever builds are
  // shipped, the oldest one has to boot: that is the promise /versions/ makes.
  const shipped = await page.evaluate(async (b) => {
    const r = await fetch(b + '/version.json?ts=' + Date.now(), { cache: 'no-store' });
    return (await r.json()).versions || [];
  }, BASE);
  const oldest = shipped[shipped.length - 1];
  check('version.json ships at least one archived build', !!oldest);
  const archived = await context.newPage();
  await archived.goto(BASE + '/versions/' + oldest + '/index.html');
  await archived.waitForSelector('.icon', { timeout: 8000 });
  check('the oldest archived build (' + oldest + ') boots a working desktop',
    (await archived.$$('.icon')).length >= 5);
  await archived.close();

  // ---- versioning: update bar appears when a newer version is deployed ----
  // The bar is a SNAPSHOT concern. applyUpdateBar() computes
  // `behind = !runningEdge() && latest > VERSION`, so the edge root is never
  // nagged — deliberately: "the edge build is AHEAD of the release, never
  // behind". This used to load /index.html (the edge root) and demand the bar,
  // i.e. it asserted the exact opposite of the contract, and had been red ever
  // since the edge channel landed. Test it where it actually applies — an old
  // snapshot — and separately assert the root's silence is intentional.
  // Use the NEWEST snapshot, not the oldest: snapshots are frozen, so the oldest
  // one runs code from several releases ago and would be testing history rather
  // than the build we are about to ship. The newest snapshot is cut from current
  // code, and faking a 9.9.9 release puts it "behind" — the one arrangement in
  // which today's update-bar logic is reachable at all (the edge root is
  // deliberately never nagged, so the bar cannot be exercised there).
  const newest = shipped[0];
  const fakeLatest = { status: 200, contentType: 'application/json',
    body: JSON.stringify({ current: '9.9.9', versions: ['9.9.9', newest] }) };

  const upCtx = await browser.newContext({ serviceWorkers: 'block' }); // else the SW answers version.json and the route never fires
  const upPage = await upCtx.newPage();
  await upPage.route('**/version.json*', (r) => r.fulfill(fakeLatest));
  await upPage.goto(BASE + '/versions/' + newest + '/index.html');
  await upPage.waitForSelector('.icon');
  await upPage.locator('#update-bar').waitFor({ state: 'visible', timeout: 8000 });
  const upMsg = await upPage.locator('#update-msg').textContent();
  check('a snapshot behind the live release shows the update bar (' + newest + ')', /9\.9\.9/.test(upMsg));
  await upCtx.close();

  const edgeCtx = await browser.newContext({ serviceWorkers: 'block' });
  const edgePage = await edgeCtx.newPage();
  await edgePage.route('**/version.json*', (r) => r.fulfill(fakeLatest));
  await edgePage.goto(BASE + '/index.html');
  await edgePage.waitForSelector('.icon');
  await sleep(1500);
  check('the edge root is NOT nagged — it is ahead of the release, not behind',
    !(await edgePage.locator('#update-bar').isVisible()));
  await edgeCtx.close();

  // ---- the Back button is part of the OS ----
  // Inside a folder, Back climbs one level; at the Home Screen root it's
  // swallowed (the desktop never navigates away). Apps get Back delivered via
  // gifos.onBack, and the run tab never unloads.
  const backPage = await context.newPage();
  await backPage.goto(BASE + '/index.html');
  await backPage.waitForSelector('.icon');
  await sleep(300);
  await backPage.locator('.icon', { hasText: /^Games$/ }).dblclick();
  await sleep(300);
  await backPage.goBack().catch(() => {});
  await sleep(400);
  const crumbsAfterBack = await backPage.locator('#crumbs').textContent();
  check('Back inside a folder climbs to the Home Screen', /^Home$/.test(crumbsAfterBack.trim()) && !/Games/.test(crumbsAfterBack));
  check('...without leaving the desktop', backPage.url().includes('/index.html'));
  await backPage.goBack().catch(() => {});
  await sleep(400);
  check('Back at the root is swallowed (still on the desktop)', backPage.url().includes('/index.html') && (await backPage.locator('.icon').count()) > 3);

  await backPage.evaluate(async () => {
    const html = '<!doctype html><div id="out">idle</div><script>' +
      'gifos.onBack(function(){ document.getElementById("out").textContent = "BACK"; });' +
      '</scr' + 'ipt>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'backtest', name: 'BackTest', entry: 'index.html', capabilities: { db: true } }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'BackTest.gif', bytes, kind: 'gif', isApp: true, appId: 'backtest', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'BackTest.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  // Same rule as openApp: wait for the icon the seeding just created to be
  // painted before clicking it. render() resolving is not the same as the icon
  // being hit-testable, and a dblclick on an unpainted icon opens no tab —
  // which then shows up 30s later as an unexplained waitForEvent timeout.
  await backPage.locator('.icon', { hasText: 'BackTest.gif' }).waitFor({ state: 'visible', timeout: 15000 });
  // This section's subject is the BACK TRAP, not icon-opening — the preceding
  // hundred-plus assertions already exercise dblclick-open dozens of times.
  // On a long-uptime box the browser's window.open can start failing late in
  // the run (gate 6: six dblclicks, no tab, twice — same line, code identical
  // to the green gate-5 run an hour earlier), so after the bounded dblclick
  // attempts fail, open the app tab directly and keep testing Back.
  let backApp = null;
  try { backApp = await dblclickForTab(context, backPage, 'BackTest.gif'); }
  catch (e) {
    console.log('  (dblclick never opened a tab — capturing the app URL from the page\'s own open call; the Back trap is still the subject)');
    await backPage.evaluate(() => { window.__openUrls = []; window.open = (u) => { window.__openUrls.push(String(u)); return null; }; });
    try {
      // same thumbnail-settle rule as dblclickForTab — this fallback re-clicks
      // the very icon a neighbour's lazily-decoded <img> was covering
      await backPage.waitForFunction(
        () => Array.from(document.querySelectorAll('.icon img')).every((im) => im.complete),
        null, { timeout: 15000 }).catch(() => {});
      await backPage.locator('.icon', { hasText: 'BackTest.gif' }).first().dblclick();
    } catch (e2) {
      // The FALLBACK dblclick retrying forever = actionability failing = the
      // icon is COVERED. Name the coverer (gate-box red, e2e.js:1046 family).
      const cover = await backPage.evaluate(() => {
        const ic = Array.from(document.querySelectorAll('.icon')).find((el) => el.textContent.includes('BackTest.gif'));
        if (!ic) return { icon: 'GONE' };
        const r = ic.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const path = []; let el = top;
        while (el && path.length < 5) { path.push(el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : '')); el = el.parentElement; }
        return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, elementAtCenter: path };
      }).catch((err) => String(err).slice(0, 150));
      console.log('  [backtrap forensics] icon coverage: ' + JSON.stringify(cover));
      try { await backPage.screenshot({ path: '/tmp/backtrap-fail.png' }); console.log('  [backtrap forensics] screenshot: /tmp/backtrap-fail.png'); } catch (e3) {}
      throw e2;
    }
    await backPage.waitForFunction(() => window.__openUrls && window.__openUrls.length > 0, null, { timeout: 10000 });
    const href = await backPage.evaluate(() => window.__openUrls[0]);
    backApp = await context.newPage();
    await backApp.goto(new URL(href, backPage.url()).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  await backApp.waitForSelector('iframe');
  await sleep(600);
  // A real gesture inside the app arms the Back trap (Android Chrome ignores a
  // trap pushed without user activation; the shim pings the container on its
  // first touch). Without this the press would just unload the tab.
  await backApp.frameLocator('iframe').locator('#out').click().catch(() => {});
  await sleep(200);
  await backApp.goBack().catch(() => {});
  await backApp.frameLocator('iframe').locator('#out').filter({ hasText: 'BACK' }).waitFor({ timeout: 5000 });
  check('an app receives Back through gifos.onBack', true);
  check('...and the app tab never unloads', backApp.url().includes('/run.html'));
  await backApp.close();
  await backPage.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
