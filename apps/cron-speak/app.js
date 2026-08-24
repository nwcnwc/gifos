/* Cron Speak: expression → English via cRonstrue. Last expression private.
 * Meeting share is optional (mp.js). Nothing is fetched. */
(function (root) {
  'use strict';

  var CHIPS = [
    '*/5 * * * *',
    '0 9 * * 1-5',
    '0 0 * * *',
    '0 0 1 * *',
    '0 12 * * 0',
    '15 14 1 * *',
    '@hourly',
    '@daily'
  ];

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null, saveTimer = 0, applying = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = { expr: '*/5 * * * *', h24: false, verbose: false, dow0: true };

  function persist(immediate) {
    if (applying || !saveDb) return;
    if (root.CronMp && root.CronMp.guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        expr: settings.expr,
        h24: !!settings.h24,
        verbose: !!settings.verbose,
        dow0: settings.dow0 !== false
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function speak(expr, opts) {
    if (!root.cronstrue || typeof root.cronstrue.toString !== 'function') {
      throw new Error('Translator missing');
    }
    return root.cronstrue.toString(expr, {
      throwExceptionOnParseError: true,
      verbose: !!(opts && opts.verbose),
      use24HourTimeFormat: !!(opts && opts.h24),
      dayOfWeekStartIndexZero: opts && opts.dow0 === false ? false : true
    });
  }

  function paint() {
    var out = $('out'), err = $('err');
    var expr = String(settings.expr || '').trim();
    if (!expr) {
      out.textContent = '';
      err.hidden = true;
      return;
    }
    try {
      out.textContent = speak(expr, settings);
      err.hidden = true;
      err.textContent = '';
    } catch (e) {
      out.textContent = '';
      err.hidden = false;
      err.textContent = String(e && e.message || e);
    }
  }

  function readUi() {
    settings.expr = $('expr').value;
    settings.h24 = $('h24').checked;
    settings.verbose = $('verbose').checked;
    settings.dow0 = $('dow0').checked;
  }
  function writeUi() {
    applying = true;
    $('expr').value = settings.expr;
    $('h24').checked = !!settings.h24;
    $('verbose').checked = !!settings.verbose;
    $('dow0').checked = settings.dow0 !== false;
    applying = false;
  }
  function applyRemote(row) {
    if (!row) return;
    applying = true;
    settings.expr = row.expr || '';
    settings.h24 = !!row.h24;
    settings.verbose = !!row.verbose;
    settings.dow0 = row.dow0 !== false;
    writeUi();
    applying = false;
    paint();
  }
  function onChange() {
    if (applying) return;
    if (root.CronMp && root.CronMp.guest) return;
    readUi();
    paint();
    persist();
    if (root.CronMp) root.CronMp.publish();
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        if (typeof r.expr === 'string') settings.expr = r.expr;
        settings.h24 = !!r.h24;
        settings.verbose = !!r.verbose;
        settings.dow0 = r.dow0 !== false;
      });
    }).catch(function () {});
  }

  function boot() {
    var chips = $('chips');
    CHIPS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = c;
      b.addEventListener('click', function () {
        if (root.CronMp && root.CronMp.guest) return;
        $('expr').value = c;
        onChange();
      });
      chips.appendChild(b);
    });
    writeUi();
    paint();
    $('expr').addEventListener('input', onChange);
    $('h24').addEventListener('change', onChange);
    $('verbose').addEventListener('change', onChange);
    $('dow0').addEventListener('change', onChange);
    var Mp = root.CronMp;
    if (Mp) {
      Mp.getState = function () { return settings; };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        var el = $('meet');
        el.textContent = text;
        el.classList.toggle('live', !!isGuest);
      };
      Mp.watch();
    } else if ($('meet')) {
      $('meet').textContent = 'Press Invite (top bar) to show this sentence, read-only, in a meeting.';
    }
  }

  root.CronSpeak = { speak: speak };

  if ($('expr')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
    });
  }
})(window);
