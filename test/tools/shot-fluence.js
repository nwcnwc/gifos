// Screenshot the Fluence app after one take, for a visual check.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:8099', DG = 'http://127.0.0.1:8792', AI = 'http://127.0.0.1:8791';
const AI_CFG = JSON.stringify({ smartest: { url: AI, key: 'k', model: 'x' }, cheapest: { url: AI, key: 'k', model: 'x' }, image: { url: AI, key: 'k', model: 'x' } });
const API_CFG = JSON.stringify({ deepgram: { url: DG, authType: 'token', key: 'dg-secret-key' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const gifB64 = fs.readFileSync(__dirname + '/../../apps/fluence.gif').toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 480, height: 900 } });
  await context.addInitScript((c) => { localStorage.setItem('gifos_ai_config', c.ai); localStorage.setItem('gifos_api_config', c.api); }, { ai: AI_CFG, api: API_CFG });
  const page = await context.newPage();
  await page.goto(BASE + '/index.html'); await page.waitForSelector('.icon'); await sleep(400);
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Fluence.gif', bytes, kind: 'gif', isApp: true, appId: 'fluence', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Fluence.gif', parent: null, x: 60, y: 60, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);
  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Fluence.gif' }).dblclick()]);
  await app.waitForSelector('iframe');
  await app.locator('.perm-modal .done').click({ timeout: 5000 }).catch(() => {});
  const fr = app.frameLocator('iframe');
  await fr.locator('#rec').click();
  await app.waitForSelector('[data-gifos-capture]', { timeout: 6000 }).catch(() => {});
  await sleep(500);
  await app.evaluate(() => { const ov = document.querySelector('[data-gifos-capture]'); (ov.querySelector('button') || ov).click(); });
  await fr.locator('.nums').waitFor({ timeout: 12000 });
  await sleep(600);
  await app.screenshot({ path: __dirname + '/../../apps/fluence/screenshot.png', fullPage: true });
  console.log('shot saved');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
