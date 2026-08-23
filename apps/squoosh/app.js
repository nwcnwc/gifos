/*
 * Squoosh — drop an image, pick a codec, download the smaller file.
 * Persistence is gifos.db('prefs'). Images never leave this device.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var C = window.SquooshCodecs;
  var S = {
    file: null,
    name: '',
    origBytes: 0,
    decoded: null,     // ImageData
    processed: null,   // after resize
    out: null,         // { bytes, mime, ext, bytesLength }
    preview: null,     // ImageBitmap of the compressed result, or null
    format: 'mozjpeg',
    quality: 75,
    lossless: false,
    resizeOn: false,
    rw: 0, rh: 0, lock: true,
    split: 0.5,
    adv: {},
    busy: false,
    tEncode: 0
  };

  function setStatus(m, kind) {
    var el = $('status');
    if (!el) return;
    el.textContent = m || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function metaOf(id) {
    for (var i = 0; i < C.CODECS.length; i++) if (C.CODECS[i].id === id) return C.CODECS[i];
    return C.CODECS[0];
  }

  function fillFormats() {
    var sel = $('format');
    sel.innerHTML = '';
    C.CODECS.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id; o.textContent = c.label;
      sel.appendChild(o);
    });
    sel.value = S.format;
  }

  function syncFormatUi() {
    var m = metaOf(S.format);
    $('fmtNote').textContent = m.note || '';
    $('qualityRow').hidden = !m.quality || (m.lossless && S.lossless && S.format === 'webp');
    $('lossless').parentElement.hidden = !m.lossless || S.format === 'oxipng' || S.format === 'qoi';
    if (S.format === 'webp' && S.lossless) $('qualityRow').hidden = true;
    $('quality').value = S.quality;
    $('qualityVal').textContent = S.quality;
    renderAdv();
  }

  function renderAdv() {
    var box = $('advBody');
    box.innerHTML = '';
    function add(id, label, el) {
      var row = document.createElement('label');
      row.className = 'row';
      row.appendChild(document.createTextNode(label));
      el.id = id;
      row.appendChild(el);
      box.appendChild(row);
      return el;
    }
    var d = C.DEFAULTS[S.format] || {};
    if (S.format === 'mozjpeg') {
      var p = document.createElement('input'); p.type = 'checkbox'; p.checked = d.progressive;
      add('adv_progressive', 'Progressive', p);
    } else if (S.format === 'webp') {
      var method = document.createElement('input');
      method.type = 'range'; method.min = '0'; method.max = '6'; method.value = String(d.method);
      add('adv_method', 'Effort', method);
    } else if (S.format === 'avif') {
      var speed = document.createElement('input');
      speed.type = 'range'; speed.min = '0'; speed.max = '10'; speed.value = String(d.speed);
      add('adv_speed', 'Speed (higher = faster)', speed);
    } else if (S.format === 'jxl') {
      var effort = document.createElement('input');
      effort.type = 'range'; effort.min = '1'; effort.max = '9'; effort.value = String(d.effort);
      add('adv_effort', 'Effort', effort);
    } else if (S.format === 'oxipng') {
      var level = document.createElement('input');
      level.type = 'range'; level.min = '0'; level.max = '6'; level.value = String(d.level);
      add('adv_level', 'Level', level);
    }
  }

  function advOptions() {
    var o = {};
    var progressive = $('adv_progressive');
    var method = $('adv_method');
    var speed = $('adv_speed');
    var effort = $('adv_effort');
    var level = $('adv_level');
    if (progressive) o.progressive = progressive.checked;
    if (method) o.method = method.value | 0;
    if (speed) o.speed = speed.value | 0;
    if (effort) o.effort = effort.value | 0;
    if (level) o.level = level.value | 0;
    if (S.format === 'mozjpeg' || S.format === 'avif' || S.format === 'jxl') o.quality = S.quality;
    if (S.format === 'webp') {
      o.quality = S.quality;
      o.lossless = S.lossless ? 1 : 0;
    }
    return o;
  }

  function savePrefs() {
    if (!(window.gifos && gifos.db)) return Promise.resolve();
    try {
      return Promise.resolve(gifos.db('prefs').put({
        id: 'prefs', format: S.format, quality: S.quality, lossless: S.lossless,
        resizeOn: S.resizeOn, lock: S.lock
      }));
    } catch (e) { return Promise.resolve(); }
  }

  function loadPrefs() {
    if (!(window.gifos && gifos.db)) return Promise.resolve();
    return Promise.resolve(gifos.db('prefs').getAll()).then(function (rows) {
      var p = rows && rows[0];
      if (!p) return;
      if (metaOf(p.format)) S.format = p.format;
      if (typeof p.quality === 'number') S.quality = Math.max(0, Math.min(100, p.quality | 0));
      S.lossless = !!p.lossless;
      S.resizeOn = !!p.resizeOn;
      if (typeof p.lock === 'boolean') S.lock = p.lock;
    }).catch(function () {});
  }

  function decodeBlob(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob, { imageOrientation: 'from-image' }).then(function (bmp) {
        var c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        var data = ctx.getImageData(0, 0, bmp.width, bmp.height);
        try { bmp.close(); } catch (e) {}
        return data;
      });
    }
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        res(c.getContext('2d').getImageData(0, 0, c.width, c.height));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('This browser could not open that image.')); };
      img.src = url;
    });
  }

  function resizeTo(imageData, w, h) {
    if (w === imageData.width && h === imageData.height) return imageData;
    var src = document.createElement('canvas');
    src.width = imageData.width; src.height = imageData.height;
    src.getContext('2d').putImageData(imageData, 0, 0);
    var dst = document.createElement('canvas');
    dst.width = w; dst.height = h;
    var ctx = dst.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  function processed() {
    if (!S.decoded) return null;
    if (!S.resizeOn) return S.decoded;
    var w = Math.max(1, S.rw | 0), h = Math.max(1, S.rh | 0);
    return resizeTo(S.decoded, w, h);
  }

  function paintCanvases() {
    var view = $('view');
    var L = $('left'), R = $('right');
    var w = view.clientWidth, h = view.clientHeight;
    if (w < 2 || h < 2) return;
    [L, R].forEach(function (c) { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; });
    function blit(canvas, imageData) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#080c11';
      ctx.fillRect(0, 0, w, h);
      if (!imageData) return;
      var tmp = document.createElement('canvas');
      tmp.width = imageData.width; tmp.height = imageData.height;
      tmp.getContext('2d').putImageData(imageData, 0, 0);
      var scale = Math.min(w / imageData.width, h / imageData.height);
      var dw = imageData.width * scale, dh = imageData.height * scale;
      var x = (w - dw) / 2, y = (h - dh) / 2;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tmp, x, y, dw, dh);
    }
    blit(L, S.decoded);
    if (S.preview) {
      var ctx = R.getContext('2d');
      ctx.fillStyle = '#080c11';
      ctx.fillRect(0, 0, w, h);
      var bmp = S.preview;
      var scale = Math.min(w / bmp.width, h / bmp.height);
      var dw = bmp.width * scale, dh = bmp.height * scale;
      ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      blit(R, S.processed || S.decoded);
    }
    applySplit();
  }

  function applySplit() {
    var pct = Math.max(0, Math.min(1, S.split));
    $('right').style.clipPath = 'inset(0 0 0 ' + (pct * 100).toFixed(2) + '%)';
    $('divider').style.left = (pct * 100).toFixed(2) + '%';
    $('divider').setAttribute('aria-valuenow', String(Math.round(pct * 100)));
  }

  function bindSplit() {
    var view = $('view'), div = $('divider');
    function pos(ev) {
      var r = view.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      S.split = Math.max(0, Math.min(1, x / r.width));
      applySplit();
    }
    var drag = false;
    div.addEventListener('pointerdown', function (e) { drag = true; div.setPointerCapture(e.pointerId); pos(e); e.preventDefault(); });
    div.addEventListener('pointermove', function (e) { if (drag) pos(e); });
    div.addEventListener('pointerup', function () { drag = false; });
    view.addEventListener('pointerdown', function (e) {
      if (e.target === div) return;
      drag = true; pos(e);
    });
    window.addEventListener('pointerup', function () { drag = false; });
    div.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { S.split = Math.max(0, S.split - 0.04); applySplit(); }
      if (e.key === 'ArrowRight') { S.split = Math.min(1, S.split + 0.04); applySplit(); }
    });
  }

  function showStats() {
    $('origSize').textContent = S.origBytes ? fmtBytes(S.origBytes) : '—';
    if (!S.out) { $('outSize').textContent = '—'; $('saving').textContent = '—'; $('saving').className = 'v'; return; }
    $('outSize').textContent = fmtBytes(S.out.bytesLength);
    var frac = 1 - (S.out.bytesLength / S.origBytes);
    var el = $('saving');
    if (S.origBytes <= 0) { el.textContent = '—'; el.className = 'v'; return; }
    if (frac >= 0) { el.textContent = Math.round(frac * 100) + '%'; el.className = 'v good'; }
    else { el.textContent = '+' + Math.round(-frac * 100) + '%'; el.className = 'v bad'; }
  }

  var encodeGen = 0;
  function queueEncode() {
    var gen = ++encodeGen;
    setStatus('Compressing…', 'busy');
    $('download').disabled = true;
    // Let the status paint before the WASM runs on this thread.
    setTimeout(function () {
      if (gen !== encodeGen) return;
      runEncode(gen);
    }, 30);
  }

  function runEncode(gen) {
    var src = processed();
    if (!src) return;
    S.processed = src;
    var t0 = Date.now();
    C.encode(S.format, src, advOptions()).then(function (out) {
      if (gen !== encodeGen) return;
      S.out = out;
      S.tEncode = Date.now() - t0;
      showStats();
      $('download').disabled = false;
      var m = metaOf(S.format);
      setStatus(m.label + ' in ' + (S.tEncode < 1000 ? S.tEncode + ' ms' : (S.tEncode / 1000).toFixed(1) + ' s') + '.');
      var blob = new Blob([out.bytes], { type: out.mime });
      if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob).then(function (bmp) {
          if (gen !== encodeGen) { try { bmp.close(); } catch (e) {} return; }
          if (S.preview && S.preview.close) try { S.preview.close(); } catch (e) {}
          S.preview = bmp;
          paintCanvases();
        }, function () {
          S.preview = null;
          paintCanvases();
          if (S.format === 'jxl' || S.format === 'qoi') {
            setStatus(m.label + ' encoded, but this browser cannot preview .' + m.ext + ' — download still works.');
          }
        });
      }
      S.preview = null;
      paintCanvases();
    }).catch(function (e) {
      if (gen !== encodeGen) return;
      S.out = null;
      showStats();
      setStatus(String(e && e.message || e), 'err');
    });
  }

  function openFile(file) {
    if (!file) return;
    S.file = file;
    S.name = file.name || 'image';
    S.origBytes = file.size;
    S.out = null;
    S.preview = null;
    setStatus('Reading…', 'busy');
    decodeBlob(file).then(function (data) {
      S.decoded = data;
      S.rw = data.width; S.rh = data.height;
      $('rw').value = S.rw; $('rh').value = S.rh;
      $('intro').hidden = true;
      $('work').hidden = false;
      $('dims').textContent = data.width + ' × ' + data.height;
      $('labL').textContent = 'Original';
      $('labR').textContent = metaOf(S.format).label;
      showStats();
      paintCanvases();
      queueEncode();
    }).catch(function (e) { setStatus(String(e && e.message || e), 'err'); });
  }

  function download() {
    if (!S.out) return;
    var base = S.name.replace(/\.[^.]+$/, '') || 'image';
    var blob = new Blob([S.out.bytes], { type: S.out.mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = base + '.' + S.out.ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function bindDrop() {
    var drop = $('drop');
    var input = $('file');
    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () { if (input.files && input.files[0]) openFile(input.files[0]); });
    function over(e) { e.preventDefault(); drop.classList.add('over'); }
    function leave(e) { e.preventDefault(); drop.classList.remove('over'); }
    drop.addEventListener('dragover', over);
    drop.addEventListener('dragleave', leave);
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && (/^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|bmp|svg)$/i.test(f.name))) openFile(f);
    });
  }

  function bindControls() {
    $('format').addEventListener('change', function () {
      S.format = $('format').value;
      $('labR').textContent = metaOf(S.format).label;
      S.lossless = (S.format === 'oxipng' || S.format === 'qoi') ? true : (S.format === 'webp' ? S.lossless : false);
      $('lossless').checked = S.format === 'webp' && S.lossless;
      if (S.format === 'avif' && S.quality === 75) S.quality = 50;
      syncFormatUi();
      savePrefs();
      queueEncode();
    });
    var qT;
    $('quality').addEventListener('input', function () {
      S.quality = $('quality').value | 0;
      $('qualityVal').textContent = S.quality;
      clearTimeout(qT);
      qT = setTimeout(function () { savePrefs(); queueEncode(); }, 180);
    });
    $('lossless').addEventListener('change', function () {
      S.lossless = $('lossless').checked;
      syncFormatUi();
      savePrefs();
      queueEncode();
    });
    $('advBody').addEventListener('change', function () { queueEncode(); });
    $('advBody').addEventListener('input', function () {
      clearTimeout(qT);
      qT = setTimeout(function () { queueEncode(); }, 180);
    });
    $('resizeOn').addEventListener('change', function () {
      S.resizeOn = $('resizeOn').checked;
      $('resizeRow').hidden = !S.resizeOn;
      savePrefs();
      queueEncode();
    });
    $('lock').addEventListener('change', function () { S.lock = $('lock').checked; savePrefs(); });
    function onDim(which) {
      var w = $('rw').value | 0, h = $('rh').value | 0;
      if (S.lock && S.decoded) {
        var ar = S.decoded.width / S.decoded.height;
        if (which === 'w') h = Math.max(1, Math.round(w / ar));
        else w = Math.max(1, Math.round(h * ar));
        $('rw').value = w; $('rh').value = h;
      }
      S.rw = w; S.rh = h;
      queueEncode();
    }
    $('rw').addEventListener('change', function () { onDim('w'); });
    $('rh').addEventListener('change', function () { onDim('h'); });
    $('download').addEventListener('click', download);
    $('another').addEventListener('click', function () {
      S.file = S.decoded = S.processed = S.out = null;
      if (S.preview && S.preview.close) try { S.preview.close(); } catch (e) {}
      S.preview = null;
      $('work').hidden = true;
      $('intro').hidden = false;
      $('file').value = '';
      setStatus('');
    });
    window.addEventListener('resize', function () { if (S.decoded) paintCanvases(); });
  }

  function boot() {
    fillFormats();
    bindDrop();
    bindSplit();
    bindControls();
    loadPrefs().then(function () {
      $('format').value = S.format;
      $('quality').value = S.quality;
      $('lossless').checked = S.lossless;
      $('resizeOn').checked = S.resizeOn;
      $('resizeRow').hidden = !S.resizeOn;
      $('lock').checked = S.lock;
      syncFormatUi();
    });
  }

  boot();
})();
