// End-to-end: the SHIPPED Tip GifOS Creators app — the real signed GIF, the
// real published key, the real registry — offers exactly the rails its
// signed manifest lists, and completes two of them.
//
// e2e-pay proves every rail's machinery on a synthetic app it signs itself;
// this suite proves the app people actually install is wired to it: the
// store-built, gifos.app-SIGNED tip-creators.gif mounts, verifies against
// the REAL published key (site/gifos.key — no substitute, on the OS page AND
// at the pay Worker, which reads the payee from the app's own signature
// proof), and its sheet offers exactly capabilities.pay: PayPal,
// connected-wallet USDC (x402) and wallet transfer (RockWallet et al) —
// not FedNow, not the agent rail. The wallet-transfer rail then runs to a
// signed receipt with the app's default $10 (it depends on a committed
// fact that could silently rot: gifos.app registered on the real
// site/pay/registry.json), and x402 settles the same $10 as the 97/3 split.
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
  // pay-local against the REAL registry on 8099, and the author's key for
  // the proof from the static site's own /gifos.key — the REAL committed
  // site/gifos.key, standing in for https://gifos.app/gifos.key.
  serve('pay-local', [path.join(ROOT, 'test', 'servers', 'pay-local.js')], { KEY_URL: BASE + '/gifos.key' });
  await until('http://127.0.0.1:8795/_state');
  await until('http://127.0.0.1:8797/_state');
  await until('http://127.0.0.1:8799/_state');
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
  // Receipts verify against /gifos-pay.key (the Worker's own key, never the
  // provenance key above) — pay-local's throwaway stands in for it.
  await context.route('**/gifos-pay.key', (route) => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: receiptPub }));

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

  // An EIP-1193 fake stands where the Base Account provider stands, so the
  // REAL adapter runs its whole path; only the signature is fake, and the
  // facilitator fake says so. Installed before the sheet opens.
  await app.evaluate(() => {
    window.__gifosTestProvider = {
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x' + 'ab'.repeat(20)];
        if (method === 'eth_chainId') return '0x14a34';
        if (method === 'wallet_switchEthereumChain') return null;
        if (method === 'eth_signTypedData_v4') return '0x' + '11'.repeat(65);
        throw new Error('test provider: unexpected ' + method);
      },
    };
  });

  // ---- the sheet offers exactly the rails the signed manifest lists --------
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
    mpp: !!document.getElementById('gp-mpp'),
  }));
  check('EXACTLY the listed rails are offered: PayPal, connected-wallet USDC, wallet transfer — no FedNow, no agent button',
    rails.paypal && rails.x402 && rails.transfer && !rails.fednow && !rails.mpp, JSON.stringify(rails));
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
  // THE PRE-MINT ATTACK, at the shipped app: a stranger's transfer of the
  // exact dusted amount lands BEFORE the tipper has named a wallet. The
  // invoice is unbound, so the Worker must not even look — nobody is
  // thanked, the sheet stays up, and the tipper's own wallet is still asked for.
  await fetch('http://127.0.0.1:8799/_send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: TREASURY, value: units, from: '0x' + '22'.repeat(20) }) });
  await sleep(4500);
  check('a stranger\'s exact-amount transfer does NOT complete an UNBOUND invoice',
    await app.evaluate(() => !!document.getElementById('gifos-pay-transfer')), 'sheet still up');
  check('…and the sheet says it is waiting for the wallet address, not watching the chain',
    /Waiting for your wallet address/.test(await app.locator('#gpt-status').textContent()));
  // The tipper names their wallet; only a transfer FROM it completes the tip.
  const TIPPER = '0x' + '11'.repeat(20);
  await app.locator('#gpt-from').fill(TIPPER);
  await app.locator('#gpt-bind').click();
  await app.locator('#gpt-bound').filter({ hasText: /Bound to/ }).waitFor({ timeout: 8000 });
  await fetch('http://127.0.0.1:8799/_send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: TREASURY, value: units, from: TIPPER }) });
  await fr.locator('#thanks-line').waitFor({ timeout: 20000 });
  check('the shipped app says thanks, naming the rail\'s own words',
    /went through in USDC/.test(await fr.locator('#thanks-line').textContent()),
    await fr.locator('#thanks-line').textContent());

  // ---- x402, end to end, at the same default $10 -----------------------------
  await fr.locator('#again').click();
  await fr.locator('#send').click();
  await app.waitForSelector('#gifos-pay-sheet', { timeout: 5000 });
  await app.locator('#gp-x402').click();
  await fr.locator('#thanks-line').waitFor({ timeout: 20000 });
  check('the x402 tip lands as a thank-you in the shipped app',
    /went through in USDC/.test(await fr.locator('#thanks-line').textContent()),
    await fr.locator('#thanks-line').textContent());
  const fac = await (await fetch('http://127.0.0.1:8797/_state')).json();
  check('the $10 settled as the 97/3 split (fee leg first), both legs to the committed treasury (the tip jar\'s signed payee)',
    fac.settled.length === 2
    && fac.settled[0].to === TREASURY && fac.settled[0].value === '300000'
    && fac.settled[1].to === TREASURY && fac.settled[1].value === '9700000',
    JSON.stringify(fac.settled.map((t) => t.to.slice(0, 6) + ':' + t.value)));

  await browser.close();
  for (const k of kids) { try { k.kill(); } catch (e) {} }
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR:', e);
  for (const k of kids) { try { k.kill(); } catch (e2) {} }
  process.exit(1);
});
