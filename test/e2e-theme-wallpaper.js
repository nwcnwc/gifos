// The theme cascade auto-loads a per-computer wallpaper.js — DESKTOP-only (like
// icons/eggs) and OVERRIDE-only (there's no default wallpaper). A computer just
// drops the file in; no per-theme injection. We stub the file via route
// interception (no committed fixture) and assert it loads on the desktop, not on
// the meeting page, and never for the default (un-themed) computer.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  let wpHits = 0;
  const stubWallpaper = async (ctx) => {
    await ctx.route('**/themes/**/wallpaper.js', (route) => {
      wpHits++;
      route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__wpLoaded=(window.__wpLoaded||0)+1;' });
    });
  };

  // ---- A themed computer: wallpaper runs on the desktop, not on meet ----------
  // Block the service worker: sw.js ALSO precaches /themes/<label>/wallpaper.js
  // using its OWN location.hostname label (it can't see the page-only
  // window.GIFOS_THEME override). On 127.0.0.1 the first octet "127" is misread
  // as a subdomain label, so the SW fetches /themes/127/wallpaper.js and trips
  // the "default requests no wallpaper" assertion — a localhost artifact, not a
  // product bug (a real default host like gifos.app has an empty label → no
  // request). This suite is about the page THEME CASCADE (override-only), so we
  // isolate it from the SW precache. (On a real subdomain the SW precache is
  // correct and covered elsewhere.)
  const themed = await browser.newContext({ serviceWorkers: 'block' });
  await themed.addInitScript({ content: "window.GIFOS_THEME='wptest';" });
  await stubWallpaper(themed);

  const desk = await themed.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 12000 });
  check('the desktop loads a computer\'s wallpaper.js', (await desk.evaluate(() => window.__wpLoaded)) === 1);

  const meet = await themed.newPage();
  await meet.goto(BASE + '/meet.html');
  await meet.waitForFunction(() => document.readyState === 'complete', null, { timeout: 12000 });
  check('the meeting page does NOT load the wallpaper (art pages skip it)',
    !(await meet.evaluate(() => window.__wpLoaded)));

  // ---- The default (un-themed) computer never even requests a wallpaper --------
  const hitsBefore = wpHits;
  const plain = await browser.newContext({ serviceWorkers: 'block' }); // isolate the theme cascade from the SW label-precache (see above)
  await plain.addInitScript({ content: "window.GIFOS_THEME='';" }); // '' = the plain default
  await stubWallpaper(plain);
  const home = await plain.newPage();
  await home.goto(BASE + '/index.html');
  await home.waitForSelector('.icon', { timeout: 12000 });
  check('the default computer requests no wallpaper.js (override-only)',
    wpHits === hitsBefore && !(await home.evaluate(() => window.__wpLoaded)));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
