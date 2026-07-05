// Recursive computer-image e2e: back up the desktop as ONE GIF, put that GIF
// back on the desktop as a file, and BOOT it — a full GifOS desktop running
// inside its own namespace, without touching the host desktop.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [host]', m.text()); });

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 8000 });
  await sleep(400);
  const hostLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent).sort());

  // ---- back up the whole desktop as one GIF ----
  await page.locator('#sys-menu-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.ctx button', { hasText: 'Back up Home Screen…' }).click(),
  ]);
  const bytes = Array.from(new Uint8Array(fs.readFileSync(await download.path())));

  // ---- put the image on the desktop as a plain file icon ----
  await page.evaluate(async (arr) => {
    const bytes = new Uint8Array(arr);
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'my-computer.gif', bytes, kind: 'gif', isApp: false, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId, name: 'my-computer.gif', parent: null, x: 640, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, bytes);
  await sleep(300);

  // ---- double-click → offered BOOT (non-destructive) alongside replace ----
  await page.locator('.icon', { hasText: 'my-computer.gif' }).dblclick();
  await page.waitForSelector('.modal-bg', { timeout: 5000 });
  const hasBoot = await page.locator('.modal button', { hasText: 'Boot this computer' }).count();
  check('opening a computer image offers "Boot this computer"', hasBoot === 1);

  const [vmPage] = await Promise.all([
    ctx.waitForEvent('page'),
    page.locator('.modal button', { hasText: 'Boot this computer' }).click(),
  ]);
  vmPage.on('console', (m) => { if (m.type() === 'error') console.log('  [vm]', m.text()); });
  await vmPage.waitForSelector('.icon', { timeout: 10000 });
  await sleep(500);
  check('booted image shows the VM banner', await vmPage.locator('.vm-banner').count() === 1);
  const vmLabels = await vmPage.$$eval('.icon .label', (els) => els.map((e) => e.textContent).sort());
  // the image was taken BEFORE my-computer.gif landed on the host desktop
  check('booted desktop has the imaged icons', JSON.stringify(vmLabels) === JSON.stringify(hostLabels));
  const vmDb = await vmPage.evaluate(() => GifOS.store.dbName);
  check('booted desktop runs in its own namespace', /^gifos_vm_file_/.test(vmDb));

  // ---- apps launched inside the VM carry the namespace ----
  const [vmApp] = await Promise.all([
    ctx.waitForEvent('page'),
    vmPage.locator('.icon', { hasText: 'Welcome' }).first().dblclick(),
  ]);
  await vmApp.waitForURL(/run\.html/, { timeout: 8000 });
  check('VM apps open with the VM namespace in the URL', vmApp.url().includes('db=' + encodeURIComponent(vmDb)));
  const appDb = await vmApp.evaluate(() => GifOS.store.dbName).catch(() => null);
  check('VM app runtime binds to the VM store', appDb === vmDb);
  await vmApp.close();

  // ---- changes inside the VM never leak to the host ----
  await vmPage.locator('.icon', { hasText: 'Games' }).click({ button: 'right' });
  await vmPage.locator('.ctx button', { hasText: 'Move to Trash' }).click();
  await sleep(400);
  const vmAfter = await vmPage.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('VM change applied (Games trashed in the image)', !vmAfter.includes('Games'));
  await page.reload();
  await page.waitForSelector('.icon', { timeout: 8000 });
  await sleep(400);
  const hostAfter = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('host desktop untouched (Games still on host)', hostAfter.includes('Games'));

  // ---- VM persists across a reload, and Reboot fresh re-hydrates ----
  await vmPage.reload();
  await vmPage.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);
  const vmResumed = await vmPage.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('re-opening the image resumes the VM (Games still trashed)', !vmResumed.includes('Games'));
  vmPage.on('dialog', (d) => d.accept());
  await vmPage.locator('#vm-reboot').click();
  await vmPage.waitForSelector('.icon', { timeout: 10000 });
  await sleep(600);
  const vmFresh = await vmPage.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Reboot fresh re-hydrates from the image (Games is back)', vmFresh.includes('Games'));

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
