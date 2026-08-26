// End-to-end: gifos.charge() — both rails, hermetically (tier 2,
// docs/payments-testing.md).
//
// A signed app sells an unlock through the REAL OS surface: the broker
// verifies the running bytes, the OS sheet names the verified author, a
// PayPal window (fake-paypal) approves, the pay Worker (pay-local — the SAME
// core.js the Cloudflare Worker runs) captures and signs a receipt, the OS
// verifies that receipt against the site key, and the purse records the
// entitlement. Then the x402 rail settles a tip as TWO transfers (the 97/3
// split) through a stub wallet. The refusals are exercised as refusals:
// unsigned app, double purchase, over-ceiling, decline.
//
// No chain, no funds, no network beyond loopback. What the fakes cannot
// verify they say so in their own headers.
//
// Needs: static server on 8099. Spawns its own: fake-paypal (8795),
// pay-local (8796), fake-facilitator (8797), and a test catalog (8798).
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');
const need = require('../lib/need');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const PAY = 'http://127.0.0.1:8796';
const ROOT = path.join(__dirname, '..', '..');

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIGN_DOMAIN = 'paytest.example.com';
const CHAIN_PAYEE = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const TREASURY = '0x1111111111111111111111111111111111111111';

const kids = [];
function serve(name, args, env) {
  const p = spawn(process.execPath, args, { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.env.PAY_E2E_VERBOSE && console.log('  [' + name + ']', String(d).trim()));
  p.stderr.on('data', (d) => console.log('  [' + name + '!]', String(d).trim()));
  kids.push(p);
  return p;
}
async function until(url, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch (e) {}
    await sleep(150);
  }
  throw new Error('fixture never came up: ' + url);
}

(async () => {
  await need({ 8099: 'static site' });

  // The Worker derives the payee from the PUBLISHED catalog — the suite
  // publishes one, carrying the test app under its test signing identity.
  const catalog = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ apps: [{ appId: 'paytest', slug: 'paytest', signature: { type: 'domain', id: SIGN_DOMAIN } }] }));
  }).listen(8798);

  serve('fake-paypal', [path.join(ROOT, 'test', 'servers', 'fake-paypal.js')]);
  serve('fake-facilitator', [path.join(ROOT, 'test', 'servers', 'fake-facilitator.js')]);
  serve('pay-local', [path.join(ROOT, 'test', 'servers', 'pay-local.js')], { CATALOG_URL: 'http://127.0.0.1:8798/index.json' });
  await until('http://127.0.0.1:8795/_state');
  await until('http://127.0.0.1:8797/_state');
  await until(PAY + '/health');
  const receiptPub = await (await fetch(PAY + '/test-pubkey')).text();

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  await context.addInitScript((payBase) => {
    try { window.localStorage.setItem('gifos_pay_worker', payBase); } catch (e) {}
  }, PAY);

  // One route, two keys: the app-signing key for the test domain, and the
  // receipt key standing in for the site's own /gifos.key. The app key is
  // filled in below once the page has generated it.
  let appPubB64 = null;
  await context.route('**/gifos.key', (route) => {
    const host = new URL(route.request().url()).hostname;
    const body = host === SIGN_DOMAIN ? (appPubB64 || '') : receiptPub;
    route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });

  // ---- build TWO apps in-browser: one signed (may charge), one not ----------
  const APP_HTML = '<!doctype html><meta charset="utf-8">' +
    '<button id="buy">Buy pro</button><button id="tip">Tip</button>' +
    '<div id="out">-</div><div id="ent">-</div>' +
    '<script>(function(){' +
    'function ent(){ return gifos.entitled("pro").then(function(v){ document.getElementById("ent").textContent = "ent:" + v; }); }' +
    'document.getElementById("buy").onclick = function(){ document.getElementById("out").textContent="…";' +
    '  gifos.charge({ sku:"pro", amount:"5000000", reason:"Unlock pro" })' +
    '  .then(function(r){ document.getElementById("out").textContent = "ok:" + r.rail + ":" + r.amount; return ent(); })' +
    '  .catch(function(e){ document.getElementById("out").textContent = "err:" + e.message; }); };' +
    'document.getElementById("tip").onclick = function(){ document.getElementById("out").textContent="…";' +
    '  gifos.charge({ amount:"3000000", reason:"Tip the author", editable:true })' +
    '  .then(function(r){ document.getElementById("out").textContent = "ok:" + r.rail + ":" + r.amount; })' +
    '  .catch(function(e){ document.getElementById("out").textContent = "err:" + e.message; }); };' +
    'ent();' +
    '})();<\/script>';

  appPubB64 = await page.evaluate(async ({ html, domain, chainPayee }) => {
    const mk = (appId, extra) => GifOS.gif.encode(Object.assign({
      'manifest.json': JSON.stringify(Object.assign({ gifos: '1.0', appId, name: appId, entry: 'index.html', capabilities: { pay: true } }, extra)),
      'index.html': html,
    }));
    // Signed seller: a fresh Ed25519 domain key, the same signDomain the real
    // signer uses. Its public half is served at the domain by the route above.
    const { keyPair, publicKeyB64 } = await GifOS.sign.generateDomainKey();
    const raw = await mk('paytest', { pay: { to: chainPayee } });
    const signed = await GifOS.sign.signDomain(raw, domain, keyPair, Date.now());
    // Unsigned seller: same shape, no signature — must be refused outright.
    const unsigned = await mk('paynot', {});
    for (const [nm, bytes] of [['PayTest.gif', signed], ['PayNot.gif', unsigned]]) {
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: nm, bytes, kind: 'gif', isApp: true, appId: nm === 'PayTest.gif' ? 'paytest' : 'paynot', mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: nm, parent: null, x: nm === 'PayTest.gif' ? 620 : 700, y: 320, iconSize: 64 });
    }
    await GifOS.desktop.load(); await GifOS.desktop.render();
    return publicKeyB64;
  }, { html: APP_HTML, domain: SIGN_DOMAIN, chainPayee: CHAIN_PAYEE });

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'PayTest.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });
  const fr = app.frameLocator('iframe');

  // The capability acknowledgement — it must NAME the money ability in words
  // a person can judge, and it stands between the app and its first click.
  const ack = await app.locator('.perm-box').textContent({ timeout: 8000 }).catch(() => '');
  check('the acknowledgement names the pay capability plainly', /pay for things/i.test(ack), ack.replace(/\s+/g, ' ').slice(0, 120));
  await app.locator('.perm-modal .done').first().click({ timeout: 5000 }).catch(() => {});

  await fr.locator('#ent').filter({ hasText: /ent:/ }).waitFor({ timeout: 8000 });
  check('entitled() answers false before anything was bought',
    (await fr.locator('#ent').textContent()) === 'ent:false');

  // ---- the PayPal purchase, end to end --------------------------------------
  await fr.locator('#buy').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 10000 });
  const sheetText = await app.locator('#gifos-pay-sheet').textContent();
  check('the OS sheet is the TRUSTED display: verified identity, amount, reason',
    sheetText.includes(SIGN_DOMAIN) && sheetText.includes('✓ verified') && sheetText.includes('$5.00') && sheetText.includes('Unlock pro'),
    sheetText.replace(/\s+/g, ' ').slice(0, 140));
  check('the sheet sits in the OS page, not the app frame — the app cannot draw it',
    await app.evaluate(() => !!document.getElementById('gifos-pay-sheet')));

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    app.locator('#gp-paypal').click(),
  ]);
  await popup.waitForSelector('#pp-approve', { timeout: 10000 });
  check('the buyer approves in PayPal’s own window (fake), never in ours',
    /fake PayPal/.test(await popup.textContent('body')));
  await popup.locator('#pp-approve').click();

  await fr.locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: 20000 });
  const bought = await fr.locator('#out').textContent();
  check('the purchase completes: captured, receipt signed, verified, recorded',
    bought === 'ok:paypal:5000000', bought);
  await fr.locator('#ent').filter({ hasText: 'ent:true' }).waitFor({ timeout: 5000 });
  check('entitled() flips to true — held by the OS, not the app', true);

  const ppState = await (await fetch('http://127.0.0.1:8795/_state')).json();
  const unit = ppState.orders[0].purchase_units[0];
  check('the Worker derived the payee from the SIGNING IDENTITY (payments@<domain>)',
    unit.payee.email_address === 'payments@' + SIGN_DOMAIN, unit.payee.email_address);
  check('GifOS’s 3% rides the order as a platform fee to the treasury',
    unit.payment_instruction.platform_fees[0].amount.value === '0.15'
    && unit.payment_instruction.platform_fees[0].payee.email_address === 'payments@gifos.app',
    JSON.stringify(unit.payment_instruction.platform_fees[0].amount));

  // ---- refusals are refusals ------------------------------------------------
  await fr.locator('#buy').click();
  await fr.locator('#out').filter({ hasText: /err:/ }).waitFor({ timeout: 5000 });
  check('buying the same sku twice is refused BEFORE any sheet',
    /already purchased/.test(await fr.locator('#out').textContent()));

  await fr.locator('#tip').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 5000 });
  await app.locator('#gp-decline').click();
  await fr.locator('#out').filter({ hasText: /err:/ }).waitFor({ timeout: 5000 });
  check('a decline comes back as DECLINED_BY_USER — a normal outcome, by name',
    /DECLINED_BY_USER/.test(await fr.locator('#out').textContent()));

  // ---- the x402 rail: one approval, two transfers, 97/3 ---------------------
  await app.evaluate((sig) => {
    // The stub wallet the fake facilitator recognises: 'stub:' + b64(transfer).
    // A real Base Account stands here later; the broker cannot tell the
    // difference, which is the point of the adapter seam.
    window.GifOS.payWallet = {
      signTransfers: (ts) => Promise.resolve(ts.map((t) => 'stub:' + btoa(JSON.stringify(t)))),
    };
  });
  await fr.locator('#tip').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 5000 });
  await app.locator('#gp-x402').click();
  await fr.locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: 15000 });
  const tipped = await fr.locator('#out').textContent();
  check('the x402 tip settles', tipped === 'ok:x402:3000000', tipped);

  const facState = await (await fetch('http://127.0.0.1:8797/_state')).json();
  const settledTransfers = facState.settled[0].transfers;
  check('ONE approval produced TWO transfers: 97% to the signed payee, 3% to the treasury',
    settledTransfers.length === 2
    && settledTransfers[0].to === CHAIN_PAYEE && settledTransfers[0].amount === '2910000'
    && settledTransfers[1].to === TREASURY && settledTransfers[1].amount === '90000',
    JSON.stringify(settledTransfers.map((t) => t.amount)));

  // ---- the purse: OS-held, app-invisible, GIF-excluded ----------------------
  const purse = await app.evaluate(() => {
    const out = { ent: [], led: [] };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('pay.ent:')) out.ent.push(k);
      if (k.startsWith('pay.led:')) out.led.push(k);
    }
    return out;
  });
  check('the ledger holds one line per payment, in the OS’s own store',
    purse.led.length === 2 && purse.ent.length === 1, JSON.stringify(purse));

  // ---- over-ceiling and unsigned --------------------------------------------
  // The broker cached this appId's VALID verdict when the real app charged,
  // so an over-ceiling ask reaches the ceiling check and dies there — before
  // any sheet, exactly where the doctrine wants it.
  const over = await app.evaluate(() =>
    GifOS.payBroker.charge({ appId: 'paytest', name: 'paytest', capabilities: { pay: true } }, new Uint8Array(0), { amount: '25000000', reason: 'too much' }, 'paytest')
      .then(() => 'ALLOWED', (e) => String(e.message || e)));
  check('an ask above the ceiling is refused before any sheet', /ceiling/.test(over), over);

  await app.close();
  const [app2] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'PayNot.gif' }).dblclick(),
  ]);
  await app2.waitForSelector('iframe', { timeout: 8000 });
  const fr2 = app2.frameLocator('iframe');
  await app2.locator('.perm-modal .done').first().click({ timeout: 5000 }).catch(() => {});
  await fr2.locator('#buy').click();
  await fr2.locator('#out').filter({ hasText: /err:/ }).waitFor({ timeout: 8000 });
  check('an UNSIGNED app cannot charge — refused, not warned',
    /not signed/.test(await fr2.locator('#out').textContent()),
    await fr2.locator('#out').textContent());
  check('no sheet ever appeared for the unsigned app',
    await app2.evaluate(() => !document.getElementById('gifos-pay-sheet')));

  await browser.close();
  catalog.close();
  for (const k of kids) { try { k.kill(); } catch (e) {} }
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR:', e);
  for (const k of kids) { try { k.kill(); } catch (e2) {} }
  process.exit(1);
});
