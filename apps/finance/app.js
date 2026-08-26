/* app.js — the screens, and the three decisions behind them.
 *
 * ONE: the ACCOUNT LIST is the product, not the transactions. Everyone who
 * lost Mint lost the same thing — one page that knows where all of it is. A
 * balance can be a month stale and the page is still worth having; an account
 * you forgot exists is worth nothing at all. So adding an account asks for a
 * name and a place to log in, and the balance is optional. The nagging about
 * freshness happens later, gently, per row.
 *
 * TWO: the LEDGER IS CHUNKED BY MONTH. gifos.db is a postMessage RPC per
 * record — two thousand transactions imported one at a time is two thousand
 * round trips — and a subscribed collection re-downloads WHOLE on every
 * change. One record per month makes an import a dozen writes, and the ledger
 * is deliberately not subscribed: it is big, and nothing else can be editing
 * it (every collection here is private, so there is no other tab).
 *
 * THREE: nothing here guesses in silence. The import preview shows every
 * assumption as a control that can be changed, the transfer pairs are listed
 * where the savings rate is quoted, and the plan says which months it measured.
 * The numbers this app produces are the ones somebody decides a retirement on.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var M = window.FinModel, C = window.FinCSV, SF = window.FinSimpleFIN, CH = window.FinChart;

  var state = {
    accounts: [], tx: [], months: {}, snaps: [], prefs: {},
    view: 'accounts', theme: 'dark',
    imp: null,          // the pending import, once a file has been read
    txShown: 200,
    sfReady: false,
  };
  var db = {};

  // ---- small helpers -------------------------------------------------------

  function money(n, opts) {
    opts = opts || {};
    var v = Math.round(Number(n) || 0);
    var s = Math.abs(v).toLocaleString('en-US');
    return (v < 0 ? '−$' : (opts.plus && v > 0 ? '+$' : '$')) + s;
  }
  function money2(n) {
    var v = Number(n) || 0;
    return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;   // never innerHTML for user text
    return e;
  }
  function daysAgo(iso) {
    if (!iso) return null;
    var d = Math.floor((Date.parse(M.todayISO()) - Date.parse(iso)) / 86400000);
    return isFinite(d) ? d : null;
  }
  function agoText(iso) {
    var d = daysAgo(iso);
    if (d === null) return 'never updated';
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 30) return d + ' days ago';
    if (d < 365) return Math.round(d / 30) + ' months ago';
    return Math.round(d / 365) + ' years ago';
  }
  var flashTimer = null;
  function flash(text) {
    var e = $('flash');
    e.textContent = text; e.hidden = false;
    requestAnimationFrame(function () { e.classList.add('on'); });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      e.classList.remove('on');
      flashTimer = setTimeout(function () { e.hidden = true; }, 250);
    }, 1600);
  }

  // ---- storage -------------------------------------------------------------

  function monthKey(date) { return 'tx_' + M.monthOf(date); }

  function loadAll() {
    return Promise.all([
      db.accounts.getAll(), db.ledger.getAll(), db.snapshots.getAll(),
      db.prefs.get('ui').catch(function () { return null; }),
    ]).then(function (r) {
      state.accounts = r[0] || [];
      state.months = {};
      (r[1] || []).forEach(function (rec) { state.months[rec.id] = rec.list || []; });
      rebuildTx();
      state.snaps = (r[2] || []).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      state.prefs = r[3] || {};
      if (state.prefs.theme === 'light' || state.prefs.theme === 'dark') state.theme = state.prefs.theme;
    });
  }
  function rebuildTx() {
    var all = [];
    Object.keys(state.months).forEach(function (k) { all = all.concat(state.months[k]); });
    all.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    state.tx = all;
  }
  function savePrefs() {
    state.prefs.id = 'ui'; state.prefs.theme = state.theme;
    return db.prefs.put(state.prefs).catch(function () {});
  }
  // Write only the months an import actually touched.
  function saveMonths(keys) {
    return Promise.all(keys.map(function (k) {
      return db.ledger.put({ id: k, month: k.slice(3), list: state.months[k] });
    }));
  }

  /* Adding transactions is the one write that has to be exactly right, because
   * the whole design assumes you can import overlapping exports for ever. New
   * rows are keyed, checked against every id already held, and only the
   * genuinely new ones land. Returns what happened so the user can be told
   * both halves — "142 added, 89 already here" is the sentence that makes it
   * safe to import the same file twice by accident. */
  function addTx(accountId, list) {
    var keyed = M.keyed(accountId, list);
    var have = {};
    state.tx.forEach(function (t) { have[t.id] = 1; });
    var fresh = keyed.filter(function (t) { return !have[t.id]; });
    var touched = {};
    fresh.forEach(function (t) {
      var k = monthKey(t.date);
      (state.months[k] = state.months[k] || []).push(t);
      touched[k] = 1;
    });
    rebuildTx();
    return saveMonths(Object.keys(touched)).then(function () {
      return { added: fresh.length, duplicate: keyed.length - fresh.length };
    });
  }

  // ---- net worth header ----------------------------------------------------

  function paintWorth() {
    var nw = M.netWorth(state.accounts);
    var t = $('nwTotal');
    t.textContent = money(nw.total);
    t.classList.toggle('neg', nw.total < 0);
    var sub = $('nwChange');
    sub.textContent = '';
    var prev = state.snaps.filter(function (s) { return s.date !== M.todayISO(); }).slice(-1)[0];
    if (prev) {
      var d = nw.total - prev.total;
      var span = el('span', d >= 0 ? 'up' : 'down', money(d, { plus: true }));
      sub.appendChild(span);
      sub.appendChild(document.createTextNode(' since ' + prev.date));
    } else if (state.accounts.length) {
      sub.textContent = nw.assets ? money(nw.assets) + ' in, ' + money(nw.debts) + ' owed' : '';
    }
    $('nwStack').innerHTML = CH.groupBar(nw.byGroup, M.GROUPS) || '';
  }

  // ---- accounts screen -----------------------------------------------------

  function paintAccounts() {
    var host = $('acctList');
    host.textContent = '';
    var live = state.accounts.filter(function (a) { return !a.archived; });
    $('acctEmpty').hidden = live.length > 0;
    M.GROUPS.forEach(function (g) {
      var rows = live.filter(function (a) { return M.kindOf(a).group === g; });
      if (!rows.length) return;
      var wrap = el('div', 'group');
      var h = el('h3', null, g);
      var sum = rows.reduce(function (a, r) { return a + Math.abs(M.signed(r)); }, 0);
      var tot = el('span', null, money(sum));
      h.appendChild(tot);
      wrap.appendChild(h);
      rows.sort(function (a, b) { return Math.abs(M.signed(b)) - Math.abs(M.signed(a)); });
      rows.forEach(function (a) { wrap.appendChild(acctRow(a)); });
      host.appendChild(wrap);
    });
  }

  function acctRow(a) {
    var row = el('div', 'acct');
    var who = el('div', 'who');
    who.appendChild(el('div', 'nm', a.name || 'Account'));
    var bits = [];
    if (a.institution) bits.push(a.institution);
    bits.push(M.kindOf(a).label);
    var stale = daysAgo(a.balanceDate);
    var sub = el('div', 'sub', bits.join(' · ') + ' · ' + agoText(a.balanceDate));
    if (stale === null || stale > 45) sub.classList.add('stale');
    who.appendChild(sub);
    row.appendChild(who);

    var amt = el('div', 'amt', money(Math.abs(Number(a.balance) || 0)));
    if (M.isDebt(a)) amt.classList.add('debt');
    row.appendChild(amt);

    /* The link to the bank. This is the humblest feature here and the one that
     * gets used every single time: fifty institutions is fifty bookmarks
     * nobody has, and the reason a manual balance goes stale is almost never
     * unwillingness — it is not remembering where the login was. */
    if (a.url) {
      var go = el('a', 'go', '↗');
      go.href = a.url; go.target = '_blank'; go.rel = 'noopener noreferrer';
      go.title = 'Open ' + (a.institution || a.name);
      row.appendChild(go);
    }
    var edit = el('button', 'edit', '✎');
    edit.title = 'Edit ' + (a.name || 'this account');
    edit.onclick = function () { accountModal(a); };
    row.appendChild(edit);
    return row;
  }

  // ---- the account sheet ---------------------------------------------------

  function accountModal(existing) {
    var a = existing || { kind: 'checking', currency: 'USD' };
    var box = $('modalBox');
    box.textContent = '';
    box.appendChild(el('h3', null, existing ? 'Edit account' : 'Add an account'));

    var form = el('div');
    function field(label, node) {
      var l = el('label', null, label);
      l.appendChild(node);
      form.appendChild(l);
      return node;
    }
    var name = field('What you call it', el('input'));
    name.value = a.name || ''; name.placeholder = 'Everyday checking';
    var inst = field('Where it is', el('input'));
    inst.value = a.institution || ''; inst.placeholder = 'Bank of America';

    var kind = el('select');
    M.GROUPS.forEach(function (g) {
      var og = document.createElement('optgroup'); og.label = g;
      M.KINDS.filter(function (k) { return k.group === g; }).forEach(function (k) {
        var o = document.createElement('option'); o.value = k.id; o.textContent = k.label;
        if (k.id === a.kind) o.selected = true;
        og.appendChild(o);
      });
      kind.appendChild(og);
    });
    field('What kind', kind);

    var balLabel = el('label', null, 'Balance');
    var bal = el('input'); bal.type = 'text'; bal.inputMode = 'decimal';
    bal.value = a.balance === undefined || a.balance === null ? '' : String(a.balance);
    bal.placeholder = '0';
    balLabel.appendChild(bal);
    var hint = el('div', 'muted small');
    balLabel.appendChild(hint);
    form.appendChild(balLabel);
    function updHint() {
      var k = M.KIND[kind.value];
      hint.textContent = k && k.sign < 0
        ? 'Type what you OWE, as a positive number. It is subtracted for you.'
        : (k && !k.pot ? 'Counts toward net worth, but not toward what a retirement plan can spend.' : '');
    }
    kind.onchange = updHint; updHint();

    var url = field('Link to log in (optional)', el('input'));
    url.value = a.url || ''; url.placeholder = 'https://…'; url.type = 'url';

    box.appendChild(form);

    var bar = el('div', 'bar right');
    if (existing) {
      var del = el('button', null, 'Delete');
      del.onclick = function () {
        confirmModal('Delete “' + (a.name || 'this account') + '”?',
          'Its transactions stay in your history. This only removes the account and its balance from your net worth.',
          function () {
            db.accounts.delete(a.id).then(function () {
              state.accounts = state.accounts.filter(function (x) { return x.id !== a.id; });
              closeModal(); paintAll(); flash('Deleted');
            });
          });
      };
      bar.appendChild(del);
    }
    var cancel = el('button', null, 'Cancel');
    cancel.onclick = closeModal;
    bar.appendChild(cancel);
    var save = el('button', 'primary', 'Save');
    save.onclick = function () {
      var n = (name.value || '').trim();
      if (!n) { name.focus(); return; }
      var parsed = C.parseMoney(bal.value, '.');
      var rec = Object.assign({}, a, {
        name: n.slice(0, 60),
        institution: (inst.value || '').trim().slice(0, 60),
        kind: kind.value,
        url: /^https?:\/\//i.test(url.value.trim()) ? url.value.trim().slice(0, 300) : '',
      });
      if (parsed !== null) {
        // A liability is stored as what you owe, positive. Somebody who types
        // -2000 for a card means the same thing as somebody who types 2000.
        rec.balance = M.KIND[kind.value].sign < 0 ? Math.abs(parsed) : parsed;
        if (!existing || rec.balance !== a.balance) rec.balanceDate = M.todayISO();
      }
      db.accounts.put(rec).then(function (saved) {
        var i = state.accounts.findIndex(function (x) { return x.id === saved.id; });
        if (i >= 0) state.accounts[i] = saved; else state.accounts.push(saved);
        closeModal(); paintAll(); flash('Saved');
      });
    };
    bar.appendChild(save);
    box.appendChild(bar);
    openModal();
    name.focus();
  }

  function confirmModal(title, body, onYes) {
    var box = $('modalBox');
    box.textContent = '';
    box.appendChild(el('h3', null, title));
    box.appendChild(el('p', 'muted', body));
    var bar = el('div', 'bar right');
    var no = el('button', null, 'Cancel'); no.onclick = closeModal;
    var yes = el('button', 'primary', 'Yes'); yes.onclick = onYes;
    bar.appendChild(no); bar.appendChild(yes);
    box.appendChild(bar);
    openModal();
  }
  function openModal() { $('modal').hidden = false; }
  function closeModal() { $('modal').hidden = true; $('modalBox').textContent = ''; }

  // ---- import --------------------------------------------------------------

  function readFile(file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { flash('That file is over 12 MB — is it really a CSV?'); return; }
    var fr = new FileReader();
    fr.onload = function () { startImport(String(fr.result || ''), file.name); };
    fr.onerror = function () { flash('Could not read that file.'); };
    fr.readAsText(file);
  }

  function startImport(text, filename) {
    var parsed = C.parse(text);
    var sn = C.sniff(parsed.rows);
    if (!sn.ok) {
      $('importPane').hidden = false;
      $('impSummary').textContent = 'GifOS could not find a date column and an amount column in ' + filename +
        '. Open it in a spreadsheet and check it is the transaction export rather than a summary or a PDF renamed .csv.';
      $('impWarn').textContent = '';
      $('impPreview').textContent = '';
      $('btnDoImport').disabled = true;
      return;
    }
    state.imp = {
      sn: sn, filename: filename, delim: parsed.delim,
      cols: Object.assign({}, sn.cols),
      dateOrder: sn.dateOrder, flip: false,
      accountId: state.accounts.length ? guessAccount(filename) : '',
    };
    $('btnDoImport').disabled = false;
    paintImport(true);
    $('importPane').hidden = false;
  }

  // A file called "bofa-checking-july.csv" almost certainly belongs to the
  // account whose name or institution appears in it. Only a default — the
  // picker is right there.
  function guessAccount(filename) {
    var f = filename.toLowerCase().replace(/[^a-z0-9]+/g, '');
    var best = '', bestLen = 2;
    state.accounts.forEach(function (a) {
      [a.name, a.institution].forEach(function (s) {
        var k = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (k.length > bestLen && f.indexOf(k) >= 0) { best = a.id; bestLen = k.length; }
      });
    });
    return best || state.accounts[0].id;
  }

  function paintImport(refreshControls) {
    var im = state.imp; if (!im) return;
    var sn = im.sn;

    if (refreshControls) {
      var sel = $('impAccount');
      sel.textContent = '';
      state.accounts.filter(function (a) { return !a.archived; }).forEach(function (a) {
        var o = document.createElement('option');
        o.value = a.id;
        o.textContent = a.name + (a.institution ? ' — ' + a.institution : '');
        if (a.id === im.accountId) o.selected = true;
        sel.appendChild(o);
      });
      if (!state.accounts.length) {
        var o2 = document.createElement('option');
        o2.value = ''; o2.textContent = 'Add an account first';
        sel.appendChild(o2);
      }
      $('impOrder').value = im.dateOrder;
      $('impFlip').checked = im.flip;
      paintColPickers();
    }

    var n = sn.body.length;
    $('impSummary').textContent = im.filename + ' — ' + n + ' row' + (n === 1 ? '' : 's') +
      (sn.headerless ? ', no column headings (GifOS worked them out from the data)'
                     : ', headings on line ' + (sn.headerRow + 1)) +
      ', separated by ' + (im.delim === '\t' ? 'tabs' : '“' + im.delim + '”') +
      (sn.decimal === ',' ? ', decimal comma' : '');

    var warn = $('impWarn');
    warn.textContent = '';
    /* THE AMBIGUOUS DATE. This is the one wrong guess that produces numbers
     * that look completely fine — every date lands in a real month, just the
     * wrong one — so it is called out loudly rather than left in a dropdown
     * nobody opens. */
    if (sn.dateConflict) {
      warn.appendChild(note('bad', 'This file has dates that read one way and dates that read the other. ' +
        'That should not be possible in one export — check you have not stitched two files together.'));
    } else if (sn.dateAmbiguous) {
      warn.appendChild(note('', 'Nothing in this file settles whether ' + firstDate() +
        ' is month-first or day-first — every date in it works both ways. GifOS has assumed ' +
        (im.dateOrder === 'mdy' ? 'month first (US style)' : 'day first') +
        '. Check one against your statement; if it is wrong, change it here.'));
    }
    var acct = accountById(im.accountId);
    if (acct && M.isDebt(acct)) {
      warn.appendChild(note('', 'This is a credit card or a loan. Card exports usually write a purchase as a ' +
        'positive number — which would make spending look like income. Check the preview: money you SPENT should be red.'));
    }
    var preview = C.toTx(sn, im);
    if (acct && M.isDebt(acct) && !im.flip && C.looksInverted(preview.tx)) {
      warn.appendChild(note('', 'Almost every row here is positive, on an account you owe money on. ' +
        'That is what a card export written backwards looks like — try the “turn every sign over” box below.'));
    }
    if (preview.skipped) {
      warn.appendChild(note('', preview.skipped + ' row' + (preview.skipped === 1 ? '' : 's') +
        ' had no readable date or amount and will be left out — usually the totals line at the bottom.'));
    }
    paintPreview(preview.tx);
    $('btnDoImport').disabled = !im.accountId || !preview.tx.length;
  }

  function firstDate() {
    var im = state.imp;
    var row = im.sn.body.find(function (r) { return C.dateParts(r[im.cols.date]); });
    return row ? String(row[im.cols.date]).trim() : 'a date in it';
  }
  function note(cls, text) {
    var d = el('div', 'note' + (cls ? ' ' + cls : ''), text);
    return d;
  }
  function accountById(id) {
    return state.accounts.filter(function (a) { return a.id === id; })[0] || null;
  }

  /* Every column, listed, with what GifOS decided it was. A sniffer is a guess
   * and this is where the guess becomes reviewable — it is also the only
   * repair for a file whose headings are in a language none of the patterns
   * know. */
  function paintColPickers() {
    var im = state.imp, sn = im.sn;
    var grid = $('impColGrid');
    grid.textContent = '';
    var roles = [
      ['date', 'Date'], ['desc', 'Description'], ['amount', 'Amount'],
      ['debit', 'Money out'], ['credit', 'Money in'], ['drcr', 'Debit/credit marker'],
      ['balance', 'Running balance'], ['id', "The bank's own reference"], ['category', 'Category'],
    ];
    var width = Math.max.apply(null, sn.body.slice(0, 20).map(function (r) { return r.length; }).concat([0]));
    roles.forEach(function (r) {
      var lab = el('label', null, r[1]);
      var sel = el('select');
      var none = document.createElement('option');
      none.value = ''; none.textContent = '— not in this file —';
      sel.appendChild(none);
      for (var i = 0; i < width; i++) {
        var o = document.createElement('option');
        o.value = String(i);
        var head = sn.header && sn.header[i];
        var sample = (sn.body[0] || [])[i];
        o.textContent = (head || 'Column ' + (i + 1)) + (sample ? '  ·  ' + String(sample).slice(0, 22) : '');
        if (im.cols[r[0]] === i) o.selected = true;
        sel.appendChild(o);
      }
      sel.onchange = function () {
        if (sel.value === '') delete im.cols[r[0]]; else im.cols[r[0]] = Number(sel.value);
        paintImport(false);
      };
      lab.appendChild(sel);
      grid.appendChild(lab);
    });
  }

  function paintPreview(tx) {
    var t = $('impPreview');
    t.textContent = '';
    var head = t.insertRow();
    ['Date', 'Description', 'Amount'].forEach(function (h, i) {
      var th = document.createElement('th');
      th.textContent = h;
      if (i === 2) th.style.textAlign = 'right';
      head.appendChild(th);
    });
    tx.slice(0, 8).forEach(function (x) {
      var r = t.insertRow();
      r.insertCell().textContent = x.date;
      var d = r.insertCell(); d.textContent = x.desc; d.className = 'desc';
      var a = r.insertCell();
      a.textContent = money2(x.amount);
      a.className = 'num ' + (x.amount < 0 ? 'neg' : 'pos');
    });
    if (tx.length > 8) {
      var r2 = t.insertRow();
      var c = r2.insertCell(); c.colSpan = 3; c.className = 'muted';
      c.textContent = '…and ' + (tx.length - 8) + ' more';
    }
  }

  function doImport() {
    var im = state.imp; if (!im || !im.accountId) return;
    var out = C.toTx(im.sn, im);
    var acct = accountById(im.accountId);
    $('btnDoImport').disabled = true;
    addTx(im.accountId, out.tx).then(function (r) {
      /* A statement's LAST row is the most recent balance the bank agrees
       * with, and it is free — but only when the file actually carried a
       * running balance column, and only when it is newer than what is
       * already recorded. A balance invented by adding up transactions
       * would silently disagree with the bank. */
      var upd = Promise.resolve();
      if (acct && im.cols.balance !== undefined && out.tx.length) {
        var rows = im.sn.body.slice();
        var newest = null, newestDate = '';
        rows.forEach(function (row) {
          var d = C.parseDate(row[im.cols.date], im.dateOrder);
          var b = C.parseMoney(row[im.cols.balance], im.sn.decimal);
          if (d && b !== null && d >= newestDate) { newestDate = d; newest = b; }
        });
        if (newest !== null && (!acct.balanceDate || newestDate >= acct.balanceDate)) {
          acct.balance = M.isDebt(acct) ? Math.abs(newest) : newest;
          acct.balanceDate = newestDate;
          upd = db.accounts.put(acct);
        }
      }
      return upd.then(function () {
        state.imp = null;
        $('importPane').hidden = true;
        $('file').value = '';
        paintAll();
        show('money');
        flash(r.added + ' added' + (r.duplicate ? ', ' + r.duplicate + ' already here' : ''));
      });
    }).catch(function (e) {
      $('btnDoImport').disabled = false;
      flash('Import failed: ' + (e && e.message || e));
    });
  }

  // ---- SimpleFIN ------------------------------------------------------------

  function paintSfNote() {
    var n = $('sfNote');
    if (state.sfReady) { n.hidden = true; return; }
    n.hidden = false;
    n.textContent = '';
    n.appendChild(document.createTextNode(
      'SimpleFIN is not set up, so ↻ Refresh has nothing to call. It is the one service that ' +
      'can pull balances into a computer with no server of its own: connect your banks at a ' +
      'SimpleFIN server, claim the token it gives you once, and paste the access URL into ' +
      'GifOS Settings → Third-party APIs under the name '));
    var b = el('b', null, 'simplefin');
    n.appendChild(b);
    n.appendChild(document.createTextNode(
      '. Everything here works without it — CSV import covers every institution there is.'));
  }

  function pullSimpleFIN() {
    if (!window.gifos || !window.gifos.api) { flash('This needs to run inside GifOS.'); return; }
    var btn = $('btnPull');
    btn.disabled = true; btn.textContent = '↻ Asking SimpleFIN…';
    SF.pull({ sinceDays: state.prefs.everPulled ? 45 : 365 }).then(function (res) {
      return applySimpleFIN(res);
    }).then(function (msg) {
      state.prefs.everPulled = true;
      savePrefs();
      flash(msg);
    }).catch(function (e) {
      var m = String(e && e.message || e);
      if (m.indexOf('NOT_CONFIGURED') === 0) {
        // GifOS has already shown its own setup prompt; do not write a second.
        if (window.gifos.apiSetup) window.gifos.apiSetup('simplefin', 'Your SimpleFIN access URL goes in the Base URL box — paste the whole thing, credentials and all, and GifOS will split it.');
      } else {
        flash(m);
      }
    }).then(function () {
      btn.disabled = false; btn.textContent = '↻ Refresh from SimpleFIN';
      paintAll();
    });
  }

  /* Matching SimpleFIN's accounts to the user's own list. Once an account has
   * been linked its id is remembered, so this only has to be right the first
   * time — and when it cannot be sure, it ADDS rather than guesses. A wrong
   * match writes a bank's balance onto the wrong row, which is worse than a
   * duplicate the user can delete in one tap. */
  function applySimpleFIN(res) {
    var added = 0, updated = 0, txAdded = 0;
    var work = Promise.resolve();
    res.accounts.forEach(function (sa) {
      work = work.then(function () {
        var mine = state.accounts.filter(function (a) { return a.simplefinId === sa.id; })[0];
        if (!mine) {
          mine = {
            name: sa.name, institution: sa.org, simplefinId: sa.id,
            currency: sa.currency, url: sa.orgUrl || '',
            // SimpleFIN reports a card you owe on as a negative balance. Which
            // side of the sheet it belongs on is knowable from that; which
            // KIND of debt it is, is not — so it starts as a card and the user
            // retypes it if it is a mortgage. Better a wrong label on the
            // right side than a mortgage counted as an asset.
            kind: sa.balance < 0 ? 'card' : 'checking',
          };
          added++;
        } else updated++;
        mine.balance = M.KIND[mine.kind].sign < 0 ? Math.abs(sa.balance) : sa.balance;
        mine.balanceDate = sa.balanceDate || M.todayISO();
        return db.accounts.put(mine).then(function (saved) {
          var i = state.accounts.findIndex(function (x) { return x.id === saved.id; });
          if (i >= 0) state.accounts[i] = saved; else state.accounts.push(saved);
          // Pending rows are deliberately dropped: they change amount and
          // description before they post, and a ledger keyed on those would
          // grow a second copy of every one of them a few days later.
          var settled = sa.transactions.filter(function (t) { return !t.pending; });
          if (!settled.length) return null;
          return addTx(saved.id, settled).then(function (r) { txAdded += r.added; });
        });
      });
    });
    return work.then(function () {
      if (res.errors.length) flash('SimpleFIN reported: ' + res.errors[0]);
      return (added ? added + ' new account' + (added === 1 ? '' : 's') + ', ' : '') +
        updated + ' updated, ' + txAdded + ' transaction' + (txAdded === 1 ? '' : 's');
    });
  }

  // ---- money screen --------------------------------------------------------

  function paintMoney() {
    var xf = M.findTransfers(state.tx);
    var months = M.monthly(state.tx, { transfers: xf.ids });
    $('barsChart').innerHTML = CH.monthBars(months) ||
      '<p class="muted">Nothing imported yet.</p>';
    var complete = months.filter(function (m) { return !m.partial; });
    var note = $('moneyNote');
    if (!months.length) {
      note.textContent = 'Import a CSV, or refresh from SimpleFIN, and this fills in.';
    } else {
      var avgIn = complete.length ? complete.reduce(function (a, m) { return a + m.income; }, 0) / complete.length : 0;
      var avgOut = complete.length ? complete.reduce(function (a, m) { return a + m.spend; }, 0) / complete.length : 0;
      var rate = avgIn > 0 ? Math.round((avgIn - avgOut) / avgIn * 100) : null;
      note.textContent = complete.length
        ? 'Over ' + complete.length + ' complete month' + (complete.length === 1 ? '' : 's') + ': ' +
          money(avgIn) + ' in and ' + money(avgOut) + ' out a month, on average' +
          (rate === null ? '' : ' — you keep ' + rate + '% of what arrives.') +
          ' Faded bars are part months and are left out of that average.'
        : 'Every month here is a part month, so there is no honest average yet. Import a full month and this fills in.';
    }
    paintTransfers(xf.pairs);
    paintTxTable();
  }

  function paintTransfers(pairs) {
    var host = $('xferList');
    host.textContent = '';
    $('xferCard').hidden = !pairs.length;
    if (!pairs.length) return;
    var t = document.createElement('table');
    var head = t.insertRow();
    ['When', 'Out of', 'Into', 'Amount'].forEach(function (h, i) {
      var th = document.createElement('th'); th.textContent = h;
      if (i === 3) th.style.textAlign = 'right';
      head.appendChild(th);
    });
    pairs.slice(-25).reverse().forEach(function (p) {
      var r = t.insertRow();
      r.insertCell().textContent = p.out.date;
      r.insertCell().textContent = nameOf(p.out.account);
      r.insertCell().textContent = nameOf(p.in.account);
      var c = r.insertCell(); c.className = 'num'; c.textContent = money2(Math.abs(p.out.amount));
    });
    host.appendChild(t);
    if (pairs.length > 25) host.appendChild(el('p', 'muted', 'Showing the 25 most recent of ' + pairs.length + '.'));
  }
  function nameOf(id) {
    var a = accountById(id);
    return a ? a.name : 'a deleted account';
  }

  function paintTxTable() {
    var q = ($('txSearch').value || '').toLowerCase().trim();
    var list = state.tx;
    if (q) list = list.filter(function (t) { return t.desc.toLowerCase().indexOf(q) >= 0; });
    var t = $('txTable');
    t.textContent = '';
    var head = t.insertRow();
    ['Date', 'Description', 'Account', 'Amount'].forEach(function (h, i) {
      var th = document.createElement('th'); th.textContent = h;
      if (i === 3) th.style.textAlign = 'right';
      head.appendChild(th);
    });
    list.slice(0, state.txShown).forEach(function (x) {
      var r = t.insertRow();
      r.insertCell().textContent = x.date;
      var d = r.insertCell(); d.textContent = x.desc; d.className = 'desc';
      r.insertCell().textContent = nameOf(x.account);
      var a = r.insertCell();
      a.textContent = money2(x.amount);
      a.className = 'num ' + (x.amount < 0 ? 'neg' : 'pos');
    });
    if (!list.length) {
      var r0 = t.insertRow(); var c0 = r0.insertCell();
      c0.colSpan = 4; c0.className = 'muted';
      c0.textContent = q ? 'Nothing matches “' + q + '”.' : 'Nothing imported yet.';
    }
    $('btnMoreTx').hidden = list.length <= state.txShown;
    $('btnMoreTx').textContent = 'Show more (' + (list.length - state.txShown) + ' left)';
  }

  // ---- history -------------------------------------------------------------

  function paintHistory() {
    $('nwChart').innerHTML = CH.netWorthChart(state.snaps) || '';
    var note = $('histNote');
    if (state.snaps.length < 2) {
      note.textContent = 'A net worth chart needs at least two dated figures. ' +
        'Balances get overwritten every time you refresh, so unless today’s number is written ' +
        'down today it is gone for good — tap “Save today’s figure” on the Accounts screen ' +
        'whenever the balances look right.';
    } else {
      var first = state.snaps[0], last = state.snaps[state.snaps.length - 1];
      var d = last.total - first.total;
      note.textContent = state.snaps.length + ' figures saved, ' + first.date + ' to ' + last.date +
        ' — ' + money(d, { plus: true }) + ' over that stretch.';
    }
    var t = $('snapTable');
    t.textContent = '';
    var head = t.insertRow();
    ['Date', 'Net worth', 'Owned', 'Owed', ''].forEach(function (h, i) {
      var th = document.createElement('th'); th.textContent = h;
      if (i && i < 4) th.style.textAlign = 'right';
      head.appendChild(th);
    });
    state.snaps.slice().reverse().forEach(function (s) {
      var r = t.insertRow();
      r.insertCell().textContent = s.date;
      [s.total, s.assets, s.debts].forEach(function (v) {
        var c = r.insertCell(); c.className = 'num'; c.textContent = money(v);
      });
      var c4 = r.insertCell();
      var del = el('button', 'row-del', '✕');
      del.title = 'Remove this figure';
      del.onclick = function () {
        db.snapshots.delete(s.id).then(function () {
          state.snaps = state.snaps.filter(function (x) { return x.id !== s.id; });
          paintAll();
        });
      };
      c4.appendChild(del);
    });
    if (!state.snaps.length) {
      var r0 = t.insertRow(); var c0 = r0.insertCell();
      c0.colSpan = 5; c0.className = 'muted'; c0.textContent = 'Nothing saved yet.';
    }
  }

  function takeSnapshot() {
    if (!state.accounts.length) { flash('Add an account first.'); return; }
    var s = M.snapshot(state.accounts);
    db.snapshots.put(s).then(function (saved) {
      var i = state.snaps.findIndex(function (x) { return x.id === saved.id; });
      if (i >= 0) state.snaps[i] = saved; else state.snaps.push(saved);
      state.snaps.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      paintAll();
      flash('Saved ' + money(s.total) + ' for ' + s.date);
    });
  }

  // ---- plan ----------------------------------------------------------------

  function currentPlan() {
    return M.derivePlan(state.accounts, state.tx, { age: state.prefs.age });
  }

  function paintPlan() {
    var p = currentPlan();
    $('planAge').value = state.prefs.age || '';
    var t = $('planTable');
    t.textContent = '';
    var rows = [
      ['Net worth', p.netWorth, 'Everything you own, less everything you owe.'],
      ['Savings and investments', p.portfolio, 'The part a retirement plan can actually spend.'],
      ['Property and other things', p.illiquid, 'Counts toward what you are worth; you cannot live off it.'],
      ['What you owe', p.debts, ''],
      ['Put away each year', p.annualSavings, 'What arrived less what went out, over the months measured.'],
      ['Spent each year', p.annualSpend, 'Transfers between your own accounts are not counted.'],
    ];
    rows.forEach(function (r) {
      var tr = t.insertRow();
      var c0 = tr.insertCell(); c0.textContent = r[0];
      var c1 = tr.insertCell(); c1.className = 'num';
      c1.textContent = r[1] === null ? 'not enough data' : money(r[1]);
      if (r[1] === null) c1.className = 'num muted';
      var c2 = tr.insertCell(); c2.className = 'muted'; c2.style.whiteSpace = 'normal';
      c2.textContent = r[2];
    });
    var basis = $('planBasis');
    basis.textContent = '';
    if (p.basis) {
      basis.textContent = 'Yearly figures are ' + p.basis.months + ' complete months, ' +
        p.basis.from + ' to ' + p.basis.to + ' (' + money(p.basis.monthlyIncome) + ' in, ' +
        money(p.basis.monthlySpend) + ' out a month), with ' + p.basis.transfers +
        ' move' + (p.basis.transfers === 1 ? '' : 's') + ' between your own accounts left out.';
    } else {
      basis.textContent = 'What you put away and what you spend need at least three complete ' +
        'months of transactions before there is an honest number to give. The balance-sheet ' +
        'figures above are ready now, and the Retirement Calculator will take them.';
    }
    $('btnHandoff').disabled = !state.accounts.length;
  }

  function handoff() {
    if (!window.gifos || !window.gifos.handoff) {
      flash('This computer is too old for app-to-app handoff.');
      return;
    }
    var p = currentPlan();
    var doc = {
      netWorth: p.netWorth, portfolio: p.portfolio, illiquid: p.illiquid,
      debts: p.debts, asOf: p.asOf,
    };
    if (p.currentAge) doc.currentAge = p.currentAge;
    if (p.annualSavings !== null) doc.annualSavings = p.annualSavings;
    if (p.annualSpend !== null) doc.annualSpend = p.annualSpend;
    var btn = $('btnHandoff');
    btn.disabled = true;
    window.gifos.handoff.offer('finance.plan', doc).then(function (r) {
      btn.disabled = false;
      if (r && r.ok) flash('Handed over — open the Retirement Calculator');
      else flash('Left where it was');
    }).catch(function (e) {
      btn.disabled = false;
      flash(String(e && e.message || e));
    });
  }

  // ---- view switching + wiring ---------------------------------------------

  function show(view) {
    state.view = view;
    ['accounts', 'import', 'money', 'history', 'plan'].forEach(function (v) {
      $('v' + v).hidden = v !== view;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-view') === view ? 'true' : 'false');
    });
    if (view === 'money') paintMoney();
    if (view === 'history') paintHistory();
    if (view === 'plan') paintPlan();
    if (view === 'import') paintImport(true);
  }

  function paintAll() {
    paintWorth();
    paintAccounts();
    paintSfNote();
    if (state.view === 'money') paintMoney();
    if (state.view === 'history') paintHistory();
    if (state.view === 'plan') paintPlan();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme === 'light' ? 'light' : 'dark');
    var b = $('btnTheme');
    var label = state.theme === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme';
    b.title = label; b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', state.theme === 'light' ? 'true' : 'false');
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.onclick = function () { show(b.getAttribute('data-view')); };
    });
    $('btnTheme').onclick = function () {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(); savePrefs();
      if (state.view === 'money') paintMoney();
      if (state.view === 'history') paintHistory();
    };
    $('btnAdd').onclick = function () { accountModal(null); };
    $('btnPull').onclick = pullSimpleFIN;
    $('btnSnap').onclick = takeSnapshot;

    $('btnFile').onclick = function () { $('file').click(); };
    $('file').onchange = function (e) { readFile(e.target.files && e.target.files[0]); };
    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      readFile(f);
    });
    $('impAccount').onchange = function () { if (!state.imp) return; state.imp.accountId = $('impAccount').value; paintImport(false); };
    $('impOrder').onchange = function () { if (!state.imp) return; state.imp.dateOrder = $('impOrder').value; paintImport(false); };
    $('impFlip').onchange = function () { if (!state.imp) return; state.imp.flip = $('impFlip').checked; paintImport(false); };
    $('btnCancelImp').onclick = function () {
      state.imp = null; $('importPane').hidden = true; $('file').value = '';
    };
    $('btnDoImport').onclick = doImport;

    $('txSearch').oninput = function () { state.txShown = 200; paintTxTable(); };
    $('btnMoreTx').onclick = function () { state.txShown += 500; paintTxTable(); };

    $('planAge').onchange = function () {
      var v = parseInt($('planAge').value, 10);
      state.prefs.age = (v >= 18 && v <= 100) ? v : null;
      savePrefs(); paintPlan();
    };
    $('btnHandoff').onclick = handoff;

    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  // ---- boot ----------------------------------------------------------------

  function boot() {
    wire();
    applyTheme();
    if (!window.gifos) {
      // Opened outside GifOS. Everything still draws; nothing can be saved,
      // and saying so beats a Save button that silently does nothing.
      $('btnAdd').disabled = true;
      $('acctEmpty').textContent = 'This app saves its data through GifOS. Open it from your Home Screen.';
      return;
    }
    db.accounts = window.gifos.db('accounts');
    db.ledger = window.gifos.db('ledger');
    db.snapshots = window.gifos.db('snapshots');
    db.prefs = window.gifos.db('prefs');

    loadAll().then(function () {
      applyTheme();
      paintAll();
      show('accounts');
      /* SUGGEST a snapshot rather than taking one. An automatic daily write
       * would fill the history with the same number on the days nothing
       * happened, and — worse — record a net worth from BEFORE the user had
       * finished entering their accounts as though it were a fact about them. */
      var last = state.snaps[state.snaps.length - 1];
      if (state.accounts.length && (!last || daysAgo(last.date) > 25)) {
        flash(last ? 'It has been a while — save today’s figure?' : 'Save today’s figure to start the chart');
      }
    }).catch(function () {
      $('acctEmpty').textContent = 'Saving is turned off for this app, so nothing can be kept.';
    });

    if (window.gifos.apiReady) {
      window.gifos.apiReady('simplefin').then(function (ok) {
        state.sfReady = !!ok;
        paintSfNote();
      }).catch(function () {});
    }
    if (window.gifos.onBack) {
      window.gifos.onBack(function () {
        if (!$('modal').hidden) closeModal();
        else if (state.view !== 'accounts') show('accounts');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* The same debug surface the Retirement Calculator exposes, and for the same
   * reason: tools/shot.js drives this app in a real browser to photograph it,
   * and a screenshot of an empty app is worth nothing. Seeding through here
   * means the picture is the REAL screens painting REAL numbers through the
   * real code path — never a mock-up of what the app might look like. */
  window.FinanceApp = { state: state, paintAll: paintAll, show: show, applyTheme: applyTheme };
})();
