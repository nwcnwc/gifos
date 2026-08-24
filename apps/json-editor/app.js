/* JSON Editor: document in a private collection. Nothing is fetched. */
(function () {
  'use strict';

  var saveDb = null;
  var saveTimer = 0;
  var editor = null;
  var ready = false;
  var applying = false;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}

  var SAMPLE = {
    greeting: 'Hello',
    items: [1, 2, 3],
    nested: { ok: true }
  };

  function setStatus(msg) {
    var el = document.getElementById('status');
    if (el) el.textContent = msg || '';
  }

  function persist() {
    if (!ready || applying || !saveDb || !editor) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var rec = { id: 'last', mode: editor.getMode ? editor.getMode() : 'tree' };
      try { rec.doc = editor.get(); rec.text = null; }
      catch (e) {
        rec.doc = null;
        rec.text = editor.getText ? editor.getText() : '';
      }
      saveDb.put(rec).then(function () { setStatus('Saved on this device'); }).catch(function () {});
    }, 350);
  }

  function boot() {
    var el = document.getElementById('editor');
    if (!el || typeof JSONEditor !== 'function') {
      setStatus('Editor failed to load.');
      return;
    }
    var opts = {
      mode: 'tree',
      modes: ['tree', 'code', 'text'],
      onChange: persist,
      onModeChange: persist
    };
    function start(rec) {
      var mode = (rec && rec.mode) || 'tree';
      opts.mode = mode;
      editor = new JSONEditor(el, opts);
      applying = true;
      try {
        if (rec && rec.doc != null) editor.set(rec.doc);
        else if (rec && rec.text) editor.setText(rec.text);
        else editor.set(SAMPLE);
      } catch (e) {
        editor.set(SAMPLE);
      }
      applying = false;
      ready = true;
      setStatus(rec && (rec.doc != null || rec.text) ? 'Last document on this device' : 'Sample document');
    }
    if (saveDb && saveDb.get) saveDb.get('last').then(start).catch(function () { start(null); });
    else start(null);

    var neu = document.getElementById('new');
    if (neu) neu.addEventListener('click', function () {
      if (!editor) return;
      applying = true;
      editor.set({});
      applying = false;
      ready = true;
      persist();
      setStatus('Empty object');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
