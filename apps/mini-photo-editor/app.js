/*
 * Mini Photo Editor — GifOS chrome. Open / take / put a photo, crop, rotate, filter.
 * Last recipe + picture are private. Invite shares the recipe, not the picture.
 */
(function (root) {
  'use strict';

  var MP = root.MiniPhoto;
  var api = root.gifos || null;
  var saveDb = null;
  var picDb = null;
  var saveTimer = 0;
  var picTimer = 0;
  var preview = document.getElementById('preview');
  var dragging = false;
  var dragMode = null;
  var drag0 = null;
  var lastP = null;
  var aspect = 0;
  var $ = function (id) { return document.getElementById(id); };

  function say(msg, err) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = err ? 'err' : '';
  }

  function persistRecipe() {
    if (!saveDb) return;
    if (root.MPMp && root.MPMp.guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var st = MP.getState();
      st.id = 'edit';
      saveDb.put(st).catch(function () {});
    }, 300);
  }

  function persistPic(dataUrl) {
    if (!picDb || !dataUrl) return;
    if (dataUrl.length > 900000) return;
    if (picTimer) clearTimeout(picTimer);
    picTimer = setTimeout(function () {
      picTimer = 0;
      picDb.put({ id: 'pic', jpg: dataUrl, at: Date.now() }).catch(function () {});
    }, 400);
  }

  function paint() {
    if (!MP.hasImage()) {
      document.body.classList.remove('has-pic');
      return;
    }
    document.body.classList.add('has-pic');
    MP.paint(preview);
  }

  function fmt(n) {
    var s = (Math.round(n * 100) / 100).toFixed(2);
    return s.replace(/\.?0+$/, '') || '0';
  }

  function paintSliders() {
    var st = MP.getState();
    ['brightness', 'contrast', 'saturation', 'warmth', 'vignette'].forEach(function (k) {
      $(k).value = st.adj[k];
      var lab = $(k + 'Val');
      if (lab) lab.textContent = fmt(st.adj[k]);
    });
    var chips = $('filters').querySelectorAll('button');
    var i;
    for (i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === st.filter);
    }
  }

  function paintAspect() {
    var chips = $('aspects').querySelectorAll('button');
    var i, a;
    for (i = 0; i < chips.length; i++) {
      a = parseFloat(chips[i].getAttribute('data-a'));
      chips[i].classList.toggle('on', Math.abs(a - aspect) < 0.001);
    }
  }

  function readAdj() {
    MP.adj.brightness = parseFloat($('brightness').value);
    MP.adj.contrast = parseFloat($('contrast').value);
    MP.adj.saturation = parseFloat($('saturation').value);
    MP.adj.warmth = parseFloat($('warmth').value);
    MP.adj.vignette = parseFloat($('vignette').value);
    MP.invalidate();
    paintSliders();
    if (root.MPMp && root.MPMp.onState && root.MPMp.onState(MP.getState())) { paint(); return; }
    paint(); persistRecipe();
  }

  function downscale(img, max, mime, quality, cb) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = 1;
    if (w > max || h > max) scale = max / Math.max(w, h);
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    var url = c.toDataURL(mime || 'image/jpeg', quality == null ? 0.85 : quality);
    var out = new Image();
    out.onload = function () { cb(out, url); };
    out.onerror = function () { cb(null, ''); };
    out.src = url;
  }

  function adopt(img, dataUrl, name) {
    MP.setSource(img);
    if (aspect) MP.cropToAspect(aspect);
    paint();
    paintSliders();
    persistRecipe();
    if (dataUrl) persistPic(dataUrl);
    $('how').textContent = (name || 'Photo') + ' — drag a corner to crop.';
    say('');
  }

  function loadUrl(url, name) {
    var img = new Image();
    img.onload = function () {
      downscale(img, 1280, 'image/jpeg', 0.85, function (small, dataUrl) {
        if (!small) { say('Could not read that picture.', true); return; }
        adopt(small, dataUrl, name);
      });
    };
    img.onerror = function () { say('That file is not a picture.', true); };
    img.src = url;
  }

  function loadBlob(blob, name) {
    if (!blob) return;
    if (blob.type && blob.type.indexOf('image/') !== 0) {
      say('That file is not a picture.', true);
      return;
    }
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      downscale(img, 1280, 'image/jpeg', 0.85, function (small, dataUrl) {
        if (!small) { say('Could not read that picture.', true); return; }
        adopt(small, dataUrl, name || blob.name || 'Photo');
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      say('That file is not a picture.', true);
    };
    img.src = url;
  }

  function takePhoto() {
    if (!api || typeof api.takePhoto !== 'function') {
      say('Open this inside GifOS to take a photo.', true);
      return;
    }
    say('Take a still…');
    api.takePhoto({ facing: 'environment' }).then(function (clip) {
      loadBlob(new Blob([clip.bytes], { type: clip.mime || 'image/jpeg' }), 'Photo');
    }).catch(function (e) {
      var m = (e && e.message) || String(e);
      if (/cancel/i.test(m)) say('Photo cancelled.');
      else say(m, true);
    });
  }

  function canvasToImage(e) {
    var r = preview.getBoundingClientRect();
    var d = MP.rotatedSize();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    return {
      x: (e.clientX - r.left) / r.width * d.w,
      y: (e.clientY - r.top) / r.height * d.h
    };
  }

  function bind() {
    $('open').addEventListener('change', function () {
      if (this.files && this.files[0]) loadBlob(this.files[0]);
      this.value = '';
    });
    $('photoBtn').addEventListener('click', function (e) { e.preventDefault(); takePhoto(); });
    function afterEdit() {
      if (root.MPMp && root.MPMp.onState) root.MPMp.onState(MP.getState());
      paint(); persistRecipe();
    }
    $('rotL').addEventListener('click', function (e) { e.preventDefault(); MP.rotate(-1); afterEdit(); });
    $('rotR').addEventListener('click', function (e) { e.preventDefault(); MP.rotate(1); afterEdit(); });
    $('flipBtn').addEventListener('click', function (e) { e.preventDefault(); MP.flip('h'); afterEdit(); });
    $('resetBtn').addEventListener('click', function (e) {
      e.preventDefault();
      MP.resetAdj();
      aspect = 0;
      paintAspect();
      paintSliders();
      afterEdit();
    });
    $('saveBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (!MP.hasImage()) { say('Open a photo first.', true); return; }
      MP.exportBlob('image/jpeg', 0.92, function (blob) {
        if (!blob) { say('Could not make a JPEG.', true); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'edit.jpg';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        say('JPEG saved on this device.');
      });
    });
    ['brightness', 'contrast', 'saturation', 'warmth', 'vignette'].forEach(function (k) {
      $(k).addEventListener('input', readAdj);
    });
    $('filters').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        MP.setFilter(b.getAttribute('data-id'));
        paintSliders();
        if (root.MPMp && root.MPMp.onState && root.MPMp.onState(MP.getState())) { paint(); return; }
        paint(); persistRecipe();
      });
    });
    $('aspects').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        aspect = parseFloat(b.getAttribute('data-a')) || 0;
        paintAspect();
        if (MP.hasImage()) { MP.cropToAspect(aspect); afterEdit(); }
      });
    });
    preview.addEventListener('pointerdown', function (e) {
      if (!MP.hasImage()) return;
      e.preventDefault();
      var p = canvasToImage(e);
      dragMode = MP.hitHandle(p.x, p.y);
      if (!dragMode) return;
      dragging = true;
      drag0 = p;
      lastP = p;
      try { preview.setPointerCapture(e.pointerId); } catch (err) {}
    });
    preview.addEventListener('pointermove', function (e) {
      if (!dragging || !dragMode) return;
      var p = canvasToImage(e);
      if (dragMode === 'move') {
        MP.moveCrop(p.x - lastP.x, p.y - lastP.y);
      } else {
        MP.resizeCrop(dragMode, p.x, p.y, aspect);
      }
      lastP = p;
      paint();
    });
    preview.addEventListener('pointerup', function () {
      if (dragging) afterEdit();
      dragging = false;
      dragMode = null;
    });
    preview.addEventListener('pointercancel', function () {
      dragging = false;
      dragMode = null;
    });

    $('empty').addEventListener('click', function () { $('open').click(); });
    var stage = $('stage');
    stage.addEventListener('dragover', function (e) {
      e.preventDefault();
      stage.classList.add('over');
    });
    stage.addEventListener('dragleave', function () { stage.classList.remove('over'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      stage.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadBlob(f);
    });
    root.document.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var i;
      for (i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          loadBlob(items[i].getAsFile(), 'Pasted photo');
          e.preventDefault();
          return;
        }
      }
    });

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (MP.hasImage() && !MP.isFullCrop()) {
          aspect = 0;
          paintAspect();
          var d = MP.rotatedSize();
          MP.setCrop({ x: 0, y: 0, w: d.w, h: d.h });
          afterEdit();
          return true;
        }
        return false;
      });
    }
  }

  function boot() {
    bind();
    paintAspect();
    var ready = Promise.resolve();
    if (api && api.db) {
      saveDb = api.db('save');
      picDb = api.db('pic');
      ready = saveDb.get('edit').then(function (row) {
        if (!row || (root.MPMp && root.MPMp.guest)) return;
        MP.setState(row);
        paintSliders();
      }).catch(function () {});
    }
    ready.then(function () {
      if (!picDb) return;
      return picDb.get('pic').then(function (row) {
        if (row && row.jpg) loadUrl(row.jpg, 'Last photo');
      }).catch(function () {});
    }).then(function () {
      paintSliders();
      paint();
    });
  }

  root.MPApp = {
    persist: persistRecipe,
    paint: paint,
    paintSliders: paintSliders,
    loadBlob: loadBlob,
    takePhoto: takePhoto
  };
  boot();
})(window);
