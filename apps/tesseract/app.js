/*
 * Tesseract OCR — photo/page → text, on this device.
 *
 * The engine (tesseract.js-core WASM) is packed under `.assets/` and handed
 * over by gifos.assets() as a transferred ArrayBuffer. English is an optional
 * pin: the first Read downloads ~15 MB, hash-verified by the OS, then cached.
 * This app never fetches. A blob worker runs the engine so a page does not
 * freeze the UI (worker-src blob:, the wasm hatch).
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m, warn) {
    var el = $('status');
    if (el) { el.textContent = m || ''; el.style.color = warn ? '#ff9a6b' : ''; }
  }
  function setEngine(html) { var el = $('engine'); if (el) el.innerHTML = html || ''; }
  function setBar(frac) {
    var bar = $('bar'), fill = $('barfill');
    if (!bar || !fill) return;
    if (frac == null) { bar.classList.remove('on'); fill.style.width = '0'; return; }
    bar.classList.add('on');
    fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }

  var LANG = 'eng';
  var LANG_ASSET = 'eng.traineddata';
  var LANG_BYTES = 15400601;
  var WASM_ASSET = 'tesseract-core.wasm';
  var MAX_SIDE = 2400;
  var HIST_KEEP = 20;

  var worker = null;
  var booted = false;
  var langReady = false;
  var pending = null;
  var currentFile = null;
  var currentUrl = null;
  var busy = false;

  function hasGifos() { return !!(window.gifos && gifos.assets); }

  function assetBytes(path) {
    if (!hasGifos()) {
      return Promise.reject(new Error('This app needs to run inside GifOS to reach its engine and language data.'));
    }
    return gifos.assets(path).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('“' + path + '” came back empty.');
      return buf;
    }, function (e) {
      throw new Error('Could not read “' + path + '”: ' + (e && e.message || e));
    });
  }

  function waitFor(type) {
    return new Promise(function (res, rej) {
      pending = { type: type, res: res, rej: rej };
    });
  }

  function onWorkerMessage(e) {
    var d = e.data || {};
    if (d.type === 'progress') {
      setBar(0.35 + 0.65 * (d.progress || 0));
      return;
    }
    if (d.type === 'error') {
      var err = new Error(d.error || 'Worker error');
      if (pending) { pending.rej(err); pending = null; }
      else setStatus(err.message, true);
      return;
    }
    if (pending && pending.type === d.type) {
      pending.res(d);
      pending = null;
      return;
    }
  }

  function ensureWorker() {
    if (worker) return Promise.resolve();
    if (!window.OCR_WORKER_SRC) return Promise.reject(new Error('The OCR worker did not load.'));
    var blob = new Blob([window.OCR_WORKER_SRC], { type: 'text/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = onWorkerMessage;
    worker.onerror = function (ev) {
      var msg = (ev && ev.message) || 'OCR worker failed';
      if (pending) { pending.rej(new Error(msg)); pending = null; }
      else setStatus(msg, true);
    };
    return Promise.resolve();
  }

  function bootEngine() {
    if (booted) return Promise.resolve();
    setStatus('Starting the OCR engine…');
    setBar(0.08);
    return ensureWorker().then(function () {
      return assetBytes(WASM_ASSET);
    }).then(function (wasm) {
      var p = waitFor('booted');
      worker.postMessage({ type: 'boot', wasm: wasm }, [wasm]);
      return p;
    }).then(function () {
      booted = true;
    });
  }

  function loadLang() {
    if (langReady) return Promise.resolve();
    setStatus('Loading English… the first time this downloads ' + (LANG_BYTES / 1e6).toFixed(1) + ' MB, then it stays on this computer.');
    setBar(0.18);
    return bootEngine().then(function () {
      return assetBytes(LANG_ASSET);
    }).then(function (bytes) {
      setStatus('Initialising English…');
      setBar(0.3);
      var p = waitFor('lang-ready');
      worker.postMessage({ type: 'lang', code: LANG, bytes: bytes }, [bytes]);
      return p;
    }).then(function (msg) {
      langReady = true;
      var ver = msg && msg.version ? 'Tesseract ' + msg.version : 'Tesseract';
      setEngine(ver + ' · English · on this device');
    });
  }

  function fileToPng(file) {
    var load = (typeof createImageBitmap === 'function')
      ? createImageBitmap(file)
      : new Promise(function (res, rej) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); res(img); };
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Could not decode the picture.')); };
        img.src = url;
      });
    return load.then(function (bmp) {
      var w = bmp.width, h = bmp.height;
      if (!w || !h) throw new Error('The picture has no size.');
      var scale = 1;
      if (Math.max(w, h) > MAX_SIDE) scale = MAX_SIDE / Math.max(w, h);
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      var c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      var ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0, cw, ch);
      if (bmp.close) try { bmp.close(); } catch (e) {}
      return new Promise(function (res, rej) {
        c.toBlob(function (blob) {
          if (!blob) return rej(new Error('Could not encode the picture.'));
          blob.arrayBuffer().then(res, rej);
        }, 'image/png');
      });
    });
  }

  function showFile(file) {
    currentFile = file;
    $('read').disabled = !file || busy;
    $('preview').hidden = !file;
    $('drop').querySelector('b').textContent = file ? file.name : 'Drop a picture here';
    if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
    if (file) {
      currentUrl = URL.createObjectURL(file);
      $('thumb').src = currentUrl;
    }
    updateSplit();
  }

  function updateSplit() {
    var split = document.querySelector('.split');
    var both = !$('preview').hidden && !$('outwrap').hidden;
    if (split) split.classList.toggle('has-both', both);
  }

  function setResult(text, extra) {
    $('out').value = text || '';
    $('outwrap').hidden = false;
    $('copy').disabled = !text;
    $('save').disabled = !text;
    var bits = [];
    if (extra && extra.confidence != null) bits.push(Math.round(extra.confidence) + '% confident');
    if (extra && extra.ms != null) bits.push((extra.ms / 1000).toFixed(1) + 's');
    if (extra && extra.rotateRadians && Math.abs(extra.rotateRadians) >= 0.005) {
      bits.push('straightened ' + (extra.rotateRadians * 180 / Math.PI).toFixed(1) + '°');
    }
    $('meta').textContent = bits.length ? '· ' + bits.join(' · ') : '';
    updateSplit();
  }

  function readNow() {
    if (!currentFile || busy) return;
    busy = true;
    $('read').disabled = true;
    var t0 = Date.now();
    setStatus('Preparing the picture…');
    setBar(0.04);
    fileToPng(currentFile).then(function (png) {
      return loadLang().then(function () {
        setStatus('Reading…');
        setBar(0.35);
        var p = waitFor('result');
        worker.postMessage({
          type: 'recognize',
          image: png,
          opts: {
            psm: $('psm').value,
            rotateAuto: $('rotate').checked
          }
        }, [png]);
        return p;
      });
    }).then(function (out) {
      var text = (out && out.text || '').replace(/\u000c/g, '').replace(/[ \t]+\n/g, '\n').trim();
      var extra = { confidence: out && out.confidence, ms: Date.now() - t0, rotateRadians: out && out.rotateRadians };
      setResult(text, extra);
      setBar(null);
      if (!text) setStatus('No text found. Try a sharper photo, or a different layout mode.', true);
      else setStatus('Done.');
      remember(currentFile.name, text, extra);
    }).catch(function (e) {
      setBar(null);
      setStatus(e && e.message || String(e), true);
    }).then(function () {
      busy = false;
      $('read').disabled = !currentFile;
    });
  }

  function prefsDb() { try { return window.gifos && gifos.db('prefs'); } catch (e) { return null; } }
  function histDb() { try { return window.gifos && gifos.db('history'); } catch (e) { return null; } }

  function savePrefs() {
    var db = prefsDb();
    if (!db) return;
    db.put({ id: 'ui', psm: $('psm').value, rotate: $('rotate').checked }).catch(function () {});
  }
  function loadPrefs() {
    var db = prefsDb();
    if (!db) return;
    db.getAll().then(function (rows) {
      var r = (rows || []).filter(function (x) { return x && x.id === 'ui'; })[0];
      if (!r) return;
      if (r.psm) $('psm').value = String(r.psm);
      if (typeof r.rotate === 'boolean') $('rotate').checked = r.rotate;
    }).catch(function () {});
  }

  function remember(name, text, extra) {
    var db = histDb();
    if (!db || !text) return;
    var row = {
      id: 'h-' + Date.now(),
      name: name || 'picture',
      text: text.slice(0, 20000),
      confidence: extra && extra.confidence,
      created: Date.now()
    };
    db.put(row).then(function () { return db.getAll(); }).then(function (rows) {
      rows = (rows || []).slice().sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
      var extraRows = rows.slice(HIST_KEEP);
      extraRows.forEach(function (x) { db.delete(x.id); });
      renderHist(rows.slice(0, HIST_KEEP));
    }).catch(function () {});
  }

  function renderHist(rows) {
    var host = $('histlist');
    if (!host) return;
    host.innerHTML = '';
    if (!rows || !rows.length) { $('history').hidden = true; return; }
    $('history').hidden = false;
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var when = document.createElement('div');
      when.className = 'when';
      when.textContent = (r.name || 'picture') + ' · ' + new Date(r.created || 0).toLocaleString();
      var preview = document.createElement('div');
      preview.textContent = (r.text || '').slice(0, 160).replace(/\s+/g, ' ');
      li.appendChild(when);
      li.appendChild(preview);
      li.addEventListener('click', function () {
        setResult(r.text || '', { confidence: r.confidence });
        setStatus('Restored a previous reading from this device.');
      });
      host.appendChild(li);
    });
  }

  function loadHist() {
    var db = histDb();
    if (!db) return;
    db.getAll().then(function (rows) {
      rows = (rows || []).slice().sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
      renderHist(rows.slice(0, HIST_KEEP));
    }).catch(function () {});
  }

  function copyOut() {
    var t = $('out').value;
    if (!t) return;
    var ok = function () { setStatus('Copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok, function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    $('out').select();
    try { document.execCommand('copy'); setStatus('Copied.'); } catch (e) { setStatus('Copy failed.', true); }
  }

  function saveTxt() {
    var t = $('out').value;
    if (!t) return;
    var name = ((currentFile && currentFile.name) || 'reading').replace(/\.[^.]+$/, '') + '.txt';
    var blob = new Blob([t], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---- wiring ---------------------------------------------------------------
  var drop = $('drop'), fileEl = $('file');
  drop.addEventListener('click', function () { fileEl.click(); });
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('over');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { showFile(f); setStatus('Ready — tap Read text.'); }
  });
  fileEl.addEventListener('change', function () {
    var f = fileEl.files && fileEl.files[0];
    if (f) { showFile(f); setStatus('Ready — tap Read text.'); }
  });
  $('read').addEventListener('click', readNow);
  $('copy').addEventListener('click', copyOut);
  $('save').addEventListener('click', saveTxt);
  $('psm').addEventListener('change', savePrefs);
  $('rotate').addEventListener('change', savePrefs);

  loadPrefs();
  loadHist();
  if (!hasGifos()) {
    setStatus('Open this app from GifOS — the engine and English data live in the OS asset store, not on the network.', true);
  } else {
    setStatus('Drop a picture to begin. English downloads once, the first time you read a page.');
  }
})();
