// End-to-end: drive the real desktop in Chromium.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  check('desktop seeded with 3 icons', labels.length === 3);
  check('has Notes.gif', labels.includes('Notes.gif'));
  check('has Guestbook.gif', labels.includes('Guestbook.gif'));
  check('has Readme-folder.gif', labels.includes('Readme-folder.gif'));
  check('gif icons render as <img> thumbnails', (await page.$$('.icon .thumb img')).length === 3);

  // ---- run the Notes app in a new tab ----
  const notesIcon = page.locator('.icon', { hasText: 'Notes.gif' });
  const [runPage] = await Promise.all([
    context.waitForEvent('page'),
    notesIcon.dblclick(),
  ]);
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
  check('note text persisted through DB round-trip', firstNote === 'buy milk');

  // ---- persistence: reload the run tab, notes should survive (state lives with icon) ----
  await runPage.reload();
  await runPage.waitForSelector('iframe');
  const app2 = runPage.frameLocator('iframe');
  await app2.locator('#list li').first().waitFor({ timeout: 8000 });
  const afterReload = await app2.locator('#list li').count();
  check('notes persist across tab reload', afterReload === 2);

  // ---- browsable-folder fallback (Readme-folder.gif has no index.html) ----
  const readmeIcon = page.locator('.icon', { hasText: 'Readme-folder.gif' });
  const [folderPage] = await Promise.all([
    context.waitForEvent('page'),
    readmeIcon.dblclick(),
  ]);
  await folderPage.waitForLoadState();
  await folderPage.waitForSelector('iframe');
  const folder = folderPage.frameLocator('iframe');
  await folder.locator('table').waitFor({ timeout: 8000 });
  const rowText = await folder.locator('table').textContent();
  check('no-index.html GIF shows browsable filesystem', /README\.txt/.test(rowText) && /notes\/todo\.txt/.test(rowText));

  // ---- multiplayer sync: open Guestbook in two tabs, sign in one, see it in the other ----
  const gb1 = await context.newPage();
  await gb1.goto(BASE + '/index.html');
  await gb1.waitForSelector('.icon');
  // find the guestbook fileId by reading the run link path — simpler: dblclick on gb1
  const [gbTabA] = await Promise.all([context.waitForEvent('page'), gb1.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick()]);
  await gbTabA.waitForSelector('iframe');
  const gbUrl = gbTabA.url();
  const gbTabB = await context.newPage();
  await gbTabB.goto(gbUrl);
  await gbTabB.waitForSelector('iframe');
  const A = gbTabA.frameLocator('iframe'), B = gbTabB.frameLocator('iframe');
  await A.locator('#msg').waitFor();
  await A.locator('#name').fill('Ada');
  await A.locator('#msg').fill('hello from tab A');
  await A.locator('form button').click();
  await sleep(500);
  const bText = await B.locator('#list').textContent();
  check('guestbook entry from tab A appears live in tab B (cross-tab DB)', /hello from tab A/.test(bText));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
