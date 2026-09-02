// THE FINANCIAL TRACKER, MOUNTED AS THE REAL GIF, DRIVEN THROUGH ITS OWN UI.
//
// apps/finance/build.mjs already holds the CSV sniffer and the model to six
// bank dialects and a year of transfers — in Node, on the source. What it
// cannot see is whether any of that survives being packed into a GIF and run
// inside the sandbox: whether the file picker reaches the parser, whether the
// preview draws, whether gifos.db keeps a ledger chunked by month, and whether
// the handoff button raises the sheet with numbers the app worked out itself.
//
// So this drives the shipped artifact. Everything it asserts is a number the
// app computed from rows this file typed in, which is the only way to tell a
// working importer from a screen that merely says "2 added".
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + d + ')' : '')); if (!c) fail++; };

// A statement with a title block above the header, quoted thousands, and a
// running balance — the Bank of America shape.
const CSV = [
  'Description,,Summary Amt.',
  'Beginning balance as of 06/01/2026,,"4,000.00"',
  '',
  'Date,Description,Amount,Running Bal.',
  '06/02/2026,"CHECKCARD WHOLE FOODS #123",-120.00,"3,880.00"',
  '06/03/2026,"ACME CORP DES:PAYROLL",5000.00,"8,880.00"',
  '06/20/2026,"RENT",-2000.00,"6,880.00"',
  '07/02/2026,"CHECKCARD WHOLE FOODS #123",-140.00,"6,740.00"',
  '07/03/2026,"ACME CORP DES:PAYROLL",5000.00,"11,740.00"',
  '07/20/2026,"RENT",-2000.00,"9,740.00"',
  '08/03/2026,"ACME CORP DES:PAYROLL",5000.00,"14,740.00"',
  '08/20/2026,"RENT",-2000.00,"12,740.00"',
  '',
].join('\n');

(async () => {
  const bytes = fs.readFileSync(appGif('finance'));
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();

  const boot = await context.newPage();
  await boot.goto(BASE + '/run.html');
  await boot.waitForFunction(() => window.GifOS && GifOS.store);
  const fileId = await boot.evaluate(async (b64) => {
    const raw = atob(b64), u = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Financial Tracker.gif', bytes: u, kind: 'gif', isApp: true, appId: 'finance', mime: 'image/gif' });
    return fid;
  }, bytes.toString('base64'));
  await boot.close();

  const page = await context.newPage();
  page.on('pageerror', (e) => { console.log('  [app pageerror]', e.message); fail++; });
  await page.goto(BASE + '/run.html#id=' + fileId);
  await page.waitForSelector('#appmount iframe', { timeout: 25000 });
  const ack = page.locator('.perm-box', { hasText: 'would like to' });
  let ackText = '';
  try { await ack.waitFor({ timeout: 6000 }); ackText = await ack.textContent(); await ack.locator('.done').click(); } catch (e) { /* none */ }
  check('the launch sheet says it hands your other apps a plan summary',
    /Hand your other apps a retirement plan summary/i.test(ackText), ackText ? ackText.slice(0, 80) : 'no sheet');
  check('…and that it uses your SimpleFIN account', /SimpleFIN/i.test(ackText));

  const fr = page.frameLocator('#appmount iframe');
  await fr.locator('#btnAdd').waitFor({ timeout: 15000 });
  check('the app mounts and paints its Accounts screen', true);

  // ---- 1. add an account through the sheet the user actually uses ----------
  await fr.locator('#btnAdd').click();
  await fr.locator('#modalBox').waitFor();
  const inputs = fr.locator('#modalBox input');
  await inputs.nth(0).fill('Everyday checking');
  await inputs.nth(1).fill('Bank of America');
  await fr.locator('#modalBox select').selectOption('checking');
  await inputs.nth(2).fill('4000');
  await fr.locator('#modalBox button.primary').click();
  await fr.locator('.acct').first().waitFor({ timeout: 8000 });
  check('the account appears, grouped under Cash',
    (await fr.locator('.group', { hasText: 'CASH' }).locator('.acct').count()) === 1);
  check('net worth reads the balance that was typed',
    (await fr.locator('#nwTotal').textContent()).trim() === '$4,000',
    await fr.locator('#nwTotal').textContent());

  // A liability is typed as what you OWE and subtracted for you — the single
  // most likely thing for somebody to enter with the wrong sign.
  await fr.locator('#btnAdd').click();
  await fr.locator('#modalBox').waitFor();
  const li = fr.locator('#modalBox input');
  await li.nth(0).fill('Sapphire');
  await fr.locator('#modalBox select').selectOption('card');
  await li.nth(2).fill('1500');
  await fr.locator('#modalBox button.primary').click();
  await fr.locator('.group', { hasText: 'WHAT YOU OWE' }).waitFor({ timeout: 8000 });
  check('a card typed as a positive 1500 SUBTRACTS from net worth',
    (await fr.locator('#nwTotal').textContent()).trim() === '$2,500',
    await fr.locator('#nwTotal').textContent());

  // ---- 2. import the statement --------------------------------------------
  await fr.locator('#tabs button[data-view="import"]').click();
  await fr.locator('#file').setInputFiles({ name: 'bofa-checking.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await fr.locator('#importPane').waitFor({ timeout: 10000 });

  const summary = await fr.locator('#impSummary').textContent();
  check('the sniffer finds the header BELOW the title block', /headings on line 4/.test(summary), summary);
  check('…and counts the data rows, not the file lines', /^bofa-checking\.csv — 8 rows/.test(summary.trim()), summary);
  check('the file name picks the right account by itself',
    (await fr.locator('#impAccount').inputValue()) === (await fr.locator('#impAccount option', { hasText: 'Everyday checking' }).getAttribute('value')));

  const preview = await fr.locator('#impPreview').textContent();
  check('the preview shows money out as a negative', /−\$120\.00/.test(preview), preview.slice(0, 120));
  check('the preview shows money in as a positive', /\$5,000\.00/.test(preview));
  // 06/20 has a second part over 12, which PROVES month-first. Nothing is
  // warned about, and that is the point: the warning is for files where the
  // answer genuinely is not in the data, not for every US date.
  const warn = await fr.locator('#impWarn').textContent();
  check('a file that settles its own date order raises no warning', warn.trim() === '', warn.slice(0, 120));
  check('…and it settled on month-first', (await fr.locator('#impOrder').inputValue()) === 'mdy');

  await fr.locator('#btnDoImport').click();
  await fr.locator('#barsChart svg').waitFor({ timeout: 12000 });
  check('importing lands on the Money screen with a chart drawn', true);

  const rows = await fr.locator('#txTable tr').count();
  check('all 8 transactions are in the table', rows === 9, 'rows incl. header: ' + rows);

  // The bank's own last balance is taken from the running-balance column
  // rather than invented by adding transactions up.
  await fr.locator('#tabs button[data-view="accounts"]').click();
  const chk = fr.locator('.acct', { hasText: 'Everyday checking' });
  // A STATEMENT BEATS A TYPED ESTIMATE. 4000 was typed a moment ago and is
  // stamped today; the statement's last row is 20 August. On a plain date
  // comparison the estimate wins and nothing is said, which is the ordinary
  // first run of this app — type a rough figure, then import the file with the
  // real one in it. See doImport.
  check('the account balance is taken from the running-balance column, over the typed estimate',
    /\$12,740/.test(await chk.locator('.amt').textContent()), await chk.locator('.amt').textContent());
  check('net worth follows it', (await fr.locator('#nwTotal').textContent()).trim() === '$11,240',
    await fr.locator('#nwTotal').textContent());

  // ---- 3. re-importing the same file must add nothing ---------------------
  await fr.locator('#tabs button[data-view="import"]').click();
  await fr.locator('#file').setInputFiles({ name: 'bofa-checking.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await fr.locator('#importPane').waitFor({ timeout: 10000 });
  await fr.locator('#btnDoImport').click();
  await fr.locator('#flash').waitFor({ timeout: 10000 });
  const flash = await fr.locator('#flash').textContent();
  check('RE-IMPORTING THE SAME FILE ADDS NOTHING, and says both numbers',
    /^0 added, 8 already here/.test(flash.trim()), flash);
  check('…and the table has not grown', (await fr.locator('#txTable tr').count()) === 9);

  // ---- 4. the plan, worked out from what was imported ---------------------
  await fr.locator('#tabs button[data-view="plan"]').click();
  await fr.locator('#planTable').waitFor();
  await fr.locator('#planAge').fill('45');
  await fr.locator('#planAge').dispatchEvent('change');
  const planText = await fr.locator('#planTable').textContent();
  // June and July are complete (data spans the 2nd to the 20th of each, and
  // the ledger starts 06/02 / ends 08/20, so BOTH ends are part months) —
  // which leaves ONE complete month and therefore no honest yearly figure.
  check('under three complete months it refuses to give a yearly figure',
    (planText.match(/not enough data/g) || []).length === 2, planText.replace(/\s+/g, ' ').slice(0, 160));
  check('…while still giving the balance sheet, which is a fact',
    /\$11,240/.test(planText) && /\$12,740/.test(planText), planText.replace(/\s+/g, ' ').slice(0, 200));
  const basis = await fr.locator('#planBasis').textContent();
  check('…and says why', /at least three complete/.test(basis), basis.slice(0, 90));

  // ---- 5. the handoff -----------------------------------------------------
  await fr.locator('#btnHandoff').click();
  const sheet = page.locator('#gifos-handoff-modal');
  await sheet.waitFor({ timeout: 10000 });
  const sheetText = await sheet.textContent();
  check('the handoff sheet is raised by the OS, over the app', true);
  check('it names the Financial Tracker', /Financial Tracker/.test(sheetText));
  check('it shows the net worth the app worked out', /\$11,240/.test(sheetText), sheetText.replace(/\s+/g, ' ').slice(0, 160));
  check('NO ACCOUNT NAME OR INSTITUTION IS IN IT',
    !/Bank of America/.test(sheetText) && !/Sapphire/.test(sheetText) && !/WHOLE FOODS/.test(sheetText));
  await sheet.locator('#gifos-handoff-yes').click();
  await sheet.waitFor({ state: 'detached', timeout: 8000 });

  // The sheet leaves the DOM on the click; the shelf write behind it is a
  // store round-trip that lands a beat later. Wait for the record, not the
  // sheet — on a loaded box a read straight after detach saw null.
  const rec = await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const r = await GifOS.store.getState('sys::handoff').catch(() => null);
      if (r && r['finance.plan']) return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    return GifOS.store.getState('sys::handoff').catch(() => null);
  });
  const doc = rec && rec['finance.plan'] && rec['finance.plan'].doc;
  check('the shelf holds the summary, from this app', !!doc && rec['finance.plan'].from.appId === 'finance');
  check('…carrying the age that was typed and the pot that was computed',
    doc && doc.currentAge === 45 && typeof doc.netWorth === 'number', JSON.stringify(doc));
  check('…and no yearly figures, because there was not enough data to have any',
    doc && doc.annualSpend === undefined && doc.annualSavings === undefined, JSON.stringify(doc));

  await browser.close();
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
