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
  // Pick a seeded app that asks for NOTHING — and PROVE it before touching Help.
  // An app that declares a gated ability (motion, fullscreen, camera, AI, …)
  // or a network host opens the OS Abilities consent — correct product
  // behaviour, a modal over the whole app bar, not this suite's subject.
  // Two lessons paid for here: the seed order changed (Tilt, motion +
  // fullscreen, became first) and `find()` clicked Help through that modal
  // for 30s; then the manifest filter alone picked Chat, whose AI ask lands
  // ~5s AFTER mount — sometimes before the click, sometimes after — a flake
  // on two boxes. So: filter by manifest (fast), then boot each candidate and
  // watch for a .perm-modal for a few seconds; the first that stays quiet is
  // the one. The gated set mirrors gifos-perms.js CAP_LABELS; a role list
  // under capabilities.ai / .api / .pool counts, and so does a network host.
  const candidates = await d.evaluate(async (SYS) => {
    const GATED = ['microphone', 'camera', 'motion', 'ai', 'api', 'agent', 'wasm', 'gpu', 'pointer', 'fullscreen', 'pool'];
    const files = (await GifOS.store.allFiles()).filter((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
    const out = [];
    for (const f of files) {
      const rec = await GifOS.store.getFile(f.id);
      if (!rec || !rec.bytes) continue;
      let m = null;
      try { m = (await GifOS.gif.decode(rec.bytes)).manifest || {}; } catch (e) { continue; }
      const caps = m.capabilities || {};
      if (GATED.some((k) => Array.isArray(caps[k]) ? caps[k].length : caps[k])) continue;
      const net = caps.network; // runtime.js networkHosts reads manifest.capabilities.network
      if (net && (Array.isArray(net) ? net.length : net === true || Object.keys(net).length)) continue;
      out.push({ id: f.id, appId: f.appId });
      if (out.length >= 6) break;
    }
    return out;
  }, SYS);
  let appId = null;
  const asked = [];
  for (const c of candidates) {
    const t = await ctx.newPage();
    try {
      await t.goto(BASE + '/run.html#id=' + c.id);
      await t.waitForSelector('#appmount iframe', { timeout: 30000 });
      let modal = null;
      for (let i = 0; i < 6 && !modal; i++) {
        await t.waitForTimeout(1000);
        modal = await t.evaluate(() => { const m = document.querySelector('.perm-modal'); return m ? (m.innerText || '').split('\n')[0] : null; });
      }
      if (modal) { asked.push(c.appId + ': ' + modal); } else { appId = c.id; }
    } catch (e) { asked.push(c.appId + ': ' + e.message.split('\n')[0]); }
    await t.close();
    if (appId) break;
  }
  if (asked.length) console.log('  skipped (asked for something): ' + asked.join(' | '));
  check('seeded desktop exposes a runnable app that asks for nothing (proven, not inferred)', !!appId, candidates.map((c) => c.appId).join(','));
  if (!appId) { await browser.close(); process.exit(1); }
  // Pack credits.json INTO the app's bytes (what sign-apps.mjs does for every
  // listed GIF) and stamp the local install date the store leaves on the
  // record. Help must credit the sealed file, at the very bottom.
  await d.evaluate(async (id) => {
    const rec = await GifOS.store.getFile(id);
    const archive = await GifOS.gif.decode(rec.bytes);
    const files = Object.assign({}, archive.files, { 'credits.json': JSON.stringify({
      author: { name: 'Ada Author', url: 'https://example.com/ada' },
      porter: { name: 'GifOS', url: 'https://gifos.app' },
      basedOn: { name: 'The Original', url: 'https://example.com/original' },
      license: 'MIT',
    }) });
    const bytes = await GifOS.gif.repack(rec.bytes, files);
    await GifOS.store.putFile(Object.assign({}, rec, { bytes, storeMeta: { installedAt: '2026-08-24T00:00:00.000Z' } }));
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
  check('Help credits the SEALED credits.json at the VERY BOTTOM (author, porter, basedOn, install date)',
    credits.lastHeading === 'Credits' && /Ada Author/.test(credits.text) && /Brought to GifOS by/.test(credits.text)
    && /The Original/.test(credits.text) && /Sealed inside this GIF/.test(credits.text)
    && /installed on this device on 2026-08-24/.test(credits.text)
    && credits.links.indexOf('https://example.com/ada') !== -1, credits.lastHeading);
  await p.click('#apphelp-close');
  check('Got it closes Help', await p.evaluate(() => {
    const m = document.getElementById('apphelp-modal');
    return m && getComputedStyle(m).display === 'none';
  }));
  check('solo shows no Talk switch — there is no room to talk in', await p.evaluate(() => { const b = document.getElementById('appaudio'); return !b || b.style.display === 'none' || !b.offsetParent; }));
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
