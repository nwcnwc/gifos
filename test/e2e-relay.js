// Remote-relay e2e: a HOST browser and a CLIENT browser in separate contexts
// (separate IndexedDB = separate "machines"), connected only via the local relay.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const setRelay = { content: "try{localStorage.setItem('gifos_relay','" + RELAY + "')}catch(e){}" };

  // ---------- HOST ----------
  const hostCtx = await browser.newContext();
  await hostCtx.addInitScript(setRelay);
  const hostDesk = await hostCtx.newPage();
  hostDesk.on('console', (m) => { if (m.type() === 'error') console.log('  [host desk]', m.text()); });
  await hostDesk.goto(BASE + '/index.html');
  await hostDesk.waitForSelector('.icon');
  const [hostRun] = await Promise.all([
    hostCtx.waitForEvent('page'),
    hostDesk.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick(),
  ]);
  hostRun.on('console', (m) => { if (m.type() === 'error') console.log('  [host run]', m.text()); });
  await hostRun.waitForSelector('iframe');
  const hostApp = hostRun.frameLocator('iframe');
  await hostApp.locator('#msg').waitFor({ timeout: 8000 });

  // host signs the guestbook BEFORE anyone joins
  await hostApp.locator('#name').fill('Host');
  await hostApp.locator('#msg').fill('from host');
  await hostApp.locator('form button').click();
  await sleep(200);

  // go multiplayer
  await hostRun.locator('#host').click();
  await hostRun.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value && el.value.length > 0; }, null, { timeout: 8000 });
  const shareUrl = await hostRun.locator('#share-url').inputValue();
  check('host produced a share URL with a session', /#s=.*&k=.*&relay=/.test(shareUrl));

  // ---------- CLIENT (separate context = separate machine) ----------
  const clientCtx = await browser.newContext();
  const clientRun = await clientCtx.newPage();
  clientRun.on('console', (m) => { if (m.type() === 'error') console.log('  [client]', m.text()); });
  await clientRun.goto(shareUrl);
  await clientRun.waitForSelector('iframe', { timeout: 10000 });
  const clientApp = clientRun.frameLocator('iframe');
  await clientApp.locator('#msg').waitFor({ timeout: 10000 });
  check('client received the App GIF over the relay and mounted it', true);

  // client should see the host's existing entry (state hosted remotely)
  await clientApp.locator('#list li').first().waitFor({ timeout: 8000 });
  const clientSees = await clientApp.locator('#list').textContent();
  check('client sees host\'s existing DB state', /from host/.test(clientSees));

  // client writes → should reach the host browser's DB and appear there
  await clientApp.locator('#name').fill('Client');
  await clientApp.locator('#msg').fill('from client');
  await clientApp.locator('form button').click();
  await sleep(600);
  const hostSees = await hostApp.locator('#list').textContent();
  check('client\'s write appears in the HOST browser (remote DB round-trip)', /from client/.test(hostSees));

  // host writes → should propagate to the client
  await hostApp.locator('#name').fill('Host');
  await hostApp.locator('#msg').fill('second from host');
  await hostApp.locator('form button').click();
  await sleep(600);
  const clientSees2 = await clientApp.locator('#list').textContent();
  check('host\'s write propagates live to the CLIENT', /second from host/.test(clientSees2));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
