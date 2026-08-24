/*
 * JPG Glitch chrome around snorpey's glitch-canvas (no worker).
 * Last ORIGINAL picture + sliders are private (file is the save).
 * Take photo is a clip, never a live camera.
 */
(function (root) {
  'use strict';

  var DEFAULTS = { amount: 24, seed: 53, iterations: 21, quality: 46 };
  var PRESETS = [
    { id: 'mild', name: 'Mild', amount: 12, seed: 40, iterations: 8, quality: 72 },
    { id: 'classic', name: 'Classic', amount: 24, seed: 53, iterations: 21, quality: 46 },
    { id: 'heavy', name: 'Heavy', amount: 62, seed: 17, iterations: 44, quality: 28 },
    { id: 'melt', name: 'Melt', amount: 88, seed: 71, iterations: 76, quality: 16 }
  ];
  var MAX_EDGE = 800;
  var SRC_CAP = 900000;

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var picDb = null;
  var timer = 0;
  var original = null;
  var srcDataUrl = null;
  var busy = false;
  var pending = false;
  var pendingDone = null;
  var loaded = false;
  var comparing = false;
  var settings = {
    amount: DEFAULTS.amount,
    seed: DEFAULTS.seed,
    iterations: DEFAULTS.iterations,
    quality: DEFAULTS.quality
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
    n = n | 0;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
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
    if (srcRow && (srcRow.jpg || srcRow.png)) return srcRow.jpg || srcRow.png;
    if (outRow && (outRow.jpg || outRow.png)) return outRow.jpg || outRow.png;
    return null;
  }

  function matchingPreset(s) {
    var i, p;
    for (i = 0; i < PRESETS.length; i++) {
      p = PRESETS[i];
      if (p.amount === s.amount && p.seed === s.seed && p.iterations === s.iterations && p.quality === s.quality) {
        return p.id;
      }
    }
    return null;
  }

  function readSliders() {
    settings.amount = clamp(+$('amount').value, 0, 99);
    settings.seed = clamp(+$('seed').value, 0, 100);
    settings.iterations = clamp(+$('iterations').value, 0, 100);
    settings.quality = clamp(+$('quality').value, 1, 99);
    $('amountVal').textContent = String(settings.amount);
    $('seedVal').textContent = String(settings.seed);
    $('iterVal').textContent = String(settings.iterations);
    $('qualVal').textContent = String(settings.quality);
    paintPresetOn();
  }

  function writeSliders() {
    $('amount').value = String(settings.amount);
    $('seed').value = String(settings.seed);
    $('iterations').value = String(settings.iterations);
    $('quality').value = String(settings.quality);
    readSliders();
  }

  function persist() {
    if (!saveDb && !picDb) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (saveDb) {
      saveDb.put({
        id: 'state',
        amount: settings.amount,
        seed: settings.seed,
        iterations: settings.iterations,
        quality: settings.quality,
        at: Date.now()
      }).catch(function () {});
    }
    if (picDb && srcDataUrl && srcDataUrl.length < SRC_CAP) {
      picDb.put({ id: 'src', jpg: srcDataUrl, at: Date.now() }).catch(function () {});
    }
  }

  function showWork(on) {
    var empty = $('empty');
    var canvas = $('out');
    var orig = $('orig');
    var work = $('work');
    var hint = $('holdhint');
    if (empty) empty.hidden = !!on;
    if (canvas) canvas.hidden = !on;
    if (orig) orig.hidden = true;
    if (work) work.hidden = !on;
    if (hint) hint.hidden = !on;
  }

  function paintOriginal() {
    var c = $('orig');
    if (!c || !original) return;
    c.width = original.width;
    c.height = original.height;
    c.getContext('2d').putImageData(original, 0, 0);
  }

  function setComparing(on) {
    if (!loaded || !original) return;
    comparing = !!on;
    var out = $('out');
    var orig = $('orig');
    var hint = $('holdhint');
    if (on) {
      paintOriginal();
      if (out) out.hidden = true;
      if (orig) orig.hidden = false;
      if (hint) hint.textContent = 'Original';
    } else {
      if (out) out.hidden = false;
      if (orig) orig.hidden = true;
      if (hint) hint.textContent = 'Hold to see the original';
    }
  }

  function apply(done) {
    if (!original || !root.glitchCanvas) { if (done) done(); return; }
    if (busy) { pending = true; pendingDone = done || pendingDone; return; }
    busy = true;
    pending = false;
    var cb = done;
    pendingDone = null;
    root.glitchCanvas.glitch(original, {
      amount: settings.amount,
      seed: settings.seed,
      iterations: settings.iterations,
      quality: settings.quality
    }, function (out) {
      var canvas = $('out');
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext('2d').putImageData(out, 0, 0);
      busy = false;
      persist();
      if (cb) cb();
      if (pending) apply(pendingDone);
    });
  }

  function imageDataFrom(img) {
    var need = downscaleNeed(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_EDGE);
    var c = root.document.createElement('canvas');
    c.width = need.w;
    c.height = need.h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    srcDataUrl = c.toDataURL('image/jpeg', 0.85);
    if (srcDataUrl.length > 800000) srcDataUrl = c.toDataURL('image/jpeg', 0.7);
    return ctx.getImageData(0, 0, c.width, c.height);
  }

  function loadImage(url) {
    var img = new Image();
    img.onload = function () {
      original = imageDataFrom(img);
      loaded = true;
      apply(function () {
        showWork(true);
        say('Glitched on this device. If it is a grey smear, try Random seed.');
      });
    };
    img.onerror = function () { say('Could not open that picture.', true); };
    img.src = url;
  }

  function loadBlob(blob) {
    loadImage(URL.createObjectURL(blob));
  }

  function demoImage() {
    var c = root.document.createElement('canvas');
    c.width = 320; c.height = 220;
    var g = c.getContext('2d');
    var x, y;
    for (y = 0; y < 220; y++) {
      g.fillStyle = 'rgb(' + (40 + y) + ',' + (20) + ',' + (180 - y * 0.4) + ')';
      g.fillRect(0, y, 320, 1);
    }
    g.fillStyle = '#ffd36b';
    g.beginPath(); g.arc(80, 60, 36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a8f6a';
    g.fillRect(0, 150, 320, 70);
    g.fillStyle = '#f46';
    g.fillRect(180, 110, 70, 80);
    g.fillStyle = '#fff8';
    for (x = 0; x < 8; x++) g.fillRect(20 + x * 36, 30, 10, 10);
    for (x = 0; x < 220; x++) {
      g.fillStyle = 'rgba(' + ((x * 37) % 255) + ',' + ((x * 91) % 180) + ',' + ((x * 13) % 255) + ',0.35)';
      g.fillRect((x * 17) % 320, (x * 11) % 220, 4, 4);
    }
    return c.toDataURL('image/png');
  }

  function takePhoto() {
    var api = root.gifos;
    if (!api || typeof api.takePhoto !== 'function') {
      say('Open this inside GifOS to take a photo.', true);
      return;
    }
    say('Take a still…');
    api.takePhoto({ facing: 'environment' }).then(function (clip) {
      loadBlob(new Blob([clip.bytes], { type: clip.mime || 'image/jpeg' }));
    }).catch(function (e) {
      var m = (e && e.message) || String(e);
      if (/cancel/i.test(m)) say('Photo cancelled.');
      else say(m, true);
    });
  }

  function download() {
    var canvas = $('out');
    if (!canvas || !canvas.width || !loaded) return;
    var a = root.document.createElement('a');
    a.download = 'glitch.jpg';
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.click();
  }

  function paintPresets() {
    var host = $('presets');
    if (!host) return;
    host.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.dataset.id = p.id;
      b.textContent = p.name;
      b.addEventListener('click', function () {
        settings.amount = p.amount;
        settings.seed = p.seed;
        settings.iterations = p.iterations;
        settings.quality = p.quality;
        writeSliders();
        apply();
      });
      host.appendChild(b);
    });
    paintPresetOn();
  }

  function paintPresetOn() {
    var host = $('presets');
    if (!host) return;
    var id = matchingPreset(settings);
    host.querySelectorAll('.preset').forEach(function (el) {
      if (el.dataset.id === id) el.classList.add('on');
      else el.classList.remove('on');
    });
  }

  function bindStageHold() {
    var stage = $('stage');
    if (!stage) return;
    function down(e) {
      if (!loaded) return;
      if (e.target && e.target.closest && e.target.closest('#empty')) return;
      setComparing(true);
    }
    function up() { setComparing(false); }
    stage.addEventListener('pointerdown', down);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
  }

  function boot() {
    if (!$('amount') || !$('out')) return;
    paintPresets();
    showWork(false);
    function onSlide() { readSliders(); apply(); }
    ['amount', 'seed', 'iterations', 'quality'].forEach(function (id) {
      $(id).addEventListener('input', onSlide);
    });
    $('randBtn').addEventListener('click', function () {
      settings.seed = (Math.random() * 101) | 0;
      writeSliders();
      apply();
    });
    var fileEl = $('file');
    function pickFile() { if (fileEl) fileEl.click(); }
    $('chooseBtn') && $('chooseBtn').addEventListener('click', pickFile);
    $('emptyChoose') && $('emptyChoose').addEventListener('click', pickFile);
    $('emptyPhoto') && $('emptyPhoto').addEventListener('click', takePhoto);
    $('sampleBtn') && $('sampleBtn').addEventListener('click', function () {
      loadImage(demoImage());
    });
    var stage = $('stage');
    stage.addEventListener('dragover', function (e) { e.preventDefault(); stage.classList.add('over'); });
    stage.addEventListener('dragleave', function () { stage.classList.remove('over'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      stage.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadBlob(f);
    });
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (f) loadBlob(f);
    });
    $('photoBtn').addEventListener('click', takePhoto);
    $('saveBtn').addEventListener('click', download);
    bindStageHold();

    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (comparing) { setComparing(false); return true; }
        return false;
      });
    }

    var ready = Promise.resolve();
    if (saveDb) {
      ready = saveDb.get('state').then(function (row) {
        if (!row) return;
        if (row.amount != null) settings.amount = clamp(row.amount, 0, 99);
        if (row.seed != null) settings.seed = clamp(row.seed, 0, 100);
        if (row.iterations != null) settings.iterations = clamp(row.iterations, 0, 100);
        if (row.quality != null) settings.quality = clamp(row.quality, 1, 99);
        writeSliders();
      }).catch(function () {});
    }
    ready.then(function () {
      if (!picDb) return null;
      return picDb.get('src').then(function (srcRow) {
        return picDb.get('out').then(function (outRow) {
          return pickRestoreUrl(srcRow, outRow);
        });
      }).catch(function () { return null; });
    }).then(function (url) {
      if (url) loadImage(url);
      else showWork(false);
    });
  }

  root.JpgGlitchApp = {
    DEFAULTS: DEFAULTS,
    PRESETS: PRESETS,
    MAX_EDGE: MAX_EDGE,
    clamp: clamp,
    downscaleNeed: downscaleNeed,
    pickRestoreUrl: pickRestoreUrl,
    matchingPreset: matchingPreset,
    smash: function (bytes, params) {
      return root.glitchCanvas.smashBytes(bytes, root.glitchCanvas.getNormalizedParameters(params));
    }
  };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
