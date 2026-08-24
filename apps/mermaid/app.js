/*
 * Mermaid — textarea + live SVG preview. Vendors mermaid.min.js (MIT).
 * The document lives in the file. Classic IIFE. No CDN.
 */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var renderTimer = 0;
  var seq = 0;
  var SAMPLE = 'flowchart TD\n  A[Start] --> B{Edit me}\n  B -->|Yes| C[Nice]\n  B -->|No| D[Try a sequence]\n  C --> E[Saved in this file]\n  D --> E';
  var $ = function (id) { return document.getElementById(id); };

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({ id: 'doc', text: $('src').value }).catch(function () {});
    }, 300);
  }

  function showError(msg) {
    var err = $('err');
    var view = $('view');
    if (msg) {
      err.hidden = false;
      err.textContent = msg;
    } else {
      err.hidden = true;
      err.textContent = '';
    }
    view.classList.toggle('bad', !!msg);
  }

  function draw() {
    var text = $('src').value || '';
    var mermaid = root.mermaid;
    if (!mermaid || typeof mermaid.render !== 'function') {
      showError('Mermaid did not load.');
      return;
    }
    seq += 1;
    var id = 'mmd' + seq;
    var p = mermaid.render(id, text);
    if (p && typeof p.then === 'function') {
      p.then(function (out) {
        var svg = typeof out === 'string' ? out : (out && out.svg);
        $('view').innerHTML = svg || '';
        showError('');
      }).catch(function (e) {
        showError((e && e.message) ? e.message : 'Could not draw that.');
      });
    } else if (typeof p === 'string') {
      $('view').innerHTML = p;
      showError('');
    }
  }

  function schedule() {
    if (root.MMMp && root.MMMp.onText && root.MMMp.onText($('src').value)) {
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(draw, 200);
      return;
    }
    persist();
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(draw, 200);
  }

  function boot() {
    var mermaid = root.mermaid;
    if (mermaid && mermaid.initialize) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'system-ui, sans-serif',
        flowchart: { htmlLabels: false, useMaxWidth: true },
        sequence: { useMaxWidth: true },
        suppressErrorRendering: true
      });
    }
    $('src').value = SAMPLE;
    $('src').addEventListener('input', schedule);
    $('sampleBtn').addEventListener('click', function (e) {
      e.preventDefault();
      $('src').value = SAMPLE;
      schedule();
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (root.MMMp && root.MMMp.busy && root.MMMp.busy()) { root.MMMp.leave(); return true; }
        return false;
      });
    }
    draw();
    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('doc').then(function (row) {
      if (!row || (root.MMMp && root.MMMp.busy && root.MMMp.busy())) return;
      if (row.text) { $('src').value = row.text; draw(); }
    }).catch(function () {});
  }

  root.MMApp = { draw: draw, persist: persist, sample: SAMPLE };
  boot();
})(window);
