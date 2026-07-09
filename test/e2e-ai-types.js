// End-to-end: capabilities.ai as an ARRAY of AI types.
// - The acknowledgement lists the specific types by their Settings label.
// - Calling a DECLARED type that isn't configured pops a role-specific system
//   prompt ("Text → image isn't set up yet").
// - Calling a type the app did NOT declare is refused by the runtime.
//
// Needs: static server on 8099. No AI configured — that's the point.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext(); // no gifos_ai_config
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  // An app that declares ONLY the image type, and tries both image (declared)
  // and chat/smartest (NOT declared).
  await page.evaluate(async () => {
    const html = '<!doctype html><meta charset="utf-8"><div id="img">…</div><div id="chat">…</div>' +
      '<script>(async function(){' +
      '  try { await gifos.ai.image({ prompt:"a dot" }); document.getElementById("img").textContent="img:UNEXPECTED"; }' +
      '  catch(e){ document.getElementById("img").textContent = "img:" + (/NOT_CONFIGURED:ai:image/.test(e.message)?"needs-setup":e.message); }' +
      '  try { await gifos.ai.chat({ model:"smartest", prompt:"hi" }); document.getElementById("chat").textContent="chat:UNEXPECTED"; }' +
      '  catch(e){ document.getElementById("chat").textContent = "chat:" + (/did not declare/.test(e.message)?"blocked":e.message); }' +
      '})();<\/script>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'imgapp', name: 'ImgApp', entry: 'index.html', capabilities: { db: true, ai: ['image'] } }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'ImgApp.gif', bytes, kind: 'gif', isApp: true, appId: 'imgapp', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'ImgApp.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });

  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'ImgApp.gif' }).dblclick()]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });

  // The acknowledgement (the "…would like to…" modal) names the AI type.
  const ackBox = app.locator('.perm-box', { hasText: 'would like to' });
  await ackBox.waitFor({ timeout: 5000 }).catch(() => {});
  const ack = await ackBox.textContent().catch(() => '');
  check('the acknowledgement names the AI type (Text → image)', /Text → image/.test(ack), ack.slice(0, 90));
  await ackBox.locator('.done').click({ timeout: 5000 }).catch(() => {});

  const fr = app.frameLocator('iframe');
  await fr.locator('#img').filter({ hasText: /img:/ }).waitFor({ timeout: 8000 });
  check('a declared-but-unconfigured type rejects with NOT_CONFIGURED:ai:image', /img:needs-setup/.test(await fr.locator('#img').textContent()));
  await app.waitForSelector('#gifos-setup-modal', { timeout: 5000 }).catch(() => {});
  check('the system prompt names the specific model (Text → image)', /Text → image/.test(await app.locator('#gifos-setup-modal').textContent().catch(() => '')));

  await fr.locator('#chat').filter({ hasText: /chat:/ }).waitFor({ timeout: 8000 });
  check('a NON-declared AI type is refused by the runtime', /chat:blocked/.test(await fr.locator('#chat').textContent()));

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
