// Regression: with NO Deepgram key configured, the GIFOS SYSTEM (not the app)
// shows the "isn't set up" prompt when Fluence tries to use Deepgram — and the
// app never records a whole take first. The app only contributes a hint.
//
// Needs: static server on 8099. No providers configured — that's the point.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const gifB64 = fs.readFileSync(__dirname + '/../../apps/fluence.gif').toString('base64');
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
  // Dismiss the capability acknowledgement (Fluence requires nothing — optional).
  await app.locator('.perm-modal .done').click({ timeout: 5000 }).catch(() => {});
  const fr = app.frameLocator('iframe');

  // Fluence is OPTIONAL — it opens and lets you look around, no blocking gate.
  await fr.locator('.prompt').waitFor({ timeout: 6000 });
  check('the app opens and is explorable even with nothing set up', (await app.locator('#gifos-setup-modal').count()) === 0);
  check('a gentle status nudges toward Settings', /Settings/i.test(await fr.locator('#status').textContent().catch(() => '')));

  // Tap Record → the SYSTEM (not the app) shows the Deepgram setup prompt, and
  // NO recording starts.
  await fr.locator('#rec').click();
  await app.waitForSelector('#gifos-setup-modal', { timeout: 6000 }).catch(() => {});
  check('the GifOS system shows its own setup prompt (not the app)', (await app.locator('#gifos-setup-modal').count()) === 1);
  const modalText = await app.locator('#gifos-setup-modal').textContent().catch(() => '');
  check('the system prompt names Deepgram + the base URL (system-owned copy)', /Deepgram/.test(modalText) && /api\.deepgram\.com/.test(modalText), modalText.slice(0, 120));
  check('the app contributed its own hint (free credit)', /free credit/i.test(modalText));
  const overlayAppeared = await app.waitForSelector('[data-gifos-capture]', { timeout: 2000 }).then(() => true).catch(() => false);
  check('no recording started (fail-fast before a wasted take)', overlayAppeared === false);
  // The prompt is dismissable.
  await app.locator('#gifos-setup-ok').click();
  check('the system prompt can be dismissed', (await app.locator('#gifos-setup-modal').count()) === 0);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
