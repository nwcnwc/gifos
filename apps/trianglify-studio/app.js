/*
 * Trianglify studio — GifOS chrome around Quinn Rohlf's generator.
 *
 * vendor/trianglify.js is the pinned UMD. This file is the shell: palettes,
 * seed, mesh, PNG/SVG, and a private last wallpaper so the file is the save.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var WORDS = [
    'sunset', 'harbor', 'ember', 'glacier', 'canyon', 'meadow', 'orchid',
    'copper', 'indigo', 'saffron', 'lagoon', 'cedar', 'amber', 'violet',
    'coral', 'onyx', 'pearl', 'rust', 'fog', 'dune', 'pine', 'cobalt',
    'maple', 'iris', 'flint', 'sage'
  ];

  var SIZES = [
    { id: 'hd', name: 'HD 1920×1080', w: 1920, h: 1080 },
    { id: 'qhd', name: 'QHD 2560×1440', w: 2560, h: 1440 },
    { id: 'uhd', name: '4K 3840×2160', w: 3840, h: 2160 },
    { id: 'phone', name: 'Phone 1080×1920', w: 1080, h: 1920 },
    { id: 'square', name: 'Square 1080×1080', w: 1080, h: 1080 },
    { id: 'wide', name: 'Wide 2560×1080', w: 2560, h: 1080 }
  ];

  var LOOKS = ['linear', 'sparkle', 'shadows'];
  var SEED_MAX = 80;
  var PREVIEW_LONG = 960;

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var paintTimer = 0;
  var lastPattern = null;
  var palettes = {};
  var paletteNames = [];

  var state = {
    seed: 'sunset-42',
    palette: 'YlGnBu',
    cell: 75,
    variance: 0.75,
    look: 'linear',
    fill: true,
    stroke: 0,
    sizeId: 'hd'
  };

  function sizeOf(id) {
    var i;
    for (i = 0; i < SIZES.length; i++) if (SIZES[i].id === id) return SIZES[i];
    return SIZES[0];
  }

  function say(msg, err) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = err ? 'err' : '';
  }

  function clamp(n, lo, hi) {
    n = +n;
    if (!(n >= lo)) n = lo;
    if (n > hi) n = hi;
    return n;
  }

  function rollSeed() {
    var w = WORDS[(Math.random() * WORDS.length) | 0];
    var n = 10 + ((Math.random() * 90) | 0);
    return w + '-' + n;
  }

  function colorFn(look) {
    var cf = root.trianglify && root.trianglify.colorFunctions;
    if (!cf) return undefined;
    if (look === 'sparkle') return cf.sparkle(0.2);
    if (look === 'shadows') return cf.shadows(0.8);
    return cf.interpolateLinear(0.5);
  }

  function cellFor(w, h, cell) {
    var long = Math.max(w, h);
    var minCell = Math.max(16, Math.ceil(long / 80));
    return Math.max(minCell, cell);
  }

  function makePattern(w, h, cell) {
    if (!root.trianglify) throw new Error('Trianglify did not load.');
    var pal = palettes[state.palette] ? state.palette : 'YlGnBu';
    return root.trianglify({
      width: w | 0,
      height: h | 0,
      cellSize: cellFor(w, h, cell),
      variance: state.variance,
      seed: String(state.seed || 'gifos').slice(0, SEED_MAX),
      xColors: pal,
      yColors: 'match',
      colorFunction: colorFn(state.look),
      fill: !!state.fill,
      strokeWidth: state.fill ? 0 : Math.max(1, state.stroke || 1.5)
    });
  }

  function previewDims(outW, outH) {
    var long = Math.max(outW, outH);
    var s = long > PREVIEW_LONG ? PREVIEW_LONG / long : 1;
    return {
      w: Math.max(32, Math.round(outW * s)),
      h: Math.max(32, Math.round(outH * s)),
      s: s
    };
  }

  function paintWhich() {
    var el = $('which');
    if (!el) return;
    el.textContent = state.palette + ' · ' + state.seed;
    var chips = $('chips') && $('chips').querySelectorAll('button');
    var i;
    if (chips) {
      for (i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('on', chips[i].getAttribute('data-pal') === state.palette);
      }
    }
    var looks = document.querySelectorAll('.look');
    for (i = 0; i < looks.length; i++) {
      looks[i].classList.toggle('on', looks[i].getAttribute('data-look') === state.look);
    }
    var wire = $('wireBtn');
    if (wire) wire.setAttribute('aria-pressed', state.fill ? 'false' : 'true');
    if ($('seed') && $('seed').value !== state.seed) $('seed').value = state.seed;
    if ($('cell')) $('cell').value = String(state.cell | 0);
    if ($('cellVal')) $('cellVal').textContent = String(state.cell | 0);
    if ($('variance')) $('variance').value = String(Math.round(state.variance * 100));
    if ($('varVal')) $('varVal').textContent = state.variance.toFixed(2);
    if ($('size') && $('size').value !== state.sizeId) $('size').value = state.sizeId;
  }

  function paint() {
    var sz = sizeOf(state.sizeId);
    var pv = previewDims(sz.w, sz.h);
    var canvas = $('wall');
    if (!canvas) return;
    try {
      lastPattern = makePattern(pv.w, pv.h, Math.max(12, state.cell * pv.s));
      lastPattern.toCanvas(canvas, { scaling: false, applyCssScaling: false });
      canvas.style.width = '';
      canvas.style.height = '';
      say(sz.name + ' · ' + state.palette);
    } catch (e) {
      say(String((e && e.message) || e), true);
    }
    paintWhich();
  }

  function schedulePaint() {
    if (paintTimer) cancelAnimationFrame(paintTimer);
    paintTimer = requestAnimationFrame(function () {
      paintTimer = 0;
      paint();
    });
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({
        id: 'wallpaper',
        seed: state.seed,
        palette: state.palette,
        cell: state.cell,
        variance: state.variance,
        look: state.look,
        fill: state.fill,
        stroke: state.stroke,
        sizeId: state.sizeId
      }).catch(function () {});
    }, 250);
  }

  function applyState(next, fromMp) {
    if (!next) return;
    if (next.seed) state.seed = String(next.seed).slice(0, SEED_MAX);
    if (next.palette && palettes[next.palette]) state.palette = next.palette;
    if (next.cell != null) state.cell = clamp(next.cell, 24, 180) | 0;
    if (next.variance != null) state.variance = clamp(next.variance, 0, 1);
    if (next.look && LOOKS.indexOf(next.look) >= 0) state.look = next.look;
    if (next.fill != null) state.fill = !!next.fill;
    if (next.stroke != null) state.stroke = clamp(next.stroke, 0, 8);
    if (next.sizeId && sizeOf(next.sizeId)) state.sizeId = next.sizeId;
    paint();
    if (!fromMp) persist();
  }

  function current() {
    return {
      seed: state.seed,
      palette: state.palette,
      cell: state.cell,
      variance: state.variance,
      look: state.look,
      fill: state.fill,
      stroke: state.stroke,
      sizeId: state.sizeId
    };
  }

  function maybeShare(next) {
    if (root.TFMp && root.TFMp.onChange && root.TFMp.onChange(next || current())) return true;
    return false;
  }

  function change(patch) {
    var i;
    for (i in patch) if (Object.prototype.hasOwnProperty.call(patch, i)) state[i] = patch[i];
    if (maybeShare(current())) return;
    paint();
    persist();
  }

  function loadPalettes() {
    var src = (root.trianglify && root.trianglify.utils && root.trianglify.utils.colorbrewer) ||
      (root.trianglify && root.trianglify.defaultOptions && root.trianglify.defaultOptions.palette) ||
      {};
    var names = Object.keys(src);
    var i, n, cols, g;
    palettes = {};
    paletteNames = [];
    for (i = 0; i < names.length; i++) {
      n = names[i];
      cols = src[n];
      if (!cols || !cols.length) continue;
      palettes[n] = cols;
      paletteNames.push(n);
    }
    if (!palettes[state.palette] && paletteNames.length) state.palette = paletteNames[0];
    var box = $('chips');
    if (!box) return;
    box.textContent = '';
    paletteNames.forEach(function (name) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-pal', name);
      b.setAttribute('aria-label', name);
      b.title = name;
      cols = palettes[name];
      g = [];
      for (i = 0; i < cols.length; i++) g.push(cols[i] + ' ' + Math.round(100 * i / (cols.length - 1)) + '%');
      b.style.backgroundImage = 'linear-gradient(90deg, ' + g.join(', ') + ')';
      b.addEventListener('click', function (e) {
        e.preventDefault();
        change({ palette: name });
      });
      box.appendChild(b);
    });
  }

  function fillSizes() {
    var sel = $('size');
    if (!sel) return;
    sel.textContent = '';
    SIZES.forEach(function (sz) {
      var o = root.document.createElement('option');
      o.value = sz.id;
      o.textContent = sz.name;
      sel.appendChild(o);
    });
    sel.value = state.sizeId;
  }

  function safeName() {
    var s = String(state.seed || 'trianglify').replace(/[^\w.-]+/g, '_').slice(0, 40);
    return 'trianglify-' + state.palette + '-' + s;
  }

  function clickDownload(href, name) {
    var a = root.document.createElement('a');
    a.download = name;
    a.href = href;
    root.document.body.appendChild(a);
    a.click();
    if (a.remove) a.remove();
    else if (a.parentNode) a.parentNode.removeChild(a);
  }

  function downloadPng() {
    var sz = sizeOf(state.sizeId);
    say('Painting ' + sz.name + '…');
    try {
      var cell = cellFor(sz.w, sz.h, state.cell);
      var pattern = makePattern(sz.w, sz.h, cell);
      var canvas = root.document.createElement('canvas');
      pattern.toCanvas(canvas, { scaling: false, applyCssScaling: false });
      var name = safeName() + '.png';
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (!blob) { say('Could not encode PNG.', true); return; }
          var url = URL.createObjectURL(blob);
          clickDownload(url, name);
          say('PNG ' + sz.w + '×' + sz.h + ' downloaded.');
          try {
            if (root.gifos && root.gifos.library && blob.arrayBuffer) {
              blob.arrayBuffer().then(function (bytes) {
                return root.gifos.library.put({
                  bytes: bytes, mime: 'image/png', name: name, type: 'image'
                });
              }).then(function () {
                say('PNG saved to My Media.');
              }).catch(function () {});
            }
          } catch (e2) {}
        }, 'image/png');
      } else if (canvas.toDataURL) {
        clickDownload(canvas.toDataURL('image/png'), name);
        say('PNG ' + sz.w + '×' + sz.h + ' downloaded.');
      } else {
        say('Cannot export on this device.', true);
      }
    } catch (e) {
      say(String((e && e.message) || e), true);
    }
  }

  function downloadSvg() {
    var sz = sizeOf(state.sizeId);
    say('Painting ' + sz.name + '…');
    try {
      var cell = cellFor(sz.w, sz.h, state.cell);
      var pattern = makePattern(sz.w, sz.h, cell);
      var svg = pattern.toSVGTree({ includeNamespace: true }).toString();
      var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      clickDownload(URL.createObjectURL(blob), safeName() + '.svg');
      say('SVG ' + sz.w + '×' + sz.h + ' downloaded.');
    } catch (e) {
      say(String((e && e.message) || e), true);
    }
  }

  function bind() {
    $('rollBtn').addEventListener('click', function (e) {
      e.preventDefault();
      change({ seed: rollSeed() });
    });
    $('shuffleBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (paletteNames.length < 2) return;
      var pick = paletteNames[(Math.random() * paletteNames.length) | 0];
      var guard = 0;
      while (pick === state.palette && guard++ < 8) {
        pick = paletteNames[(Math.random() * paletteNames.length) | 0];
      }
      change({ palette: pick });
    });
    $('seed').addEventListener('change', function () {
      var s = String($('seed').value || '').trim().slice(0, SEED_MAX) || rollSeed();
      change({ seed: s });
    });
    $('cell').addEventListener('input', function () {
      state.cell = clamp($('cell').value, 24, 180) | 0;
      if ($('cellVal')) $('cellVal').textContent = String(state.cell);
      schedulePaint();
    });
    $('cell').addEventListener('change', function () {
      change({ cell: state.cell });
    });
    $('variance').addEventListener('input', function () {
      state.variance = clamp((+$('variance').value) / 100, 0, 1);
      if ($('varVal')) $('varVal').textContent = state.variance.toFixed(2);
      schedulePaint();
    });
    $('variance').addEventListener('change', function () {
      change({ variance: state.variance });
    });
    var looks = document.querySelectorAll('.look');
    var i;
    for (i = 0; i < looks.length; i++) {
      looks[i].addEventListener('click', function (e) {
        e.preventDefault();
        change({ look: this.getAttribute('data-look') });
      });
    }
    $('wireBtn').addEventListener('click', function (e) {
      e.preventDefault();
      change({ fill: !state.fill, stroke: state.fill ? 1.5 : 0 });
    });
    $('size').addEventListener('change', function () {
      change({ sizeId: $('size').value });
    });
    $('pngBtn').addEventListener('click', function (e) { e.preventDefault(); downloadPng(); });
    $('svgBtn').addEventListener('click', function (e) { e.preventDefault(); downloadSvg(); });
    root.addEventListener('resize', schedulePaint);
  }

  function loadSave() {
    if (!api || !api.db) return Promise.resolve();
    saveDb = api.db('save');
    return saveDb.get('wallpaper').then(function (row) {
      if (!row || (root.TFMp && root.TFMp.busy())) return;
      applyState(row, true);
    }).catch(function () {});
  }

  function loadLaunch() {
    if (!api || !api.launch) return;
    api.launch().then(function (a) {
      if (!a) return;
      var patch = {};
      if (a.seed) patch.seed = String(a.seed).slice(0, SEED_MAX);
      if (a.palette && palettes[a.palette]) patch.palette = a.palette;
      if (patch.seed || patch.palette) {
        if (maybeShare(Object.assign(current(), patch))) return;
        applyState(patch);
      }
    }).catch(function () {});
  }

  function boot() {
    if (!root.trianglify) {
      say('Trianglify did not load.', true);
      return;
    }
    fillSizes();
    loadPalettes();
    bind();
    paint();
    loadSave().then(function () {
      loadLaunch();
    });
    if (api && api.onBack) {
      api.onBack(function () {
        if (root.TFMp && root.TFMp.busy && root.TFMp.busy()) {
          root.TFMp.leave();
          return true;
        }
        return false;
      });
    }
  }

  root.TFApp = {
    applyState: applyState,
    persist: persist,
    current: current,
    paint: paint
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
