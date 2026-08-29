/* Fortune Sheet — GifOS shell.
 *
 * The engine is window.FortuneSheet (React + Workbook, packed as one IIFE).
 * Persistence is gifos.db('workbook'); their collab backend is never wired.
 * localStorage is a memory stub in index.html — it does not outlive the tab.
 */
(function () {
  'use strict';

  var FS = window.FortuneSheet;
  if (!FS || !FS.Workbook || !FS.React || !FS.createRoot) {
    setStatus('Fortune Sheet failed to load.');
    return;
  }

  var h = FS.React.createElement;
  var sheetEl = document.getElementById('sheet');
  var statusEl = document.getElementById('status');
  var newBtn = document.getElementById('new-btn');

  var DOC_ID = 'current';
  var SAVE_MS = 400;
  var db = (window.gifos && window.gifos.db) ? window.gifos.db('workbook') : null;
  var root = null;
  var saveTimer = null;
  var ready = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function cell(r, c, v, extra) {
    var o = { v: v, m: String(v) };
    if (extra) for (var k in extra) o[k] = extra[k];
    return { r: r, c: c, v: o };
  }

  function demoSheets() {
    return [{
      name: 'Sheet1',
      id: '0',
      status: 1,
      order: 0,
      celldata: [
        cell(0, 0, 'Welcome to Fortune Sheet', { bl: 1, fs: 14 }),
        cell(1, 0, 'Saved on this device inside the app. Nothing is sent anywhere.'),
        cell(3, 0, 'Item', { bl: 1, bg: '#0188fb', fc: '#ffffff' }),
        cell(3, 1, 'Amount', { bl: 1, bg: '#0188fb', fc: '#ffffff' }),
        cell(4, 0, 'Rent'),
        cell(4, 1, 1200),
        cell(5, 0, 'Food'),
        cell(5, 1, 450),
        cell(6, 0, 'Transit'),
        cell(6, 1, 120),
        cell(7, 0, 'Total', { bl: 1 }),
        // A seeded formula needs three things the engine will not infer. `v`
        // and `m` because celldata is not evaluated on load — with `f` alone
        // the Total rendered EMPTY while the formula bar read =SUM(B5:B7). And
        // an entry in the sheet's calcChain, because the dependency graph is
        // built from that list, not by scanning cells: without it the Total
        // showed 1770 forever while a formula the USER typed into B9 tracked
        // every edit. A number that does not move is worse than a blank.
        { r: 7, c: 1, v: { f: '=SUM(B5:B7)', v: 1770, m: '1770', bl: 1 } }
      ],
      calcChain: [{ r: 7, c: 1, id: '0' }],
      row: 40,
      column: 16
    }];
  }

  function blankSheets() {
    return [{ name: 'Sheet1', id: '0', status: 1, order: 0, celldata: [], row: 50, column: 26 }];
  }

  // Workbook initialises from `celldata` and then keeps a dense `data` matrix.
  // Persist the sparse form — a 50×26 grid of nulls is a lot of JSON for nothing.
  function sheetForStore(sheet) {
    var out = {};
    var keep = [
      'name', 'id', 'order', 'status', 'color', 'hide', 'config',
      'calcChain', 'frozen', 'filter_select', 'filter',
      'luckysheet_conditionformat_save', 'luckysheet_alternateformat_save',
      'dataVerification', 'hyperlink', 'images', 'zoomRatio', 'row', 'column'
    ];
    for (var i = 0; i < keep.length; i++) {
      var k = keep[i];
      if (sheet[k] != null) out[k] = sheet[k];
    }
    var celldata = [];
    if (Array.isArray(sheet.data)) {
      for (var r = 0; r < sheet.data.length; r++) {
        var row = sheet.data[r];
        if (!row) continue;
        for (var c = 0; c < row.length; c++) {
          if (row[c] != null) celldata.push({ r: r, c: c, v: row[c] });
        }
      }
    } else if (Array.isArray(sheet.celldata)) {
      celldata = sheet.celldata;
    }
    out.celldata = celldata;
    return out;
  }

  function sheetsForStore(sheets) {
    if (!Array.isArray(sheets) || !sheets.length) return blankSheets();
    return sheets.map(sheetForStore);
  }

  function persist(sheets) {
    var payload = { id: DOC_ID, sheets: sheetsForStore(sheets), savedAt: Date.now() };
    if (!db) {
      setStatus('Not saved — open this app inside GifOS to keep the workbook.');
      return Promise.resolve();
    }
    return db.put(payload).then(function () {
      if (window.gifos && window.gifos.save) return window.gifos.save();
    }).then(function () {
      setStatus('Saved on this device');
    }).catch(function (err) {
      setStatus('Could not save: ' + ((err && err.message) || err));
    });
  }

  function scheduleSave(sheets) {
    if (!ready) return;
    setStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { persist(sheets); }, SAVE_MS);
  }

  // Without a selection the name box renders the selected range and reads
  // "A1:NaN". Seeds and restored workbooks alike arrive with none, so put A1
  // in before the first paint rather than in each producer.
  function withSelection(sheets) {
    for (var i = 0; i < sheets.length; i++) {
      var sel = sheets[i].luckysheet_select_save;
      if (!Array.isArray(sel) || !sel.length) {
        sheets[i].luckysheet_select_save = [{ row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 }];
      }
    }
    return sheets;
  }

  function mount(sheets) {
    sheets = withSelection(sheets);
    if (root) {
      try { root.unmount(); } catch (e) {}
      root = null;
    }
    sheetEl.innerHTML = '';
    ready = false;
    root = FS.createRoot(sheetEl);
    root.render(h(FS.Workbook, {
      data: sheets,
      lang: 'en',
      allowEdit: true,
      showToolbar: true,
      showFormulaBar: true,
      showSheetTabs: true,
      onChange: function (next) { scheduleSave(next); }
    }));
    // First onChange is the engine settling, not a user edit.
    setTimeout(function () { ready = true; }, 80);
  }

  function start(sheets, note) {
    mount(sheets);
    setStatus(note || 'Saved on this device');
  }

  function load() {
    if (!db) {
      start(demoSheets(), 'Not saved — open this app inside GifOS to keep the workbook.');
      return;
    }
    db.get(DOC_ID).then(function (rec) {
      if (rec && Array.isArray(rec.sheets) && rec.sheets.length) {
        start(sheetsForStore(rec.sheets), 'Saved on this device');
      } else {
        var demo = demoSheets();
        start(demo, 'Demo sheet — your edits stay on this device');
        persist(demo);
      }
    }).catch(function () {
      start(demoSheets(), 'Could not read the saved workbook; starting a demo sheet.');
    });
  }

  if (newBtn) {
    // window.confirm does NOTHING in an app frame: no allow-modals, so it
    // returns FALSE without asking and New workbook did nothing at all. Ask on
    // the button — first press arms it, second replaces the sheet, and it
    // disarms itself after four seconds.
    var newArm = 0;
    newBtn.addEventListener('click', function () {
      if (!newArm) {
        newBtn.dataset.was = newBtn.textContent;
        newBtn.textContent = 'Press again — this replaces the sheet';
        newBtn.classList.add('arm');
        newArm = setTimeout(function () {
          newArm = 0;
          newBtn.textContent = newBtn.dataset.was || 'New workbook';
          newBtn.classList.remove('arm');
        }, 4000);
        return;
      }
      clearTimeout(newArm);
      newArm = 0;
      newBtn.textContent = newBtn.dataset.was || 'New workbook';
      newBtn.classList.remove('arm');
      var blank = blankSheets();
      start(blank, 'Blank workbook');
      persist(blank);
    });
  }

  load();
})();
