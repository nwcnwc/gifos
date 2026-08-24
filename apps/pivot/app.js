/* Pivot: CSV in, drag-and-drop grid, last table private. Nothing is fetched. */
(function () {
  'use strict';

  var saveDb = null;
  var saveTimer = 0;
  var applying = false;
  var ready = false;
  var currentCsv = '';
  var lastConfig = null;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}

  var DEFAULT_CONFIG = {
    rows: ['Province'],
    cols: ['Party'],
    aggregatorName: 'Count',
    rendererName: 'Table'
  };

  function setStatus(msg) {
    var el = document.getElementById('status');
    if (el) el.textContent = msg || '';
  }

  function slimConfig(config) {
    var copy;
    try { copy = JSON.parse(JSON.stringify(config)); } catch (e) { return null; }
    delete copy.aggregators;
    delete copy.renderers;
    delete copy.rendererOptions;
    delete copy.localeStrings;
    delete copy.hiddenAttributes;
    delete copy.hiddenFromAggregators;
    delete copy.hiddenFromDragDrop;
    return copy;
  }

  function persist(immediate) {
    if (applying || !saveDb || !ready) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        csv: currentCsv,
        config: lastConfig || DEFAULT_CONFIG
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 400);
  }

  function renderers() {
    var r = {};
    if ($.pivotUtilities && $.pivotUtilities.renderers) {
      $.extend(r, $.pivotUtilities.renderers);
    }
    if ($.pivotUtilities && $.pivotUtilities.export_renderers) {
      $.extend(r, $.pivotUtilities.export_renderers);
    }
    return r;
  }

  function draw(csv, config, markSaved) {
    var out = document.getElementById('output');
    if (!out) return;
    currentCsv = csv || '';
    var parsed = Papa.parse(currentCsv, { skipEmptyLines: true });
    if (parsed.errors && parsed.errors.length && !parsed.data.length) {
      out.innerHTML = '<p class="status">Could not read that table.</p>';
      return;
    }
    var opts = $.extend({}, DEFAULT_CONFIG, config || {}, {
      renderers: renderers(),
      onRefresh: function (cfg) {
        lastConfig = slimConfig(cfg);
        persist(false);
      }
    });
    applying = true;
    try {
      $(out).pivotUI(parsed.data, opts, true);
    } catch (e) {
      out.innerHTML = '<p class="status">Could not build the grid.</p>';
    }
    applying = false;
    lastConfig = slimConfig(opts);
    var ta = document.getElementById('csv');
    if (ta && ta.value !== currentCsv) ta.value = currentCsv;
    if (markSaved) persist(true);
  }

  function fromFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      setStatus(file.name || 'Dropped file');
      draw(String(reader.result || ''), DEFAULT_CONFIG, true);
    };
    reader.readAsText(file);
  }

  function boot() {
    var sample = window.PIVOT_SAMPLE_CSV || 'a,b\n1,2\n';
    var start = function (rec) {
      ready = true;
      if (rec && rec.csv) {
        setStatus('Last table on this device');
        draw(rec.csv, rec.config || DEFAULT_CONFIG, false);
      } else {
        setStatus('Canadian MPs sample');
        draw(sample, DEFAULT_CONFIG, false);
      }
    };
    if (saveDb && saveDb.get) {
      saveDb.get('last').then(start).catch(function () { start(null); });
    } else {
      start(null);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var file = document.getElementById('file');
    var ta = document.getElementById('csv');
    var sampleBtn = document.getElementById('sample');
    var blankBtn = document.getElementById('blank');
    if (file) file.addEventListener('change', function () {
      fromFile(file.files && file.files[0]);
      file.value = '';
    });
    if (sampleBtn) sampleBtn.addEventListener('click', function () {
      setStatus('Canadian MPs sample');
      draw(window.PIVOT_SAMPLE_CSV || '', DEFAULT_CONFIG, true);
    });
    if (blankBtn) blankBtn.addEventListener('click', function () {
      setStatus('Blank — paste or drop a CSV');
      draw('item,region,qty\n', { rows: [], cols: [], aggregatorName: 'Count', rendererName: 'Table' }, true);
    });
    if (ta) {
      var t = 0;
      ta.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          setStatus('Pasted table');
          draw(ta.value, lastConfig || DEFAULT_CONFIG, true);
        }, 350);
      });
    }
    ['dragover', 'dragenter'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) fromFile(f);
    });
    boot();
  });
})();
