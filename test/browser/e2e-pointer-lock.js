/*
 * capabilities.pointer — the sandbox token a first-person app cannot aim without.
 *
 * Pointer lock is a SANDBOX flag, not a permissions-policy feature, so it does
 * NOT ride in the iframe's `allow` attribute the way motion and WebGPU do. A
 * sandboxed app frame is refused outright — "Blocked pointer lock on an element
 * because the element's frame is sandboxed and the 'allow-pointer-lock'
 * permission is not set" — and that SecurityError lands INSIDE the sandbox,
 * where the player never sees it. The app mounts, renders, and silently cannot
 * look around. That is the failure this guards: not a crash, a game that starts.
 *
 * Three assertions, in the order they matter:
 *   1. An app that did NOT declare it is refused        (the sandbox still holds)
 *   2. An app that DID declare it locks the pointer     (the capability works)
 *   3. Unchecking it in the Abilities sheet refuses it  (the promise is real)
 *
 * (3) is not decoration. The sheet tells the user "Uncheck to turn this off for
 * this app", and unlike a brokered call — which re-reads the veto every time —
 * the sandbox is fixed at NAVIGATION. If the veto were only consulted where the
 * brokers consult it, the checkbox would move and change nothing until the app
 * was remounted, which is the kind of lie a permission surface must never tell.
 *
 * Needs BASE only. No relay, no network: the app under test is three lines of
 * HTML and reaches nothing.
 */
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

// The smallest thing that wants the pointer: click the canvas, try to lock it,
// record what happened where the test can read it.
const APP_HTML = '<!doctype html><meta charset="utf-8">' +
  '<style>html,body{margin:0;height:100%}#c{display:block;width:100vw;height:100vh;background:#222}</style>' +
  '<canvas id="c"></canvas><script>' +
  'window.__r = "no-click-seen";' +
  'document.getElementById("c").addEventListener("click", async function () {' +
  '  window.__r = "clicked-but-nothing-happened";' +
  '  try { var q = document.getElementById("c").requestPointerLock(); if (q && q.then) await q; }' +
  '  catch (e) { window.__r = "DENIED:" + e.name + ":" + e.message; return; }' +
  '  window.__r = document.pointerLockElement ? "LOCKED" : "DENIED:silent:no pointerLockElement";' +
  '});</scr' + 'ipt>';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();

  const seed = (page, appId, name, caps) => page.evaluate(async (a) => {
    const manifest = { gifos: '1.0', appId: a.appId, name: a.name, entry: 'index.html' };
    if (a.caps) manifest.capabilities = a.caps;
    const files = { 'manifest.json': JSON.stringify(manifest), 'index.html': a.html };
    const bytes = await GifOS.gif.encode(files, {});
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: a.name + '.gif', bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    return fileId;
  }, { appId, name, caps, html: APP_HTML });

  // Mount the app, settle the Abilities sheet if one is shown, then click the
  // canvas — a REAL gesture, because pointer lock requires one and a synthetic
  // dispatch would prove nothing about the sandbox.
  const run = async (fileId) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [page] ' + e.message));
    await p.goto(BASE + '/run.html#id=' + fileId);
    await p.waitForSelector('#appmount iframe', { timeout: 30000 });
    // A declared capability opens the sheet on first run. It covers the app, so
    // the click below would land on the backdrop rather than on the canvas.
    const sheet = await p.$('.perm-modal .done');
    if (sheet) { await sheet.click(); await p.waitForTimeout(150); }
    const handle = await p.$('#appmount iframe');
    const sandbox = await handle.getAttribute('sandbox');
    const frame = await handle.contentFrame();
    await frame.waitForSelector('#c', { timeout: 15000 });
    await frame.click('#c');
    await p.waitForTimeout(600);
    const result = await frame.evaluate(() => window.__r);
    await p.close();
    return { sandbox: sandbox || '', result };
  };

  const boot = await ctx.newPage();
  await boot.goto(BASE + '/run.html'); // load the runtime once, to seed through it
  await boot.waitForFunction(() => window.GifOS && GifOS.store && GifOS.gif, null, { timeout: 30000 });
  const plainId = await seed(boot, 'plainfps', 'Plain', null);
  const lockId = await seed(boot, 'lockfps', 'Locker', { pointer: true });
  await boot.close();

  // ---- 1. undeclared: the sandbox still refuses ------------------------------
  const plain = await run(plainId);
  check('an app that did NOT declare pointer gets NO allow-pointer-lock token',
    !/allow-pointer-lock/.test(plain.sandbox), plain.sandbox);
  check('...and its requestPointerLock is refused by the sandbox',
    /^DENIED:SecurityError/.test(plain.result), plain.result);

  // ---- 2. declared: it works ------------------------------------------------
  const locked = await run(lockId);
  check('capabilities.pointer puts allow-pointer-lock on the app frame',
    /(^|\s)allow-pointer-lock(\s|$)/.test(locked.sandbox), locked.sandbox);
  check('...and the app can lock the pointer', locked.result === 'LOCKED', locked.result);
  check('the token is the ONLY thing that changed — sandbox is otherwise untouched',
    locked.sandbox.replace(/\s*allow-pointer-lock\s*/, ' ').trim() === plain.sandbox.trim(),
    locked.sandbox + '  vs  ' + plain.sandbox);

  // ---- 3. the user's veto is honoured, not merely offered --------------------
  const veto = await ctx.newPage();
  await veto.goto(BASE + '/run.html');
  await veto.evaluate(() => localStorage.setItem('gifos_capoff_lockfps', JSON.stringify(['pointer'])));
  await veto.close();
  const vetoed = await run(lockId);
  check('unchecking it in the Abilities sheet REMOVES the token',
    !/allow-pointer-lock/.test(vetoed.sandbox), vetoed.sandbox);
  check('...and the app is refused again, exactly as if it had never asked',
    /^DENIED:SecurityError/.test(vetoed.result), vetoed.result);

  await browser.close();
  console.log(fail ? '\nFAILURES: ' + fail : '\nall green');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
