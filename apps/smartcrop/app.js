/*
 * Smartcrop chrome around jwagner/smartcrop.js.
 * Last ORIGINAL picture + frame are private (file is the save).
 * Take photo is a clip, never a live camera.
 * Skin blobs from the library's own skin channel are used as face boosts.
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var ASPECTS = [
    { id: 'square', name: '1:1', hint: 'Avatar', w: 1, h: 1 },
    { id: 'banner', name: '3:1', hint: 'Banner', w: 3, h: 1 },
    { id: 'wide', name: '16:9', hint: 'Wide', w: 16, h: 9 },
    { id: 'photo', name: '4:3', hint: 'Photo', w: 4, h: 3 },
    { id: 'portrait', name: '4:5', hint: 'Portrait', w: 4, h: 5 },
    { id: 'story', name: '9:16', hint: 'Story', w: 9, h: 16 },
    { id: 'card', name: '2:1', hint: 'Card', w: 2, h: 1 }
  ];
  var MAX_EDGE = 960;
  var SRC_CAP = 900000;
  var CAND_N = 4;
  var GOLD = '#e8b848';
  var FACE = '#7ec8e8';

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var picDb = null;
  var timer = 0;
  var srcImg = null;
  var srcDataUrl = null;
  var loaded = false;
  var busy = false;
  var pending = false;
  var comparing = false;
  var heatmap = false;
  var faces = [];
  var crops = [];
  var selected = 0;
  var lastResult = null;
  var settings = { aspect: 'square', minScale: 1, thirds: true };

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

  function aspectById(id) {
    var i;
    for (i = 0; i < ASPECTS.length; i++) if (ASPECTS[i].id === id) return ASPECTS[i];
    return ASPECTS[0];
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

  function skinBlobs(data, width, height, srcW, srcH) {
    var scaleX = srcW / width;
    var scaleY = srcH / height;
    var n = width * height;
    var seen = new Uint8Array(n);
    var boxes = [];
    var thresh = 40;
    var x, y, i, p, px, py, minx, maxx, miny, maxy, area, bw, bh, ar, pad, nx, ny, ni;
    var stack;
    function skinAt(sx, sy) {
      return data[(sy * width + sx) * 4] > thresh;
    }
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        i = y * width + x;
        if (seen[i] || !skinAt(x, y)) continue;
        stack = [i];
        seen[i] = 1;
        minx = x; maxx = x; miny = y; maxy = y; area = 0;
        while (stack.length) {
          p = stack.pop();
          px = p % width;
          py = (p / width) | 0;
          area++;
          if (px < minx) minx = px;
          if (px > maxx) maxx = px;
          if (py < miny) miny = py;
          if (py > maxy) maxy = py;
          if (px > 0) {
            ni = py * width + (px - 1);
            if (!seen[ni] && skinAt(px - 1, py)) { seen[ni] = 1; stack.push(ni); }
          }
          if (px + 1 < width) {
            ni = py * width + (px + 1);
            if (!seen[ni] && skinAt(px + 1, py)) { seen[ni] = 1; stack.push(ni); }
          }
          if (py > 0) {
            ni = (py - 1) * width + px;
            if (!seen[ni] && skinAt(px, py - 1)) { seen[ni] = 1; stack.push(ni); }
          }
          if (py + 1 < height) {
            ni = (py + 1) * width + px;
            if (!seen[ni] && skinAt(px, py + 1)) { seen[ni] = 1; stack.push(ni); }
          }
        }
        bw = maxx - minx + 1;
        bh = maxy - miny + 1;
        if (area < 80) continue;
        ar = bw / bh;
        if (ar < 0.35 || ar > 2.8) continue;
        if (area / (bw * bh) < 0.28) continue;
        pad = Math.max(bw, bh) * 0.18;
        nx = Math.max(0, (minx - pad) * scaleX);
        ny = Math.max(0, (miny - pad) * scaleY);
        boxes.push({
          x: nx,
          y: ny,
          width: Math.min(srcW - nx, (bw + pad * 2) * scaleX),
          height: Math.min(srcH - ny, (bh + pad * 2) * scaleY),
          weight: 1,
          area: area
        });
      }
    }
    boxes.sort(function (a, b) { return b.area - a.area; });
    return boxes.slice(0, 6);
  }

  function demoImage() {
    var c = root.document.createElement('canvas');
    c.width = 480; c.height = 320;
    var g = c.getContext('2d');
    var x, y, t, dx, dy;
    for (y = 0; y < 320; y++) {
      t = y / 320;
      g.fillStyle = t < 0.58
        ? 'rgb(' + (70 + t * 90) + ',' + (110 + t * 40) + ',' + (190 - t * 50) + ')'
        : 'rgb(' + (40 + t * 50) + ',' + (90 + t * 30) + ',' + (40) + ')';
      g.fillRect(0, y, 480, 1);
    }
    g.fillStyle = '#f2c45a';
    g.beginPath(); g.arc(390, 58, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f6a38';
    g.beginPath(); g.moveTo(240, 320); g.lineTo(360, 150); g.lineTo(480, 320); g.fill();
    g.fillStyle = '#3e7a44';
    g.beginPath(); g.moveTo(300, 320); g.lineTo(440, 170); g.lineTo(480, 320); g.fill();
    g.fillStyle = '#c45c3a';
    g.fillRect(330, 200, 48, 70);
    g.fillStyle = '#6b3a28';
    g.fillRect(348, 232, 12, 38);
    g.fillStyle = '#d9c48a';
    for (x = 0; x < 4; x++) g.fillRect(336 + (x % 2) * 16, 208 + ((x / 2) | 0) * 16, 12, 12);
    g.fillStyle = '#c48a62';
    g.beginPath(); g.ellipse(108, 230, 42, 70, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8b896';
    g.beginPath(); g.arc(108, 118, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2418';
    g.beginPath(); g.ellipse(108, 96, 38, 22, 0, Math.PI, 0, true); g.fill();
    g.fillStyle = '#2a1c14';
    g.beginPath(); g.arc(94, 114, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(122, 114, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a5a40';
    g.lineWidth = 2;
    g.beginPath(); g.arc(108, 128, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = '#f0e4d4';
    g.beginPath(); g.ellipse(108, 250, 28, 18, 0, 0, Math.PI * 2); g.fill();
    for (x = 0; x < 18; x++) {
      dx = 300 + (x * 47) % 160;
      dy = 20 + (x * 31) % 120;
      g.fillStyle = 'rgba(255,' + (80 + (x * 13) % 120) + ',' + ((x * 19) % 80) + ',0.55)';
      g.fillRect(dx, dy, 10, 10);
    }
    return c.toDataURL('image/jpeg', 0.92);
  }

  function showWork(on) {
    var empty = $('empty');
    var overlay = $('overlay');
    var result = $('result');
    var work = $('work');
    var hint = $('holdhint');
    var cands = $('cands');
    var wrap = $('resultwrap');
    if (empty) empty.hidden = !!on;
    if (overlay) overlay.hidden = !on;
    if (wrap) wrap.hidden = !on;
    if (result) result.hidden = false;
    if (work) work.hidden = !on;
    if (hint) hint.hidden = !on;
    if (cands) cands.hidden = !on;
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
        aspect: settings.aspect,
        minScale: settings.minScale,
        thirds: settings.thirds,
        at: Date.now()
      }).catch(function () {});
    }
    if (picDb && srcDataUrl && srcDataUrl.length < SRC_CAP) {
      picDb.put({ id: 'src', jpg: srcDataUrl, at: Date.now() }).catch(function () {});
    }
  }

  function encodeSrcFromImage(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var need = downscaleNeed(w, h, MAX_EDGE);
    var c = root.document.createElement('canvas');
    c.width = need.w;
    c.height = need.h;
    c.getContext('2d').drawImage(img, 0, 0, need.w, need.h);
    var data = c.toDataURL('image/jpeg', 0.88);
    if (data.length > 800000) data = c.toDataURL('image/jpeg', 0.7);
    return data;
  }

  function cropOptions(boost) {
    var a = aspectById(settings.aspect);
    return {
      width: a.w * 100,
      height: a.h * 100,
      minScale: settings.minScale,
      ruleOfThirds: settings.thirds,
      debug: true,
      boost: boost && boost.length ? boost : undefined
    };
  }

  function scoreOf(c) {
    return c && c.score && typeof c.score.total === 'number' ? c.score.total : -Infinity;
  }

  function paintOverlay() {
    var canvas = $('overlay');
    if (!canvas || !srcImg || !lastResult || !lastResult.topCrop) return;
    var w = srcImg.naturalWidth || srcImg.width;
    var h = srcImg.naturalHeight || srcImg.height;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(srcImg, 0, 0, w, h);

    var crop = crops[selected] || lastResult.topCrop;
    var dbg = lastResult.debugOutput;
    var i, p, x, y, b, I, lum;

    if (heatmap && dbg) {
      var sx = w / dbg.width;
      var sy = h / dbg.height;
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      var dw = dbg.width, dh = dbg.height, dd = dbg.data;
      var debugCrop = lastResult.debugTopCrop || crop;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var dx = Math.min(dw - 1, (x / sx) | 0);
          var dy = Math.min(dh - 1, (y / sy) | 0);
          p = (dy * dw + dx) * 4;
          i = (y * w + x) * 4;
          lum = (d[i] + d[i + 1] + d[i + 2]) / 12;
          d[i] = Math.min(255, lum + dd[p] * 0.9);
          d[i + 1] = Math.min(255, lum + dd[p + 1] * 0.7);
          d[i + 2] = Math.min(255, lum + dd[p + 2] * 0.9);
        }
      }
      ctx.putImageData(img, 0, 0);
      if (root.smartcrop && lastResult.debugOptions && debugCrop) {
        ctx.fillStyle = 'rgba(232,184,72,0.12)';
        for (y = 0; y < dh; y += 2) {
          for (x = 0; x < dw; x += 2) {
            I = root.smartcrop.importance(lastResult.debugOptions, debugCrop, x, y);
            if (I > 0.4) {
              ctx.fillRect(x * sx, y * sy, sx * 2, sy * 2);
            }
          }
        }
      }
    } else {
      ctx.fillStyle = 'rgba(8, 6, 4, 0.55)';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(crop.x, crop.y, crop.width, crop.height);
      ctx.clip();
      ctx.drawImage(srcImg, 0, 0, w, h);
      ctx.restore();
    }

    for (i = 0; i < faces.length; i++) {
      b = faces[i];
      ctx.strokeStyle = FACE;
      ctx.lineWidth = Math.max(2, Math.round(w / 280));
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.width, b.height);
    }

    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(3, Math.round(w / 180));
    ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.width, crop.height);

    paintResult(crop);
  }

  function paintResult(crop) {
    var canvas = $('result');
    if (!canvas || !srcImg || !crop) return;
    var cw = Math.max(1, crop.width | 0);
    var ch = Math.max(1, crop.height | 0);
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext('2d').drawImage(
      srcImg,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, cw, ch
    );
  }

  function paintCands() {
    var host = $('cands');
    if (!host) return;
    host.innerHTML = '';
    var i, c, btn, thumb, g, sc, crop;
    for (i = 0; i < crops.length; i++) {
      crop = crops[i];
      btn = root.document.createElement('button');
      btn.type = 'button';
      btn.className = 'cand' + (i === selected ? ' on' : '');
      btn.setAttribute('aria-label', 'Crop ' + (i + 1));
      thumb = root.document.createElement('canvas');
      thumb.width = 72;
      thumb.height = 72;
      g = thumb.getContext('2d');
      g.fillStyle = '#0b0a0e';
      g.fillRect(0, 0, 72, 72);
      if (srcImg) {
        var scale = Math.max(72 / crop.width, 72 / crop.height);
        var dw = crop.width * scale, dh = crop.height * scale;
        g.drawImage(
          srcImg,
          crop.x, crop.y, crop.width, crop.height,
          (72 - dw) / 2, (72 - dh) / 2, dw, dh
        );
      }
      btn.appendChild(thumb);
      sc = root.document.createElement('span');
      sc.className = 'sc';
      c = scoreOf(crop);
      sc.textContent = c === -Infinity ? '' : String(Math.round(c * 1000));
      btn.appendChild(sc);
      (function (idx) {
        btn.addEventListener('click', function () {
          selected = idx;
          paintCands();
          paintOverlay();
          sizeHint();
        });
      })(i);
      host.appendChild(btn);
    }
  }

  function sizeHint() {
    var el = $('sizehint');
    if (!el || !srcImg) return;
    var crop = crops[selected] || (lastResult && lastResult.topCrop);
    var a = aspectById(settings.aspect);
    var w = srcImg.naturalWidth || srcImg.width;
    var h = srcImg.naturalHeight || srcImg.height;
    var faceN = faces.length;
    var bits = w + '×' + h;
    if (crop) bits += ' → ' + (crop.width | 0) + '×' + (crop.height | 0);
    bits += ' · ' + a.name + ' ' + a.hint;
    if (faceN) bits += ' · ' + faceN + (faceN === 1 ? ' face-like region' : ' face-like regions');
    el.textContent = bits;
  }

  function setComparing(on) {
    if (!loaded) return;
    comparing = !!on;
    var stage = $('stage');
    var hint = $('holdhint');
    if (stage) stage.classList.toggle('comparing', comparing);
    if (hint) hint.textContent = comparing ? 'Crop' : 'Hold for the crop, full size';
  }

  function runCrop() {
    if (!srcImg || !root.smartcrop) return;
    if (busy) { pending = true; return; }
    busy = true;
    pending = false;
    var lib = root.smartcrop;
    var w = srcImg.naturalWidth || srcImg.width;
    var h = srcImg.naturalHeight || srcImg.height;
    lib.crop(srcImg, cropOptions(null)).then(function (probe) {
      var dbg = probe.debugOutput;
      var blobs = [];
      if (dbg && dbg.data) blobs = skinBlobs(dbg.data, dbg.width, dbg.height, w, h);
      faces = blobs;
      return lib.crop(srcImg, cropOptions(blobs)).then(function (result) {
        lastResult = result;
        var list = (result.crops || [result.topCrop]).slice();
        list.sort(function (a, b) { return scoreOf(b) - scoreOf(a); });
        var uniq = [];
        var i, c, j, hit;
        for (i = 0; i < list.length; i++) {
          c = list[i];
          if (!c) continue;
          hit = false;
          for (j = 0; j < uniq.length; j++) {
            if (Math.abs(uniq[j].x - c.x) < 8 && Math.abs(uniq[j].y - c.y) < 8 &&
                Math.abs(uniq[j].width - c.width) < 8) { hit = true; break; }
          }
          if (!hit) uniq.push(c);
          if (uniq.length >= CAND_N) break;
        }
        if (result.topCrop && uniq.indexOf(result.topCrop) !== 0) {
          uniq = [result.topCrop].concat(uniq.filter(function (x) { return x !== result.topCrop; }));
          if (uniq.length > CAND_N) uniq = uniq.slice(0, CAND_N);
        }
        crops = uniq;
        selected = 0;
        paintOverlay();
        paintCands();
        sizeHint();
        persist();
        var n = faces.length;
        say(n ? ('Cropped on this device · ' + n + (n === 1 ? ' face-like region kept in frame.' : ' face-like regions kept in frame.')) : 'Cropped on this device.');
      });
    }).then(function () {
      busy = false;
      if (pending) runCrop();
    }, function (err) {
      busy = false;
      say((err && err.message) || 'Could not crop that picture.', true);
    });
  }

  function adoptImage(img, dataUrl) {
    srcImg = img;
    srcDataUrl = dataUrl || encodeSrcFromImage(img);
    loaded = true;
    showWork(true);
    setComparing(false);
    runCrop();
  }

  function loadFromUrl(url, alreadySrc) {
    var img = new Image();
    img.onload = function () {
      var data = alreadySrc ? url : encodeSrcFromImage(img);
      if (!alreadySrc && data && data !== url) {
        var small = new Image();
        small.onload = function () { adoptImage(small, data); };
        small.onerror = function () { adoptImage(img, data); };
        small.src = data;
        return;
      }
      adoptImage(img, data);
    };
    img.onerror = function () { say('That file is not a picture.', true); };
    img.src = url;
  }

  function loadBlob(blob) {
    if (!blob) return;
    if (blob.type && blob.type.indexOf('image/') !== 0) {
      say('That file is not a picture.', true);
      return;
    }
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var data = encodeSrcFromImage(img);
      var small = new Image();
      small.onload = function () { adoptImage(small, data); };
      small.onerror = function () { adoptImage(img, data); };
      small.src = data;
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      say('That file is not a picture.', true);
    };
    img.src = url;
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

  function downloadJpeg() {
    var canvas = $('result');
    var crop = crops[selected] || (lastResult && lastResult.topCrop);
    if (!loaded || !crop || !srcImg) return;
    paintResult(crop);
    var done = function (blob) {
      if (!blob) return;
      var a = root.document.createElement('a');
      a.download = 'smartcrop.jpg';
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 1500);
      var api = root.gifos;
      say('JPEG saved on this device.');
    };
    if (canvas.toBlob) canvas.toBlob(done, 'image/jpeg', 0.92);
    else {
      var url = canvas.toDataURL('image/jpeg', 0.92);
      var a = root.document.createElement('a');
      a.download = 'smartcrop.jpg';
      a.href = url;
      a.click();
      say('JPEG saved on this device.');
    }
  }

  function paintAspects() {
    var host = $('aspectlist');
    if (!host) return;
    host.innerHTML = '';
    ASPECTS.forEach(function (a) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.className = 'achip' + (a.id === settings.aspect ? ' on' : '');
      b.setAttribute('aria-label', a.name + ' ' + a.hint);
      b.innerHTML = a.name + '<small>' + a.hint + '</small>';
      b.addEventListener('click', function () {
        settings.aspect = a.id;
        paintAspects();
        runCrop();
      });
      host.appendChild(b);
    });
  }

  function writeControls() {
    var s = $('minScale');
    var v = $('scaleVal');
    var t = $('thirds');
    var h = $('heatmap');
    if (s) s.value = String(settings.minScale);
    if (v) v.textContent = settings.minScale.toFixed(2).replace(/0+$/, '').replace(/\.$/, '.0');
    if (t) t.checked = !!settings.thirds;
    if (h) h.checked = !!heatmap;
    paintAspects();
  }

  function applySettings(row) {
    if (!row) return;
    if (row.aspect && aspectById(row.aspect).id === row.aspect) settings.aspect = row.aspect;
    if (row.minScale != null) settings.minScale = clamp(row.minScale, 0.5, 1);
    if (typeof row.thirds === 'boolean') settings.thirds = row.thirds;
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
    if (!root.smartcrop || typeof root.smartcrop.crop !== 'function') {
      say('smartcrop.js did not load.', true);
      return;
    }
    paintAspects();
    showWork(false);
    writeControls();

    var fileEl = $('file');
    function pickFile() { if (fileEl) fileEl.click(); }
    $('chooseBtn') && $('chooseBtn').addEventListener('click', pickFile);
    $('emptyChoose') && $('emptyChoose').addEventListener('click', pickFile);
    $('emptyPhoto') && $('emptyPhoto').addEventListener('click', takePhoto);
    $('photoBtn') && $('photoBtn').addEventListener('click', takePhoto);
    $('saveBtn') && $('saveBtn').addEventListener('click', downloadJpeg);
    $('sampleBtn') && $('sampleBtn').addEventListener('click', function () {
      loadFromUrl(demoImage(), true);
    });
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
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (f) loadBlob(f);
      fileEl.value = '';
    });
    var scaleTimer = 0;
    $('minScale').addEventListener('input', function () {
      settings.minScale = clamp(this.value, 0.5, 1);
      writeControls();
      if (scaleTimer) clearTimeout(scaleTimer);
      scaleTimer = setTimeout(function () { scaleTimer = 0; runCrop(); }, 180);
    });
    $('thirds').addEventListener('change', function () {
      settings.thirds = !!this.checked;
      runCrop();
    });
    $('heatmap').addEventListener('change', function () {
      heatmap = !!this.checked;
      paintOverlay();
    });
    root.document.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var i, it;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        if (it.type && it.type.indexOf('image/') === 0) {
          e.preventDefault();
          loadBlob(it.getAsFile());
          return;
        }
      }
    });
    bindStageHold();

    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (heatmap) {
          heatmap = false;
          writeControls();
          paintOverlay();
          return true;
        }
        if (comparing) {
          setComparing(false);
          return true;
        }
        return false;
      });
    }

    var picP = picDb ? picDb.getAll() : Promise.resolve([]);
    var saveP = saveDb ? saveDb.getAll() : Promise.resolve([]);
    Promise.all([picP, saveP]).then(function (pair) {
      var pics = pair[0] || [];
      var saves = pair[1] || [];
      var srcRow = null, outRow = null, state = null, i;
      for (i = 0; i < pics.length; i++) {
        if (pics[i].id === 'src') srcRow = pics[i];
        if (pics[i].id === 'out') outRow = pics[i];
      }
      for (i = 0; i < saves.length; i++) if (saves[i].id === 'state') state = saves[i];
      applySettings(state);
      writeControls();
      var url = pickRestoreUrl(srcRow, outRow);
      if (url) loadFromUrl(url, true);
    }).catch(function () {});
  }

  root.SmartcropApp = {
    ASPECTS: ASPECTS,
    clamp: clamp,
    aspectById: aspectById,
    downscaleNeed: downscaleNeed,
    pickRestoreUrl: pickRestoreUrl,
    skinBlobs: skinBlobs,
    cropOptions: function () { return cropOptions(faces); }
  };

  if (root.document && root.document.getElementById && root.document.getElementById('stage')) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : this);
