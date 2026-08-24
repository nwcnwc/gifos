/* fend: notepad calculator. Engine from pinned wasm bytes. Pad is private. */
(function (root) {
  'use strict';

  var MISS = 'The calculator engine did not start on this device.';
  var MAX_LINES = 200;
  var EXAMPLES = ['1 ft to cm', '5 kg in lb', '100 C to F', 'sqrt(2)', 'roll 4d6'];

  function insertToken(current, token, kind) {
    current = String(current || '');
    token = String(token || '');
    kind = kind || 'key';
    if (kind === 'bksp' || token === '⌫') return current.slice(0, -1);
    if (kind === 'abc' || token === 'abc') return current;
    if (kind === 'go' || token === '=') return current;
    if (token === 'π') token = 'pi';
    if (kind === 'spc' || token === 'spc') {
      if (!current || /\s$/.test(current)) return current;
      return current + ' ';
    }
    if (kind === 'unit' || kind === 'word') {
      if (current && !/[\s(]$/.test(current)) current += ' ';
      current += token;
      if (kind === 'word') current += ' ';
      return current;
    }
    return current + token;
  }

  function answerOf(out) {
    if (!out) return 'That did not calculate.';
    if (out.ok) return out.result || '';
    return out.message || 'That did not calculate.';
  }

  function evaluate(input, vars, engine) {
    input = String(input || '').trim();
    if (!input) return { skip: true, vars: vars || '{}' };
    vars = vars || '{}';
    var out = { ok: false, message: 'That did not calculate.' };
    try {
      var raw = engine.evaluateFendWithVariablesJson(input, 2000, vars);
      out = JSON.parse(raw);
    } catch (e) {
      out = { ok: false, message: String((e && e.message) || e) };
    }
    return {
      skip: false,
      q: input,
      a: answerOf(out),
      ok: !!out.ok,
      vars: (out.ok && out.variables) ? out.variables : vars
    };
  }

  function trimPad(lines) {
    if (!Array.isArray(lines)) return [];
    if (lines.length <= MAX_LINES) return lines.slice();
    return lines.slice(lines.length - MAX_LINES);
  }

  var FendApp = {
    MISS: MISS,
    MAX_LINES: MAX_LINES,
    EXAMPLES: EXAMPLES,
    insertToken: insertToken,
    answerOf: answerOf,
    evaluate: evaluate,
    trimPad: trimPad
  };
  root.FendApp = FendApp;

  var saveDb = null;
  var saveTimer = 0;
  var ready = false;
  var vars = '{}';
  var lines = [];
  var hist = [];
  var histI = -1;
  var osKb = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

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
    if (!lines.length) {
      var intro = document.createElement('p');
      intro.className = 'empty';
      intro.textContent = 'Type a line. Try one of these.';
      log.appendChild(intro);
      var row = document.createElement('div');
      row.className = 'examples';
      EXAMPLES.forEach(function (ex) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = ex;
        b.addEventListener('click', function () { evalLine(ex); });
        row.appendChild(b);
      });
      log.appendChild(row);
      return;
    }
    lines.forEach(function (row, i) {
      var a = document.createElement('div');
      a.className = 'line';
      a.textContent = '> ' + row.q;
      a.addEventListener('click', function () { fill(row.q); });
      var b = document.createElement('div');
      b.className = row.ok ? 'ans' : 'bad';
      b.textContent = row.a;
      b.addEventListener('click', function () { fill(row.ok ? row.a : row.q); });
      log.appendChild(a);
      log.appendChild(b);
      void i;
    });
    log.scrollTop = log.scrollHeight;
  }

  function fill(text) {
    var input = $('input');
    if (!input) return;
    input.value = text;
    input.focus();
    try { input.setSelectionRange(text.length, text.length); } catch (e) {}
  }

  function evalLine(input) {
    var engine = root.Fend;
    var r = evaluate(input, vars, engine);
    if (r.skip) return;
    vars = r.vars;
    lines.push({ q: r.q, a: r.a, ok: r.ok });
    lines = trimPad(lines);
    hist.push(r.q);
    if (hist.length > MAX_LINES) hist = hist.slice(hist.length - MAX_LINES);
    histI = hist.length;
    paint();
    persist();
    setStatus(r.ok ? '' : r.a);
  }

  function bootEngine() {
    if (!root.Fend || typeof root.Fend.initSync !== 'function') {
      setStatus(MISS);
      return false;
    }
    if (!root.FEND_WASM_B64) {
      setStatus(MISS);
      return false;
    }
    try {
      root.Fend.initSync({ module: b64ToU8(root.FEND_WASM_B64) });
      return true;
    } catch (e) {
      setStatus(MISS);
      return false;
    }
  }

  function setOsKb(on) {
    osKb = !!on;
    var input = $('input');
    var abc = $('abc');
    if (input) input.setAttribute('inputmode', osKb ? 'text' : 'none');
    if (abc) abc.setAttribute('aria-pressed', osKb ? 'true' : 'false');
    if (osKb && input) input.focus();
  }

  function applyToken(btn) {
    var input = $('input');
    if (!input || !btn) return;
    var token = btn.getAttribute('data-token') || '';
    var kind = btn.getAttribute('data-kind') || 'key';
    if (kind === 'abc') {
      setOsKb(!osKb);
      return;
    }
    if (kind === 'go' || token === '=') {
      evalLine(input.value);
      input.value = '';
      return;
    }
    if (osKb) setOsKb(false);
    input.value = insertToken(input.value, token, kind);
  }

  function bindKeys() {
    function onKey(e) {
      var t = e.target;
      if (!t || !t.getAttribute || !t.getAttribute('data-token')) return;
      if (t.id === 'abc') return;
      e.preventDefault();
      applyToken(t);
    }
    var chips = $('chips');
    var pad = $('pad');
    if (chips) chips.addEventListener('click', onKey);
    if (pad) pad.addEventListener('click', onKey);
    var abc = $('abc');
    if (abc) abc.addEventListener('click', function (e) {
      e.preventDefault();
      applyToken(abc);
    });
  }

  function boot() {
    if (!document.getElementById) return;
    if (!bootEngine()) {
      if (document.body) document.body.classList.add('dead');
      return;
    }
    function start(rec) {
      if (rec && Array.isArray(rec.lines)) lines = trimPad(rec.lines);
      if (rec && rec.vars) vars = rec.vars;
      hist = lines.map(function (row) { return row.q; });
      histI = hist.length;
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
      hist = [];
      histI = -1;
      paint();
      persist();
      setStatus('Pad cleared');
    });
    bindKeys();
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (osKb) { setOsKb(false); return true; }
        if (input && input.value) { input.value = ''; return true; }
        return false;
      });
    }
    if (input) input.focus();
  }

  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);
