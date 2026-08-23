/*
 * AN APP MAY NEVER NAVIGATE ITSELF OUT OF ITS OWN FRAME.
 *
 * A GifOS app runs as a `srcdoc` iframe, and a srcdoc document INHERITS ITS
 * BASE URL FROM THE PARENT. So for the whole life of the runtime the base URL
 * of every app on this computer was run.html's own address — and a RELATIVE
 * navigation resolves against the base. That made two ordinary, everywhere
 * lines of web code into a trapdoor OUT of the app:
 *
 *     location.replace('#' + something)        // Regexper, on every launch
 *     <a href="#section">Read more</a>         // bip39; piskel's "+"
 *
 * Either one walks the frame off about:srcdoc and onto run.html. run.html then
 * reads the hash it has just landed on, finds no #id= / #s= / #j= in it, and
 * takes the only branch left: kind:'meet'. THE APP IS REPLACED BY THE MEETING
 * LOBBY. Regexper shipped to the store doing this on 100% of launches, and no
 * suite noticed, because no suite had ever booted a store app and asked the one
 * question this file asks.
 *
 * The fix is in the OS, not in the apps (site/js/runtime.js — buildAppHtml
 * pins `<base href="about:srcdoc">`, and the app CSP's base-uri says `about:`
 * so the OS's own base element is not refused). This suite is the guard, and
 * it is deliberately a SWEEP: every built App GIF in site/apps/ is installed,
 * launched, and clicked, because the hazard is in the platform and therefore
 * applies to every app anyone ever ports, including the ones not written yet.
 *
 *   node test/browser/e2e-app-frame-escape.js            # every built app
 *   node test/browser/e2e-app-frame-escape.js regexper   # just these
 *
 * Needs: the static site on 8099 (python3 -m http.server 8099 -d site).
 */
const fs = require('fs');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const ROOT = path.join(__dirname, '..', '..');
const SITE_APPS = path.join(ROOT, 'site', 'apps');

// Every app that is actually BUILT. Read from disk rather than from the
// catalog: an app whose GIF is present is an app a user can install, listed or
// not, and the sweep is only honest if it is the whole shelf.
const ALL = fs.readdirSync(SITE_APPS)
  .filter((s) => fs.existsSync(path.join(SITE_APPS, s, s + '.gif')))
  .sort();
const SLUGS = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

// Seeding is batched so one IndexedDB never holds the entire ~200 MB shelf,
// and each batch shares ONE browser context and ONE desktop — 85 fresh
// contexts and 85 desktop boots is most of the suite's clock and none of its
// meaning.
const BATCH = 8;
const SETTLE_MS = 2500;   // after mount, before the verdict: boot-time escapes are immediate
const CLICK_MS = 350;     // after a click, before the verdict
const MAX_ANCHORS = 40;   // bip39 ships 19; this is a runaway guard, not a sample

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The app's frame is the only child frame of run.html. `escaped` is the whole
// verdict: a contained app is on about:srcdoc (or about:blank before its first
// fragment write) forever, and ANY http(s) URL means it left.
const appFrame = (page) => page.frames().find((f) => f !== page.mainFrame());
const escaped = (url) => /^https?:/.test(url || '');

async function seed(page, slugs) {
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });
  const ids = {};
  for (const slug of slugs) {
    const b64 = fs.readFileSync(path.join(SITE_APPS, slug, slug + '.gif')).toString('base64');
    ids[slug] = await page.evaluate(async ([b, s]) => {
      const bin = atob(b); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: s + '.gif', bytes, kind: 'gif', isApp: true, appId: s, mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: s + '.gif', parent: null, x: 200, y: 200, iconSize: 64 });
      return fid;
    }, [b64, slug]);
  }
  return ids;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  console.log('sweeping ' + SLUGS.length + ' built app' + (SLUGS.length === 1 ? '' : 's') + ' @ ' + BASE);

  // ---- the MECHANISM, asserted once and directly ---------------------------
  // Every per-app check below is downstream of this one. Stated on its own so
  // that a shelf which happens to contain no `#` anchor still fails loudly the
  // day the base tag is dropped or the CSP refuses it again.
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const ids = await seed(p, [SLUGS[0]]);
    await p.goto(BASE + '/run.html#id=' + ids[SLUGS[0]]);
    await p.waitForSelector('#appmount iframe', { timeout: 60000 });
    await sleep(SETTLE_MS);
    const f = appFrame(p);
    const baseURI = f ? await f.evaluate(() => document.baseURI).catch(() => '(unreadable)') : '(no frame)';
    check('the OS pins the app’s base URL to its own document', baseURI === 'about:srcdoc', 'baseURI=' + baseURI);
    check('the OS’s own URL is NOT readable from inside the app sandbox',
      !/^https?:/.test(baseURI),
      'in an app room run.html’s hash carries the room’s link secret');
    await ctx.close();
  }

  // ---- the SWEEP -----------------------------------------------------------
  for (let i = 0; i < SLUGS.length; i += BATCH) {
    const batch = SLUGS.slice(i, i + BATCH);
    const ctx = await browser.newContext({ acceptDownloads: false });
    const desktop = await ctx.newPage();
    let ids;
    try {
      ids = await seed(desktop, batch);
    } catch (e) {
      for (const slug of batch) check(slug + ': installs on a desktop', false, String(e.message || e).slice(0, 90));
      await ctx.close();
      continue;
    }
    await desktop.close();

    for (const slug of batch) {
      let boot = '(never mounted)', clicked = 0, bad = null;
      // A PAGE PER APP, not a goto per app. run.html reads its hash once, at
      // load, and two #id= URLs differ only in fragment — so a goto from one
      // app to the next is a SAME-DOCUMENT navigation that never reloads and
      // never swaps the app. Written the fast way first, this suite ran the
      // whole batch against whichever app happened to boot first and reported
      // seven PASSes it had not earned. The context (and its seeded desktop)
      // is what's being reused here; the document never is.
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + '/run.html#id=' + ids[slug]);
        await page.waitForSelector('#appmount iframe', { timeout: 60000 });
        await sleep(SETTLE_MS);
        boot = (appFrame(page) || {}).url ? appFrame(page).url() : '(no frame)';

        if (!escaped(boot)) {
          const n = Math.min(await appFrame(page).evaluate(
            () => document.querySelectorAll('a[href^="#"]').length).catch(() => 0), MAX_ANCHORS);
          for (let k = 0; k < n; k++) {
            const fr = appFrame(page);
            if (!fr || escaped(fr.url())) break;
            // Clicked IN THE PAGE, not through Playwright's actionability gate:
            // half these anchors sit under a modal or off-screen, and whether
            // they are conveniently clickable is not what is under test.
            const info = await fr.evaluate((idx) => {
              const a = document.querySelectorAll('a[href^="#"]')[idx];
              if (!a) return null;
              const label = (a.textContent || '').trim().slice(0, 24) || a.getAttribute('href');
              a.click();
              return { href: a.getAttribute('href'), label };
            }, k).catch(() => null);
            if (!info) continue;
            clicked++;
            await sleep(CLICK_MS);
            const after = appFrame(page);
            const url = after ? after.url() : '(gone)';
            if (escaped(url)) { bad = info.href + ' (“' + info.label + '”) → ' + url; break; }
          }
        }
      } catch (e) {
        check(slug + ': launches', false, String(e.message || e).slice(0, 90));
        await page.close();
        continue;
      }

      const where = escaped(boot) ? 'ON LAUNCH → ' + boot : bad ? 'on a click: ' + bad : '';
      check(slug + ': stays in its own frame' + (clicked ? ' (' + clicked + ' in-page link' + (clicked === 1 ? '' : 's') + ' clicked)' : ''),
        !escaped(boot) && !bad, where || null);
      // A frame that escaped is on run.html now; the next goto resets it, but
      // say what it turned into, because that is the symptom a user reports.
      if (escaped(boot) || bad) {
        const t = await (appFrame(page) || page.mainFrame()).evaluate(() => document.title).catch(() => '');
        if (t) console.log('       the app became: "' + t + '"');
      }
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'all green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
