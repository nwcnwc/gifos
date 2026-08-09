// The default Calculator is a GRAPHING calculator (Desmos idiom): an
// expression list that plots as you type — explicit curves, sliders that
// re-shape them live, implicit equations via marching squares, inequality
// regions, user-defined functions — while plain arithmetic still answers
// inline. This guards each capability NUMERICALLY through the app's __calc
// hook (classification + evalRow probes + contour segment counts): pixel
// screenshots would flake on themes, DPR and fonts, and a hook probe fails
// loudly at the exact broken layer instead.
//
// Needs: static server on 8099. (Solo app — no relay.)
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps) => typeof a === 'number' && Math.abs(a - b) <= (eps || 1e-9);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();
  const desk = await ctx.newPage();
  desk.on('pageerror', (e) => console.log('  [desk err]', e.message));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 20000 });
  await sleep(500);
  await desk.locator('.icon', { hasText: /^Tools$/ }).dblclick();
  await sleep(400);
  const [page] = await Promise.all([
    ctx.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'Calculator.gif' }).dblclick(),
  ]);
  page.on('pageerror', (e) => console.log('  [calc err]', e.message));
  await page.waitForSelector('iframe', { timeout: 30000 });
  await page.locator('.perm-modal .done').click({ timeout: 2500 }).catch(() => {});
  const app = () => page.frames().find((f) => f !== page.mainFrame());
  const fl = page.frameLocator('iframe');
  await fl.locator('#g').waitFor({ timeout: 15000 });
  // The sandboxed srcdoc frame is cross-origin to the page — poll the hook
  // through the frame itself, never through window.frames from the parent.
  const waitCalc = async (min) => {
    for (let i = 0; i < 100; i++) {
      const ok = await app().evaluate((n) => !!(window.__calc && window.__calc.rows.length >= n), min).catch(() => false);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  };
  check('the app exposes its state hook', await waitCalc(2));

  // ---- the seeded state: a curve driven by a slider --------------------------
  let c = await app().evaluate(() => window.__calc.rows.map((r) => r.kind));
  check('seeds a slider-driven curve (explicit + slider rows)', c[0] === 'explicit' && c[1] === 'slider', c.join(','));
  let v = await app().evaluate(() => window.__calc.evalRow(0, Math.PI / 2));
  check('y = a sin(x) evaluates through the slider (a=1 → y(π/2)=1)', near(v, 1, 1e-9), String(v));

  // ---- dragging the slider re-shapes the curve -------------------------------
  await app().evaluate(() => {
    const rg = document.querySelector('.sl input[type=range]');
    rg.value = '3'; rg.dispatchEvent(new Event('input'));
  });
  await sleep(200);
  v = await app().evaluate(() => window.__calc.evalRow(0, Math.PI / 2));
  check('moving the slider re-evaluates the curve live (a=3 → y(π/2)=3)', near(v, 3, 1e-9), String(v));

  // ---- plain arithmetic still answers inline (the old calculator survives) ---
  const addRow = async (src) => {
    await fl.locator('#addrow').click();
    const inp = fl.locator('.ex').last();
    await inp.fill(src);
    await sleep(250);
  };
  await addRow('1+2*3^2');
  const val = await fl.locator('.row').last().locator('.val').textContent();
  check('arithmetic rows answer inline with precedence (1+2*3^2 = 19)', val.trim() === '= 19', val);

  // ---- implicit equations draw via marching squares --------------------------
  const segs0 = await app().evaluate(() => window.__calc.stats.segs);
  await addRow('x^2 + y^2 = 25');
  c = await app().evaluate(() => window.__calc.rows.map((r) => r.kind));
  const segs1 = await app().evaluate(() => window.__calc.stats.segs);
  check('a circle is classified implicit and produces contour segments',
    c[c.length - 1] === 'implicit' && segs1 > segs0, segs0 + ' -> ' + segs1);

  // ---- user-defined functions ------------------------------------------------
  await addRow('f(x) = x^2 - 2');
  v = await app().evaluate(() => window.__calc.evalRow(window.__calc.rows.length - 1, 3));
  check('f(x) = x^2 - 2 defines AND plots (f(3) = 7)', near(v, 7, 1e-9), String(v));
  await addRow('f(4) + 1');
  const fval = await fl.locator('.row').last().locator('.val').textContent();
  check('defined functions are callable from other rows (f(4)+1 = 15)', fval.trim() === '= 15', fval);

  // ---- inequalities shade regions -------------------------------------------
  await addRow('y < x + 1');
  c = await app().evaluate(() => window.__calc.rows.map((r) => r.kind));
  check('an inequality is classified as a region', c[c.length - 1] === 'region', c.join(','));

  // ---- implicit multiplication + unicode (the student idiom) -----------------
  await addRow('2x + π');
  v = await app().evaluate(() => window.__calc.evalRow(window.__calc.rows.length - 1, 2));
  check('implicit multiplication and π parse (2x+π at x=2)', near(v, 4 + Math.PI, 1e-9), String(v));

  // ---- the keypad inserts into the focused row -------------------------------
  await fl.locator('.ex').last().focus();
  await fl.locator('#keypad button', { hasText: /^√$/ }).click();
  const src = await fl.locator('.ex').last().inputValue();
  // the input keeps the pretty glyph; the parser translates √ at parse time
  check('the keypad inserts at the caret (√()', src.indexOf('√(') >= 0, src);

  // ---- everything persists in the icon (db) ---------------------------------
  const n0 = await app().evaluate(() => window.__calc.rows.length);
  await sleep(900); // let the debounced save land
  await page.reload();
  await page.waitForSelector('iframe', { timeout: 30000 });
  await page.locator('.perm-modal .done').click({ timeout: 2500 }).catch(() => {});
  check('after reload the rows come back from the icon', await waitCalc(n0));
  const back = await app().evaluate(() => window.__calc.rows.map((r) => r.s));
  check('the expression list survives a reload (saved in the icon)', back.length >= n0, back.length + '/' + n0 + ' rows');
  check('…including the slider value the drag set', /=\s*3$/.test(back[1] || ''), JSON.stringify(back[1]));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
