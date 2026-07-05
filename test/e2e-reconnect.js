// Connection-resilience e2e: sockets die constantly on phones (glance away →
// tab frozen → socket killed). Sessions must self-heal with NO user action and
// NO alarm: brief drops stay soft/yellow, work done while apart is replayed,
// and red is reserved for a host that is genuinely gone.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Yank the live socket out from under the runtime — what a phone does.
const dropSockets = (page) => page.evaluate(() => {
  (window.__gifosConns || []).forEach((s) => { const w = s._raw && s._raw(); if (w) w.close(); });
});

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });

  // ---------- host opens Guestbook and invites ----------
  const hostCtx = await browser.newContext();
  await hostCtx.addInitScript(setup('Host'));
  const hostDesk = await hostCtx.newPage();
  await hostDesk.goto(BASE + '/index.html');
  await hostDesk.waitForSelector('.icon');
  await hostDesk.locator('.icon', { hasText: 'Social' }).dblclick();
  await hostDesk.waitForTimeout(250);
  const [hostRun] = await Promise.all([
    hostCtx.waitForEvent('page'),
    hostDesk.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick(),
  ]);
  hostRun.on('console', (m) => { if (m.type() === 'error') console.log('  [host]', m.text()); });
  await hostRun.waitForSelector('iframe');
  await hostRun.frameLocator('iframe').locator('#msg').waitFor({ timeout: 8000 });
  await hostRun.locator('#host').click();
  await hostRun.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value.length > 0; }, null, { timeout: 8000 });
  const shareUrl = await hostRun.locator('#share-url').inputValue();

  // ---------- relay-only client joins (no WebRTC → the socket IS the session) ----------
  const cCtx = await browser.newContext();
  await cCtx.addInitScript(setup('Remy'));
  await cCtx.addInitScript({ content: "Object.defineProperty(window,'RTCPeerConnection',{value:undefined,configurable:false});" });
  const client = await cCtx.newPage();
  client.on('console', (m) => { if (m.type() === 'error') console.log('  [client]', m.text()); });
  await client.goto(shareUrl);
  await client.waitForSelector('iframe', { timeout: 10000 });
  const app = client.frameLocator('iframe');
  await app.locator('#msg').waitFor({ timeout: 10000 });
  await app.locator('#msg').fill('before drop');
  await app.locator('form button').click();
  await sleep(400);

  // ---------- the header shows a compact pill, not a sentence ----------
  const pillText = await client.locator('#conn').textContent();
  check('status is a compact pill, not a wrapping sentence', pillText.trim().length <= 16);
  check('popover with verbose status exists but is closed', !(await client.locator('#conn-pop.show').count()));

  // ---------- CLIENT socket dies → auto-reconnect, work continues ----------
  await dropSockets(client);
  await sleep(600);
  const during = await client.evaluate(() => (window.__gifosConn || {}).grade);
  check('client blip never grades red (may even be healed already)', during !== 'lost');
  await client.waitForFunction(() => (window.__gifosConn || {}).grade === 'up', null, { timeout: 15000 });
  check('client socket reconnected by itself', true);
  await app.locator('#msg').fill('after client drop');
  await app.locator('form button').click();
  await sleep(600);
  const hostList = await hostRun.frameLocator('iframe').locator('#list').textContent();
  check('writes work again after the client blip', /after client drop/.test(hostList));

  // ---------- HOST socket dies → client stays calm; queued write replays ----------
  await dropSockets(hostRun);
  await sleep(400);
  // write WHILE the host is away — it must not be lost
  await app.locator('#msg').fill('during host drop');
  await app.locator('form button').click();
  await hostRun.waitForFunction(() => (window.__gifosConn || {}).mode === 'host' && (window.__gifosConn.self === 'up'), null, { timeout: 15000 });
  check('host socket reconnected by itself', true);
  await sleep(1500); // replay + broadcast settle
  const cGrade = await client.evaluate(() => (window.__gifosConn || {}).grade);
  check('client back to green after the host returned', cGrade === 'up');
  const hostList2 = await hostRun.frameLocator('iframe').locator('#list').textContent();
  check('write made during the host blip was replayed (not lost)', /during host drop/.test(hostList2));
  const cStatus = await client.locator('#status').textContent();
  check('no red-alarm wording after a healed blip', !/gone|Disconnected/i.test(cStatus));

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
