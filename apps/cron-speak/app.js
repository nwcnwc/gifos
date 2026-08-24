/* Cron Speak: expression → English via cRonstrue + field UI + next times.
 * Last expression private. Meeting share is optional (mp.js). Nothing is fetched. */
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
  var saveDb = null, saveTimer = 0, applying = false, selected = -1;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = { expr: '*/5 * * * *', h24: false, verbose: false, dow0: true, history: [] };

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
        dow0: settings.dow0 !== false,
        history: settings.history || []
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

  function remember(expr) {
    var s = String(expr || '').trim();
    if (!s) return;
    var hist = settings.history || [];
    hist = hist.filter(function (x) { return x !== s; });
    hist.unshift(s);
    settings.history = hist.slice(0, 8);
  }

  function toast(msg) {
    var old = root.document.querySelector('.toast');
    if (old) old.remove();
    var el = root.document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1400);
  }

  function copyText(text, ok) {
    text = String(text || '');
    if (!text) return;
    function done() { toast(ok || 'Copied'); }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(done).catch(function () {
        toast('Select the sentence and copy');
      });
      return;
    }
    toast('Select the sentence and copy');
  }

  function paintFields(parsed) {
    var box = $('fields');
    var hint = $('fieldHint');
    var sug = $('suggest');
    if (!box) return;
    box.innerHTML = '';
    if (!parsed || !parsed.fields || !parsed.fields.length) {
      box.hidden = true;
      hint.hidden = true;
      sug.hidden = true;
      selected = -1;
      return;
    }
    box.hidden = false;
    parsed.fields.forEach(function (f, i) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.className = i === selected ? 'on' : '';
      b.innerHTML = '<span class="lab">' + f.short + '</span><span>' + f.value + '</span>';
      b.addEventListener('click', function () {
        if (root.CronMp && root.CronMp.guest) return;
        selected = selected === i ? -1 : i;
        paint();
      });
      box.appendChild(b);
    });
    if (selected >= 0 && parsed.fields[selected]) {
      var f = parsed.fields[selected];
      hint.hidden = false;
      hint.textContent = f.id + ': ' + root.CronTalk.phrase(f.value);
      var opts = root.CronTalk.SUGGEST[f.id] || [];
      sug.innerHTML = '';
      opts.forEach(function (v) {
        var b = root.document.createElement('button');
        b.type = 'button';
        b.textContent = v;
        b.addEventListener('click', function () {
          if (root.CronMp && root.CronMp.guest) return;
          var parts = parsed.fields.map(function (x) { return x.value; });
          parts[selected] = v;
          $('expr').value = parts.join(' ');
          onChange();
        });
        sug.appendChild(b);
      });
      sug.hidden = false;
    } else {
      hint.hidden = true;
      sug.hidden = true;
      sug.innerHTML = '';
    }
  }

  function paintNext(expr) {
    var wrap = $('nextWrap'), ol = $('next'), note = $('nextNote');
    wrap.hidden = true;
    ol.innerHTML = '';
    note.hidden = true;
    note.textContent = '';
    if (!expr || !root.CronTalk) return;
    var res;
    try {
      res = root.CronTalk.nextTimes(expr, new Date(), 5, { dow0: settings.dow0 !== false });
    } catch (e) {
      return;
    }
    wrap.hidden = false;
    if (res.reboot) {
      note.hidden = false;
      note.textContent = 'Next boot of this machine — not a clock time.';
      return;
    }
    if (res.quartz) {
      note.hidden = false;
      note.textContent = 'This uses a Quartz token (L, W or #). The English is right; next times need a calendar.';
      return;
    }
    if (!res.times.length) {
      note.hidden = false;
      note.textContent = 'No matching time in the next year — the day and month never meet.';
      return;
    }
    res.times.forEach(function (d) {
      var li = root.document.createElement('li');
      li.textContent = root.CronTalk.formatStamp(d, settings.h24);
      ol.appendChild(li);
    });
  }

  function paintHistory() {
    var box = $('hist');
    if (!box) return;
    var hist = (settings.history || []).filter(function (x) { return x && x !== settings.expr.trim(); });
    box.innerHTML = '';
    if (!hist.length) { box.hidden = true; return; }
    box.hidden = false;
    hist.slice(0, 6).forEach(function (c) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.textContent = c;
      b.addEventListener('click', function () {
        if (root.CronMp && root.CronMp.guest) return;
        $('expr').value = c;
        onChange();
      });
      box.appendChild(b);
    });
  }

  function paint() {
    var out = $('out'), err = $('err'), empty = $('empty');
    var copyEn = $('copyEn'), copyEx = $('copyEx');
    var expr = String(settings.expr || '').trim();
    var parsed = null;
    if (!expr) {
      out.hidden = true; out.textContent = '';
      err.hidden = true; err.textContent = '';
      empty.hidden = false;
      copyEn.hidden = true; copyEx.hidden = true;
      paintFields(null);
      $('nextWrap').hidden = true;
      paintHistory();
      return;
    }
    empty.hidden = true;
    var english = '';
    var talkErr = null;
    var speakErr = null;
    try { parsed = root.CronTalk.parse(expr, { dow0: settings.dow0 !== false }); }
    catch (e) { talkErr = e; }
    try { english = speak(expr, settings); }
    catch (e) { speakErr = e; }

    if (speakErr) {
      out.hidden = true; out.textContent = '';
      err.hidden = false;
      err.textContent = root.CronTalk.humanError(speakErr, expr);
      copyEn.hidden = true; copyEx.hidden = true;
      paintFields(parsed);
      $('nextWrap').hidden = true;
      paintHistory();
      return;
    }
    out.hidden = false;
    out.textContent = english;
    err.hidden = true; err.textContent = '';
    copyEn.hidden = false; copyEx.hidden = false;
    paintFields(parsed);
    paintNext(expr);
    paintHistory();
    if (talkErr && parsed == null) {
      /* English succeeded (specials/Quartz); field pills stay hidden. */
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
        if (Array.isArray(r.history)) settings.history = r.history.slice(0, 8);
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
        remember(c);
        onChange();
      });
      chips.appendChild(b);
    });
    writeUi();
    paint();
    $('expr').addEventListener('input', onChange);
    $('expr').addEventListener('blur', function () {
      remember(String(settings.expr || '').trim());
      paintHistory();
      persist(true);
    });
    $('h24').addEventListener('change', onChange);
    $('verbose').addEventListener('change', onChange);
    $('dow0').addEventListener('change', onChange);
    $('copyEn').addEventListener('click', function () {
      copyText($('out').textContent, 'Copied English');
    });
    $('copyEx').addEventListener('click', function () {
      copyText(String(settings.expr || '').trim(), 'Copied expression');
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (selected >= 0) { selected = -1; paint(); return true; }
        return false;
      });
    }
    if (root.gifos && typeof root.gifos.launch === 'function') {
      root.gifos.launch().then(function (a) {
        if (!a || a.expr == null) return;
        var s = String(a.expr).slice(0, 200);
        if (!s) return;
        settings.expr = s;
        remember(s);
        writeUi();
        paint();
        persist(true);
        if (root.CronMp) root.CronMp.publish();
      }).catch(function () {});
    }
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

  root.CronSpeak = {
    speak: speak,
    talk: function () { return root.CronTalk; }
  };

  if ($('expr')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      remember(String(settings.expr || '').trim());
      persist(true);
    });
  }
})(window);
