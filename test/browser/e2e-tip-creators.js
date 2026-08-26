// End-to-end: the SHIPPED Tip GifOS Creators app — the real signed GIF, the
// real catalog, the real registry — offers all FOUR rails and completes one.
//
// e2e-pay proves every rail's machinery on a synthetic app it signs itself;
// this suite proves the app people actually install is wired to all of it:
// the store-built, gifos.app-SIGNED tip-creators.gif mounts, verifies against
// the REAL published key (site/gifos.key — no substitute), derives
// payments@gifos.app, and its sheet offers PayPal, connected-wallet USDC,
// wallet transfer (RockWallet et al) and FedNow. The wallet-transfer rail
// then runs to a signed receipt with the app's default $10, and FedNow to a
// settled RfP — the two rails whose availability also depends on live
// catalog + registry facts (pay.to committed, gifos.app registered
// perpetual), which is exactly what could silently rot.
//
// Needs: static server on 8099. Spawns the payment fixtures itself, same
// ports as e2e-pay (the two suites must not run concurrently).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');
const need = require('../lib/need');
const { appGif } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const PAY = 'http://127.0.0.1:8796';
const ROOT = path.join(__dirname, '..', '..');
const TREASURY = '0x1111111111111111111111111111111111111111';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kids = [];
function serve(name, args, env) {
  const p = spawn(process.execPath, args, { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] });
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
  serve('fake-paypal', [path.join(ROOT, 'test', 'servers', 'fake-paypal.js')]);
  serve('fake-facilitator', [path.join(ROOT, 'test', 'servers', 'fake-facilitator.js')]);
  serve('fake-chain', [path.join(ROOT, 'test', 'servers', 'fake-chain.js')]);
  serve('fake-fednow', [path.join(ROOT, 'test', 'servers', 'fake-fednow.js')]);
  // pay-local against the REAL published catalog and registry on 8099 — the
  // point of this suite is that those committed facts serve the shipped app.
  serve('pay-local', [path.join(ROOT, 'test', 'servers', 'pay-local.js')]);
  await until('http://127.0.0.1:8795/_state');
  await until('http://127.0.0.1:8797/_state');
  await until('http://127.0.0.1:8799/_state');
  await until('http://127.0.0.1:8800/_state');
  await until(PAY + '/health');
  const receiptPub = await (await fetch(PAY + '/test-pubkey')).text();
  // The app's signature must verify against the REAL published key — if this
  // suite ever needs a substitute there, the shipped app is not really signed.
  const realKey = fs.readFileSync(path.join(ROOT, 'site', 'gifos.key'), 'utf8').trim();

  const tipBytes = Array.from(fs.readFileSync(appGif('tip-creators')));

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  await context.addInitScript((payBase) => {
    try { window.localStorage.setItem('gifos_pay_worker', payBase); } catch (e) {}
  }, PAY);
  await context.route('**/gifos.key', (route) => {
    const host = new URL(route.request().url()).hostname;
    // gifos.app -> the REAL key (the app's signature is real); the origin's
    // own /gifos.key -> the throwaway receipt key pay-local signs with.
    route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: host === 'gifos.app' ? realKey : receiptPub });
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await page.evaluate(async (bytesArr) => {
    const bytes = new Uint8Array(bytesArr);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Tip GifOS Creators.gif', bytes, kind: 'gif', isApp: true, appId: 'tip-creators', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Tip GifOS Creators.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, tipBytes);

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Tip GifOS Creators' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });
  const fr = app.frameLocator('iframe');
  await app.locator('.perm-modal .done').first().click({ timeout: 8000 }).catch(() => {});

  // ---- the sheet offers all FOUR rails --------------------------------------
  await fr.locator('#send').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 10000 });
  const sheet = await app.locator('#gifos-pay-sheet').textContent();
  check('the sheet names the VERIFIED gifos.app identity for the real signed GIF',
    /gifos\.app/.test(sheet) && /✓ verified/.test(sheet), sheet.replace(/\s+/g, ' ').slice(0, 100));
  const rails = await app.evaluate(() => ({
    paypal: !!document.getElementById('gp-paypal'),
    x402: !!document.getElementById('gp-x402'),
    transfer: !!document.getElementById('gp-transfer'),
    fednow: !!document.getElementById('gp-fednow'),
  }));
  check('ALL FOUR rails are offered: PayPal, connected-wallet USDC, wallet transfer, FedNow',
    rails.paypal && rails.x402 && rails.transfer && rails.fednow, JSON.stringify(rails));
  check('the tip is editable on the sheet (the human chooses the amount)',
    await app.evaluate(() => !!document.getElementById('gp-amt')));

  // ---- the wallet-transfer rail, end to end, at the app's default $10 -------
  await app.locator('#gp-transfer').click();
  await app.waitForSelector('#gifos-pay-transfer', { timeout: 10000 });
  const exact = await app.locator('#gpt-amt').textContent();
  check('the invoice is the default $10 plus dust, payable to the committed treasury',
    /^10\.00[0-9]{4}$/.test(exact), exact);
  const tSheet = await app.locator('#gifos-pay-transfer').textContent();
  check('the transfer sheet names the treasury address from the SIGNED manifest',
    tSheet.includes(TREASURY), tSheet.replace(/\s+/g, ' ').slice(0, 80));
  const units = String(BigInt(Math.round(Number(exact) * 1e6)));
  await fetch('http://127.0.0.1:8799/_send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: TREASURY, value: units }) });
  await fr.locator('#thanks-line').waitFor({ timeout: 20000 });
  check('the shipped app says thanks, naming the rail\'s own words',
    /went through in USDC/.test(await fr.locator('#thanks-line').textContent()),
    await fr.locator('#thanks-line').textContent());

  // ---- FedNow: gifos.app is registered (registry) and provisioned (payees) --
  await fr.locator('#again').click();
  await fr.locator('#send').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 5000 });
  await app.locator('#gp-fednow').click();
  await app.waitForFunction(() => {
    const el = document.getElementById('gpb-msg');
    return el && /banking app/.test(el.textContent);
  }, null, { timeout: 10000 });
  const fnState = await (await fetch('http://127.0.0.1:8800/_state')).json();
  const rfp = fnState.rfps[fnState.rfps.length - 1];
  check('the RfP runs under gifos.app\'s registered account, for the default $10',
    rfp.account === 'ACCT-GIFOS' && rfp.amount === '10.00', JSON.stringify({ account: rfp.account, amount: rfp.amount }));
  await fetch('http://127.0.0.1:8800/_approve?id=' + rfp.id, { method: 'POST' });
  await fr.locator('#thanks-line').waitFor({ timeout: 15000 });
  check('the bank approval lands as a thank-you in the shipped app',
    /went through from your bank/.test(await fr.locator('#thanks-line').textContent()),
    await fr.locator('#thanks-line').textContent());

  await browser.close();
  for (const k of kids) { try { k.kill(); } catch (e) {} }
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR:', e);
  for (const k of kids) { try { k.kill(); } catch (e2) {} }
  process.exit(1);
});
