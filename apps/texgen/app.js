/*
 * TexGen editor around mrdoob's TG API (fill-port, no Function constructor).
 * Named recipes, live stack, PNG out. The file holds the recipe.
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

  var TRASH = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 2h4l1 1h3v2H2V3h3l1-1zm1 4h2v6H7V6zm-3 0h2v6H4V6zm6 0h2v6h-2V6zM3 14V5h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>';

  function F(v) { return v * Math.PI; }

  var SAMPLE = [
    { type: 'XOR', op: 'add', tint: [1, 0.5, 0.7], params: {} },
    { type: 'SinX', op: 'add', tint: [0.25, 0, 0], params: { frequency: 0.012566, offset: 0 } },
    { type: 'SinY', op: 'sub', tint: [0.25, 0, 0], params: { frequency: 0.012566, offset: 0 } },
    { type: 'Noise', op: 'add', tint: [0.1, 0.1, 0.2], params: { seed: 1 } }
  ];

  var PRESETS = [
    { id: 'classic', name: 'Classic XOR', size: 256, layers: SAMPLE },
    { id: 'grid', name: 'Soft grid', size: 256, layers: [
      { type: 'SinX', op: 'add', tint: [0.1, 0.25, 0.5], params: { frequency: F(0.03), offset: -16 } },
      { type: 'SinY', op: 'add', tint: [0.1, 0.25, 0.5], params: { frequency: F(0.03), offset: -16 } },
      { type: 'Number', op: 'add', tint: [0.75, 0.5, 0.5], params: {} },
      { type: 'SinX', op: 'add', tint: [0.2, 0.2, 0.2], params: { frequency: F(0.03), offset: 0 } },
      { type: 'SinY', op: 'add', tint: [0.2, 0.2, 0.2], params: { frequency: F(0.03), offset: 0 } },
      { type: 'Noise', op: 'add', tint: [0.1, 0, 0], params: { seed: 1 } },
      { type: 'Noise', op: 'add', tint: [0, 0.1, 0], params: { seed: 2 } },
      { type: 'Noise', op: 'add', tint: [0, 0, 0.1], params: { seed: 3 } }
    ] },
    { id: 'moire', name: 'Moiré', size: 256, layers: [
      { type: 'SinX', op: 'add', tint: [1, 1, 1], params: { frequency: F(0.1), offset: 0 } },
      { type: 'SinX', op: 'mul', tint: [1, 1, 1], params: { frequency: F(0.05), offset: 0 } },
      { type: 'SinX', op: 'mul', tint: [1, 1, 1], params: { frequency: F(0.025), offset: 0 } },
      { type: 'SinY', op: 'mul', tint: [1, 1, 1], params: { frequency: F(0.1), offset: 0 } },
      { type: 'SinY', op: 'mul', tint: [1, 1, 1], params: { frequency: F(0.05), offset: 0 } },
      { type: 'SinY', op: 'mul', tint: [1, 1, 1], params: { frequency: F(0.025), offset: 0 } },
      { type: 'SinX', op: 'add', tint: [-0.25, 0.1, 0.6], params: { frequency: F(0.004), offset: 0 } }
    ] },
    { id: 'xoror', name: 'XOR × OR', size: 256, layers: [
      { type: 'XOR', op: 'add', tint: [1, 1, 1], params: {} },
      { type: 'OR', op: 'mul', tint: [0.5, 0.8, 0.5], params: {} },
      { type: 'SinX', op: 'mul', tint: [1, 1, 1], params: { frequency: F(0.0312), offset: 0 } },
      { type: 'SinY', op: 'div', tint: [1, 1, 1], params: { frequency: F(0.0312), offset: 0 } },
      { type: 'SinX', op: 'add', tint: [0.5, 0, 0], params: { frequency: F(0.004), offset: 0 } },
      { type: 'Noise', op: 'add', tint: [0.1, 0.1, 0.2], params: { seed: 1 } }
    ] },
    { id: 'checkers', name: 'Checkers', size: 256, layers: [
      { type: 'CheckerBoard', op: 'add', tint: [1, 1, 1], params: { size: [32, 32], offset: [0, 0], rowShift: 0 } },
      { type: 'CheckerBoard', op: 'add', tint: [0.5, 0, 0], params: { size: [2, 2], offset: [0, 0], rowShift: 0 } },
      { type: 'CheckerBoard', op: 'add', tint: [1, 0.5, 0.5], params: { size: [8, 8], offset: [0, 0], rowShift: 0 } },
      { type: 'CheckerBoard', op: 'sub', tint: [0.5, 0.5, 0], params: { size: [32, 32], offset: [16, 16], rowShift: 0 } }
    ] },
    { id: 'rects', name: 'RGB rects', size: 256, layers: [
      { type: 'Rect', op: 'add', tint: [1, 0.25, 0.25], params: { position: [53, 21], size: [150, 128] } },
      { type: 'Rect', op: 'add', tint: [0.25, 1, 0.25], params: { position: [21, 64], size: [211, 128] } },
      { type: 'Rect', op: 'add', tint: [0.25, 0.25, 1], params: { position: [53, 102], size: [150, 128] } }
    ] },
    { id: 'distort', name: 'Sine distort', size: 256, layers: [
      { type: 'CheckerBoard', op: 'add', tint: [0.5, 0, 0], params: { size: [32, 32], offset: [0, 0], rowShift: 0 } },
      { type: 'SineDistort', op: 'set', tint: [1, 1, 1], params: { sines: [4, 4], offset: [0, 0], amplitude: [16, 16] } }
    ] },
    { id: 'twirl', name: 'Twirl', size: 256, layers: [
      { type: 'CheckerBoard', op: 'add', tint: [0.5, 0, 0], params: { size: [32, 32], offset: [0, 0], rowShift: 0 } },
      { type: 'Twirl', op: 'set', tint: [1, 1, 1], params: { strength: 0.75, radius: 128, position: [128, 128] } }
    ] },
    { id: 'circle', name: 'Circle', size: 256, layers: [
      { type: 'Circle', op: 'add', tint: [1, 1, 1], params: { position: [128, 128], radius: 64, delta: 1 } }
    ] },
    { id: 'pixel', name: 'Pixel sun', size: 256, layers: [
      { type: 'Circle', op: 'add', tint: [1, 0.25, 0.25], params: { position: [128, 128], radius: 64, delta: 64 } },
      { type: 'Pixelate', op: 'set', tint: [1, 1, 1], params: { size: [8, 8] } }
    ] },
    { id: 'spin', name: 'Spin checkers', size: 256, layers: [
      { type: 'CheckerBoard', op: 'add', tint: [1, 1, 0], params: { size: [32, 32], offset: [0, 0], rowShift: 0 } },
      { type: 'Transform', op: 'set', tint: [1, 1, 1], params: { offset: [10, 20], angle: 23, scale: [2, 0.5] } }
    ] },
    { id: 'rings', name: 'XOR rings', size: 256, layers: [
      { type: 'CheckerBoard', op: 'add', tint: [1, 1, 1], params: { size: [32, 32], offset: [0, 0], rowShift: 0 } },
      { type: 'Circle', op: 'and', tint: [1, 1, 1], params: { position: [128, 128], radius: 85, delta: 1 } },
      { type: 'Circle', op: 'xor', tint: [1, 1, 1], params: { position: [128, 128], radius: 64, delta: 1 } }
    ] }
  ];

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var timer = 0;
  var layers = SAMPLE.map(cloneLayer);
  var selected = 0;
  var SIZE = 256;
  var name = 'Classic XOR';
  var recipes = [];
  var tiled = false;
  var persistErr = '';
  var lastPreset = 'classic';

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function cloneLayer(l) {
    return {
      type: l.type,
      op: l.op || 'add',
      tint: (l.tint || [1, 1, 1]).slice(),
      params: JSON.parse(JSON.stringify(l.params || {}))
    };
  }

  function clonePreset(p) {
    return {
      id: p.id,
      name: p.name,
      size: p.size || 256,
      layers: (p.layers || []).map(cloneLayer)
    };
  }

  function say(msg, err) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = err ? 'err' : '';
  }

  function makeGen(layer) {
    if (!root.TG || !layer) return null;
    var Ctor = root.TG[layer.type];
    if (typeof Ctor !== 'function') return null;
    var gen = new Ctor();
    var p = gen.getParams && gen.getParams();
    var k;
    if (p && layer.params) {
      for (k in layer.params) {
        if (Object.prototype.hasOwnProperty.call(layer.params, k)) p[k] = layer.params[k];
      }
      // Upstream fluent .angle(deg) stored radians. The editor slider is
      // degrees; convert on the generator's copy, never on the saved layer.
      if (layer.type === 'Transform' && typeof p.angle === 'number') {
        p.angle = p.angle * Math.PI / 180;
      }
    }
    var t = layer.tint || [1, 1, 1];
    gen.tint(t[0], t[1], t[2]);
    return gen;
  }

  function renderBuffer(list, size) {
    if (!root.TG) return null;
    size = size || 256;
    var tex = new root.TG.Texture(size, size);
    var i, layer, gen, op;
    for (i = 0; i < list.length; i++) {
      layer = list[i];
      gen = makeGen(layer);
      if (!gen) continue;
      op = layer.op || 'add';
      if (typeof tex[op] === 'function') tex[op](gen);
      else tex.add(gen);
    }
    return tex.buffer.array;
  }

  function scaleParams(layer, from, to) {
    if (!from || from === to) return layer;
    var s = to / from, f = from / to;
    var p = layer.params || {};
    var t = layer.type;
    if (t === 'SinX' || t === 'SinY') {
      if (p.frequency) p.frequency *= f;
      if (p.offset) p.offset *= s;
    }
    if (p.position) p.position = [p.position[0] * s, p.position[1] * s];
    if (t === 'CheckerBoard' || t === 'Rect' || t === 'Pixelate') {
      if (p.size && p.size.length === 2) p.size = [p.size[0] * s, p.size[1] * s];
    }
    if (t === 'CheckerBoard' && p.offset) p.offset = [p.offset[0] * s, p.offset[1] * s];
    if (t === 'SineDistort') {
      if (p.amplitude) p.amplitude = [p.amplitude[0] * s, p.amplitude[1] * s];
      if (p.offset) p.offset = [p.offset[0] * s, p.offset[1] * s];
    }
    if (typeof p.radius === 'number') p.radius *= s;
    if (typeof p.delta === 'number' && t === 'Circle') p.delta *= s;
    if (t === 'Twirl' && p.radius) p.radius *= s;
    if (t === 'Transform' && p.offset) p.offset = [p.offset[0] * s, p.offset[1] * s];
    return layer;
  }

  function applyPreset(p, keepSize) {
    if (!p) return;
    var src = p.size || 256;
    var dest = keepSize ? SIZE : (p.size || SIZE);
    layers = (p.layers || []).map(function (l) { return scaleParams(cloneLayer(l), src, dest); });
    name = p.name || name;
    if (!keepSize && p.size) SIZE = p.size;
    selected = layers.length ? 0 : -1;
    lastPreset = p.id || '';
  }

  function serializeState() {
    return {
      id: 'state',
      layers: layers.map(cloneLayer),
      name: name,
      size: SIZE,
      recipes: recipes.map(clonePreset),
      selected: selected,
      tiled: tiled,
      at: Date.now()
    };
  }

  function loadState(row) {
    if (!row) return;
    if (Array.isArray(row.layers)) layers = row.layers.map(cloneLayer);
    if (row.name != null) name = String(row.name).slice(0, 40);
    if (row.size === 128 || row.size === 256 || row.size === 512) SIZE = row.size;
    if (Array.isArray(row.recipes)) {
      recipes = row.recipes.map(function (r) {
        return {
          id: r.id || ('r' + Date.now()),
          name: String(r.name || 'Recipe').slice(0, 40),
          size: r.size || 256,
          layers: (r.layers || []).map(cloneLayer)
        };
      });
    }
    if (row.selected != null) selected = row.selected | 0;
    if (selected >= layers.length) selected = layers.length - 1;
    if (row.tiled != null) tiled = !!row.tiled;
  }

  function persist() {
    if (!saveDb) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      saveDb.put(serializeState()).then(function () {
        persistErr = '';
      }).catch(function (e) {
        persistErr = String((e && e.message) || e || 'Could not save.');
        say(persistErr, true);
      });
    }, 250);
  }

  function rangeFor(type, key) {
    if (type === 'FractalNoise' && key === 'amplitude') return { min: 0, max: 1, step: 0.01 };
    if ((type === 'SinX' || type === 'SinY') && key === 'frequency') return { min: 0.002, max: 0.4, step: 0.001 };
    if ((type === 'SinX' || type === 'SinY') && key === 'offset') return { min: -128, max: 128, step: 1 };
    if (key === 'seed') return { min: 1, max: 9999, step: 1 };
    if (key === 'baseFrequency') return { min: 0.005, max: 0.25, step: 0.001 };
    if (key === 'persistence') return { min: 0, max: 1, step: 0.01 };
    if (key === 'octaves') return { min: 1, max: 8, step: 1 };
    if (key === 'step' && type === 'Posterize') return { min: 2, max: 16, step: 1 };
    if (key === 'step') return { min: 1, max: 8, step: 1 };
    if (key === 'rowShift') return { min: 0, max: 64, step: 1 };
    if (key === 'radius') return { min: 1, max: SIZE, step: 1 };
    if (key === 'delta') return { min: 0, max: SIZE, step: 1 };
    if (key === 'strength') return { min: 0, max: 2, step: 0.01 };
    if (key === 'angle') return { min: 0, max: 360, step: 1 };
    if (key === 'sines') return { min: 0, max: 20, step: 0.1 };
    if (key === 'scale') return { min: 0.1, max: 4, step: 0.05 };
    if (key === 'amplitude') return { min: 0, max: 64, step: 0.5 };
    if (key === 'position' || key === 'offset' || key === 'size') return { min: 0, max: SIZE, step: 1 };
    return { min: -256, max: 512, step: 0.1 };
  }

  function render() {
    if (!root.TG || !$('tex')) return;
    try {
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
      var canvas = $('tex');
      if (tiled) {
        var tmp = root.document.createElement('canvas');
        tex.toCanvas(tmp);
        canvas.width = SIZE * 2;
        canvas.height = SIZE * 2;
        var ctx = canvas.getContext('2d');
        var pat = ctx.createPattern(tmp, 'repeat');
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        tex.toCanvas(canvas);
      }
      if ($('meta')) $('meta').textContent = SIZE + ' × ' + SIZE + (layers.length ? ' · ' + layers.length + ' layer' + (layers.length === 1 ? '' : 's') : '');
      persist();
      if (persistErr) say(persistErr, true);
      else if (!layers.length) say('Empty recipe — add a layer.');
      else say(saveDb ? 'Recipe in this file. PNG stays on this device.' : 'Running outside GifOS — nothing is stored.');
    } catch (e) {
      say(String((e && e.message) || e), true);
    }
  }

  function paintPresets() {
    var host = $('presets');
    if (!host) return;
    host.innerHTML = '';
    function chip(p, isUser) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.textContent = p.name;
      if (p.id && p.id === lastPreset) b.className = 'on';
      b.addEventListener('click', function () {
        applyPreset(p, false);
        if ($('name')) $('name').value = name;
        if ($('size')) $('size').value = String(SIZE);
        paintAll();
        render();
      });
      host.appendChild(b);
    }
    PRESETS.forEach(function (p) { chip(p, false); });
    recipes.forEach(function (p) { chip(p, true); });
  }

  function paintLayers() {
    var host = $('layers');
    var empty = $('empty');
    if (!host) return;
    host.innerHTML = '';
    if (empty) empty.hidden = layers.length > 0;
    layers.forEach(function (layer, i) {
      var box = root.document.createElement('div');
      box.className = 'layer' + (i === selected ? ' on' : '');
      var head = root.document.createElement('div');
      head.className = 'layer-head';
      var title = root.document.createElement('b');
      title.textContent = (i + 1) + '. ' + layer.type;
      var opSel = root.document.createElement('select');
      opSel.setAttribute('aria-label', 'Operation');
      OPS.forEach(function (o) {
        var opt = root.document.createElement('option');
        opt.value = o.id; opt.textContent = o.label;
        if (o.id === layer.op) opt.selected = true;
        opSel.appendChild(opt);
      });
      opSel.addEventListener('change', function () { layer.op = opSel.value; render(); });
      opSel.addEventListener('click', function (e) { e.stopPropagation(); });
      function iconBtn(label, fn) {
        var b = root.document.createElement('button');
        b.type = 'button';
        b.className = 'icon';
        b.textContent = label;
        b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
        return b;
      }
      var up = iconBtn('↑', function () {
        if (i === 0) return;
        var t = layers[i - 1]; layers[i - 1] = layers[i]; layers[i] = t;
        selected = i - 1;
        paintLayers(); render();
      });
      var down = iconBtn('↓', function () {
        if (i >= layers.length - 1) return;
        var t = layers[i + 1]; layers[i + 1] = layers[i]; layers[i] = t;
        selected = i + 1;
        paintLayers(); render();
      });
      var dup = iconBtn('Copy', function () {
        layers.splice(i + 1, 0, cloneLayer(layer));
        selected = i + 1;
        paintLayers(); render();
      });
      var del = root.document.createElement('button');
      del.type = 'button';
      del.className = 'row-del';
      del.setAttribute('aria-label', 'Delete layer');
      del.innerHTML = TRASH;
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        layers.splice(i, 1);
        if (selected >= layers.length) selected = layers.length - 1;
        paintLayers();
        render();
      });
      head.appendChild(title);
      head.appendChild(opSel);
      head.appendChild(up);
      head.appendChild(down);
      head.appendChild(dup);
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
      inp.setAttribute('aria-label', 'Tint ' + lab);
      inp.addEventListener('input', function () {
        layer.tint[i] = +inp.value;
        paintSwatch();
        render();
      });
      label.appendChild(inp);
      tint.appendChild(label);
    });
    var sw = root.document.createElement('div');
    sw.className = 'swatch';
    function paintSwatch() {
      var t = layer.tint;
      sw.style.background = 'rgb(' + Math.round(t[0] * 255) + ',' + Math.round(t[1] * 255) + ',' + Math.round(t[2] * 255) + ')';
    }
    paintSwatch();
    tint.appendChild(sw);
    wrap.appendChild(tint);
    var defs = PARAMS[layer.type] || {};
    Object.keys(defs).forEach(function (key) {
      var val = layer.params[key];
      if (val == null) val = defs[key];
      if (val instanceof Array) {
        val.forEach(function (n, idx) {
          wrap.appendChild(sliderField(layer, key, idx, n, niceLabel(layer.type, key, idx)));
        });
      } else {
        wrap.appendChild(sliderField(layer, key, null, val, niceLabel(layer.type, key, null)));
      }
    });
    return wrap;
  }

  function niceLabel(type, key, idx) {
    var axis = {
      position: ['X', 'Y'],
      size: (type === 'CheckerBoard' || type === 'Pixelate' || type === 'Rect') ? ['Width', 'Height'] : ['Size X', 'Size Y'],
      offset: ['Offset X', 'Offset Y'],
      amplitude: ['Amp X', 'Amp Y'],
      sines: ['Sines X', 'Sines Y'],
      scale: ['Scale X', 'Scale Y']
    };
    if (idx != null && axis[key]) return axis[key][idx] || (key + ' ' + idx);
    var names = {
      frequency: 'Frequency', offset: 'Offset', seed: 'Seed',
      baseFrequency: 'Base frequency', amplitude: 'Amplitude',
      persistence: 'Persistence', octaves: 'Octaves', step: 'Step',
      radius: 'Radius', delta: 'Soft edge', strength: 'Strength',
      angle: 'Angle', rowShift: 'Row shift'
    };
    return names[key] || key;
  }

  function sliderField(layer, key, idx, value, labelText) {
    var rng = rangeFor(layer.type, key);
    var label = root.document.createElement('label');
    var cap = root.document.createElement('span');
    cap.textContent = labelText + '  ' + (Math.round(+value * 1000) / 1000);
    var inp = root.document.createElement('input');
    inp.type = 'range';
    inp.min = String(rng.min);
    inp.max = String(rng.max);
    inp.step = String(rng.step);
    inp.value = String(value);
    inp.setAttribute('aria-label', labelText);
    inp.addEventListener('input', function () {
      var n = parseFloat(inp.value);
      if (isNaN(n)) return;
      if (idx == null) layer.params[key] = n;
      else {
        if (!layer.params[key]) layer.params[key] = [];
        layer.params[key][idx] = n;
      }
      cap.textContent = labelText + '  ' + (Math.round(n * 1000) / 1000);
      render();
    });
    label.appendChild(cap);
    label.appendChild(inp);
    return label;
  }

  function paintAll() {
    if ($('name')) $('name').value = name;
    if ($('size')) $('size').value = String(SIZE);
    if ($('tileBtn')) $('tileBtn').textContent = tiled ? 'Untile' : 'Tile';
    paintPresets();
    paintLayers();
  }

  function addLayer() {
    var type = $('addType').value;
    var params = JSON.parse(JSON.stringify(PARAMS[type] || {}));
    layers.push({ type: type, op: 'add', tint: [1, 1, 1], params: params });
    selected = layers.length - 1;
    paintLayers();
    render();
  }

  function safeName() {
    var n = (name || 'texgen').replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '');
    return n || 'texgen';
  }

  function tryLibrary(canvas) {
    if (!root.gifos || !root.gifos.library || !canvas.toBlob) return;
    try {
      canvas.toBlob(function (blob) {
        if (!blob || !blob.arrayBuffer) return;
        blob.arrayBuffer().then(function (bytes) {
          return root.gifos.library.put({ bytes: bytes, mime: 'image/png', name: safeName() + '.png', type: 'image' });
        }).then(function () {
          say('PNG saved to My Media.');
        }).catch(function () { /* download already happened */ });
      }, 'image/png');
    } catch (e) {}
  }

  function downloadPng() {
    var canvas = $('tex');
    if (!canvas) return;
    if (!layers.length) { say('Nothing to export — add a layer.', true); return; }
    try {
      if (typeof canvas.toDataURL !== 'function') { say('Cannot export on this device.', true); return; }
      var url = canvas.toDataURL('image/png');
      var a = root.document.createElement('a');
      a.download = safeName() + '.png';
      a.href = url;
      root.document.body.appendChild(a);
      a.click();
      if (a.remove) a.remove();
      else if (a.parentNode) a.parentNode.removeChild(a);
      say('PNG downloaded.');
      tryLibrary(canvas);
    } catch (e) {
      say(String((e && e.message) || e), true);
    }
  }

  function keepRecipe() {
    var id = 'r' + Date.now();
    recipes.push({ id: id, name: name || 'Recipe', size: SIZE, layers: layers.map(cloneLayer) });
    lastPreset = id;
    paintPresets();
    persist();
    say('Kept “' + (name || 'Recipe') + '” in this file.');
  }

  function applyLaunch(goArgs) {
    if (!goArgs) return;
    var key = goArgs.preset || goArgs.recipe;
    if (!key) return;
    key = String(key).toLowerCase();
    var i, p = null;
    for (i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === key || PRESETS[i].name.toLowerCase() === key) p = PRESETS[i];
    if (!p) for (i = 0; i < recipes.length; i++) if (recipes[i].id === key || String(recipes[i].name).toLowerCase() === key) p = recipes[i];
    if (p) applyPreset(p, false);
  }

  function boot() {
    if (!$('tex') || !root.TG) return;
    $('addBtn').addEventListener('click', addLayer);
    $('saveBtn').addEventListener('click', downloadPng);
    $('keepBtn').addEventListener('click', keepRecipe);
    $('resetBtn').addEventListener('click', function () {
      applyPreset(PRESETS[0], false);
      paintAll();
      render();
    });
    $('tileBtn').addEventListener('click', function () {
      tiled = !tiled;
      paintAll();
      render();
    });
    $('name').addEventListener('input', function () {
      name = $('name').value.slice(0, 40);
      persist();
    });
    $('size').addEventListener('change', function () {
      var next = parseInt($('size').value, 10);
      if (next === SIZE) return;
      layers.forEach(function (l) { scaleParams(l, SIZE, next); });
      SIZE = next;
      paintLayers();
      render();
    });
    if (root.gifos && root.gifos.onBack) {
      try {
        root.gifos.onBack(function () {
          if (selected >= 0 && layers.length) {
            selected = -1;
            paintLayers();
            return true;
          }
          return false;
        });
      } catch (e) {}
    }
    var ready = Promise.resolve();
    if (saveDb) {
      ready = saveDb.get('state').then(function (row) {
        loadState(row);
      }).catch(function () {});
    }
    ready.then(function () {
      paintAll();
      render();
      if (root.gifos && root.gifos.launch) {
        Promise.resolve(root.gifos.launch()).then(function (goArgs) {
          if (!goArgs) return;
          applyLaunch(goArgs);
          paintAll();
          render();
        }).catch(function () {});
      }
    });
  }

  root.TexgenApp = {
    SAMPLE: SAMPLE,
    PRESETS: PRESETS,
    OPS: OPS,
    PARAMS: PARAMS,
    makeGen: makeGen,
    cloneLayer: cloneLayer,
    renderBuffer: renderBuffer,
    serializeState: serializeState,
    loadState: loadState,
    applyPreset: applyPreset,
    applyLaunch: applyLaunch,
    scaleParams: scaleParams,
    getState: function () {
      return { layers: layers, name: name, size: SIZE, selected: selected, recipes: recipes, tiled: tiled };
    }
  };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
