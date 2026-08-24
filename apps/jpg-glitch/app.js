/*
 * JPG Glitch chrome around snorpey's glitch-canvas (no worker).
 * Last conversion is private. Take photo is a clip, never a live camera.
 */
(function (root) {
  'use strict';

  var DEFAULTS = { amount: 24, seed: 53, iterations: 21, quality: 46 };

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var picDb = null;
  var timer = 0;
  var original = null;
  var busy = false;
  var pending = false;
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

  function readSliders() {
    settings.amount = clamp(+$('amount').value, 0, 99);
    settings.seed = clamp(+$('seed').value, 0, 100);
    settings.iterations = clamp(+$('iterations').value, 0, 100);
    settings.quality = clamp(+$('quality').value, 1, 99);
    $('amountVal').textContent = String(settings.amount);
    $('seedVal').textContent = String(settings.seed);
    $('iterVal').textContent = String(settings.iterations);
    $('qualVal').textContent = String(settings.quality);
  }

  function persist() {
    if (!saveDb) return;
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
    var canvas = $('out');
    if (picDb && canvas && canvas.width) {
      try {
        var data = canvas.toDataURL('image/jpeg', 0.7);
        if (data && data.length < 900000) {
          picDb.put({ id: 'out', jpg: data, at: Date.now() }).catch(function () {});
        }
      } catch (e) {}
    }
  }

  function apply() {
    if (!original || !root.glitchCanvas) return;
    if (busy) { pending = true; return; }
    busy = true;
    pending = false;
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
      if (pending) apply();
    });
  }

  function imageDataFrom(img) {
    var max = 900;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = 1;
    if (w > max || h > max) scale = max / Math.max(w, h);
    var c = root.document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height);
  }

  function loadImage(url) {
    var img = new Image();
    img.onload = function () {
      original = imageDataFrom(img);
      apply();
      say('Glitched on this device.');
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
    if (!canvas || !canvas.width) return;
    var a = root.document.createElement('a');
    a.download = 'glitch.jpg';
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.click();
  }

  function boot() {
    if (!$('amount') || !$('out')) return;
    function onSlide() { readSliders(); apply(); }
    ['amount', 'seed', 'iterations', 'quality'].forEach(function (id) {
      $(id).addEventListener('input', onSlide);
    });
    $('randBtn').addEventListener('click', function () {
      settings.seed = (Math.random() * 101) | 0;
      $('seed').value = String(settings.seed);
      readSliders();
      apply();
    });
    var drop = $('drop');
    var fileEl = $('file');
    drop.addEventListener('click', function () { fileEl.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadBlob(f);
    });
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (f) loadBlob(f);
    });
    $('photoBtn').addEventListener('click', takePhoto);
    $('saveBtn').addEventListener('click', download);

    var ready = Promise.resolve();
    if (saveDb) {
      ready = saveDb.get('state').then(function (row) {
        if (!row) return;
        if (row.amount != null) { settings.amount = clamp(row.amount, 0, 99); $('amount').value = String(settings.amount); }
        if (row.seed != null) { settings.seed = clamp(row.seed, 0, 100); $('seed').value = String(settings.seed); }
        if (row.iterations != null) { settings.iterations = clamp(row.iterations, 0, 100); $('iterations').value = String(settings.iterations); }
        if (row.quality != null) { settings.quality = clamp(row.quality, 1, 99); $('quality').value = String(settings.quality); }
        readSliders();
      }).catch(function () {});
    }
    ready.then(function () {
      if (picDb) {
        return picDb.get('out').then(function (row) {
          if (row && row.jpg) { loadImage(row.jpg); return true; }
          return false;
        }).catch(function () { return false; });
      }
      return false;
    }).then(function (had) {
      if (!had) loadImage(demoImage());
    });
  }

  root.JpgGlitchApp = {
    DEFAULTS: DEFAULTS,
    clamp: clamp,
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
