/* Editor, params, last script in a private collection. Invite is OS chrome. */
(function (root) {
  'use strict';

  var MAX_SCRIPT = 180 * 1024;
  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  var view = null;
  var lastMesh = null;
  var params = {};
  var defs = [];
  var sample = 'gear';
  var applying = false;
  var saveTimer = 0;
  var runTimer = 0;
  var lastRemoteAt = 0;
  var tab = 'model';

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function showErr(msg) {
    var el = $('err');
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = String(msg);
  }

  function setStatus(msg) {
    $('status').textContent = msg || '';
  }

  function setMeet(msg, live) {
    var el = $('meet');
    el.textContent = msg;
    el.classList.toggle('live', !!live);
  }

  function scriptText() { return $('script').value; }
  function setScript(t) { $('script').value = t; }

  function persist() {
    if (applying || !saveDb) return;
    var rec = {
      id: 'last',
      script: scriptText(),
      params: params,
      sample: sample,
      wireframe: $('wireframe').checked,
      grid: $('grid').checked,
      autoRotate: $('autoRotate').checked
    };
    saveDb.put(rec).catch(function () {});
  }
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function publishSoon() {
    var Mp = root.JscadMp;
    if (!Mp) return;
    clearTimeout(Mp._t);
    Mp._t = setTimeout(function () { Mp.publish(); }, 350);
  }

  function paintParams() {
    var box = $('params');
    box.innerHTML = '';
    if (!defs.length) { box.hidden = true; return; }
    box.hidden = false;
    defs.forEach(function (d) {
      if (!d || !d.name || d.type === 'group') return;
      var lab = document.createElement('label');
      lab.className = 'param';
      var cap = document.createElement('span');
      cap.textContent = d.caption || d.name;
      lab.appendChild(cap);
      var type = d.type || 'number';
      var val = params[d.name];
      if (val === undefined) val = d.initial;
      var inp;
      if (type === 'checkbox' || type === 'boolean') {
        inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!val;
        inp.onchange = function () { params[d.name] = inp.checked; persistSoon(); runNow(true); };
      } else if (type === 'choice') {
        inp = document.createElement('select');
        var values = d.values || [];
        var captions = d.captions || values;
        values.forEach(function (v, i) {
          var o = document.createElement('option');
          o.value = String(v);
          o.textContent = String(captions[i] != null ? captions[i] : v);
          if (String(v) === String(val)) o.selected = true;
          inp.appendChild(o);
        });
        inp.onchange = function () {
          var raw = inp.value;
          var found = values.filter(function (v) { return String(v) === raw; })[0];
          params[d.name] = found !== undefined ? found : raw;
          persistSoon();
          runNow(true);
        };
      } else {
        inp = document.createElement('input');
        inp.type = 'range';
        var isInt = type === 'int';
        inp.min = d.min != null ? d.min : (isInt ? 0 : 0);
        inp.max = d.max != null ? d.max : (isInt ? 100 : 100);
        inp.step = d.step != null ? d.step : (isInt ? 1 : 0.5);
        inp.value = val != null ? val : (d.initial != null ? d.initial : 0);
        var num = document.createElement('em');
        num.textContent = String(inp.value);
        inp.oninput = function () {
          params[d.name] = isInt ? parseInt(inp.value, 10) : parseFloat(inp.value);
          num.textContent = String(inp.value);
        };
        inp.onchange = function () {
          params[d.name] = isInt ? parseInt(inp.value, 10) : parseFloat(inp.value);
          num.textContent = String(inp.value);
          persistSoon();
          runNow(true);
        };
        lab.appendChild(inp);
        lab.appendChild(num);
        box.appendChild(lab);
        return;
      }
      lab.appendChild(inp);
      box.appendChild(lab);
    });
  }

  function ensureView() {
    if (view) return view;
    view = new root.JscadView($('view'));
    view.wireframe = $('wireframe').checked;
    view.grid = $('grid').checked;
    view.autoRotate = $('autoRotate').checked;
    return view;
  }

  function runNow(keepCamera) {
    showErr('');
    var src = scriptText();
    if (src.length > MAX_SCRIPT) {
      showErr('The script is too long to keep in this file (about 180 KB). Shorten it.');
      return;
    }
    var t0 = (root.performance && performance.now) ? performance.now() : Date.now();
    try {
      var out = root.JscadEngine.run(src, params);
      defs = out.defs || [];
      params = Object.assign(root.JscadEngine.defaultParams(defs), params, out.params || {});
      lastMesh = out.mesh;
      ensureView().setMesh(out.mesh, { keepCamera: !!keepCamera && view && view.count });
      var t1 = (root.performance && performance.now) ? performance.now() : Date.now();
      setStatus(out.mesh.count.toLocaleString() + ' triangles · ' + Math.max(1, Math.round(t1 - t0)) + ' ms');
      paintParams();
      persistSoon();
      publishSoon();
    } catch (e) {
      showErr((e && e.message) || String(e));
      setStatus('Did not run.');
    }
  }

  function runSoon() {
    clearTimeout(runTimer);
    runTimer = setTimeout(function () { runNow(true); }, 550);
  }

  function loadSample(name, keepParams) {
    var samples = root.JscadSamples;
    var src = samples[name];
    if (!src) return;
    sample = name;
    setScript(src);
    if (!keepParams) params = {};
    document.querySelectorAll('[data-sample]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-sample') === name);
    });
    runNow(false);
  }

  function setTab(name) {
    tab = name === 'script' ? 'script' : 'model';
    document.body.classList.toggle('tab-script', tab === 'script');
    document.body.classList.toggle('tab-model', tab === 'model');
    $('tabModel').classList.toggle('on', tab === 'model');
    $('tabScript').classList.toggle('on', tab === 'script');
    $('tabModel').setAttribute('aria-selected', tab === 'model' ? 'true' : 'false');
    $('tabScript').setAttribute('aria-selected', tab === 'script' ? 'true' : 'false');
    if (tab === 'model' && view) setTimeout(function () { view.resize(); view._dirty = true; }, 40);
  }

  function downloadStl() {
    if (!lastMesh || !lastMesh.count) {
      showErr('Run the script first — there is no mesh to export.');
      return;
    }
    try {
      var buf = root.JscadEngine.meshToStl(lastMesh);
      var blob = new Blob([buf], { type: 'application/sla' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (sample || 'model') + '.stl';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1500);
    } catch (e) {
      showErr((e && e.message) || String(e));
    }
  }

  function applyRemote(row) {
    if (!row || applying) return;
    if (row.at && row.at === lastRemoteAt) return;
    lastRemoteAt = row.at || 0;
    applying = true;
    try {
      if (typeof row.script === 'string') setScript(row.script);
      if (row.params && typeof row.params === 'object') params = row.params;
      if (row.sample) {
        sample = row.sample;
        document.querySelectorAll('[data-sample]').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-sample') === sample);
        });
      }
      runNow(true);
    } finally {
      applying = false;
    }
  }

  function bootUi() {
    $('runBtn').onclick = function () { runNow(true); };
    $('stlBtn').onclick = downloadStl;
    $('resetView').onclick = function () { if (view) view.reset(); };
    document.querySelectorAll('[data-sample]').forEach(function (b) {
      b.onclick = function () { loadSample(b.getAttribute('data-sample'), false); };
    });
    $('wireframe').onchange = function () {
      if (view) { view.wireframe = this.checked; view._dirty = true; }
      persistSoon();
    };
    $('grid').onchange = function () {
      if (view) { view.grid = this.checked; view._dirty = true; }
      persistSoon();
    };
    $('autoRotate').onchange = function () {
      if (view) view.autoRotate = this.checked;
      persistSoon();
    };
    $('script').addEventListener('input', function () {
      sample = '';
      document.querySelectorAll('[data-sample]').forEach(function (b) { b.classList.remove('on'); });
      persistSoon();
      if (!root.JscadMp || !root.JscadMp.guest) runSoon();
    });
    $('tabModel').onclick = function () { setTab('model'); };
    $('tabScript').onclick = function () { setTab('script'); };
    root.addEventListener('resize', function () { if (view) view.resize(); });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (tab === 'script') { setTab('model'); return true; }
        return false;
      });
    }
  }

  function restore(rec) {
    if (rec && typeof rec.script === 'string' && rec.script.trim()) {
      setScript(rec.script);
      params = rec.params && typeof rec.params === 'object' ? rec.params : {};
      sample = rec.sample || '';
      if (rec.wireframe) $('wireframe').checked = true;
      if (rec.grid === false) $('grid').checked = false;
      if (rec.autoRotate) $('autoRotate').checked = true;
      document.querySelectorAll('[data-sample]').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-sample') === sample);
      });
      runNow(false);
      return;
    }
    loadSample('gear', false);
  }

  function start() {
    bootUi();
    setTab('model');
    var Mp = root.JscadMp;
    if (Mp) {
      Mp.getState = function () {
        return { script: scriptText(), params: params, sample: sample };
      };
      Mp.onRemote = function (row) {
        $('script').readOnly = true;
        applyRemote(row);
      };
      Mp.onHost = function () { $('script').readOnly = false; };
      Mp.onStatus = setMeet;
    }
    var ready = Promise.resolve(null);
    if (saveDb && saveDb.get) ready = saveDb.get('last').catch(function () { return null; });
    ready.then(function (rec) {
      restore(rec);
      if (Mp) Mp.watch();
    }).catch(function () {
      restore(null);
      if (Mp) Mp.watch();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : this);
