// End-to-end for the Fluence certified app (apps/fluence.gif): mount the built
// GIF on a real GifOS desktop and drive the whole pipeline —
//   gifos.recordAudio → gifos.api('deepgram') → FL.extractFeatures →
//   gifos.ai.chat → gifos.db history.
// A fake Deepgram (returns nova-3-shaped JSON with words+confidence+fillers)
// and a fake OpenAI-shaped coach stand in for the real providers.
//
// Needs: static server on 8099, fake-keyapi.js on 8792 (Deepgram),
//        fake-ai.js on 8791 (coach). The GIF is loaded from disk.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const DG = 'http://127.0.0.1:8792';
const AI = 'http://127.0.0.1:8791';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AI_CFG = JSON.stringify({ smartest: { url: AI, key: 'k', model: 'x' }, cheapest: { url: AI, key: 'k', model: 'x' } });
const API_CFG = JSON.stringify({ deepgram: { url: DG, authType: 'token', key: 'dg-secret-key' } });

(async () => {
  const gifBytes = fs.readFileSync(__dirname + '/../apps/fluence.gif');
  const gifB64 = gifBytes.toString('base64');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ permissions: ['microphone'] });
  await context.addInitScript((cfgs) => {
    try { window.localStorage.setItem('gifos_ai_config', cfgs.ai); window.localStorage.setItem('gifos_api_config', cfgs.api); } catch (e) {}
  }, { ai: AI_CFG, api: API_CFG });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  // Install the built Fluence GIF exactly as a downloaded app would land.
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Fluence.gif', bytes, kind: 'gif', isApp: true, appId: 'fluence', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Fluence.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);

  check('the built GIF is a valid GifOS app', await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return GifOS.gif.looksLikeGifosGif(bytes);
  }, gifB64));

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Fluence.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });
  // Dismiss the launch capability-acknowledgement modal (mic + ai + deepgram).
  await app.locator('.perm-modal .done').click({ timeout: 5000 }).catch(() => {});
  const fr = app.frameLocator('iframe');

  // The app booted and shows a prompt + the record button.
  await fr.locator('#prompt').filter({ hasText: /\w+/ }).waitFor({ timeout: 8000 });
  check('Fluence boots and shows a speaking prompt', /\w/.test(await fr.locator('#prompt').textContent()));
  check('the deterministic feature core loaded (FL.extractFeatures)', await fr.locator('body').evaluate(() => typeof FL !== 'undefined' && typeof FL.extractFeatures === 'function'));

  // Drive a full take. recordAudio uses the fake mic; the runtime's capture
  // overlay lets us stop it deterministically.
  await fr.locator('#rec').click();
  await app.waitForSelector('[data-gifos-capture]', { timeout: 6000 }).catch(() => {});
  await sleep(600);
  // Stop the recording via the runtime overlay's stop control.
  const stopped = await app.evaluate(() => {
    const ov = document.querySelector('[data-gifos-capture]');
    if (!ov) return false;
    const btn = ov.querySelector('button') || ov;
    btn.click(); return true;
  });
  check('the runtime capture overlay appeared and was stopped', stopped);

  // After stop: transcribe (fake DG) → features → coach (fake AI) → render.
  await fr.locator('.nums').waitFor({ timeout: 12000 });
  const wpm = await fr.locator('.num .num-v').first().textContent();
  check('a take produced headline metrics (words/min computed from Deepgram words)', /^\d/.test((wpm || '').trim()), wpm);
  await fr.locator('.overall p').waitFor({ timeout: 4000 }).catch(() => {});
  check('the coach rendered an overall verdict', /\w/.test(await fr.locator('.overall p').textContent().catch(() => '')));

  // History persisted to gifos.db.
  await fr.locator('.take').first().waitFor({ timeout: 6000 });
  check('the take was saved to history (gifos.db)', (await fr.locator('.take').count()) >= 1);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
