// e2e-meet-app-prettyurl.js — an app shared into a meeting must STAY mounted
// when the meeting page runs at the pretty /meet/<room> URL.
//
// THE REGRESSION THIS GUARDS (prod-only, ~1s teardown):
//   run.html "Meeting" toggle -> meet.html#app=<fileId> auto-hosts the app.
//   On gifos.app the meeting rewrites its address to the pretty /meet/<room>
//   form (history.replaceState). That moves the document's BASE URL. The
//   runtime then loads its owner-authority module with a bare relative path
//   ('js/app-owner.js'), which now resolves to /meet/js/app-owner.js and 404s.
//   With no signer the mesh Stage-bus host can't attach, becomeHost's share
//   fails, and the app tears straight back down ~1s after it flashed up.
//   Local dev never hits it: the pretty rewrite is gifos.app-only, so the base
//   stays at /meet.html and the relative path resolves fine. It shipped to
//   production unseen for exactly that reason.
//
// HOW THIS REPRODUCES IT OFFLINE:
//   * serviceWorkers:'block' so Playwright can rewrite the served meet.html.
//   * a context route forces `const pretty = true` in meet.html, so the local
//     run does the SAME /meet/<room> replaceState as prod (it is otherwise
//     gated on the gifos.app hostname AND a default relay — and we use a local
//     relay, so both gates are off without this).
//   The fix anchors app-owner.js to runtime.js's own script URL, so it resolves
//   correctly under any base. This drill fails hard if that anchoring regresses.
//
// Self-contained: own relay + site for THIS checkout. Safe from a worktree.
// Run: node test/drills/e2e-meet-app-prettyurl.js
// Prefer nvidia-laptop (browser). Needs node 22 + MEET_CHROME.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || (require('fs').existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome'
      : '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
const RELAY_PORT = parseInt(process.env.MAPRETTY_RELAY_PORT || '8845', 10);
const SITE_PORT = parseInt(process.env.MAPRETTY_SITE_PORT || '8847', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) failures++;
};

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), RELAY_DEV: '1',
      TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d',
    path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });

  // serviceWorkers:'block' — the dev SW would serve meet.html from its own
  // cache and bypass the route rewrite below (and mask the real base-URL path).
  const ctx = await browser.newContext({
    permissions: ['camera', 'microphone'], viewport: { width: 1100, height: 800 },
    serviceWorkers: 'block',
  });
  await ctx.addInitScript({ content:
    "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Ada');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });

  // Force the gifos.app-only pretty /meet/<room> rewrite to run locally, so the
  // document base moves exactly as it does on production.
  let patched = false;
  await ctx.route('**/meet.html**', async (route) => {
    const resp = await route.fetch();
    let body = await resp.text();
    const before = body;
    body = body.replace('const pretty = /(^|\\.)gifos\\.app$/.test(location.hostname) && !custom;', 'const pretty = true;');
    patched = body !== before;
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });

  // ---- seed a desktop so the store holds the sample apps (incl. connect4) ----
  const desk = await ctx.newPage();
  desk.on('pageerror', (e) => console.log('  [desk] pageerror: ' + e.message));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 90000 });
  const appId = await desk.evaluate(async () => {
    const fs = await window.GifOS.store.allFiles();
    const a = fs.find((f) => f.isApp && f.appId !== 'meet' && f.appId !== 'video');
    return a ? a.id : null;
  });
  check('seeded desktop exposes a runnable app fileId', !!appId, appId);

  // ---- open the app in run.html, then toggle it into a meeting ----
  const run = await ctx.newPage();
  const owner404 = [];
  run.on('response', (r) => { if (r.status() >= 400 && /app-owner/.test(r.url())) owner404.push(r.url()); });
  run.on('console', (m) => { if (/Could not run|app-owner/i.test(m.text())) console.log('  [run] ' + m.text().slice(0, 160)); });
  run.on('pageerror', (e) => console.log('  [run] pageerror: ' + e.message));
  await run.goto(BASE + '/run.html#id=' + appId);
  await run.waitForSelector('iframe', { timeout: 15000 });
  await sleep(600);
  const ack = run.locator('.perm-modal .done'); if (await ack.count()) await ack.first().click().catch(() => {});
  await run.locator('#tomeet').click();
  await run.waitForSelector('#appmount iframe', { timeout: 40000 });
  const t0 = Date.now();

  check('route forced the pretty-URL gate on (harness precondition)', patched);
  const at = await run.evaluate(() => location.pathname);
  check('meeting rewrote its address to the pretty /meet/<room> form', /^\/meet\//.test(at), at);

  // The teardown, when present, fires ~1s after mount. Watch 8s and require the
  // app to remain mounted the WHOLE time (has-app class + appActive()).
  let everDropped = false;
  for (let i = 0; i < 40; i++) {
    const up = await run.evaluate(() => !!(document.body.classList.contains('has-app') && window.__gifosVideo && window.__gifosVideo.appActive()));
    if (!up) everDropped = true;
    await sleep(200);
  }
  check('the runtime did NOT 404 app-owner.js under the /meet/ base', owner404.length === 0, owner404[0] || 'none');
  check('the shared app STAYED mounted (no ~1s teardown)', !everDropped);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
