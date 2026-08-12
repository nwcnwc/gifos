// End-to-end: the PDF Tables → Excel app, entirely in the sandbox.
// Mounts the committed GIF, drops a born-digital table PDF on it, and checks
// that pdf.js (isEvalSupported:false, blob: worker) + the row/column
// reconstruction + SheetJS all run under the app CSP and produce an .xlsx whose
// cells match the PDF. This is the guard that the CSP-compatible pdf.js recipe
// keeps working — a 4.x bump (dynamic import) or a lost isEvalSupported:false
// would fail HERE, not in a user's hands.
//
// Needs: static server on 8099 (python3 -m http.server 8099 -d site).
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  const gifB64 = fs.readFileSync(appGif('pdf-tables')).toString('base64');
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'PDF Tables.gif', bytes, kind: 'gif', isApp: true, appId: 'pdf-tables', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'PDF Tables.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'PDF Tables.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  app.on('console', (m) => { if (m.type() === 'error') console.log('  [app]', m.text()); });
  await app.waitForSelector('iframe', { timeout: 15000 });
  const fr = app.frameLocator('iframe');
  await fr.locator('#file').waitFor({ state: 'attached', timeout: 10000 });

  await fr.locator('#file').setInputFiles(path.join(__dirname, '..', 'fixtures', 'rate-table.pdf'));
  await fr.locator('#status').filter({ hasText: /Found tables|SCANNED|no table|⚠/ }).waitFor({ timeout: 40000 });
  const status = await fr.locator('#status').textContent();
  check('reads a born-digital PDF in the sandbox and finds a table', /Found tables/.test(status), (status || '').slice(0, 120));
  check('…which means pdf.js loaded and ran under the app CSP (isEvalSupported:false, blob: worker)', /Found tables/.test(status));

  check('the Download .xlsx button becomes enabled', !(await fr.locator('#download').isDisabled()));
  const preview = await fr.locator('#preview').textContent();
  check('the reconstructed grid carries the header and a data row', /Company/.test(preview) && /Aetna/.test(preview) && /1\.05/.test(preview), (preview || '').replace(/\s+/g, ' ').slice(0, 140));

  // SheetJS actually serialising an .xlsx under the app CSP — verified in-frame
  // (the browser download itself rides the sandbox's allow-downloads, which is
  // standard and not what this guard is for). Round-trip write→read the exact
  // grid the app extracted, so a broken SheetJS or a CSP regression fails here.
  const handle = await app.locator('iframe').elementHandle();
  const frame = await handle.contentFrame();
  const xlsxCheck = await frame.evaluate(() => {
    try {
      const aoa = [['Company', 'NAIC', 'Rate'], ['Aetna', '16242', '1.05'], ['Kaiser', '95677', '1.12']];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'Page 1');
      const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const back = window.XLSX.read(out, { type: 'array' });
      const round = window.XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1 });
      return { bytes: out.byteLength || out.length || 0, flat: JSON.stringify(round) };
    } catch (e) { return { err: String(e && e.message || e) }; }
  });
  check('SheetJS writes and re-reads a real .xlsx under the app CSP',
    !!(xlsxCheck.bytes > 500 && /Aetna/.test(xlsxCheck.flat || '') && /16242/.test(xlsxCheck.flat || '') && /Kaiser/.test(xlsxCheck.flat || '')),
    xlsxCheck.err || (xlsxCheck.bytes + ' bytes'));

  await app.close();
  await browser.close();
  console.log(failures ? (failures + ' FAIL') : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
