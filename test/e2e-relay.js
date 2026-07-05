// Remote-relay e2e: a HOST browser and CLIENT browsers in separate contexts
// (separate IndexedDB = separate "machines"), connected via the local relay.
// Verifies: app delivery, remote DB round-trip, live broadcasts, the P2P
// DataChannel upgrade, and the automatic relay fallback when WebRTC is absent.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    // Keep host ICE candidates usable between contexts in headless (no mDNS).
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });

  // ---------- HOST ----------
  const hostCtx = await browser.newContext();
  await hostCtx.addInitScript(setup('Host'));
  const hostDesk = await hostCtx.newPage();
  hostDesk.on('console', (m) => { if (m.type() === 'error') console.log('  [host desk]', m.text()); });
  await hostDesk.goto(BASE + '/index.html');
  await hostDesk.waitForSelector('.icon');
  await hostDesk.locator('.icon', { hasText: 'Social' }).dblclick();
  await hostDesk.waitForTimeout(250);
  const [hostRun] = await Promise.all([
    hostCtx.waitForEvent('page'),
    hostDesk.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick(),
  ]);
  hostRun.on('console', (m) => { if (m.type() === 'error') console.log('  [host run]', m.text()); });
  await hostRun.waitForSelector('iframe');
  const hostApp = hostRun.frameLocator('iframe');
  await hostApp.locator('#msg').waitFor({ timeout: 8000 });

  // host signs the guestbook BEFORE anyone joins (name comes from identity)
  await hostApp.locator('#msg').fill('from host');
  await hostApp.locator('form button').click();
  await sleep(200);

  // go multiplayer
  await hostRun.locator('#host').click();
  await hostRun.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value && el.value.length > 0; }, null, { timeout: 8000 });
  const shareUrl = await hostRun.locator('#share-url').inputValue();
  check('host produced a short-code share URL', /#j=[a-z2-9]{10}&relay=/.test(shareUrl));

  // ---------- CLIENT (separate context = separate machine) ----------
  const clientCtx = await browser.newContext();
  await clientCtx.addInitScript(setup('Ada'));
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

  // ---------- P2P upgrade: DataChannel should open, relay drops to standby ----------
  let p2pUp = true;
  try {
    await clientRun.waitForFunction(() => window.__gifosTransport === 'p2p', null, { timeout: 10000 });
  } catch (e) { p2pUp = false; }
  check('client upgraded to a direct P2P DataChannel', p2pUp);
  if (p2pUp) {
    const hostStats = await hostRun.evaluate(() => window.__gifosHostStats);
    check('host reports the peer as P2P-connected', !!hostStats && hostStats.p2p >= 1);
  } else {
    check('host reports the peer as P2P-connected', false);
  }

  // client writes → host DB (now over the DataChannel when P2P is up)
  await clientApp.locator('#msg').fill('from client');
  await clientApp.locator('form button').click();
  await sleep(600);
  const hostSees = await hostApp.locator('#list').textContent();
  check('client\'s write appears in the HOST browser (remote DB round-trip)', /from client/.test(hostSees));

  // host writes → propagates to the client
  await hostApp.locator('#msg').fill('second from host');
  await hostApp.locator('form button').click();
  await sleep(600);
  const clientSees2 = await clientApp.locator('#list').textContent();
  check('host\'s write propagates live to the CLIENT', /second from host/.test(clientSees2));

  // ---------- forced fallback: a client with NO WebRTC still works via relay ----------
  const noRtcCtx = await browser.newContext();
  await noRtcCtx.addInitScript(setup('Fallback'));
  await noRtcCtx.addInitScript({ content: "Object.defineProperty(window,'RTCPeerConnection',{value:undefined,configurable:false});" });
  const noRtcRun = await noRtcCtx.newPage();
  noRtcRun.on('console', (m) => { if (m.type() === 'error') console.log('  [no-rtc client]', m.text()); });
  await noRtcRun.goto(shareUrl);
  await noRtcRun.waitForSelector('iframe', { timeout: 10000 });
  const noRtcApp = noRtcRun.frameLocator('iframe');
  await noRtcApp.locator('#msg').waitFor({ timeout: 10000 });
  await sleep(800);
  const noRtcTransport = await noRtcRun.evaluate(() => window.__gifosTransport);
  check('WebRTC-less client stays on the relay transport', noRtcTransport === 'relay');
  await noRtcApp.locator('#msg').fill('via relay only');
  await noRtcApp.locator('form button').click();
  await sleep(700);
  const hostSees2 = await hostApp.locator('#list').textContent();
  check('relay-only client\'s write still lands in the host DB', /via relay only/.test(hostSees2));
  const clientSees3 = await clientApp.locator('#list').textContent();
  check('relay-only client\'s write reaches the P2P client too', /via relay only/.test(clientSees3));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
