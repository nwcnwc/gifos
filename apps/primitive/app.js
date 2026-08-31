/*
 * Primitive chrome around ondras/primitive.js.
 * Last ORIGINAL picture + reconstruction + settings are private
 * (the file is the save). Take photo is a clip, never a live camera.
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var SHAPE_IDS = ['triangle', 'rectangle', 'ellipse', 'smiley'];
  var SHAPE_NAMES = { triangle: 'Triangles', rectangle: 'Rectangles', ellipse: 'Ellipses', smiley: 'Smileys' };
  var PRESETS = [
    { id: 'quick', name: 'Quick', steps: 20, shapes: 80, mutations: 15, computeSize: 128, viewSize: 400 },
    { id: 'classic', name: 'Classic', steps: 50, shapes: 200, mutations: 30, computeSize: 256, viewSize: 512 },
    { id: 'fine', name: 'Fine', steps: 200, shapes: 400, mutations: 50, computeSize: 256, viewSize: 512 }
  ];
  var DEFAULTS = {
    steps: 50,
    shapes: 200,
    mutations: 30,
    alpha: 0.5,
    mutateAlpha: true,
    computeSize: 256,
    viewSize: 512,
    shapeTypes: ['triangle'],
    fill: 'auto',
    fillColor: '#ffffff'
  };
  var MAX_EDGE = 800;
  var SRC_CAP = 900000;
  var SVG_CAP = 400000;

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var picDb = null;
  var timer = 0;
  var srcDataUrl = null;
  var srcImg = null;
  var loaded = false;
  var comparing = false;
  var running = false;
  var optimizer = null;
  var resultCanvas = null;
  var svgNode = null;
  var lastDistance = 1;
  var accepted = 0;
  var viewMode = 'raster';
  var settings = {
    steps: DEFAULTS.steps,
    shapes: DEFAULTS.shapes,
    mutations: DEFAULTS.mutations,
    alpha: DEFAULTS.alpha,
    mutateAlpha: DEFAULTS.mutateAlpha,
    computeSize: DEFAULTS.computeSize,
    viewSize: DEFAULTS.viewSize,
    shapeTypes: DEFAULTS.shapeTypes.slice(),
    fill: DEFAULTS.fill,
    fillColor: DEFAULTS.fillColor
  };

  try {
    if (root.gifos && root.gifos.db) {
      saveDb = root.gifos.db('save');
      picDb = root.gifos.db('pic');
    }
  } catch (e) {}

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

  function clampInt(n, lo, hi) {
    return clamp(n | 0, lo, hi);
  }

  function downscaleNeed(w, h, max) {
    max = max || MAX_EDGE;
    w = w | 0; h = h | 0;
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    var scale = 1;
    if (w > max || h > max) scale = max / Math.max(w, h);
    return {
      w: Math.max(1, Math.round(w * scale)),
      h: Math.max(1, Math.round(h * scale)),
      scale: scale
    };
  }

  function pickRestoreUrl(srcRow, outRow) {
    if (srcRow && (srcRow.png || srcRow.jpg)) return srcRow.png || srcRow.jpg;
    if (outRow && (outRow.png || outRow.jpg)) return outRow.png || outRow.jpg;
    return null;
  }

  function matchingPreset(s) {
    var i, p;
    for (i = 0; i < PRESETS.length; i++) {
      p = PRESETS[i];
      if (p.steps === s.steps && p.shapes === s.shapes && p.mutations === s.mutations &&
          p.computeSize === s.computeSize && p.viewSize === s.viewSize) {
        return p.id;
      }
    }
    return null;
  }

  function shapeCtors(ids) {
    var P = root.Primitive;
    var map = {
      triangle: P && P.Triangle,
      rectangle: P && P.Rectangle,
      ellipse: P && P.Ellipse,
      smiley: P && P.Smiley
    };
    var out = [];
    var i, ctor;
    ids = ids || [];
    for (i = 0; i < ids.length; i++) {
      ctor = map[ids[i]];
      if (ctor) out.push(ctor);
    }
    if (!out.length && map.triangle) out.push(map.triangle);
    return out;
  }

  function cfgFromSettings(s) {
    return {
      steps: clampInt(s.steps, 1, 500),
      shapes: clampInt(s.shapes, 1, 1000),
      mutations: clampInt(s.mutations, 0, 100),
      alpha: clamp(s.alpha, 0, 1),
      mutateAlpha: !!s.mutateAlpha,
      computeSize: clampInt(s.computeSize, 128, 512),
      viewSize: clampInt(s.viewSize, 256, 2048),
      fill: s.fill === 'fixed' ? (s.fillColor || '#ffffff') : 'auto',
      shapeTypes: shapeCtors(s.shapeTypes),
      width: 0,
      height: 0,
      scale: 1
    };
  }

  function percentSimilar(distance) {
    var p = 100 * (1 - distance);
    if (!(p >= 0)) p = 0;
    if (p > 100) p = 100;
    return p.toFixed(2);
  }

  function demoImage() {
    var c = root.document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    var g = c.getContext('2d');
    var w = 256, h = 256, r = w / 7;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff0000';
    g.beginPath(); g.arc(w / 4, h / 2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#00ff00';
    g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0000ff';
    g.beginPath(); g.arc(w * 3 / 4, h / 2, r, 0, Math.PI * 2); g.fill();
    return c.toDataURL('image/png');
  }

  function persist() {
    if (!saveDb && !picDb) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (saveDb) {
      saveDb.put({
        id: 'state',
        steps: settings.steps,
        shapes: settings.shapes,
        mutations: settings.mutations,
        alpha: settings.alpha,
        mutateAlpha: settings.mutateAlpha,
        computeSize: settings.computeSize,
        viewSize: settings.viewSize,
        shapeTypes: settings.shapeTypes.slice(),
        fill: settings.fill,
        fillColor: settings.fillColor,
        viewMode: viewMode,
        at: Date.now()
      }).catch(function () {});
    }
    if (picDb && srcDataUrl && srcDataUrl.length < SRC_CAP) {
      picDb.put({ id: 'src', png: srcDataUrl, at: Date.now() }).catch(function () {});
    }
  }

  function persistOut() {
    if (!picDb || !resultCanvas || !resultCanvas.node) return;
    var png;
    try {
      png = resultCanvas.node.toDataURL('image/png');
      if (png.length > 800000) png = resultCanvas.node.toDataURL('image/jpeg', 0.88);
    } catch (e) { return; }
    var rec = { id: 'out', png: png, steps: accepted, similar: lastDistance, at: Date.now() };
    if (svgNode) {
      try {
        var svg = new XMLSerializer().serializeToString(svgNode);
        if (svg.length < SVG_CAP) rec.svg = svg;
      } catch (e) {}
    }
    picDb.put(rec).catch(function () {});
  }

  function showWork(on) {
    var empty = $('empty');
    var work = $('work');
    if (empty) empty.hidden = !!on;
    if (work) work.hidden = !on;
    syncView();
  }

  function syncView() {
    var out = $('out');
    var orig = $('orig');
    var vector = $('vector');
    var hint = $('holdhint');
    var prog = $('progress');
    if (!loaded) {
      if (out) out.hidden = true;
      if (orig) orig.hidden = true;
      if (vector) vector.hidden = true;
      if (hint) hint.hidden = true;
      if (prog) prog.hidden = true;
      return;
    }
    if (comparing) {
      if (out) out.hidden = true;
      if (vector) vector.hidden = true;
      if (orig) orig.hidden = false;
      if (hint) { hint.hidden = false; hint.textContent = 'Original'; }
      if (prog) prog.hidden = true;
      return;
    }
    var hasResult = !!(resultCanvas && resultCanvas.node && resultCanvas.node.width);
    if (viewMode === 'vector' && svgNode && hasResult) {
      if (out) out.hidden = true;
      if (vector) vector.hidden = false;
      if (orig) orig.hidden = true;
    } else if (hasResult) {
      if (out) out.hidden = false;
      if (vector) vector.hidden = true;
      if (orig) orig.hidden = true;
    } else {
      if (out) out.hidden = true;
      if (vector) vector.hidden = true;
      if (orig) orig.hidden = false;
    }
    if (hint) {
      hint.hidden = !hasResult;
      hint.textContent = 'Hold to see the original';
    }
    if (prog) prog.hidden = !running;
  }

  function paintOriginal() {
    var c = $('orig');
    if (!c || !srcImg) return;
    var w = srcImg.naturalWidth || srcImg.width;
    var h = srcImg.naturalHeight || srcImg.height;
    if (!w || !h) return;
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(srcImg, 0, 0);
  }

  function setComparing(on) {
    if (!loaded) return;
    comparing = !!on;
    syncView();
  }

  function readControls() {
    settings.steps = clampInt($('steps') && $('steps').value, 1, 500);
    settings.alpha = clamp($('alpha') && $('alpha').value, 0, 1);
    settings.mutateAlpha = !!( $('mutateAlpha') && $('mutateAlpha').checked );
    settings.computeSize = clampInt($('computeSize') && $('computeSize').value, 128, 512);
    settings.viewSize = clampInt($('viewSize') && $('viewSize').value, 256, 2048);
    settings.shapes = clampInt($('shapes') && $('shapes').value, 1, 1000);
    settings.mutations = clampInt($('mutations') && $('mutations').value, 0, 100);
    var fillAuto = root.document.querySelector('input[name=fill][value=auto]');
    settings.fill = (fillAuto && fillAuto.checked) ? 'auto' : 'fixed';
    settings.fillColor = ($('fillColor') && $('fillColor').value) || '#ffffff';
    writeLabels();
    paintPresetOn();
    persist();
  }

  function writeControls() {
    function set(id, v) { if ($(id)) $(id).value = String(v); }
    set('steps', settings.steps);
    set('alpha', settings.alpha);
    if ($('mutateAlpha')) $('mutateAlpha').checked = !!settings.mutateAlpha;
    set('computeSize', settings.computeSize);
    set('viewSize', settings.viewSize);
    set('shapes', settings.shapes);
    set('mutations', settings.mutations);
    set('fillColor', settings.fillColor);
    var auto = root.document.querySelector('input[name=fill][value=auto]');
    var fixed = root.document.querySelector('input[name=fill][value=fixed]');
    if (auto && fixed) {
      auto.checked = settings.fill !== 'fixed';
      fixed.checked = settings.fill === 'fixed';
    }
    var raster = root.document.querySelector('input[name=type][value=raster]');
    var vector = root.document.querySelector('input[name=type][value=vector]');
    if (raster && vector) {
      raster.checked = viewMode !== 'vector';
      vector.checked = viewMode === 'vector';
    }
    writeLabels();
    paintPresetOn();
    paintShapeChips();
  }

  function writeLabels() {
    if ($('stepsVal')) $('stepsVal').textContent = String(settings.steps);
    if ($('alphaVal')) $('alphaVal').textContent = String(settings.alpha);
    if ($('computeVal')) $('computeVal').textContent = String(settings.computeSize);
    if ($('viewVal')) $('viewVal').textContent = String(settings.viewSize);
    if ($('shapesVal')) $('shapesVal').textContent = String(settings.shapes);
    if ($('mutVal')) $('mutVal').textContent = String(settings.mutations);
  }

  function paintPresetOn() {
    var id = matchingPreset(settings);
    var host = $('presets');
    if (!host) return;
    var chips = host.querySelectorAll('.chip');
    var i;
    for (i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === id);
    }
  }

  function paintPresets() {
    var host = $('presets');
    if (!host) return;
    host.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('data-id', p.id);
      b.textContent = p.name;
      b.addEventListener('click', function () {
        if (running) return;
        settings.steps = p.steps;
        settings.shapes = p.shapes;
        settings.mutations = p.mutations;
        settings.computeSize = p.computeSize;
        settings.viewSize = p.viewSize;
        writeControls();
        persist();
      });
      host.appendChild(b);
    });
    paintPresetOn();
  }

  function paintShapeChips() {
    var host = $('shaperow');
    if (!host) return;
    host.innerHTML = '';
    SHAPE_IDS.forEach(function (id) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (settings.shapeTypes.indexOf(id) >= 0 ? ' on' : '');
      b.textContent = SHAPE_NAMES[id];
      b.addEventListener('click', function () {
        if (running) return;
        var i = settings.shapeTypes.indexOf(id);
        if (i >= 0) {
          if (settings.shapeTypes.length === 1) return;
          settings.shapeTypes.splice(i, 1);
        } else {
          settings.shapeTypes.push(id);
        }
        paintShapeChips();
        persist();
      });
      host.appendChild(b);
    });
  }

  function setRunning(on) {
    running = !!on;
    var btn = $('startBtn');
    if (btn) {
      btn.textContent = running ? 'Stop' : 'Start';
      btn.classList.toggle('stop', running);
    }
    var ids = ['photoBtn', 'chooseBtn', 'pngBtn', 'svgBtn', 'emptyPhoto', 'emptyChoose', 'sampleBtn'];
    var i, el;
    for (i = 0; i < ids.length; i++) {
      el = $(ids[i]);
      if (el) el.disabled = running;
    }
    syncView();
  }

  function stopRun() {
    if (optimizer && typeof optimizer.stop === 'function') optimizer.stop();
  }

  function mountResult(cfg) {
    var P = root.Primitive;
    var out = $('out');
    var vector = $('vector');
    var cfg2 = {
      width: cfg.scale * cfg.width,
      height: cfg.scale * cfg.height,
      fill: cfg.fill
    };
    resultCanvas = P.Canvas.empty(cfg2, false);
    resultCanvas.ctx.scale(cfg.scale, cfg.scale);
    if (out) {
      if (out.parentNode && resultCanvas.node !== out) {
        resultCanvas.node.id = 'out';
        out.parentNode.replaceChild(resultCanvas.node, out);
      }
    }
    svgNode = P.Canvas.empty(cfg, true);
    svgNode.setAttribute('width', cfg2.width);
    svgNode.setAttribute('height', cfg2.height);
    if (vector) {
      vector.innerHTML = '';
      vector.appendChild(svgNode);
    }
  }

  function restoreOut(row) {
    if (!row || !row.png) return;
    var img = new Image();
    img.onload = function () {
      var c = $('out');
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resultCanvas = { node: c, ctx: c.getContext('2d') };
      if (row.svg && $('vector')) {
        $('vector').innerHTML = row.svg;
        svgNode = $('vector').querySelector('svg');
      }
      accepted = row.steps | 0;
      lastDistance = row.similar != null ? row.similar : 1;
      var prog = $('progress');
      if (prog && accepted) {
        prog.hidden = false;
        prog.textContent = accepted + ' shapes · ' + percentSimilar(lastDistance) + '% similar';
        setTimeout(function () { if (!running && prog) prog.hidden = true; }, 2400);
      }
      syncView();
      say('Last reconstruction is still here.');
    };
    img.src = row.png;
  }

  function startRun() {
    var P = root.Primitive;
    if (running) { stopRun(); return; }
    if (!P || !P.Canvas || !P.Optimizer) {
      say('Primitive engine did not load.', true);
      return;
    }
    if (!srcImg) {
      say('Open a picture first.', true);
      return;
    }
    var cfg = cfgFromSettings(settings);
    var original;
    try {
      original = P.Canvas.fromImage(srcImg, cfg);
    } catch (e) {
      say((e && e.message) || 'Could not read that picture.', true);
      return;
    }
    accepted = 0;
    lastDistance = 1;
    mountResult(cfg);
    optimizer = new P.Optimizer(original, cfg);
    setRunning(true);
    say('Adding shapes… this can take a while.');
    var prog = $('progress');
    optimizer.onStep = function (step) {
      if (step) {
        resultCanvas.drawStep(step);
        if (svgNode) svgNode.appendChild(step.toSVG());
        accepted++;
        lastDistance = step.distance;
      }
      if (prog) {
        prog.hidden = false;
        prog.textContent = optimizer._steps + ' of ' + cfg.steps + ' · ' + percentSimilar(lastDistance) + '% similar';
      }
      if (accepted && accepted % 10 === 0) persistOut();
    };
    optimizer.onDone = function (info) {
      setRunning(false);
      persistOut();
      persist();
      var n = (info && info.steps) || optimizer._steps;
      if (info && info.stopped) say('Stopped at ' + n + ' · ' + percentSimilar(lastDistance) + '% similar.');
      else say(n + ' shapes · ' + percentSimilar(lastDistance) + '% similar.');
      if (prog) {
        prog.hidden = false;
        prog.textContent = accepted + ' shapes · ' + percentSimilar(lastDistance) + '% similar';
      }
      syncView();
    };
    optimizer.start();
    syncView();
  }

  function encodeSrcFromImage(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var need = downscaleNeed(w, h, MAX_EDGE);
    var c = root.document.createElement('canvas');
    c.width = need.w;
    c.height = need.h;
    c.getContext('2d').drawImage(img, 0, 0, need.w, need.h);
    var data = c.toDataURL('image/png');
    if (data.length > 800000) data = c.toDataURL('image/jpeg', 0.85);
    return data;
  }

  function loadFromUrl(url, alreadySrc) {
    var img = new Image();
    img.onload = function () {
      if (!alreadySrc) {
        srcDataUrl = encodeSrcFromImage(img);
        if (srcDataUrl && srcDataUrl !== url) {
          alreadySrc = true;
          img.src = srcDataUrl;
          return;
        }
      } else {
        srcDataUrl = url;
      }
      srcImg = img;
      loaded = true;
      resultCanvas = null;
      svgNode = null;
      accepted = 0;
      var vector = $('vector');
      if (vector) vector.innerHTML = '';
      var out = $('out');
      if (out) { out.width = 0; out.height = 0; }
      paintOriginal();
      showWork(true);
      persist();
      say('Press Start to redraw.');
    };
    img.onerror = function () { say('Could not open that picture.', true); };
    img.src = url;
  }

  function loadBlob(blob) {
    loadFromUrl(URL.createObjectURL(blob), false);
  }

  function loadFile(file) {
    if (!file) return;
    loadBlob(file);
  }

  function takePhoto() {
    if (running) return;
    var api = root.gifos;
    if (!api || typeof api.takePhoto !== 'function') {
      say('Open this inside GifOS to take a photo.', true);
      return;
    }
    say('Take a still…');
    api.takePhoto({ facing: 'environment' }).then(function (clip) {
      var blob = new Blob([clip.bytes], { type: clip.mime || 'image/jpeg' });
      loadBlob(blob);
    }).catch(function (e) {
      var m = (e && e.message) || String(e);
      if (/cancel/i.test(m)) say('Photo cancelled.');
      else say(m, true);
    });
  }

  function downloadPng() {
    var node = resultCanvas && resultCanvas.node;
    if (!node || !node.width) { say('Redraw first.', true); return; }
    try {
      node.toBlob(function (blob) {
        if (!blob) return;
        var a = root.document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'primitive.png';
        a.click();
      }, 'image/png');
    } catch (e) { say('Could not download.', true); }
  }

  function downloadSvg() {
    if (!svgNode) { say('Redraw first.', true); return; }
    try {
      var text = new XMLSerializer().serializeToString(svgNode);
      var blob = new Blob([text], { type: 'image/svg+xml' });
      var a = root.document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'primitive.svg';
      a.click();
    } catch (e) { say('Could not download.', true); }
  }

  function applySettings(row) {
    if (!row) return;
    if (row.steps != null) settings.steps = clampInt(row.steps, 1, 500);
    if (row.shapes != null) settings.shapes = clampInt(row.shapes, 1, 1000);
    if (row.mutations != null) settings.mutations = clampInt(row.mutations, 0, 100);
    if (row.alpha != null) settings.alpha = clamp(row.alpha, 0, 1);
    if (typeof row.mutateAlpha === 'boolean') settings.mutateAlpha = row.mutateAlpha;
    if (row.computeSize != null) settings.computeSize = clampInt(row.computeSize, 128, 512);
    if (row.viewSize != null) settings.viewSize = clampInt(row.viewSize, 256, 2048);
    if (row.fill === 'auto' || row.fill === 'fixed') settings.fill = row.fill;
    if (row.fillColor) settings.fillColor = row.fillColor;
    if (row.viewMode === 'raster' || row.viewMode === 'vector') viewMode = row.viewMode;
    if (row.shapeTypes && row.shapeTypes.length) {
      settings.shapeTypes = row.shapeTypes.filter(function (id) {
        return SHAPE_IDS.indexOf(id) >= 0;
      });
      if (!settings.shapeTypes.length) settings.shapeTypes = ['triangle'];
    }
  }

  function bindStageHold() {
    var stage = $('stage');
    if (!stage) return;
    function down(e) {
      if (!loaded || running) return;
      if (e.target && e.target.closest && e.target.closest('#empty')) return;
      setComparing(true);
    }
    function up() { setComparing(false); }
    stage.addEventListener('pointerdown', down);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
  }

  function boot() {
    if (!root.Primitive || !root.Primitive.Optimizer) {
      say('Primitive engine did not load.', true);
      return;
    }
    paintPresets();
    paintShapeChips();
    writeControls();
    showWork(false);

    var fileEl = $('file');
    function pickFile() { if (fileEl) fileEl.click(); }
    $('chooseBtn') && $('chooseBtn').addEventListener('click', pickFile);
    $('emptyChoose') && $('emptyChoose').addEventListener('click', pickFile);
    $('emptyPhoto') && $('emptyPhoto').addEventListener('click', takePhoto);
    $('photoBtn') && $('photoBtn').addEventListener('click', takePhoto);
    $('sampleBtn') && $('sampleBtn').addEventListener('click', function () {
      loadFromUrl(demoImage(), true);
    });
    $('startBtn') && $('startBtn').addEventListener('click', startRun);
    $('pngBtn') && $('pngBtn').addEventListener('click', downloadPng);
    $('svgBtn') && $('svgBtn').addEventListener('click', downloadSvg);

    var stage = $('stage');
    stage.addEventListener('dragover', function (e) { e.preventDefault(); stage.classList.add('over'); });
    stage.addEventListener('dragleave', function () { stage.classList.remove('over'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      stage.classList.remove('over');
      if (running) return;
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (f) loadFile(f);
    });

    ['steps', 'alpha', 'computeSize', 'viewSize', 'shapes', 'mutations'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', readControls);
    });
    $('mutateAlpha') && $('mutateAlpha').addEventListener('change', readControls);
    $('fillColor') && $('fillColor').addEventListener('input', readControls);
    var fills = root.document.querySelectorAll('input[name=fill]');
    var i;
    for (i = 0; i < fills.length; i++) fills[i].addEventListener('change', readControls);
    var types = root.document.querySelectorAll('input[name=type]');
    for (i = 0; i < types.length; i++) {
      types[i].addEventListener('change', function (e) {
        viewMode = e.target.value === 'vector' ? 'vector' : 'raster';
        syncView();
        persist();
      });
    }
    bindStageHold();

    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (comparing) { setComparing(false); return true; }
        if (running) { stopRun(); return true; }
        return false;
      });
    }

    var ready = Promise.resolve();
    if (saveDb) {
      ready = saveDb.get('state').then(function (row) {
        applySettings(row);
        writeControls();
      }).catch(function () {});
    }
    ready.then(function () {
      if (!picDb) return null;
      return picDb.get('src').then(function (srcRow) {
        return picDb.get('out').then(function (outRow) {
          return { src: pickRestoreUrl(srcRow, outRow), out: outRow };
        });
      }).catch(function () { return null; });
    }).then(function (pack) {
      if (pack && pack.src) {
        var img = new Image();
        img.onload = function () {
          srcDataUrl = pack.src;
          srcImg = img;
          loaded = true;
          paintOriginal();
          showWork(true);
          if (pack.out && pack.out.png) restoreOut(pack.out);
          else say('Press Start to redraw.');
        };
        img.onerror = function () { showWork(false); };
        img.src = pack.src;
      } else {
        showWork(false);
      }
    });
  }

  root.PrimitiveApp = {
    PRESETS: PRESETS,
    DEFAULTS: DEFAULTS,
    SHAPE_IDS: SHAPE_IDS,
    MAX_EDGE: MAX_EDGE,
    clamp: clamp,
    clampInt: clampInt,
    downscaleNeed: downscaleNeed,
    pickRestoreUrl: pickRestoreUrl,
    matchingPreset: matchingPreset,
    cfgFromSettings: cfgFromSettings,
    percentSimilar: percentSimilar,
    demoImage: demoImage,
    shapeCtors: shapeCtors
  };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
