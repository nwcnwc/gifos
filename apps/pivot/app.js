/* Pivot: CSV in, drag-and-drop grid + tap-to-assign, last table private. */
(function (root) {
  'use strict';

  var DEFAULT_CONFIG = {
    rows: ['Province'],
    cols: ['Party'],
    vals: [],
    aggregatorName: 'Count',
    rendererName: 'Table'
  };

  function looksSpreadsheet(name) {
    return /\.(xlsx|xls|ods)$/i.test(String(name || ''));
  }

  function parseTable(csv, PapaRef) {
    var Papa = PapaRef || root.Papa;
    var raw = String(csv == null ? '' : csv);
    if (!String(raw).trim()) {
      return { empty: true, message: 'Paste a table, choose a CSV, or load the sample.' };
    }
    if (!Papa || typeof Papa.parse !== 'function') {
      return { error: true, message: 'Parser missing.' };
    }
    var parsed = Papa.parse(raw, { skipEmptyLines: 'greedy' });
    var data = (parsed.data || []).filter(function (row) {
      return row && row.some(function (c) { return String(c == null ? '' : c).trim() !== ''; });
    });
    if (!data.length) {
      return { empty: true, message: 'Paste a table, choose a CSV, or load the sample.' };
    }
    var header = data[0];
    if (!header || !header.length || header.every(function (c) { return String(c == null ? '' : c).trim() === ''; })) {
      return { error: true, message: 'The header row is empty.' };
    }
    var fields = header.map(function (c) { return String(c == null ? '' : c); });
    if (data.length === 1) {
      return { error: true, message: 'Need a header row and at least one data row.', fields: fields, data: data };
    }
    var hard = (parsed.errors || []).filter(function (e) {
      return e && (e.type === 'Quotes' || e.code === 'UndetectableDelimiter' || e.code === 'MissingQuotes');
    });
    var out = { data: data, fields: fields, rows: data.length - 1, warnings: parsed.errors || [] };
    if (hard.length && !out.rows) {
      out.error = true;
      out.message = hard[0].message || 'Could not read that table.';
    } else if (hard.length) {
      out.warning = hard[0].message;
    }
    return out;
  }

  function pivotValue(data, spec, utils) {
    utils = utils || (root.$ && root.$.pivotUtilities);
    if (!utils || !utils.PivotData || !utils.aggregators) return null;
    var name = spec.aggregatorName || 'Count';
    var aggTpl = utils.aggregators[name];
    if (!aggTpl) return null;
    var vals = spec.vals || [];
    var factory = aggTpl(vals);
    var pd = new utils.PivotData(data, {
      aggregator: factory,
      aggregatorName: name,
      rows: spec.rows || [],
      cols: spec.cols || [],
      vals: vals
    });
    return pd.getAggregator(spec.rowKey || [], spec.colKey || []).value();
  }

  function heatmapColors(values) {
    var nums = (values || []).filter(function (x) { return typeof x === 'number' && isFinite(x); });
    var min = nums.length ? Math.min.apply(null, nums) : 0;
    var max = nums.length ? Math.max.apply(null, nums) : 1;
    if (min === max) {
      return function () { return 'rgba(26,115,232,0.28)'; };
    }
    return function (x) {
      var t = (x - min) / (max - min);
      if (!isFinite(t)) t = 0;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      return 'rgba(26, 115, 232,' + (0.12 + t * 0.72) + ')';
    };
  }

  function tableToTsv(rootEl) {
    var table = rootEl && rootEl.querySelector && rootEl.querySelector('table.pvtTable');
    if (!table) return '';
    var lines = [];
    var rows = table.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('th,td');
      var cols = [];
      for (var j = 0; j < cells.length; j++) {
        cols.push(String(cells[j].textContent || '').replace(/\t/g, ' ').replace(/\n/g, ' '));
      }
      lines.push(cols.join('\t'));
    }
    return lines.join('\n');
  }

  root.PivotApp = {
    parseTable: parseTable,
    pivotValue: pivotValue,
    looksSpreadsheet: looksSpreadsheet,
    heatmapColors: heatmapColors,
    tableToTsv: tableToTsv,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };

  var doc = root.document;
  if (!doc || !doc.getElementById || !doc.getElementById('output')) return;

  var saveDb = null;
  var saveTimer = 0;
  var applying = false;
  var ready = false;
  var currentCsv = '';
  var lastConfig = null;
  var lastFields = [];
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function $(id) { return doc.getElementById(id); }

  function setStatus(msg) {
    var el = $('status');
    if (el) el.textContent = msg || '';
  }

  function setError(msg) {
    var el = $('error');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
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
    if (root.$ && root.$.pivotUtilities && root.$.pivotUtilities.renderers) {
      root.$.extend(r, root.$.pivotUtilities.renderers);
    }
    if (root.$ && root.$.pivotUtilities && root.$.pivotUtilities.export_renderers) {
      root.$.extend(r, root.$.pivotUtilities.export_renderers);
    }
    return r;
  }

  function aggregatorNames() {
    var a = root.$ && root.$.pivotUtilities && root.$.pivotUtilities.aggregators;
    return a ? Object.keys(a) : ['Count', 'Sum', 'Average'];
  }

  function fillSelect(sel, names, current) {
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '';
    names.forEach(function (n) {
      var o = doc.createElement('option');
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    var want = current || keep;
    if (want && names.indexOf(want) >= 0) sel.value = want;
  }

  function renderAssign(fields, config) {
    var host = $('assignFields');
    var box = $('assign');
    if (!host || !box) return;
    lastFields = fields || [];
    box.classList.toggle('has-fields', lastFields.length > 0);
    host.innerHTML = '';
    var rows = (config && config.rows) || [];
    var cols = (config && config.cols) || [];
    var vals = (config && config.vals) || [];
    lastFields.forEach(function (name) {
      var row = doc.createElement('div');
      row.className = 'assign-row';
      var lab = doc.createElement('span');
      lab.textContent = name;
      var sel = doc.createElement('select');
      sel.setAttribute('aria-label', name + ' role');
      [['unused', 'Unused'], ['rows', 'Rows'], ['cols', 'Columns'], ['vals', 'Values']].forEach(function (opt) {
        var o = doc.createElement('option');
        o.value = opt[0];
        o.textContent = opt[1];
        sel.appendChild(o);
      });
      if (rows.indexOf(name) >= 0) sel.value = 'rows';
      else if (cols.indexOf(name) >= 0) sel.value = 'cols';
      else if (vals.indexOf(name) >= 0) sel.value = 'vals';
      else sel.value = 'unused';
      sel.addEventListener('change', function () { applyAssign(name, sel.value); });
      row.appendChild(lab);
      row.appendChild(sel);
      host.appendChild(row);
    });
    fillSelect($('aggSel'), aggregatorNames(), config && config.aggregatorName);
    fillSelect($('renSel'), Object.keys(renderers()), config && config.rendererName);
  }

  function applyAssign(name, role) {
    var cfg = lastConfig || DEFAULT_CONFIG;
    var next = {
      rows: (cfg.rows || []).filter(function (x) { return x !== name; }),
      cols: (cfg.cols || []).filter(function (x) { return x !== name; }),
      vals: (cfg.vals || []).filter(function (x) { return x !== name; }),
      aggregatorName: cfg.aggregatorName || 'Count',
      rendererName: cfg.rendererName || 'Table'
    };
    if (role === 'rows') next.rows.push(name);
    if (role === 'cols') next.cols.push(name);
    if (role === 'vals') next.vals.push(name);
    draw(currentCsv, next, true);
  }

  function draw(csv, config, markSaved) {
    var out = $('output');
    if (!out) return;
    currentCsv = csv || '';
    var parsed = parseTable(currentCsv);
    var ta = $('csv');
    if (ta && ta.value !== currentCsv) ta.value = currentCsv;

    if (parsed.empty || parsed.error) {
      out.innerHTML = '';
      setError(parsed.message || 'Could not read that table.');
      renderAssign(parsed.fields || [], config || DEFAULT_CONFIG);
      lastConfig = config || DEFAULT_CONFIG;
      if (markSaved) persist(true);
      return;
    }
    setError(parsed.warning || '');
    var opts = root.$.extend({}, DEFAULT_CONFIG, config || {}, {
      renderers: renderers(),
      rendererOptions: { heatmap: { colorScaleGenerator: heatmapColors } },
      onRefresh: function (cfg) {
        lastConfig = slimConfig(cfg);
        persist(false);
        if (!applying) renderAssign(lastFields, lastConfig);
      }
    });
    applying = true;
    try {
      root.$(out).pivotUI(parsed.data, opts, true);
    } catch (e) {
      out.innerHTML = '';
      setError('Could not build the grid.');
      applying = false;
      return;
    }
    applying = false;
    lastConfig = slimConfig(opts);
    renderAssign(parsed.fields, lastConfig);
    var bits = [parsed.rows + (parsed.rows === 1 ? ' row' : ' rows'), parsed.fields.length + (parsed.fields.length === 1 ? ' field' : ' fields')];
    var st = $('status');
    if (st && st.textContent) {
      /* keep the source label; append counts if not already */
      if (!/\d+ rows?/.test(st.textContent)) {
        setStatus(st.textContent + ' · ' + bits.join(' · '));
      }
    } else {
      setStatus(bits.join(' · '));
    }
    if (markSaved) persist(true);
  }

  function fromFile(file) {
    if (!file) return;
    if (looksSpreadsheet(file.name)) {
      setError('This is an Excel workbook. Save it as CSV first, then choose that file.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      setError('');
      setStatus(file.name || 'Chosen file');
      draw(String(reader.result || ''), DEFAULT_CONFIG, true);
    };
    reader.readAsText(file);
  }

  function isPhone() {
    return !!(root.matchMedia && (root.matchMedia('(max-width: 700px)').matches || root.matchMedia('(pointer: coarse)').matches));
  }

  function closeFilterBox() {
    var boxes = doc.querySelectorAll('.pvtFilterBox');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.offsetParent || (box.style && box.style.display && box.style.display !== 'none')) {
        var cancel = box.querySelector('button');
        var buttons = box.querySelectorAll('button');
        for (var j = 0; j < buttons.length; j++) {
          if (/cancel/i.test(buttons[j].textContent || '')) { buttons[j].click(); return true; }
        }
        if (cancel) { cancel.click(); return true; }
      }
    }
    return false;
  }

  function copyTable() {
    var text = tableToTsv($('output'));
    var msg = $('copyMsg');
    function say(t) {
      if (!msg) return;
      msg.hidden = false;
      msg.textContent = t;
    }
    if (!text) { say('Nothing to copy yet.'); return; }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(function () { say('Copied the table as TSV.'); }).catch(function () { say('Select the grid and copy it.'); });
    } else {
      say('Select the grid and copy it.');
    }
  }

  function bootSaved(rec) {
    ready = true;
    if (rec && rec.csv) {
      setStatus('Last table on this device');
      draw(rec.csv, rec.config || DEFAULT_CONFIG, false);
    } else {
      setStatus('Canadian MPs sample');
      draw(root.PIVOT_SAMPLE_CSV || 'a,b\n1,2\n', DEFAULT_CONFIG, false);
    }
  }

  function boot() {
    var wrap = $('pasteWrap');
    if (wrap && root.matchMedia && root.matchMedia('(min-width: 701px)').matches) wrap.open = true;

    var file = $('file');
    var ta = $('csv');
    var sampleBtn = $('sample');
    var blankBtn = $('blank');
    if (file) file.addEventListener('change', function () {
      fromFile(file.files && file.files[0]);
      file.value = '';
    });
    if (sampleBtn) sampleBtn.addEventListener('click', function () {
      setError('');
      setStatus('Canadian MPs sample');
      draw(root.PIVOT_SAMPLE_CSV || '', DEFAULT_CONFIG, true);
    });
    if (blankBtn) blankBtn.addEventListener('click', function () {
      setStatus('Blank — paste or choose a CSV');
      draw('item,region,qty\n', { rows: [], cols: [], vals: [], aggregatorName: 'Count', rendererName: 'Table' }, true);
    });
    if ($('copyTable')) $('copyTable').addEventListener('click', copyTable);
    if ($('aggSel')) $('aggSel').addEventListener('change', function () {
      var cfg = lastConfig || DEFAULT_CONFIG;
      draw(currentCsv, root.$.extend({}, cfg, { aggregatorName: $('aggSel').value }), true);
    });
    if ($('renSel')) $('renSel').addEventListener('change', function () {
      var cfg = lastConfig || DEFAULT_CONFIG;
      draw(currentCsv, root.$.extend({}, cfg, { rendererName: $('renSel').value }), true);
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
      doc.addEventListener(ev, function (e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });
    });
    doc.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) fromFile(f);
    });
    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (closeFilterBox()) return true;
        var w = $('pasteWrap');
        if (w && w.open && isPhone()) { w.open = false; return true; }
        return false;
      });
    }
    if (saveDb && saveDb.get) {
      saveDb.get('last').then(bootSaved).catch(function () { bootSaved(null); });
    } else {
      bootSaved(null);
    }
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
