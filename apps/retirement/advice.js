/* advice.js — turn the percentage into something to actually do.
 *
 * Every calculator in this category ends the same way: a number, and the reader
 * left to work out what to change. The one tool that ends with an instruction
 * buries it below four graphs. So this file exists to answer the question a
 * percentage provokes — "fine, what do I do about it?" — and to answer it with
 * MEASURED numbers.
 *
 * The rule the whole file is built on: EVERY CLAIM IS SIMULATED, NEVER ASSERTED.
 * "Retire two years later" is only offered after retiring two years later has
 * been run against all of history and the new success rate read off. Nothing
 * here is a rule of thumb, and nothing here is rounded up in the flattering
 * direction. A suggestion that has not been measured is advice, and advice is
 * exactly what this app has no business giving.
 */
(function (root) {
  'use strict';

  var S = root.RetireSim;

  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  function assign(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function round(v, to) { return Math.round(v / to) * to; }

  // A lever is worth showing only if it moves the answer somewhere a reader
  // would notice. Half a percentage point is noise dressed as a finding.
  var MEANINGFUL = 0.02;

  function rate(plan, opts) {
    return S.successRate(plan, opts);
  }

  /* Candidate levers, each measured against the plan as it stands.
   *
   * `now` is the current success rate; `target` is the bar the reader set.
   * Returns a list of { id, title, detail, to, kind, cost } sorted so the
   * cheapest thing that actually clears the bar comes first.
   */
  function suggest(plan, now, target, opts) {
    opts = opts || {};
    // fast = searching; fine = the number that goes in the sentence. Anything
    // asserted on screen is measured against every cycle, not a sample of them.
    var sched = opts.sched || S.schedule(plan);
    var fast = { mode: plan.mode, step: opts.step || 3, paths: 300, sched: sched };
    var fine = { mode: plan.mode, step: 1, paths: 1000, sched: sched };
    var out = [];
    var strat = S.STRATEGIES[plan.strategy] || S.STRATEGIES.constant;

    // A method that cannot run out is not short of anything, so the levers
    // below — all of which buy certainty — have nothing to buy.
    if (strat.selfLimiting) return out;

    var short = now < target;

    // ---- spend less / spend more -------------------------------------------
    // solveSpend settles its own answer at full resolution and returns it
    // already rounded, so it is true as printed.
    var solvedR = S.solveSpend(plan, target, { mode: plan.mode, step: opts.step || 3, iters: 14, sched: sched });
    var gap = solvedR - plan.annualSpend;
    if (Math.abs(gap) >= 500) {
      out.push({
        id: 'spend',
        kind: short ? 'fix' : 'room',
        title: short
          ? 'Spend ' + m(-gap) + ' a year less'
          : 'You could spend ' + m(gap) + ' a year more',
        detail: short
          ? 'Bringing the budget to ' + m(solvedR) + ' is the smallest change that clears '
            + pc(target) + '. That is ' + m(-gap / 12) + ' a month.'
          : 'A budget of ' + m(solvedR) + ' still clears ' + pc(target) + '. That is '
            + m(gap / 12) + ' a month you are not spending.',
        to: target,
        cost: Math.abs(gap)
      });
    }

    // ---- retire later / earlier --------------------------------------------
    if (plan.retireAge > plan.currentAge) {
      var age = S.solveRetireAge(plan, target, { mode: plan.mode, step: 1, sched: sched });
      if (age !== null && age !== plan.retireAge) {
        var yrs = age - plan.retireAge;
        out.push({
          id: 'age',
          kind: yrs > 0 ? 'fix' : 'room',
          title: yrs > 0
            ? 'Work ' + years(yrs) + ' longer'
            : 'You could retire ' + years(-yrs) + ' sooner',
          detail: yrs > 0
            ? 'Retiring at ' + age + ' clears ' + pc(target) + '. Each extra year does the job twice — '
              + 'one more year of saving, one fewer year of spending.'
            : 'Retiring at ' + age + ' still clears ' + pc(target) + '.',
          to: target,
          cost: Math.abs(yrs) * 1000
        });
      }
    }

    // ---- save more ----------------------------------------------------------
    if (short && plan.retireAge > plan.currentAge) {
      var need = solveSavings(plan, target, fine);
      if (need !== null && need > plan.annualSavings) {
        // Round UP. This one is a floor — "save at least this much" — so
        // rounding down would print a number that does not clear the bar.
        var extra = Math.ceil((need - plan.annualSavings) / 100) * 100;
        out.push({
          id: 'save',
          kind: 'fix',
          title: 'Put away ' + m(extra) + ' more a year',
          detail: 'Saving ' + m(plan.annualSavings + extra) + ' a year until ' + plan.retireAge
            + ' clears ' + pc(target) + ' — ' + m(extra / 12) + ' a month more than you are now.',
          to: target,
          cost: extra
        });
      }
    }

    // ---- the mix ------------------------------------------------------------
    var best = null;
    var glided = plan.glidepath && isFinite(plan.glidepath.to);
    for (var s = 0.3; s <= 1.001; s += 0.1) {
      var p = clone(plan);
      p.stocks = Math.round(s * 100) / 100;
      if (Math.abs(p.stocks - plan.stocks) < 0.02) continue;
      var r = rate(p, fast);
      if (!best || r > best.rate) best = { stocks: p.stocks, rate: r };
    }
    if (best) best.rate = rate(assign(clone(plan), { stocks: best.stocks }), fine);
    if (best && best.rate > now + MEANINGFUL) {
      out.push({
        id: 'mix',
        kind: 'fix',
        title: (glided ? 'Start at ' : 'Hold ')
          + Math.round(best.stocks * 100) + '% shares instead of ' + Math.round(plan.stocks * 100) + '%',
        detail: 'That alone moves it from ' + pc(now) + ' to ' + pc(best.rate) + '. '
          + (glided
            ? 'Your glidepath still drifts you down to ' + Math.round(plan.glidepath.to * 100)
              + '% by ' + plan.glidepath.byAge + ' — this changes where the drift STARTS, not where it ends.'
            : best.stocks > plan.stocks
              ? 'Over a retirement this long, the risk that actually bites is inflation outliving a cautious portfolio — not a crash.'
              : 'A calmer mix rides the first ten years better, and the first ten years are the ones that decide it.'),
        to: best.rate,
        cost: 0
      });
    }

    // ---- flexibility --------------------------------------------------------
    // The most valuable lever in the list and the one nobody has to pay for:
    // agreeing in advance to spend less after a bad year.
    if (plan.strategy === 'constant') {
      var g = clone(plan);
      g.strategy = 'guardrails';
      var gr = rate(g, fine);
      if (gr > now + MEANINGFUL) {
        var lean = leanest(g, fast);
        out.push({
          id: 'flex',
          kind: 'fix',
          title: 'Agree now to trim spending after a bad year',
          detail: 'Guardrails — cut 10% after a bad run, take a 10% raise after a good one — '
            + 'moves this from ' + pc(now) + ' to ' + pc(gr) + ' without saving another penny. '
            + (lean !== null && lean > 1000
              ? 'The price is real: in the worst runs the leanest year pays about ' + m(lean) + '.'
              : ''),
          to: gr,
          cost: 0
        });
      }
    }

    // ---- fees ---------------------------------------------------------------
    if (plan.fees > 0.0015) {
      var f = clone(plan);
      f.fees = 0.0005;
      var fr = rate(f, fine);
      var yearsLeft = plan.endAge - plan.currentAge;
      var drag = 1 - Math.pow(1 - (plan.fees - 0.0005), yearsLeft);
      out.push({
        id: 'fees',
        kind: fr > now + MEANINGFUL ? 'fix' : 'note',
        title: 'Pay 0.05% in fees instead of ' + (plan.fees * 100).toFixed(2) + '%',
        detail: 'Over ' + yearsLeft + ' years the difference is about ' + Math.round(drag * 100)
          + '% of everything you own'
          + (fr > now + MEANINGFUL ? ', and it moves this from ' + pc(now) + ' to ' + pc(fr) + '.' : '.')
          + ' It is the only lever here that costs you nothing at all.',
        to: fr,
        cost: 0
      });
    }

    // ---- claim Social Security later ---------------------------------------
    // Deferring is the cheapest inflation-linked annuity anybody is ever
    // offered, and it is the lever people are least likely to have modelled.
    var ss = pickDeferrable(plan);
    if (ss.i >= 0) {
      var d = clone(plan);
      var inc = d.incomes[ss.i];
      var from = inc.from, to2 = 70;
      inc.from = to2;
      inc.amount = inc.amount * deferFactor(from, to2);
      var dr = rate(d, fine);
      if (dr > now + MEANINGFUL) {
        out.push({
          id: 'defer',
          kind: 'fix',
          title: 'Claim ' + (inc.label || 'Social Security') + ' at 70, not ' + from,
          detail: 'Waiting raises the cheque by about ' + Math.round((deferFactor(from, to2) - 1) * 100)
            + '% for life, and it rises with inflation. Living on the portfolio in the gap costs you, '
            + 'and it still moves this from ' + pc(now) + ' to ' + pc(dr) + '.',
          to: dr,
          cost: 0
        });
      }
    }

    /* Order matters more than it looks. A lever that CLEARS the bar and one
     * that merely improves things are different kinds of answer, so they are
     * separated rather than interleaved by size of effect — otherwise the one
     * thing that actually solves the problem ends up fifth, under four near
     * misses, and the reader concludes nothing works.
     *
     * Within each group, free before costly: agreeing to be flexible, fixing a
     * fee, or claiming a pension later cost nothing but a decision, and they
     * deserve to be read before "save $30,000 more a year".
     */
    var RANK = { fix: 0, help: 1, room: 2, note: 3 };
    for (var i = 0; i < out.length; i++) {
      if (out[i].kind === 'fix' && out[i].to < target - 1e-9) out[i].kind = 'help';
    }
    out.sort(function (a, b) {
      if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] - RANK[b.kind];
      if (!a.cost !== !b.cost) return a.cost ? 1 : -1;
      if (a.kind === 'help') return (b.to || 0) - (a.to || 0);   // biggest gain
      return (a.cost || 0) - (b.cost || 0);                      // cheapest fix
    });
    out.clears = out.some(function (x) { return x.kind === 'fix'; });
    return out;
  }

  /* Delayed retirement credits and early-claiming reductions, US Social
   * Security, for someone whose full retirement age is 67: 8% a year for every
   * year past FRA up to 70, 6.67% a year for the first three years before it
   * and 5% a year beyond that. Expressed against the benefit AT `from`.
   */
  function pcOfFra(age) {
    if (age >= 67) return 1 + 0.08 * Math.min(3, age - 67);
    var early = 67 - age;
    return 1 - (0.0667 * Math.min(3, early) + 0.05 * Math.max(0, early - 3));
  }
  function deferFactor(from, to) {
    var a = pcOfFra(clamp(from, 62, 70)), b = pcOfFra(clamp(to, 62, 70));
    return a > 0 ? b / a : 1;
  }

  function pickDeferrable(plan) {
    var list = plan.incomes || [];
    for (var i = 0; i < list.length; i++) {
      var inc = list[i];
      if (!inc || !inc.amount) continue;
      if (inc.cola === false) continue;                 // only the indexed one
      // US rules only. An earlier version matched "State Pension" too and then
      // applied a 67 full-retirement-age and 8%-a-year credits to it — the UK
      // scheme defers at about 5.8% a year and cannot be claimed early at all.
      if (!/social\s*security/i.test(inc.label || '')) continue;
      if (inc.from >= 70) continue;
      if (inc.to !== null && inc.to !== undefined && isFinite(inc.to)) continue;
      return { i: i, inc: inc };
    }
    return { i: -1 };
  }

  // The smallest yearly saving that clears the bar. Monotonic, so bisect.
  function solveSavings(plan, target, opts) {
    var p = clone(plan);
    var lo = plan.annualSavings, hi = Math.max(plan.annualSavings * 2, 20000);
    var guard = 0;
    p.annualSavings = hi;
    while (rate(p, opts) < target && guard++ < 12) { lo = hi; hi *= 2; p.annualSavings = hi; }
    if (guard >= 12) return null;
    for (var i = 0; i < 13; i++) {
      var mid = (lo + hi) / 2;
      p.annualSavings = mid;
      if (rate(p, opts) >= target) hi = mid; else lo = mid;
    }
    return hi;
  }

  // What the worst runs actually pay in their leanest year — the price of
  // flexibility, stated in dollars rather than waved at.
  function leanest(plan, opts) {
    var o = plan.mode === 'bootstrap'
      ? S.bootstrap(plan, { paths: 250 })
      : S.runAll(plan, { step: (opts && opts.step) || 3 });
    if (!o.cycles) return null;
    var lows = [];
    for (var i = 0; i < o.runs.length; i++) {
      var sp = o.runs[i].spends, lo = Infinity;
      for (var y = o.retireYear; y < sp.length; y++) if (sp[y] < lo) lo = sp[y];
      if (isFinite(lo)) lows.push(lo);
    }
    if (!lows.length) return null;
    lows.sort(function (a, b) { return a - b; });
    return round(S.percentile(lows, 0.05), 100);
  }

  function m(v) {
    var n = Math.abs(Math.round(v));
    return '$' + n.toLocaleString('en-US');
  }
  function pc(x) {
    if (x >= 0.999) return '100%';
    var v = x * 100;
    return (v >= 99.5 ? v.toFixed(1) : Math.round(v)) + '%';
  }
  function years(n) {
    n = Math.abs(Math.round(n));
    return n === 1 ? 'a year' : n + ' years';
  }

  root.Advice = {
    suggest: suggest,
    solveSavings: solveSavings,
    leanest: leanest,
    deferFactor: deferFactor,
    pcOfFra: pcOfFra
  };
}(typeof window !== 'undefined' ? window : this));
