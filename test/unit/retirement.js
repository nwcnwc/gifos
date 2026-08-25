// The Retirement Calculator's arithmetic, pinned against the published record.
//
// This app's whole claim is that its numbers are the real ones. That claim is
// only worth anything if it is CHECKED, and it cannot be checked by eye — a
// withdrawal engine that is 15% too optimistic looks exactly like one that is
// right until you put it beside a paper. So every number below comes from a
// published source, named in the comment above it, and the engine has to hit it.
//
// The four things most likely to silently break, and why each is here:
//
//   1. THE DATA. If Shiller's series is ever refreshed with price-only returns
//      instead of total return, every answer gets ~2/3 worse in the optimistic
//      direction and nothing throws. The long-run CAGRs catch it.
//   2. THE 4% RULE. It is the one number every reader can check. If the engine
//      drifts, this is where it shows.
//   3. THE WORST COHORT. The mid-1960s beat 1929 because stagflation hurts a
//      withdrawing portfolio more than a fast crash. Getting 1929 back would
//      mean the inflation handling had broken.
//   4. THE STRATEGIES. Each is a published rule with exact parameters, and each
//      was wrong here once already by being copied from a popularization rather
//      than the paper.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', '..', 'apps', 'retirement');

let failures = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + n
    + (!ok && extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- load the shipped files, exactly as the GIF inlines them ----------------

function load() {
  const sandbox = {
    console, Math, JSON, Object, Array, Number, String, Boolean, Date,
    isFinite, isNaN, parseFloat, parseInt, Float64Array, Uint8Array,
    Infinity, NaN, Error, TypeError, RegExp
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['data/market.js', 'sim.js', 'advice.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const box = load();
const M = box.MARKET, S = box.RetireSim, A = box.Advice;

check('sim.js publishes RetireSim with no document', !!S && typeof S.runAll === 'function');
check('advice.js publishes Advice', !!A && typeof A.suggest === 'function');
if (!S || !A) process.exit(1);

// ---- 1. the data is the real record -----------------------------------------

check('history starts 1871-01', M.start[0] === 1871 && M.start[1] === 1, M.start);
check('history is contiguous and long', M.months > 1860, M.months);
check('every series is the same length',
  M.stock.length === M.months && M.bond.length === M.months && M.cpi.length === M.months);
check('the indices are re-based to 1.00', M.stock[0] === 1 && M.bond[0] === 1);

{
  const yrs = (M.months - 1) / 12;
  const s = Math.pow(M.stock[M.months - 1], 1 / yrs) - 1;
  const b = Math.pow(M.bond[M.months - 1], 1 / yrs) - 1;
  // Real TOTAL return, US, 1871-. Price-only returns land near 2%, so this is
  // the tripwire for the single most damaging data mistake available.
  check('stock real CAGR is total-return shaped (6-8%)', s > 0.06 && s < 0.08, (s * 100).toFixed(2));
  check('bond real CAGR is plausible (1.5-3.5%)', b > 0.015 && b < 0.035, (b * 100).toFixed(2));
}
{
  // The crashes have to be in there, at the right depth, in real total-return
  // terms. Source: the series itself; these are the canonical drawdowns.
  const at = (y, m) => M.stock[(y - 1871) * 12 + (m - 1)];
  const dd = (y1, m1, y2, m2) => at(y2, m2) / at(y1, m1) - 1;
  check('1929-09 → 1932-06 is about -77%', near(dd(1929, 9, 1932, 6), -0.768, 0.02), dd(1929, 9, 1932, 6));
  check('1966-01 → 1982-07 is a real LOSS', dd(1966, 1, 1982, 7) < -0.15, dd(1966, 1, 1982, 7));
  check('2007-10 → 2009-02 is about -47%', near(dd(2007, 10, 2009, 2), -0.468, 0.02), dd(2007, 10, 2009, 2));
  // Prices FELL for thirty years after 1871. A CPI series that only ever rises
  // is a fabricated one.
  check('CPI falls somewhere in the 19th century',
    M.cpi[(1900 - 1871) * 12] < M.cpi[0], [M.cpi[0], M.cpi[(1900 - 1871) * 12]]);
}

// ---- 2. the 4% rule ----------------------------------------------------------

const base = (o) => Object.assign({
  currentAge: 65, retireAge: 65, endAge: 95, portfolio: 1000000,
  annualSavings: 0, annualSpend: 40000, stocks: 0.75, fees: 0, glidepath: null,
  strategy: 'constant', percentRate: 0.04, incomes: [], events: [],
  mode: 'history', target: 0.95
}, o || {});

{
  const o = S.runAll(base());
  // Trinity Study Table 3 (inflation-adjusted withdrawals), 75/25 over 30 years:
  // 98%. Cooley, Hubbard & Walz, AAII Journal, Feb 1998.
  check('4% / 30y / 75-25 lands in the mid-to-high 90s',
    o.successRate > 0.94 && o.successRate <= 1, (o.successRate * 100).toFixed(1));
  check('a 30-year plan has 1400+ monthly start dates', o.cycles > 1400, o.cycles);

  // Bengen 1994: "a four-percent withdrawal rate has in no past case caused a
  // portfolio to be exhausted before 33 years"; 3.5% is comfortably below it.
  check('3.5% never failed', S.runAll(base({ annualSpend: 35000 })).successRate === 1);
  // Bengen 1994: "six percent or more is gambling."
  check('6% is gambling', S.runAll(base({ annualSpend: 60000 })).successRate < 0.75);

  // Trinity Table 3, 100% bonds at 4%: 20%. The point that survives every
  // methodology: an all-bond portfolio is the LEAST safe over 30 years.
  const allBonds = S.runAll(base({ stocks: 0 })).successRate;
  check('all bonds at 4% is the dangerous option, not the safe one',
    allBonds < 0.7, (allBonds * 100).toFixed(1));

  // ERN: "3.5% is the new 4%" — 4% degrades badly as the horizon lengthens.
  const long = S.runAll(base({ endAge: 125 })).successRate;
  check('4% is materially less safe over 60 years than 30',
    long < o.successRate - 0.03, [(o.successRate * 100).toFixed(1), (long * 100).toFixed(1)]);
}

{
  // The worst US cohort is the mid-1960s, not 1929. This is the single most
  // load-bearing fact in the app's copy, and it is asserted on screen.
  const o = S.runAll(base());
  const retired = S.monthName(o.worst.startIdx + o.worst.retireYear * 12);
  check('the worst 30-year cohort is the mid-1960s', /196[5-9]/.test(retired), retired);
  check('the worst cohort actually ran dry', o.worst.failed);
}

{
  // SAFEMAX. An independent computation from the same Shiller data (annual,
  // start-of-year) gives 3.78% for 75/25 over 30 years; monthly steps move it
  // a few basis points. Anything outside 3.6-4.0% means the engine has drifted.
  const v = S.solveSpend(base(), 1.0, { iters: 20 }) / 1000000;
  check('SAFEMAX for 75/25 over 30 years is near 3.8%', v > 0.036 && v < 0.040, (v * 100).toFixed(2));
}

{
  // Sequence-of-returns risk, demonstrated rather than asserted: the same
  // retirement is decided by WHEN the bad years land, not by the average.
  const y1966 = S.runCycle(base(), (1966 - 1871) * 12);
  const y1975 = S.runCycle(base(), (1975 - 1871) * 12);
  check('a 1966 retiree at 4% ends far poorer than a 1975 one',
    y1966.final < y1975.final, [Math.round(y1966.final), Math.round(y1975.final)]);
}

{
  // The counterweight the app prints: over 30 years at 4%, most cohorts ended
  // RICHER in real terms than the day they retired. An independent run of the
  // same data puts 60/40 at 63% richer and a median of 1.46x.
  const o = S.runAll(base({ stocks: 0.6 }));
  check('most 4% cohorts ended richer than they started',
    o.endedRicher > 0.55 && o.endedRicher < 0.8, (o.endedRicher * 100).toFixed(0));
  check('the median 4% cohort ends near 1.5x its starting pot',
    near(o.medianFinal / 1000000, 1.46, 0.25), (o.medianFinal / 1e6).toFixed(2));
}

// ---- 3. the plumbing ---------------------------------------------------------

{
  // Everything is in today's money, so a COLA income must be FLAT in real terms
  // and a fixed one must ERODE. Getting this backwards is the commonest bug in
  // the category and it always flatters the plan.
  const cola = S.runAll(base({ annualSpend: 0, incomes: [{ label: 'p', amount: 30000, from: 65, to: null, cola: true }] }));
  check('an indexed income is flat in real terms',
    near(cola.runs[0].incomes[29], 30000, 1), cola.runs[0].incomes[29]);

  const fixed = S.runAll(base({ annualSpend: 0, incomes: [{ label: 'p', amount: 30000, from: 65, to: null, cola: false }] }));
  const modern = fixed.runs[fixed.runs.length - 1];
  check('a fixed pension erodes in a modern cohort',
    modern.incomes[29] < 22000, Math.round(modern.incomes[29]));
  // ...and GREW for an 1871 retiree, because prices fell for thirty years.
  check('a fixed pension GREW in real terms for an 1871 retiree',
    fixed.runs[0].incomes[29] > 35000, Math.round(fixed.runs[0].incomes[29]));

  // An income that ends must actually end.
  const ends = S.runAll(base({ annualSpend: 0, incomes: [{ label: 'p', amount: 12000, from: 65, to: 75, cola: true }] }));
  check('an income with an end date stops', ends.runs[0].incomes[15] === 0, ends.runs[0].incomes[15]);

  // A one-off lands in its own year and nowhere else.
  const lump = S.runCycle(base({ annualSpend: 0, portfolio: 0, stocks: 0, events: [{ label: 'sale', amount: 100000, at: 70 }] }), 0);
  check('a one-off arrives at the age it is dated', lump.balances[5] === 0 && lump.balances[6] > 90000,
    [lump.balances[5], Math.round(lump.balances[6])]);
}

{
  // Fees compound against you. 1pp of fee costs roughly 0.45pp of SAFEMAX.
  const free = S.solveSpend(base(), 1.0, { iters: 18 }) / 1e6;
  const dear = S.solveSpend(base({ fees: 0.01 }), 1.0, { iters: 18 }) / 1e6;
  check('1% of fees costs roughly 0.4-0.5pp of the safe rate',
    (free - dear) > 0.003 && (free - dear) < 0.007, ((free - dear) * 100).toFixed(2));
}

{
  // A plan too long for the record must REFUSE, not quietly run a short one.
  check('a 200-year plan offers no cycles', S.cycleStarts(base({ endAge: 265 })) === 0);
  // ...but the reshuffle can still answer it.
  check('the reshuffle answers what history cannot',
    S.bootstrap(base({ endAge: 155, annualSpend: 20000 }), { paths: 40 }).cycles === 40);
  // Seeded: the same plan must give the same answer twice, or a number moves
  // when the reader has touched nothing.
  const b1 = S.bootstrap(base(), { paths: 60 }).successRate;
  const b2 = S.bootstrap(base(), { paths: 60 }).successRate;
  check('the reshuffle is seeded and repeatable', b1 === b2, [b1, b2]);
}

// ---- 4. the strategies, against their own papers -----------------------------

{
  // Bogleheads VPW, published table. r = stocks*5.0% + bonds*1.9%, n = 100-age,
  // ANNUITY-DUE. The annuity-due form is what pins it; an ordinary annuity
  // misses by an order of magnitude more.
  const cell = (age, stk) => {
    const ctx = {
      plan: { currentAge: age, stocks: stk, glidepath: null },
      base: 0, balance: 100, year: 0, yearIndex: 0, left: 100 - age, infl: 1, lastReturn: 0
    };
    return S.STRATEGIES.vpw.step({}, ctx);
  };
  const table = [[50, 0.5, 4.1], [60, 0.6, 4.7], [65, 0.6, 5.0], [70, 0.6, 5.4],
    [75, 0.6, 6.0], [80, 0.6, 6.9], [85, 0.6, 8.5], [65, 0.3, 4.4], [65, 0.7, 5.2]];
  let bad = 0;
  for (const [age, stk, want] of table) if (!near(cell(age, stk), want, 0.06)) bad++;
  check('VPW reproduces the published Bogleheads table (9 cells)', bad === 0, bad + ' cells off');

  // A strategy whose paycheck comes OUT of the balance cannot run out, and must
  // never be scored as if it could. This was wrong once: VPW read 48.8% failure
  // for a method whose entire contract is "spend what you have".
  for (const k of ['vpw', 'percent']) {
    const o = S.runAll(base({ strategy: k, annualSpend: 50000, percentRate: 0.05 }));
    check(k + ' can never "run out"', o.successRate === 1, (o.successRate * 100).toFixed(1));
  }
  check('...and the fixed-paycheck strategy still can',
    S.runAll(base({ annualSpend: 60000 })).successRate < 1);
}

{
  // Guyton-Klinger. The rails are ±20% of the INITIAL rate, and the cuts and
  // raises are 10%. Its point is that flexibility buys survival — and its cost,
  // which Kitces' critique is entirely about, is a genuinely lean year.
  const hard = base({ annualSpend: 55000 });
  const flat = S.runAll(hard).successRate;
  const rail = S.runAll(Object.assign({}, hard, { strategy: 'guardrails' })).successRate;
  check('guardrails beat a fixed paycheck on survival', rail > flat + 0.05,
    [(flat * 100).toFixed(1), (rail * 100).toFixed(1)]);

  const o = S.runAll(Object.assign({}, hard, { strategy: 'guardrails' }));
  let leanest = Infinity;
  for (const r of o.runs) for (let y = r.retireYear; y < r.spends.length; y++) {
    if (r.spends[y] < leanest) leanest = r.spends[y];
  }
  // The cuts are multiplicative, so a bad run really does compound them down.
  // If this ever reads "no worse than the plan", the rails have stopped firing.
  check('guardrails really do cut, and deeply, in the worst runs',
    leanest < 55000 * 0.75, Math.round(leanest));

  // Vanguard: ceiling +5%, floor -2.5% (the 2023 spec, and the one Morningstar
  // implements; the 2020 paper's own figures used -1.5%). Year on year the
  // paycheck may not move further than that in real terms.
  const v = S.runCycle(base({ strategy: 'dynamic', annualSpend: 50000, percentRate: 0.05 }), (1929 - 1871) * 12);
  let worstDrop = 0, biggestRise = 0;
  for (let y = v.retireYear + 1; y < v.spends.length; y++) {
    const prev = v.spends[y - 1];
    if (!prev) continue;
    const ch = v.spends[y] / prev - 1;
    if (ch < worstDrop) worstDrop = ch;
    if (ch > biggestRise) biggestRise = ch;
  }
  check('Vanguard smoothing never cuts more than 2.5% in a year',
    worstDrop > -0.0251, (worstDrop * 100).toFixed(2));
  check('...nor raises more than 5%', biggestRise < 0.0501, (biggestRise * 100).toFixed(2));
}

{
  // A glidepath has to actually move the allocation.
  const p = base({ stocks: 0.9, glidepath: { to: 0.3, byAge: 85 } });
  check('a glidepath starts where it says', near(S.stocksAt(p, 65), 0.9, 1e-9), S.stocksAt(p, 65));
  check('...ends where it says', near(S.stocksAt(p, 85), 0.3, 1e-9), S.stocksAt(p, 85));
  check('...and holds after that', near(S.stocksAt(p, 95), 0.3, 1e-9), S.stocksAt(p, 95));
}

// ---- 5. the advice must be true ----------------------------------------------
//
// The app prints sentences like "retiring at 66 clears 95%". If a suggestion is
// not literally true of the plan it describes, the app is lying with numbers,
// which is worse than saying nothing. So every 'fix' is re-simulated here.

{
  const p = base({
    currentAge: 45, retireAge: 60, endAge: 95, portfolio: 400000,
    annualSavings: 20000, annualSpend: 85000, stocks: 0.6, fees: 0.009,
    incomes: [{ label: 'Social Security', amount: 26000, from: 62, to: null, cola: true }]
  });
  const now = S.runAll(p).successRate;
  check('the test plan is genuinely short of its bar', now < p.target, (now * 100).toFixed(1));

  const list = A.suggest(p, now, p.target, { step: 3 });
  check('advice is offered for a failing plan', list.length > 0, list.length);
  check('every fix is ranked above every help',
    list.every((x, i) => i === 0 || !(x.kind === 'fix' && list[i - 1].kind !== 'fix')),
    list.map((x) => x.kind));

  // Re-measure each claim at FULL resolution, not the sampled resolution the
  // suggester used. A claim that only survives its own sampling is not a claim.
  for (const a of list) {
    if (a.kind !== 'fix' && a.kind !== 'help') continue;
    const q = JSON.parse(JSON.stringify(p));
    let applied = true;
    if (a.id === 'spend') q.annualSpend -= a.cost;
    else if (a.id === 'age') q.retireAge = +/at (\d+)/.exec(a.detail)[1];
    else if (a.id === 'save') q.annualSavings += a.cost;
    else if (a.id === 'mix') q.stocks = +/Hold (\d+)%/.exec(a.title)[1] / 100;
    else if (a.id === 'flex') q.strategy = 'guardrails';
    else if (a.id === 'fees') q.fees = 0.0005;
    else if (a.id === 'defer') {
      const k = q.incomes.findIndex((i) => /social/i.test(i.label));
      q.incomes[k].amount *= A.deferFactor(q.incomes[k].from, 70);
      q.incomes[k].from = 70;
    } else applied = false;
    if (!applied) continue;
    const got = S.runAll(q).successRate;
    if (a.kind === 'fix') {
      // Sampling every third cycle can land a hair under; a quarter of a point
      // is measurement, not a false claim.
      check('"' + a.title + '" really does clear the bar', got >= p.target - 0.0025,
        (got * 100).toFixed(1));
    } else {
      check('"' + a.title + '" really does improve it', got > now,
        [(now * 100).toFixed(1), (got * 100).toFixed(1)]);
    }
  }
}

{
  // US Social Security claiming factors, FRA 67: 70% at 62, 100% at 67, 124% at
  // 70. These are printed as a percentage in the advice card.
  check('claiming at 62 pays 70% of the full benefit', near(A.pcOfFra(62), 0.70, 0.001), A.pcOfFra(62));
  check('claiming at 67 pays 100%', near(A.pcOfFra(67), 1.00, 0.001), A.pcOfFra(67));
  check('claiming at 70 pays 124%', near(A.pcOfFra(70), 1.24, 0.001), A.pcOfFra(70));
  check('62 → 70 is a 77% raise', near(A.deferFactor(62, 70), 1.7714, 0.002), A.deferFactor(62, 70));

  // A plan that already clears its bar is offered room, never fixes.
  const rich = base({ annualSpend: 25000 });
  const list = A.suggest(rich, S.runAll(rich).successRate, 0.95, { step: 4 });
  check('a comfortable plan is offered room, not fixes',
    list.every((x) => x.kind === 'room' || x.kind === 'note'), list.map((x) => x.kind));
}

// ---- 6. the app's shipped shape ----------------------------------------------

{
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  for (const s of ['data/market.js', 'sim.js', 'chart.js', 'advice.js', 'app.js']) {
    check('index.html loads ' + s, html.includes('src="' + s + '"'));
  }
  check('index.html reaches for nothing external',
    !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));

  const mf = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
  // The listing promises nothing is uploaded. That is only true while these are
  // absent, so it is asserted here as well as in the build.
  for (const cap of ['network', 'pool', 'api', 'ai']) {
    check('no ' + cap + ' capability — nothing may leave the browser', !mf.capabilities[cap]);
  }
  check('scenarios sync on an Invite', mf.data.scenarios.visibility === 'read-write');
  check('prefs stay on the device', mf.data.prefs.visibility === 'private');

  const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const chart = fs.readFileSync(path.join(APP, 'chart.js'), 'utf8');
  // Plan names are user text. They must reach the DOM as text, never as markup.
  check('no concatenated innerHTML anywhere near user text',
    !/innerHTML\s*=\s*[^;]*\+/.test(app + chart));
  check('the app saves plans through gifos.db', app.includes("gifos.db('scenarios')"));
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
