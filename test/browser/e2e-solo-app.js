// ONE RUNTIME step 1 (docs/one-runtime.md): the solo app entry.
//
// run.html#id=<fileId> is an app from MY desktop running on MY device —
// stage 1 of the app lifecycle. The contract: NO network object exists and no
// consent surface appears. No relay socket, no mesh, no getUserMedia ask, no
// lobby, no meeting chrome — the room is minted later, by Invite, or never.
//
// Needs BASE only (no relay — that's the point).
const { chromium, CHROME } = require('../lib/pw');
const { systemAppIds } = require('../lib/apps');

// A SYSTEM launcher navigates instead of mounting — never pick one here.
const SYS = systemAppIds();

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
  const appId = await d.evaluate(async (SYS) => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
    return f ? f.id : null;
  }, SYS);
  check('seeded desktop exposes a runnable app fileId', !!appId);
  if (!appId) { await browser.close(); process.exit(1); }
  // Stamp the App Store snapshot a store install would have left on this
  // file (store.js storeSnapshot) — Help must credit it at the very bottom.
  await d.evaluate(async (id) => {
    const rec = await GifOS.store.getFile(id);
    await GifOS.store.putFile(Object.assign({}, rec, { storeMeta: {
      name: 'Credited App', version: '9.9.9',
      author: { name: 'Ada Author', url: 'https://example.com/ada' },
      porter: { name: 'GifOS', url: 'https://gifos.app' },
      basedOn: { name: 'The Original', url: 'https://example.com/original' },
      license: 'MIT', installedAt: '2026-08-24T00:00:00.000Z',
    } }));
  }, appId);
  await d.close();

  // the solo entry
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [solo] ' + e.message));
  await p.goto(BASE + '/run.html#id=' + appId);
  await p.waitForSelector('#appmount iframe', { timeout: 30000 });
  check('the app boots and mounts from the desktop store', true);
  check('solo layout: meeting chrome hidden (body.solo-app)', await p.evaluate(() => document.body.classList.contains('solo-app')));
  check('Help sits on the app bar next to Invite/Save', await p.evaluate(() => {
    const b = document.getElementById('apphelp');
    return !!(b && b.offsetParent && /help/i.test(b.textContent));
  }));
  await p.click('#apphelp');
  const helpOpen = await p.evaluate(() => {
    const m = document.getElementById('apphelp-modal');
    const body = document.getElementById('apphelp-body');
    return {
      flex: m && getComputedStyle(m).display === 'flex',
      text: (body && body.textContent || '').trim(),
    };
  });
  check('Help opens a modal with content', !!(helpOpen.flex && helpOpen.text.length > 40), helpOpen.text.slice(0, 80));
  const credits = await p.evaluate(() => {
    const body = document.getElementById('apphelp-body');
    const h = Array.from(body.querySelectorAll('h4')).map((x) => x.textContent.trim());
    const a = Array.from(body.querySelectorAll('a')).map((x) => x.getAttribute('href'));
    return { lastHeading: h[h.length - 1], text: body.textContent, links: a };
  });
  check('Help credits the App Store listing at the VERY BOTTOM (author, porter, basedOn, install date)',
    credits.lastHeading === 'Credits' && /Ada Author/.test(credits.text) && /Brought to GifOS by/.test(credits.text)
    && /The Original/.test(credits.text) && /installed on 2026-08-24/.test(credits.text)
    && credits.links.indexOf('https://example.com/ada') !== -1, credits.lastHeading);
  await p.click('#apphelp-close');
  check('Got it closes Help', await p.evaluate(() => {
    const m = document.getElementById('apphelp-modal');
    return m && getComputedStyle(m).display === 'none';
  }));
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
