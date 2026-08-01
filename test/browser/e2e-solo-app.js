// ONE RUNTIME step 1 (docs/one-runtime.md): the solo app entry.
//
// meet.html#id=<fileId> is an app from MY desktop running on MY device —
// stage 1 of the app lifecycle. The contract: NO network object exists and no
// consent surface appears. No relay socket, no mesh, no getUserMedia ask, no
// lobby, no meeting chrome — the room is minted later, by Invite, or never.
//
// Needs BASE only (no relay — that's the point).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext(); // deliberately NO camera/mic permission — solo must never ask
  await ctx.addInitScript(() => {
    window.__gumCount = 0;
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const real = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => { window.__gumCount++; return real(c); };
    }
    window.__wsCount = 0;
    const RealWS = window.WebSocket;
    window.WebSocket = function (u, p) { window.__wsCount++; return p ? new RealWS(u, p) : new RealWS(u); };
    window.WebSocket.prototype = RealWS.prototype;
  });

  // seed a desktop and pick a runnable default app
  const d = await ctx.newPage();
  d.on('pageerror', (e) => console.log('  [desk] ' + e.message));
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 30000 });
  const appId = await d.evaluate(async () => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && !/^(meet|video)$/.test(x.appId));
    return f ? f.id : null;
  });
  check('seeded desktop exposes a runnable app fileId', !!appId);
  if (!appId) { await browser.close(); process.exit(1); }
  await d.close();

  // the solo entry
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [solo] ' + e.message));
  await p.goto(BASE + '/meet.html#id=' + appId);
  await p.waitForSelector('#appmount iframe', { timeout: 30000 });
  check('the app boots and mounts from the desktop store', true);
  check('solo layout: meeting chrome hidden (body.solo-app)', await p.evaluate(() => document.body.classList.contains('solo-app')));
  check('no lobby shown', await p.evaluate(() => { const l = document.getElementById('lobby'); return !l || l.style.display === 'none' || !l.offsetParent; }));
  await p.waitForTimeout(2500); // anything eager (socket, gUM, mesh) would fire by now
  check('ZERO getUserMedia calls — solo never asks for camera/mic', (await p.evaluate(() => window.__gumCount)) === 0,
    (await p.evaluate(() => window.__gumCount)) + ' calls');
  check('ZERO WebSockets — no relay contact of any kind', (await p.evaluate(() => window.__wsCount)) === 0,
    (await p.evaluate(() => window.__wsCount)) + ' sockets');
  check('no room identity exists (nothing was derived or joined)', await p.evaluate(() => !window.__gifosVideo.room()));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
