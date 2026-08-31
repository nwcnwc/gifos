/*
 * Hydra — GifOS chrome around Olivia Jack's video synth.
 * vendor/hydra-engine.js paints. This file is the shell: named patches,
 * the recipe box, Run, and a private last patch so the file is the save.
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
  var current = { id: 'kaleid', code: '' };
  var sheetOpen = true;
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

  function fitCanvas() {
    if (!hydra || !hydra.canvas) return;
    var stage = $('stage');
    var r = stage.getBoundingClientRect();
    var w = Math.max(16, Math.round(r.width));
    var h = Math.max(16, Math.round(r.height));
    hydra.setResolution(w, h);
  }

  function applyPatch(code, fromMp) {
    code = String(code || '').slice(0, MAX);
    current.code = code;
    if ($('recipe').value !== code) $('recipe').value = code;
    paintWhich();
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

  function applyFromEditor() {
    var code = $('recipe').value;
    if (root.HydraMp && root.HydraMp.onApply && root.HydraMp.onApply(code)) return;
    applyPatch(code);
    persist();
  }

  function loadSnippet(sn) {
    if (!sn) return;
    if (root.HydraMp && root.HydraMp.onApply && root.HydraMp.onApply(sn.code)) {
      $('recipe').value = sn.code;
      current.code = sn.code;
      paintWhich();
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

  function setSheet(open) {
    sheetOpen = !!open;
    document.body.classList.toggle('show-patch', sheetOpen);
    var btn = $('patchBtn');
    if (btn) btn.setAttribute('aria-expanded', sheetOpen ? 'true' : 'false');
    setTimeout(fitCanvas, 40);
  }

  function bind() {
    $('runBtn').addEventListener('click', function (e) { e.preventDefault(); applyFromEditor(); });
    $('patchBtn').addEventListener('click', function (e) {
      e.preventDefault();
      setSheet(!sheetOpen);
    });
    $('recipe').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        applyFromEditor();
      }
    });
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault();
        setSheet(!sheetOpen);
      }
    });
    if (api && api.onBack) {
      api.onBack(function () {
        if (sheetOpen && window.matchMedia('(max-width: 720px)').matches) {
          setSheet(false);
          return true;
        }
        return false;
      });
    }
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
      try { new ResizeObserver(function () { fitCanvas(); }).observe($('stage')); } catch (e) {}
    }
  }

  function boot() {
    bindChips();
    bind();
    bootSynth();
    if (window.matchMedia('(max-width: 720px)').matches) setSheet(false);
    else setSheet(true);

    var first = findByKey('kaleid') || snippets()[0];
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
      if (row && row.code) applyPatch(row.code);
    }).catch(function () {});

    var hint = $('hint');
    if (hint) setTimeout(function () { hint.hidden = true; }, 5000);
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
