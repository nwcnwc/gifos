// End-to-end: REQUIRED vs OPTIONAL capabilities.
// - An app that lists a capability in manifest.requires is BLOCKED at launch by
//   a #req-gate until the user has set it up; a re-check clears it once config
//   appears.
// - An app that declares the same capability but does NOT require it launches
//   normally (optional is the default).
//
// Needs: static server on 8099. No AI configured — that's the point.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function installApp(page, { appId, name, capabilities, requires, label, x }) {
  return page.evaluate(async (a) => {
    const manifest = { gifos: '1.0', appId: a.appId, name: a.name, entry: 'index.html', capabilities: a.capabilities };
    if (a.requires) manifest.requires = a.requires;
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify(manifest),
      'index.html': '<!doctype html><meta charset="utf-8"><h1 id="ok">app body</h1>',
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.label, bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: a.label, parent: null, x: a.x, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { appId, name, capabilities, requires, label, x });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext(); // NOTE: no gifos_ai_config seeded
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  await installApp(page, { appId: 'needai', name: 'NeedsAI', capabilities: { db: true, ai: true }, requires: ['ai'], label: 'NeedsAI.gif', x: 120 });
  await installApp(page, { appId: 'wantai', name: 'WantsAI', capabilities: { db: true, ai: true }, label: 'WantsAI.gif', x: 320 });

  // --- required app: gated ---
  const [gated] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'NeedsAI.gif' }).dblclick()]);
  gated.on('pageerror', (e) => console.log('  [gated pageerror]', e.message));
  await gated.waitForSelector('iframe', { timeout: 8000 });
  await gated.waitForSelector('#req-gate', { timeout: 6000 }).catch(() => {});
  check('a required capability blocks launch with a setup gate', (await gated.locator('#req-gate').count()) === 1);
  check('the gate names what to set up', /needs setup to run/i.test(await gated.locator('#req-gate .perm-box').textContent().catch(() => '')));

  // configure an AI model (shared localStorage), then re-check → gate clears
  await gated.evaluate(() => localStorage.setItem('gifos_ai_config', JSON.stringify({ smartest: { url: 'http://127.0.0.1:8791', key: 'k', model: 'x' } })));
  await gated.locator('#req-recheck').click();
  await gated.waitForSelector('#req-gate', { state: 'detached', timeout: 5000 }).catch(() => {});
  check('re-checking after setup clears the gate and lets the app run', (await gated.locator('#req-gate').count()) === 0);
  await gated.close();

  // --- optional app: launches straight away (clear the config again first) ---
  const ctx2 = await browser.newContext(); // fresh: no ai config
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/index.html'); await p2.waitForSelector('.icon'); await sleep(400);
  await installApp(p2, { appId: 'wantai', name: 'WantsAI', capabilities: { db: true, ai: true }, label: 'WantsAI.gif', x: 320 });
  const [optional] = await Promise.all([ctx2.waitForEvent('page'), p2.locator('.icon', { hasText: 'WantsAI.gif' }).dblclick()]);
  await optional.waitForSelector('iframe', { timeout: 8000 });
  await sleep(800);
  check('an OPTIONAL capability (default) does NOT gate — the app runs', (await optional.locator('#req-gate').count()) === 0);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
