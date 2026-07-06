// Self-healing e2e: the host dies and the session heals ITSELF — no clicks.
// HOST + two mirrored CLIENTS on one relay. The host tab is killed; after
// AUTO_TAKEOVER the clients elect the freshest copy, one auto-promotes on the
// SAME session (epoch+1), the other keeps playing, a brand-new joiner walks in
// on the original share URL, and the ORIGINAL host reopening its icon is
// bounced (host-stale) into guest mode instead of clobbering the newer state.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shrink the healing clock so the test doesn't wait out real-world timers.
const FAST = 'window.GIFOS_CONN={AUTO_TAKEOVER:8000,CAND_LEAD:4000,RANK_STEP:2500,TAKEOVER_HINT:2000};';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const setup = (name) => ({ content: FAST + "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });

  // ---------- HOST hosts a Guestbook ----------
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
  await hostRun.waitForSelector('iframe');
  const hostApp = hostRun.frameLocator('iframe');
  await hostApp.locator('#msg').waitFor({ timeout: 8000 });
  await hostApp.locator('#msg').fill('original entry');
  await hostApp.locator('form button').click();
  await sleep(200);
  await hostRun.locator('#host').click();
  await hostRun.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value.length > 0; }, null, { timeout: 8000 });
  const shareUrl = await hostRun.locator('#share-url').inputValue();

  // ---------- two clients join and mirror ----------
  async function join(name) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(setup(name));
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.log('  [' + name + ']', m.text()); });
    await page.goto(shareUrl);
    await page.waitForSelector('iframe', { timeout: 10000 });
    const app = page.frameLocator('iframe');
    await app.locator('#msg').waitFor({ timeout: 10000 });
    return { ctx, page, app };
  }
  const A = await join('Ada');
  const B = await join('Bob');
  await A.app.locator('#msg').fill('ada was here');
  await A.app.locator('form button').click();
  await sleep(6500); // mirrors are rate-limited to one dump per 5s — let both capture

  // ---------- the host simply dies ----------
  await hostRun.close();

  // one of A/B must self-promote (rank 0 at ~8s, backup at ~10.5s)
  let healer = null, other = null;
  for (let i = 0; i < 40 && !healer; i++) {
    await sleep(500);
    for (const c of [A, B]) {
      if ((await c.page.evaluate(() => window.__gifosTransport)) === 'host') { healer = c; other = c === A ? B : A; }
    }
  }
  check('a client auto-promoted itself to host (no clicks)', !!healer);
  if (!healer) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
  check('exactly one client claimed the host slot',
    (await other.page.evaluate(() => window.__gifosTransport)) !== 'host');

  // ---------- the session just keeps working ----------
  await other.app.locator('#msg').fill('after the heal');
  await other.app.locator('form button').click();
  await sleep(800);
  const healerSees = await healer.app.locator('#list').textContent();
  check('the other client\'s write lands in the auto-promoted host', /after the heal/.test(healerSees));
  check('pre-death state survived the heal', /original entry/.test(healerSees) && /ada was here/.test(healerSees));
  if (!/original entry/.test(healerSees) || !/ada was here/.test(healerSees)) console.log('  [healer sees]', healerSees);

  // ---------- the ORIGINAL share URL still admits new people ----------
  const C = await join('Cyn');
  await C.app.locator('#list li').first().waitFor({ timeout: 8000 });
  const cSees = await C.app.locator('#list').textContent();
  check('a brand-new joiner enters via the original share URL', /after the heal/.test(cSees));

  // ---------- the original host comes back — and must NOT clobber ----------
  const [hostRun2] = await Promise.all([
    hostCtx.waitForEvent('page'),
    hostDesk.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick(),
  ]);
  await hostRun2.waitForSelector('iframe');
  await hostRun2.frameLocator('iframe').locator('#msg').waitFor({ timeout: 8000 });
  await hostRun2.locator('#host').click(); // tries to resume hosting with its stale epoch
  await hostRun2.waitForURL(/[#&?](j|s)=/, { timeout: 10000 }); // bounced into guest mode
  check('stale returning host is redirected into guest mode', true);
  await hostRun2.waitForSelector('iframe', { timeout: 10000 });
  const back = hostRun2.frameLocator('iframe');
  await back.locator('#list li').first().waitFor({ timeout: 10000 });
  await sleep(2500); // let the first getAll land
  const backSees = await back.locator('#list').textContent();
  check('returning host sees the post-heal state as a guest (nothing clobbered)', /after the heal/.test(backSees));
  if (!/after the heal/.test(backSees)) {
    console.log('  [returning host sees]', backSees);
    console.log('  [returning host url]', hostRun2.url());
    console.log('  [returning host transport]', await hostRun2.evaluate(() => window.__gifosTransport));
    console.log('  [healer stats]', JSON.stringify(await healer.page.evaluate(() => window.__gifosHostStats)));
    console.log('  [healer sees now]', await healer.app.locator('#list').textContent());
  }

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
