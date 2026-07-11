// End-to-end: the in-app agent capability (capabilities.agent).
// - Declaring `agent` injects a GifOS agent bar into the app's sandboxed iframe.
// - The bar drives the app's DOM (click/type) via the user's Smartest model,
//   BROKERED by the runtime — the app declares no `ai`, yet the agent works,
//   proving the key never enters the sandbox.
// - An app that does NOT declare `agent` gets no bar.
//
// Needs: static server on 8099 and fake-ai.js on 8791 (Smartest model).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const AI = 'http://127.0.0.1:8791';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Only a Smartest model is configured — the app itself declares no `ai`.
const AI_CFG = JSON.stringify({ smartest: { url: AI, key: 'k', model: 'x' } });

async function install(page, { appId, name, caps, label, x }) {
  await page.evaluate(async (a) => {
    const html = '<!doctype html><meta charset="utf-8">' +
      '<button id="go">Do the thing</button><div id="out">idle</div>' +
      '<script>document.getElementById("go").onclick=function(){document.getElementById("out").textContent="DONE-CLICKED";};<\/script>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: a.appId, name: a.name, entry: 'index.html', capabilities: a.caps }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.label, bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: a.label, parent: null, x: a.x, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { appId, name, caps, label, x });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  await context.addInitScript((cfg) => { try { localStorage.setItem('gifos_ai_config', cfg); } catch (e) {} }, AI_CFG);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  await install(page, { appId: 'agentapp', name: 'AgentApp', caps: { db: true, agent: true }, label: 'AgentApp.gif', x: 120 });
  await install(page, { appId: 'plainapp', name: 'PlainApp', caps: { db: true }, label: 'PlainApp.gif', x: 320 });

  // --- agent app: bar injected, drives the DOM via the brokered model ---
  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'AgentApp.gif' }).dblclick()]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });
  check('the acknowledgement lists the agent ability', /operate this app/i.test(await app.locator('.perm-box', { hasText: 'would like to' }).textContent().catch(() => '')));
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click().catch(() => app.locator('.perm-modal .done').click().catch(() => {}));
  const fr = app.frameLocator('iframe');
  await fr.locator('input[placeholder*="agent"]').waitFor({ timeout: 6000 });
  check('the agent bar is injected into the app iframe', (await fr.locator('input[placeholder*="agent"]').count()) === 1);
  check('the app content is intact alongside the bar', (await fr.locator('#out').textContent()) === 'idle');

  // Drive it: type a task and Run → fake model returns click(0) then done.
  await fr.locator('input[placeholder*="agent"]').fill('press the button');
  await fr.locator('button', { hasText: 'Run' }).click();
  await fr.locator('#out').filter({ hasText: 'DONE-CLICKED' }).waitFor({ timeout: 8000 });
  check('the agent clicked the app control (via the brokered Smartest model)', (await fr.locator('#out').textContent()) === 'DONE-CLICKED');

  await app.close();

  // --- plain app: no agent bar ---
  const [plain] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'PlainApp.gif' }).dblclick()]);
  await plain.waitForSelector('iframe', { timeout: 8000 });
  await plain.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {});
  await sleep(500);
  check('an app WITHOUT the agent capability gets no bar', (await plain.frameLocator('iframe').locator('input[placeholder*="agent"]').count()) === 0);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
