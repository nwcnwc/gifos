/*
 * Mini Photo Editor — GifOS chrome. Open a photo, crop, rotate, filter.
 * Last recipe is private. Invite shares the recipe, not the picture.
 */
(function (root) {
  'use strict';

  var MP = root.MiniPhoto;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var preview = document.getElementById('preview');
  var dragging = false;
  var drag0 = null;
  var $ = function (id) { return document.getElementById(id); };

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var st = MP.getState();
      st.id = 'edit';
      saveDb.put(st).catch(function () {});
    }, 300);
  }

  function paint() {
    if (!MP.hasImage()) return;
    MP.paint(preview);
  }

  function paintSliders() {
    var st = MP.getState();
    ['brightness', 'contrast', 'saturation', 'warmth', 'vignette'].forEach(function (k) {
      $(k).value = st.adj[k];
    });
    var chips = $('filters').querySelectorAll('button');
    var i;
    for (i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === st.filter);
    }
  }

  function readAdj() {
    MP.adj.brightness = parseFloat($('brightness').value);
    MP.adj.contrast = parseFloat($('contrast').value);
    MP.adj.saturation = parseFloat($('saturation').value);
    MP.adj.warmth = parseFloat($('warmth').value);
    MP.adj.vignette = parseFloat($('vignette').value);
    if (root.MPMp && root.MPMp.onState && root.MPMp.onState(MP.getState())) { paint(); return; }
    paint(); persist();
  }

  function loadFile(file) {
    if (!file) return;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      MP.setSource(img);
      paint();
      $('how').textContent = file.name + ' — drag on the picture to crop.';
    };
    img.onerror = function () { URL.revokeObjectURL(url); };
    img.src = url;
  }

  function canvasToImage(e) {
    var r = preview.getBoundingClientRect();
    var d = MP.rotatedSize();
    var x = (e.clientX - r.left) / r.width * d.w;
    var y = (e.clientY - r.top) / r.height * d.h;
    return { x: x, y: y };
  }

  function bind() {
    $('open').addEventListener('change', function () {
      if (this.files && this.files[0]) loadFile(this.files[0]);
      this.value = '';
    });
    $('rotL').addEventListener('click', function (e) { e.preventDefault(); MP.rotate(-1); paint(); persist(); });
    $('rotR').addEventListener('click', function (e) { e.preventDefault(); MP.rotate(1); paint(); persist(); });
    $('resetBtn').addEventListener('click', function (e) {
      e.preventDefault();
      MP.resetAdj();
      paintSliders();
      paint(); persist();
    });
    $('saveBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (!MP.hasImage()) return;
      MP.exportBlob('image/jpeg', 0.92, function (blob) {
        if (!blob) return;
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'edit.jpg';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
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
        paint(); persist();
      });
    });
    preview.addEventListener('pointerdown', function (e) {
      if (!MP.hasImage()) return;
      e.preventDefault();
      dragging = true;
      drag0 = canvasToImage(e);
      try { preview.setPointerCapture(e.pointerId); } catch (err) {}
    });
    preview.addEventListener('pointermove', function (e) {
      if (!dragging || !drag0) return;
      var p = canvasToImage(e);
      var x = Math.min(drag0.x, p.x), y = Math.min(drag0.y, p.y);
      MP.setCrop({ x: x, y: y, w: Math.abs(p.x - drag0.x), h: Math.abs(p.y - drag0.y) });
      paint();
    });
    preview.addEventListener('pointerup', function () {
      if (dragging) persist();
      dragging = false;
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (root.MPMp && root.MPMp.busy && root.MPMp.busy()) { root.MPMp.leave(); return true; }
        return false;
      });
    }
  }

  function boot() {
    bind();
    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('edit').then(function (row) {
      if (!row || (root.MPMp && root.MPMp.busy && root.MPMp.busy())) return;
      MP.setState(row);
      paintSliders();
      paint();
    }).catch(function () {});
  }

  root.MPApp = { persist: persist, paint: paint, paintSliders: paintSliders };
  boot();
})(window);
