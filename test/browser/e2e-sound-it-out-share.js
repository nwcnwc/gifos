/*
 * WHAT SOUND IT OUT SHARES WITH A GUEST — and what it must not.
 *
 * A shared app's collection visibility is a CORRECTNESS boundary, not a
 * convenience setting, and getting it wrong is silent: runtime.js treats an
 * undeclared collection as private, and a private one simply never reaches a
 * guest. unit/sound-it-out holds the manifest against the source statically.
 * This suite proves the same thing where it actually matters — over the mesh,
 * host to guest, through the app's own UI.
 *
 * THE BUG THIS WAS WRITTEN FOR. The sight-word list lived in `prefs`, declared
 * private, so it never crossed. That is not a missing nicety: isSight()
 * overrides decodable(), so the host and the guest rendered THE SAME shared
 * sentence differently — one building a word sound by sound while the other
 * showed it whole — and the per-row "N of M words recorded" counts disagreed
 * between the two screens. Measured before the fix, the guest's Sound Bank tab
 * read "none yet" while the host's read "2 words".
 *
 * The negative control is real: flipping curriculum back to private in the
 * manifest and rebuilding the GIF turns the two SIGHT assertions below red,
 * with the guest reading exactly "none yet" again.
 *
 * Needs BASE (site) + RELAY. Nothing else.
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGifIfBuilt } = require('../lib/apps');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d).slice(0, 160) + ')' : ''));
  if (!c) failures++;
};

(async () => {
  // A missing artifact must never read as a passing suite (lib/apps.js).
  const gifPath = appGifIfBuilt('sound-it-out');
  if (!gifPath) {
    console.log('FAIL — the Sound It Out App GIF is not built (node apps/sound-it-out/build.mjs)');
    process.exit(1);
  }
  const gifB64 = fs.readFileSync(gifPath).toString('base64');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns',
           '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const mkPage = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript((o) => {
      try { localStorage.setItem('gifos_relay', o.r); localStorage.setItem('gifos_name', o.n); } catch (e) {}
    }, { r: RELAY, n: name });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [' + name + ' pageerror] ' + e.message));
    return p;
  };
  // The abilities acknowledgement ("Sound It Out would like to…") lands on top
  // of the mounted app and swallows every click until it is confirmed. It is
  // the app's own microphone declaration — expected, not a fault.
  const okPerms = async (page) => {
    for (let i = 0; i < 40; i++) {
      const hit = await page.evaluate(() => {
        const zap = (d) => { const b = d.querySelector('.perm-modal .done'); if (b) { b.click(); return true; } return false; };
        if (zap(document)) return true;
        for (const f of document.querySelectorAll('iframe')) {
          try { if (f.contentDocument && zap(f.contentDocument)) return true; } catch (e) { /* cross-origin */ }
        }
        return false;
      }).catch(() => false);
      if (hit) return true;
      await sleep(500);
    }
    return false;
  };

  try {
    // ---- host: seed the app, run it solo, then share it live (resilient) ----
    const host = await mkPage('Host');
    await host.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(() => window.GifOS && GifOS.store, null, { timeout: 30000 });
    const fid = await host.evaluate(async (b64) => {
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const id = GifOS.store.uid('file');
      await GifOS.store.putFile({ id, name: 'Sound It Out.gif', bytes, kind: 'gif', isApp: true, appId: 'sound-it-out', mime: 'image/gif' });
      return id;
    }, gifB64);

    await host.goto(BASE + '/run.html#id=' + fid, { waitUntil: 'domcontentloaded' });
    await host.waitForSelector('#appmount iframe', { timeout: 90000 });
    await okPerms(host);
    check('host: the app runs solo', true);

    await host.click('#appinvite');
    await host.waitForSelector('#inv-go', { timeout: 20000 });
    // "Let a friend keep it going" — the self-healing class, whose link is the
    // single-segment /join/<code> people actually share.
    await host.evaluate(() => { document.querySelector('input[name="rmcls"][value="heal"]').checked = true; });
    await host.click('#inv-go');
    await host.waitForFunction(() => {
      const v = document.getElementById('share-url').value; return v && /#j=|\/join\//.test(v);
    }, null, { timeout: 90000 });
    const link = await host.evaluate(() => document.getElementById('share-url').value);
    const code = (link.match(/(?:#j=|\/join\/)([a-z0-9]+)/) || [])[1];
    check('host: a self-healing share link is minted', !!code, link);

    // showInviteModal() runs only AFTER runApp() re-boots the app as the room's
    // host — seconds later for a 3.9MB GIF. Wait for it rather than racing it.
    await host.waitForFunction(() => {
      const m = document.getElementById('inv-modal');
      return m && getComputedStyle(m).display !== 'none';
    }, null, { timeout: 120000 });
    await host.evaluate(() => document.getElementById('inv-done').click());
    await okPerms(host);

    // ---- host sets the curriculum, through the real UI ----------------------
    const hf = host.frameLocator('#appmount iframe');
    await hf.locator('.tab[data-screen="setup"]').click();
    await hf.locator('#sight-input').fill('Chase\nMarshall');
    await hf.locator('#sight-save').click();
    await sleep(1500);
    const hCount = await hf.locator('#count-sight').textContent();
    check('host: the sight-word list saves', /2 words/.test(hCount), hCount);

    // ---- guest joins the link ----------------------------------------------
    const guest = await mkPage('Guest');
    await guest.goto(BASE + '/run.html#j=' + code, { waitUntil: 'domcontentloaded' });
    await guest.waitForSelector('#appmount iframe', { timeout: 120000 });
    await okPerms(guest);
    check('guest: the app mounts from the mesh', true);
    await sleep(4000);

    const gf = guest.frameLocator('#appmount iframe');
    await gf.locator('.tab[data-screen="setup"]').click();
    await sleep(1200);
    const gCount = await gf.locator('#count-sight').textContent();
    const gBox = await gf.locator('#sight-input').inputValue();
    // THE REGRESSION. Private, this read "none yet" while the host read "2 words".
    check('SIGHT WORDS REACH THE GUEST — the list is curriculum, not a preference',
      /2 words/.test(gCount), gCount);
    check('SIGHT WORDS: the words themselves cross intact',
      /Chase/.test(gBox) && /Marshall/.test(gBox), gBox);

    // ---- a guest may add one too (read-write, like the sentence list) -------
    await gf.locator('#sight-input').fill('Chase\nMarshall\nSkye');
    await gf.locator('#sight-save').click();
    await sleep(3000);
    await hf.locator('.tab[data-screen="setup"]').click();
    const hAfter = await hf.locator('#count-sight').textContent();
    check('a guest can add a sight word and the host sees it', /3 words/.test(hAfter), hAfter);

    // ---- the counterweight: private state must STAY on its own device -------
    // theme is one person's screen. If prefs ever went shared, changing the
    // host's theme would yank the guest's, which is why it is not curriculum.
    // mirrorState() is the owner-verified mirror the runtime exposes for
    // exactly this ("for suites to watch convergence without stealing"). The
    // host strips private records before signing, so what is IN it is the
    // visibility boundary, read off the wire rather than off the manifest.
    const cols = await guest.evaluate(() => {
      const c = window.__appClientCtl;
      if (!c || !c.mirrorState) return null;
      const st = c.mirrorState();
      return st && st.collections ? Object.keys(st.collections) : null;
    });
    check('the guest has an owner-verified mirror', !!cols, cols);
    check('the mirror carries the shared curriculum', !!cols && cols.includes('curriculum'), cols);
    check('…and never the private prefs (theme/reps are one person’s screen)',
      !!cols && !cols.includes('prefs'), cols);
  } finally {
    await browser.close();
  }

  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
