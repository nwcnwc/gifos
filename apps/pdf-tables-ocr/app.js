/*
 * Scanned PDF Tables → Excel — a superset of PDF Tables → Excel.
 *
 * A SERFF filing is usually born-digital, and for those pages this app does
 * exactly what its smaller sibling does: read the text objects and their
 * positions and reconstruct the grid EXACTLY. But filings arrive with scanned
 * exhibits bound in, and a scanned page has no text objects at all — only an
 * image. Those pages go through OCR on the device's GPU.
 *
 * The choice is made PER PAGE, not per document, because mixed filings are the
 * common case: page 3 is a text rate table and page 4 is a photocopy of one.
 *
 *   text page    -> pdf.js getTextContent -> row/column clustering (exact)
 *   scanned page -> pdf.js render to canvas -> DBNet detect -> SVTR recognize
 *                   -> SLANet table structure -> cells (or, if the structure
 *                   model finds no grid, the same row/column clustering driven
 *                   by the OCR boxes)
 *
 * The OCR engine (ort.js + the three models) is ~40 MB and is loaded LAZILY —
 * a born-digital filing never pays for it. Which execution provider actually
 * ran is reported honestly on screen: 'your GPU' or 'the CPU'.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m, warn) { var el = $('status'); if (el) { el.textContent = m || ''; el.style.color = warn ? '#ff9a6b' : ''; } }
  function setEngine(html) { var el = $('engine'); if (el) el.innerHTML = html || ''; }
  function setBar(frac) {
    var bar = $('bar'), fill = $('barfill');
    if (!bar || !fill) return;
    if (frac == null) { bar.classList.remove('on'); fill.style.width = '0'; return; }
    bar.classList.add('on');
    fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }
  // Let the browser paint between inference calls — everything here runs on the
  // main thread, and a page of OCR is hundreds of model runs.
  function breathe() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // ---- pdf.js worker (identical recipe to the sibling) ----------------------
  // Create the Worker ourselves from a blob and hand pdf.js the live port. Only
  // setting workerSrc would send pdf.js down its fake-worker path, which injects
  // a <script src="blob:"> that the app CSP's script-src refuses.
  var pdfReady = false;
  function ensurePdf() {
    if (pdfReady) return true;
    if (!window.pdfjsLib || !window.PDF_WORKER_SRC) return false;
    var blob = new Blob([window.PDF_WORKER_SRC], { type: 'text/javascript' });
    window.pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob));
    pdfReady = true;
    return true;
  }

  // ---- the packed models ----------------------------------------------------
  // The weights live in this GIF under `.assets/`, and gifos.assets(path) hands
  // them over as a zero-copy ArrayBuffer TRANSFER. That matters: 40 MB of models
  // cannot travel as part of the app document. The runtime builds the app's HTML
  // by inlining its scripts and turning any src/href into a data: URL, so
  // referencing the models from the page would put ~54 MB of base64 into one
  // srcdoc attribute — which crashes the renderer outright (measured: a 57 MB
  // srcdoc kills the tab before a line of app code runs). The `.assets/` bridge
  // keeps the document at a couple of megabytes and moves the bytes separately.
  //
  // Still no network: these are packed files, not downloads. There is no
  // manifest `assets` pin and nothing to fetch.
  var ASSETS = {
    ortWasm: 'ort-wasm.wasm',
    det: 'det.onnx',
    rec: 'rec.onnx',
    table: 'table.onnx',
    recDict: 'en_dict.txt',
    tableDict: 'table_structure_dict.txt'
  };
  function assetBytes(path) {
    if (!(window.gifos && gifos.assets)) {
      return Promise.reject(new Error('This app needs to run inside GifOS to reach its packed OCR models.'));
    }
    return gifos.assets(path).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('“' + path + '” came back empty.');
      return buf;
    }, function (e) {
      throw new Error('Could not read “' + path + '” out of this app: ' + (e && e.message || e));
    });
  }
  function assetText(path) {
    return assetBytes(path).then(function (buf) { return new TextDecoder().decode(new Uint8Array(buf)); });
  }

  // ---- the OCR engine ------------------------------------------------------
  var USED_EP = null;          // 'webgpu' | 'wasm' — what actually ran
  var enginePromise = null;

  // ORT-web does not fall back between execution providers when the first fails
  // to INITIALISE, so probe for a real adapter and retry on wasm if the GPU
  // session still throws. (Same shape as offline-tts-kokoro's.)
  function createSession(bytes, name) {
    var haveGpu = Promise.resolve(false);
    try {
      if (navigator.gpu && navigator.gpu.requestAdapter) {
        haveGpu = navigator.gpu.requestAdapter().then(function (a) { return !!a; }, function () { return false; });
      }
    } catch (e) { /* no navigator.gpu at all */ }
    return haveGpu.then(function (gpu) {
      var eps = gpu ? ['webgpu', 'wasm'] : ['wasm'];
      return window.ort.InferenceSession.create(bytes, { executionProviders: eps }).then(
        function (s) { if (!USED_EP || USED_EP === 'webgpu') USED_EP = eps[0]; return s; },
        function (err) {
          if (eps[0] !== 'webgpu') throw new Error('Could not start the ' + name + ' model: ' + (err && err.message || err));
          return window.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
            .then(function (s) { USED_EP = 'wasm'; return s; });
        }
      );
    });
  }

  function ensureEngine(beat) {
    if (enginePromise) return enginePromise;
    enginePromise = Promise.resolve().then(function () {
      if (!window.ort) throw new Error('The inference engine failed to load.');
      if (!window.GifOcr) throw new Error('The OCR pipeline failed to load.');
      beat('Starting the OCR engine…');
      return assetBytes(ASSETS.ortWasm).then(function (wasm) {
        // The engine reaches the sandbox as bytes — there is no network to fetch
        // a .wasm from. This is the WebGPU-capable JSEP build; single-threaded,
        // because wasm threads need a cross-origin isolation an opaque origin
        // never has (and the GPU work does not run on those threads anyway).
        window.ort.env.wasm.wasmBinary = wasm;
        window.ort.env.wasm.numThreads = 1;
        window.ort.env.wasm.proxy = false;
        window.ort.env.logLevel = 'error';
        return Promise.all([
          assetText(ASSETS.recDict),
          assetText(ASSETS.tableDict),
          assetBytes(ASSETS.det),
          assetBytes(ASSETS.rec),
          assetBytes(ASSETS.table)
        ]);
      }).then(function (parts) {
        var charset = window.GifOcr.buildCharset(parts[0]);
        var tokens = window.GifOcr.buildStructureTokens(parts[1]);
        beat('Loading the text detector…');
        return createSession(new Uint8Array(parts[2]), 'text detection').then(function (det) {
          beat('Loading the text recognizer…');
          return createSession(new Uint8Array(parts[3]), 'text recognition').then(function (rec) {
            beat('Loading the table-structure model…');
            return createSession(new Uint8Array(parts[4]), 'table structure').then(function (table) {
              // 97 rec classes and 30 structure classes are the contract between
              // these weights and the decoders in ocr.js. build.mjs asserts it
              // against the model files too, but a mismatch here would decode as
              // convincing garbage, so refuse rather than guess.
              if (charset.length !== 97) throw new Error('The recognition dictionary is ' + charset.length + ' classes, expected 97.');
              if (tokens.length !== 30) throw new Error('The table-structure dictionary is ' + tokens.length + ' classes, expected 30.');
              return { det: det, rec: rec, table: table, charset: charset, tokens: tokens };
            });
          });
        });
      });
    });
    enginePromise.catch(function () { enginePromise = null; USED_EP = null; });
    return enginePromise;
  }

  function epLabel() { return USED_EP === 'webgpu' ? 'your GPU' : 'the CPU'; }
  function reportEngine() {
    if (!USED_EP) return;
    setEngine('OCR ran on <b>' + epLabel() + '</b>' +
      (USED_EP === 'wasm' ? ' — this device exposes no WebGPU adapter, so the models ran on the processor.' : ' (WebGPU).'));
  }

  // ---- born-digital extraction (the sibling's algorithm, unchanged) ---------
  function clusterRows(items, yTol) {
    var rows = [];
    items.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (it) {
      var r = rows.length ? rows[rows.length - 1] : null;
      if (r && Math.abs(r.y - it.y) <= yTol) { r.items.push(it); r.y = (r.y * (r.items.length - 1) + it.y) / r.items.length; }
      else rows.push({ y: it.y, items: [it] });
    });
    return rows;
  }
  function columnAnchors(items, gap) {
    var xs = items.map(function (it) { return it.x; }).sort(function (a, b) { return a - b; });
    var anchors = [];
    xs.forEach(function (x) {
      if (!anchors.length || x - anchors[anchors.length - 1] > gap) anchors.push(x);
      else anchors[anchors.length - 1] = (anchors[anchors.length - 1] + x) / 2;
    });
    return anchors;
  }
  function nearestCol(anchors, x) {
    var bi = 0, bd = Infinity;
    for (var i = 0; i < anchors.length; i++) { var d = Math.abs(anchors[i] - x); if (d < bd) { bd = d; bi = i; } }
    return bi;
  }
  function pageToGrid(items) {
    if (!items.length) return { grid: [], cols: 0 };
    var heights = items.map(function (it) { return it.h; }).sort(function (a, b) { return a - b; });
    var widths = items.map(function (it) { return it.w / Math.max(1, it.str.length); }).sort(function (a, b) { return a - b; });
    var yTol = Math.max(2, (heights[Math.floor(heights.length / 2)] || 8) * 0.6);
    var gap = Math.max(6, (widths[Math.floor(widths.length / 2)] || 5) * 2.2);
    var rows = clusterRows(items, yTol);
    var anchors = columnAnchors(items, gap);
    var grid = rows.map(function (r) {
      var cells = new Array(anchors.length).fill('');
      r.items.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (it) {
        var c = nearestCol(anchors, it.x);
        cells[c] = cells[c] ? cells[c] + ' ' + it.str : it.str;
      });
      return cells;
    }).filter(function (row) { return row.some(function (c) { return String(c).trim(); }); });
    return { grid: grid, cols: anchors.length };
  }

  // ---- the scanned path ----------------------------------------------------
  var RENDER_LONG_SIDE = 1800;   // OCR wants ~150-200 DPI; detection downsamples
                                 // to 960 itself, but the crops come from HERE.
  var MAX_BOXES = 600;           // a page this dense is a wall of text, not a table

  function renderPage(page) {
    var v1 = page.getViewport({ scale: 1 });
    var scale = Math.min(3, Math.max(1, RENDER_LONG_SIDE / Math.max(v1.width, v1.height)));
    var vp = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);   // a scan's paper is white
    return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    });
  }

  function ocrPage(eng, img, beat) {
    return window.GifOcr.detect(eng.det, img, { max: MAX_BOXES }).then(function (d) {
      if (!d.boxes.length) return { grid: [], cols: 0, source: 'ocr', boxes: 0, words: 0 };
      beat('Reading ' + d.boxes.length + ' text areas…', 0);
      return window.GifOcr.recognize(eng.rec, img, d.boxes, eng.charset, function (i, n) {
        beat('Reading text ' + i + ' of ' + n + '…', i / n);
      }).then(function (texts) {
        var words = texts.filter(function (t) { return t.text && t.text.trim(); }).length;
        beat('Finding the table structure…', 1);
        return breathe().then(function () {
          return window.GifOcr.tableStructure(eng.table, img, eng.tokens);
        }).catch(function (e) {
          // Structure analysis is the optional third leg: if SLANet cannot run
          // on this device, the text we already recognized is still worth a
          // spreadsheet, laid out by position. Losing the page here would be a
          // far worse answer than losing the merged cells.
          if (window.console && console.warn) console.warn('table structure unavailable:', e && e.message || e);
          return [];
        }).then(function (seq) {
          var cells = window.GifOcr.structureToCells(seq);
          if (cells.length >= 4) {
            var filled = window.GifOcr.fillCells(cells, texts);
            var g = window.GifOcr.cellsToGrid(filled);
            // A structure with cells but no text in any of them means the model
            // and the page disagree about where the table is — trust the text.
            var nonEmpty = g.grid.reduce(function (n, row) {
              return n + row.filter(function (c) { return String(c).trim(); }).length;
            }, 0);
            if (g.rows >= 2 && g.cols >= 2 && nonEmpty >= Math.min(4, words)) {
              return { grid: g.grid, cols: g.cols, source: 'ocr-table', boxes: d.boxes.length, words: words, cells: cells.length };
            }
          }
          var geo = window.GifOcr.geometricGrid(texts);
          return { grid: geo.grid, cols: geo.cols, source: 'ocr-geometric', boxes: d.boxes.length, words: words, cells: cells.length };
        });
      });
    });
  }

  // ---- the document --------------------------------------------------------
  // Enough real text runs to call a page born-digital. A scanned page is not
  // always EMPTY — some scanners bind in a stray label or a page number — so the
  // test is a floor, not zero.
  var TEXT_RUN_FLOOR = 8;

  function extract(bytes, beat) {
    if (!ensurePdf()) return Promise.reject(new Error('The PDF engine did not load.'));
    var task = window.pdfjsLib.getDocument({
      data: bytes,
      isEvalSupported: false,      // never call new Function/eval — the CSP forbids it
      disableFontFace: true,
      useSystemFonts: false
    });
    return task.promise.then(function (pdf) {
      var pages = [], scanned = 0, textRuns = 0;
      var step = function (n) {
        if (n > pdf.numPages) return Promise.resolve();
        var frac = (n - 1) / pdf.numPages;
        return pdf.getPage(n).then(function (page) {
          return page.getTextContent().then(function (tc) {
            var items = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
              var t = it.transform;
              return { str: it.str, x: t[4], y: t[5], w: it.width || 0, h: Math.abs(t[3]) || Math.abs(it.height) || 8 };
            });
            if (items.length >= TEXT_RUN_FLOOR) {
              beat('Reading page ' + n + ' of ' + pdf.numPages + ' (text)…', frac);
              textRuns += items.length;
              var g = pageToGrid(items);
              pages.push({ page: n, grid: g.grid, cols: g.cols, source: 'text' });
              return step(n + 1);
            }
            // No text layer worth the name — OCR it.
            scanned++;
            beat('Page ' + n + ' is scanned — starting OCR…', frac);
            return ensureEngine(function (m) { beat(m, frac); }).then(function (eng) {
              return renderPage(page).then(function (img) {
                return ocrPage(eng, img, function (m, sub) {
                  beat('Page ' + n + ' of ' + pdf.numPages + ' — ' + m,
                    frac + (sub || 0) / pdf.numPages);
                });
              }).then(function (r) {
                pages.push({ page: n, grid: r.grid, cols: r.cols, source: r.source, boxes: r.boxes, words: r.words });
                return breathe().then(function () { return step(n + 1); });
              });
            });
          });
        });
      };
      return step(1).then(function () {
        pages.sort(function (a, b) { return a.page - b.page; });
        return { pages: pages, textRuns: textRuns, scanned: scanned, numPages: pdf.numPages };
      });
    });
  }

  // ---- workbook -----------------------------------------------------------
  function toWorkbook(result) {
    var wb = window.XLSX.utils.book_new();
    var added = 0;
    result.pages.forEach(function (p) {
      if (!p.grid.length) return;
      var ws = window.XLSX.utils.aoa_to_sheet(p.grid);
      // The sheet name says how the page was read, so nobody mistakes an OCR
      // guess for an exact read once the file is out of here.
      var name = ('Page ' + p.page + (p.source === 'text' ? '' : ' (OCR)')).slice(0, 31);
      window.XLSX.utils.book_append_sheet(wb, ws, name);
      added++;
    });
    return added ? wb : null;
  }

  // ---- UI -----------------------------------------------------------------
  var lastWb = null, lastName = 'tables';
  var SOURCE_TAG = {
    'text': ['text', 'read exactly from the PDF text'],
    'ocr-table': ['ocr', 'OCR + table structure'],
    'ocr-geometric': ['ocr', 'OCR, rows and columns by position'],
    'ocr': ['ocr', 'OCR']
  };

  function renderPreview(result) {
    var host = $('preview'); if (!host) return;
    host.innerHTML = '';
    result.pages.forEach(function (p) {
      if (!p.grid.length) return;
      var tag = SOURCE_TAG[p.source] || SOURCE_TAG.ocr;
      var h = document.createElement('div'); h.className = 'pg';
      var cap = document.createElement('div'); cap.className = 'cap';
      cap.textContent = 'Page ' + p.page + ' — ' + p.grid.length + ' rows × ' + p.cols + ' cols';
      var badge = document.createElement('span');
      badge.className = 'tag ' + tag[0];
      badge.textContent = tag[1];
      cap.appendChild(badge);
      h.appendChild(cap);
      var tbl = document.createElement('table');
      p.grid.slice(0, 12).forEach(function (row) {
        var tr = document.createElement('tr');
        row.forEach(function (c) { var td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
        tbl.appendChild(tr);
      });
      h.appendChild(tbl);
      if (p.grid.length > 12) {
        var more = document.createElement('div'); more.className = 'more';
        more.textContent = '…and ' + (p.grid.length - 12) + ' more rows';
        h.appendChild(more);
      }
      host.appendChild(h);
    });
  }

  function summarize(result) {
    var sheets = result.pages.filter(function (p) { return p.grid.length; });
    if (!sheets.length) return ['Read ' + result.numPages + ' page(s) but found no table-shaped content.', true];
    var ocr = sheets.filter(function (p) { return p.source !== 'text' }).length;
    var txt = sheets.length - ocr;
    var bits = [];
    if (txt) bits.push(txt + ' text page' + (txt === 1 ? '' : 's') + ' read exactly');
    if (ocr) bits.push(ocr + ' scanned page' + (ocr === 1 ? '' : 's') + ' read by OCR on ' + epLabel());
    return ['Found tables on ' + sheets.length + ' page(s) — ' + bits.join(', ') +
      '. All of it on this device. Click Download for the Excel file.', false];
  }

  function handleFile(file) {
    lastWb = null;
    if ($('download')) $('download').disabled = true;
    lastName = (file.name || 'tables').replace(/\.pdf$/i, '');
    setStatus('Reading “' + file.name + '”…');
    setEngine('');
    setBar(0);
    var reader = new FileReader();
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      extract(bytes, function (m, f) { setStatus(m); if (f != null) setBar(f); }).then(function (result) {
        setBar(null);
        renderPreview(result);
        reportEngine();
        var wb = toWorkbook(result);
        if (!wb) {
          var why = result.scanned && !result.textRuns
            ? 'This scanned PDF went through OCR but no table-shaped text came back — the scan may be too faint or too skewed to read.'
            : 'Read ' + result.numPages + ' page(s) but found no table-shaped content.';
          setStatus(why, true);
          return;
        }
        lastWb = wb;
        if ($('download')) $('download').disabled = false;
        var s = summarize(result);
        setStatus(s[0], s[1]);
      }).catch(function (e) {
        setBar(null);
        setStatus('⚠ ' + (e && e.message || e), true);
      });
    };
    reader.onerror = function () { setStatus('⚠ Could not read that file.', true); };
    reader.readAsArrayBuffer(file);
  }

  function download() {
    if (!lastWb) return;
    var out = window.XLSX.write(lastWb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = lastName + '.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function wire() {
    var input = $('file');
    if (input) input.onchange = function () { if (input.files && input.files[0]) handleFile(input.files[0]); };
    var drop = $('drop');
    if (drop) {
      ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
      drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });
      drop.addEventListener('click', function () { if (input) input.click(); });
    }
    if ($('download')) $('download').onclick = download;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  // The guard drives these directly — it needs to run one page of OCR without a
  // file picker, and to assert which execution provider was used.
  window.PdfOcrApp = {
    extract: extract,
    ensureEngine: ensureEngine,
    renderPage: renderPage,
    ocrPage: ocrPage,
    ep: function () { return USED_EP; }
  };
})();
