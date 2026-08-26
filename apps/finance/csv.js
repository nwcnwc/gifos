/* csv.js — turning whatever a bank hands you into transactions.
 *
 * There is no CSV standard for a bank statement, and after reading a pile of
 * real exports the only safe assumption is that every field this file cares
 * about is optional, mis-named, or written in a format that means two things.
 * So nothing here is hard-coded to an institution: the file is SNIFFED, and
 * every guess it makes is handed back as a plan the user can see and override
 * before a single row is imported. A wrong guess made visibly is a fixable
 * mistake; a wrong guess made silently is a year of bad numbers.
 *
 * The four that actually bite, all of which are guessed here and all of which
 * are shown in the import preview:
 *
 *   1. THE HEADER IS NOT ROW 0. Banks print an account name, a date range and
 *      a blank line above the columns. So the header is FOUND (the first row
 *      that looks like column names), not assumed.
 *   2. 03/04/2026 IS TWO DIFFERENT DAYS. It is March 4th in the US and April
 *      3rd nearly everywhere else, and the file does not say which. The whole
 *      column is scanned for a value that can only be read one way; if none
 *      exists the ambiguity is REPORTED rather than resolved by coin flip.
 *   3. MONEY OUT IS SOMETIMES A POSITIVE NUMBER. Three conventions are in
 *      the wild: one signed Amount column; separate Debit and Credit columns;
 *      and an Amount column whose sign is decided by a neighbouring
 *      DR/CR/type column. All three are handled, and credit cards invert the
 *      lot (a charge is a positive number that makes you poorer).
 *   4. 1.234,56 IS ONE THOUSAND TWO HUNDRED. Decimal comma, thousands dot.
 *      Guessing from a single value is impossible; the column decides.
 *
 * Everything in here is pure: text in, plain objects out, no DOM, no storage.
 */
(function (root) {
  'use strict';

  // ---- 1. the grid ---------------------------------------------------------

  // Comma, semicolon or tab. Counted OUTSIDE quotes only — a description like
  // "SMITH, JOHN" would otherwise elect the comma in a semicolon file.
  function detectDelim(text) {
    var sample = text.slice(0, 64 * 1024);
    var best = ',', bestScore = -1;
    [',', ';', '\t', '|'].forEach(function (d) {
      var q = false, n = 0;
      for (var i = 0; i < sample.length; i++) {
        var c = sample[i];
        if (c === '"') q = !q;
        else if (!q && c === d) n++;
      }
      if (n > bestScore) { bestScore = n; best = d; }
    });
    return bestScore > 0 ? best : ',';
  }

  // RFC 4180: quotes protect delimiters AND newlines, "" is a literal quote.
  // Rolled by hand rather than split() because a description field containing
  // a comma or a line break is completely ordinary in a bank export.
  function parse(text, delim) {
    text = String(text || '').replace(/^﻿/, '');          // Excel's BOM
    delim = delim || detectDelim(text);
    var rows = [], row = [], field = '', q = false, i = 0;
    function endField() { row.push(field); field = ''; }
    function endRow() { endField(); rows.push(row); row = []; }
    while (i < text.length) {
      var c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === delim) { endField(); i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { endRow(); i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) endRow();
    // Trailing blank lines are universal and mean nothing.
    while (rows.length && rows[rows.length - 1].every(function (f) { return !String(f).trim(); })) rows.pop();
    return { rows: rows, delim: delim };
  }

  // ---- 2. money ------------------------------------------------------------

  // A column, not a value, decides where the decimal point is: "1.234" alone
  // is unknowable, but a column containing "1.234,56" is not.
  function sniffDecimal(values) {
    var comma = 0, dot = 0;
    values.forEach(function (v) {
      v = String(v || '').replace(/[^\d.,-]/g, '');
      if (/,\d{1,2}$/.test(v) && /\.\d{3}/.test(v)) comma += 3;   // 1.234,56 — decisive
      else if (/\.\d{1,2}$/.test(v) && /,\d{3}/.test(v)) dot += 3; // 1,234.56 — decisive
      else if (/,\d{1,2}$/.test(v)) comma++;
      else if (/\.\d{1,2}$/.test(v)) dot++;
    });
    return comma > dot ? ',' : '.';
  }

  // Handles $, £, €, thin spaces, (123.45) for negative, trailing -, CR/DR
  // suffixes. Returns null for anything that isn't a number, so a blank cell
  // and a zero stay distinguishable.
  function parseMoney(s, dec) {
    if (s === null || s === undefined) return null;
    var t = String(s).trim();
    if (!t) return null;
    var neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (/\bDR\b|\bDEBIT\b/i.test(t)) neg = true;
    t = t.replace(/\b(CR|DR|CREDIT|DEBIT)\b/ig, '');
    t = t.replace(/[^\d.,+-]/g, '');                     // currency marks, spaces
    if (/-\s*$/.test(t)) { neg = true; t = t.replace(/-\s*$/, ''); }
    if (t[0] === '-') { neg = !neg; t = t.slice(1); }
    if (t[0] === '+') t = t.slice(1);
    if (dec === ',') t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
    var n = parseFloat(t);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  // ---- 3. dates ------------------------------------------------------------

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  // Split a date into its three numbers plus which shape it was written in.
  // Returns null if it is not a date at all.
  function dateParts(s) {
    var t = String(s || '').trim();
    if (!t) return null;
    t = t.replace(/^[A-Za-z]{3},?\s+/, '');                // "Mon, 12 Jan 2026"
    t = t.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/, '');    // drop a time
    var m;
    // 2026-01-12 / 2026/01/12 — unambiguous, and what SimpleFIN-adjacent
    // exports and anything modern produce.
    if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) {
      return { y: +m[1], a: +m[2], b: +m[3], iso: true };
    }
    // 12 Jan 2026 / Jan 12, 2026 — named months are unambiguous too.
    if ((m = t.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{2,4})$/))) {
      var mo1 = MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (mo1) return { y: fixYear(+m[3]), a: mo1, b: +m[1], iso: true };
    }
    if ((m = t.match(/^([A-Za-z]{3,})[\s-]+(\d{1,2}),?[\s-]+(\d{2,4})$/))) {
      var mo2 = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (mo2) return { y: fixYear(+m[3]), a: mo2, b: +m[2], iso: true };
    }
    // 03/04/2026 — the ambiguous one. a and b are first and second as written.
    if ((m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) {
      return { y: fixYear(+m[3]), a: +m[1], b: +m[2], iso: false };
    }
    // 20260112
    if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) return { y: +m[1], a: +m[2], b: +m[3], iso: true };
    return null;
  }
  // A two-digit year is this century until it would be more than a few years
  // in the future — a statement is history, not a forecast.
  function fixYear(y) {
    if (y >= 1000) return y;
    var full = 2000 + y;
    return full > new Date().getFullYear() + 5 ? full - 100 : full;
  }

  /* WHICH WAY ROUND IS 03/04? Scan the whole column for a value that can only
   * be read one way — a first part over 12 proves day-first, a second part
   * over 12 proves month-first. If BOTH appear the file is inconsistent and
   * unreadable; if NEITHER does (a statement that happens to cover only the
   * first twelve days of some months) the answer genuinely is not in the file,
   * and saying so is the only honest move. Callers show it and let the person
   * choose; they can see their own statement. */
  function sniffDateOrder(values) {
    var dayFirst = 0, monthFirst = 0, any = false;
    values.forEach(function (v) {
      var p = dateParts(v);
      if (!p) return;
      any = true;
      if (p.iso) return;
      if (p.a > 12) dayFirst++;
      if (p.b > 12) monthFirst++;
    });
    if (!any) return { order: 'iso', ambiguous: false, proven: false };
    if (dayFirst && monthFirst) return { order: 'mdy', ambiguous: true, conflict: true, proven: false };
    if (dayFirst) return { order: 'dmy', ambiguous: false, proven: true };
    if (monthFirst) return { order: 'mdy', ambiguous: false, proven: true };
    return { order: 'mdy', ambiguous: true, proven: false };   // defaulted, and said so
  }

  // -> 'YYYY-MM-DD' or null.
  function parseDate(s, order) {
    var p = dateParts(s);
    if (!p) return null;
    var mo, d;
    if (p.iso) { mo = p.a; d = p.b; }
    else if (order === 'dmy') { d = p.a; mo = p.b; }
    else { mo = p.a; d = p.b; }
    if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31) || !(p.y >= 1900 && p.y <= 2200)) return null;
    return p.y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // ---- 4. which column is which -------------------------------------------

  // Ordered: the first pattern that matches a header wins the role, so
  // "Transaction Date" is a date before "Transaction" is a description.
  var ROLES = [
    ['id', /^(transaction\s*id|trans(action)?\s*(no|ref|reference)|reference\s*(no|number)?|fitid|unique\s*id)$/i],
    ['date', /(^|\b)(transaction|posting|posted|post|effective|value|booking|completed|trade)\s*date\b/i],
    ['date', /^date\b|^date$|\bdate\b/i],
    ['debit', /^(debit|withdrawal|withdrawals|money\s*out|paid\s*out|amount\s*debit|charges?|spent)/i],
    ['credit', /^(credit|deposit|deposits|money\s*in|paid\s*in|amount\s*credit|received)/i],
    ['amount', /^(amount|value|transaction\s*amount|amt|net)/i],
    ['balance', /balance|^(running\s*)?bal\.?$|\bbal\b/i],
    ['drcr', /^(type|transaction\s*type|dr\/cr|debit\/credit|indicator|d\/c)$/i],
    ['desc', /^(description|payee|name|merchant|details?|narrative|particulars|memo|reference|note|transaction)/i],
    ['category', /^(category|categories|classification)/i],
    ['currency', /^(currency|ccy)/i],
  ];

  function looksLikeHeader(row) {
    var hits = 0, nonEmpty = 0;
    row.forEach(function (cell) {
      var t = String(cell || '').trim();
      if (!t) return;
      nonEmpty++;
      // A header cell is words, not a number and not a date.
      if (/^[\d.,$£€()\/-]+$/.test(t)) return;
      for (var i = 0; i < ROLES.length; i++) if (ROLES[i][1].test(t)) { hits++; return; }
    });
    return nonEmpty >= 2 && hits >= 2 ? hits : 0;
  }

  /* Find the header, then read the roles off it. Falls back to reading the
   * DATA when a file has no header at all (some exports are pure rows): the
   * first column that parses as dates throughout is the date, the last that
   * parses as money is the amount, the widest text column is the description.
   * That fallback is marked headerless so the preview can say so. */
  function sniff(rows) {
    var headerRow = -1, bestHits = 0;
    for (var r = 0; r < Math.min(rows.length, 25); r++) {
      var h = looksLikeHeader(rows[r]);
      if (h > bestHits) { bestHits = h; headerRow = r; }
    }
    var cols = {}, header = null;
    if (headerRow >= 0) {
      header = rows[headerRow].map(function (c) { return String(c || '').trim(); });
      header.forEach(function (name, idx) {
        if (!name) return;
        for (var i = 0; i < ROLES.length; i++) {
          if (!ROLES[i][1].test(name)) continue;
          var role = ROLES[i][0];
          if (cols[role] === undefined) cols[role] = idx;
          return;
        }
      });
    }
    var body = rows.slice(headerRow >= 0 ? headerRow + 1 : 0).filter(function (row) {
      return row.some(function (c) { return String(c || '').trim(); });
    });
    if (cols.date === undefined || (cols.amount === undefined && cols.debit === undefined && cols.credit === undefined)) {
      var guessed = guessFromData(body);
      for (var k in guessed) if (cols[k] === undefined) cols[k] = guessed[k];
    }
    var col = function (i) { return body.map(function (row) { return row[i]; }); };
    var dateOrder = cols.date === undefined ? { order: 'iso', ambiguous: false } : sniffDateOrder(col(cols.date));
    var moneyIdx = cols.amount !== undefined ? cols.amount : (cols.debit !== undefined ? cols.debit : cols.credit);
    var dec = moneyIdx === undefined ? '.' : sniffDecimal(col(moneyIdx));
    return {
      headerRow: headerRow, header: header, headerless: headerRow < 0,
      cols: cols, body: body,
      dateOrder: dateOrder.order, dateAmbiguous: !!dateOrder.ambiguous, dateConflict: !!dateOrder.conflict,
      decimal: dec,
      ok: cols.date !== undefined && moneyIdx !== undefined,
    };
  }

  // No header: let the data name the columns.
  function guessFromData(body) {
    var out = {}, sample = body.slice(0, 60);
    if (!sample.length) return out;
    var width = Math.max.apply(null, sample.map(function (r) { return r.length; }));
    var dateCol = -1, moneyCols = [], textCol = -1, textLen = -1;
    for (var i = 0; i < width; i++) {
      var vals = sample.map(function (r) { return r[i]; }).filter(function (v) { return String(v || '').trim(); });
      if (!vals.length) continue;
      var dates = vals.filter(function (v) { return dateParts(v); }).length;
      var money = vals.filter(function (v) { return parseMoney(v, '.') !== null; }).length;
      var avg = vals.reduce(function (a, v) { return a + String(v).length; }, 0) / vals.length;
      if (dates / vals.length > 0.9 && dateCol < 0) dateCol = i;
      else if (money / vals.length > 0.9) moneyCols.push(i);
      else if (avg > textLen) { textLen = avg; textCol = i; }
    }
    if (dateCol >= 0) out.date = dateCol;
    // The LAST money column is usually a running balance; the one before it is
    // the amount. With only one, it is the amount.
    if (moneyCols.length === 1) out.amount = moneyCols[0];
    else if (moneyCols.length > 1) { out.amount = moneyCols[moneyCols.length - 2]; out.balance = moneyCols[moneyCols.length - 1]; }
    if (textCol >= 0) out.desc = textCol;
    return out;
  }

  // ---- 5. rows -> transactions --------------------------------------------

  var DRCR_NEG = /^(d|dr|debit|withdrawal|w|payment|purchase|charge|sale|out)$/i;
  var DRCR_POS = /^(c|cr|credit|deposit|dep|refund|in|payment received)$/i;

  /* The plan is what the preview showed and the user approved: which column is
   * which, which way round the dates are, and whether the signs need turning
   * over. Nothing is inferred again here — a second guess at import time could
   * differ from the one the person agreed to. */
  function toTx(sn, plan) {
    plan = plan || {};
    var cols = plan.cols || sn.cols;
    var order = plan.dateOrder || sn.dateOrder;
    var dec = plan.decimal || sn.decimal;
    var flip = !!plan.flip;
    var out = [], skipped = 0;
    sn.body.forEach(function (row) {
      var date = parseDate(row[cols.date], order);
      if (!date) { skipped++; return; }
      var amount = null;
      if (cols.amount !== undefined) {
        amount = parseMoney(row[cols.amount], dec);
        // An Amount column that is never negative, next to a DR/CR column, is
        // a magnitude — the sign lives in the other column.
        if (amount !== null && cols.drcr !== undefined) {
          var ind = String(row[cols.drcr] || '').trim();
          if (DRCR_NEG.test(ind)) amount = -Math.abs(amount);
          else if (DRCR_POS.test(ind)) amount = Math.abs(amount);
        }
      }
      if (amount === null && (cols.debit !== undefined || cols.credit !== undefined)) {
        var d = cols.debit !== undefined ? parseMoney(row[cols.debit], dec) : null;
        var c = cols.credit !== undefined ? parseMoney(row[cols.credit], dec) : null;
        // Separate columns: whichever is filled wins. Debit is money out
        // whatever sign the bank wrote it with.
        if (d !== null && d !== 0) amount = -Math.abs(d);
        else if (c !== null && c !== 0) amount = Math.abs(c);
        else if (d === 0 || c === 0) amount = 0;
      }
      if (amount === null) { skipped++; return; }
      if (flip) amount = -amount;
      var desc = cols.desc !== undefined ? String(row[cols.desc] || '').trim() : '';
      // Some exports spread the payee over two columns; if the named one is
      // empty, take the longest other text cell rather than importing a blank.
      if (!desc) {
        row.forEach(function (cell, i) {
          if (i === cols.date || i === cols.amount || i === cols.balance) return;
          var t = String(cell || '').trim();
          if (t.length > desc.length && !/^[\d.,$£€()\/-]+$/.test(t)) desc = t;
        });
      }
      out.push({
        date: date,
        desc: desc.slice(0, 200) || '(no description)',
        amount: Math.round(amount * 100) / 100,
        srcId: cols.id !== undefined ? String(row[cols.id] || '').trim() : '',
        category: cols.category !== undefined ? String(row[cols.category] || '').trim().slice(0, 60) : '',
      });
    });
    return { tx: out, skipped: skipped };
  }

  /* Does this file look like it is written from the card's point of view —
   * charges positive, payments negative? Asked of the parsed transactions, not
   * the headers, because the headers never say. A file that is overwhelmingly
   * positive is either a credit card written backwards or a deposit account
   * that only received money, and only the account type separates those. */
  function looksInverted(tx) {
    if (tx.length < 4) return false;
    var pos = 0, neg = 0;
    tx.forEach(function (t) { if (t.amount > 0) pos++; else if (t.amount < 0) neg++; });
    return pos > neg * 3;
  }

  root.FinCSV = {
    parse: parse, detectDelim: detectDelim, sniff: sniff, toTx: toTx,
    parseMoney: parseMoney, parseDate: parseDate, dateParts: dateParts,
    sniffDateOrder: sniffDateOrder, sniffDecimal: sniffDecimal,
    looksInverted: looksInverted,
  };
})(typeof window !== 'undefined' ? window : this);
