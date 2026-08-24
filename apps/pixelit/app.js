/*
 * Pixel It chrome around giventofly's pixelit library.
 * Last ORIGINAL picture + settings are private (file is the save).
 * Take photo is a clip, never a live camera.
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  // Palettes from the original demo page (docs/js/main.js). Names are ours.
  var PALETTES = [
    [[7,5,5],[33,25,25],[82,58,42],[138,107,62],[193,156,77],[234,219,116],[160,179,53],[83,124,68],[66,60,86],[89,111,175],[107,185,182],[251,250,249],[184,170,176],[121,112,126],[148,91,40]],
    [[13,43,69],[32,60,86],[84,78,104],[141,105,122],[208,129,89],[255,170,94],[255,212,163],[255,236,214]],
    [[43,15,84],[171,31,101],[255,79,105],[255,247,248],[255,129,66],[255,218,69],[51,104,220],[73,231,236]],
    [[48,0,48],[96,40,120],[248,144,32],[248,240,136]],
    [[239,26,26],[172,23,23],[243,216,216],[177,139,139],[53,52,65],[27,26,29]],
    [[26,28,44],[93,39,93],[177,62,83],[239,125,87],[255,205,117],[167,240,112],[56,183,100],[37,113,121],[41,54,111],[59,93,201],[65,166,246],[115,239,247],[244,244,244],[148,176,194],[86,108,134],[51,60,87]],
    [[44,33,55],[118,68,98],[237,180,161],[169,104,104]],
    [[171,97,135],[235,198,134],[216,232,230],[101,219,115],[112,157,207],[90,104,125],[33,30,51]],
    [[140,143,174],[88,69,99],[62,33,55],[154,99,72],[215,155,125],[245,237,186],[192,199,65],[100,125,52],[228,148,58],[157,48,59],[210,100,113],[112,55,127],[126,196,193],[52,133,157],[23,67,75],[31,14,28]],
    [[94,96,110],[34,52,209],[12,126,69],[68,170,204],[138,54,34],[235,138,96],[0,0,0],[92,46,120],[226,61,105],[170,92,61],[255,217,63],[181,181,181],[255,255,255]],
    [[49,31,95],[22,135,167],[31,213,188],[237,255,177]],
    [[21,25,26],[138,76,88],[217,98,117],[230,184,193],[69,107,115],[75,151,166],[165,189,194],[255,245,247]]
  ];
  var PALETTE_NAMES = ['Earth','Ember','Neon','CGA','Crimson','Dawn','Rose','Garden','Classic','Arcade','Aqua','Blush'];
  var MAX_EDGE = 800;
  var SRC_CAP = 900000;

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var picDb = null;
  var timer = 0;
  var px = null;
  var loaded = false;
  var currentUrl = null;
  var srcDataUrl = null;
  var comparing = false;
  var settings = { scale: 8, greyscale: false, paletteOn: true, palette: 8 };

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

  function clampScale(n) {
    n = n | 0;
    if (n < 1) n = 1;
    if (n > 50) n = 50;
    return n;
  }

  function similarColor(rgb, palette) {
    var selected = palette[0];
    var best = colorSim(rgb, selected);
    var i, next;
    for (i = 1; i < palette.length; i++) {
      next = colorSim(rgb, palette[i]);
      if (next <= best) { selected = palette[i]; best = next; }
    }
    return selected;
  }

  function colorSim(a, b) {
    var d = 0, i, diff;
    for (i = 0; i < a.length; i++) {
      diff = a[i] - b[i];
      d += diff * diff;
    }
    return Math.sqrt(d);
  }

  function applyPaletteToPixels(data, palette) {
    var i, c;
    for (i = 0; i < data.length; i += 4) {
      c = similarColor([data[i], data[i + 1], data[i + 2]], palette);
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
    }
    return data;
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
    if (srcRow && srcRow.png) return srcRow.png;
    if (outRow && outRow.png) return outRow.png;
    return null;
  }

  function demoImage() {
    var c = root.document.createElement('canvas');
    c.width = 240; c.height = 160;
    var g = c.getContext('2d');
    var y, x, t;
    for (y = 0; y < 160; y++) {
      t = y / 160;
      g.fillStyle = t < 0.55
        ? 'rgb(' + (80 + t * 40) + ',' + (140 + t * 40) + ',' + (210 - t * 40) + ')'
        : 'rgb(' + (40 + t * 80) + ',' + (90 + t * 40) + ',' + (40) + ')';
      g.fillRect(0, y, 240, 1);
    }
    g.fillStyle = '#f2d36b';
    g.beginPath(); g.arc(50, 40, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2d6a3a';
    g.beginPath(); g.moveTo(0, 120); g.lineTo(80, 70); g.lineTo(160, 120); g.fill();
    g.fillStyle = '#3e7a44';
    g.beginPath(); g.moveTo(80, 140); g.lineTo(180, 60); g.lineTo(240, 140); g.fill();
    g.fillStyle = '#c45c3a';
    g.fillRect(170, 100, 36, 40);
    g.fillStyle = '#6b3a28';
    g.fillRect(182, 118, 10, 22);
    for (x = 0; x < 6; x++) {
      g.fillStyle = x % 2 ? '#f0ead8' : '#d9c48a';
      g.fillRect(174 + (x % 3) * 10, 104 + Math.floor(x / 3) * 10, 8, 8);
    }
    return c.toDataURL('image/png');
  }

  function showWork(on) {
    var empty = $('empty');
    var canvas = $('pixelitcanvas');
    var orig = $('origcanvas');
    var work = $('work');
    var hint = $('holdhint');
    if (empty) empty.hidden = !!on;
    if (canvas) canvas.hidden = !on;
    if (orig) orig.hidden = true;
    if (work) work.hidden = !on;
    if (hint) hint.hidden = !on;
  }

  function paintOriginal() {
    var img = $('pixelitimg');
    var c = $('origcanvas');
    if (!img || !c || !img.naturalWidth) return;
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
  }

  function setComparing(on) {
    if (!loaded) return;
    comparing = !!on;
    var out = $('pixelitcanvas');
    var orig = $('origcanvas');
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

  function convert() {
    if (!px || !loaded) return;
    var scale = clampScale(+$('blocksize').value || 8);
    settings.scale = scale;
    settings.greyscale = !!$('greyscale').checked;
    settings.paletteOn = !!$('palette').checked;
    $('blockvalue').textContent = String(scale);
    px.setScale(scale)
      .setPalette(PALETTES[settings.palette] || PALETTES[8])
      .draw()
      .pixelate();
    if (settings.greyscale) px.convertGrayscale();
    if (settings.paletteOn) px.convertPalette();
    var img = $('pixelitimg');
    var size = $('sizehint');
    if (size && img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      size.textContent = w + '×' + h + ' · block ' + scale;
    }
    persist();
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
        scale: settings.scale,
        greyscale: settings.greyscale,
        paletteOn: settings.paletteOn,
        palette: settings.palette,
        at: Date.now()
      }).catch(function () {});
    }
    if (picDb && srcDataUrl && srcDataUrl.length < SRC_CAP) {
      picDb.put({ id: 'src', png: srcDataUrl, at: Date.now() }).catch(function () {});
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
    var data = c.toDataURL('image/png');
    if (data.length > 800000) data = c.toDataURL('image/jpeg', 0.85);
    return data;
  }

  function loadFromUrl(url, alreadySrc) {
    var img = $('pixelitimg');
    if (currentUrl && currentUrl.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(currentUrl); } catch (e) {}
    }
    currentUrl = url;
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
      loaded = true;
      showWork(true);
      convert();
      say('Converted on this device.');
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
    if (!px || !px.drawto || !loaded) return;
    px.saveImage();
  }

  function paintPalettes() {
    var host = $('palettelist');
    if (!host) return;
    host.innerHTML = '';
    PALETTES.forEach(function (pal, i) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.className = 'palchip' + (i === settings.palette ? ' on' : '');
      b.setAttribute('aria-label', PALETTE_NAMES[i] || ('Palette ' + (i + 1)));
      var sw = root.document.createElement('span');
      sw.className = 'swatch';
      pal.forEach(function (c) {
        var d = root.document.createElement('i');
        d.style.background = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
        sw.appendChild(d);
      });
      b.appendChild(sw);
      var name = root.document.createElement('span');
      name.textContent = PALETTE_NAMES[i] || ('Palette ' + (i + 1));
      b.appendChild(name);
      b.addEventListener('click', function () {
        settings.palette = i;
        settings.paletteOn = true;
        $('palette').checked = true;
        host.querySelectorAll('.palchip').forEach(function (el) { el.classList.remove('on'); });
        b.classList.add('on');
        convert();
      });
      host.appendChild(b);
    });
  }

  function applySettings(row) {
    if (!row) return;
    if (row.scale != null) {
      settings.scale = clampScale(row.scale);
      $('blocksize').value = String(settings.scale);
      $('blockvalue').textContent = String(settings.scale);
    }
    if (typeof row.greyscale === 'boolean') {
      settings.greyscale = row.greyscale;
      $('greyscale').checked = row.greyscale;
    }
    if (typeof row.paletteOn === 'boolean') {
      settings.paletteOn = row.paletteOn;
      $('palette').checked = row.paletteOn;
    }
    if (row.palette != null) settings.palette = row.palette | 0;
  }

  function bindStageHold() {
    var stage = $('stage');
    if (!stage) return;
    function down(e) {
      if (!loaded) return;
      if (e.target && (e.target.closest && e.target.closest('#empty'))) return;
      setComparing(true);
    }
    function up() { setComparing(false); }
    stage.addEventListener('pointerdown', down);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
  }

  function boot() {
    if (typeof pixelit !== 'function') {
      say('Pixel It library did not load.', true);
      return;
    }
    px = new pixelit({
      from: $('pixelitimg'),
      to: $('pixelitcanvas'),
      scale: settings.scale,
      palette: PALETTES[settings.palette]
    });
    paintPalettes();
    showWork(false);

    var fileEl = $('file');
    function pickFile() { if (fileEl) fileEl.click(); }
    $('chooseBtn') && $('chooseBtn').addEventListener('click', pickFile);
    $('emptyChoose') && $('emptyChoose').addEventListener('click', pickFile);
    $('emptyPhoto') && $('emptyPhoto').addEventListener('click', takePhoto);
    $('sampleBtn') && $('sampleBtn').addEventListener('click', function () {
      loadFromUrl(demoImage(), true);
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
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (f) loadFile(f);
    });
    $('blocksize').addEventListener('input', convert);
    $('greyscale').addEventListener('change', convert);
    $('palette').addEventListener('change', convert);
    $('photoBtn').addEventListener('click', takePhoto);
    $('saveBtn').addEventListener('click', downloadPng);
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
        applySettings(row);
        paintPalettes();
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
      if (url) loadFromUrl(url, true);
      else showWork(false);
    });
  }

  root.PixelitApp = {
    PALETTES: PALETTES,
    PALETTE_NAMES: PALETTE_NAMES,
    MAX_EDGE: MAX_EDGE,
    colorSim: colorSim,
    similarColor: similarColor,
    clampScale: clampScale,
    applyPaletteToPixels: applyPaletteToPixels,
    downscaleNeed: downscaleNeed,
    pickRestoreUrl: pickRestoreUrl,
    demoImage: demoImage
  };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
