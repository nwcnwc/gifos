// Regression: with NO Deepgram key configured, Fluence must say so up front —
// on open AND the moment you tap Record — instead of recording a whole take and
// then hanging on "Transcribing…". Exercises gifos.apiReady + the preflight.
//
// Needs: static server on 8099. (No fake providers — the point is that nothing
// is configured.)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const gifB64 = fs.readFileSync(__dirname + '/../apps/fluence.gif').toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['microphone'] });
  // NOTE: no gifos_ai_config, no gifos_api_config seeded — nothing is set up.
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Fluence.gif', bytes, kind: 'gif', isApp: true, appId: 'fluence', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Fluence.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);
  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Fluence.gif' }).dblclick()]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });
  await app.locator('.perm-modal .done').click({ timeout: 5000 }).catch(() => {});
  const fr = app.frameLocator('iframe');

  // On open, the setup card should already be visible (no take needed).
  await fr.locator('.setup').waitFor({ timeout: 8000 });
  check('missing setup is shown on open (no take required)', /Deepgram|isn’t set up/.test(await fr.locator('.setup').textContent()));

  // Tapping Record must NOT start a recording — it should re-point to setup fast.
  await fr.locator('#rec').click();
  const overlayAppeared = await app.waitForSelector('[data-gifos-capture]', { timeout: 2500 }).then(() => true).catch(() => false);
  check('tapping Record does NOT start a recording when Deepgram is missing', overlayAppeared === false);
  check('the status calls out the missing setup immediately', /set/i.test(await fr.locator('#status').textContent()));
  check('the setup card names Deepgram + where to add it', /Third-party APIs/.test(await fr.locator('.setup').textContent()));

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
