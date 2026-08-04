// The first-visit theme flash — gifos.app must paint the CORRECT theme first.
//
// The theme cascade (gifos-themes.js) promises "chrome lands BEFORE first
// paint", but that was only true if the file itself ran before first paint —
// and at the end of <body> it didn't: on a cold cache (every script fetched
// over a slow network) the theme-gate's 1.5s failsafe fired first and revealed
// the purple :root baseline from desktop.css, which then visibly snapped to
// Aurora when theme.js finally landed. Users saw a wrong-theme desktop flash on
// their very first visit. The fix is TWO-PASS loading: the entry pages include
// gifos-themes.js in <head> (theme pass — parser-blocking, so vars land before
// any paint) and the desktop pages include it again after gifos-icons.js (art
// pass — icons/eggs/wallpaper only).
//
// Guarded MECHANICALLY, not by scanning source: every js/themes request is
// delayed 900ms — far past the 1500ms failsafe when summed down the old
// sequential document.write chain (measured: old code revealed unthemed at
// ~1540ms, themed at ~1982ms; ~25 wrong-theme frames) — and a 16ms sampler
// asserts NO frame ever has a visible body without the theme's --accent set.
// Also guards the two-pass split itself: theme.js must be fetched exactly once
// (a naive double include would fetch it twice), and the art pass must still
// deliver the icon pack (a theme pass that swallowed the art would leave the
// desktop with no themed icons — and this suite green for the wrong reason).
//
// Needs only the static server (BASE).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (name, cond, d) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (d ? '  (' + d + ')' : '')); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  async function coldSlowLoad(path, { wantIcons }) {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const fetched = [];
    await page.addInitScript(() => {
      window.__samples = [];
      const poll = () => {
        try {
          const h = document.documentElement;
          if (h) window.__samples.push({
            booting: h.classList.contains('gifos-booting'),
            accent: !!h.style.getPropertyValue('--accent'),
            hasBody: !!document.body,
          });
        } catch (e) {}
        setTimeout(poll, 16); // not rAF — rAF doesn't tick before first render
      };
      poll();
    });
    await page.route('**/js/**', async (r) => { fetched.push(new URL(r.request().url()).pathname); await new Promise((s) => setTimeout(s, 900)); r.continue(); });
    await page.route('**/themes/**', async (r) => { fetched.push(new URL(r.request().url()).pathname); await new Promise((s) => setTimeout(s, 900)); r.continue(); });
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (wantIcons) await page.waitForSelector('.icon', { timeout: 90000 }).catch(() => {});
    else await page.waitForFunction(() => !document.documentElement.classList.contains('gifos-booting'), null, { timeout: 90000 }).catch(() => {});
    const res = await page.evaluate(() => ({
      samples: window.__samples.length,
      flashFrames: window.__samples.filter((x) => x.hasBody && !x.booting && !x.accent).length,
      pack: window.GifOS && window.GifOS.theme && window.GifOS.theme.pack,
      accent: document.documentElement.style.getPropertyValue('--accent').trim(),
      icons: document.querySelectorAll('.icon').length,
      hasAurora: !!(window.GifOS && window.GifOS.iconPacks && window.GifOS.iconPacks.get && window.GifOS.iconPacks.get('aurora')),
    }));
    await ctx.close();
    return { res, fetched };
  }

  // ---- the desktop (the page the bug was reported on) -----------------------
  {
    const { res, fetched } = await coldSlowLoad('/index.html', { wantIcons: true });
    check('cold slow index.html: the sampler actually sampled', res.samples > 20, res.samples + ' samples');
    check('cold slow index.html: no frame ever shows a body without the theme (the first-visit flash)',
      res.flashFrames === 0, res.flashFrames + ' wrong-theme frames');
    check('index.html is themed Aurora once up', res.pack === 'aurora' && !!res.accent, res.accent);
    const themeLoads = fetched.filter((p) => /\/themes\/theme\.js$/.test(p)).length;
    check('two-pass split: base theme.js is fetched exactly once', themeLoads === 1, themeLoads + ' fetches');
    check('the ART pass still runs: icon pack delivered, desktop has icons',
      res.hasAurora && res.icons >= 5, res.icons + ' icons');
  }

  // ---- boot.html (the other desktop-class page; it has no gate at all) ------
  {
    const { res, fetched } = await coldSlowLoad('/boot.html', { wantIcons: false });
    check('cold slow boot.html: no wrong-theme frame', res.flashFrames === 0, res.flashFrames + ' frames');
    check('boot.html is themed Aurora', res.pack === 'aurora' && !!res.accent, res.accent);
    const themeLoads = fetched.filter((p) => /\/themes\/theme\.js$/.test(p)).length;
    check('boot.html fetches base theme.js exactly once', themeLoads === 1, themeLoads + ' fetches');
  }

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
