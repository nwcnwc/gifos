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
// pay-local (8796), fake-facilitator (8797), a test catalog (8798),
// fake-chain (8799) and fake-fednow (8800).
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
    if (/registry/.test(req.url)) {
      // The rails registry: paytest is current; expired.example.com lapsed
      // last year; unregistered.example.com was never on it.
      return res.end(JSON.stringify({ registered: {
        [SIGN_DOMAIN]: { until: '2027-01-01' },
        'expired.example.com': { until: '2025-01-01' },
      } }));
    }
    res.end(JSON.stringify({ apps: [
      { appId: 'paytest', slug: 'paytest', signature: { type: 'domain', id: SIGN_DOMAIN }, pay: { to: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C' } },
      { appId: 'payfree', slug: 'payfree', signature: { type: 'domain', id: 'unregistered.example.com' }, pay: { to: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C' } },
      { appId: 'payold', slug: 'payold', signature: { type: 'domain', id: 'expired.example.com' }, pay: { to: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C' } },
    ] }));
  }).listen(8798);

  serve('fake-paypal', [path.join(ROOT, 'test', 'servers', 'fake-paypal.js')]);
  serve('fake-facilitator', [path.join(ROOT, 'test', 'servers', 'fake-facilitator.js')]);
  serve('fake-chain', [path.join(ROOT, 'test', 'servers', 'fake-chain.js')]);
  serve('fake-fednow', [path.join(ROOT, 'test', 'servers', 'fake-fednow.js')]);
  serve('pay-local', [path.join(ROOT, 'test', 'servers', 'pay-local.js')], { CATALOG_URL: 'http://127.0.0.1:8798/index.json', REGISTRY_URL: 'http://127.0.0.1:8798/registry.json' });
  await until('http://127.0.0.1:8795/_state');
  await until('http://127.0.0.1:8797/_state');
  await until('http://127.0.0.1:8799/_state');
  await until('http://127.0.0.1:8800/_state');
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
    '<div id="out">-</div><div id="ent">-</div><div id="lic">-</div>' +
    '<script>(function(){' +
    'function ent(){ return gifos.entitled("pro").then(function(v){ document.getElementById("ent").textContent = "ent:" + v; }); }' +
    'document.getElementById("buy").onclick = function(){ document.getElementById("out").textContent="…";' +
    '  gifos.charge({ sku:"pro", amount:"5000000", reason:"Unlock pro" })' +
    '  .then(function(r){ document.getElementById("out").textContent = "ok:" + r.rail + ":" + r.amount; ' +
    '    return gifos.license("pro").then(function(l){ document.getElementById("lic").textContent = "lic:" + l; }).then(ent); })' +
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
  const lic = await fr.locator('#lic').textContent();
  check('license() hands the app the receipt\'s tx — the seller\'s anchor for account/save identity',
    /^lic:CAP-ORD-/.test(lic), lic);

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
  // An EIP-1193 fake stands where the Base Account provider stands, so the
  // REAL adapter (gifos-paywallet.js) runs its whole path — connect, chain
  // check, EIP-3009 typed data, one eth_signTypedData_v4 per transfer. Only
  // the signature itself is fake, and the facilitator fake says so.
  await app.evaluate(() => {
    window.__signedTypedData = [];
    window.__gifosTestProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts') return ['0x' + 'ab'.repeat(20)];
        if (method === 'eth_chainId') return '0x14a34';
        if (method === 'wallet_switchEthereumChain') return null;
        if (method === 'eth_signTypedData_v4') {
          window.__signedTypedData.push(JSON.parse(params[1]));
          return '0x' + '11'.repeat(65);
        }
        throw new Error('test provider: unexpected ' + method);
      },
    };
  });
  await fr.locator('#tip').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 5000 });
  await app.locator('#gp-x402').click();
  await fr.locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: 15000 });
  const tipped = await fr.locator('#out').textContent();
  check('the x402 tip settles', tipped === 'ok:x402:3000000', tipped);

  const facState = await (await fetch('http://127.0.0.1:8797/_state')).json();
  check('ONE approval settled TWO transfers on the STANDARD wire: 97% to the signed payee, 3% to the treasury',
    facState.settled.length === 2
    && facState.settled[0].to === CHAIN_PAYEE && facState.settled[0].value === '2910000'
    && facState.settled[1].to === TREASURY && facState.settled[1].value === '90000',
    JSON.stringify(facState.settled.map((t) => t.value)));
  const signedTds = await app.evaluate(() => window.__signedTypedData);
  check('what the wallet signed IS EIP-3009 for the displayed split — built by the OS, not the app',
    signedTds.length === 2
    && signedTds.every((td) => td.primaryType === 'TransferWithAuthorization' && td.domain.chainId === 84532)
    && signedTds[0].message.value === '2910000' && signedTds[0].message.to === CHAIN_PAYEE
    && signedTds[1].message.value === '90000' && signedTds[1].message.to === TREASURY,
    JSON.stringify(signedTds.map((t) => t.message && t.message.value)));

  // ---- the WALLET-TRANSFER rail (RockWallet and every other wallet) ---------
  // No connection, no adapter: the sheet shows exactly-this-much to
  // exactly-this-address, the "wallet" (fake-chain's test hook) sends it, the
  // Worker finds the transfer on the chain and signs the same receipt shape.
  await fr.locator('#tip').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 5000 });
  await app.locator('#gp-transfer').click();
  await app.waitForSelector('#gifos-pay-transfer', { timeout: 10000 });
  const tExact = await app.locator('#gpt-amt').textContent();
  check('the transfer sheet demands an EXACT dust-unique amount (sub-cent uniqueness)',
    /^3\.00[0-9]{4}$/.test(tExact) && tExact !== '3.000000', tExact);
  const tSheet = await app.locator('#gifos-pay-transfer').textContent();
  check('the transfer sheet names RockWallet, the chain, and the signed payee address',
    /RockWallet/.test(tSheet) && /Base Sepolia/.test(tSheet) && tSheet.includes(CHAIN_PAYEE),
    tSheet.replace(/\s+/g, ' ').slice(0, 120));
  // a WRONG amount from someone else's payment must not complete this invoice
  await fetch('http://127.0.0.1:8799/_send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: CHAIN_PAYEE, value: '3000000' }) });
  await sleep(4000);
  check('a transfer of the WRONG amount is not claimed', await app.evaluate(() => !!document.getElementById('gifos-pay-transfer')));
  const tUnits = String(BigInt(Math.round(Number(tExact) * 1e6)));
  await fetch('http://127.0.0.1:8799/_send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: CHAIN_PAYEE, value: tUnits }) });
  await fr.locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: 20000 });
  check('the exact transfer completes the payment with the same signed-receipt proof',
    (await fr.locator('#out').textContent()) === 'ok:transfer:3000000', await fr.locator('#out').textContent());

  // ---- the FEDNOW rail ------------------------------------------------------
  // The buyer approves in their own BANKING APP — nothing of ours renders
  // there, so the fake's approval is a test hook, exactly as its header says.
  await fr.locator('#tip').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 5000 });
  await app.locator('#gp-fednow').click();
  await app.waitForFunction(() => {
    const el = document.getElementById('gpb-msg');
    return el && /banking app/.test(el.textContent);
  }, null, { timeout: 10000 });
  check('the FedNow flow tells the human where the approval actually happens (their bank)', true);
  const fnState = await (await fetch('http://127.0.0.1:8800/_state')).json();
  const rfp = fnState.rfps[fnState.rfps.length - 1];
  check('the RfP names the REGISTERED provider account for the signing identity — never a client value',
    rfp.account === 'ACCT-PAYTEST' && rfp.amount === '3.00', JSON.stringify({ account: rfp.account, amount: rfp.amount }));
  await fetch('http://127.0.0.1:8800/_approve?id=' + rfp.id, { method: 'POST' });
  await fr.locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: 15000 });
  check('the bank approval settles it — same receipt shape, fee honestly marked uncollected',
    (await fr.locator('#out').textContent()) === 'ok:fednow:3000000', await fr.locator('#out').textContent());

  // ---- the rails REGISTRY: the fee-free rails are registered-only -----------
  // These rails collect no cut, so they are open only to identities on the
  // published registry (fee not yet set). Refusals are PLAIN and name the
  // policy — and the fee-collecting rails stay open to everyone.
  const invUnreg = await fetch(PAY + '/transfer/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'payfree', amount: '3000000', sku: null, reason: 'x' }) });
  check('an UNREGISTERED identity is refused the transfer rail, plainly',
    invUnreg.status === 403 && /not registered for the fee-free rails/.test((await invUnreg.json()).error));
  const rfpUnreg = await fetch(PAY + '/fednow/rfp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'payfree', amount: '3000000', sku: null, reason: 'x' }) });
  check('…and the FedNow rail', rfpUnreg.status === 403 && /not registered for the fee-free rails/.test((await rfpUnreg.json()).error));
  const invOld = await fetch(PAY + '/transfer/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'payold', amount: '3000000', sku: null, reason: 'x' }) });
  check('an EXPIRED registration is refused with its lapse date and the way back',
    invOld.status === 403 && /expired on 2025-01-01/.test((await invOld.json()).error));
  const invReg = await fetch(PAY + '/transfer/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'paytest', amount: '3000000', sku: null, reason: 'x' }) });
  check('a CURRENT registration still gets its invoice', invReg.status === 200 && !!(await invReg.json()).token);

  // ---- the receipt is a FILE: minted, placed, restorable --------------------
  // The broker minted a receipt GIF per payment and queued it; the DESKTOP tab
  // (still open) heard the storage event and placed both into the lazy
  // Purchases folder — saveItem's monopoly intact, no third putItem call site.
  await page.locator('.icon', { hasText: 'Purchases' }).waitFor({ timeout: 15000 });
  check('the Purchases folder appears on the desktop, lazily, on first purchase', true);
  const placed = await page.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const inFolder = items.filter((i) => i.parent === 'sys_purchases');
    return { count: inFolder.length, names: inFolder.map((i) => i.name), queue: localStorage.getItem('gifos_pay_pending') };
  });
  check('all four receipts were filed INTO the folder and the queue was drained',
    placed.count === 4 && placed.queue === null, JSON.stringify(placed));

  // A FRESH computer: hand it nothing but the receipt file, open it, and the
  // entitlement re-grants there — restore with no account anywhere.
  const receiptBytes = await page.evaluate(async () => {
    const files = await GifOS.store.allFiles();
    const f = files.find((x) => /^Receipt — paytest — pro/.test(x.name));
    return f ? Array.from(f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes)) : null;
  });
  check('the receipt file exists and is small enough to text to a friend',
    receiptBytes && receiptBytes.length > 500 && receiptBytes.length < 200000,
    receiptBytes ? receiptBytes.length + ' bytes' : 'missing');

  const ctx2 = await browser.newContext();
  await ctx2.route('**/gifos.key', (route) => {
    const host = new URL(route.request().url()).hostname;
    route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: host === SIGN_DOMAIN ? appPubB64 : receiptPub });
  });
  const fresh = await ctx2.newPage();
  await fresh.goto(BASE + '/index.html');
  await fresh.waitForSelector('.icon', { timeout: 10000 });
  check('the fresh computer starts with NO entitlement',
    await fresh.evaluate(() => localStorage.getItem('pay.ent:paytest:pro') === null));
  await fresh.evaluate(async (bytesArr) => {
    const bytes = new Uint8Array(bytesArr);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Receipt.gif', bytes, kind: 'gif', isApp: true, appId: 'gifos-receipt', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Receipt.gif', parent: null, x: 620, y: 400, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, receiptBytes);
  const [viewer] = await Promise.all([
    ctx2.waitForEvent('page'),
    fresh.locator('.icon', { hasText: 'Receipt.gif' }).dblclick(),
  ]);
  await viewer.waitForSelector('iframe', { timeout: 8000 });
  const vfr = viewer.frameLocator('iframe');
  await vfr.locator('main').waitFor({ timeout: 8000 });
  check('the receipt viewer shows the purchase to whoever holds the file',
    /\$5\.00/.test(await vfr.locator('main').textContent()));
  await viewer.waitForFunction(() => localStorage.getItem('pay.ent:paytest:pro') !== null, null, { timeout: 8000 });
  const restored = await viewer.evaluate(() => JSON.parse(localStorage.getItem('pay.ent:paytest:pro')));
  check('OPENING the receipt re-granted the entitlement — same license id, no account, no server of ours',
    restored && /^CAP-ORD-/.test(restored.tx), JSON.stringify(restored));
  await viewer.close(); await ctx2.close();

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
  check('the ledger holds one line per payment — four rails, four lines',
    purse.led.length === 4 && purse.ent.length === 1, JSON.stringify(purse));

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
