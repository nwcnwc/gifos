/*
 * Hydra — GifOS chrome around Olivia Jack's video synth.
 * vendor/hydra-engine.js paints the glass. This file is the overlay:
 * named patches, the recipe you type on the picture, line / block /
 * sketch eval, and a private last patch so the file is the save.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var MAX = (root.HydraSketch && root.HydraSketch.MAX) || 14000;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var hydra = null;
  var current = { id: 'voronoi', code: '' };
  var codeOpen = true;
  var $ = function (id) { return document.getElementById(id); };

  function snippets() { return root.HydraSnippets || []; }

  function findSnippet(code) {
    var list = snippets();
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }

  function findByKey(key) {
    var want = String(key || '').toLowerCase().replace(/\s+/g, '-');
    if (!want) return null;
    var list = snippets();
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var name = String(p.name || '').toLowerCase();
      if (p.id === want || name === String(key).toLowerCase()) return p;
      if (name.replace(/\s+/g, '-') === want) return p;
    }
    return null;
  }

  function showErr(msg) {
    var el = $('err');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = String(msg);
  }

  function paintWhich() {
    var sn = findSnippet(current.code);
    current.id = sn ? sn.id : 'yours';
    var el = $('which');
    if (el) el.textContent = sn ? sn.name : 'Yours';
    var box = $('chips');
    if (box) {
      var chips = box.querySelectorAll('button');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === current.id);
      }
    }
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({ id: 'patch', code: current.code, snippet: current.id }).catch(function () {});
    }, 250);
  }

  function glassSize() {
    var el = document.documentElement;
    var w = Math.round((el && el.clientWidth) || window.innerWidth || 16);
    var h = Math.round((el && el.clientHeight) || window.innerHeight || 16);
    return { w: Math.max(16, w), h: Math.max(16, h) };
  }

  function fitCanvas() {
    if (!hydra || !hydra.canvas) return;
    var s = glassSize();
    hydra.setResolution(s.w, s.h);
  }

  function setEditor(code) {
    code = String(code || '').slice(0, MAX);
    current.code = code;
    if ($('recipe').value !== code) $('recipe').value = code;
    paintWhich();
  }

  function evalCode(code) {
    showErr('');
    if (!hydra || !hydra.api) {
      showErr(hydra && hydra.error ? hydra.error : 'The synth did not start.');
      return false;
    }
    try {
      root.HydraSketch.run(code, hydra.api);
      return true;
    } catch (err) {
      showErr(err && err.message ? err.message : String(err));
      return false;
    }
  }

  function applyPatch(code, fromMp) {
    setEditor(code);
    return evalCode(code);
  }

  function applyFromEditor() {
    var code = $('recipe').value;
    if (root.HydraMp && root.HydraMp.onApply && root.HydraMp.onApply(code)) return;
    applyPatch(code);
    persist();
  }

  function caret() {
    var ta = $('recipe');
    var n = ta.selectionStart;
    if (n == null) n = ta.value.length;
    return n;
  }

  function currentLine() {
    var v = $('recipe').value;
    var pos = caret();
    var start = v.lastIndexOf('\n', pos - 1) + 1;
    var end = v.indexOf('\n', pos);
    if (end < 0) end = v.length;
    return v.slice(start, end);
  }

  function currentBlock() {
    var v = $('recipe').value;
    var pos = caret();
    var lines = v.split('\n');
    var i = 0, acc = 0;
    while (i < lines.length && acc + lines[i].length + 1 <= pos) {
      acc += lines[i].length + 1;
      i++;
    }
    if (i >= lines.length) i = Math.max(0, lines.length - 1);
    var start = i, end = i;
    while (start > 0 && lines[start - 1].trim() !== '') start--;
    while (end < lines.length && lines[end].trim() !== '') end++;
    return lines.slice(start, end).join('\n');
  }

  function evalLocal(src) {
    src = String(src || '');
    if (!src.trim()) return;
    current.code = $('recipe').value;
    paintWhich();
    evalCode(src);
    persist();
  }

  function loadSnippet(sn) {
    if (!sn) return;
    if (root.HydraMp && root.HydraMp.onApply && root.HydraMp.onApply(sn.code)) {
      setEditor(sn.code);
      persist();
      return;
    }
    applyPatch(sn.code);
    persist();
  }

  function bindChips() {
    var box = $('chips');
    box.textContent = '';
    snippets().forEach(function (sn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = sn.name;
      b.setAttribute('data-id', sn.id);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        loadSnippet(sn);
      });
      box.appendChild(b);
    });
  }

  function setCodeOpen(open) {
    codeOpen = !!open;
    document.body.classList.toggle('hide-code', !codeOpen);
    var btn = $('patchBtn');
    if (btn) btn.setAttribute('aria-expanded', codeOpen ? 'true' : 'false');
  }

  function hideWelcome() {
    var w = $('welcome');
    if (w) w.hidden = true;
  }

  function showWelcome() {
    var w = $('welcome');
    if (w) w.hidden = false;
  }

  function bind() {
    $('runBtn').addEventListener('click', function (e) { e.preventDefault(); applyFromEditor(); });
    $('patchBtn').addEventListener('click', function (e) {
      e.preventDefault();
      setCodeOpen(!codeOpen);
    });
    $('welcomeClose').addEventListener('click', function (e) {
      e.preventDefault();
      hideWelcome();
    });
    $('recipe').addEventListener('input', function () {
      current.code = $('recipe').value;
      paintWhich();
    });
    window.addEventListener('keydown', function (e) {
      var cmd = e.ctrlKey || e.metaKey;
      if (cmd && e.shiftKey && (e.key === 'Enter')) {
        e.preventDefault();
        applyFromEditor();
        return;
      }
      if (cmd && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        evalLocal(currentLine());
        return;
      }
      if (e.altKey && !cmd && e.key === 'Enter') {
        e.preventDefault();
        evalLocal(currentBlock());
        return;
      }
      if (cmd && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault();
        setCodeOpen(!codeOpen);
      }
    });
    if (api && api.onBack) {
      api.onBack(function () {
        if (!$('welcome').hidden) {
          hideWelcome();
          return true;
        }
        if (codeOpen && window.matchMedia('(max-width: 720px)').matches) {
          setCodeOpen(false);
          return true;
        }
        return false;
      });
    }
    window.addEventListener('pointermove', function (ev) {
      if (!hydra || !hydra.canvas) return;
      var c = hydra.canvas;
      var r = c.getBoundingClientRect();
      hydra.mouse.x = (ev.clientX - r.left) * (c.width / (r.width || 1));
      hydra.mouse.y = (ev.clientY - r.top) * (c.height / (r.height || 1));
    }, { passive: true });
  }

  function bootSynth() {
    var canvas = $('view');
    try {
      hydra = new root.HydraSynth({
        canvas: canvas,
        onError: function (err) { showErr(err && err.message ? err.message : String(err)); }
      });
    } catch (err) {
      showErr(err && err.message ? err.message : String(err));
      return;
    }
    if (hydra.error) showErr(hydra.error);
    fitCanvas();
    window.addEventListener('resize', function () { fitCanvas(); });
    if (root.ResizeObserver) {
      try { new ResizeObserver(function () { fitCanvas(); }).observe(document.documentElement); } catch (e) {}
    }
  }

  function boot() {
    bindChips();
    bind();
    bootSynth();
    setCodeOpen(true);

    var first = findByKey('voronoi') || snippets()[0];
    if (first) applyPatch(first.code);

    var launchP = (api && api.launch) ? Promise.resolve(api.launch()).catch(function () { return null; }) : Promise.resolve(null);
    var saveP = Promise.resolve(null);
    if (api && api.db) {
      saveDb = api.db('save');
      saveP = saveDb.get('patch').catch(function () { return null; });
    }
    Promise.all([launchP, saveP]).then(function (pair) {
      var go = pair[0];
      var row = pair[1];
      if (root.HydraMp && root.HydraMp.busy()) return;
      var sn = go && go.patch ? findByKey(go.patch) : null;
      if (sn) { loadSnippet(sn); return; }
      if (row && row.code) {
        applyPatch(row.code);
        return;
      }
      showWelcome();
    }).catch(function () {});
  }

  root.HydraApp = {
    applyPatch: applyPatch,
    persist: persist,
    current: function () { return { code: current.code, id: current.id }; },
    paintWhich: paintWhich,
    hydra: function () { return hydra; }
  };

  boot();
})(window);
