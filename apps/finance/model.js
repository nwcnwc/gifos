/* model.js — accounts, what they add up to, and what that means for a plan.
 *
 * Three jobs, in order of how much argument each one contains:
 *
 *   ACCOUNTS AND NET WORTH is arithmetic. The only judgement is which kinds of
 *   thing count as money you could actually retire on, which is why KINDS
 *   below carries that as a property of the kind rather than leaving each
 *   screen to decide it again.
 *
 *   THE LEDGER is arithmetic with one trap in it: TRANSFERS. Move $2,000 from
 *   checking to a brokerage and a naive reading sees $2,000 of income and
 *   $2,000 of spending in the same month. Pay a credit card and it sees it
 *   twice more. Both numbers are then wrong, in opposite directions, and the
 *   savings rate that falls out of them is meaningless. So transfers are
 *   FOUND and excluded, and how confidently is reported.
 *
 *   THE PLAN is a derivation, and it is the one place here that could mislead.
 *   Everything it produces is measured from months that actually have data,
 *   and it says which months those were.
 *
 * Pure: objects in, objects out.
 */
(function (root) {
  'use strict';

  /* Every kind of thing that can move a net worth, and the two facts about
   * each that the rest of the app needs. `sign` is which side of the balance
   * sheet it lands on. `pot` is whether it is money a retirement plan can
   * spend: a brokerage account is, a house is not — you cannot eat a third of
   * a kitchen a year — and a 529 is not either, because it is already
   * committed to somebody's tuition. Getting `pot` wrong is how a plan tells
   * somebody they can retire on a house. */
  var KINDS = [
    { id: 'checking',   label: 'Checking',            sign: 1,  pot: true,  group: 'Cash' },
    { id: 'savings',    label: 'Savings',             sign: 1,  pot: true,  group: 'Cash' },
    { id: 'cash',       label: 'Cash',                sign: 1,  pot: true,  group: 'Cash' },
    { id: 'brokerage',  label: 'Brokerage',           sign: 1,  pot: true,  group: 'Investments' },
    { id: 'retirement', label: 'Retirement account',  sign: 1,  pot: true,  group: 'Investments' },
    { id: 'hsa',        label: 'Health savings (HSA)', sign: 1, pot: true,  group: 'Investments' },
    { id: 'crypto',     label: 'Crypto',              sign: 1,  pot: true,  group: 'Investments' },
    { id: 'education',  label: 'Education savings (529)', sign: 1, pot: false, group: 'Investments' },
    { id: 'property',   label: 'Property',            sign: 1,  pot: false, group: 'Property & things' },
    { id: 'vehicle',    label: 'Vehicle',             sign: 1,  pot: false, group: 'Property & things' },
    { id: 'valuable',   label: 'Something else you own', sign: 1, pot: false, group: 'Property & things' },
    { id: 'owed_to_me', label: 'Money owed to you',   sign: 1,  pot: false, group: 'Property & things' },
    { id: 'card',       label: 'Credit card',         sign: -1, pot: false, group: 'What you owe' },
    { id: 'mortgage',   label: 'Mortgage',            sign: -1, pot: false, group: 'What you owe' },
    { id: 'student',    label: 'Student loan',        sign: -1, pot: false, group: 'What you owe' },
    { id: 'auto_loan',  label: 'Car loan',            sign: -1, pot: false, group: 'What you owe' },
    { id: 'loan',       label: 'Another loan',        sign: -1, pot: false, group: 'What you owe' },
  ];
  var KIND = {};
  KINDS.forEach(function (k) { KIND[k.id] = k; });
  var GROUPS = ['Cash', 'Investments', 'Property & things', 'What you owe'];

  function kindOf(a) { return KIND[a && a.kind] || KIND.checking; }
  function isDebt(a) { return kindOf(a).sign < 0; }

  /* A liability's balance is stored as the POSITIVE amount you owe, because
   * that is the number on the statement and the number the user will type. It
   * is negated here, once, and nowhere else. */
  function signed(a) {
    var b = Number(a && a.balance) || 0;
    return kindOf(a).sign < 0 ? -Math.abs(b) : b;
  }

  function netWorth(accounts) {
    var assets = 0, debts = 0, pot = 0, illiquid = 0, byKind = {}, byGroup = {};
    (accounts || []).forEach(function (a) {
      if (a.archived) return;
      var k = kindOf(a), v = signed(a);
      if (k.sign < 0) debts += Math.abs(v); else assets += v;
      if (k.sign > 0) { if (k.pot) pot += v; else illiquid += v; }
      byKind[k.id] = (byKind[k.id] || 0) + Math.abs(v);
      byGroup[k.group] = (byGroup[k.group] || 0) + Math.abs(v);
    });
    return {
      total: assets - debts, assets: assets, debts: debts,
      pot: pot, illiquid: illiquid, byKind: byKind, byGroup: byGroup,
    };
  }

  // ---- the ledger ----------------------------------------------------------

  /* One transaction is the same transaction as another if it is on the same
   * account, the same day, for the same amount, with the same description.
   * That is what makes re-importing an overlapping export safe — and
   * overlapping exports are the normal case, because "last 90 days" is what
   * most banks offer and nobody downloads on an exact schedule.
   *
   * The bank's own id wins when there is one. Without it, the fallback has a
   * real failure mode worth stating: two genuinely separate identical
   * purchases on one day (two $3.50 coffees) collapse into one. So the key
   * carries an OCCURRENCE INDEX — the second identical row in a single file is
   * distinct from the first — which gets both coffees in from one file, and
   * still dedupes them correctly when that file is imported twice. */
  function txKey(accountId, t, occurrence) {
    if (t.srcId) return accountId + '|#' + t.srcId;
    var d = String(t.desc || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim().slice(0, 40);
    return accountId + '|' + t.date + '|' + t.amount.toFixed(2) + '|' + d + '|' + (occurrence || 0);
  }
  function keyed(accountId, list) {
    var seen = {}, out = [];
    (list || []).forEach(function (t) {
      var base = txKey(accountId, t, 0), n = 0, k = base;
      while (seen[k]) { n++; k = txKey(accountId, t, n); }
      seen[k] = 1;
      out.push(Object.assign({}, t, { id: k, account: accountId }));
    });
    return out;
  }
  // What of `incoming` is not already in `existing` (an array of ids).
  function newOnly(existing, incoming) {
    var have = {};
    (existing || []).forEach(function (id) { have[id] = 1; });
    return incoming.filter(function (t) { return !have[t.id]; });
  }

  /* TRANSFERS. Money leaving one of your accounts and arriving in another is
   * not income and not spending; counting it as either is the single biggest
   * way a tracker lies to you. A transfer is a matched PAIR: opposite signs,
   * the same amount, on DIFFERENT accounts, within a few days.
   *
   * Matched greedily, nearest in time first, each side used once. Deliberately
   * NOT matched on description — "ONLINE TRANSFER" and "PAYMENT THANK YOU" are
   * the same event written by two banks that have never spoken, and requiring
   * the words to agree would miss nearly all of them. The amount and the dates
   * are what both sides genuinely agree on.
   *
   * The cost of the loose rule is a false positive: a $50 refund on one card
   * on the same day as a $50 purchase on another reads as a transfer. It is
   * rare, it is bounded (one pair), and the alternative — missing every credit
   * card payment you make — is not close. Every pair found is listed in the
   * app so it can be looked at. */
  function findTransfers(tx, windowDays) {
    var win = (windowDays === undefined ? 4 : windowDays) * 86400000;
    var outs = tx.filter(function (t) { return t.amount < 0; }).slice();
    var ins = tx.filter(function (t) { return t.amount > 0; }).slice();
    var byAmount = {};
    ins.forEach(function (t) {
      var k = Math.abs(t.amount).toFixed(2);
      (byAmount[k] = byAmount[k] || []).push(t);
    });
    var used = {}, pairs = [];
    outs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    outs.forEach(function (o) {
      var cands = byAmount[Math.abs(o.amount).toFixed(2)];
      if (!cands) return;
      var ot = Date.parse(o.date), best = null, bestGap = Infinity;
      cands.forEach(function (c) {
        if (used[c.id] || c.account === o.account) return;
        var gap = Math.abs(Date.parse(c.date) - ot);
        if (gap <= win && gap < bestGap) { bestGap = gap; best = c; }
      });
      if (best) { used[best.id] = 1; used[o.id] = 1; pairs.push({ out: o, in: best }); }
    });
    return { pairs: pairs, ids: used };
  }

  var monthOf = function (d) { return String(d).slice(0, 7); };

  /* Income and spending per calendar month, transfers removed. `complete` is
   * the months that are not the first or last in the data: a month you have
   * eleven days of is not a month you spent that little in, and averaging it
   * in is how a tracker tells you your spending fell 60% because you imported
   * mid-month. */
  function monthly(tx, opts) {
    opts = opts || {};
    var xf = opts.transfers || findTransfers(tx).ids;
    var m = {};
    tx.forEach(function (t) {
      if (xf[t.id]) return;
      var k = monthOf(t.date);
      var e = m[k] || (m[k] = { month: k, income: 0, spend: 0, n: 0 });
      if (t.amount > 0) e.income += t.amount; else e.spend += -t.amount;
      e.n++;
    });
    var months = Object.keys(m).sort().map(function (k) {
      m[k].net = m[k].income - m[k].spend;
      return m[k];
    });
    // Partial ends: the first and last month are only complete if the data
    // actually starts on/before the 1st and ends on/after the 28th.
    if (months.length) {
      var dates = tx.map(function (t) { return t.date; }).sort();
      var first = dates[0], last = dates[dates.length - 1];
      months[0].partial = Number(first.slice(8, 10)) > 1;
      months[months.length - 1].partial = Number(last.slice(8, 10)) < 28;
      if (months.length === 1) months[0].partial = months[0].partial || Number(last.slice(8, 10)) < 28;
    }
    return months;
  }

  /* THE PLAN. What the Retirement Calculator opens on, worked out from what is
   * actually here — and never from less than three complete months, because a
   * yearly figure extrapolated from one month of statements is a guess wearing
   * a number's clothes. Under that bar it returns what it knows (the balance
   * sheet, which is a fact) and leaves the flows null for the user to type. */
  function derivePlan(accounts, tx, prefs) {
    prefs = prefs || {};
    var nw = netWorth(accounts);
    var out = {
      currentAge: prefs.age || null,
      netWorth: Math.round(nw.total),
      portfolio: Math.round(nw.pot),
      illiquid: Math.round(nw.illiquid),
      debts: Math.round(nw.debts),
      annualSavings: null, annualSpend: null,
      asOf: todayISO(),
      basis: null,
    };
    var xf = findTransfers(tx);
    var months = monthly(tx, { transfers: xf.ids }).filter(function (m) { return !m.partial; });
    // Most recent 12 complete months. More than that and a job change three
    // years ago is still setting today's spending forecast.
    var use = months.slice(-12);
    if (use.length >= 3) {
      var spend = use.reduce(function (a, m) { return a + m.spend; }, 0) / use.length;
      var income = use.reduce(function (a, m) { return a + m.income; }, 0) / use.length;
      out.annualSpend = Math.round(spend * 12);
      out.annualSavings = Math.max(0, Math.round((income - spend) * 12));
      out.basis = {
        months: use.length, from: use[0].month, to: use[use.length - 1].month,
        transfers: xf.pairs.length,
        monthlyIncome: Math.round(income), monthlySpend: Math.round(spend),
      };
    }
    return out;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* A snapshot is a dated net worth, and it is the only thing here that cannot
   * be recomputed later: balances get overwritten every time you refresh, so
   * unless the number is written down the day it was true, the history is gone
   * for good. Taken at most once a day — a second one on the same date
   * replaces the first rather than making the chart lumpy. */
  function snapshot(accounts) {
    var nw = netWorth(accounts);
    return {
      id: 'nw_' + todayISO(), date: todayISO(),
      total: Math.round(nw.total), assets: Math.round(nw.assets), debts: Math.round(nw.debts),
      pot: Math.round(nw.pot), illiquid: Math.round(nw.illiquid), byGroup: nw.byGroup,
    };
  }

  root.FinModel = {
    KINDS: KINDS, KIND: KIND, GROUPS: GROUPS,
    kindOf: kindOf, isDebt: isDebt, signed: signed,
    netWorth: netWorth, txKey: txKey, keyed: keyed, newOnly: newOnly,
    findTransfers: findTransfers, monthly: monthly, derivePlan: derivePlan,
    snapshot: snapshot, todayISO: todayISO, monthOf: monthOf,
  };
})(typeof window !== 'undefined' ? window : this);
