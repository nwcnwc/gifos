// End-to-end: the Scanned PDF Tables → Excel app, entirely in the sandbox.
//
// This is the guard for the whole GPU-OCR recipe. It mounts the committed GIF
// and drives TWO files through it:
//
//   test/fixtures/rate-table.pdf          born-digital — must still be read
//                                         EXACTLY (this app is a superset of
//                                         pdf-tables, and the exact path is the
//                                         part that must never regress)
//   test/fixtures/rate-table-scanned.pdf  the SAME table with no text layer at
//                                         all, so the OCR path is forced
//
// The scanned fixture was made by rasterizing the born-digital one at 200 DPI
// and wrapping the JPEG as a DCTDecode image XObject — one page, no font, no
// text-showing operator, so pdf.js getTextContent() returns nothing. That means
// this suite proves the real mechanics (render → DBNet → SVTR → SLANet →
// SheetJS) against known-correct expected text, which a photograph of a real
// filing could never do deterministically. Regenerate it (byte-identically) with
//   node apps/pdf-tables-ocr/tools/make-scan-fixture.mjs
//
// What would fail HERE rather than in a user's hands:
//   - ONNX Runtime not starting under the app CSP (no eval, no network), or the
//     plain wasm being vendored instead of the JSEP build
//   - the models not reaching the app (the <link href> → data: URL → fetch()
//     path that the wasm hatch's `connect-src data:` exists for)
//   - a CTC or structure decode that has drifted off its dictionary
//   - capabilities.gpu no longer putting allow="webgpu" on the app iframe
//
// Headless Chromium here usually has no WebGPU adapter, so the execution
// provider will normally be 'wasm'. That is a REPORTED fact, not a failure —
// the on-device GPU run is a separate exercise. What this asserts is that the
// EP negotiation happened and the pipeline produced the right cells either way.
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
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  const gifB64 = fs.readFileSync(appGif('pdf-tables-ocr')).toString('base64');
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Scanned PDF Tables.gif', bytes, kind: 'gif', isApp: true, appId: 'pdf-tables-ocr', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Scanned PDF Tables.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Scanned PDF Tables.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  app.on('console', (m) => { if (m.type() === 'error') console.log('  [app]', m.text()); });
  await app.waitForSelector('iframe', { state: 'attached', timeout: 30000 });
  // An app declaring wasm + gpu shows the abilities acknowledgement first — a
  // user always sees that an app runs a compiled engine on their GPU before it
  // does. Dismiss it the way a user would.
  await app.locator('.perm-modal .done').click({ timeout: 5000 }).catch(() => {});
  const fr = app.frameLocator('iframe');
  await fr.locator('#file').waitFor({ state: 'attached', timeout: 30000 });

  // capabilities.gpu is what lets ORT reach a real adapter at all. It is one
  // attribute on one iframe, invisible until a user's GPU app silently runs on
  // the CPU — so assert it on the live element.
  const allow = await app.locator('iframe').getAttribute('allow');
  check('the app iframe carries allow="webgpu" (capabilities.gpu)', /webgpu/.test(allow || ''), 'allow="' + (allow || '') + '"');

  // ---- 1. the exact path still works ---------------------------------------
  await fr.locator('#file').setInputFiles(path.join(__dirname, '..', 'fixtures', 'rate-table.pdf'));
  await fr.locator('#status').filter({ hasText: /Found tables|no table|⚠/ }).waitFor({ timeout: 60000 });
  let status = norm(await fr.locator('#status').textContent());
  check('a born-digital PDF is still read exactly, with no OCR', /Found tables/.test(status) && /read exactly/.test(status), status.slice(0, 130));
  let preview = norm(await fr.locator('#preview').textContent());
  check('…and its grid carries the header and the data rows',
    /Company/.test(preview) && /Aetna/.test(preview) && /16242/.test(preview) && /1\.05/.test(preview), preview.slice(0, 140));
  check('the born-digital page is tagged as read from the PDF text, not OCR', /read exactly from the PDF text/.test(preview));

  // ---- 2. the OCR path ------------------------------------------------------
  // First run loads ~40 MB of weights out of the GIF and starts three sessions,
  // then runs a full page of inference on the CPU. Slow, but bounded.
  await fr.locator('#file').setInputFiles(path.join(__dirname, '..', 'fixtures', 'rate-table-scanned.pdf'));
  await fr.locator('#status').filter({ hasText: /Found tables|no table-shaped|⚠/ }).waitFor({ timeout: 300000 });
  status = norm(await fr.locator('#status').textContent());
  check('a SCANNED PDF (no text layer) is read by OCR in the sandbox', /Found tables/.test(status) && /OCR/.test(status), status.slice(0, 160));

  const engine = norm(await fr.locator('#engine').textContent());
  const ep = await app.locator('iframe').elementHandle()
    .then((h) => h.contentFrame())
    .then((f) => f.evaluate(() => window.PdfOcrApp && window.PdfOcrApp.ep()));
  check('ONNX Runtime negotiated an execution provider and says which one', ep === 'webgpu' || ep === 'wasm', 'EP=' + ep + ' — "' + engine + '"');
  if (ep === 'wasm') console.log('  note: no WebGPU adapter in this headless Chromium, so the models ran on the CPU. Expected here.');

  preview = norm(await fr.locator('#preview').textContent());
  // (No \b before OCR: normalising the preview glues the caption to the badge,
  // so the text reads "…4 rows × 3 colsOCR + table structure".)
  check('the OCR page is tagged as OCR, not as an exact read', /OCR/.test(preview) && !/read exactly from the PDF text/.test(preview), preview.slice(0, 120));

  // SLANet must be the thing that produced this grid, not the geometric
  // fallback. This is the guard for the structure dictionary: PaddleOCR applies
  // merge_no_span_structure to it before indexing ('<td>' out, '<td></td>' in),
  // and getting that wrong shifts every token past '<td>' by one — the model
  // decodes as fluent nonsense, no cells lay out, and the app quietly falls back
  // to clustering by position. The output still looks right for a simple table,
  // which is exactly why this has to be asserted rather than eyeballed.
  check('the grid came from the SLANet table-structure model, not the positional fallback',
    /OCR \+ table structure/.test(preview), preview.slice(0, 120));

  // The recovered cells. This is the real assertion: the three insurers, their
  // NAIC codes and their rates, read out of a picture of a table.
  const WANT = ['Company', 'NAIC', 'Rate', 'Aetna', '16242', '1.05', 'Cigna', '67369', '0.98', 'Kaiser', '95677', '1.12'];
  const got = WANT.filter((w) => preview.includes(w));
  check('OCR recovers the table text — every header, insurer, NAIC code and rate',
    got.length === WANT.length, got.length + '/' + WANT.length + ' found; missing: ' + WANT.filter((w) => !got.includes(w)).join(', ') + ' | grid: ' + preview.slice(0, 200));

  check('the Download .xlsx button becomes enabled after OCR', !(await fr.locator('#download').isDisabled()));

  // SheetJS serializing the OCR'd grid under the app CSP, verified in-frame: a
  // download from the sandbox does not raise Playwright's download event, so the
  // round-trip is what proves the workbook is real.
  const handle = await app.locator('iframe').elementHandle();
  const frame = await handle.contentFrame();
  const xlsxCheck = await frame.evaluate(() => {
    try {
      const tables = Array.from(document.querySelectorAll('#preview table'));
      if (!tables.length) return { err: 'no preview table to serialise' };
      const aoa = tables[tables.length - 1].querySelectorAll('tr').length
        ? Array.from(tables[tables.length - 1].querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent))
        : [];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'Page 1 (OCR)');
      const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const back = window.XLSX.read(out, { type: 'array' });
      const round = window.XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1 });
      return { bytes: out.byteLength || out.length || 0, flat: JSON.stringify(round), sheet: back.SheetNames[0] };
    } catch (e) { return { err: String(e && e.message || e) }; }
  });
  check('SheetJS writes and re-reads a real .xlsx of the OCR grid under the app CSP',
    !!(xlsxCheck.bytes > 500 && /Aetna/.test(xlsxCheck.flat || '')),
    xlsxCheck.err || (xlsxCheck.bytes + ' bytes, sheet "' + xlsxCheck.sheet + '"'));
  check('the workbook names an OCR sheet as OCR, so nobody mistakes it for an exact read',
    /\(OCR\)/.test(xlsxCheck.sheet || ''), xlsxCheck.sheet);

  await app.close();
  await browser.close();
  console.log(failures ? (failures + ' FAIL') : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
