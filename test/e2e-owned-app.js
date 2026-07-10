// Owned-app link minting (browser + local relay). Default app invites are
// OWNED: sid = "<room>.<verifier>", host slot gated by a secret held only by
// the app. 'resilient' opts out into an anyone-owns, self-healing, dotless
// link. Room = app short-name for signed apps, +"-anon" for unsigned.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let fail = 0; const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fail++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const ctx = await browser.newContext(); await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "')}catch(e){}" });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('  [pg]', m.text()); });
  await page.goto(BASE + '/run.html');

  // helper: create an unsigned app named "Sync Test", host it with given opts, return session + result
  const host = await page.evaluate(async (opts) => {
    const files = { 'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'st', name: 'Sync Test', entry: 'index.html' }), 'index.html': '<h1>x</h1>' };
    const bytes = await GifOS.gif.encode(files, {});
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'Sync Test.gif', bytes, kind: 'gif', isApp: true, appId: 'st', mime: 'image/gif' });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const ctl = await GifOS.runtime.boot(mount, fileId, null);
    const r = await ctl.becomeHost(opts);
    const sess = await GifOS.store.getState(fileId + '::session');
    return { shareUrl: r.shareUrl, owned: r.owned, heal: r.heal, sid: sess.sid, token: sess.token, av: sess.av || null, hasSecret: !!sess.sec };
  }, { lifetime: 'forever' });

  check('default forever link is OWNED (owned:true)', host.owned === true);
  check('owned sid is "<room>.<verifier>" (has a dot)', typeof host.sid === 'string' && host.sid.indexOf('.') > 0);
  check('unsigned app → room ends with "-anon"', /^sync-test-anon\./.test(host.sid));
  check('verifier is the join token (public), sid = room + . + av', host.token === host.av && host.sid === ('sync-test-anon.' + host.av));
  check('host holds a secret (never in the link)', host.hasSecret === true);
  check('pretty link is /join/<room>/<verifier>', /\/join\/sync-test-anon\/[a-f0-9]{24}$/.test(host.shareUrl) || /run\.html#s=/.test(host.shareUrl));
  check('the secret does NOT appear in the share link', host.shareUrl.indexOf('sec') === -1);

  // resilient → anyone-owns self-healing → dotless sid
  const heal = await page.evaluate(async (opts) => {
    const files = { 'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'st2', name: 'Party', entry: 'index.html' }), 'index.html': '<h1>x</h1>' };
    const bytes = await GifOS.gif.encode(files, {});
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'Party.gif', bytes, kind: 'gif', isApp: true, appId: 'st2', mime: 'image/gif' });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const ctl = await GifOS.runtime.boot(mount, fileId, null);
    const r = await ctl.becomeHost({ lifetime: 'forever', resilient: true });
    const sess = await GifOS.store.getState(fileId + '::session');
    return { owned: r.owned, heal: r.heal, sid: sess.sid, hasSecret: !!sess.sec };
  }, {});
  check('resilient link is anyone-owns (owned:false, heal:true)', heal.owned === false && heal.heal === true);
  check('resilient sid is dotless (self-healing, no secret gate)', heal.sid.indexOf('.') === -1 && !heal.hasSecret);

  await browser.close();
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
