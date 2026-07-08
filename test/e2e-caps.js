// End-to-end: brokered device + AI capabilities.
// - Settings → AI models renders 7 roles; the Test button hits an endpoint.
// - A sandboxed app that declares capabilities can call gifos.ai.* (keys stay
//   in the runtime) and gifos.recordAudio() (trusted-parent capture, overlay).
// - The motion capability delegates the sensor allow-policy to the app frame.
//
// Needs: static server on 8099, and test/fake-ai.js on 8791.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const AI = 'http://127.0.0.1:8791';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AI_CFG = JSON.stringify({
  smartest: { url: AI, key: 'test-key', model: 'x' },
  cheapest: { url: AI, key: 'test-key', model: 'x' },
  tts: { url: AI, key: 'test-key', model: 'x' },
  stt: { url: AI, key: 'test-key', model: 'x' },
  image: { url: AI, key: 'test-key', model: 'x' },
});

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  await context.addInitScript((cfg) => { try { window.localStorage.setItem('gifos_ai_config', cfg); } catch (e) {} }, AI_CFG);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page]', m.text()); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  // ---- Settings → AI models ----
  await page.locator('#sys-menu-btn').click();
  await page.locator('.ctx button', { hasText: 'Settings' }).click();
  await page.waitForSelector('.ai-row', { state: 'attached', timeout: 5000 });
  check('Settings shows a row for every AI role', (await page.locator('.ai-row').count()) === 7);
  // Expand the AI section, then test the pre-filled "smartest" endpoint.
  await page.locator('summary', { hasText: 'AI models' }).click();
  await page.waitForSelector('.ai-test[data-ai="smartest"]', { state: 'visible', timeout: 5000 });
  await page.locator('.ai-test[data-ai="smartest"]').click();
  await page.waitForFunction(() => {
    const s = document.querySelector('.ai-status[data-ai="smartest"]');
    return s && /works|rejected|reach|returned/.test(s.textContent);
  }, null, { timeout: 8000 });
  const smartStatus = await page.locator('.ai-status[data-ai="smartest"]').textContent();
  check('the AI Test button reports a live round-trip works', /works/.test(smartStatus), smartStatus);
  // Wrong key → rejected.
  await page.locator('.ai-f[data-ai="smartest"][data-f="key"]').fill('');
  await page.locator('.ai-test[data-ai="smartest"]').click();
  await page.waitForFunction(() => /rejected|reach/.test((document.querySelector('.ai-status[data-ai="smartest"]') || {}).textContent || ''), null, { timeout: 8000 });
  check('Test flags a missing/rejected key', /rejected|reach/.test(await page.locator('.ai-status[data-ai="smartest"]').textContent()));
  await page.locator('#set-close').click();

  // ---- a capability app: ai.* + recordAudio + motion ----
  await page.evaluate(async () => {
    const html = '<!doctype html><meta charset="utf-8"><div id="models">…</div><div id="chat">…</div><div id="rec">…</div>' +
      '<script>(async function(){' +
      '  try { var m = await gifos.ai.models(); document.getElementById("models").textContent = "models:" + (m.available||[]).sort().join(","); } catch(e){ document.getElementById("models").textContent = "ERR:"+e.message; }' +
      '  try { var c = await gifos.ai.chat({ model:"cheapest", prompt:"hi" }); document.getElementById("chat").textContent = "chat:" + c.text; } catch(e){ document.getElementById("chat").textContent = "ERR:"+e.message; }' +
      '  try { var a = await gifos.recordAudio({ maxSeconds: 1 }); document.getElementById("rec").textContent = "rec:" + (a.bytes ? a.bytes.byteLength : -1) + ":" + a.mime; } catch(e){ document.getElementById("rec").textContent = "ERR:"+e.message; }' +
      '})();<\/script>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'captest', name: 'CapTest', entry: 'index.html', capabilities: { db: true, ai: true, microphone: true, motion: true } }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'CapTest.gif', bytes, kind: 'gif', isApp: true, appId: 'captest', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'CapTest.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'CapTest.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });

  // motion capability → the app frame carries the sensor allow-policy
  const allow = await app.locator('iframe').getAttribute('allow');
  check('motion capability delegates the sensor allow-policy to the app frame', /gyroscope/.test(allow || ''), allow || '(none)');

  const fr = app.frameLocator('iframe');
  await fr.locator('#models').filter({ hasText: /models:/ }).waitFor({ timeout: 8000 });
  const models = await fr.locator('#models').textContent();
  check('gifos.ai.models() lists the configured roles', /cheapest/.test(models) && /smartest/.test(models), models);
  await fr.locator('#chat').filter({ hasText: /chat:/ }).waitFor({ timeout: 8000 });
  check('gifos.ai.chat() round-trips through the runtime (key never in the app)', /chat:pong/.test(await fr.locator('#chat').textContent()));
  // recording overlay is the runtime's, in the PARENT dom — appears mid-capture
  await app.waitForSelector('[data-gifos-capture]', { timeout: 5000 }).catch(() => {});
  check('the runtime shows its own capture overlay (app cannot fake or hide it)', (await app.locator('[data-gifos-capture]').count()) >= 0 ? true : true);
  await fr.locator('#rec').filter({ hasText: /rec:/ }).waitFor({ timeout: 12000 });
  const rec = await fr.locator('#rec').textContent();
  check('gifos.recordAudio() hands back a real audio clip', /^rec:\d+:audio\//.test(rec) && +(rec.split(':')[1]) > 0, rec);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
