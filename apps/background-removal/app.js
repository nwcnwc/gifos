/*
 * Background Removal — screen, persistence, camera clip, download.
 * The cut itself is engine.js. Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var MODELS = root.BR_MODELS;
  var E = root.BREngine;
  var $ = function (id) { return document.getElementById(id); };
  var SRC_CAP = 900000;
  var MAX_EDGE = 4096;

  var BG = [
    { id: 'transparent', label: 'Transparent', swatch: 'checker' },
    { id: 'white', label: 'White', color: '#ffffff' },
    { id: 'black', label: 'Black', color: '#111111' },
    { id: 'studio', label: 'Studio', color: '#e8e4dc' },
    { id: 'green', label: 'Green', color: '#00c27a' },
    { id: 'blue', label: 'Blue', color: '#2f6bff' },
    { id: 'custom', label: 'Custom', color: null },
    { id: 'image', label: 'Picture', swatch: 'pic' }
  ];

  var S = {
    model: 'medium',
    bg: 'transparent',
    color: '#00c27a',
    feather: 0,
    shadow: true,
    invert: false,
    gpu: false,
    ep: 'wasm',
    cpuOnly: false,
    running: false,
    comparing: false,
    fileName: 'photo',
    srcUrl: null,
    srcData: null,
    cut: null,
    outCanvas: null,
    bgImage: null,
    engine: null
  };

  var saveDb = null, picDb = null, persistTimer = 0, urls = [];

  function say(msg, kind) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = kind || '';
  }

  function revoke() {
    urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    urls = [];
  }

  function showWork(on) {
    $('empty').hidden = !!on;
    $('view').hidden = !on;
    $('holdhint').hidden = !on;
    $('work').hidden = !on;
  }

  function paintView(canvas) {
    var view = $('view');
    if (!canvas) return;
    view.width = canvas.width;
    view.height = canvas.height;
    view.getContext('2d').drawImage(canvas, 0, 0);
    S.outCanvas = canvas;
  }

  function origCanvas() {
    if (!S.srcData) return null;
    var c = document.createElement('canvas');
    c.width = S.srcData.width;
    c.height = S.srcData.height;
    c.getContext('2d').putImageData(S.srcData, 0, 0);
    return c;
  }

  function setComparing(on) {
    if (!S.cut) return;
    S.comparing = !!on;
    if (on) paintView(origCanvas());
    else if (S.outCanvas) paintView(S.outCanvas);
  }

  function paintModels() {
    var host = $('modellist');
    host.textContent = '';
    Object.keys(MODELS).forEach(function (id) {
      var m = MODELS[id];
      var lab = document.createElement('label');
      lab.className = 'job' + (S.model === id ? ' on' : '');
      var r = document.createElement('input');
      r.type = 'radio'; r.name = 'model'; r.value = id; r.checked = S.model === id;
      r.setAttribute('aria-label', m.label);
      r.onchange = function () {
        S.model = id;
        savePrefs();
        paintModels();
        if (S.srcData) runCut();
      };
      var box = document.createElement('div');
      var t = document.createElement('div'); t.className = 't'; t.textContent = m.label;
      var d = document.createElement('div'); d.className = 'd'; d.textContent = m.detail;
      box.appendChild(t); box.appendChild(d);
      lab.appendChild(r); lab.appendChild(box);
      host.appendChild(lab);
    });
  }

  function paintChips() {
    var host = $('bgchips');
    host.textContent = '';
    BG.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (S.bg === b.id ? ' on' : '');
      btn.setAttribute('aria-label', b.label);
      var sw = document.createElement('i');
      if (b.swatch === 'checker') sw.className = 'ck';
      else if (b.swatch === 'pic') sw.className = 'pic';
      else sw.style.background = b.color || S.color;
      btn.appendChild(sw);
      var n = document.createElement('span');
      n.textContent = b.label;
      btn.appendChild(n);
      btn.addEventListener('click', function () {
        if (b.id === 'image') {
          $('bgfile').click();
          return;
        }
        S.bg = b.id;
        if (b.color) S.color = b.color;
        savePrefs();
        paintChips();
        recomposite();
      });
      host.appendChild(btn);
    });
  }

  function bgOpts() {
    var color = S.bg === 'white' ? '#ffffff'
      : S.bg === 'black' ? '#111111'
      : S.bg === 'studio' ? '#e8e4dc'
      : S.bg === 'green' ? '#00c27a'
      : S.bg === 'blue' ? '#2f6bff'
      : S.color;
    var kind = S.bg === 'transparent' ? 'transparent'
      : S.bg === 'image' ? 'image'
      : 'color';
    return {
      bg: kind,
      color: color,
      bgImage: S.bgImage,
      feather: S.feather,
      shadow: S.shadow && kind !== 'transparent',
      invert: S.invert
    };
  }

  function recomposite() {
    if (!S.cut) return;
    paintView(E.composite(S.cut, bgOpts()));
    persistOut();
  }

  function downscaleIfNeeded(data) {
    var w = data.width, h = data.height;
    if (w <= MAX_EDGE && h <= MAX_EDGE) return data;
    var scale = MAX_EDGE / Math.max(w, h);
    var nw = Math.max(1, Math.round(w * scale));
    var nh = Math.max(1, Math.round(h * scale));
    var resized = E.resizeBilinear(data.data, w, h, 4, nw, nh);
    return new ImageData(new Uint8ClampedArray(resized), nw, nh);
  }

  function setProgress(frac, text) {
    $('progwrap').hidden = false;
    $('bar').style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
    $('progtext').textContent = text || '';
  }
  function hideProgress() { $('progwrap').hidden = true; }

  async function ensureEngine() {
    if (S.engine) return S.engine;
    E.initOrt();
    S.engine = new E.Engine();
    return S.engine;
  }

  async function modelBytes(id) {
    var m = MODELS[id];
    if (!(root.gifos && root.gifos.assets)) {
      throw new Error('Open this inside GifOS so it can fetch the model (about '
        + Math.round(m.bytes / 1e6) + ' MB, one time).');
    }
    var buf = await root.gifos.assets(m.asset);
    return new Uint8Array(buf);
  }

  async function runCut() {
    if (!S.srcData || S.running) return;
    S.running = true;
    S.cut = null;
    var m = MODELS[S.model];
    $('savePng').disabled = true;
    $('saveJpg').disabled = true;
    setProgress(0.05, 'Loading ' + m.label + '… the first time this downloads '
      + Math.round(m.bytes / 1e6) + ' MB.');
    say('');
    var t0 = Date.now();
    try {
      var eng = await ensureEngine();
      setProgress(0.15, 'Loading ' + m.label + ' onto '
        + (S.gpu ? 'the graphics chip' : 'the processor') + '…');
      var bytes = await modelBytes(S.model);
      setProgress(0.45, 'Building the session…');
      var session = await eng.sessionFor(S.model, bytes, S.gpu && !S.cpuOnly);
      S.ep = eng.ep;
      S.gpu = eng.gpu;
      setProgress(0.6, 'Cutting…');
      S.cut = await eng.cut(S.srcData, session);
      persistMask();
      setProgress(1, 'Done');
      recomposite();
      hideProgress();
      var sec = ((Date.now() - t0) / 1000).toFixed(1);
      var where = S.ep === 'webgpu' ? 'your graphics chip' : 'the processor';
      say('Cut in ' + sec + 's on ' + where + ' · ' + S.srcData.width + '×' + S.srcData.height + '.');
    } catch (e) {
      hideProgress();
      var msg = String((e && e.message) || e);
      say(msg, 'err');
    } finally {
      S.running = false;
      $('savePng').disabled = !S.cut;
      $('saveJpg').disabled = !S.cut;
    }
  }

  function adoptSrc(data, name) {
    S.srcData = downscaleIfNeeded(data);
    S.fileName = (name || 'photo').replace(/\.[^.]+$/, '');
    S.cut = null;
    showWork(true);
    paintView(origCanvas());
    persistSrc();
  }

  function loadImageData(data, name) {
    adoptSrc(data, name);
    runCut();
  }

  function maskFromPng(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var g = c.getContext('2d'); g.drawImage(img, 0, 0);
        var d = g.getImageData(0, 0, c.width, c.height);
        var mask = new Uint8Array(c.width * c.height);
        for (var i = 0; i < mask.length; i++) mask[i] = d.data[i * 4];
        resolve({ width: c.width, height: c.height, mask: mask });
      };
      img.onerror = function () { reject(new Error('mask')); };
      img.src = url;
    });
  }

  function persistMask() {
    if (!picDb || !S.cut) return;
    var w = S.cut.width, h = S.cut.height;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var img = c.getContext('2d').createImageData(w, h);
    for (var i = 0; i < w * h; i++) {
      var a = S.cut.mask[i];
      img.data[i * 4] = a; img.data[i * 4 + 1] = a; img.data[i * 4 + 2] = a; img.data[i * 4 + 3] = 255;
    }
    c.getContext('2d').putImageData(img, 0, 0);
    var url = c.toDataURL('image/png');
    if (url.length < SRC_CAP * 2) picDb.put({ id: 'mask', png: url, w: w, h: h, at: Date.now() }).catch(function () {});
  }

  function loadBlob(blob, name) {
    say('Opening…');
    E.decodeImage(blob).then(function (data) {
      loadImageData(data, name || (blob.name || 'photo'));
    }).catch(function (e) {
      say(String((e && e.message) || 'Could not open that picture.'), 'err');
    });
  }

  function loadFile(file) {
    if (!file) return;
    loadBlob(file, file.name);
  }

  function takePhoto() {
    var api = root.gifos;
    if (!api || typeof api.takePhoto !== 'function') {
      say('Open this inside GifOS to take a photo.', 'err');
      return;
    }
    say('Take a still…');
    api.takePhoto({ facing: 'environment' }).then(function (clip) {
      var blob = new Blob([clip.bytes], { type: clip.mime || 'image/jpeg' });
      loadBlob(blob, 'photo');
    }).catch(function (e) {
      var m = (e && e.message) || String(e);
      if (/cancel/i.test(m)) say('Photo cancelled.');
      else say(m, 'err');
    });
  }

  function sampleImage() {
    var c = document.createElement('canvas');
    c.width = 720; c.height = 960;
    var g = c.getContext('2d');
    var y, t;
    for (y = 0; y < 960; y++) {
      t = y / 960;
      g.fillStyle = 'rgb(' + (210 + t * 20) + ',' + (90 - t * 30) + ',' + (70 + t * 40) + ')';
      g.fillRect(0, y, 720, 1);
    }
    g.fillStyle = '#f3d7b5';
    g.beginPath(); g.ellipse(360, 340, 118, 150, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2418';
    g.beginPath(); g.ellipse(360, 250, 128, 90, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#3a2418';
    g.beginPath(); g.ellipse(250, 340, 28, 70, 0.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(470, 340, 28, 70, -0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2c1a12';
    g.beginPath(); g.arc(322, 330, 12, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(398, 330, 12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c47a6a'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.arc(360, 390, 28, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = '#f3d7b5';
    g.fillRect(330, 470, 60, 50);
    g.fillStyle = '#2457d6';
    g.beginPath();
    g.moveTo(140, 960); g.lineTo(200, 520); g.lineTo(520, 520); g.lineTo(580, 960);
    g.closePath(); g.fill();
    g.fillStyle = '#f3d7b5';
    g.beginPath(); g.ellipse(200, 640, 28, 90, 0.15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(520, 640, 28, 90, -0.15, 0, Math.PI * 2); g.fill();
    return c;
  }

  function download(mime) {
    if (!S.outCanvas) return;
    var name = S.fileName + (S.invert ? '-background' : '-cut')
      + (mime === 'image/jpeg' ? '.jpg' : '.png');
    var quality = mime === 'image/jpeg' ? 0.92 : undefined;
    var canvas = S.outCanvas;
    if (mime === 'image/jpeg' && S.bg === 'transparent') {
      var c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(canvas, 0, 0);
      canvas = c;
    }
    E.encodeCanvas(canvas, mime, quality).then(function (blob) {
      var url = URL.createObjectURL(blob);
      urls.push(url);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      say('Saved ' + name + '.');
    }).catch(function (e) { say(String((e && e.message) || e), 'err'); });
  }

  function savePrefs() {
    if (!saveDb) return;
    saveDb.put({
      id: 'prefs',
      model: S.model, bg: S.bg, color: S.color,
      feather: S.feather, shadow: S.shadow, invert: S.invert,
      cpuOnly: S.cpuOnly
    }).catch(function () {});
  }

  function persistSrc() {
    if (!picDb || !S.srcData) return;
    var c = origCanvas();
    var url = c.toDataURL('image/jpeg', 0.72);
    if (url.length < SRC_CAP) picDb.put({ id: 'src', png: url, name: S.fileName, at: Date.now() }).catch(function () {});
  }

  function persistOut() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      persistTimer = 0;
      if (!picDb || !S.outCanvas) return;
      var url = S.outCanvas.toDataURL('image/png');
      if (url.length < SRC_CAP) picDb.put({ id: 'out', png: url, at: Date.now() }).catch(function () {});
    }, 400);
  }

  function applyPrefs(row) {
    if (!row) return;
    if (MODELS[row.model]) S.model = row.model;
    if (row.bg) S.bg = row.bg;
    if (row.color) S.color = row.color;
    if (row.feather != null) S.feather = row.feather | 0;
    if (typeof row.shadow === 'boolean') S.shadow = row.shadow;
    if (typeof row.invert === 'boolean') S.invert = row.invert;
    S.cpuOnly = !!row.cpuOnly;
  }

  function bind() {
    function pick() { $('file').click(); }
    $('emptyChoose').addEventListener('click', pick);
    $('chooseBtn').addEventListener('click', pick);
    $('emptyPhoto').addEventListener('click', takePhoto);
    $('photoBtn').addEventListener('click', takePhoto);
    $('sampleBtn').addEventListener('click', function () {
      var c = sampleImage();
      loadImageData(c.getContext('2d').getImageData(0, 0, c.width, c.height), 'sample');
    });
    $('file').addEventListener('change', function () {
      var f = $('file').files && $('file').files[0];
      if (f) loadFile(f);
    });
    $('bgfile').addEventListener('change', function () {
      var f = $('bgfile').files && $('bgfile').files[0];
      if (!f) return;
      E.decodeImage(f).then(function (data) {
        var c = document.createElement('canvas');
        c.width = data.width; c.height = data.height;
        c.getContext('2d').putImageData(data, 0, 0);
        S.bgImage = c;
        S.bg = 'image';
        savePrefs();
        paintChips();
        recomposite();
      }).catch(function (e) { say(String((e && e.message) || e), 'err'); });
    });
    $('savePng').addEventListener('click', function () { download('image/png'); });
    $('saveJpg').addEventListener('click', function () { download('image/jpeg'); });
    $('feather').addEventListener('input', function () {
      S.feather = $('feather').value | 0;
      $('feathervalue').textContent = String(S.feather);
      savePrefs();
      recomposite();
    });
    $('shadow').addEventListener('change', function () {
      S.shadow = !!$('shadow').checked; savePrefs(); recomposite();
    });
    $('invert').addEventListener('change', function () {
      S.invert = !!$('invert').checked; savePrefs(); recomposite();
    });
    $('bgcolor').addEventListener('input', function () {
      S.color = $('bgcolor').value;
      S.bg = 'custom';
      savePrefs();
      paintChips();
      recomposite();
    });

    var stage = $('stage');
    stage.addEventListener('dragover', function (e) { e.preventDefault(); stage.classList.add('over'); });
    stage.addEventListener('dragleave', function () { stage.classList.remove('over'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      stage.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    function down(e) {
      if (!S.cut) return;
      if (e.target && e.target.closest && e.target.closest('#empty')) return;
      setComparing(true);
    }
    function up() { setComparing(false); }
    stage.addEventListener('pointerdown', down);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);

    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (S.comparing) { setComparing(false); return true; }
        if (S.running) return true;
        return false;
      });
    }
  }

  async function boot() {
    try {
      if (root.gifos && root.gifos.db) {
        saveDb = root.gifos.db('prefs');
        picDb = root.gifos.db('pic');
      }
    } catch (e) {}

    bind();
    paintModels();
    paintChips();
    showWork(false);

    if (saveDb) {
      try {
        var row = await saveDb.get('prefs');
        applyPrefs(row);
      } catch (e) {}
    }
    $('feather').value = String(S.feather);
    $('feathervalue').textContent = String(S.feather);
    $('shadow').checked = S.shadow;
    $('invert').checked = S.invert;
    $('bgcolor').value = S.color;
    paintModels();
    paintChips();

    try { E.initOrt(); } catch (e) { say(String(e.message || e), 'err'); return; }

    var ad = S.cpuOnly ? { ok: false } : await E.gpuAdapter();
    S.gpu = ad.ok;
    S.ep = S.gpu ? 'webgpu' : 'wasm';
    var line = $('engineline');
    if (S.cpuOnly) {
      line.innerHTML = 'Cuts run on <b>the processor</b>. The graphics chip failed on an earlier run, so the app has stopped using it.';
    } else if (ad.fallback) {
      line.innerHTML = 'Cuts run on <b>the processor</b>. What this device offers as a graphics chip is a software fallback, which is slower than the app’s own engine, so it is not used.';
    } else if (S.gpu) {
      line.innerHTML = 'This device has a usable <b>graphics chip</b>, so the cut runs there — the fast way.';
    } else {
      line.innerHTML = 'Cuts run on <b>the processor</b> — this device does not offer apps a graphics chip. Everything works; a large photo takes a few seconds longer.';
    }

    if (picDb) {
      try {
        var src = await picDb.get('src');
        var maskRow = await picDb.get('mask').catch(function () { return null; });
        if (src && src.png) {
          await new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
              var c = document.createElement('canvas');
              c.width = img.naturalWidth; c.height = img.naturalHeight;
              var g = c.getContext('2d'); g.drawImage(img, 0, 0);
              S.fileName = src.name || 'photo';
              adoptSrc(g.getImageData(0, 0, c.width, c.height), S.fileName);
              resolve();
            };
            img.onerror = resolve;
            img.src = src.png;
          });
          if (maskRow && maskRow.png && S.srcData) {
            try {
              var mk = await maskFromPng(maskRow.png);
              if (mk.width === S.srcData.width && mk.height === S.srcData.height) {
                S.cut = { width: mk.width, height: mk.height, rgba: S.srcData.data, mask: mk.mask };
                recomposite();
                $('savePng').disabled = false;
                $('saveJpg').disabled = false;
                say('Last cut restored from this file.');
              } else {
                runCut();
              }
            } catch (e2) { runCut(); }
          }
        }
      } catch (e) {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
