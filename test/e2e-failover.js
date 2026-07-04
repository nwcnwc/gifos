// Failover e2e: HOST + two CLIENT browsers (isolated contexts) on one relay.
// The host dies; client A becomes host on the SAME session from mirrored state;
// client B keeps playing against the new host. Also checks:
//  - client Save to Desktop captures a full copy with live state
//  - reopening the original host's icon resumes the SAME share link (lock/unlock)
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
  await hostDesk.goto(BASE + '/index.html');
  await hostDesk.waitForSelector('.icon');
  const [hostRun] = await Promise.all([
    hostCtx.waitForEvent('page'),
    hostDesk.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick(),
  ]);
  await hostRun.waitForSelector('iframe');
  const hostApp = hostRun.frameLocator('iframe');
  await hostApp.locator('#msg').waitFor({ timeout: 8000 });
  await hostApp.locator('#name').fill('Host');
  await hostApp.locator('#msg').fill('original entry');
  await hostApp.locator('form button').click();
  await sleep(200);
  await hostRun.locator('#host').click();
  await hostRun.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value.length > 0; }, null, { timeout: 8000 });
  const shareUrl = await hostRun.locator('#share-url').inputValue();

  // ---------- CLIENT A and B (separate machines) ----------
  async function join(name) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.log('  [' + name + ']', m.text()); });
    await page.goto(shareUrl);
    await page.waitForSelector('iframe', { timeout: 10000 });
    const app = page.frameLocator('iframe');
    await app.locator('#msg').waitFor({ timeout: 10000 });
    return { ctx, page, app };
  }
  const A = await join('clientA');
  const B = await join('clientB');
  await sleep(800); // let A/B mirror the host state

  // client A: Save to Desktop → full copy with live state
  await A.page.locator('#save-desktop').click();
  await sleep(500);
  const aDesk = await A.ctx.newPage();
  await aDesk.goto(BASE + '/index.html');
  await aDesk.waitForSelector('.icon', { timeout: 8000 });
  const aIcons = await aDesk.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('client A captured a full copy onto its own desktop', aIcons.includes('Guestbook.gif'));

  // ---------- kill the host browser ----------
  await hostRun.close();
  await hostDesk.close();
  await sleep(800);
  const aStatus = await A.page.locator('#status').textContent();
  check('clients see host-gone (locked out)', /offline/i.test(aStatus));
  const becomeVisible = await A.page.locator('#become-host').isVisible();
  check('client A is offered Become Host (has mirrored state)', becomeVisible);

  // ---------- client A takes over the SAME session ----------
  await A.page.locator('#become-host').click();
  await A.page.waitForFunction(() => document.getElementById('status').textContent.includes('Hosting'), null, { timeout: 10000 });
  await sleep(800); // B gets the wake-up broadcast
  const aList = await A.app.locator('#list').textContent();
  check('new host has the pre-failover state', /original entry/.test(aList));

  // ---------- client B continues against the new host ----------
  await B.app.locator('#name').fill('B');
  await B.app.locator('#msg').fill('after failover');
  await B.app.locator('form button').click();
  await sleep(800);
  const aList2 = await A.app.locator('#list').textContent();
  check('client B\'s write lands in the NEW host (session survived)', /after failover/.test(aList2));

  // ---------- lock/unlock: original host reopens its icon → SAME share link ----------
  const hostDesk2 = await hostCtx.newPage();
  await hostDesk2.goto(BASE + '/index.html');
  await hostDesk2.waitForSelector('.icon');
  const [hostRun2] = await Promise.all([
    hostCtx.waitForEvent('page'),
    hostDesk2.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick(),
  ]);
  await hostRun2.waitForSelector('iframe');
  await hostRun2.frameLocator('iframe').locator('#msg').waitFor({ timeout: 8000 });
  await hostRun2.locator('#host').click();
  await hostRun2.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value.length > 0; }, null, { timeout: 8000 });
  const shareUrl2 = await hostRun2.locator('#share-url').inputValue();
  check('reopening the icon resumes the SAME share link (lock-until-reopen)', shareUrl2 === shareUrl);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
