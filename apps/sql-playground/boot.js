/* SQL Playground: schema, query, results. Database saved in this file. */
(function (root) {
  'use strict';

  var E = root.SqlEngine;
  var MAX_HIST = 12;
  var sqlMod = null;
  var db = null;
  var dbName = 'database.sqlite';
  var localRev = 0;
  var applying = false;
  var ready = false;
  var fileDb = null;
  var prefsDb = null;
  var saveTimer = 0;
  var queryTimer = 0;
  var history = [];
  var lastLaunch = null;
  var schemaOpen = false;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, isErr) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('bad', !!isErr);
  }

  function setMeet(msg, live) {
    var el = $('meet');
    if (!el) return;
    el.innerHTML = '';
    if (!msg) return;
    el.classList.toggle('live', !!live);
    var parts = String(msg).split('Invite');
    if (parts.length === 2) {
      el.appendChild(document.createTextNode(parts[0]));
      var b = document.createElement('b');
      b.textContent = 'Invite';
      el.appendChild(b);
      el.appendChild(document.createTextNode(parts[1]));
    } else {
      el.textContent = msg;
    }
  }

  function persistPrefs() {
    if (!prefsDb) return;
    var sql = $('sql') ? $('sql').value : '';
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = setTimeout(function () {
      queryTimer = 0;
      prefsDb.put({ id: 'ui', query: sql, history: history.slice() }).catch(function () {});
    }, 250);
  }

  function persistDb() {
    if (!ready || !db || !fileDb || applying) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var bytes;
      try { bytes = db.export(); } catch (e) { return; }
      localRev += 1;
      fileDb.put({
        id: 'db',
        bytes: bytes,
        name: dbName,
        rev: localRev,
        at: Date.now()
      }).catch(function (err) {
        setStatus(String((err && err.message) || err || 'Could not save.'), true);
      });
    }, 180);
  }

  function paintSchema() {
    var box = $('schemaList');
    if (!box || !db) return;
    box.textContent = '';
    var tables = E.schema(db);
    if (!tables.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No tables yet. Run CREATE TABLE, or tap Sample.';
      box.appendChild(empty);
      return;
    }
    tables.forEach(function (t) {
      var item = document.createElement('div');
      item.className = 'tbl';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tbl-name';
      var count = t.count == null ? '' : String(t.count);
      btn.textContent = t.name + (count === '' ? '' : '  ' + count);
      btn.setAttribute('aria-label', 'Select from ' + t.name);
      btn.addEventListener('click', function () {
        fillSql(E.selectTableSql(t.name), true);
        if (schemaOpen) setSchemaOpen(false);
      });
      var tog = document.createElement('button');
      tog.type = 'button';
      tog.className = 'tbl-tog';
      tog.setAttribute('aria-expanded', 'false');
      tog.textContent = t.type === 'view' ? 'view' : '▸';
      var cols = document.createElement('ul');
      cols.className = 'cols';
      cols.hidden = true;
      (t.columns || []).forEach(function (c) {
        var li = document.createElement('li');
        var n = document.createElement('code');
        n.textContent = c.name;
        li.appendChild(n);
        var ty = document.createElement('span');
        ty.textContent = (c.type || 'any') + (c.pk ? ' pk' : '');
        li.appendChild(ty);
        cols.appendChild(li);
      });
      tog.addEventListener('click', function () {
        var open = cols.hidden;
        cols.hidden = !open;
        tog.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (t.type !== 'view') tog.textContent = open ? '▾' : '▸';
      });
      item.appendChild(tog);
      item.appendChild(btn);
      item.appendChild(cols);
      box.appendChild(item);
    });
  }

  function paintChips() {
    var row = $('chips');
    if (!row) return;
    row.textContent = '';
    (root.SQL_CHIPS || []).forEach(function (ch) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = ch.label;
      b.addEventListener('click', function () { fillSql(ch.sql, true); });
      row.appendChild(b);
    });
  }

  function paintHistory() {
    var row = $('hist');
    if (!row) return;
    row.textContent = '';
    if (!history.length) return;
    history.slice().reverse().forEach(function (sql) {
      var b = document.createElement('button');
      b.type = 'button';
      var one = String(sql).replace(/\s+/g, ' ').trim();
      b.textContent = one.length > 42 ? one.slice(0, 40) + '…' : one;
      b.title = sql;
      b.addEventListener('click', function () { fillSql(sql, false); });
      row.appendChild(b);
    });
  }

  function paintResults(out) {
    var box = $('results');
    if (!box) return;
    box.textContent = '';
    if (!out) {
      var hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Run a query. Try a chip, or tap a table.';
      box.appendChild(hint);
      return;
    }
    if (!out.ok) {
      var err = document.createElement('p');
      err.className = 'err';
      err.textContent = out.error;
      box.appendChild(err);
      return;
    }
    var sets = out.results || [];
    if (!sets.length) {
      var note = document.createElement('p');
      note.className = 'hint';
      if (out.changes) note.textContent = out.changes + (out.changes === 1 ? ' row changed.' : ' rows changed.');
      else note.textContent = 'Done. No result rows.';
      box.appendChild(note);
      return;
    }
    sets.forEach(function (set, i) {
      if (sets.length > 1) {
        var cap = document.createElement('p');
        cap.className = 'set-cap';
        cap.textContent = 'Result ' + (i + 1);
        box.appendChild(cap);
      }
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      (set.columns || []).forEach(function (c) {
        var th = document.createElement('th');
        th.textContent = c;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      (set.values || []).forEach(function (row) {
        var tr = document.createElement('tr');
        (row || []).forEach(function (cell) {
          var td = document.createElement('td');
          var info = E.cellText(cell);
          td.className = info.kind;
          td.textContent = info.text;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      box.appendChild(wrap);
      if (set.extra) {
        var more = document.createElement('p');
        more.className = 'hint';
        more.textContent = 'Showing ' + E.ROW_CAP + ' rows; ' + set.extra + ' more not listed.';
        box.appendChild(more);
      }
    });
  }

  function summarize(out) {
    if (!out) return '';
    if (!out.ok) return out.error;
    var rows = 0;
    (out.results || []).forEach(function (s) { rows += (s.values || []).length; });
    var bits = [];
    if (out.results && out.results.length) {
      bits.push(rows + (rows === 1 ? ' row' : ' rows'));
    } else if (out.changes) {
      bits.push(out.changes + (out.changes === 1 ? ' row changed' : ' rows changed'));
    } else {
      bits.push('done');
    }
    bits.push(Math.round(out.ms) + ' ms');
    if (out.clipped) bits.push('clipped');
    return bits.join(' · ');
  }

  function remember(sql) {
    sql = String(sql || '').trim();
    if (!sql) return;
    history = history.filter(function (h) { return h !== sql; });
    history.push(sql);
    if (history.length > MAX_HIST) history = history.slice(history.length - MAX_HIST);
    paintHistory();
    persistPrefs();
  }

  function fillSql(sql, runNow) {
    var ta = $('sql');
    if (!ta) return;
    ta.value = sql;
    persistPrefs();
    if (runNow) execSql(sql);
    else ta.focus();
  }

  function execSql(sql, opts) {
    opts = opts || {};
    if (!db) { setStatus(E.MISS, true); return; }
    var out = E.run(db, sql);
    paintResults(out);
    setStatus(summarize(out), !out.ok);
    if (out.ok && !opts.silent) remember(sql);
    if (out.ok && out.mutated) {
      paintSchema();
      persistDb();
    }
    return out;
  }

  function closeDb() {
    if (db) {
      try { db.close(); } catch (e) {}
      db = null;
    }
  }

  function useDb(next, name, fromRemote) {
    closeDb();
    db = next;
    dbName = name || dbName || 'database.sqlite';
    ready = true;
    paintSchema();
    if (!fromRemote) persistDb();
  }

  function loadSample(runStarter) {
    if (!sqlMod) return;
    try {
      useDb(E.loadSample(sqlMod), root.SQL_SAMPLE_NAME || 'chinook-tiny.sqlite', false);
      fillSql(root.SQL_STARTER || '', !!runStarter);
      setStatus('Sample music shop loaded.');
    } catch (e) {
      setStatus(E.friendlyError(e), true);
    }
  }

  function newDb() {
    if (!sqlMod) return;
    useDb(new sqlMod.Database(), 'database.sqlite', false);
    fillSql('', false);
    paintResults(null);
    setStatus('Empty database.');
  }

  function openBytes(bytes, name, fromRemote) {
    if (!sqlMod) return false;
    var u8 = E.asU8(bytes);
    if (!u8 || !u8.length) return false;
    try {
      useDb(E.open(sqlMod, u8), name || dbName, fromRemote);
      return true;
    } catch (e) {
      setStatus('Not a SQLite database — ' + E.friendlyError(e), true);
      return false;
    }
  }

  function applyRemote(rec, isGuest) {
    if (!rec) {
      if (isGuest && !db) setStatus('Waiting for the shared database…');
      return;
    }
    var rev = rec.rev | 0;
    if (rev && rev <= localRev && db) return;
    var bytes = E.asU8(rec.bytes);
    if (!bytes || !bytes.length) return;
    applying = true;
    localRev = rev || localRev;
    var ok = openBytes(bytes, rec.name, true);
    applying = false;
    if (ok && isGuest) setStatus('Shared database · ' + (rec.name || dbName));
  }

  function saveFile() {
    if (!db) return;
    var bytes;
    try { bytes = db.export(); } catch (e) {
      setStatus(E.friendlyError(e), true);
      return;
    }
    var blob = new Blob([bytes], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = dbName || 'database.sqlite';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    setStatus('Saved ' + a.download + ' on this device.');
  }

  function openFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var u8 = new Uint8Array(reader.result);
      if (openBytes(u8, file.name || 'opened.sqlite', false)) {
        paintResults(null);
        setStatus('Opened ' + (file.name || 'database') + '.');
      }
    };
    reader.onerror = function () { setStatus('Could not read that file.', true); };
    reader.readAsArrayBuffer(file);
  }

  function setSchemaOpen(on) {
    schemaOpen = !!on;
    var side = $('schema');
    var btn = $('schemaBtn');
    if (side) side.classList.toggle('open', schemaOpen);
    if (document.body) document.body.classList.toggle('schema-open', schemaOpen);
    if (btn) {
      btn.setAttribute('aria-expanded', schemaOpen ? 'true' : 'false');
      btn.textContent = schemaOpen ? 'Close tables' : 'Tables';
    }
  }

  function bind() {
    $('runBtn').addEventListener('click', function () { execSql($('sql').value); });
    $('explainBtn').addEventListener('click', function () {
      var sql = E.explainSql($('sql').value);
      if (!sql) { setStatus('Type a SQL statement first.', true); return; }
      execSql(sql, { silent: true });
    });
    $('sampleBtn').addEventListener('click', function () { loadSample(true); });
    $('newBtn').addEventListener('click', function () { newDb(); });
    $('saveBtn').addEventListener('click', function () { saveFile(); });
    $('file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      openFile(f);
    });
    $('sql').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        execSql($('sql').value);
      }
    });
    $('sql').addEventListener('input', persistPrefs);
    var schemaBtn = $('schemaBtn');
    if (schemaBtn) schemaBtn.addEventListener('click', function () { setSchemaOpen(!schemaOpen); });
    document.addEventListener('click', function (e) {
      if (!schemaOpen) return;
      var side = $('schema');
      var btn = $('schemaBtn');
      if (side && side.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      if (window.matchMedia && !window.matchMedia('(max-width: 720px)').matches) return;
      setSchemaOpen(false);
    });
    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (schemaOpen) { setSchemaOpen(false); return true; }
        return false;
      });
    }
  }

  function restorePrefs() {
    if (!prefsDb) return Promise.resolve();
    return prefsDb.get('ui').then(function (row) {
      if (!row) return;
      if (Array.isArray(row.history)) history = row.history.slice(-MAX_HIST);
      paintHistory();
      var ta = $('sql');
      if (ta && row.query && !ta.value) ta.value = row.query;
    }).catch(function () {});
  }

  function applyLaunch(go) {
    if (!go || go.sql == null) return;
    var sql = String(go.sql);
    if (!sql.trim()) return;
    lastLaunch = sql;
    fillSql(sql, true);
  }

  function boot() {
    if (!E) return;
    paintChips();
    paintResults(null);
    bind();
    try { if (root.gifos && root.gifos.db) fileDb = root.gifos.db('file'); } catch (e) {}
    try { if (root.gifos && root.gifos.db) prefsDb = root.gifos.db('prefs'); } catch (e) {}

    var Mp = root.SqlPlayMp;
    if (Mp) {
      Mp.onStatus = setMeet;
      Mp.onRemote = applyRemote;
      Mp.watch();
    }

    restorePrefs();

    function whoAmI() {
      if (!root.gifos || typeof root.gifos.info !== 'function') {
        return Promise.resolve({ owner: true });
      }
      return root.gifos.info().then(function (inf) {
        return { owner: !(inf && inf.owner === false) };
      }).catch(function () { return { owner: true }; });
    }

    E.start().then(function (SQL) {
      sqlMod = SQL;
      return whoAmI();
    }).then(function (who) {
      if (fileDb) {
        return fileDb.get('db').then(function (rec) {
          if (rec && E.asU8(rec.bytes) && E.asU8(rec.bytes).length) {
            localRev = rec.rev | 0;
            applying = true;
            openBytes(rec.bytes, rec.name, true);
            applying = false;
            if (!$('sql').value) fillSql(root.SQL_STARTER || '', false);
            setStatus('Database restored.');
            return;
          }
          if (!who.owner) {
            setStatus('Waiting for the shared database…');
            return;
          }
          loadSample(true);
        }).catch(function () {
          if (!who.owner) { setStatus('Waiting for the shared database…'); return; }
          loadSample(true);
        });
      }
      loadSample(true);
    }).then(function () {
      if (root.gifos && typeof root.gifos.launch === 'function') {
        return root.gifos.launch().then(applyLaunch).catch(function () {});
      }
    }).catch(function (err) {
      setStatus((err && err.message) || E.MISS, true);
      if (document.body) document.body.classList.add('dead');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);
