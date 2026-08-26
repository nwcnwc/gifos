// APP -> APP HANDOFF, END TO END (docs/app-handoff.md).
//
// One app puts a typed document on a shelf the OS owns; another picks it up.
// Neither can read the other's gifos.db, and the OS decides what a document
// may contain and shows it to the user before anything is written.
//
// The apps here are SYNTHETIC, deliberately. What is at risk is the OS
// mechanism — the vocabulary, the filtering, the sheet, the guest refusal —
// and driving the real Financial Tracker's UI to produce an offer would mean
// seeding a year of accounts to test a postMessage. That the two shipped apps
// declare the right kinds is pinned by test/unit/app-handoff.js, which reads
// their manifests; this file pins what happens when they call.
//
// The case worth reading twice is the SMUGGLED KEY. The consent sheet is only
// honest if what it shows is all that is stored, so the runtime rebuilds the
// document from its own field list rather than copying the app's object. Here
// an app offers an account number alongside its net worth, and the test
// asserts the number reaches neither the sheet nor the consumer.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + d + ')' : '')); if (!c) fail++; };

// An app whose whole surface is one button per call, writing the outcome into
// #out so the test can read it through the frame.
const APP_HTML = `<!doctype html><meta charset=utf-8><body>
<div id=out>idle</div>
<script>
function say(o){ document.getElementById('out').textContent = JSON.stringify(o); }
window.doOffer = function(kind, doc){
  gifos.handoff.offer(kind, doc).then(r => say({ok:true, r:r})).catch(e => say({err:String(e.message||e)}));
};
window.doTake = function(kind){
  gifos.handoff.take(kind).then(r => say({ok:true, r:r})).catch(e => say({err:String(e.message||e)}));
};
<\/script></body>`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();

  const boot = await context.newPage();
  boot.on('pageerror', (e) => console.log('  [boot pageerror]', e.message));
  await boot.goto(BASE + '/run.html');
  await boot.waitForFunction(() => window.GifOS && GifOS.store && GifOS.gif);

  // Seed three apps: one that offers, one that takes, and one that declares
  // nothing at all.
  const seed = (name, appId, handoff) => boot.evaluate(async (a) => {
    const m = { gifos: '1.0', appId: a.appId, name: a.name, entry: 'index.html', capabilities: { db: true } };
    if (a.handoff) m.handoff = a.handoff;
    const files = { 'manifest.json': JSON.stringify(m), 'index.html': a.html };
    const bytes = await GifOS.gif.encode(files, {});
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.name + '.gif', bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    return fid;
  }, { name, appId, handoff, html: APP_HTML });

  const giverId = await seed('Giver', 'giver', { offers: ['finance.plan'] });
  const takerId = await seed('Taker', 'taker', { takes: ['finance.plan'] });
  const plainId = await seed('Plain', 'plain', null);
  await boot.close();

  // Mount an app on its own icon and hand back the page plus its frame.
  const mount = async (fileId) => {
    const p = await context.newPage();
    p.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
    await p.goto(BASE + '/run.html#id=' + fileId);
    await p.waitForSelector('#appmount iframe', { timeout: 20000 });
    const ack = p.locator('.perm-box', { hasText: 'would like to' });
    try { await ack.waitFor({ timeout: 4000 }); await ack.locator('.done').click(); } catch (e) { /* nothing to ack */ }
    return { page: p, fr: p.frameLocator('#appmount iframe') };
  };
  const outOf = async (fr) => {
    await fr.locator('#out').filter({ hasText: /(ok|err)/ }).waitFor({ timeout: 15000 });
    return JSON.parse(await fr.locator('#out').textContent());
  };
  const reset = (fr) => fr.locator('#out').evaluate((e) => { e.textContent = 'idle'; });

  // ---- 1. the sheet, and what it shows ------------------------------------
  const giver = await mount(giverId);
  await giver.fr.locator('#out').waitFor();
  await giver.page.evaluate(() => {
    const f = document.querySelector('#appmount iframe');
    f.contentWindow.postMessage({ ns: 'test' }, '*');   // no-op; keeps the frame warm
  });
  await giver.fr.locator('body').evaluate(() => {
    window.doOffer('finance.plan', {
      currentAge: 45, netWorth: 412000, portfolio: 180000, illiquid: 232000,
      debts: 90000, annualSavings: 18000, annualSpend: 75000, asOf: '2026-08-25',
      // What must not survive.
      accountNumber: '4111111111111111', institution: 'Bank of America',
    });
  });

  const sheet = giver.page.locator('#gifos-handoff-modal');
  await sheet.waitFor({ timeout: 10000 });
  const sheetText = await sheet.textContent();
  check('an offer raises a sheet the OS owns, in the parent page', true);
  check('the sheet names the offering app', /Giver/.test(sheetText), sheetText.slice(0, 60));
  check('the sheet shows the values themselves, not a description of them',
    /412,000/.test(sheetText) && /75,000/.test(sheetText));
  // Read the cell, not the concatenated blob: "Your age45Net worth" has no
  // word boundary in it, which is how the first version of this passed for the
  // wrong reason and then failed for another.
  const ageCell = await sheet.locator('tr', { hasText: 'Your age' }).locator('td').last().textContent();
  check('the sheet shows the age as an age, not as money', ageCell.trim() === '45', ageCell);
  check('THE SMUGGLED KEY IS NOT ON THE SHEET',
    sheetText.indexOf('4111111111111111') === -1 && sheetText.indexOf('Bank of America') === -1);
  check('the sheet says it stays on this computer', /stays on this computer/i.test(sheetText));

  // ---- 2. declining writes nothing ----------------------------------------
  await sheet.locator('#gifos-handoff-no').click();
  const declined = await outOf(giver.fr);
  check('declining resolves { ok:false, reason:"declined" }',
    declined.ok === true && declined.r && declined.r.ok === false && declined.r.reason === 'declined', JSON.stringify(declined.r));
  const afterDecline = await giver.page.evaluate(() => GifOS.store.getState('sys::handoff'));
  check('…and nothing reached the shelf', !afterDecline || !afterDecline['finance.plan']);

  // ---- 3. accepting writes exactly the OS's fields -------------------------
  await reset(giver.fr);
  await giver.fr.locator('body').evaluate(() => {
    window.doOffer('finance.plan', {
      currentAge: 45, netWorth: 412000, portfolio: 180000, illiquid: 232000,
      debts: 90000, annualSavings: 18000, annualSpend: 75000, asOf: '2026-08-25',
      accountNumber: '4111111111111111', institution: 'Bank of America',
    });
  });
  await sheet.waitFor({ timeout: 10000 });
  await sheet.locator('#gifos-handoff-yes').click();
  const accepted = await outOf(giver.fr);
  check('accepting resolves { ok:true }', accepted.ok === true && accepted.r && accepted.r.ok === true, JSON.stringify(accepted.r));

  const shelf = await giver.page.evaluate(() => GifOS.store.getState('sys::handoff'));
  const rec = shelf && shelf['finance.plan'];
  check('the shelf holds the document, under the OS key', !!(rec && rec.doc));
  check('…stamped with which app gave it', !!(rec && rec.from && rec.from.appId === 'giver'), rec && JSON.stringify(rec.from));
  check('…and when', !!(rec && /^\d{4}-\d{2}-\d{2}T/.test(rec.at || '')));
  check('THE SMUGGLED KEY IS NOT ON THE SHELF EITHER',
    JSON.stringify(rec.doc).indexOf('4111111111111111') === -1 &&
    JSON.stringify(rec.doc).indexOf('Bank of America') === -1, JSON.stringify(rec.doc));

  // ---- 4. an undeclared or unknown kind is refused, before any sheet -------
  await reset(giver.fr);
  await giver.fr.locator('body').evaluate(() => window.doOffer('finance.made.up', { netWorth: 1 }));
  const unknown = await outOf(giver.fr);
  check('offering a kind GifOS does not know is refused', !!unknown.err && /not a kind/i.test(unknown.err), unknown.err);
  check('…with no sheet raised', await giver.page.locator('#gifos-handoff-modal').count() === 0);

  await reset(giver.fr);
  await giver.fr.locator('body').evaluate(() => window.doTake('finance.plan'));
  const cannotTake = await outOf(giver.fr);
  check('an app that declared only "offers" may not TAKE', !!cannotTake.err && /handoff\.takes/.test(cannotTake.err), cannotTake.err);
  await giver.page.close();

  // ---- 5. the other app picks it up ---------------------------------------
  const taker = await mount(takerId);
  await taker.fr.locator('#out').waitFor();
  await taker.fr.locator('body').evaluate(() => window.doTake('finance.plan'));
  const took = await outOf(taker.fr);
  const doc = took.r && took.r.doc;
  check('the second app takes the document', !!doc, JSON.stringify(took));
  check('…with the numbers intact', doc && doc.netWorth === 412000 && doc.annualSpend === 75000 && doc.currentAge === 45,
    JSON.stringify(doc));
  check('…and is told which app it came from', took.r && took.r.from && took.r.from.name === 'Giver');
  check('THE SMUGGLED KEY NEVER REACHES THE CONSUMER',
    JSON.stringify(doc).indexOf('4111111111111111') === -1);

  await reset(taker.fr);
  await taker.fr.locator('body').evaluate(() => window.doOffer('finance.plan', { netWorth: 1 }));
  const cannotOffer = await outOf(taker.fr);
  check('an app that declared only "takes" may not OFFER', !!cannotOffer.err && /handoff\.offers/.test(cannotOffer.err), cannotOffer.err);
  await taker.page.close();

  // ---- 6. an app that declared nothing reaches neither direction -----------
  const plain = await mount(plainId);
  await plain.fr.locator('#out').waitFor();
  await plain.fr.locator('body').evaluate(() => window.doTake('finance.plan'));
  const plainTake = await outOf(plain.fr);
  check('an app with no handoff block cannot take', !!plainTake.err, plainTake.err);
  check('…and the refusal names the declaration it is missing', /handoff\.takes/.test(plainTake.err || ''), plainTake.err);
  await plain.page.close();

  // ---- 7. the launch sheet says both directions out loud -------------------
  // The permission sheet is where somebody finds out which of their apps can
  // see this. A kind enforced by the runtime and absent from that sheet is the
  // exact drift test/unit/app-handoff.js also guards, from the other end.
  const fresh = await context.newPage();
  await fresh.goto(BASE + '/run.html#id=' + takerId);
  await fresh.waitForSelector('#appmount iframe', { timeout: 20000 });
  const chip = fresh.locator('.perms').first();   // gifos-perms.js paintChip
  let permText = '';
  try {
    await chip.click({ timeout: 4000 });
    await fresh.locator('.perm-box').waitFor({ timeout: 4000 });
    permText = await fresh.locator('.perm-box').textContent();
  } catch (e) { /* reported below */ }
  check('the permission sheet says the app picks up a retirement plan summary',
    /Pick up a retirement plan summary/i.test(permText), permText ? permText.slice(0, 90) : 'no sheet');
  await fresh.close();

  await browser.close();
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
