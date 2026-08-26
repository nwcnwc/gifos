/* app.js — the plan, the scenarios, and the words that go around the charts.
 *
 * Two ideas run through this file.
 *
 * ONE: the answer arrives before you finish typing. A full sweep of history is
 * ~1,500 simulated retirements, and the two solved numbers at the top are
 * hundreds of sweeps each. So the work is split: the picture and the verdict
 * are computed on a short debounce, the solved numbers follow on an idle tick
 * with their tiles visibly pending, and a slider being DRAGGED samples every
 * fourth cycle so the chart moves under your thumb. Nothing is ever left
 * showing a number that belongs to a plan you have already changed.
 *
 * TWO: a plan is a saved, named thing. Scenarios live in gifos.db, which means
 * they live inside the app's own GIF: the file IS the save. Sharing the GIF
 * shares the plans, and one Invite link puts two people in the same set of
 * scenarios at once, with nothing uploaded anywhere.
 */
(function () {
  'use strict';

  var S = window.RetireSim, C = window.Charts, A = window.Advice;
  var $ = function (id) { return document.getElementById(id); };

  // ---- defaults --------------------------------------------------------------
  //
  // Chosen so the app says something true and useful the second it opens, to
  // somebody who has typed nothing. Every one of them is visible and editable —
  // a default you cannot see is an assumption made on your behalf.
  //
  // These land at about 90% against a 95% bar ON PURPOSE. A default that
  // reports a serene 100% teaches a first-time reader that the tool always says
  // yes, and hides the half of it that is worth having. A plan that is nearly
  // but not quite there opens on the honest sentence — this is tighter than it
  // looks — and immediately shows the measured levers that close the gap.
  //
  // Age 95, not 90: a 65-year-old couple has a 51% chance one of them reaches
  // 90. Planning to a coin flip is not planning.

  function defaults() {
    return {
      currentAge: 45,
      retireAge: 65,
      endAge: 95,
      portfolio: 180000,
      annualSavings: 18000,
      annualSpend: 75000,
      stocks: 0.75,
      glidepath: null,
      fees: 0.001,
      strategy: 'constant',
      percentRate: 0.04,
      // The average US retired worker's benefit in 2026 is $2,071 a month.
      // Leaving it out entirely makes the savings required look absurd, so it
      // is here, named, and one tap from being deleted by anyone it does not
      // apply to.
      incomes: [{ label: 'Social Security', amount: 24900, from: 67, to: null, cola: true }],
      events: [],
      mode: 'history',
      target: 0.95
    };
  }

  var state = {
    plan: defaults(),
    scenarios: [],
    activeId: null,
    compareId: null,
    comparing: false,
    span: 'all',
    who: 'couple',
    theme: 'dark',
    dirty: false,
    result: null,
    compareResult: null,
    advice: null,
    undo: null,
    db: null, prefsDb: null,
    ready: false
  };

  // ---- number helpers --------------------------------------------------------

  // Accepts what people actually type: 1200, $1,200, 1.2k, 1.2m, 60000.
  function parseMoney(s) {
    if (typeof s === 'number') return s;
    var t = String(s).trim().toLowerCase().replace(/[$,\s]/g, '');
    if (!t) return 0;
    var neg = /^-/.test(t) || /^\(.*\)$/.test(t);
    t = t.replace(/^[-(]/, '').replace(/\)$/, '');
    var mult = 1;
    if (/k$/.test(t)) { mult = 1e3; t = t.slice(0, -1); }
    else if (/m$/.test(t)) { mult = 1e6; t = t.slice(0, -1); }
    var v = parseFloat(t);
    if (!isFinite(v)) return 0;
    return (neg ? -v : v) * mult;
  }
  function fmtMoneyInput(n) {
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  }
  var money = C.money, compact = C.compact;

  function num(v, dflt) { var x = parseFloat(v); return isFinite(x) ? x : dflt; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function esc(s) { return String(s === null || s === undefined ? '' : s); }

  // ---- reading and writing the form -----------------------------------------

  function readForm() {
    var p = state.plan;
    p.currentAge = clamp(Math.round(num($('fAge').value, 40)), 18, 100);
    p.retireAge = clamp(Math.round(num($('fRetire').value, 65)), p.currentAge, 100);
    p.endAge = clamp(Math.round(num($('fEnd').value, 95)), p.retireAge + 1, 120);
    p.portfolio = Math.max(0, parseMoney($('fPot').value));
    p.annualSavings = Math.max(0, parseMoney($('fSave').value));
    p.annualSpend = Math.max(0, parseMoney($('fSpend').value));
    p.stocks = clamp(num($('fStocks').value, 75) / 100, 0, 1);
    p.fees = clamp(num($('fFees').value, 10) / 10000, 0, 0.02);
    p.glidepath = $('fGlide').checked
      ? { to: clamp(num($('fGlideTo').value, 40) / 100, 0, 1), byAge: clamp(Math.round(num($('fGlideBy').value, 70)), p.currentAge + 1, 110) }
      : null;
    p.percentRate = clamp(num($('fRate').value, 40) / 1000, 0.005, 0.15);
    p.target = clamp(num($('fTarget').value, 95) / 100, 0.5, 1);
    return p;
  }

  function writeForm() {
    var p = state.plan;
    $('fAge').value = p.currentAge;
    $('fRetire').value = p.retireAge;
    $('fRetireR').value = p.retireAge;
    $('fEnd').value = p.endAge;
    $('fPot').value = fmtMoneyInput(p.portfolio);
    $('fSave').value = fmtMoneyInput(p.annualSavings);
    $('fSpend').value = fmtMoneyInput(p.annualSpend);
    $('fSpendR').value = clamp(p.annualSpend, 10000, 250000);
    $('fStocks').value = Math.round(p.stocks * 100);
    $('fFees').value = Math.round(p.fees * 10000);
    $('fGlide').checked = !!p.glidepath;
    $('glideRow').hidden = !p.glidepath;
    if (p.glidepath) {
      $('fGlideTo').value = Math.round(p.glidepath.to * 100);
      $('fGlideBy').value = p.glidepath.byAge;
    }
    $('fRate').value = Math.round(p.percentRate * 1000);
    $('fTarget').value = Math.round(p.target * 100);
    renderStrategyPicker();
    renderModePicker();
    renderIncomes();
    renderEvents();
    syncLabels();
  }

  // The little numbers beside every slider, plus the one-line summary on each
  // closed section — so a collapsed panel still tells you what is inside it.
  function syncLabels() {
    var p = state.plan;
    $('outStocks').textContent = Math.round(p.stocks * 100) + '%';
    $('outFees').textContent = (p.fees * 100).toFixed(2) + '%';
    $('outRate').textContent = (p.percentRate * 100).toFixed(1) + '%';
    $('outTarget').textContent = Math.round(p.target * 100) + '%';
    if (p.glidepath) $('outGlideTo').textContent = Math.round(p.glidepath.to * 100) + '%';

    var mix = Math.round(p.stocks * 100) + '/' + Math.round((1 - p.stocks) * 100);
    $('sumPortfolio').textContent = mix + ' shares and bonds · ' + (p.fees * 100).toFixed(2) + '% fees';
    $('hintMix').textContent = mixNote(p.stocks);
    $('hintFees').textContent = feeNote(p);

    var inc = p.incomes.filter(function (i) { return i.amount; });
    $('sumIncome').textContent = inc.length
      ? inc.map(function (i) { return money(i.amount) + ' from ' + i.from; }).join(' · ')
      : 'none';
    var ev = p.events.filter(function (e) { return e.amount; });
    $('sumEvents').textContent = ev.length
      ? ev.map(function (e) {
        var yrs = Math.max(1, Math.round(e.years || 1));
        return (e.label || 'Event') + ' ' + money(Math.abs(e.amount))
          + (yrs > 1 ? '/yr ×' + yrs : '');
      }).join(' · ')
      : 'none';

    var st = S.STRATEGIES[p.strategy] || S.STRATEGIES.constant;
    $('sumStrategy').textContent = st.label;
    $('hintStrategy').textContent = st.blurb;
    var needsRate = p.strategy === 'percent' || p.strategy === 'dynamic';
    $('rateRow').hidden = !needsRate;

    $('sumTest').textContent = (p.mode === 'bootstrap' ? 'History reshuffled' : 'Real history')
      + ' · safe at ' + Math.round(p.target * 100) + '%';
    $('hintMode').textContent = p.mode === 'bootstrap'
      ? 'Real months of history, drawn five years at a time and stapled into 1,000 new '
        + 'lifetimes. Crashes and recoveries survive inside each block; only the order of '
        + 'the decades is new. Use it when you want more than the century we happened to get.'
      : 'Every stretch of real history long enough to hold your plan, start to finish, '
        + 'in the order it actually happened.';

    var years = p.endAge - p.currentAge;
    $('hintEnd').textContent = 'A ' + years + '-year plan. '
      + (p.endAge < 90 ? 'Planning past 90 is the safer habit — a healthy 65-year-old has a real chance of getting there.' : '');
  }

  function mixNote(s) {
    var b = Math.round((1 - s) * 100);
    if (s >= 0.95) return 'All shares. The most growth and the most terrifying years — history says that has been worth it over long retirements.';
    if (s >= 0.6) return b + '% bonds to steady it. This is the range most of the research lands in.';
    if (s >= 0.4) return 'A cautious mix. Calmer year to year, and it has struggled to outrun a long retirement.';
    return 'Mostly bonds. Safe-feeling and historically the most likely to run out over 30 years — the calm is the risk.';
  }
  function feeNote(p) {
    var years = p.endAge - p.currentAge;
    var drag = 1 - Math.pow(1 - p.fees, years);
    if (p.fees <= 0.0005) return 'About what a plain index fund costs.';
    return 'Over ' + years + ' years that is roughly ' + Math.round(drag * 100)
      + '% of the pot, gone to fees.';
  }

  // ---- income and event rows -------------------------------------------------

  var TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1L12 4M6.5 7v4M9.5 7v4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function rowShell(onDelete) {
    var d = document.createElement('div');
    d.className = 'row-item';
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-del';
    del.title = 'Remove';
    del.setAttribute('aria-label', 'Remove');
    del.innerHTML = TRASH;
    del.addEventListener('click', onDelete);
    d.appendChild(del);
    return d;
  }
  function labelled(text, input) {
    var l = document.createElement('label');
    var s = document.createElement('span');
    s.textContent = text;
    l.appendChild(s);
    l.appendChild(input);
    return l;
  }
  function mkInput(type, value, cls) {
    var i = document.createElement('input');
    i.type = type;
    if (type === 'number') i.inputMode = 'numeric';
    if (cls) i.className = cls;
    i.value = value;
    return i;
  }

  /* One thing worth knowing about income that starts before you retire: this
   * app has no concept of what you spend while you are still working, so any
   * such income is added to what you save rather than to what you live on.
   * Part-time work of $20,000 a year from 45 to 65 behaves exactly like putting
   * $20,000 a year more into the pot. That is a defensible model and a
   * surprising one, so the panel says it out loud. */
  function renderIncomes() {
    var host = $('incomeList');
    host.textContent = '';
    state.plan.incomes.forEach(function (inc, i) {
      var d = rowShell(function () {
        state.plan.incomes.splice(i, 1);
        renderIncomes(); touched();
      });
      var name = mkInput('text', esc(inc.label), 'r-name');
      name.placeholder = 'What is it?';
      name.addEventListener('input', function () { inc.label = name.value; touched(); });
      d.appendChild(name);

      var grid = document.createElement('div');
      grid.className = 'r-grid';
      var amt = mkInput('text', fmtMoneyInput(inc.amount), 'money');
      amt.inputMode = 'numeric';
      amt.addEventListener('input', function () { inc.amount = parseMoney(amt.value); touched(); });
      amt.addEventListener('blur', function () { amt.value = fmtMoneyInput(inc.amount); });
      grid.appendChild(labelled('A year', amt));

      var from = mkInput('number', inc.from, '');
      from.min = 18; from.max = 110;
      from.addEventListener('input', function () { inc.from = clamp(num(from.value, 67), 0, 120); touched(); });
      grid.appendChild(labelled('From age', from));

      var to = mkInput('number', inc.to === null || inc.to === undefined ? '' : inc.to, '');
      to.min = 18; to.max = 120; to.placeholder = 'ever';
      to.title = 'The last payment is the year BEFORE this age. Leave it blank for life.';
      to.addEventListener('input', function () {
        var v = to.value.trim();
        inc.to = v === '' ? null : clamp(num(v, 120), 0, 130);
        touched();
      });
      grid.appendChild(labelled('Stops at age', to));

      var chk = document.createElement('div');
      chk.className = 'r-check';
      var cb = mkInput('checkbox', '', '');
      cb.checked = inc.cola !== false;
      cb.id = 'cola' + i;
      cb.addEventListener('change', function () { inc.cola = cb.checked; touched(); });
      var cl = document.createElement('label');
      cl.htmlFor = cb.id;
      cl.textContent = 'Rises with inflation';
      chk.appendChild(cb); chk.appendChild(cl);
      grid.appendChild(chk);

      d.appendChild(grid);
      host.appendChild(d);
    });
  }

  /* An event is a SPAN with a DIRECTION.
   *
   * Two things were wrong with the first version. It could only do one year, so
   * the most common thing anybody actually needs to model — four years of
   * college — could not be expressed at all. And it asked people to type a
   * minus sign to mean "money going out", which is a convention half of readers
   * will miss and the other half will resent. Out and In are buttons now, and
   * the sign is the app's problem.
   */
  function renderEvents() {
    var host = $('eventList');
    host.textContent = '';
    state.plan.events.forEach(function (ev, i) {
      var d = rowShell(function () {
        state.plan.events.splice(i, 1);
        renderEvents(); touched();
      });
      var name = mkInput('text', esc(ev.label), 'r-name');
      name.placeholder = 'What is it?';
      name.addEventListener('input', function () { ev.label = name.value; touched(); });
      d.appendChild(name);

      var grid = document.createElement('div');
      grid.className = 'r-grid';

      var dir = document.createElement('div');
      dir.className = 'segmented tiny';
      dir.setAttribute('role', 'radiogroup');
      dir.setAttribute('aria-label', 'Money in or out');
      [['out', 'Paying out'], ['in', 'Coming in']].forEach(function (opt) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.textContent = opt[1];
        b.setAttribute('aria-checked', (ev.amount < 0 ? 'out' : 'in') === opt[0] ? 'true' : 'false');
        b.addEventListener('click', function () {
          ev.amount = Math.abs(ev.amount) * (opt[0] === 'out' ? -1 : 1);
          renderEvents(); touched();
        });
        dir.appendChild(b);
      });
      var dirWrap = document.createElement('label');
      var dirSpan = document.createElement('span');
      dirSpan.textContent = 'Direction';
      dirWrap.appendChild(dirSpan); dirWrap.appendChild(dir);
      dirWrap.style.flex = '1 1 100%';
      grid.appendChild(dirWrap);

      var amt = mkInput('text', fmtMoneyInput(Math.abs(ev.amount)), 'money');
      var sign = function () { return ev.amount < 0 ? -1 : 1; };
      amt.addEventListener('input', function () {
        ev.amount = Math.abs(parseMoney(amt.value)) * sign();
        touched();
      });
      amt.addEventListener('blur', function () { amt.value = fmtMoneyInput(Math.abs(ev.amount)); });
      grid.appendChild(labelled(ev.years > 1 ? 'A year' : 'Amount', amt));

      var at = mkInput('number', ev.at, '');
      at.min = state.plan.currentAge; at.max = Math.max(state.plan.currentAge, state.plan.endAge - 1);
      // Clamp to the plan's OWN window. An event dated at or past the final age
      // used to be dropped in silence and the answer looked completely normal —
      // a $500,000 inheritance at 95 on a plan through 95 changed nothing at all.
      at.addEventListener('input', function () {
        ev.at = clamp(num(at.value, state.plan.retireAge), state.plan.currentAge, state.plan.endAge - 1);
        touched();
      });
      at.addEventListener('blur', function () { at.value = ev.at; });
      grid.appendChild(labelled('From age', at));

      var yrs = mkInput('number', Math.max(1, Math.round(ev.years || 1)), '');
      yrs.min = 1; yrs.max = 60;
      yrs.addEventListener('input', function () {
        ev.years = clamp(Math.round(num(yrs.value, 1)), 1, 60);
        renderEvents(); touched();
      });
      grid.appendChild(labelled('For how many years', yrs));

      d.appendChild(grid);

      var sum = document.createElement('p');
      sum.className = 'row-sum';
      var span = Math.max(1, Math.round(ev.years || 1));
      sum.textContent = (ev.amount < 0 ? 'Paying out ' : 'Coming in ')
        + money(Math.abs(ev.amount)) + (span > 1
          ? ' a year from ' + ev.at + ' to ' + (ev.at + span - 1) + ' — ' + money(Math.abs(ev.amount) * span) + ' in all'
          : ' at ' + ev.at);
      d.appendChild(sum);

      host.appendChild(d);
    });
  }

  function renderStrategyPicker() {
    var host = $('stratPick');
    host.textContent = '';
    Object.keys(S.STRATEGIES).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-v', k);
      b.setAttribute('aria-checked', state.plan.strategy === k ? 'true' : 'false');
      b.textContent = S.STRATEGIES[k].label;
      b.addEventListener('click', function () {
        state.plan.strategy = k;
        renderStrategyPicker(); syncLabels(); touched();
      });
      host.appendChild(b);
    });
  }
  function renderModePicker() {
    var btns = $('modePick').querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-checked', btns[i].getAttribute('data-v') === state.plan.mode ? 'true' : 'false');
    }
  }

  // ---- the compute cycle -----------------------------------------------------

  var mainTimer = null, extrasTimer = null, adviceTimer = null, adviceToken = 0;
  var dragging = false;

  function touched() {
    state.dirty = true;
    $('dirty').hidden = !state.activeId || !state.dirty;
    $('btnUndo').hidden = !state.undo;
    readForm();
    syncLabels();
    schedule();
    saveDraft();
  }

  function schedule() {
    if (mainTimer) clearTimeout(mainTimer);
    if (extrasTimer) { clearTimeout(extrasTimer); extrasTimer = null; }
    if (adviceTimer) { clearTimeout(adviceTimer); adviceTimer = null; }
    adviceToken++;
    state.advice = null;
    markPending();
    mainTimer = setTimeout(computeMain, dragging ? 16 : 70);
  }

  function markPending() {
    $('statRetire').classList.add('pending');
    $('statSpend').classList.add('pending');
    $('adviceSub').textContent = 'Working through the options…';
  }

  function computeMain() {
    mainTimer = null;
    var p = state.plan;
    if (S.cycleStarts(p) < 3 && p.mode !== 'bootstrap') {
      renderTooShort();
      return;
    }
    var opts = { mode: p.mode, step: dragging ? 4 : 1 };
    state.result = p.mode === 'bootstrap'
      ? S.bootstrap(p, { paths: dragging ? 300 : 1000 })
      : S.runAll(p, opts);
    state.sched = S.schedule(p);

    if (state.comparing && state.compareId) {
      var other = byId(state.compareId);
      state.compareResult = other
        ? (other.plan.mode === 'bootstrap' ? S.bootstrap(other.plan, { paths: 500 }) : S.runAll(other.plan, { step: 2 }))
        : null;
    } else {
      state.compareResult = null;
    }

    renderAll();
    if (!dragging) extrasTimer = setTimeout(computeExtras, 30);
  }

  // The two solved numbers. Hundreds of sweeps each, so they run after the
  // picture is already on screen and their tiles say so while they think.
  function computeExtras() {
    extrasTimer = null;
    var p = state.plan;
    var strat = S.STRATEGIES[p.strategy] || S.STRATEGIES.constant;

    /* A STRATEGY THAT CANNOT FAIL HAS NO SAFE-SPEND LIMIT, AND MUST NOT INVENT ONE.
     *
     * Both tiles are solved by asking "what is the largest X that still clears
     * 95% of the runs". For a method whose paycheck is derived from the balance
     * the answer to that is infinity — every X clears — so the bisection walked
     * its ceiling up and printed the biggest number it reached. The app was
     * shipping "Could spend a year: $185B" in the largest type on the page, for
     * two of its five strategies. That one number destroys more credibility than
     * every correct number on the screen earns.
     */
    if (strat.selfLimiting) {
      var why = 'This way of taking the money can never run out, so there is no '
        + 'safe-spending limit to find. Look at the leanest year instead.';
      $('vSpend').textContent = '—';
      $('vRetire').textContent = '—';
      $('statSpend').title = why;
      $('statRetire').title = why;
      $('statSpend').classList.remove('pending');
      $('statRetire').classList.remove('pending');
      state.solvedSpend = null;
      state.solvedAge = null;
      renderCurve();
      adviceTimer = setTimeout(computeAdvice, 30);
      return;
    }

    var opts = { mode: p.mode, sched: state.sched, step: 2, iters: 15 };

    var spend = S.solveSpend(p, p.target, opts);
    // Belt and braces: never print a paycheck that is absurd against the pot it
    // comes out of, whatever the solver says.
    var ceiling = Math.max(p.portfolio, 0) * 2 + Math.max(p.annualSpend, 0) * 4 + 1e6;
    if (!isFinite(spend) || spend > ceiling) {
      $('vSpend').textContent = '—';
      $('statSpend').title = 'No sensible limit — on these numbers the plan never runs short.';
      state.solvedSpend = null;
    } else {
      $('vSpend').textContent = compact(spend);
      $('statSpend').title = 'The most you could spend every year and still clear '
        + Math.round(p.target * 100) + '% of the runs.';
      state.solvedSpend = spend;
    }
    $('statSpend').classList.remove('pending');

    setTimeout(function () {
      var age = S.solveRetireAge(p, p.target, opts);
      $('vRetire').textContent = age === null ? 'not yet' : age;
      $('statRetire').classList.remove('pending');
      $('statRetire').title = age === null
        ? 'On these numbers no retirement age up to ' + (p.endAge - 1) + ' clears the bar.'
        : 'The earliest age that clears ' + Math.round(p.target * 100) + '% of the runs.';
      state.solvedAge = age;
      renderCurve();
      adviceTimer = setTimeout(computeAdvice, 30);
    }, 0);
  }

  /* The advice pass is the most expensive thing here — every suggestion is a
   * fresh sweep of history — so it runs dead last, after the reader already has
   * the picture and both solved numbers, and it is abandoned the moment an
   * input changes. */
  function computeAdvice() {
    adviceTimer = null;
    var r = state.result, p = state.plan;
    if (!r || !r.cycles) return;
    var token = ++adviceToken;
    var list;
    try {
      list = A.suggest(p, r.successRate, p.target, { step: 3 });
    } catch (e) {
      list = [];
    }
    if (token !== adviceToken) return;
    state.advice = list;
    renderAdvice();
  }

  function renderTooShort() {
    $('vDot').className = 'v-dot warn';
    $('vHead').textContent = 'Not enough history for a plan this long.';
    $('vSub').textContent = 'A ' + (state.plan.endAge - state.plan.currentAge)
      + '-year plan needs a ' + (state.plan.endAge - state.plan.currentAge)
      + '-year run of record, and there are only ' + Math.floor(MARKET.months / 12)
      + ' years of it. Shorten the plan, or switch to History reshuffled.';
    $('vRetire').textContent = '—';
    $('vSpend').textContent = '—';
    $('statRetire').classList.remove('pending');
    $('statSpend').classList.remove('pending');
  }

  // ---- rendering the answer --------------------------------------------------

  function renderAll() {
    readColours();
    renderVerdict();
    renderFan();
    renderStack();
    renderWorst();
    renderCurve();
    renderStates();
    renderCompare();
  }

  /* Rich, broke, or gone.
   *
   * The single most useful reframing in this category, and one almost nobody
   * ships: a plan that reports "a 6% chance of running out at 92" is telling
   * you about one risk while silently omitting the other one on the same axis.
   * A 65-year-old man has a 24% chance of seeing 90 at all. Both belong on one
   * picture, because the first number reads completely differently beside the
   * second — and the honest conclusion is usually "spend it".
   *
   * Grey is not a series colour and neither is red: they are status, and they
   * keep their meaning. The two money states are one hue at two steps, brighter
   * for more, which is the right direction on a dark surface.
   */
  function renderStates() {
    var r = state.result, p = state.plan;
    var card = $('cardStates');
    if (!r || !r.cycles || !window.MORTALITY) { card.hidden = true; return; }
    card.hidden = false;
    var st = S.outcomeStates(p, r, state.who);
    var n = st.length;

    var series = [
      { label: 'Not here any more', colour: COL.dead, values: st.map(function (a) { return a.dead; }) },
      { label: 'Ran out of money', colour: COL.critical, values: st.map(function (a) { return a.broke; }) },
      { label: 'Less than you retired with', colour: COL.wLess, values: st.map(function (a) { return a.under; }) },
      { label: 'More than you retired with', colour: COL.wMore, values: st.map(function (a) { return a.over; }) }
    ];

    C.stack($('chartStates'), {
      height: 210, years: n, startAge: st[0].age, series: series, share: true, colours: COL
    });
    C.legend($('legStates'), series.map(function (x) { return { label: x.label, colour: x.colour }; }));

    // Read the sentence off the year that makes the point: the age where being
    // gone first outweighs being broke.
    var read = $('statesRead');
    read.textContent = '';
    var end = st[n - 1];
    var whoWord = state.who === 'm' ? 'a man your age' : state.who === 'f' ? 'a woman your age' : 'at least one of a couple your age';
    // The wedges are JOINT probabilities — broke AND still alive — because they
    // have to sum to 100% for the picture to work. The failure rate is not that
    // number: quoting the wedge said "2% of these retirements have run out"
    // directly beneath a verdict that said 10% of them did.
    add(read, 'By ' + end.age + ', ');
    addB(read, pctWord(1 - r.successRate, true));
    add(read, ' of these retirements have run out of money at some point. But ');
    addB(read, Math.round(end.dead * 100) + '%');
    add(read, ' of the time ' + whoWord + ' is no longer alive to mind, which is why the red band is so much thinner than the grey one. ');
    var cross = null;
    for (var i = 1; i < n; i++) if (st[i].dead > st[i].broke && cross === null && st[i].broke > 0) cross = st[i].age;
    if (cross !== null && cross < end.age) {
      add(read, 'From age ' + cross + ' onward, not being here is the likelier outcome than being broke.');
    } else {
      add(read, 'Survival odds come from the Social Security period life table.');
    }

    var rows = [], step = Math.max(1, Math.round(n / 12));
    for (var y = 0; y < n; y += step) {
      rows.push([String(st[y].age), C.pct(st[y].over), C.pct(st[y].under), C.pct(st[y].broke), C.pct(st[y].dead)]);
    }
    C.table($('tblStates'), ['Age', 'Ahead', 'Behind', 'Broke', 'Gone'], rows);
  }

  /* Two plans against the same history. The point of a comparison table is the
   * DIFFERENCE, so every row says which way it went rather than leaving the
   * reader to subtract two numbers in their head — and "better" is marked only
   * where better is unambiguous. More money at the end is not better if it was
   * bought by spending less for thirty years, so that row is never marked. */
  function renderCompare() {
    var card = $('cardCompare');
    var a = state.result, b = state.compareResult;
    if (!state.comparing || !b || !b.cycles || !a || !a.cycles) { card.hidden = true; return; }
    card.hidden = false;
    var pa = state.plan, pb = (byId(state.compareId) || {}).plan || {};
    $('cmpSub').textContent = 'Both run against the same ' + a.cycles.toLocaleString()
      + ' stretches of history.';

    var rows = [
      ['Chance it lasts', pctWord(a.successRate), pctWord(b.successRate),
        a.successRate - b.successRate, 'up'],
      ['Spending a year', money(pa.annualSpend), money(pb.annualSpend || 0), 0, null],
      ['Retires at', String(pa.retireAge), String(pb.retireAge || '—'),
        (pb.retireAge || 0) - pa.retireAge, 'up'],
      ['Typical money left', money(a.medianFinal), money(b.medianFinal), 0, null],
      ['Worst run ran out', a.worst && a.worst.failed ? 'age ' + Math.floor(a.worst.failAge) : 'never',
        b.worst && b.worst.failed ? 'age ' + Math.floor(b.worst.failAge) : 'never',
        (a.worst && a.worst.failed ? 0 : 1) - (b.worst && b.worst.failed ? 0 : 1), 'up']
    ];

    var host = $('cmpBody');
    host.textContent = '';
    var t = document.createElement('table');
    t.className = 'cmp-table';
    var head = document.createElement('tr');
    head.appendChild(th(''));
    head.appendChild(th(activeName(), COL.s1));
    head.appendChild(th(cmpName(), COL.s2));
    var thead = document.createElement('thead');
    thead.appendChild(head);
    t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var lab = document.createElement('th');
      lab.textContent = r[0];
      tr.appendChild(lab);
      tr.appendChild(td(r[1], r[4] && r[3] > 1e-9));
      tr.appendChild(td(r[2], r[4] && r[3] < -1e-9));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    host.appendChild(t);
  }

  function th(text, colour) {
    var e = document.createElement('th');
    if (colour) {
      var w = document.createElement('span');
      w.className = 'cmp-name';
      var k = document.createElement('i');
      k.className = 'cmp-key';
      k.style.background = colour;
      var n = document.createElement('span');
      n.textContent = text;                 // a plan name is user text
      w.appendChild(k); w.appendChild(n);
      e.appendChild(w);
    } else {
      e.textContent = text;
    }
    return e;
  }
  function td(text, win) {
    var e = document.createElement('td');
    e.className = 'num' + (win ? ' win' : '');
    e.textContent = text;
    return e;
  }

  function renderVerdict() {
    var r = state.result, p = state.plan;
    if (!r || !r.cycles) return renderTooShort();
    var st = S.STRATEGIES[p.strategy] || S.STRATEGIES.constant;
    var rate = r.successRate;
    var dot = rate >= p.target ? 'good' : rate >= p.target - 0.15 ? 'warn' : 'bad';
    $('vDot').className = 'v-dot ' + dot;

    /* "1,268 real retirements" reads as 1,268 independent data points. They are
     * overlapping windows — one for every starting month — so there are more
     * like a hundred non-overlapping ones behind them. The stretches are real;
     * the independence is not, and the copy should not borrow it. */
    var yrs = p.endAge - p.currentAge;
    var runsWord = r.kind === 'bootstrap'
      ? r.cycles.toLocaleString() + ' reshuffled lifetimes'
      : r.cycles.toLocaleString() + ' real ' + yrs + '-year stretches of history';

    if (st.selfLimiting) {
      // A method that cannot run out is not measured by whether it ran out.
      var lean = leanestYear(r);
      $('vHead').textContent = 'This never runs out — the paycheck moves instead.';
      $('vSub').textContent = 'Across ' + runsWord + ', the leanest year paid '
        + money(lean.p5) + ' and the typical year ' + money(lean.median)
        + ', against the ' + money(p.annualSpend) + ' you asked for.';
    } else if (!r.failures) {
      // NOT `rate >= 0.999`. One failure in 1,508 is 99.934%, which cleared that
      // bar and printed "every single time" — followed by "the worst of them
      // ended with $0", because r.worst is the run that failed.
      $('vHead').textContent = 'Your money lasted every single time.';
      $('vSub').textContent = 'All ' + runsWord + ' got you to ' + p.endAge
        + ' with money left — the leanest of them ended with ' + money(r.worst.final) + '.';
    } else if (rate >= p.target) {
      $('vHead').textContent = 'Your money lasts.';
      $('vSub').textContent = pctWord(rate, true) + ' of ' + runsWord + ' got you to ' + p.endAge
        + '. The ' + (r.failures === 1 ? 'one that did not' : r.failures + ' that did not')
        + ' ran dry at ' + Math.floor(r.worst.failAge) + '.';
    } else if (rate >= 0.5) {
      $('vHead').textContent = 'This is tighter than it looks.';
      $('vSub').textContent = pctWord(rate, true) + ' of ' + runsWord + ' made it, against the '
        + Math.round(p.target * 100) + '% you asked for. The rest ran out — the earliest at '
        + Math.floor(r.worst.failAge) + '.';
    } else if (r.failures === r.cycles) {
      // pctWord(0) is the word "none", and "Only none of 1,244 lasted" is not a
      // sentence anybody wrote on purpose.
      $('vHead').textContent = 'This plan runs out every time.';
      $('vSub').textContent = 'Not one of ' + runsWord + ' lasted. The first ran dry at '
        + Math.floor(r.worst.failAge) + '.';
    } else {
      $('vHead').textContent = 'On this plan, the money usually runs out.';
      $('vSub').textContent = 'Only ' + pctWord(rate, true) + ' of ' + runsWord
        + ' lasted. The worst ran dry at ' + Math.floor(r.worst.failAge) + '.';
    }
  }

  /* Never round ACROSS the bar.
   *
   * 94.96% rounds to "95%", and the app then printed "95% of 1,508 real
   * retirements made it, against the 95% you asked for" — beside an amber dot,
   * in a sentence whose whole point was that it fell short. `floor` is passed
   * whenever the number is being compared to something it did not reach.
   */
  function pctWord(x, floor) {
    if (x >= 1 - 1e-12) return '100%';
    if (x <= 0.001) return 'none';
    var v = x * 100;
    if (floor) {
      var f = Math.floor(v * 10) / 10;
      return (f >= 99.5 ? f.toFixed(1) : Math.floor(v)) + '%';
    }
    return (v >= 99.5 ? v.toFixed(1) : Math.round(v)) + '%';
  }

  function leanestYear(r) {
    var lows = [], meds = [];
    for (var i = 0; i < r.runs.length; i++) {
      var sp = r.runs[i].spends, lo = Infinity, seen = false;
      for (var y = r.retireYear; y < sp.length; y++) { seen = true; if (sp[y] < lo) lo = sp[y]; }
      if (seen) lows.push(lo);
    }
    lows.sort(function (a, b) { return a - b; });
    for (i = 0; i < r.runs.length; i++) {
      var s2 = r.runs[i].spends, t = 0, n = 0;
      for (y = r.retireYear; y < s2.length; y++) { t += s2[y]; n++; }
      if (n) meds.push(t / n);
    }
    meds.sort(function (a, b) { return a - b; });
    return { p5: S.percentile(lows, 0.05), median: S.percentile(meds, 0.5) };
  }

  /* The charts draw legend swatches and tooltip keys in JS, and the CSS draws
   * the marks. If those two lists ever disagree the legend lies about the
   * chart — so there is only one list, and it lives in the stylesheet. Re-read
   * on every render, which is also how the theme switch reaches the SVG.
   */
  var COL = {};
  function readColours() {
    var cs = getComputedStyle(document.documentElement);
    ['s1', 's2', 's3', 's4', 's5', 'critical', 'good', 'muted', 'ink'].forEach(function (k) {
      COL[k] = (cs.getPropertyValue('--' + k) || '').trim() || COL[k] || '#888';
    });
    COL.wLess = (cs.getPropertyValue('--w-less') || '').trim() || '#184f95';
    COL.wMore = (cs.getPropertyValue('--w-more') || '').trim() || '#3987e5';
    COL.dead = (cs.getPropertyValue('--axis') || '').trim() || '#52525c';
    return COL;
  }

  function renderFan() {
    var r = state.result, p = state.plan;
    if (!r || !r.cycles) return;
    var cmp = state.compareResult;
    // Accumulation and retirement live on wildly different scales — forty years
    // of compounding can squash the years that actually decide the plan into a
    // few pixels above the axis. So the reader can cut to the part they came
    // for, and the y-axis re-fits to it.
    var from = state.span === 'retire' ? r.retireYear : 0;
    var bands = from ? r.bands.slice(from) : r.bands;
    var wname = retiredIn(r.worst);
    C.fan($('chartFan'), {
      height: window.innerWidth >= 1180 ? 300 : 240,
      bands: bands,
      startAge: p.currentAge + from,
      retireAge: from ? undefined : p.retireAge,
      retireLabel: 'retire at ' + p.retireAge,
      worst: r.worst ? (from ? r.worst.balances.slice(from) : r.worst.balances) : null,
      worstLabel: wname || 'Worst run',
      compare: cmp && cmp.bands ? cmp.bands.slice(Math.min(from, cmp.bands.length - 1)).map(function (b) { return b[2]; }) : null,
      colours: { median: COL.s1, worst: COL.critical }
    });

    var items = [
      { label: 'Typical outcome', colour: COL.s1, line: true },
      { label: 'The middle half of runs', colour: COL.s1 },
      { label: wname ? 'Worst: retiring ' + wname : 'Worst run', colour: COL.critical, line: true }
    ];
    if (cmp) items.push({ label: cmpName(), colour: COL.s2, line: true });
    C.legend($('legFan'), items);

    $('fanSub').textContent = r.kind === 'bootstrap'
      ? '1,000 lifetimes built from real five-year blocks of history.'
      : 'Every ' + (p.endAge - p.currentAge) + '-year run since 1871 — '
        + r.cycles.toLocaleString() + ' of them — laid on top of each other.';

    var read = $('fanRead');
    read.textContent = '';
    var typical = r.bands[r.bands.length - 1][2];
    add(read, 'At ' + p.endAge + ' the typical run leaves ');
    addB(read, money(typical));
    add(read, ', a quarter of them more than ');
    addB(read, money(r.bands[r.bands.length - 1][3]));
    add(read, ' and a quarter less than ');
    addB(read, money(r.bands[r.bands.length - 1][1]));
    add(read, '. ');
    // The number almost nobody prints, and for most readers the likelier
    // problem: a success rate measures running out, and running out is not
    // what usually happens. Reporting only failure quietly argues for
    // underspending, which is the one mistake you cannot fix afterwards.
    if (r.endedRicher >= 0.5) {
      addB(read, Math.round(r.endedRicher * 100) + '% ended richer than the day they retired');
      if (r.endedDoubled >= 0.2) {
        add(read, ', ' + Math.round(r.endedDoubled * 100) + '% with more than double');
      }
      add(read, ' — so the likelier miss here is underspending, not running out.');
    } else {
      add(read, 'Everything is in today’s money, so these are numbers you can feel.');
    }

    var rows = [], step = Math.max(1, Math.round((r.bands.length - 1) / 12));
    for (var y = from; y < r.bands.length; y += step) {
      rows.push([String(p.currentAge + y), money(r.bands[y][0]), money(r.bands[y][2]), money(r.bands[y][4])]);
    }
    C.table($('tblFan'), ['Age', 'Worst 5%', 'Typical', 'Best 5%'], rows);
  }

  function add(el, t) { el.appendChild(document.createTextNode(t)); }
  function addB(el, t, cls) {
    var b = document.createElement('b');
    if (cls) b.className = cls;
    b.textContent = t;
    el.appendChild(b);
  }

  function renderCurve() {
    var p = state.plan, r = state.result;
    if (!r || !r.cycles) return;
    var st = S.STRATEGIES[p.strategy] || S.STRATEGIES.constant;
    if (st.selfLimiting) {
      $('cardCurve').hidden = true;
      return;
    }
    $('cardCurve').hidden = false;
    var max = Math.max(p.annualSpend * 1.8, (state.solvedSpend || p.annualSpend) * 1.5, 20000);
    var pts = S.spendCurve(p, { mode: p.mode, sched: state.sched, step: 3, points: 22, max: max });
    C.curve($('chartCurve'), {
      height: 210, points: pts, at: p.annualSpend, target: p.target,
      colours: { median: COL.s1 }
    });

    var read = $('curveRead');
    read.textContent = '';
    if (state.solvedSpend) {
      var diff = state.solvedSpend - p.annualSpend;
      add(read, 'At ' + Math.round(p.target * 100) + '% you could spend ');
      addB(read, money(Math.round(state.solvedSpend / 100) * 100));
      add(read, ' a year — ');
      if (Math.abs(diff) < 500) {
        add(read, 'almost exactly what you have asked for.');
      } else if (diff > 0) {
        addB(read, money(diff) + ' more', 'ok');
        add(read, ' than you planned.');
      } else {
        addB(read, money(-diff) + ' less', 'bad');
        add(read, ' than you planned.');
      }
      add(read, ' The curve is steep where a small change in spending buys a lot of certainty, and flat where it buys almost none.');
    }
    C.table($('tblCurve'), ['Spending a year', 'Worked in'],
      pts.map(function (q) { return [money(q.spend), pctWord(q.success)]; }));
  }

  function renderStack() {
    var r = state.result, p = state.plan;
    if (!r || !r.median) return;
    var run = r.median;
    // Only the retirement years. Asking "where does this year's money come
    // from" about a year you are still working has one answer — your job — and
    // twenty-five columns of it crush the part that matters into the corner.
    var y0 = run.retireYear;
    var years = run.years - y0;
    if (years < 1) { $('cardStack').hidden = true; return; }
    $('cardStack').hidden = false;
    var wd = [], streams = {};
    var i, y;

    for (y = 0; y < years; y++) wd.push(run.withdrawn[y0 + y]);
    p.incomes.forEach(function (inc) { if (inc.amount) streams[inc.label || 'Income'] = new Array(years).fill(0); });

    // Split the median run's income back out by stream, so the picture names
    // the actual pension rather than lumping it into "other".
    var M = window.MARKET;
    for (y = 0; y < years; y++) {
      for (var m = 0; m < 12; m++) {
        var age = p.currentAge + y0 + y + m / 12;
        var idx = run.startIdx + (y0 + y) * 12 + m;
        p.incomes.forEach(function (inc) {
          if (!inc.amount) return;
          if (age + 1e-9 < inc.from) return;
          if (inc.to !== null && inc.to !== undefined && isFinite(inc.to) && age >= inc.to - 1e-9) return;
          var a = inc.amount / 12;
          if (inc.cola === false && M.cpi[idx]) a *= M.cpi[run.startIdx] / M.cpi[idx];
          streams[inc.label || 'Income'][y] += a;
        });
      }
    }

    var series = [{ label: 'From the portfolio', values: wd, colour: COL.s2 }];
    var pal = [COL.s3, COL.s4, COL.s5, COL.s1];
    var k = 0;
    for (var name in streams) {
      if (!Object.prototype.hasOwnProperty.call(streams, name)) continue;
      series.push({ label: name, values: streams[name], colour: pal[k % pal.length] });
      k++;
    }

    C.stack($('chartStack'), {
      height: 210, years: years, startAge: p.currentAge + y0, series: series,
      colours: COL
    });
    C.legend($('legStack'), series.map(function (s) { return { label: s.label, colour: s.colour }; }));
    var mname = retiredIn(run);
    $('stackSub').textContent = 'One run — the one that ended closest to typical'
      + (mname ? ', a retirement beginning in ' + mname : '') + '.';

    var read = $('stackRead');
    read.textContent = '';
    var lastY = years - 1;
    var otherAtEnd = 0;
    for (i = 1; i < series.length; i++) otherAtEnd += series[i].values[lastY] || 0;
    var totalEnd = otherAtEnd + wd[lastY];
    if (totalEnd > 0) {
      add(read, 'By ' + (p.currentAge + y0 + lastY) + ', ');
      addB(read, Math.round(otherAtEnd / totalEnd * 100) + '%');
      add(read, ' of the year’s money comes from outside the portfolio. That share is why an income that keeps up with inflation is worth so much more than one that does not.');
    }
    var rows = [], step2 = Math.max(1, Math.round(years / 12));
    for (y = 0; y < years; y += step2) {
      rows.push([String(p.currentAge + y0 + y)].concat(series.map(function (s) { return money(s.values[y] || 0); })));
    }
    C.table($('tblStack'), ['Age'].concat(series.map(function (s) { return s.label; })), rows);
  }

  var ADVICE_MARK = { fix: '✓', help: '↑', room: '+', note: 'i' };

  function renderAdvice() {
    var host = $('adviceList');
    host.textContent = '';
    var list = state.advice;
    var r = state.result, p = state.plan;
    if (!list) return;
    var short = r && r.successRate < p.target;
    var strat = S.STRATEGIES[p.strategy] || S.STRATEGIES.constant;

    $('adviceHead').textContent = short ? 'What would fix it' : 'What this buys you';
    if (strat.selfLimiting) {
      $('adviceSub').textContent = 'This method cannot run out, so there is nothing here to shore up — '
        + 'the question becomes how big the paycheck is, not whether it arrives.';
    } else if (!list.length) {
      $('adviceSub').textContent = short
        ? 'Nothing single-handedly closes this gap. It will take more than one change.'
        : 'Nothing worth changing — the plan clears the bar with room to spare.';
    } else if (short) {
      $('adviceSub').textContent = list.clears
        ? 'Each of these was measured by re-running your plan against all of history. '
          + 'The cheapest change that clears ' + pctWord(p.target) + ' is first.'
        : 'No single change gets you to ' + pctWord(p.target) + ', so these are ranked by how far '
          + 'each one moves you. Two of them together usually will — press Try it and watch.';
    } else {
      $('adviceSub').textContent = 'Room you have not spent. Each was measured the same way the verdict was.';
    }
    if (!list.length) {
      var e = document.createElement('p');
      e.className = 'advice-empty';
      e.textContent = strat.selfLimiting
        ? 'Switch to Steady paycheck above to see what a fixed budget would take.'
        : '';
      if (e.textContent) host.appendChild(e);
      return;
    }

    list.slice(0, 5).forEach(function (a) {
      var d = document.createElement('div');
      d.className = 'advice ' + a.kind;
      var mk = document.createElement('span');
      mk.className = 'advice-mark';
      mk.setAttribute('aria-hidden', 'true');
      mk.textContent = ADVICE_MARK[a.kind] || '·';
      var t = document.createElement('b');
      t.textContent = a.title;
      var pp = document.createElement('p');
      pp.textContent = a.detail;
      d.appendChild(mk); d.appendChild(t); d.appendChild(pp);

      // Anything the app can just DO, it offers to do — a suggestion you have
      // to retype by hand is a suggestion most people never test.
      var apply = applier(a);
      if (apply) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'advice-apply';
        b.textContent = 'Try it';
        b.addEventListener('click', function () {
          // Keep the plan as it was. "Try it" is an invitation to experiment,
          // and an experiment you cannot get back from is not one — it set the
          // share of stocks to 100% and left no way home but remembering what
          // it had been.
          state.undo = { plan: clonePlan(state.plan), what: a.title };
          apply(); writeForm(); touched();
        });
        d.appendChild(b);
      }
      host.appendChild(d);
    });
  }

  function applier(a) {
    var p = state.plan;
    if (a.id === 'spend') return function () { p.annualSpend = Math.max(0, p.annualSpend + (a.kind === 'room' ? a.cost : -a.cost)); };
    if (a.id === 'age') {
      var m2 = /at (\d+)/.exec(a.detail);
      if (m2) return function () { p.retireAge = clamp(+m2[1], p.currentAge, p.endAge - 1); };
      return null;
    }
    if (a.id === 'save') return function () { p.annualSavings = p.annualSavings + a.cost; };
    if (a.id === 'mix') {
      var m3 = /Hold (\d+)%/.exec(a.title);
      if (m3) return function () { p.stocks = clamp(+m3[1] / 100, 0, 1); };
      return null;
    }
    if (a.id === 'flex') return function () { p.strategy = 'guardrails'; };
    if (a.id === 'fees') return function () { p.fees = 0.0005; };
    if (a.id === 'defer') return function () {
      var k = -1;
      for (var i = 0; i < p.incomes.length; i++) {
        if (p.incomes[i] && p.incomes[i].cola !== false && /social|security|state pension/i.test(p.incomes[i].label || '')) { k = i; break; }
      }
      if (k < 0) return;
      p.incomes[k].amount = Math.round(p.incomes[k].amount * A.deferFactor(p.incomes[k].from, 70));
      p.incomes[k].from = 70;
    };
    return null;
  }

  function renderWorst() {
    var r = state.result, p = state.plan;
    var host = $('worstBody');
    host.textContent = '';
    if (!r || !r.worst) return;
    var w = r.worst;
    var wname = retiredIn(w);
    $('worstHead').textContent = wname ? 'If you had retired in ' + wname : 'The worst run';
    $('worstSub').textContent = w.failed
      ? 'The single worst stretch in the record for this plan.'
      : 'The worst stretch in the record for this plan — and it still held.';

    line(host, 'Started with', money(w.balances[Math.min(w.retireYear, w.balances.length - 1)]));
    line(host, 'Lowest it ever got', money(w.lowest));
    if (w.failed) {
      line(host, 'Ran out at age', String(Math.floor(w.failAge)),
        'bad', (p.endAge - Math.floor(w.failAge)) + ' years short');
    } else {
      line(host, 'Ended at ' + p.endAge + ' with', money(w.final), 'ok', 'never ran out');
    }
    if (r.firstFail && r.firstFail !== w && retiredIn(r.firstFail)) {
      line(host, 'Also ran out', retiredIn(r.firstFail));
    }
    var note = document.createElement('p');
    note.className = 'read';
    note.textContent = '';
    if (r.kind === 'bootstrap') {
      add(note, 'These lifetimes are stitched from real five-year blocks, so a run this bad is one history could plausibly have dealt — it simply never dealt exactly this one.');
    } else {
      var yr = wname ? parseInt(wname.replace(/\D+/g, ''), 10) : 0;
      if (yr >= 1962 && yr <= 1982) {
        add(note, 'That is the inflation era, and it — not 1929 — is the worst thing that has ever happened to American retirees. ');
        addB(note, 'A crash that ends quickly is survivable.');
        add(note, ' Fifteen years of inflation eating a portfolio you are already drawing on is what actually empties it, which is why this app keeps every number in today’s money.');
      } else if (yr >= 1925 && yr <= 1934) {
        add(note, 'The Crash and the Depression — a real-terms fall of about ');
        addB(note, '77%');
        add(note, ' in under three years. What saved the retirees who survived it is the part nobody expects: prices FELL for years afterwards, so a fixed budget bought MORE each year. That is why a plan can come through 1929 and still be emptied by the 1960s.');
      } else if (yr >= 1998 && yr <= 2010) {
        add(note, 'Two crashes eight years apart, at the start of a retirement, is the shape that does the damage — the losses land while the withdrawals are still coming out of a full-sized portfolio.');
      } else {
        add(note, 'The worst run is rarely the year people expect. What decides a retirement is not how deep the fall is but ');
        addB(note, 'how early it lands');
        add(note, ' — the first ten years explain most of the outcome, and the last twenty explain almost none of it.');
      }
    }
    host.appendChild(note);
  }

  function line(host, label, value, cls, pill) {
    var d = document.createElement('div');
    d.className = 'worst-line';
    var s = document.createElement('span');
    s.textContent = label;
    var b = document.createElement('b');
    b.textContent = value;
    d.appendChild(s);
    var right = document.createElement('span');
    right.appendChild(b);
    if (pill) {
      var pl = document.createElement('span');
      pl.className = 'pill ' + (cls || '');
      pl.textContent = pill;
      right.appendChild(document.createTextNode(' '));
      right.appendChild(pl);
    }
    d.appendChild(right);
    host.appendChild(d);
  }

  // ---- scenarios -------------------------------------------------------------

  function byId(id) {
    for (var i = 0; i < state.scenarios.length; i++) if (state.scenarios[i].id === id) return state.scenarios[i];
    return null;
  }
  function activeName() {
    var s = byId(state.activeId);
    return s ? s.name : 'My plan';
  }
  function cmpName() {
    var s = byId(state.compareId);
    return s ? s.name : 'Other plan';
  }

  function clonePlan(p) { return JSON.parse(JSON.stringify(p)); }

  /* A cycle is named by the month the RETIREMENT began, never the month the
   * plan started. "Retiring in 1966" is a fact a reader can check against what
   * they already know; "a plan that started in 1941" is trivia about our loop. */
  function retiredIn(run) {
    if (!run || run.startIdx === undefined || run.startLabel === null) return null;
    return S.monthName(run.startIdx + run.retireYear * 12);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  async function saveScenario(name) {
    if (!state.db) return;
    var rec;
    if (name === undefined && state.activeId) {
      rec = byId(state.activeId);
      if (rec) { rec.plan = clonePlan(state.plan); rec.updated = today(); }
    }
    if (!rec) {
      rec = {
        id: undefined,
        name: (name || 'My plan').slice(0, 60),
        plan: clonePlan(state.plan),
        created: today(), updated: today()
      };
    }
    var saved = await state.db.put(rec);
    state.activeId = saved.id;
    state.dirty = false;
    await refreshScenarios();
    paintScenarioBar();
  }

  async function refreshScenarios() {
    if (!state.db) return;
    var all = await state.db.getAll();
    all.sort(function (a, b) { return String(a.created).localeCompare(String(b.created)); });
    state.scenarios = all;
  }

  /* Dark is the default because this app lives on a dark desktop, and an app
   * that flips to white inside a dark OS on first open reads as a bug. The
   * choice is remembered per device, in the PRIVATE collection — a guest who
   * joins through an Invite keeps their own eyes' preference rather than
   * inheriting the host's.
   */
  function applyTheme() {
    var light = state.theme === 'light';
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    var b = $('btnTheme');
    b.setAttribute('aria-pressed', light ? 'true' : 'false');
    var label = light ? 'Switch to the dark theme' : 'Switch to the light theme';
    b.title = label;
    b.setAttribute('aria-label', label);
    readColours();
  }

  function paintScenarioBar() {
    $('scenLabel').textContent = activeName();
    $('dirty').hidden = !state.activeId || !state.dirty;
    var u = $('btnUndo');
    u.hidden = !state.undo;
    if (state.undo) u.title = 'Undo: ' + state.undo.what;
    $('btnCompare').disabled = state.scenarios.length < 2;
    $('btnCompare').setAttribute('aria-pressed', state.comparing ? 'true' : 'false');
  }

  function openMenu() {
    var m = $('scenMenu');
    m.textContent = '';
    var head = document.createElement('div');
    head.className = 'menu-head';
    head.textContent = state.scenarios.length ? 'Saved plans' : 'No saved plans yet';
    m.appendChild(head);

    state.scenarios.forEach(function (sc) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item';
      var t = document.createElement('span');
      t.className = 'tick';
      t.textContent = sc.id === state.activeId ? '✓' : '';
      var n = document.createElement('span');
      n.className = 'mi-name';
      n.textContent = sc.name;                    // user text — textContent, always
      var s = document.createElement('span');
      s.className = 'mi-sub';
      s.textContent = sc.plan ? 'retire ' + sc.plan.retireAge : '';
      b.appendChild(t); b.appendChild(n); b.appendChild(s);
      b.addEventListener('click', function () { loadScenario(sc.id); closeMenu(); });
      m.appendChild(b);
    });

    m.appendChild(sep());
    m.appendChild(menuAction('Rename this plan…', function () {
      closeMenu();
      askName('Rename plan', activeName(), function (v) {
        var sc = byId(state.activeId);
        if (sc) { sc.name = v; state.db.put(sc).then(function () { refreshScenarios().then(paintScenarioBar); }); }
      });
    }, !state.activeId));
    m.appendChild(menuAction('Duplicate this plan', function () {
      closeMenu();
      askName('Duplicate plan', activeName() + ' (copy)', function (v) {
        state.activeId = null;
        saveScenario(v);
      });
    }));
    m.appendChild(menuAction('Delete this plan', function () {
      closeMenu();
      var sc = byId(state.activeId);
      if (!sc) return;
      confirmBox('Delete “' + sc.name + '”?', 'This cannot be undone.', function () {
        state.db.delete(sc.id).then(function () {
          if (state.compareId === sc.id) { state.compareId = null; state.comparing = false; }
          state.activeId = null;
          refreshScenarios().then(function () { paintScenarioBar(); schedule(); });
        });
      });
    }, !state.activeId, true));

    m.hidden = false;
    var r = $('scenPick').getBoundingClientRect();
    m.style.left = Math.max(6, r.left) + 'px';
    m.style.top = (r.bottom + 4) + 'px';
    $('scenPick').setAttribute('aria-expanded', 'true');
  }
  function sep() { var d = document.createElement('div'); d.className = 'menu-sep'; return d; }
  function menuAction(label, fn, disabled, danger) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-item' + (danger ? ' danger' : '');
    b.textContent = label;
    if (danger) b.style.color = COL.critical;
    if (disabled) { b.disabled = true; b.style.opacity = '.4'; }
    else b.addEventListener('click', fn);
    return b;
  }
  function closeMenu() {
    $('scenMenu').hidden = true;
    $('scenPick').setAttribute('aria-expanded', 'false');
  }

  async function loadScenario(id) {
    var sc = byId(id);
    if (!sc || !sc.plan) return;
    state.plan = Object.assign(defaults(), clonePlan(sc.plan));
    state.activeId = id;
    state.dirty = false;
    writeForm();
    paintScenarioBar();
    schedule();
    savePrefs();
  }

  // ---- compare ---------------------------------------------------------------

  function toggleCompare() {
    if (state.comparing) {
      state.comparing = false;
      state.compareId = null;
      paintScenarioBar();
      schedule();
      savePrefs();
      return;
    }
    var others = state.scenarios.filter(function (s) { return s.id !== state.activeId; });
    if (!others.length) return;
    pickBox('Compare with', others, function (id) {
      state.compareId = id;
      state.comparing = true;
      paintScenarioBar();
      schedule();
      savePrefs();
    });
  }

  // ---- modals ----------------------------------------------------------------

  var modalOnOk = null;

  function showModal(title, buildBody, onOk, okLabel) {
    $('modalOk').hidden = false;
    $('modalTitle').textContent = title;
    var body = $('modalBody');
    body.textContent = '';
    buildBody(body);
    modalOnOk = onOk;
    $('modalOk').textContent = okLabel || 'Save';
    $('modal').hidden = false;
    var f = body.querySelector('input, button');
    if (f) setTimeout(function () { f.focus(); if (f.select) f.select(); }, 20);
  }
  function hideModal() { $('modal').hidden = true; modalOnOk = null; }

  function askName(title, value, done) {
    var input;
    showModal(title, function (body) {
      var f = document.createElement('div');
      f.className = 'field';
      var l = document.createElement('label');
      l.textContent = 'Name';
      l.htmlFor = 'nameField';
      input = mkInput('text', value, '');
      input.id = 'nameField';
      input.maxLength = 60;
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); $('modalOk').click(); }
      });
      f.appendChild(l); f.appendChild(input);
      body.appendChild(f);
    }, function () {
      var v = input.value.trim();
      if (v) done(v.slice(0, 60));
    });
  }

  function confirmBox(title, text, done) {
    showModal(title, function (body) {
      var p = document.createElement('p');
      p.className = 'hint';
      p.textContent = text;
      body.appendChild(p);
    }, done, 'Delete');
  }

  function pickBox(title, list, done) {
    showModal(title, function (body) {
      list.forEach(function (sc) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu-item';
        b.textContent = sc.name;
        b.addEventListener('click', function () { hideModal(); done(sc.id); });
        body.appendChild(b);
      });
    }, null, 'Close');
    // pickBox has no confirm step — you pick by clicking a plan — so the second
    // button is dismissal, and there is no sense in two buttons both saying
    // Cancel. There is one.
    $('modalOk').hidden = true;
  }

  // ---- persistence -----------------------------------------------------------

  var draftTimer = null;
  function saveDraft() {
    if (!state.prefsDb) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      state.prefsDb.put({ id: 'draft', plan: clonePlan(state.plan) }).catch(noop);
    }, 500);
  }
  function savePrefs() {
    if (!state.prefsDb) return;
    state.prefsDb.put({
      id: 'ui', activeId: state.activeId, compareId: state.compareId,
      comparing: state.comparing, theme: state.theme
    }).catch(noop);
  }
  function noop() {}

  // ---- wiring ----------------------------------------------------------------

  function bindNumber(id, apply) {
    var e = $(id);
    e.addEventListener('input', function () { apply(); touched(); });
    e.addEventListener('blur', function () { writeForm(); });
  }
  function bindMoney(id, rangeId) {
    var e = $(id), r = rangeId ? $(rangeId) : null;
    e.addEventListener('input', function () {
      readForm();
      if (r) r.value = clamp(parseMoney(e.value), +r.min, +r.max);
      touched();
    });
    e.addEventListener('blur', function () { e.value = fmtMoneyInput(parseMoney(e.value)); });
    if (r) {
      r.addEventListener('input', function () {
        e.value = fmtMoneyInput(+r.value);
        touched();
      });
      dragBind(r);
    }
  }
  // While a slider is held the sweep samples every fourth cycle, so the chart
  // moves with the thumb; on release it re-runs at full resolution.
  function dragBind(el) {
    el.addEventListener('pointerdown', function () { dragging = true; });
    var up = function () { if (dragging) { dragging = false; schedule(); } };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', function () { dragging = false; });
  }

  function wire() {
    bindNumber('fAge', noop);
    bindNumber('fEnd', noop);
    $('fRetire').addEventListener('input', function () {
      $('fRetireR').value = $('fRetire').value; touched();
    });
    $('fRetireR').addEventListener('input', function () {
      $('fRetire').value = $('fRetireR').value; touched();
    });
    dragBind($('fRetireR'));

    bindMoney('fPot');
    bindMoney('fSave');
    bindMoney('fSpend', 'fSpendR');

    ['fStocks', 'fFees', 'fRate', 'fTarget', 'fGlideTo'].forEach(function (id) {
      $(id).addEventListener('input', touched);
      dragBind($(id));
    });
    $('fGlideBy').addEventListener('input', touched);
    $('fGlide').addEventListener('change', function () {
      $('glideRow').hidden = !$('fGlide').checked;
      touched();
    });

    $('spanPick').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      state.span = b.getAttribute('data-v');
      var all = $('spanPick').querySelectorAll('button');
      for (var i = 0; i < all.length; i++) {
        all[i].setAttribute('aria-checked', all[i] === b ? 'true' : 'false');
      }
      renderFan();
    });

    $('whoPick').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      state.who = b.getAttribute('data-v');
      var all = $('whoPick').querySelectorAll('button');
      for (var i = 0; i < all.length; i++) {
        all[i].setAttribute('aria-checked', all[i] === b ? 'true' : 'false');
      }
      renderStates();
    });

    $('modePick').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      state.plan.mode = b.getAttribute('data-v');
      renderModePicker(); touched();
    });

    $('btnAddIncome').addEventListener('click', function () {
      // ZERO, not a helpful-looking default. Clicking Add and touching nothing
      // used to be worth $12,000 a year indexed for life, which flipped the
      // verdict from "tighter than it looks" to "lasted every single time"
      // without the reader typing a character.
      state.plan.incomes.push({ label: '', amount: 0, from: state.plan.retireAge, to: null, cola: true });
      renderIncomes(); touched();
      var rows = $('incomeList').querySelectorAll('.r-name');
      if (rows.length) rows[rows.length - 1].focus();
    });
    function addEvent(ev) {
      state.plan.events.push(ev);
      $('secEvents').open = true;
      renderEvents(); touched();
      var rows = $('eventList').querySelectorAll('.r-name');
      if (rows.length) rows[rows.length - 1].focus();
    }
    $('btnAddEvent').addEventListener('click', function () {
      addEvent({ label: '', amount: 0, at: state.plan.retireAge, years: 1 });
    });
    // College is the one nearly everybody needs and nearly nobody models: a big
    // outflow, several years long, landing in the decade before retirement —
    // which is exactly the decade the plan can least afford it.
    $('btnAddCollege').addEventListener('click', function () {
      addEvent({
        label: 'College', amount: -30000,
        at: clamp(state.plan.currentAge + 10, state.plan.currentAge, state.plan.endAge - 1),
        years: 4
      });
    });

    $('btnReset').addEventListener('click', function () {
      state.plan = defaults();
      writeForm(); touched();
    });

    $('scenPick').addEventListener('click', function (e) {
      e.stopPropagation();
      if ($('scenMenu').hidden) openMenu(); else closeMenu();
    });
    document.addEventListener('click', function (e) {
      if (!$('scenMenu').hidden && !$('scenMenu').contains(e.target)) closeMenu();
    });
    $('btnSave').addEventListener('click', function () {
      if (state.activeId) saveScenario();
      else askName('Name this plan', suggestName(), function (v) { saveScenario(v); });
    });
    // NEW USED TO BE DESTRUCTIVE AND SILENT. It reset all six fields to the
    // factory defaults, and the non-destructive option — Duplicate — was three
    // items down a dropdown behind the plan's name. The visible button did the
    // damaging thing. Now it asks, and starting from what you have is first.
    $('btnNew').addEventListener('click', function () {
      var from = clonePlan(state.plan);
      showModal('Start another plan', function (body) {
        var p1 = document.createElement('p');
        p1.className = 'hint';
        p1.textContent = 'Your current plan is kept either way.';
        body.appendChild(p1);
        [['Copy of this one', true], ['Blank, from the defaults', false]].forEach(function (opt) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'menu-item';
          b.textContent = opt[0];
          b.addEventListener('click', function () {
            hideModal();
            askName('Name it', opt[1] ? activeName() + ' (copy)' : 'Plan ' + (state.scenarios.length + 1),
              function (v) {
                state.plan = opt[1] ? from : defaults();
                state.activeId = null;
                writeForm();
                saveScenario(v).then(function () { readForm(); schedule(); });
              });
          });
          body.appendChild(b);
        });
      }, null, 'Cancel');
      $('modalOk').hidden = true;
    });
    $('btnCompare').addEventListener('click', toggleCompare);
    $('btnUndo').addEventListener('click', function () {
      if (!state.undo) return;
      state.plan = state.undo.plan;
      state.undo = null;
      writeForm(); readForm(); schedule(); paintScenarioBar();
    });
    $('btnTheme').addEventListener('click', function () {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme();
      if (state.result) renderAll();
      savePrefs();
    });

    $('modalCancel').addEventListener('click', hideModal);
    $('modalOk').addEventListener('click', function () {
      var fn = modalOnOk;
      hideModal();
      if (fn) fn();
    });
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) hideModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('modal').hidden) hideModal();
      else if (!$('scenMenu').hidden) closeMenu();
    });

    var rt = null;
    window.addEventListener('resize', function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () { if (state.result) renderAll(); }, 150);
    });
  }

  function suggestName() {
    return 'Retire at ' + state.plan.retireAge;
  }

  // ---- boot ------------------------------------------------------------------

  async function boot() {
    wire();
    applyTheme();

    if (window.gifos) {
      try {
        state.db = gifos.db('scenarios');
        state.prefsDb = gifos.db('prefs');
        await refreshScenarios();
        var ui = await state.prefsDb.get('ui').catch(function () { return null; });
        var draft = await state.prefsDb.get('draft').catch(function () { return null; });
        if (ui && (ui.theme === 'light' || ui.theme === 'dark')) state.theme = ui.theme;
        if (ui && ui.activeId && byId(ui.activeId)) {
          state.activeId = ui.activeId;
          state.compareId = ui.compareId && byId(ui.compareId) ? ui.compareId : null;
          state.comparing = !!ui.comparing && !!state.compareId;
          state.plan = Object.assign(defaults(), clonePlan(byId(ui.activeId).plan));
        } else if (draft && draft.plan) {
          state.plan = Object.assign(defaults(), clonePlan(draft.plan));
        }
        // Another tab, or a partner on the far end of an Invite link, editing
        // the same set of plans.
        state.db.subscribe(function (all) {
          all.sort(function (a, b) { return String(a.created).localeCompare(String(b.created)); });
          state.scenarios = all;
          paintScenarioBar();
          if (!$('scenMenu').hidden) openMenu();
        });
        if (gifos.onBack) {
          gifos.onBack(function () {
            if (!$('modal').hidden) hideModal();
            else if (!$('scenMenu').hidden) closeMenu();
          });
        }
      } catch (e) {
        // Saving is off, or the ability was declined. The calculator still works;
        // it just cannot remember. Say so rather than failing silently.
        state.db = null; state.prefsDb = null;
      }
    }

    if (!state.db) {
      $('btnSave').disabled = true;
      $('btnNew').disabled = true;
      $('btnSave').title = 'Saving is turned off for this app.';
    }

    applyTheme();
    writeForm();
    paintScenarioBar();
    readForm();
    computeMain();
    computeExtras();

    $('footData').textContent = 'Prices, dividends, bond returns and inflation from Robert Shiller’s '
      + 'monthly record, ' + MARKET.start[0] + ' to ' + MARKET.end[0] + '. '
      + 'It travels inside this app, so none of this needs the internet.';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.RetirementApp = { state: state, defaults: defaults, parseMoney: parseMoney, boot: boot };
}());
