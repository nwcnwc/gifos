/*
 * TexGen editor around mrdoob's TG API (fill-port, no Function constructor).
 * Last stack is private. Classic IIFE.
 */
(function (root) {
  'use strict';

  var OPS = [
    { id: 'add', label: '+' },
    { id: 'set', label: '=' },
    { id: 'sub', label: '-' },
    { id: 'mul', label: '*' },
    { id: 'div', label: '/' },
    { id: 'and', label: '&' },
    { id: 'xor', label: '^' },
    { id: 'min', label: 'min' },
    { id: 'max', label: 'max' }
  ];

  var PARAMS = {
    SinX: { frequency: 0.05, offset: 0 },
    SinY: { frequency: 0.05, offset: 0 },
    Noise: { seed: 1 },
    FractalNoise: { seed: 1, baseFrequency: 0.03125, amplitude: 0.4, persistence: 0.72, octaves: 4, step: 4 },
    CheckerBoard: { size: [32, 32], offset: [0, 0], rowShift: 0 },
    Rect: { position: [32, 32], size: [64, 64] },
    Circle: { position: [128, 128], radius: 50, delta: 8 },
    SineDistort: { sines: [4, 4], offset: [0, 0], amplitude: [16, 16] },
    Twirl: { strength: 0.15, radius: 120, position: [128, 128] },
    Transform: { offset: [0, 0], angle: 0, scale: [1, 1] },
    Pixelate: { size: [8, 8] },
    Posterize: { step: 4 }
  };

  var SAMPLE = [
    { type: 'XOR', op: 'add', tint: [1, 0.5, 0.7], params: {} },
    { type: 'SinX', op: 'add', tint: [0.25, 0, 0], params: { frequency: 0.012566, offset: 0 } },
    { type: 'SinY', op: 'sub', tint: [0.25, 0, 0], params: { frequency: 0.012566, offset: 0 } },
    { type: 'Noise', op: 'add', tint: [0.1, 0.1, 0.2], params: { seed: 1 } }
  ];

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var timer = 0;
  var layers = SAMPLE.map(cloneLayer);
  var selected = 0;
  var SIZE = 256;

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function cloneLayer(l) {
    return {
      type: l.type,
      op: l.op || 'add',
      tint: (l.tint || [1, 1, 1]).slice(),
      params: JSON.parse(JSON.stringify(l.params || {}))
    };
  }

  function say(msg) {
    var el = $('status');
    if (el) el.textContent = msg || '';
  }

  function makeGen(layer) {
    var Ctor = root.TG[layer.type];
    if (typeof Ctor !== 'function') return null;
    var gen = new Ctor();
    var p = gen.getParams && gen.getParams();
    var k;
    if (p && layer.params) {
      for (k in layer.params) p[k] = layer.params[k];
    }
    var t = layer.tint || [1, 1, 1];
    gen.tint(t[0], t[1], t[2]);
    return gen;
  }

  function render() {
    if (!root.TG || !$('tex')) return;
    var tex = new root.TG.Texture(SIZE, SIZE);
    var i, layer, gen, op;
    for (i = 0; i < layers.length; i++) {
      layer = layers[i];
      gen = makeGen(layer);
      if (!gen) continue;
      op = layer.op || 'add';
      if (typeof tex[op] === 'function') tex[op](gen);
      else tex.add(gen);
    }
    tex.toCanvas($('tex'));
    persist();
  }

  function persist() {
    if (!saveDb) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      saveDb.put({ id: 'state', layers: layers, at: Date.now() }).catch(function () {});
    }, 250);
  }

  function paintLayers() {
    var host = $('layers');
    if (!host) return;
    host.innerHTML = '';
    layers.forEach(function (layer, i) {
      var box = root.document.createElement('div');
      box.className = 'layer' + (i === selected ? ' on' : '');
      var head = root.document.createElement('div');
      head.className = 'layer-head';
      var title = root.document.createElement('b');
      title.textContent = (i + 1) + '. ' + layer.type;
      var opSel = root.document.createElement('select');
      OPS.forEach(function (o) {
        var opt = root.document.createElement('option');
        opt.value = o.id; opt.textContent = o.label;
        if (o.id === layer.op) opt.selected = true;
        opSel.appendChild(opt);
      });
      opSel.addEventListener('change', function () { layer.op = opSel.value; render(); });
      var del = root.document.createElement('button');
      del.type = 'button';
      del.className = 'row-del';
      del.setAttribute('aria-label', 'Delete layer');
      del.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 2h4l1 1h3v2H2V3h3l1-1zm1 4h2v6H7V6zm-3 0h2v6H4V6zm6 0h2v6h-2V6zM3 14V5h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        layers.splice(i, 1);
        if (selected >= layers.length) selected = layers.length - 1;
        paintLayers();
        render();
      });
      head.appendChild(title);
      head.appendChild(opSel);
      head.appendChild(del);
      box.appendChild(head);
      box.addEventListener('click', function () {
        selected = i;
        paintLayers();
      });
      if (i === selected) box.appendChild(paramForm(layer));
      host.appendChild(box);
    });
  }

  function paramForm(layer) {
    var wrap = root.document.createElement('div');
    wrap.className = 'params';
    var tint = root.document.createElement('div');
    tint.className = 'tint';
    ['R', 'G', 'B'].forEach(function (lab, i) {
      var label = root.document.createElement('label');
      label.textContent = 'Tint ' + lab;
      var inp = root.document.createElement('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '1'; inp.step = '0.01';
      inp.value = String(layer.tint[i]);
      inp.addEventListener('input', function () {
        layer.tint[i] = +inp.value;
        render();
      });
      label.appendChild(inp);
      tint.appendChild(label);
    });
    wrap.appendChild(tint);
    var defs = PARAMS[layer.type] || {};
    Object.keys(defs).forEach(function (key) {
      var val = layer.params[key];
      if (val == null) val = defs[key];
      if (val instanceof Array) {
        val.forEach(function (n, idx) {
          wrap.appendChild(numField(layer, key, idx, n, key + '[' + idx + ']'));
        });
      } else {
        wrap.appendChild(numField(layer, key, null, val, key));
      }
    });
    return wrap;
  }

  function numField(layer, key, idx, value, labelText) {
    var label = root.document.createElement('label');
    label.textContent = labelText;
    var inp = root.document.createElement('input');
    inp.type = 'number';
    inp.step = 'any';
    inp.value = String(value);
    inp.addEventListener('change', function () {
      var n = parseFloat(inp.value);
      if (isNaN(n)) return;
      if (idx == null) layer.params[key] = n;
      else {
        if (!layer.params[key]) layer.params[key] = [];
        layer.params[key][idx] = n;
      }
      render();
    });
    label.appendChild(inp);
    return label;
  }

  function addLayer() {
    var type = $('addType').value;
    var params = JSON.parse(JSON.stringify(PARAMS[type] || {}));
    layers.push({ type: type, op: 'add', tint: [1, 1, 1], params: params });
    selected = layers.length - 1;
    paintLayers();
    render();
  }

  function downloadPng() {
    var canvas = $('tex');
    if (!canvas) return;
    var a = root.document.createElement('a');
    a.download = 'texgen.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function boot() {
    if (!$('tex') || !root.TG) return;
    $('addBtn').addEventListener('click', addLayer);
    $('saveBtn').addEventListener('click', downloadPng);
    $('resetBtn').addEventListener('click', function () {
      layers = SAMPLE.map(cloneLayer);
      selected = 0;
      paintLayers();
      render();
    });
    var ready = Promise.resolve();
    if (saveDb) {
      ready = saveDb.get('state').then(function (row) {
        if (row && row.layers && row.layers.length) layers = row.layers.map(cloneLayer);
      }).catch(function () {});
    }
    ready.then(function () {
      paintLayers();
      render();
      say('Texture on this device.');
    });
  }

  root.TexgenApp = {
    SAMPLE: SAMPLE,
    OPS: OPS,
    makeGen: makeGen,
    cloneLayer: cloneLayer
  };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
