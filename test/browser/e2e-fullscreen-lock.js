/*
 * capabilities.fullscreen — the whole screen, and the way round it is drawn.
 *
 * A first-person game on a phone held upright is a game played through a
 * letterbox, so the app has to be able to do two things: take the whole screen,
 * and hold the picture landscape. Inside a sandboxed, srcdoc, opaque-origin app
 * frame those are TWO DIFFERENT MECHANISMS, and this suite exists because
 * getting one and missing the other looks exactly like getting both until a
 * phone is in your hand:
 *
 *   fullscreen         — a PERMISSIONS-POLICY feature. Its default allowlist is
 *                        'self'; this frame's origin is opaque, so it is never
 *                        'self'. It must be delegated in the iframe's `allow`
 *                        attribute. (`allowfullscreen` is the legacy spelling of
 *                        exactly that; there is NO sandbox token for it —
 *                        `allow-fullscreen` in a sandbox attribute is an invalid
 *                        flag that Chrome warns about and ignores.)
 *   orientation lock   — a SANDBOX flag. The sandbox sets a "sandboxed
 *                        orientation lock browsing context flag" unless
 *                        allow-orientation-lock is on the frame, and with it set
 *                        screen.orientation.lock() rejects with a SecurityError
 *                        — thrown INSIDE the sandbox, where the player never
 *                        sees it, exactly like pointer lock's refusal.
 *
 * One capability grants both, because orientation lock cannot be used without
 * fullscreen: the browser only honours a lock while the document is fullscreen
 * and drops it on exit. So one checkbox turns off both halves, and this suite
 * checks both halves of that checkbox.
 *
 * Assertions, in the order they matter:
 *   1. An app that did NOT declare it gets NEITHER hatch      (the sandbox holds)
 *   2. An app that DID declare it gets both, and goes fullscreen
 *   3. Unchecking it in the Abilities sheet takes both away   (the promise is real)
 *
 * (3) is the point, for the same reason it was the point for capabilities.pointer:
 * a permissions policy and a sandbox are both fixed at NAVIGATION, not re-read
 * per call the way a broker re-reads its veto. A checkbox that moves and changes
 * nothing is the one lie a permission surface must never tell.
 *
 * ON WHAT THIS CAN AND CANNOT PROVE ON A DESKTOP BOX. `screen.orientation.lock()`
 * has nothing to rotate on a headless desktop Chromium and rejects there for its
 * own reasons. So the orientation assertions are about the REFUSAL, which is
 * what the sandbox controls and what a phone would hit too: undeclared must be
 * refused with a SecurityError, declared must NOT be — whatever else the desktop
 * then says about having no screen to turn. Never assert a lock a headless box
 * cannot perform; assert that the sandbox stopped standing in the way.
 *
 * Needs BASE only. No relay, no network: the app under test is a canvas.
 */
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

// The smallest thing that wants the screen: tap it, ask for fullscreen, then ask
// for landscape, and record BOTH answers where the test can read them. Each ask
// is caught on its own — a suite that stops at the first refusal cannot tell
// "one hatch is missing" from "both are".
const APP_HTML = '<!doctype html><meta charset="utf-8">' +
  '<style>html,body{margin:0;height:100%}#c{display:block;width:100vw;height:100vh;background:#222}</style>' +
  '<canvas id="c"></canvas><script>' +
  'window.__r = { fs: "no-click-seen", or: "no-click-seen" };' +
  'document.getElementById("c").addEventListener("click", async function () {' +
  '  window.__r = { fs: "clicked-but-nothing-happened", or: "clicked-but-nothing-happened" };' +
  '  try { var q = document.documentElement.requestFullscreen(); if (q && q.then) await q;' +
  '        window.__r.fs = document.fullscreenElement ? "FULL" : "DENIED:silent:no fullscreenElement"; }' +
  '  catch (e) { window.__r.fs = "DENIED:" + e.name + ":" + e.message; }' +
  '  try { if (!(screen.orientation && screen.orientation.lock)) { window.__r.or = "NOAPI"; }' +
  '        else { await screen.orientation.lock("landscape"); window.__r.or = "LOCKED:" + screen.orientation.type; } }' +
  '  catch (e) { window.__r.or = "DENIED:" + e.name + ":" + e.message; }' +
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
  // canvas — a REAL gesture, because both fullscreen and orientation lock
  // require one and a synthetic dispatch would prove nothing about the frame.
  const run = async (fileId) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [page] ' + e.message));
    await p.goto(BASE + '/run.html#id=' + fileId);
    await p.waitForSelector('#appmount iframe', { timeout: 30000 });
    // A declared capability opens the sheet on first run. It covers the app, so
    // the click below would land on the backdrop rather than on the canvas.
    // Read the row out of it on the way past: a capability the runtime honours
    // but the sheet cannot NAME is one the user can neither see nor revoke, and
    // it would show up here as a checkbox labelled "undefined".
    const row = await p.evaluate(() => {
      const cb = document.querySelector('.perm-modal input[data-cap="fullscreen"]');
      return cb ? (cb.closest('.perm-row') || {}).textContent || '' : null;
    });
    const sheet = await p.$('.perm-modal .done');
    if (sheet) { await sheet.click(); await p.waitForTimeout(150); }
    const handle = await p.$('#appmount iframe');
    const sandbox = (await handle.getAttribute('sandbox')) || '';
    const allow = (await handle.getAttribute('allow')) || '';
    const frame = await handle.contentFrame();
    await frame.waitForSelector('#c', { timeout: 15000 });
    await frame.click('#c');
    await p.waitForTimeout(900);
    const r = await frame.evaluate(() => window.__r);
    await p.close();
    return { sandbox, allow, row, fs: r.fs, or: r.or };
  };

  const boot = await ctx.newPage();
  await boot.goto(BASE + '/run.html'); // load the runtime once, to seed through it
  await boot.waitForFunction(() => window.GifOS && GifOS.store && GifOS.gif, null, { timeout: 30000 });
  const plainId = await seed(boot, 'plainscreen', 'Plain', null);
  const bigId = await seed(boot, 'bigscreen', 'Bigscreen', { fullscreen: true });
  await boot.close();

  // ---- 1. undeclared: neither hatch is opened --------------------------------
  const plain = await run(plainId);
  check('an app that did NOT declare fullscreen gets NO fullscreen allow-policy',
    !/fullscreen/.test(plain.allow), JSON.stringify(plain.allow));
  check('...and NO allow-orientation-lock sandbox token',
    !/allow-orientation-lock/.test(plain.sandbox), plain.sandbox);
  check('...so requestFullscreen is refused by the permissions policy',
    /^DENIED:/.test(plain.fs), plain.fs);
  check('...and screen.orientation.lock is refused by the SANDBOX (SecurityError)',
    /^DENIED:SecurityError/.test(plain.or), plain.or);

  // ---- 2. declared: both hatches, and the screen is actually taken -----------
  const big = await run(bigId);
  check('capabilities.fullscreen delegates the fullscreen permissions policy',
    /(^|[\s;])fullscreen([\s;]|$)/.test(big.allow), big.allow);
  check('capabilities.fullscreen puts allow-orientation-lock on the app frame',
    /(^|\s)allow-orientation-lock(\s|$)/.test(big.sandbox), big.sandbox);
  check('...and the app goes fullscreen', big.fs === 'FULL', big.fs);
  // A headless desktop has no screen to turn, so it may still say no — but it
  // must no longer say SECURITY, because that is the sandbox refusal and the
  // sandbox has been told to allow it. This is the assertion a phone shares.
  check('...and orientation lock is no longer refused by the sandbox',
    !/^DENIED:SecurityError/.test(big.or), big.or);
  check('the orientation token is the ONLY sandbox change — nothing else relaxed',
    big.sandbox.replace(/\s*allow-orientation-lock\s*/, ' ').trim() === plain.sandbox.trim(),
    big.sandbox + '  vs  ' + plain.sandbox);
  check('...and it opened no network path — no allow-same-origin, no popups',
    !/allow-same-origin|allow-popups|allow-top-navigation/.test(big.sandbox), big.sandbox);
  // The sheet must be able to NAME it, or the user has an ability they can see
  // no trace of and cannot turn off — a silently-granted capability.
  check('the Abilities sheet offers a fullscreen checkbox, with real words on it',
    !!big.row && /Fill the whole screen/.test(big.row) && !/undefined/.test(big.row),
    JSON.stringify((big.row || '(no row)').replace(/\s+/g, ' ').slice(0, 120)));
  check('an app that did NOT declare it gets no such row', plain.row === null, String(plain.row));

  // ---- 3. the user's veto is honoured, not merely offered --------------------
  const veto = await ctx.newPage();
  await veto.goto(BASE + '/run.html');
  await veto.evaluate(() => localStorage.setItem('gifos_capoff_bigscreen', JSON.stringify(['fullscreen'])));
  await veto.close();
  const vetoed = await run(bigId);
  check('unchecking it in the Abilities sheet REMOVES the fullscreen allow-policy',
    !/fullscreen/.test(vetoed.allow), JSON.stringify(vetoed.allow));
  check('...and REMOVES the allow-orientation-lock token',
    !/allow-orientation-lock/.test(vetoed.sandbox), vetoed.sandbox);
  check('...and the app is refused fullscreen again, as if it had never asked',
    /^DENIED:/.test(vetoed.fs), vetoed.fs);
  check('...and orientation lock is a SecurityError again',
    /^DENIED:SecurityError/.test(vetoed.or), vetoed.or);

  await browser.close();
  console.log(fail ? '\nFAILURES: ' + fail : '\nall green');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
