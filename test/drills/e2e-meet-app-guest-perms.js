// e2e-meet-app-guest-perms.js — a GUEST of a meeting must mount a shared app
// AND get its network-permission challenge, under the pretty /meet/<room> URL.
//
// THE REGRESSION THIS GUARDS:
//   A host shares a network-capable app (the Bible Browser, which reads
//   text.recoveryversion.bible through the CORS proxy). Every viewer's iframe
//   runs the app locally, so the GUEST must (a) mount it and (b) be shown the
//   "allow this app to reach the internet" challenge before it can fetch.
//
//   On gifos.app the meeting rewrites its address to the pretty /meet/<room>
//   form (history.replaceState), moving the document base URL. The guest's
//   client mount (bootClientBus) loads the owner-authority verifier on demand;
//   if that load uses a bare relative path it resolves to /meet/js/app-owner.js
//   and 404s, so bootClientBus throws BEFORE mountApp runs — and mountApp is
//   what both renders the iframe and fires __gifosPermissions (the challenge).
//   Result the user saw: the guest gets a blank space and no challenge, while
//   the host (whose base also moved but whose share still limped up) sees it.
//   The fix anchors app-owner.js to runtime.js's own URL (see runtime.js).
//   Local dev never rewrites to /meet/, so this only ever bit production —
//   which is why this drill forces the pretty rewrite locally.
//
// Self-contained: own relay + site for THIS checkout. Safe from a worktree.
// Run: node test/drills/e2e-meet-app-guest-perms.js
// Prefer nvidia-laptop (browser). Needs node 22 + MEET_CHROME.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || (require('fs').existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome'
      : '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
const RELAY_PORT = parseInt(process.env.MAGUEST_RELAY_PORT || '8849', 10);
const SITE_PORT = parseInt(process.env.MAGUEST_SITE_PORT || '8851', 10);
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

  // Each context blocks the SW (so the route rewrite is observable) and forces
  // the gifos.app-only pretty /meet/<room> rewrite, so BOTH host and guest run
  // under the moved document base exactly as on production.
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], serviceWorkers: 'block' });
    await ctx.addInitScript({ content:
      "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    await ctx.route('**/meet.html**', async (route) => {
      const resp = await route.fetch();
      let body = await resp.text();
      body = body.replace('const pretty = /(^|\\.)gifos\\.app$/.test(location.hostname) && !custom;', 'const pretty = true;');
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });
    return ctx;
  };

  // ---- host: seed a desktop (store holds the Bible app), open a meeting ----
  const aCtx = await newUser('Ada');
  const aDesk = await aCtx.newPage();
  aDesk.on('pageerror', (e) => { if (!/serviceWorker/.test(e.message)) console.log('  [desk] ' + e.message); });
  await aDesk.goto(BASE + '/index.html');
  await aDesk.waitForSelector('.icon', { timeout: 90000 });
  const bibleId = await aDesk.evaluate(async () => {
    const fs = await window.GifOS.store.allFiles();
    const a = fs.find((f) => f.isApp && f.appId === 'bible');
    return a ? a.id : null;
  });
  check('seeded desktop exposes the network-capable Bible app', !!bibleId, bibleId);

  const aMeet = await aCtx.newPage();
  aMeet.on('pageerror', (e) => { if (!/serviceWorker/.test(e.message)) console.log('  [A] ' + e.message.slice(0, 140)); });
  await aMeet.goto(BASE + '/meet.html');
  await aMeet.locator('#lob-open').click();
  await aMeet.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 45000 });
  const atPath = await aMeet.evaluate(() => location.pathname);
  check('host rewrote to the pretty /meet/<room> form', /^\/meet\//.test(atPath), atPath);
  const room = await aMeet.evaluate(() => window.__gifosVideo.room());

  // ---- guest joins via a #v= link (loads locally; meet.html then replaceStates
  //      its base to /meet/<room>, the prod condition without a /meet/ route) ----
  const bCtx = await newUser('Ben');
  const bMeet = await bCtx.newPage();
  const guest404 = [];
  bMeet.on('response', (r) => { if (r.status() >= 400 && /app-owner/.test(r.url())) guest404.push(r.url()); });
  bMeet.on('pageerror', (e) => { if (!/serviceWorker/.test(e.message)) console.log('  [B] ' + e.message.slice(0, 140)); });
  await bMeet.goto(BASE + '/meet.html#v=' + room + '&relay=' + encodeURIComponent(RELAY));
  await aMeet.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  await bMeet.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  check('both participants are meshed', true);

  // ---- host shares the Bible app; ack its own challenge so the share settles ----
  await aMeet.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'Bible Browser'), bibleId);
  await aMeet.waitForSelector('#appmount iframe', { timeout: 30000 });
  await sleep(500);
  const aAck = aMeet.locator('.perm-modal .done'); if (await aAck.count()) await aAck.first().click().catch(() => {});
  check('host mounted the shared app', await aMeet.evaluate(() => window.__gifosVideo.appActive()));

  // ---- THE GUARD: the guest must mount the app AND be shown the challenge ----
  // 45s is generous — app adoption over a real (here local) mesh pulls a
  // retained snapshot and can lag; the assertion is that it happens AT ALL.
  let mounted = false, challenged = false;
  for (let i = 0; i < 90; i++) {
    const st = await bMeet.evaluate(() => ({
      iframe: !!document.querySelector('#appmount iframe'),
      modal: !!document.querySelector('.perm-modal'),
    }));
    if (st.iframe) mounted = true;
    if (st.modal) challenged = true;
    if (mounted && challenged) break;
    await sleep(500);
  }
  check('the guest did NOT 404 app-owner.js under the /meet/ base', guest404.length === 0, guest404[0] || 'none');
  check('the guest MOUNTED the shared app (not a blank space)', mounted);
  check('the guest was shown the network-permission CHALLENGE', challenged);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
