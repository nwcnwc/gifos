/* RAWGraphs: paste a table, map columns, draw. Last dataset is the save. */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var applying = false;
  var currentCsv = '';
  var currentName = '';
  var rows = [];
  var fields = [];
  var types = {};
  var chartId = 'alluvial';
  var mapping = {};
  var tab = 'chart';
  var lastSvg = '';

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

  function persist() {
    if (!saveDb || applying) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        csv: currentCsv,
        name: currentName,
        chartId: chartId,
        mapping: mapping
      }).catch(function () {});
    }, 280);
  }

  function snapshot() {
    return { csv: currentCsv, name: currentName, chartId: chartId, mapping: mapping };
  }

  function fieldsMatchSample() {
    return fields.indexOf('studio') >= 0 && fields.indexOf('genre') >= 0 && fields.indexOf('box') >= 0;
  }

  function chooseMapping(id) {
    var chart = root.RawCharts.chartById(id);
    if (!chart) return {};
    if (fieldsMatchSample()) {
      var sm = root.RawCharts.sampleMapping(id);
      if (sm) return root.RawCharts.normalizeMapping(chart, sm);
    }
    return root.RawCharts.autoMap(chart, fields, types);
  }

  function renderGallery() {
    var box = $('gallery');
    if (!box) return;
    var html = '';
    root.RawCharts.CHARTS.forEach(function (c) {
      html += '<button type="button" class="card' + (c.id === chartId ? ' on' : '') + '" data-chart="' + c.id + '">' +
        '<span class="cname">' + c.name + '</span><span class="ccat">' + c.cat + '</span></button>';
    });
    box.innerHTML = html;
  }

  function fieldOptions(selected, extraBlank) {
    var html = extraBlank ? '<option value="">—</option>' : '';
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var t = types[f] === 'number' ? ' · #' : '';
      html += '<option value="' + esc(f) + '"' + (f === selected ? ' selected' : '') + '>' + esc(f) + t + '</option>';
    }
    return html;
  }

  function renderMapping() {
    var box = $('mapping');
    var chart = root.RawCharts.chartById(chartId);
    if (!box || !chart) return;
    if (!fields.length) {
      box.innerHTML = '<p class="hint">Load a table first.</p>';
      return;
    }
    var html = '<p class="map-lead">' + chart.blurb + ' Point a column at each visual variable.</p>';
    chart.dims.forEach(function (d) {
      html += '<div class="dim" data-dim="' + d.id + '">';
      html += '<label>' + d.label + (d.required ? ' *' : '') + '</label>';
      if (d.multiple) {
        var arr = mapping[d.id] || [];
        var n = Math.max(arr.length, d.min || 1);
        for (var i = 0; i < n; i++) {
          html += '<select class="dim-sel" data-idx="' + i + '">' + fieldOptions(arr[i] || '', true) + '</select>';
        }
        html += '<button type="button" class="add-dim" data-dim="' + d.id + '">Add</button>';
      } else {
        html += '<select class="dim-sel">' + fieldOptions(mapping[d.id] || '', !d.required) + '</select>';
      }
      html += '</div>';
    });
    box.innerHTML = html;
  }

  function readMappingFromDom() {
    var chart = root.RawCharts.chartById(chartId);
    if (!chart) return;
    var box = $('mapping');
    if (!box) return;
    var next = {};
    chart.dims.forEach(function (d) {
      var dim = box.querySelector('.dim[data-dim="' + d.id + '"]');
      if (!dim) return;
      var sels = dim.querySelectorAll('select.dim-sel');
      if (d.multiple) {
        var arr = [];
        for (var i = 0; i < sels.length; i++) if (sels[i].value) arr.push(sels[i].value);
        next[d.id] = arr;
      } else {
        next[d.id] = sels[0] ? sels[0].value : '';
      }
    });
    mapping = next;
  }

  function renderPreview() {
    var box = $('preview');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<p class="empty">No rows yet.</p>';
      return;
    }
    var cols = fields.slice(0, 7);
    var n = Math.min(rows.length, 6);
    var html = '<table><thead><tr>';
    cols.forEach(function (f) { html += '<th>' + esc(f) + '</th>'; });
    html += '</tr></thead><tbody>';
    for (var i = 0; i < n; i++) {
      html += '<tr>';
      cols.forEach(function (f) { html += '<td>' + esc(rows[i][f]) + '</td>'; });
      html += '</tr>';
    }
    html += '</tbody></table>';
    if (rows.length > n) html += '<p class="hint">' + rows.length + ' rows · first ' + n + ' shown</p>';
    box.innerHTML = html;
  }

  function draw() {
    var view = $('view');
    if (!view) return;
    if (!rows.length) {
      lastSvg = '';
      view.innerHTML = '<p class="empty">Paste a table, choose a CSV, or load the sample. Then pick a chart and map columns onto it.</p>';
      return;
    }
    var out = root.RawCharts.drawChart(chartId, rows, mapping, { w: 960, h: 540, labels: true });
    if (!out.ok) {
      setError(out.message);
      if (!lastSvg) view.innerHTML = '<p class="empty">' + out.message + '</p>';
      return;
    }
    setError('');
    lastSvg = out.svg;
    view.innerHTML = out.svg;
  }

  function applyTable(csv, name, keepMap) {
    var parsed = root.RawCsv.parseCsv(csv);
    if (parsed.empty || parsed.error) {
      rows = []; fields = []; types = {};
      currentCsv = csv || '';
      currentName = name || '';
      setError(parsed.message || '');
      setStatus(parsed.message || '');
      renderPreview();
      renderMapping();
      draw();
      persist();
      if (root.RawMp && root.RawMp.onChange) root.RawMp.onChange(snapshot());
      return;
    }
    setError('');
    currentCsv = csv;
    currentName = name || currentName || 'table';
    rows = parsed.data;
    fields = parsed.fields;
    types = root.RawCsv.inferTypes(rows, fields);
    if (!keepMap) mapping = chooseMapping(chartId);
    else {
      var chart = root.RawCharts.chartById(chartId);
      mapping = root.RawCharts.normalizeMapping(chart, mapping);
    }
    setStatus(rows.length + ' rows · ' + fields.length + ' columns' + (currentName ? ' · ' + currentName : ''));
    renderPreview();
    renderGallery();
    renderMapping();
    draw();
    persist();
    if (root.RawMp && root.RawMp.onChange) root.RawMp.onChange(snapshot());
  }

  function setChart(id, keepMap) {
    if (!root.RawCharts.chartById(id)) return;
    chartId = id;
    if (!keepMap) mapping = chooseMapping(id);
    renderGallery();
    renderMapping();
    draw();
    persist();
    if (root.RawMp && root.RawMp.onChange) root.RawMp.onChange(snapshot());
  }

  function loadSample() {
    var csv = root.RAW_SAMPLE_CSV || '';
    applying = true;
    $('csv').value = csv;
    applying = false;
    applyTable(csv, 'prize films sample', false);
  }

  function setTab(next) {
    tab = next;
    document.body.classList.remove('tab-data', 'tab-type', 'tab-map', 'tab-chart');
    document.body.classList.add('tab-' + next);
    ['tabData', 'tabType', 'tabMap', 'tabChart'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var on = (id === 'tabData' && next === 'data') || (id === 'tabType' && next === 'type') ||
        (id === 'tabMap' && next === 'map') || (id === 'tabChart' && next === 'chart');
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function copySvg() {
    var msg = $('copyMsg');
    function say(t) {
      if (!msg) return;
      msg.hidden = false;
      msg.textContent = t;
      setTimeout(function () { msg.hidden = true; }, 1600);
    }
    if (!lastSvg) { say('Nothing to copy yet.'); return; }
    var clip = navigator.clipboard;
    if (clip && clip.writeText) {
      clip.writeText(lastSvg).then(function () { say('SVG copied.'); }).catch(function () { say('Could not copy.'); });
    } else say('Could not copy.');
  }

  function onFile(file) {
    if (!file) return;
    if (root.RawCsv.looksSpreadsheet(file.name)) {
      setError('An Excel workbook will not read. Save it as CSV first.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      $('csv').value = text;
      applyTable(text, file.name, false);
    };
    reader.onerror = function () { setError('Could not read that file.'); };
    reader.readAsText(file);
  }

  function restore(rec) {
    if (!rec || !rec.csv) return false;
    applying = true;
    chartId = rec.chartId || 'alluvial';
    mapping = rec.mapping || {};
    $('csv').value = rec.csv;
    applying = false;
    applyTable(rec.csv, rec.name || '', true);
    return true;
  }

  function bind() {
    renderGallery();
    $('gallery').addEventListener('click', function (e) {
      var b = e.target.closest('[data-chart]');
      if (b) setChart(b.getAttribute('data-chart'), false);
    });
    $('mapping').addEventListener('change', function (e) {
      if (e.target && e.target.matches('select.dim-sel')) {
        readMappingFromDom();
        draw();
        persist();
        if (root.RawMp && root.RawMp.onChange) root.RawMp.onChange(snapshot());
      }
    });
    $('mapping').addEventListener('click', function (e) {
      var add = e.target.closest('.add-dim');
      if (!add) return;
      var dim = add.getAttribute('data-dim');
      if (!Array.isArray(mapping[dim])) mapping[dim] = mapping[dim] ? [mapping[dim]] : [];
      mapping[dim].push('');
      renderMapping();
    });
    $('sample').addEventListener('click', loadSample);
    $('copyBtn').addEventListener('click', copySvg);
    $('file').addEventListener('change', function () {
      var f = $('file').files && $('file').files[0];
      onFile(f);
      $('file').value = '';
    });
    var pasteTimer = 0;
    $('csv').addEventListener('input', function () {
      if (applying) return;
      if (pasteTimer) clearTimeout(pasteTimer);
      pasteTimer = setTimeout(function () {
        applyTable($('csv').value, 'pasted table', false);
      }, 280);
    });
    $('tabData').addEventListener('click', function () { setTab('data'); });
    $('tabType').addEventListener('click', function () { setTab('type'); });
    $('tabMap').addEventListener('click', function () { setTab('map'); });
    $('tabChart').addEventListener('click', function () { setTab('chart'); });
    $('shareBtn').addEventListener('click', function () {
      if (root.RawMp && root.RawMp.enter) root.RawMp.enter();
    });
    if (api && api.onBack) {
      api.onBack(function () {
        var wrap = $('pasteWrap');
        if (wrap && wrap.open) { wrap.open = false; return true; }
        if (tab === 'chart') { setTab('map'); return true; }
        if (tab === 'map') { setTab('type'); return true; }
        if (tab === 'type') { setTab('data'); return true; }
        return false;
      });
    }
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onFile(f);
    });
  }

  root.RawApp = {
    snapshot: snapshot,
    restore: restore,
    applyRemote: function (snap) {
      if (!snap) return;
      applying = true;
      chartId = snap.chartId || chartId;
      mapping = snap.mapping || mapping;
      if (snap.csv != null) $('csv').value = snap.csv;
      applying = false;
      applyTable(snap.csv || currentCsv, snap.name || currentName, true);
    }
  };

  function boot() {
    bind();
    setTab('chart');
    try { if (api && api.db) saveDb = api.db('save'); } catch (e) {}
    function ready(rec) {
      if (rec && rec.csv) restore(rec);
      else loadSample();
    }
    if (saveDb && saveDb.get) {
      saveDb.get('last').then(ready).catch(function () { loadSample(); });
    } else loadSample();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}(typeof window !== 'undefined' ? window : globalThis));
