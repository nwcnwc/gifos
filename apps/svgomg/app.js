/*
 * SVGOMG — drop an SVG, toggle clean-up steps, download the smaller file.
 * Persistence is gifos.db('prefs'). Pictures never leave this device.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var PLUGINS = window.SVGOMG_PLUGINS || [];
  var S = {
    name: '',
    original: '',
    result: '',
    view: 'image',
    showOriginal: false,
    gzip: true,
    pretty: false,
    multipass: false,
    floatPrecision: 3,
    transformPrecision: 5,
    plugins: {},
    bg: 0,
    job: 0,
    origSize: 0,
    origGzip: 0,
    outSize: 0,
    outGzip: 0
  };

  function defaults() {
    var p = {};
    PLUGINS.forEach(function (x) { p[x.id] = !!x.enabledByDefault; });
    return p;
  }

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

  function gzipSize(text) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') {
      return Promise.resolve(text.length);
    }
    try {
      var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
      return new Response(stream).arrayBuffer().then(function (buf) { return buf.byteLength; });
    } catch (e) {
      return Promise.resolve(text.length);
    }
  }

  function extractPlugin(dim) {
    return {
      type: 'visitor',
      name: 'extract-dimensions',
      fn: function () {
        return {
          element: {
            enter: function (node, parent) {
              if (node.name !== 'svg' || parent.type !== 'root') return;
              if (node.attributes.width != null && node.attributes.height != null) {
                dim.width = parseFloat(node.attributes.width);
                dim.height = parseFloat(node.attributes.height);
              } else if (node.attributes.viewBox) {
                var vb = String(node.attributes.viewBox).split(/,\s*|\s+/);
                dim.width = parseFloat(vb[2]);
                dim.height = parseFloat(vb[3]);
              }
            }
          }
        };
      }
    };
  }

  function compress(svg, settings) {
    var fp = Number(settings.floatPrecision);
    var tp = Number(settings.transformPrecision);
    var plugins = [];
    PLUGINS.forEach(function (meta) {
      if (!settings.plugins[meta.id]) return;
      plugins.push({
        name: meta.id,
        params: {
          floatPrecision: meta.id === 'cleanupNumericValues' && fp === 0 ? 1 : fp,
          transformPrecision: tp
        }
      });
    });
    var dim = {};
    var out = window.SVGO.optimize(svg, {
      multipass: !!settings.multipass,
      plugins: plugins.concat([extractPlugin(dim)]),
      js2svg: { indent: 2, pretty: !!settings.pretty }
    });
    if (out && out.error) throw new Error(out.error);
    return { data: out.data, dimensions: dim };
  }

  function looksLikeSvg(text) {
    return /<svg[\s>]/i.test(text);
  }

  var picUrl = null;
  function showPic(text) {
    if (picUrl) URL.revokeObjectURL(picUrl);
    picUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    $('pic').src = picUrl;
    $('code').textContent = text;
  }

  function applyView() {
    var code = S.view === 'code';
    $('code').hidden = !code;
    $('pic').hidden = code;
  }

  function applyBg() {
    var el = $('preview');
    el.classList.remove('bg-check', 'bg-white', 'bg-dark');
    el.classList.add(['bg-check', 'bg-white', 'bg-dark'][S.bg % 3]);
  }

  function renderResults() {
    var el = $('results');
    if (!S.original) { el.textContent = 'Drop an SVG to start'; return; }
    var a = S.gzip ? S.origGzip : S.origSize;
    var b = S.showOriginal ? a : (S.gzip ? S.outGzip : S.outSize);
    if (!a) { el.textContent = 'Working…'; return; }
    var pct = Math.round((1 - b / a) * 100);
    var save = document.createElement('span');
    save.className = pct >= 0 ? 'save' : 'bad';
    save.textContent = (pct >= 0 ? '−' : '+') + Math.abs(pct) + '%';
    el.textContent = fmtBytes(a) + ' → ' + fmtBytes(b) + ' ';
    el.appendChild(save);
    if (S.gzip) el.appendChild(document.createTextNode(' gzipped'));
  }

  function settingsFromUi() {
    S.showOriginal = $('original').checked;
    S.gzip = $('gzip').checked;
    S.pretty = $('pretty').checked;
    S.multipass = $('multipass').checked;
    S.floatPrecision = $('floatPrecision').value | 0;
    S.transformPrecision = $('transformPrecision').value | 0;
    $('floatVal').textContent = String(S.floatPrecision);
    $('transformVal').textContent = String(S.transformPrecision);
    var boxes = $('plugins').querySelectorAll('input[type=checkbox]');
    S.plugins = {};
    Array.prototype.forEach.call(boxes, function (box) {
      S.plugins[box.getAttribute('data-id')] = box.checked;
    });
  }

  function settingsToUi() {
    $('original').checked = S.showOriginal;
    $('gzip').checked = S.gzip;
    $('pretty').checked = S.pretty;
    $('multipass').checked = S.multipass;
    $('floatPrecision').value = S.floatPrecision;
    $('transformPrecision').value = S.transformPrecision;
    $('floatVal').textContent = String(S.floatPrecision);
    $('transformVal').textContent = String(S.transformPrecision);
    var boxes = $('plugins').querySelectorAll('input[type=checkbox]');
    Array.prototype.forEach.call(boxes, function (box) {
      var id = box.getAttribute('data-id');
      box.checked = S.plugins[id] !== false && (S.plugins[id] || box.checked);
      if (Object.prototype.hasOwnProperty.call(S.plugins, id)) box.checked = !!S.plugins[id];
    });
  }

  function savePrefs() {
    if (!(window.gifos && gifos.db)) return;
    try {
      gifos.db('prefs').put({
        id: 'prefs',
        gzip: S.gzip, pretty: S.pretty, multipass: S.multipass,
        floatPrecision: S.floatPrecision, transformPrecision: S.transformPrecision,
        plugins: S.plugins
      });
    } catch (e) {}
  }

  function loadPrefs() {
    if (!(window.gifos && gifos.db)) return Promise.resolve();
    return Promise.resolve(gifos.db('prefs').getAll()).then(function (rows) {
      var p = rows && rows[0];
      if (!p) return;
      if (typeof p.gzip === 'boolean') S.gzip = p.gzip;
      if (typeof p.pretty === 'boolean') S.pretty = p.pretty;
      if (typeof p.multipass === 'boolean') S.multipass = p.multipass;
      if (typeof p.floatPrecision === 'number') S.floatPrecision = p.floatPrecision;
      if (typeof p.transformPrecision === 'number') S.transformPrecision = p.transformPrecision;
      if (p.plugins && typeof p.plugins === 'object') {
        Object.keys(p.plugins).forEach(function (k) { S.plugins[k] = !!p.plugins[k]; });
      }
    }).catch(function () {});
  }

  function queue() {
    settingsFromUi();
    savePrefs();
    if (!S.original) return;
    var job = ++S.job;
    setStatus('Working…');
    try {
      var shown;
      if (S.showOriginal) {
        shown = S.original;
        S.result = S.original;
      } else {
        var out = compress(S.original, S);
        S.result = out.data;
        shown = out.data;
      }
      S.outSize = new Blob([S.result]).size;
      showPic(shown);
      $('btnDownload').disabled = false;
      $('btnCopy').disabled = false;
      gzipSize(S.original).then(function (n) {
        if (job !== S.job) return;
        S.origGzip = n;
        return gzipSize(S.result);
      }).then(function (n) {
        if (job !== S.job || n == null) return;
        S.outGzip = n;
        renderResults();
        setStatus('');
      }).catch(function () {
        if (job !== S.job) return;
        renderResults();
        setStatus('');
      });
      renderResults();
    } catch (e) {
      setStatus((e && e.message) || 'Could not clean this SVG', 'err');
    }
  }

  function openText(text, name) {
    if (!looksLikeSvg(text)) {
      setStatus('That does not look like an SVG', 'err');
      return;
    }
    S.name = name || 'image.svg';
    S.original = text;
    S.origSize = new Blob([text]).size;
    S.origGzip = 0;
    $('intro').hidden = true;
    $('work').hidden = false;
    queue();
  }

  function openFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { openText(String(reader.result || ''), file.name); };
    reader.onerror = function () { setStatus('Could not read that file', 'err'); };
    reader.readAsText(file);
  }

  function download() {
    if (!S.result) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([S.result], { type: 'image/svg+xml' }));
    a.download = S.name.replace(/(\.svg)?$/i, '.svg');
    a.click();
  }

  function copy() {
    if (!S.result) return;
    var text = S.result;
    var done = function () { setStatus('Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { setStatus('Copy failed', 'err'); }
      document.body.removeChild(ta);
    }
  }

  function fillPlugins() {
    var box = $('plugins');
    box.innerHTML = '';
    PLUGINS.forEach(function (p) {
      var lab = document.createElement('label');
      lab.className = 'chk';
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.setAttribute('data-id', p.id);
      inp.checked = !!p.enabledByDefault;
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(' ' + p.name));
      box.appendChild(lab);
    });
  }

  function bind() {
    var drop = $('drop');
    var input = $('file');
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
      document.addEventListener(ev, function (e) { e.preventDefault(); });
    });
    ['dragleave'].forEach(function (ev) {
      drop.addEventListener(ev, function () { drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });
    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) openFile(input.files[0]);
      input.value = '';
    });
    $('btnOpen').addEventListener('click', function () { input.click(); });
    $('btnDemo').addEventListener('click', function () {
      var d = window.SVGOMG_DEMO;
      if (!d) { setStatus('Demo picture is missing', 'err'); return; }
      openText(d.text, d.name);
    });
    $('btnPaste').addEventListener('click', function () {
      $('pasteModal').hidden = false;
      $('pasteBox').focus();
    });
    $('pasteCancel').addEventListener('click', function () { $('pasteModal').hidden = true; });
    $('pasteGo').addEventListener('click', function () {
      var t = $('pasteBox').value;
      $('pasteModal').hidden = true;
      openText(t, 'pasted.svg');
    });
    $('viewTabs').addEventListener('change', function () {
      var v = document.querySelector('input[name=view]:checked');
      S.view = v ? v.value : 'image';
      applyView();
    });
    $('btnBg').addEventListener('click', function () { S.bg = (S.bg + 1) % 3; applyBg(); });
    $('btnDownload').addEventListener('click', download);
    $('btnCopy').addEventListener('click', copy);
    $('btnReset').addEventListener('click', function () {
      S.plugins = defaults();
      S.gzip = true; S.pretty = false; S.multipass = false;
      S.floatPrecision = 3; S.transformPrecision = 5; S.showOriginal = false;
      settingsToUi();
      queue();
    });
    ['original', 'gzip', 'pretty', 'multipass'].forEach(function (id) {
      $(id).addEventListener('change', queue);
    });
    ['floatPrecision', 'transformPrecision'].forEach(function (id) {
      $(id).addEventListener('input', queue);
    });
    $('plugins').addEventListener('change', queue);
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault(); input.click();
      }
    });
    window.addEventListener('paste', function (e) {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
      var t = e.clipboardData && e.clipboardData.getData('text');
      if (t && looksLikeSvg(t)) {
        e.preventDefault();
        openText(t, 'pasted.svg');
      }
    });
  }

  function boot() {
    if (!window.SVGO || typeof window.SVGO.optimize !== 'function') {
      setStatus('Optimizer did not load', 'err');
      return;
    }
    S.plugins = defaults();
    fillPlugins();
    bind();
    applyBg();
    loadPrefs().then(function () {
      settingsToUi();
    });
  }

  boot();
})();
