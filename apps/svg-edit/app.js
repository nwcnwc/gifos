// SVG-Edit — GifOS shell: persistence, Open/Save/PNG, invite as a shared SVG.
(function (root) {
  'use strict';

  var DOC_ID = 'drawing';
  var SAVE_MS = 450;
  var statusEl = document.getElementById('g-status');
  var fileEl = document.getElementById('g-file');
  var editor = null;
  var canvas = null;
  var docDb = null;
  var me = { id: 'local', name: '' };
  var owner = true;
  var shared = false;
  var saveTimer = null;
  var lastSvg = '';
  var lastRev = 0;
  var applying = false;
  var dragging = 0;
  var queuedRemote = null;
  var ready = false;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function canvasApi() {
    return editor && (editor.svgCanvas || editor.canvas) || null;
  }

  function currentSvg() {
    var c = canvasApi();
    if (!c) return '';
    try {
      if (typeof c.getSvgString === 'function') return c.getSvgString() || '';
      if (typeof c.svgCanvasToString === 'function') return c.svgCanvasToString() || '';
    } catch (e) {}
    return '';
  }

  function loadSvg(str) {
    if (!str || !editor) return;
    applying = true;
    var p;
    try {
      if (typeof editor.loadFromString === 'function') p = editor.loadFromString(str, { noAlert: true });
      else if (typeof editor.loadSvgString === 'function') p = editor.loadSvgString(str, { noAlert: true });
      else {
        var c = canvasApi();
        if (c && typeof c.setSvgString === 'function') c.setSvgString(str);
      }
    } catch (e) {
      applying = false;
      return;
    }
    Promise.resolve(p).catch(function () {}).then(function () {
      lastSvg = str;
      applying = false;
      try { if (editor.updateCanvas) editor.updateCanvas(true); } catch (e) {}
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    if (root.__gifosDownload) root.__gifosDownload(url, name);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function saveSvgFile() {
    var svg = currentSvg();
    if (!svg) return;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'drawing.svg');
    setStatus('Saved SVG');
  }

  function exportPng() {
    var svg = currentSvg();
    if (!svg) return;
    var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      var c = canvasApi();
      var w = img.width, h = img.height;
      try {
        if (c && typeof c.getResolution === 'function') {
          var res = c.getResolution();
          if (res && res.w) w = Math.max(1, Math.round(res.w));
          if (res && res.h) h = Math.max(1, Math.round(res.h));
        }
      } catch (e) {}
      var cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      if (cv.toBlob) {
        cv.toBlob(function (b) {
          if (b) downloadBlob(b, 'drawing.png');
          URL.revokeObjectURL(url);
          setStatus('Saved PNG');
        }, 'image/png');
      } else {
        root.__gifosDownload(cv.toDataURL('image/png'), 'drawing.png');
        URL.revokeObjectURL(url);
        setStatus('Saved PNG');
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setStatus('PNG export failed');
    };
    img.src = url;
  }

  function openFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      loadSvg(text);
      lastRev = Date.now();
      putDoc(text, lastRev);
      setStatus('Opened ' + (file.name || 'SVG'));
    };
    reader.readAsText(file);
  }

  function putDoc(svg, rev) {
    if (!docDb || applying) return;
    lastSvg = svg;
    lastRev = rev;
    docDb.put({ id: DOC_ID, svg: svg, rev: rev, by: me.id }).catch(function (err) {
      setStatus(String(err && err.message || err || 'Could not save'));
    });
  }

  function scheduleSave() {
    if (applying || !ready) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_MS);
  }

  function flushSave() {
    saveTimer = null;
    if (applying || dragging) {
      if (dragging) saveTimer = setTimeout(flushSave, SAVE_MS);
      return;
    }
    var svg = currentSvg();
    if (!svg || svg === lastSvg) return;
    putDoc(svg, Date.now());
    paintLive();
  }

  function applyRemote(row) {
    if (!row || !row.svg) return;
    if (row.svg === lastSvg) {
      if (row.rev) lastRev = row.rev;
      return;
    }
    if (row.rev && row.rev <= lastRev && row.by === me.id) return;
    if (dragging) {
      queuedRemote = row;
      return;
    }
    lastRev = row.rev || Date.now();
    loadSvg(row.svg);
    paintLive();
  }

  function paintLive() {
    if (!owner) setStatus('Shared SVG · guest');
    else if (shared) setStatus('Shared SVG');
    else setStatus('Saved on this device');
  }

  function ingest(rows) {
    var list = rows || [];
    var row = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === DOC_ID) row = list[i];
    }
    if (row) {
      if (row.by && row.by !== me.id) shared = true;
      applyRemote(row);
    }
  }

  function EditorCtor() {
    var E = root.Editor;
    if (!E) return null;
    if (typeof E === 'function') return E;
    if (E.default && typeof E.default === 'function') return E.default;
    return null;
  }

  function hideHomepage() {
    var el = document.getElementById('tool_editor_homepage');
    if (el) el.hidden = true;
  }

  function hookCanvas() {
    canvas = canvasApi();
    if (!canvas) return;
    if (typeof canvas.call === 'function') {
      var orig = canvas.call.bind(canvas);
      canvas.call = function (name, data) {
        if (name === 'exported' && data) {
          var url = data.bloburl || data.datauri;
          var ext = String(data.type || 'png').toLowerCase();
          if (url && root.__gifosDownload) root.__gifosDownload(url, 'drawing.' + ext);
          setStatus('Exported ' + ext.toUpperCase());
          return data;
        }
        if (name === 'exportedPDF' && data && data.output) {
          if (root.__gifosDownload) root.__gifosDownload(data.output, 'drawing.pdf');
          setStatus('Exported PDF');
          return data;
        }
        var ret = orig.apply(this, arguments);
        if (name === 'changed' || name === 'afterClear' || name === 'extension_added') scheduleSave();
        return ret;
      };
    }
  }

  function bootEditor() {
    var Ctor = EditorCtor();
    if (!Ctor) {
      setStatus('SVG-Edit failed to load');
      return Promise.reject(new Error('no Editor'));
    }
    var box = document.getElementById('container');
    editor = new Ctor(box);
    root.svgEditor = editor;
    editor.setConfig({
      allowInitialUserOverride: false,
      preventAllURLConfig: true,
      preventURLContentLoading: true,
      noDefaultExtensions: true,
      noStorageOnLoad: true,
      no_save_warning: true,
      extensions: [],
      userExtensions: [],
      imgPath: './images',
      showRulers: true,
      dimensions: [800, 600]
    });
    editor.customExportImage = true;
    editor.customExportPDF = true;
    return Promise.resolve(editor.init()).then(function () {
      hideHomepage();
      hookCanvas();
      lastSvg = currentSvg();
      ready = true;
    });
  }

  function bindUi() {
    document.getElementById('g-open').addEventListener('click', function () { fileEl.click(); });
    document.getElementById('g-save').addEventListener('click', saveSvgFile);
    document.getElementById('g-png').addEventListener('click', exportPng);
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      fileEl.value = '';
      if (f) openFile(f);
    });
    document.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.slice.call(e.dataTransfer.types || []).indexOf('Files') >= 0) {
        e.preventDefault();
      }
    });
    document.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files[0]) return;
      var f = files[0];
      if (!/svg/i.test(f.type) && !/\.svg$/i.test(f.name || '')) return;
      e.preventDefault();
      openFile(f);
    });
    document.addEventListener('pointerdown', function () { dragging += 1; });
    document.addEventListener('pointerup', function () {
      dragging = Math.max(0, dragging - 1);
      if (!dragging && queuedRemote) {
        var row = queuedRemote;
        queuedRemote = null;
        applyRemote(row);
      }
      scheduleSave();
    });
    document.addEventListener('pointercancel', function () { dragging = 0; });
    document.addEventListener('keyup', function (e) {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveSvgFile();
      }
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        var open = document.querySelector('[dialog="open"]');
        if (open) {
          open.setAttribute('dialog', 'close');
          return true;
        }
        return false;
      });
    }
  }

  function start() {
    bindUi();
    var g = root.gifos;
    try { if (g && g.db) docDb = g.db('doc'); } catch (e) {}
    var infoP = (g && g.info) ? g.info().then(function (i) {
      owner = !!(i && i.owner);
    }).catch(function () { owner = true; }) : Promise.resolve();
    var meP = (g && g.me) ? g.me().then(function (m) {
      if (m && m.id) me.id = m.id;
      if (m && m.name) me.name = m.name;
    }).catch(function () {}) : Promise.resolve();

    var prefsP = root.__gifosPrefsReady || Promise.resolve();
    return prefsP.then(function () {
      return Promise.all([infoP, meP, bootEditor()]);
    }).then(function () {
      if (!docDb) {
        setStatus('Saved in this tab only');
        return;
      }
      var first = true;
      docDb.subscribe(function (rows) {
        if (first) {
          first = false;
          var row = (rows || []).filter(function (r) { return r && r.id === DOC_ID; })[0];
          if (row && row.svg) {
            lastRev = row.rev || Date.now();
            loadSvg(row.svg);
          }
          paintLive();
          return;
        }
        ingest(rows);
        paintLive();
      });
    }).catch(function (err) {
      setStatus(String(err && err.message || err || 'Could not start'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
