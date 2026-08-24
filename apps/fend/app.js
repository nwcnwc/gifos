/* fend: notepad calculator. Engine from pinned wasm bytes. Pad is private. */
(function () {
  'use strict';

  var saveDb = null;
  var saveTimer = 0;
  var ready = false;
  var vars = '{}';
  var lines = [];
  var hist = [];
  var histI = -1;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}

  function $(id) { return document.getElementById(id); }
  function setStatus(msg) { var el = $('status'); if (el) el.textContent = msg || ''; }

  function b64ToU8(b64) {
    var bin = atob(String(b64 || ''));
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function persist() {
    if (!ready || !saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({ id: 'last', lines: lines, vars: vars }).catch(function () {});
    }, 300);
  }

  function paint() {
    var log = $('log');
    if (!log) return;
    log.textContent = '';
    lines.forEach(function (row) {
      var a = document.createElement('div');
      a.className = 'line';
      a.textContent = '> ' + row.q;
      var b = document.createElement('div');
      b.className = row.ok ? 'ans' : 'bad';
      b.textContent = row.a;
      log.appendChild(a);
      log.appendChild(b);
    });
    log.scrollTop = log.scrollHeight;
  }

  function evalLine(input) {
    input = String(input || '').trim();
    if (!input) return;
    var out = { ok: false, result: '' };
    try {
      var raw = window.Fend.evaluateFendWithVariablesJson(input, 2000, vars);
      out = JSON.parse(raw);
    } catch (e) {
      out = { ok: false, result: String((e && e.message) || e) };
    }
    if (out.ok && out.variables) vars = out.variables;
    lines.push({ q: input, a: out.result || (out.ok ? '' : 'error'), ok: !!out.ok });
    hist.push(input);
    histI = hist.length;
    paint();
    persist();
  }

  function bootEngine() {
    if (!window.Fend || typeof window.Fend.initSync !== 'function') {
      setStatus('Engine failed to load.');
      return false;
    }
    if (!window.FEND_WASM_B64) {
      setStatus('Engine bytes missing.');
      return false;
    }
    try {
      window.Fend.initSync({ module: b64ToU8(window.FEND_WASM_B64) });
      return true;
    } catch (e) {
      setStatus('Engine could not start.');
      return false;
    }
  }

  function boot() {
    if (!bootEngine()) return;
    function start(rec) {
      if (rec && Array.isArray(rec.lines)) lines = rec.lines;
      if (rec && rec.vars) vars = rec.vars;
      ready = true;
      paint();
      setStatus(lines.length ? 'Last pad on this device' : 'Ready — type a line and press Enter');
    }
    if (saveDb && saveDb.get) saveDb.get('last').then(start).catch(function () { start(null); });
    else start(null);

    var form = $('form');
    var input = $('input');
    var clear = $('clear');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      evalLine(input.value);
      input.value = '';
    });
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!hist.length) return;
        histI = Math.max(0, histI - 1);
        input.value = hist[histI];
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        histI = Math.min(hist.length, histI + 1);
        input.value = histI < hist.length ? hist[histI] : '';
      }
    });
    if (clear) clear.addEventListener('click', function () {
      lines = [];
      vars = '{}';
      paint();
      persist();
      setStatus('Pad cleared');
    });
    if (input) input.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
