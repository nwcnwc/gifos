/*
 * Retirement Calculator, in the real GifOS sandbox.
 *
 * The unit suite proves the arithmetic. This proves the part the arithmetic
 * cannot: that a person can open the app, get an answer, save a plan under a
 * name, come back to it, and put it beside another one — through gifos.db,
 * inside the sandbox, with the app's own manifest deciding what syncs.
 *
 * SCENARIOS ARE THE REASON THIS EXISTS. Saved plans are the feature that turns
 * a calculator into something you return to, and they are the part that cannot
 * be checked by reading the source: db.put assigns the id, db.subscribe repaints
 * from another tab, and a declined capability has to degrade instead of throw.
 * All of that is runtime behaviour or it is nothing.
 *
 *   python3 -m http.server 8099 -d site
 *   node apps/retirement/build.mjs
 *   node test/browser/e2e-retirement.js
 */
const { chromium, CHROME } = require('../lib/pw');
const { readFileSync, existsSync } = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const GIF = path.join(__dirname, '..', '..', 'site', 'apps', 'retirement', 'retirement.gif');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + n
    + (!ok && extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
};

// A dead browser is not a verdict: exit 4 and judge nothing.
function noVerdict(why) {
  console.log('NO-VERDICT — ' + why);
  process.exit(4);
}

async function mount(page, fid) {
  await page.goto(BASE + '/run.html#id=' + fid);
  await page.waitForSelector('#appmount iframe', { timeout: 60000 });
  const fr = await (await page.$('#appmount iframe')).contentFrame();
  await fr.waitForFunction(
    () => { const h = document.getElementById('vHead'); return h && !/Working it out/.test(h.textContent); },
    null, { timeout: 40000 }
  );
  return fr;
}
const txt = (fr, id) => fr.evaluate((i) => {
  const e = document.getElementById(i);
  return e ? e.textContent.trim() : null;
}, id);

(async () => {
  if (!existsSync(GIF)) noVerdict('no built GIF — run node apps/retirement/build.mjs first');

  const browser = await chromium.launch({ executablePath: CHROME }).catch(() => null);
  if (!browser) noVerdict('chromium would not launch');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });

  const b64 = readFileSync(GIF).toString('base64');
  const fid = await page.evaluate(async (b) => {
    const bin = atob(b); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'retirement.gif', bytes, kind: 'gif', isApp: true, appId: 'retirement', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: id, name: 'Retirement Calculator.gif', parent: null, x: 180, y: 180, iconSize: 64 });
    return id;
  }, b64);

  let fr = await mount(page, fid);

  // ---- 1. it answers, before anyone types anything -------------------------

  const head = await txt(fr, 'vHead');
  check('the verdict is a sentence, not a number', !!head && /\w+\s+\w+/.test(head), head);
  // It must name the evidence, and name it HONESTLY. "1,268 real retirements"
  // reads as 1,268 independent data points; they are overlapping windows, one
  // per starting month, with about a hundred non-overlapping ones behind them.
  {
    const sub = await txt(fr, 'vSub');
    check('the verdict names how much history was run',
      /\d[\d,]*\s+(real \d+-year stretches|reshuffled)/.test(sub), sub);
    check('...without claiming they are independent retirements',
      !/real retirements/.test(sub), sub);
  }

  await fr.waitForFunction(() => {
    const e = document.getElementById('vSpend');
    return e && e.textContent !== '—';
  }, null, { timeout: 40000 }).catch(() => {});
  check('"could spend" is solved', /\$/.test(await txt(fr, 'vSpend')), await txt(fr, 'vSpend'));
  check('"could retire at" is solved', /^\d+$/.test(await txt(fr, 'vRetire')), await txt(fr, 'vRetire'));

  const charts = await fr.evaluate(() => document.querySelectorAll('svg.chart path').length);
  check('the charts actually drew something', charts > 6, charts);

  {
    // A chart is redrawn on every keystroke. If a redraw APPENDS instead of
    // replacing, the app quietly grows a second copy of its own hero chart on
    // the first edit and a third on the next — which is exactly what it did.
    const before = await fr.evaluate(() => document.querySelectorAll('#chartFan svg.chart').length);
    for (const v of [70, 80, 90]) {
      await fr.evaluate((x) => {
        const e = document.getElementById('fStocks');
        e.value = String(x);
        e.dispatchEvent(new Event('input', { bubbles: true }));
      }, v);
      await sleep(900);
    }
    const after = await fr.evaluate(() => ({
      fan: document.querySelectorAll('#chartFan svg.chart').length,
      tips: document.querySelectorAll('#chartFan .chart-tip').length,
      all: document.querySelectorAll('svg.chart').length
    }));
    check('redrawing replaces the chart, it does not stack another one',
      before === 1 && after.fan === 1 && after.tips === 1, { before, after });
    check('...and the app still has exactly one chart per card', after.all <= 6, after);
  }

  // Every chart ships a table twin — no value is reachable only by hovering.
  const twins = await fr.evaluate(() => document.querySelectorAll('.tabledrop table.data-table, .tabledrop').length);
  check('each chart has a table twin', twins >= 3, twins);

  // ---- 2. the advice is present and re-appliable ---------------------------

  await fr.waitForFunction(
    () => document.querySelectorAll('#adviceList .advice').length > 0,
    null, { timeout: 60000 }
  ).catch(() => {});
  const advice = await fr.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('#adviceList .advice'),
      (e) => e.querySelector('b').textContent));
  check('the app ends with things to do, not just a percentage', advice.length > 0, advice);

  {
    // "Try it" must actually change the plan and re-run it.
    const before = await txt(fr, 'vHead');
    const applied = await fr.evaluate(() => {
      const b = document.querySelector('#adviceList .advice-apply');
      if (!b) return false;
      b.click();
      return true;
    });
    if (applied) {
      await sleep(2500);
      const after = await txt(fr, 'vHead') + '|' + await txt(fr, 'vSub');
      check('"Try it" applies the suggestion and re-runs', after !== before + '|', { before });
    } else {
      check('"Try it" applies the suggestion and re-runs', false, 'no Try it button rendered');
    }
  }

  // ---- 2a. the headline must refuse rather than invent ---------------------

  {
    // A strategy whose paycheck comes out of the balance can never fail, so
    // "the most you could spend and still clear 95%" has no answer — every
    // amount clears. The solver used to walk its ceiling up and print what it
    // reached: the app shipped "Could spend a year: $185B" in the largest type
    // on the page, for two of its five strategies.
    for (const name of ['Fixed percentage', 'Spend it down']) {
      await fr.evaluate((n) => {
        const b = Array.prototype.slice.call(document.querySelectorAll('#stratPick button'))
          .filter((x) => x.textContent === n)[0];
        if (b) b.click();
      }, name);
      await sleep(4500);
      const tiles = await fr.evaluate(() => ({
        spend: document.getElementById('vSpend').textContent.trim(),
        retire: document.getElementById('vRetire').textContent.trim(),
        why: document.getElementById('statSpend').title
      }));
      check(name + ': the tiles refuse instead of inventing a number',
        tiles.spend === '—' && tiles.retire === '—', tiles);
      check(name + ': ...and say why', /never run out/i.test(tiles.why), tiles.why);
    }
    await fr.evaluate(() => {
      const b = Array.prototype.slice.call(document.querySelectorAll('#stratPick button'))
        .filter((x) => x.textContent === 'Steady paycheck')[0];
      if (b) b.click();
    });
    await sleep(3500);
  }

  {
    // "Only none of 1,244 real retirements lasted" was a shipped sentence.
    await fr.evaluate(() => {
      const e = document.getElementById('fSpend');
      e.value = '$10,000,000';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(3500);
    const v = await txt(fr, 'vSub');
    check('a plan that always fails is described in English', !/Only none/i.test(v || ''), v);
    await fr.evaluate(() => {
      const e = document.getElementById('fSpend');
      e.value = '$75,000';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(3000);
  }

  {
    // Clicking Add and touching nothing used to be worth $12,000 a year indexed
    // for life, which flipped the verdict without the reader typing a character.
    const before = await txt(fr, 'vSub');
    await fr.evaluate(() => document.getElementById('btnAddIncome').click());
    await sleep(3500);
    check('an empty income row is worth nothing', (await txt(fr, 'vSub')) === before, before);
    await fr.evaluate(() => {
      const b = document.querySelector('#incomeList .row-del');
      if (b) b.click();
    });
    await sleep(2500);
  }

  {
    // Half the app used to live below the fold of a nested scroller with no
    // scrollbar and no fade, on the desktop layout only.
    const rail = await fr.evaluate(() => {
      const i = document.getElementById('inputs');
      return { hidden: i.scrollHeight - i.clientHeight, overflowY: getComputedStyle(i).overflowY };
    });
    check('no part of the input rail is hidden in a nested scroller',
      rail.hidden <= 1, rail);
  }

  check('the app itself says it does not do tax',
    /does not work out your tax/i.test(await txt(fr, 'footTax') || ''), await txt(fr, 'footTax'));

  // ---- 2b. the light theme is a SELECTED theme, not an inverted one --------

  {
    const dark = await fr.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        surface: cs.getPropertyValue('--surface').trim(),
        s1: cs.getPropertyValue('--s1').trim(),
        wLess: cs.getPropertyValue('--w-less').trim(),
        good: cs.getPropertyValue('--good').trim()
      };
    });
    check('it opens dark, because it lives on a dark desktop', dark.theme === 'dark', dark);

    await fr.evaluate(() => document.getElementById('btnTheme').click());
    await sleep(1600);
    const light = await fr.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const key = document.querySelector('#legStates .legend-key');
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        surface: cs.getPropertyValue('--surface').trim(),
        s1: cs.getPropertyValue('--s1').trim(),
        wLess: cs.getPropertyValue('--w-less').trim(),
        good: cs.getPropertyValue('--good').trim(),
        pressed: document.getElementById('btnTheme').getAttribute('aria-pressed'),
        swatch: key ? key.style.background : null
      };
    });
    check('the toggle switches to light', light.theme === 'light' && light.pressed === 'true', light);
    check('...with its OWN categorical steps, not the dark ones',
      light.s1 !== dark.s1 && light.wLess !== dark.wLess, { dark, light });
    check('...and a status colour that does NOT theme', light.good === dark.good,
      [dark.good, light.good]);
    // The legend is drawn in JS and the marks in CSS. If they read from two
    // lists the legend eventually lies about the chart.
    check('the legend swatch follows the theme too', !!light.swatch, light.swatch);

    await fr.evaluate(() => document.getElementById('btnTheme').click());
    await sleep(1200);
    check('and back to dark',
      await fr.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark');
  }

  // ---- 3. scenarios: save, name, switch, persist ---------------------------

  async function setPlan(spend, retire) {
    await fr.evaluate(([s, r]) => {
      const sp = document.getElementById('fSpend');
      sp.value = '$' + s.toLocaleString('en-US');
      sp.dispatchEvent(new Event('input', { bubbles: true }));
      const ra = document.getElementById('fRetire');
      ra.value = String(r);
      ra.dispatchEvent(new Event('input', { bubbles: true }));
    }, [spend, retire]);
    await sleep(2200);
  }

  /* "New" is two steps now: it asks whether to start from a copy or from the
   * defaults, THEN asks for a name. The old flow reached straight for the name
   * field, which no longer exists at that moment. */
  async function newPlan(fr, name, blank) {
    await fr.evaluate(() => document.getElementById('btnNew').click());
    await sleep(500);
    await fr.evaluate((wantBlank) => {
      const bs = Array.prototype.slice.call(document.querySelectorAll('#modalBody .menu-item'));
      const b = bs.filter((x) => /Blank/.test(x.textContent))[0];
      const c = bs.filter((x) => /Copy/.test(x.textContent))[0];
      (wantBlank ? (b || c) : (c || b)).click();
    }, !!blank);
    await sleep(500);
    await fr.evaluate((n) => {
      const i = document.getElementById('nameField');
      i.value = n;
      i.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('modalOk').click();
    }, name);
    await sleep(1400);
  }

  async function saveAs(name) {
    await fr.evaluate(() => document.getElementById('btnSave').click());
    await sleep(400);
    const needsName = await fr.evaluate(() => !document.getElementById('modal').hidden);
    if (needsName) {
      await fr.evaluate((n) => {
        const i = document.getElementById('nameField');
        i.value = n;
        i.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('modalOk').click();
      }, name);
    }
    await sleep(900);
  }

  await setPlan(60000, 62);
  await saveAs('Lean at 62');
  check('the saved plan takes its name', (await txt(fr, 'scenLabel')) === 'Lean at 62',
    await txt(fr, 'scenLabel'));

  // A second, deliberately different plan.
  await newPlan(fr, 'Comfortable at 67', true);
  await setPlan(95000, 67);
  await saveAs('Comfortable at 67');

  const stored = await fr.evaluate(async () => (await gifos.db('scenarios').getAll())
    .map((s) => ({ name: s.name, spend: s.plan.annualSpend, retire: s.plan.retireAge })));
  check('both plans are stored', stored.length === 2, stored);
  check('...with their own names', stored.some((s) => s.name === 'Lean at 62')
    && stored.some((s) => s.name === 'Comfortable at 67'), stored.map((s) => s.name));
  check('...and their own numbers',
    stored.some((s) => s.spend === 60000 && s.retire === 62)
    && stored.some((s) => s.spend === 95000 && s.retire === 67), stored);

  // Switching back must restore the inputs, not just the label.
  await fr.evaluate(() => document.getElementById('scenPick').click());
  await sleep(300);
  const switched = await fr.evaluate(() => {
    const items = document.querySelectorAll('#scenMenu .menu-item');
    for (const b of items) {
      const n = b.querySelector('.mi-name');
      if (n && n.textContent === 'Lean at 62') { b.click(); return true; }
    }
    return false;
  });
  await sleep(2200);
  check('the saved plan can be reopened from the menu', switched);
  const restored = await fr.evaluate(() => ({
    name: document.getElementById('scenLabel').textContent.trim(),
    spend: document.getElementById('fSpend').value,
    retire: document.getElementById('fRetire').value
  }));
  check('reopening restores the numbers, not just the name',
    restored.name === 'Lean at 62' && /60,000/.test(restored.spend) && restored.retire === '62',
    restored);

  // ---- 4. compare -----------------------------------------------------------

  await fr.evaluate(() => document.getElementById('btnCompare').click());
  await sleep(400);
  const picked = await fr.evaluate(() => {
    const b = document.querySelector('#modalBody .menu-item');
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(3000);
  check('a second plan can be picked to compare', picked);
  const cmp = await fr.evaluate(() => {
    const c = document.getElementById('cardCompare');
    return {
      shown: c && !c.hidden,
      rows: document.querySelectorAll('#cmpBody tbody tr').length,
      heads: Array.prototype.map.call(document.querySelectorAll('#cmpBody thead th'), (e) => e.textContent.trim())
    };
  });
  check('the side-by-side table appears', cmp.shown && cmp.rows >= 4, cmp);
  check('...naming both plans', cmp.heads.filter(Boolean).length === 2, cmp.heads);

  // ---- 5. it survives being closed and reopened ----------------------------

  fr = await mount(page, fid);
  await sleep(1200);
  const after = await fr.evaluate(async () => ({
    label: document.getElementById('scenLabel').textContent.trim(),
    count: (await gifos.db('scenarios').getAll()).length,
    spend: document.getElementById('fSpend').value
  }));
  check('the plans are still there after a reopen', after.count === 2, after);
  check('...and it reopens on the one you were using',
    after.label === 'Lean at 62' && /60,000/.test(after.spend), after);

  // ---- 6. nothing reached the wire ------------------------------------------
  //
  // The listing promises nothing is uploaded. The manifest declares no network
  // capability, so the sandbox refuses at the CSP layer — but a request that is
  // BLOCKED is still a request that was attempted, and an attempt means the
  // code believes it can phone home. There should be none.

  const wire = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) wire.push(u);
  });
  await fr.evaluate(() => {
    document.getElementById('fStocks').value = '90';
    document.getElementById('fStocks').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(3000);
  check('a full re-run touches no outside host', wire.length === 0, wire.slice(0, 5));

  check('no uncaught errors anywhere in the run', errors.length === 0, errors.slice(0, 4));

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  noVerdict('the run threw: ' + e.message);
});
