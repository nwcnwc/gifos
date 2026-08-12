/*
 * PDF Tables → Excel — pull the tables out of a born-digital PDF and hand back
 * an .xlsx, entirely on this device. Built for SERFF rate/rule filings, which
 * are almost always born-digital (exported from actuarial software), so the
 * text and its positions are real objects we can reconstruct exactly — no OCR,
 * no guessing, nothing sent anywhere.
 *
 * Pipeline:
 *   PDF bytes -> pdf.js getTextContent (items with x/y/width) -> cluster into
 *   rows (by y) and columns (by recurring left-x) -> 2-D grid per page ->
 *   SheetJS workbook (one sheet per page) -> .xlsx download.
 *
 * pdf.js runs with isEvalSupported:false (so it never calls new Function/eval,
 * which the sandbox CSP forbids) and its worker from a blob: URL (which
 * capabilities.wasm permits). SheetJS is pure JS. There is no network path.
 *
 * A SCANNED (image-only) PDF has no text objects — this reports that honestly
 * rather than emitting an empty sheet. The GPU-OCR path for those is a separate
 * capability (capabilities.gpu), added on top later.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m, warn) { var el = $('status'); if (el) { el.textContent = m || ''; el.style.color = warn ? '#ff9a6b' : ''; } }

  // ---- pdf.js worker: hand pdf.js a real Worker, not a workerSrc -------------
  // The sandbox CSP is `script-src 'unsafe-inline' 'wasm-unsafe-eval'` (no
  // blob:) plus `worker-src blob:` (the wasm hatch). If we only set workerSrc,
  // pdf.js's fake-worker path tries to load that blob: as a <script>, which
  // script-src refuses. So we CREATE the Worker ourselves — `new Worker(blob:)`
  // is what worker-src blob: is for — and give pdf.js the live port. No script
  // element, no fake worker.
  var pdfReady = false;
  function ensurePdf() {
    if (pdfReady) return true;
    if (!window.pdfjsLib || !window.PDF_WORKER_SRC) return false;
    var blob = new Blob([window.PDF_WORKER_SRC], { type: 'text/javascript' });
    var worker = new Worker(URL.createObjectURL(blob));
    window.pdfjsLib.GlobalWorkerOptions.workerPort = worker;
    pdfReady = true;
    return true;
  }

  // ---- extraction -----------------------------------------------------------
  // pdf.js gives each text run a 2-D transform; [4],[5] are its x,y on the page
  // (y grows UP the page). We cluster runs into rows by y, then discover column
  // positions from the left-x values that recur across rows, and drop each run
  // into its nearest column. That reconstructs an aligned grid — which is what a
  // rate table is — without pretending to solve merged/nested cells.
  function clusterRows(items, yTol) {
    var rows = [];
    items.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (it) {
      var r = rows.length ? rows[rows.length - 1] : null;
      if (r && Math.abs(r.y - it.y) <= yTol) { r.items.push(it); r.y = (r.y * (r.items.length - 1) + it.y) / r.items.length; }
      else rows.push({ y: it.y, items: [it] });
    });
    return rows;
  }

  // 1-D clustering of left-x values into column anchors. A run starts a new
  // column when it is more than `gap` to the right of the last anchor.
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
    // Row tolerance from the median run height; column gap from the median run
    // width — both scale with the document's own font size, not a magic number.
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

  function extract(bytes, onProgress) {
    if (!ensurePdf()) return Promise.reject(new Error('The PDF engine did not load.'));
    var task = window.pdfjsLib.getDocument({
      data: bytes,
      isEvalSupported: false,      // never call new Function/eval — the CSP forbids it
      disableFontFace: true,       // no font injection needed to read text
      useSystemFonts: false
    });
    return task.promise.then(function (pdf) {
      var pages = [];
      var textRuns = 0;
      var step = function (n) {
        if (n > pdf.numPages) return Promise.resolve();
        onProgress && onProgress('Reading page ' + n + ' of ' + pdf.numPages + '…', (n - 1) / pdf.numPages);
        return pdf.getPage(n).then(function (page) {
          return page.getTextContent().then(function (tc) {
            var items = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
              var t = it.transform; // [a,b,c,d,e,f]; e=x, f=y, d≈font height
              return { str: it.str, x: t[4], y: t[5], w: it.width || 0, h: Math.abs(t[3]) || Math.abs(it.height) || 8 };
            });
            textRuns += items.length;
            pages.push({ page: n, table: pageToGrid(items) });
            return step(n + 1);
          });
        });
      };
      return step(1).then(function () { return { pages: pages, textRuns: textRuns, numPages: pdf.numPages }; });
    });
  }

  // ---- workbook -------------------------------------------------------------
  function toWorkbook(result, baseName) {
    var wb = window.XLSX.utils.book_new();
    var added = 0;
    result.pages.forEach(function (p) {
      if (!p.table.grid.length) return;
      var ws = window.XLSX.utils.aoa_to_sheet(p.table.grid);
      var name = ('Page ' + p.page).slice(0, 31);
      window.XLSX.utils.book_append_sheet(wb, ws, name);
      added++;
    });
    if (!added) return null;
    return wb;
  }

  // ---- UI -------------------------------------------------------------------
  var lastWb = null, lastName = 'tables';
  function renderPreview(result) {
    var host = $('preview'); if (!host) return;
    host.innerHTML = '';
    result.pages.forEach(function (p) {
      if (!p.table.grid.length) return;
      var h = document.createElement('div'); h.className = 'pg';
      var cap = document.createElement('div'); cap.className = 'cap';
      cap.textContent = 'Page ' + p.page + ' — ' + p.table.grid.length + ' rows × ' + p.table.cols + ' cols';
      h.appendChild(cap);
      var tbl = document.createElement('table');
      p.table.grid.slice(0, 12).forEach(function (row) {
        var tr = document.createElement('tr');
        row.forEach(function (c) { var td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
        tbl.appendChild(tr);
      });
      h.appendChild(tbl);
      if (p.table.grid.length > 12) { var more = document.createElement('div'); more.className = 'more'; more.textContent = '…and ' + (p.table.grid.length - 12) + ' more rows'; h.appendChild(more); }
      host.appendChild(h);
    });
  }

  function handleFile(file) {
    lastWb = null;
    if ($('download')) $('download').disabled = true;
    lastName = (file.name || 'tables').replace(/\.pdf$/i, '');
    setStatus('Reading “' + file.name + '”…');
    var reader = new FileReader();
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      extract(bytes, function (m, f) { setStatus(m); }).then(function (result) {
        if (!result.textRuns) {
          setStatus('This looks like a SCANNED PDF — it has no text to extract, only an image. Its sibling app, “Scanned PDF Tables → Excel”, reads pages like this with OCR on your GPU; install it from the App Store. This tool stays the small, exact one for the text-based rate PDFs SERFF exports.', true);
          renderPreview({ pages: [] });
          return;
        }
        var wb = toWorkbook(result, lastName);
        renderPreview(result);
        if (!wb) { setStatus('Read ' + result.numPages + ' page(s) but found no table-shaped text.', true); return; }
        lastWb = wb;
        if ($('download')) $('download').disabled = false;
        var sheets = wb.SheetNames.length;
        setStatus('Found tables on ' + sheets + ' page(s) — ' + result.textRuns + ' text runs, all read on this device. Click Download for the Excel file.');
      }).catch(function (e) {
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
})();
