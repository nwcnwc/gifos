/*
 * DigitalJS — GifOS shell.
 * Vendored simulator, sample netlists, gifos.db save, invite shares the bench.
 */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var circuit = null;
  var paper = null;
  var iopanel = null;
  var sampleId = 'counter';
  var lastJson = null;
  var wantRunning = false;
  var INTERVAL = 10;

  function setErr(msg) {
    var el = $('err');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function setStatus(text) {
    var el = $('status');
    if (el) el.textContent = text;
  }

  function paintTransport() {
    var run = !!(circuit && circuit.running);
    $('btn-play').hidden = run;
    $('btn-pause').hidden = !run;
    setStatus(run ? 'Running' : 'Stopped');
  }

  function shutdown() {
    if (iopanel && iopanel.shutdown) {
      try { iopanel.shutdown(); } catch (e) {}
    }
    iopanel = null;
    if (circuit) {
      try { circuit.shutdown(); } catch (e) {}
    }
    circuit = null;
    paper = null;
    $('paper').innerHTML = '';
    $('iopanel').innerHTML = '';
  }

  function captureIo() {
    var out = {}, cells, i, c, sig;
    if (!circuit || !circuit.getInputCells) return out;
    cells = circuit.getInputCells();
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (!c || !c.isInput) continue;
      sig = c.get('outputSignals') && c.get('outputSignals').out;
      if (sig && typeof sig.toBin === 'function') out[c.id] = sig.toBin();
    }
    return out;
  }

  function applyIo(io) {
    var id, sig;
    if (!io || !circuit || !root.Vector3vl) return;
    for (id in io) {
      if (!Object.prototype.hasOwnProperty.call(io, id)) continue;
      try {
        var bits = String(io[id]);
        sig = root.Vector3vl.fromBin(bits, bits.length);
        circuit.setInput(id, sig);
      } catch (e) {}
    }
  }

  function currentJson() {
    if (circuit && circuit.toJSON) {
      try { return circuit.toJSON(true); } catch (e) {}
    }
    return lastJson;
  }

  function lib() {
    var d = root.digitaljs;
    if (d && d.Circuit) return d;
    if (d && d.default && d.default.Circuit) return d.default;
    return d;
  }

  function loadCircuit(json, id, io, running) {
    var djs = lib();
    if (!djs || !djs.Circuit) {
      setErr('Simulator failed to load.');
      return false;
    }
    if (!json || !json.devices) {
      setErr('That is not a DigitalJS circuit.');
      return false;
    }
    shutdown();
    sampleId = id || sampleId;
    lastJson = json;
    try {
      circuit = new djs.Circuit(JSON.parse(JSON.stringify(json)), { layoutEngine: 'dagre' });
    } catch (e) {
      setErr(e && e.message ? e.message : 'Could not build that circuit.');
      return false;
    }
    circuit.interval = INTERVAL;
    paper = circuit.displayOn(root.$('#paper'));
    if (paper && paper.fixed) paper.fixed(true);
    if (paper && paper.once) {
      paper.once('render:done', function () {
        if (root.DjsTouch) root.DjsTouch.fit();
      });
    }
    if (djs.IOPanelView) {
      iopanel = new djs.IOPanelView({ model: circuit, el: root.$('#iopanel') });
    }
    circuit.on('changeRunning', paintTransport);
    circuit.on('userChange', function () {
      if (root.DjsNet) root.DjsNet.noteChange();
    });
    circuit.on('new:paper', function () {});
    applyIo(io);
    wantRunning = !!running;
    if (wantRunning) circuit.start();
    else circuit.stop();
    paintTransport();
    setErr('');
    setTimeout(function () {
      if (root.DjsTouch) root.DjsTouch.fit();
    }, 240);
    var sel = $('sample');
    if (sel && sel.value !== sampleId) {
      var opt = sel.querySelector('option[value="' + sampleId + '"]');
      if (opt) sel.value = sampleId;
    }
    return true;
  }

  function loadSample(id, fromUser) {
    var item = root.DjsCircuits.byId(id);
    if (!loadCircuit(item.json, item.id, null, false)) return;
    if (fromUser && root.DjsNet) root.DjsNet.noteCircuit();
    else if (root.DjsNet) root.DjsNet.persistPrivate();
  }

  function play() {
    if (!circuit) return;
    circuit.start();
    wantRunning = true;
    paintTransport();
    if (root.DjsNet) root.DjsNet.noteChange();
  }
  function pause() {
    if (!circuit) return;
    circuit.stop();
    wantRunning = false;
    paintTransport();
    if (root.DjsNet) root.DjsNet.noteChange();
  }
  function step() {
    if (!circuit) return;
    if (circuit.running) circuit.stop();
    wantRunning = false;
    if (circuit.updateGatesNext) circuit.updateGatesNext();
    else if (circuit.updateGates) circuit.updateGates();
    paintTransport();
    if (root.DjsNet) root.DjsNet.noteChange();
  }

  function openJson() {
    $('json-src').value = JSON.stringify(currentJson() || {}, null, 2);
    $('json-sheet').hidden = false;
  }
  function closeJson() { $('json-sheet').hidden = true; }
  function applyJson() {
    var text = $('json-src').value, json;
    try { json = JSON.parse(text); }
    catch (e) { setErr('JSON is not valid yet.'); return; }
    if (!loadCircuit(json, 'custom', null, false)) return;
    closeJson();
    if (root.DjsNet) root.DjsNet.noteCircuit();
  }
  function dumpJson() {
    var text = JSON.stringify(currentJson() || {}, null, 2);
    $('json-src').value = text;
    if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
    }
  }

  function fillSamples() {
    var sel = $('sample'), i, it, o;
    var cat = root.DjsCircuits.catalog;
    sel.innerHTML = '';
    for (i = 0; i < cat.length; i++) {
      it = cat[i];
      o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.name;
      sel.appendChild(o);
    }
  }

  root.DjsApp = {
    currentJson: currentJson,
    currentIo: captureIo,
    currentSample: function () { return sampleId; },
    isRunning: function () { return !!(circuit && circuit.running); },
    loadFromNet: function (ad) {
      var same = lastJson && JSON.stringify(ad.json) === JSON.stringify(lastJson);
      if (!same) loadCircuit(ad.json, ad.sample || sampleId, ad.io, ad.running);
      else {
        applyIo(ad.io);
        if (ad.running && circuit && !circuit.running) circuit.start();
        if (!ad.running && circuit && circuit.running) circuit.stop();
        paintTransport();
      }
    }
  };

  function wireUi() {
    fillSamples();
    $('btn-play').addEventListener('click', play);
    $('btn-pause').addEventListener('click', pause);
    $('btn-step').addEventListener('click', step);
    $('sample').addEventListener('change', function () {
      loadSample($('sample').value, true);
    });
    $('btn-json').addEventListener('click', openJson);
    $('json-close').addEventListener('click', closeJson);
    $('json-apply').addEventListener('click', applyJson);
    $('json-dump').addEventListener('click', dumpJson);
    $('zoom-in').addEventListener('click', function () { root.DjsTouch.zoomIn(); });
    $('zoom-out').addEventListener('click', function () { root.DjsTouch.zoomOut(); });
    $('zoom-fit').addEventListener('click', function () { root.DjsTouch.fit(); });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (!$('json-sheet').hidden) { closeJson(); return true; }
        if (root.$ && root.$('.ui-dialog:visible').length) {
          root.$('.ui-dialog-content:visible').dialog('close');
          return true;
        }
        return false;
      });
    }
    window.addEventListener('resize', function () {
      if (root.DjsTouch) root.DjsTouch.fit();
    });
  }

  function bootSaved(row) {
    var json = row && row.json;
    var id = (row && row.sample) || 'counter';
    if (json && json.devices) loadCircuit(json, id, row.io, false);
    else loadSample(id, false);
  }

  function boot() {
    if (!lib() || !lib().Circuit || !root.$) {
      setErr('Simulator failed to load.');
      return;
    }
    root.DjsTouch.init();
    wireUi();
    var netP = root.DjsNet ? root.DjsNet.init() : Promise.resolve(null);
    var launchP = (root.gifos && root.gifos.launch)
      ? root.gifos.launch().catch(function () { return null; })
      : Promise.resolve(null);
    Promise.all([netP, launchP]).then(function (pair) {
      var row = pair[0], go = pair[1];
      if (go && go.circuit) {
        loadSample(String(go.circuit), false);
        return;
      }
      bootSaved(row);
      if (location.hash === '#play') play();
    }).catch(function () {
      loadSample('counter', false);
      if (location.hash === '#play') play();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);
