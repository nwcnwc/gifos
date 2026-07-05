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
  check('desktop seeded with 4 apps + Trash', labels.length === 5);
  check('has Notes.gif', labels.includes('Notes.gif'));
  check('has Tic-Tac-Toe.gif', labels.includes('Tic-Tac-Toe.gif'));
  check('has Guestbook.gif', labels.includes('Guestbook.gif'));
  check('has Welcome.gif', labels.includes('Welcome.gif'));
  check('has Trash', labels.includes('Trash'));
  check('gif icons render as <img> thumbnails', (await page.$$('.icon .thumb img')).length === 4);
  const pillText = await page.locator('#storage-pill').textContent();
  check('storage pill shows usage', /💾/.test(pillText) && /(B|KB|MB|GB)/.test(pillText));

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

  // ---- browsable-folder fallback (Welcome.gif has no index.html) ----
  const welcomeIcon = page.locator('.icon', { hasText: 'Welcome.gif' });
  const [folderPage] = await Promise.all([
    context.waitForEvent('page'),
    welcomeIcon.dblclick(),
  ]);
  await folderPage.waitForLoadState();
  await folderPage.waitForSelector('iframe');
  const folder = folderPage.frameLocator('iframe');
  await folder.locator('table').waitFor({ timeout: 8000 });
  const rowText = await folder.locator('table').textContent();
  check('no-index.html GIF shows browsable filesystem', /README\.txt/.test(rowText));

  // ---- Tic-Tac-Toe: the multiplayer default app mounts and plays ----
  const [tttPage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Tic-Tac-Toe.gif' }).dblclick(),
  ]);
  await tttPage.waitForSelector('iframe');
  const ttt = tttPage.frameLocator('iframe');
  await ttt.locator('.cell').first().waitFor({ timeout: 8000 });
  check('tic-tac-toe renders a 3x3 board', (await ttt.locator('.cell').count()) === 9);
  await ttt.locator('.cell').first().click();
  await sleep(300);
  check('placing a mark works (X appears)', (await ttt.locator('.cell').first().textContent()) === 'X');
  await tttPage.close();

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

  // ---- drag an icon: it should snap to a grid cell and persist ----
  const dragIcon = page.locator('.icon', { hasText: 'Notes.gif' });
  const box = await dragIcon.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 150, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  const posAfterDrag = await page.locator('.icon', { hasText: 'Notes.gif' })
    .evaluate((el) => ({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
  const onGrid = (posAfterDrag.left - 16) % 116 === 0 && (posAfterDrag.top - 16) % 116 === 0;
  check('dragged icon snaps to a grid cell', onGrid && !(posAfterDrag.left === 16 && posAfterDrag.top === 16));
  await page.reload();
  await page.waitForSelector('.icon');
  await sleep(300);
  const posAfterReload = await page.locator('.icon', { hasText: 'Notes.gif' })
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
  await sys.locator('.ctx button', { hasText: 'Restore to Desktop' }).click();
  await sleep(400);
  await sys.locator('#crumbs a').click(); // back to Desktop
  await sleep(300);
  const restoredLabels = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('restore from Trash puts the icon back', restoredLabels.includes('Resume.gif'));

  // ---- Backup → Reset → Restore: the whole desktop as ONE GIF ----
  await sys.locator('#sys-menu-btn').click();
  const [download] = await Promise.all([
    sys.waitForEvent('download'),
    sys.locator('.ctx button', { hasText: 'Back up desktop…' }).click(),
  ]);
  check('backup downloads a desktop GIF', download.suggestedFilename() === 'gifos-desktop.gif');
  const backupPath = await download.path();

  await sys.locator('#sys-menu-btn').click();
  await sys.locator('.ctx button', { hasText: 'Reset desktop…' }).click();
  await Promise.all([
    sys.waitForNavigation({ waitUntil: 'load' }),
    sys.locator('.modal-actions button', { hasText: 'Reset without backup' }).click(),
  ]);
  await sys.waitForSelector('.icon');
  await sleep(600);
  const freshLabels = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('reset re-seeds a fresh desktop (custom app gone)', freshLabels.length === 5 && !freshLabels.includes('Resume.gif'));

  await sys.setInputFiles('#restore-input', backupPath);
  await sys.locator('.modal-actions button', { hasText: 'Replace desktop' }).click();
  await sys.locator('.modal button', { hasText: 'OK' }).click(); // "Desktop restored"
  await sleep(500);
  const restoredDesk = await sys.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('restore brings the backed-up desktop back (custom app present)', restoredDesk.includes('Resume.gif'));
  const notesPos = await sys.locator('.icon', { hasText: 'Notes.gif' })
    .evaluate((el) => ({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
  check('restored desktop keeps icon positions', notesPos.left === posAfterDrag.left && notesPos.top === posAfterDrag.top);
  // app state survives the round-trip too
  const [notesAgain] = await Promise.all([
    context.waitForEvent('page'),
    sys.locator('.icon', { hasText: 'Notes.gif' }).dblclick(),
  ]);
  await notesAgain.waitForSelector('iframe');
  const notesApp3 = notesAgain.frameLocator('iframe');
  await notesApp3.locator('#list li').first().waitFor({ timeout: 8000 });
  check('restored desktop keeps app state (notes intact)', (await notesApp3.locator('#list li').count()) === 2);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
