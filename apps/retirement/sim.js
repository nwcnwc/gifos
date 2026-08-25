/* sim.js — the whole retirement engine. No DOM, no globals but RetireSim.
 *
 * EVERYTHING IN THIS FILE IS IN TODAY'S DOLLARS.
 *
 * That is not a display choice, it is the reason the arithmetic is simple.
 * MARKET.stock and MARKET.bond are Shiller's REAL total-return indices, so
 * inflation is already out of them. A salary of $80,000 and a spend of $60,000
 * are therefore the same numbers in year 1 and year 40 — no escalation, no
 * compounding two inflation series against each other, no "is this nominal?"
 * anywhere. The one thing that genuinely is nominal — a pension with no
 * cost-of-living adjustment — is handled by DIVIDING it down with CPI, which is
 * the honest direction and the one most calculators skip.
 *
 * A run is monthly. Two sleeves (stocks, bonds) grow on their own real series,
 * money moves at the START of the month, and the sleeves rebalance to target
 * once a year. Monthly matters: sequence-of-returns risk is the thing that
 * decides a retirement, and annual steps smooth away exactly the part that
 * hurts.
 */
(function (root) {
  'use strict';

  function data() {
    var M = root.MARKET;
    if (!M) throw new Error('market data is not loaded');
    return M;
  }

  // ---- helpers --------------------------------------------------------------

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  function monthLabel(i) {
    var M = data();
    var y = M.start[0] + Math.floor((M.start[1] - 1 + i) / 12);
    var m = ((M.start[1] - 1 + i) % 12) + 1;
    return { year: y, month: m };
  }

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function monthName(i) {
    var d = monthLabel(i);
    return MONTH_NAMES[d.month - 1] + ' ' + d.year;
  }

  // Allocation at a given age. A glidepath is a straight line from `stocks` at
  // the plan's start age to `to` at `byAge`, then flat — the shape every
  // target-date fund actually uses, and the one Bengen and Kitces argue over.
  function stocksAt(plan, age) {
    var g = plan.glidepath;
    if (!g || !isFinite(g.to)) return clamp(plan.stocks, 0, 1);
    var a0 = plan.currentAge, a1 = g.byAge;
    if (!(a1 > a0)) return clamp(g.to, 0, 1);
    var t = clamp((age - a0) / (a1 - a0), 0, 1);
    return clamp(plan.stocks + (g.to - plan.stocks) * t, 0, 1);
  }

  // ---- withdrawal strategies -------------------------------------------------
  //
  // Each returns the REAL dollars to withdraw over the coming year. `st` is the
  // strategy's own scratch state, carried across the years of one cycle.
  //
  //   base      what the plan asks to spend, today's dollars
  //   balance   portfolio at the start of this retirement year
  //   year      0-based year of retirement
  //   left      years of retirement still to come, including this one
  //   infl      this year's inflation, as a ratio (1.03 = 3%)
  //
  // `selfLimiting` marks a strategy whose paycheck is DERIVED from the balance,
  // so it can never ask for more than is there. Those are judged on the paycheck
  // they pay, never on a success rate: reporting "48% failed" for a method whose
  // entire contract is "spend what you have" measures the contract, not the plan.

  var STRATEGIES = {
    // The 4% rule as Bengen and the Trinity Study actually define it: set the
    // number once, then never change it in real terms again.
    constant: {
      label: 'Steady paycheck',
      blurb: 'Spend the same amount every year, adjusted for inflation. The classic 4% rule.',
      step: function (st, ctx) { return ctx.base; }
    },

    // A fixed percentage of whatever is left. Mathematically cannot fail — and
    // that is exactly its problem, so the app reports the SPENDING it produces
    // rather than a success rate.
    percent: {
      label: 'Fixed percentage',
      selfLimiting: true,
      blurb: 'Take the same percentage of the balance every year. Never runs out, but the paycheck swings with the market.',
      step: function (st, ctx) {
        return ctx.balance * (ctx.plan.percentRate || 0.04);
      }
    },

    // Guyton-Klinger guardrails, as the 2006 paper actually publishes them
    // (Guyton & Klinger, Journal of Financial Planning, March 2006):
    //
    //   Withdrawal Rule       no raise in a year the portfolio lost money AND
    //                         the current rate is above the initial rate. BOTH
    //                         conditions — the 2004 version had only the first
    //                         and froze about 60% more often.
    //   Capital Preservation  rate has risen >20% above initial -> cut 10%.
    //                         Switched off over the last 15 years: there is
    //                         nothing left to preserve the capital for.
    //   Prosperity            rate has fallen >20% below initial -> raise 10%.
    //                         Deliberately does NOT expire; the asymmetry is
    //                         the point.
    //
    // The 6%-a-year INFLATION CAP is deliberately absent. Every popular write-up
    // presents it as one of the four rules, but the authors dropped it: removing
    // it "increased the purchasing power maintained by more than 10 percent
    // without reducing the probability of success", and their published 5.2-5.6%
    // results do not use it.
    //
    // In real terms "no raise" IS a cut, by exactly that year's inflation, which
    // is why this rule needs CPI when nothing else here does.
    guardrails: {
      label: 'Guardrails',
      blurb: 'Spend steadily, but trim 10% after a bad run and give yourself a 10% raise after a good one. What most people would actually do.',
      step: function (st, ctx) {
        if (st.w === undefined) { st.w = ctx.base; st.initialRate = ctx.base / ctx.balance; return st.w; }
        var w = st.w;
        var rate = w / ctx.balance;
        // Withdrawal Rule first — it modifies the raise, not the rails.
        if (ctx.lastReturn < 0 && rate > st.initialRate) w = w / ctx.infl;
        var lastYears = ctx.left <= 15;
        if (!lastYears && rate > st.initialRate * 1.2) w = w * 0.9;
        else if (rate < st.initialRate * 0.8) w = w * 1.1;
        st.w = w;
        return w;
      }
    },

    // Vanguard's dynamic spending (Jaconetti et al. 2020): aim at a percentage
    // of the balance, but cap how far the PAYCHECK may move against last year.
    //
    // Ceiling +5%, floor -2.5%.
    //
    // Vanguard has published this rule twice with two different floors, and it
    // is worth being explicit about which one this is. The 2020 paper's body
    // text and the figures its success rates are computed from use -1.5%; an
    // appendix of the same paper, the consumer flyer, and the 2023 white paper
    // all say -2.5%. Morningstar's 2025 implementation uses -2.5%. So -2.5% is
    // the current published spec and the one a reader comparing against another
    // tool will meet, and it is what this uses.
    //
    // The asymmetry is deliberate either way — Vanguard's own footnote observes
    // that a ceiling higher than the floor suits loss aversion.
    dynamic: {
      label: 'Smoothed',
      blurb: 'Follow the portfolio, but cap any raise at 5% and any cut at 2.5% a year. Vanguard\'s ceiling-and-floor method.',
      step: function (st, ctx) {
        var target = ctx.balance * (ctx.plan.percentRate || 0.04);
        if (st.w === undefined) { st.w = ctx.base; return st.w; }
        st.w = clamp(target, st.w * 0.975, st.w * 1.05);
        return st.w;
      }
    },

    // Bogleheads' Variable Percentage Withdrawal, reproducing the published
    // table rather than approximating it:
    //
    //   r    = stocks * 5.0% + bonds * 1.9%     (real, blended on the RETURN)
    //   n    = 100 - age                        (the table depletes at 100)
    //   pct  = PMT(r, n, -1, 0, type=1)         (ANNUITY-DUE — you withdraw at
    //          = [r / (1-(1+r)^-n)] / (1+r)      the START of the year)
    //
    // The annuity-due form is what pins the table: an ordinary annuity misses
    // the published percentages by an order of magnitude more. The percentage
    // is capped at 10%, which starts binding around age 88.
    vpw: {
      label: 'Spend it down',
      selfLimiting: true,
      blurb: 'Each year, take what would exactly use the money up by 100. Nothing runs out early, and nothing is left over.',
      step: function (st, ctx) {
        var alloc = stocksAt(ctx.plan, ctx.plan.currentAge + ctx.yearIndex);
        var r = alloc * 0.05 + (1 - alloc) * 0.019;
        var n = Math.max(1, Math.min(100 - (ctx.plan.currentAge + ctx.yearIndex), ctx.left));
        var pct = Math.abs(r) < 1e-9
          ? 1 / n
          : (r / (1 - Math.pow(1 + r, -n))) / (1 + r);
        return ctx.balance * Math.min(0.10, pct);
      }
    }
  };

  // ---- cash flows ------------------------------------------------------------
  //
  // Income streams (Social Security, a pension, a rental) and one-off events (a
  // house sale, a wedding, a roof). Both are given in today's dollars; a stream
  // marked cola:false is a NOMINAL promise and is deflated by real CPI as the
  // cycle runs, which is the whole reason a fixed pension is worth less than it
  // looks 25 years in.

  function activeAt(inc, age) {
    if (!inc || !isFinite(inc.amount) || !inc.amount) return false;
    if (age + 1e-9 < inc.from) return false;
    if (inc.to !== null && inc.to !== undefined && isFinite(inc.to) && age >= inc.to - 1e-9) return false;
    return true;
  }

  /* The parts of a plan that do not depend on WHICH stretch of history we are
   * running. Built once per sweep, read by every cycle.
   *
   * This is the difference between a calculator that answers while you type and
   * one that spins: an inflation-linked income and a one-off house sale are the
   * same in 1871 as in 1994, so walking the user's list of them 543,000 times —
   * once per month per cycle — is work that was already done.
   */
  function schedule(plan) {
    var years = Math.max(1, Math.round(plan.endAge - plan.currentAge));
    var months = years * 12;
    var cola = new Float64Array(months);        // real income, per month
    var lumps = new Float64Array(years);        // one-offs, at the year's start
    var nominal = [];                           // needs CPI, so needs the cycle
    var list = plan.incomes || [];
    var i, m;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].cola === false) nominal.push(list[i]);
    }
    for (m = 0; m < months; m++) {
      var age = plan.currentAge + m / 12;
      var t = 0;
      for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].cola === false) continue;
        if (activeAt(list[i], age)) t += list[i].amount;
      }
      cola[m] = t / 12;
    }
    var ev = plan.events || [];
    for (i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (!e || !isFinite(e.amount) || !e.amount) continue;
      var y = Math.floor(e.at - plan.currentAge + 1e-9);
      if (y >= 0 && y < years) lumps[y] += e.amount;
    }
    return { cola: cola, lumps: lumps, nominal: nominal, months: months, years: years };
  }

  // ---- one cycle -------------------------------------------------------------

  /* Run the plan against the stretch of history beginning at market month
   * `startIdx`. Returns the year-by-year story of that one retirement.
   *
   * `series` lets a caller substitute a resampled history (see bootstrap) —
   * { stock: [...], bond: [...], cpi: [...] } of at least `months` + 1 entries,
   * indexed from 0. When absent the real record is used from startIdx.
   */
  function runCycle(plan, startIdx, series, sched) {
    var M = data();
    var stock = series ? series.stock : M.stock;
    var bond = series ? series.bond : M.bond;
    var cpi = series ? series.cpi : M.cpi;
    var off = series ? 0 : startIdx;
    if (!sched) sched = schedule(plan);

    var years = sched.years;
    var retireYear = clamp(Math.round(plan.retireAge - plan.currentAge), 0, years);

    var strat = STRATEGIES[plan.strategy] || STRATEGIES.constant;
    var selfLimiting = !!strat.selfLimiting;
    var st = {};

    var alloc = stocksAt(plan, plan.currentAge);
    var s = plan.portfolio * alloc;
    var b = plan.portfolio * (1 - alloc);
    var fee = 1 - (plan.fees || 0) / 12;
    var glide = plan.glidepath && isFinite(plan.glidepath.to);

    var balances = new Array(years + 1);
    var spends = new Array(years);
    var incomes = new Array(years);
    var contribs = new Array(years);
    var withdrawn = new Array(years);   // what actually came OUT of the portfolio

    var cola = sched.cola, lumps = sched.lumps, nominal = sched.nominal;
    var nNom = nominal.length;
    var cpi0 = cpi[off];

    var failedAt = -1;
    var shortfall = 0;
    var lowest = Infinity;
    var lastReturn = 0;
    var w = 0;
    var yearlySavings = Math.max(0, plan.annualSavings || 0);

    for (var y = 0; y < years; y++) {
      var age = plan.currentAge + y;
      var bal = s + b;
      balances[y] = bal;
      if (bal < lowest) lowest = bal;

      var retired = y >= retireYear;

      // This year's paycheck decision, made once, at the start of the year.
      if (retired) {
        w = Math.max(0, strat.step(st, {
          plan: plan, base: plan.annualSpend, balance: bal, year: y - retireYear,
          yearIndex: y,
          left: years - y, infl: cpi[off + y * 12 + 12] / cpi[off + y * 12],
          lastReturn: lastReturn
        }));
      } else {
        w = 0;
      }

      var contribM = retired ? 0 : yearlySavings / 12;
      var inc = 0, spent = 0, taken = 0;
      var need = w / 12;

      // A one-off lands at the start of its year: a house sale, a new roof.
      var lump = lumps[y];
      if (lump) {
        var a0 = s + b > 0 ? s / (s + b) : stocksAt(plan, age);
        s += lump * a0; b += lump * (1 - a0);
        if (s < 0) { b += s; s = 0; }
        if (b < 0) { s += b; b = 0; }
      }

      var tgtNow = glide ? stocksAt(plan, age) : alloc;

      for (var m = 0; m < 12; m++) {
        var i = off + y * 12 + m;

        var mIncome = cola[y * 12 + m];
        // A pension with no cost-of-living clause is a NOMINAL promise: what it
        // buys shrinks with every year of inflation. Deflating it here is the
        // only place CPI enters a plan that is otherwise entirely in real terms.
        if (nNom) {
          var defl = cpi0 / cpi[i];
          for (var q = 0; q < nNom; q++) {
            if (activeAt(nominal[q], age + m / 12)) mIncome += nominal[q].amount * defl / 12;
          }
        }

        inc += mIncome;

        var fromPortfolio = need - mIncome;
        var net;
        if (fromPortfolio > 0) {
          var avail = s + b;
          if (fromPortfolio > avail) {
            fromPortfolio = avail > 0 ? avail : 0;
            // The portfolio could not pay the paycheck the plan asked for.
            // THAT is what running out means — not "the balance touched zero",
            // which a spend-it-down strategy does on purpose in its final month.
            if (!selfLimiting) {
              shortfall += need - mIncome - fromPortfolio;
              if (failedAt < 0) failedAt = age + m / 12;
            }
          }
          taken += fromPortfolio;
        }
        net = contribM - fromPortfolio;
        // What the retiree actually got to spend this month, which is not what
        // the plan asked for once the money has run out.
        if (retired) spent += mIncome < need ? mIncome + fromPortfolio : need;

        if (net !== 0) {
          var bal0 = s + b;
          var a = bal0 > 0 ? s / bal0 : tgtNow;
          s += net * a; b += net * (1 - a);
          if (s < 0) { b += s; s = 0; }
          if (b < 0) { s += b; b = 0; }
        }

        s = s * (stock[i + 1] / stock[i]) * fee;
        b = b * (bond[i + 1] / bond[i]) * fee;
        var now = s + b;
        if (now < lowest) lowest = now;
      }

      lastReturn = balances[y] > 0 ? (s + b + taken - contribM * 12) / balances[y] - 1 : 0;

      // Rebalance to the glidepath's target for the age just reached.
      var tot = s + b;
      var tgt = glide ? stocksAt(plan, age + 1) : alloc;
      s = tot * tgt; b = tot * (1 - tgt);

      spends[y] = retired ? spent : 0;
      incomes[y] = inc;
      contribs[y] = contribM * 12;
      withdrawn[y] = taken;
    }

    balances[years] = s + b;
    if (balances[years] < lowest) lowest = balances[years];

    return {
      startIdx: startIdx,
      startLabel: series ? null : monthName(startIdx),
      balances: balances,
      spends: spends,
      incomes: incomes,
      contribs: contribs,
      withdrawn: withdrawn,
      // A dollar of shortfall over a whole retirement is arithmetic noise, not
      // a ruined life. One month's grocery money is the smallest thing worth
      // calling a failure.
      failed: shortfall > 100,
      shortfall: shortfall,
      failAge: shortfall > 100 ? failedAt : -1,
      lowest: lowest,
      final: balances[years],
      years: years,
      retireYear: retireYear
    };
  }

  // ---- every cycle history offers -------------------------------------------

  function cycleStarts(plan) {
    var M = data();
    var years = Math.max(1, Math.round(plan.endAge - plan.currentAge));
    var need = years * 12 + 1;
    var n = M.months - need + 1;
    return n > 0 ? n : 0;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    var i = (sorted.length - 1) * p;
    var lo = Math.floor(i), hi = Math.ceil(i);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  var BANDS = [0.05, 0.25, 0.5, 0.75, 0.95];

  /* Run the plan against every stretch of history long enough to hold it. */
  function runAll(plan, opts) {
    opts = opts || {};
    var n = cycleStarts(plan);
    var runs = [];
    var step = opts.step || 1;
    var sched = opts.sched || schedule(plan);
    for (var i = 0; i < n; i += step) runs.push(runCycle(plan, i, null, sched));
    return summarise(plan, runs, { kind: 'history', starts: n });
  }

  /* Success alone, with none of the bookkeeping a chart needs. The solvers call
   * this hundreds of times, so it counts failures and returns a number.
   */
  function successRate(plan, opts) {
    opts = opts || {};
    if (opts.mode === 'bootstrap') {
      var o = bootstrap(plan, opts);
      return o.cycles ? o.successRate : 0;
    }
    var n = cycleStarts(plan);
    if (!n) return 0;
    var step = opts.step || 1;
    var sched = opts.sched || schedule(plan);
    var runs = 0, bad = 0;
    for (var i = 0; i < n; i += step) {
      runs++;
      if (runCycle(plan, i, null, sched).failed) bad++;
    }
    return runs ? 1 - bad / runs : 0;
  }

  /* History, in a different order.
   *
   * The honest complaint about backtesting is that 155 years only contains
   * about a hundred non-overlapping retirements, and every one of them is the
   * same century in the same order. A BLOCK bootstrap answers it without
   * inventing a bell curve: draw whole `block`-year runs of real months at
   * random and staple them together. Crashes, recoveries and the correlation
   * between stocks and bonds all survive inside a block; only the order of the
   * decades is new.
   *
   * Seeded, so the same plan always draws the same paths — a number that moves
   * when you have not touched anything is not an insight.
   */
  function bootstrap(plan, opts) {
    opts = opts || {};
    var M = data();
    var paths = opts.paths || 1000;
    var block = (opts.block || 5) * 12;
    var years = Math.max(1, Math.round(plan.endAge - plan.currentAge));
    var need = years * 12 + 1;
    var maxStart = M.months - block;
    if (maxStart < 1) return summarise(plan, [], { kind: 'bootstrap', starts: 0 });

    var seed = opts.seed === undefined ? 20260825 : opts.seed;
    var rnd = mulberry(seed);

    var runs = [];
    var sched = opts.sched || schedule(plan);
    var stock = new Float64Array(need + block);
    var bond = new Float64Array(need + block);
    var cpi = new Float64Array(need + block);
    var series = { stock: stock, bond: bond, cpi: cpi };

    for (var p = 0; p < paths; p++) {
      stock[0] = 1; bond[0] = 1; cpi[0] = 1;
      var k = 0;
      while (k < need) {
        var s0 = Math.floor(rnd() * maxStart);
        for (var j = 0; j < block && k < need + block - 1; j++, k++) {
          var a = s0 + j;
          stock[k + 1] = stock[k] * (M.stock[a + 1] / M.stock[a]);
          bond[k + 1] = bond[k] * (M.bond[a + 1] / M.bond[a]);
          cpi[k + 1] = cpi[k] * (M.cpi[a + 1] / M.cpi[a]);
        }
      }
      runs.push(runCycle(plan, 0, series, sched));
    }
    return summarise(plan, runs, { kind: 'bootstrap', starts: paths, block: opts.block || 5 });
  }

  // Small, fast, seeded PRNG (Mulberry32). Deterministic across engines.
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function summarise(plan, runs, meta) {
    var years = Math.max(1, Math.round(plan.endAge - plan.currentAge));
    var out = {
      kind: meta.kind,
      cycles: runs.length,
      starts: meta.starts,
      block: meta.block,
      years: years,
      retireYear: clamp(Math.round(plan.retireAge - plan.currentAge), 0, years),
      runs: runs,
      bandLevels: BANDS
    };
    if (!runs.length) {
      out.successRate = 0; out.bands = []; out.spendBands = [];
      out.worst = null; out.best = null; out.median = null;
      return out;
    }

    var failures = 0, firstFail = null;
    for (var i = 0; i < runs.length; i++) if (runs[i].failed) {
      failures++;
      if (!firstFail || runs[i].failAge < firstFail.failAge) firstFail = runs[i];
    }
    out.successRate = 1 - failures / runs.length;
    out.failures = failures;

    // Bands of BALANCE and of SPENDING, year by year.
    var bands = new Array(years + 1);
    var spendBands = new Array(years);
    var col = new Array(runs.length);
    var y, r;
    for (y = 0; y <= years; y++) {
      for (r = 0; r < runs.length; r++) col[r] = runs[r].balances[y];
      col.sort(function (a, b) { return a - b; });
      bands[y] = BANDS.map(function (p) { return percentile(col, p); });
    }
    for (y = 0; y < years; y++) {
      for (r = 0; r < runs.length; r++) col[r] = runs[r].spends[y];
      col.sort(function (a, b) { return a - b; });
      spendBands[y] = BANDS.map(function (p) { return percentile(col, p); });
    }
    out.bands = bands;
    out.spendBands = spendBands;

    // The worst run is the one that ran dry EARLIEST; if none did, the one that
    // ended with least. "Worst" must mean the thing a reader fears, not the
    // smallest final number in a set where nothing failed.
    var worst = runs[0], best = runs[0];
    for (i = 1; i < runs.length; i++) {
      var a = runs[i];
      if (a.failed && !worst.failed) worst = a;
      else if (a.failed === worst.failed) {
        if (worst.failed ? a.failAge < worst.failAge : a.final < worst.final) worst = a;
      }
      if (a.final > best.final) best = a;
    }
    out.worst = worst;
    out.best = best;
    out.firstFail = firstFail;

    /* How many runs ended with MORE, in real terms, than they retired with.
     *
     * This is the counterweight to the success rate, and it is the number most
     * calculators never print. Over 30 years at 4% the majority of historical
     * cohorts finished richer than they started — so for most readers the live
     * risk is not running out, it is dying with a pile they could have spent
     * and a decade they could have had. A tool that reports only failure
     * silently argues for underspending. */
    var atRetire = runs[0].balances[out.retireYear] || 0;
    var richer = 0, doubled = 0;
    for (i = 0; i < runs.length; i++) {
      var start = runs[i].balances[out.retireYear];
      if (runs[i].final > start) richer++;
      if (runs[i].final > start * 2) doubled++;
    }
    out.endedRicher = richer / runs.length;
    out.endedDoubled = doubled / runs.length;
    void atRetire;

    var finals = runs.map(function (a) { return a.final; }).sort(function (a, b) { return a - b; });
    out.medianFinal = percentile(finals, 0.5);
    out.p10Final = percentile(finals, 0.1);
    out.p90Final = percentile(finals, 0.9);

    // The run whose ending is nearest the median — a real, nameable retirement
    // to point at, not an average of a hundred that never happened.
    var target = out.medianFinal, med = runs[0], bestD = Infinity;
    for (i = 0; i < runs.length; i++) {
      var d = Math.abs(runs[i].final - target);
      if (d < bestD) { bestD = d; med = runs[i]; }
    }
    out.median = med;

    // Total real spending delivered, median across cycles — the number that
    // decides between two plans once both of them "succeed".
    var totals = runs.map(function (a) {
      var t = 0; for (var k = 0; k < a.spends.length; k++) t += a.spends[k]; return t;
    }).sort(function (a, b) { return a - b; });
    out.medianTotalSpend = percentile(totals, 0.5);

    return out;
  }

  // ---- the two questions people actually arrive with -------------------------

  /* "How much can I spend?" — the largest steady, inflation-adjusted paycheck
   * whose success rate still clears `target`. Bisection, because the answer is
   * monotonic in spending and a reader should not have to guess-and-check.
   *
   * Bisection halves the bracket every pass, so the iteration count IS the
   * precision: 16 passes on a $200,000 ceiling land inside $4. Stopping at the
   * nearest $100 instead of the nearest cent is not a shortcut — a retirement
   * plan quoted to the penny is lying about how much it knows.
   */
  function solveSpend(plan, target, opts) {
    opts = opts || {};
    target = target === undefined ? 0.95 : target;
    var sched = opts.sched || schedule(plan);
    var p = assign({}, plan);
    var o = assign({}, opts); o.sched = sched;
    var probe = function (v) { p.annualSpend = v; return successRate(p, o); };

    var lo = 0;
    var hi = Math.max(plan.annualSpend * 2, 20000);
    // Push the ceiling up until it actually fails, so the bracket is real.
    var guard = 0;
    while (probe(hi) >= target && guard++ < 20) { lo = hi; hi *= 2; }
    if (guard >= 20) return hi;
    var iters = opts.iters || 16;
    for (var i = 0; i < iters; i++) {
      var mid = (lo + hi) / 2;
      if (probe(mid) >= target) lo = mid; else hi = mid;
    }
    return lo;
  }

  /* "When can I retire?" — the earliest whole age at which the plan clears
   * `target`. Scanned upward from today, because ages are integers, the range
   * is short, and a scan cannot land between two answers the way a bisection on
   * a step function can. (Success is NOT reliably monotonic in retirement age:
   * retiring later shortens retirement but also shortens the run of history the
   * cycle sees, and a plan can flicker at the boundary.)
   */
  function solveRetireAge(plan, target, opts) {
    opts = opts || {};
    target = target === undefined ? 0.95 : target;
    var sched = opts.sched || schedule(plan);
    var p = assign({}, plan);
    var o = assign({}, opts); o.sched = sched;
    var last = Math.min(Math.floor(plan.endAge) - 1, Math.ceil(plan.currentAge) + 60);
    for (var age = Math.ceil(plan.currentAge); age <= last; age++) {
      p.retireAge = age;
      if (successRate(p, o) >= target) return age;
    }
    return null;
  }

  /* The whole spending curve in one pass: success rate against a ladder of
   * paycheck sizes. This is what turns "will it work?" into "here is the price
   * of certainty" — one chart instead of a hundred re-runs by hand.
   */
  function spendCurve(plan, opts) {
    opts = opts || {};
    var n = opts.points || 24;
    var hi = opts.max || Math.max(plan.annualSpend * 2, 20000);
    var sched = opts.sched || schedule(plan);
    var p = assign({}, plan);
    var o = assign({}, opts); o.sched = sched;
    var pts = [];
    for (var i = 1; i <= n; i++) {
      p.annualSpend = hi * i / n;
      pts.push({ spend: p.annualSpend, success: successRate(p, o) });
    }
    return pts;
  }

  function assign(a, b) {
    for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k];
    return a;
  }

  // ---- accumulation arithmetic, for the copy the app writes -----------------

  /* Mr Money Mustache's "shockingly simple math", made exact: with a real
   * return r and a savings RATE s of take-home pay, the years to a portfolio
   * that covers spending at withdrawal rate w. Independent of income — which is
   * the surprising part, and worth saying on screen.
   */
  function yearsToFI(savingsRate, realReturn, withdrawalRate, startMultiple) {
    var s = clamp(savingsRate, 1e-6, 0.999999);
    var r = realReturn, w = withdrawalRate || 0.04;
    var target = (1 - s) / w;                  // multiples of income
    var have = startMultiple || 0;
    if (have >= target) return 0;
    if (Math.abs(r) < 1e-9) return (target - have) / s;
    var v = (target * r + s) / (have * r + s);
    if (v <= 0) return Infinity;
    return Math.log(v) / Math.log(1 + r);
  }

  /* Coast FI: the pile that, left completely alone at `realReturn`, grows into
   * `target` by `atAge`. Past this line, saving another dollar is optional.
   */
  function coastNumber(target, years, realReturn) {
    return target / Math.pow(1 + (realReturn || 0.05), Math.max(0, years));
  }

  // ---- what history says about where we are standing -------------------------

  /* ---- how likely you are to still be here -------------------------------
   *
   * The counterweight to every number above it. A retirement plan asks "will
   * the money last to 95?" while quietly declining to mention that a 65-year-old
   * man has a 24% chance of seeing 90 at all. Both facts belong on the same
   * screen, because a 5% chance of running out at 92 reads very differently
   * beside a 76% chance of not being there.
   *
   * who: 'm' | 'f' | 'couple' (a couple is the probability EITHER is alive —
   * the money has to last as long as the longest-lived of them, which is the
   * whole reason couples plan longer than individuals).
   */
  function survival(fromAge, toAge, who) {
    var L = root.MORTALITY;
    if (!L) return null;
    var lo = Math.max(L.from, Math.round(fromAge));
    var hi = Math.round(toAge);
    var last = L.from + L.m.length - 1;
    if (hi <= lo) return 1;
    if (hi > last) return 0;
    var one = function (a) {
      return a[hi - L.from] / a[lo - L.from];
    };
    if (who === 'm') return one(L.m);
    if (who === 'f') return one(L.f);
    var sm = one(L.m), sf = one(L.f);
    return 1 - (1 - sm) * (1 - sf);          // at least one still here
  }

  /* Each year of the plan resolved into the four states a person can actually
   * be in, as fractions of 1. They always sum to 1, which is what makes this
   * readable as a picture rather than four charts.
   */
  function outcomeStates(plan, result, who) {
    var years = result.years;
    var out = [];
    var runs = result.runs;
    var retireYear = result.retireYear;
    // From RETIREMENT onward only. "Rich, broke, or gone" has no meaning while
    // you are still working — and worse, the comparison is against the balance
    // AT retirement, so every pre-retirement year scores as 'less than you
    // retired with' and the chart opens on a wall of the wrong colour.
    for (var y = retireYear; y <= years; y++) {
      var age = plan.currentAge + y;
      var alive = survival(plan.currentAge, age, who);
      if (alive === null) alive = 1;
      var broke = 0, under = 0, over = 0;
      for (var i = 0; i < runs.length; i++) {
        var bal = runs[i].balances[y];
        var start = runs[i].balances[retireYear];
        if (bal <= 0 || (runs[i].failed && age >= runs[i].failAge)) broke++;
        else if (bal < start) under++;
        else over++;
      }
      var n = runs.length || 1;
      out.push({
        age: age,
        dead: 1 - alive,
        broke: alive * broke / n,
        under: alive * under / n,
        over: alive * over / n
      });
    }
    return out;
  }

  function latestCape() {
    var M = data();
    for (var i = M.cape.length - 1; i >= 0; i--) if (M.cape[i] !== null) {
      return { cape: M.cape[i], at: monthName(i) };
    }
    return null;
  }

  root.RetireSim = {
    STRATEGIES: STRATEGIES,
    schedule: schedule,
    successRate: successRate,
    stocksAt: stocksAt,
    runCycle: runCycle,
    runAll: runAll,
    bootstrap: bootstrap,
    cycleStarts: cycleStarts,
    solveSpend: solveSpend,
    solveRetireAge: solveRetireAge,
    spendCurve: spendCurve,
    yearsToFI: yearsToFI,
    coastNumber: coastNumber,
    latestCape: latestCape,
    survival: survival,
    outcomeStates: outcomeStates,
    monthName: monthName,
    percentile: percentile,
    BANDS: BANDS
  };
}(typeof window !== 'undefined' ? window : this));
