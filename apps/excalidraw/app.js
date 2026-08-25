/* Excalidraw — GifOS shell.
 *
 * The engine is window.ExcalidrawLib (React + Excalidraw, packed as one IIFE).
 * Persistence is gifos.db('drawings'); Firebase / live-collab / the library
 * CDN are never wired. localStorage is a memory stub in shim.js.
 */
(function () {
  'use strict';

  var EX = window.ExcalidrawLib;
  var rootEl = document.getElementById('root');

  function fail(msg) {
    if (rootEl) rootEl.innerHTML = '<div class="boot">' + msg + '</div>';
  }

  if (!EX || !EX.Excalidraw || !EX.React || !EX.createRoot) {
    fail('Excalidraw failed to load.');
    return;
  }

  var h = EX.React.createElement;
  var DOC_PREFIX = 'd-';
  var META_ID = '__meta';
  var LIBRARY_ID = '__library';
  var SAVE_MS = 500;
  var db = (window.gifos && window.gifos.db) ? window.gifos.db('drawings') : null;

  var reactRoot = null;
  var api = null;
  var currentId = null;
  var currentName = 'Board';
  var libraryItems = [];
  var saveTimer = null;
  var ready = false;
  var modalOpen = false;
  var records = [];

  var DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var bar = document.createElement('div');
  bar.className = 'g-bar';
  bar.innerHTML = '<button type="button" class="g-pill" id="g-pill" title="Boards on this device">Opening…</button>';
  document.body.appendChild(bar);
  var pill = document.getElementById('g-pill');

  var modal = document.createElement('div');
  modal.className = 'g-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="g-card" role="dialog" aria-labelledby="g-title">' +
      '<h2 id="g-title">Boards</h2>' +
      '<p>Saved on this device, inside the app.</p>' +
      '<input type="text" id="g-name" maxlength="80" placeholder="Name this board">' +
      '<ul class="g-list" id="g-list"></ul>' +
      '<div class="g-row">' +
        '<button type="button" class="act" id="g-new">New board</button>' +
        '<button type="button" class="ghost" id="g-close">Close</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  var nameInput = document.getElementById('g-name');
  var listEl = document.getElementById('g-list');

  function uid() {
    return DOC_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function setPill(state, text) {
    pill.className = 'g-pill' + (state ? ' ' + state : '');
    pill.textContent = text;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 48) return h + 'h ago';
    return new Date(ts).toLocaleDateString();
  }

  function blankScene() {
    return {
      elements: [],
      appState: {
        viewBackgroundColor: '#121212',
        theme: 'dark',
        gridSize: 20,
        name: 'Board'
      },
      files: {}
    };
  }

  function snapshot() {
    if (!api || !EX.serializeAsJSON) {
      return { elements: [], appState: blankScene().appState, files: {} };
    }
    try {
      var json = EX.serializeAsJSON(
        api.getSceneElements(),
        api.getAppState(),
        api.getFiles(),
        'local'
      );
      var data = JSON.parse(json);
      return {
        elements: data.elements || [],
        appState: data.appState || {},
        files: data.files || {}
      };
    } catch (e) {
      return { elements: [], appState: blankScene().appState, files: {} };
    }
  }

  function persistNow() {
    if (!currentId) return Promise.resolve();
    var snap = snapshot();
    var rec = {
      id: currentId,
      name: currentName || 'Board',
      elements: snap.elements,
      appState: snap.appState,
      files: snap.files,
      savedAt: Date.now()
    };
    if (!db) {
      setPill('', currentName + ' · not saved — open inside GifOS');
      return Promise.resolve();
    }
    return db.put(rec).then(function () {
      return db.put({ id: META_ID, currentId: currentId });
    }).then(function () {
      if (window.gifos && window.gifos.save) return window.gifos.save();
    }).then(function () {
      setPill('saved', rec.name + ' · saved on this device');
      var i;
      for (i = 0; i < records.length; i++) {
        if (records[i].id === rec.id) { records[i] = rec; break; }
      }
      if (i === records.length) records.push(rec);
    }).catch(function (err) {
      setPill('', 'Could not save: ' + ((err && err.message) || err));
    });
  }

  function scheduleSave() {
    if (!ready) return;
    setPill('saving', currentName + ' · saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, SAVE_MS);
  }

  function persistLibrary(items) {
    libraryItems = items || [];
    if (!db) return;
    db.put({ id: LIBRARY_ID, items: libraryItems }).catch(function () {});
  }

  function initialDataFor(rec) {
    var scene = rec && Array.isArray(rec.elements) ? rec : blankScene();
    var appState = scene.appState ? Object.assign({}, scene.appState) : {};
    if (!appState.theme) appState.theme = 'dark';
    if (!appState.viewBackgroundColor) appState.viewBackgroundColor = '#121212';
    return {
      elements: scene.elements || [],
      appState: appState,
      files: scene.files || {},
      libraryItems: libraryItems,
      scrollToContent: !!(scene.elements && scene.elements.length)
    };
  }

  function menu() {
    if (!EX.MainMenu) return null;
    var D = EX.MainMenu.DefaultItems || {};
    var kids = [];
    if (D.LoadScene) kids.push(h(D.LoadScene));
    if (D.SaveToActiveFile) kids.push(h(D.SaveToActiveFile));
    if (D.Export) kids.push(h(D.Export));
    if (D.SaveAsImage) kids.push(h(D.SaveAsImage));
    if (EX.MainMenu.Item) {
      kids.push(h(EX.MainMenu.Item, { onSelect: openModal }, 'Boards on this device…'));
    }
    if (D.ClearCanvas) kids.push(h(D.ClearCanvas));
    if (EX.MainMenu.Separator) kids.push(h(EX.MainMenu.Separator));
    if (D.ToggleTheme) kids.push(h(D.ToggleTheme));
    if (D.ChangeCanvasBackground) kids.push(h(D.ChangeCanvasBackground));
    return h(EX.MainMenu, null, kids);
  }

  function mount(rec) {
    ready = false;
    api = null;
    if (reactRoot) {
      try { reactRoot.unmount(); } catch (e) {}
      reactRoot = null;
    }
    rootEl.innerHTML = '';
    var host = document.createElement('div');
    host.style.height = '100%';
    host.style.width = '100%';
    rootEl.appendChild(host);
    reactRoot = EX.createRoot(host);
    var data = initialDataFor(rec);
    reactRoot.render(h(EX.Excalidraw, {
      key: currentId,
      initialData: data,
      excalidrawAPI: function (a) { api = a; },
      onChange: function () { scheduleSave(); },
      onLibraryChange: persistLibrary,
      theme: (data.appState && data.appState.theme) || 'dark',
      name: currentName,
      UIOptions: {
        canvasActions: {
          loadScene: true,
          saveToActiveFile: true,
          export: { saveFileToDisk: true },
          saveAsImage: true,
          toggleTheme: true,
          clearCanvas: true
        }
      }
    }, menu()));
    setTimeout(function () { ready = true; }, 120);
  }

  function openBoard(rec, note) {
    currentId = rec.id;
    currentName = rec.name || 'Board';
    if (nameInput) nameInput.value = currentName;
    mount(rec);
    setPill(db ? 'saved' : '', note || (currentName + (db ? ' · saved on this device' : ' · not saved — open inside GifOS')));
  }

  function newBoard() {
    var rec = Object.assign({ id: uid(), name: 'Board', savedAt: Date.now() }, blankScene());
    records.push(rec);
    openBoard(rec, rec.name + ' · new board');
    persistNow();
    renderList();
  }

  function deleteBoard(id) {
    if (records.length < 2) return;
    records = records.filter(function (r) { return r.id !== id; });
    if (db) db.delete(id).catch(function () {});
    if (currentId === id) {
      openBoard(records[0], records[0].name + ' · saved on this device');
      persistNow();
    }
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    var html = '';
    var sorted = records.slice().sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      var n = (r.name || 'Board').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      html += '<li data-id="' + r.id + '">' +
        '<button type="button" class="link">' + n + (r.id === currentId ? ' · open' : '') + '</button>' +
        '<span class="g-meta">' + timeAgo(r.savedAt) + '</span>' +
        (records.length > 1 ? '<button type="button" class="row-del" title="Delete board" aria-label="Delete">' + DEL + '</button>' : '') +
        '</li>';
    }
    listEl.innerHTML = html;
  }

  function openModal() {
    modal.hidden = false;
    modalOpen = true;
    if (nameInput) {
      nameInput.value = currentName;
      try { nameInput.focus(); nameInput.select(); } catch (e) {}
    }
    renderList();
  }

  function closeModal() {
    modal.hidden = true;
    modalOpen = false;
  }

  pill.addEventListener('click', function () {
    if (modalOpen) closeModal();
    else openModal();
  });
  document.getElementById('g-close').addEventListener('click', closeModal);
  document.getElementById('g-new').addEventListener('click', function () { newBoard(); });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  listEl.addEventListener('click', function (e) {
    var li = e.target.closest('li');
    if (!li) return;
    var id = li.getAttribute('data-id');
    if (e.target.closest('.row-del')) {
      if (window.confirm('Delete this board? The drawing is removed from this device.')) deleteBoard(id);
      return;
    }
    if (e.target.closest('.link')) {
      var rec = null;
      for (var i = 0; i < records.length; i++) if (records[i].id === id) rec = records[i];
      if (rec && rec.id !== currentId) {
        persistNow();
        openBoard(rec);
      }
      closeModal();
    }
  });
  nameInput.addEventListener('change', function () {
    var n = (nameInput.value || '').trim() || 'Board';
    currentName = n;
    if (api && api.updateScene) {
      try { api.updateScene({ appState: { name: n } }); } catch (e) {}
    }
    scheduleSave();
    renderList();
  });

  if (window.gifos && window.gifos.onBack) {
    window.gifos.onBack(function () {
      if (modalOpen) { closeModal(); return; }
    });
  }

  function isBoard(r) {
    return r && r.id && r.id !== META_ID && r.id !== LIBRARY_ID;
  }

  function start() {
    if (!db) {
      var rec = Object.assign({ id: uid(), name: 'Board', savedAt: Date.now() }, blankScene());
      records = [rec];
      openBoard(rec, 'Board · not saved — open this app inside GifOS to keep it.');
      return;
    }
    db.getAll().then(function (rows) {
      rows = rows || [];
      var meta = null;
      records = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === META_ID) meta = rows[i];
        else if (rows[i].id === LIBRARY_ID) libraryItems = rows[i].items || [];
        else if (isBoard(rows[i])) records.push(rows[i]);
      }
      var pick = null;
      if (meta && meta.currentId) {
        for (i = 0; i < records.length; i++) if (records[i].id === meta.currentId) pick = records[i];
      }
      if (!pick && records.length) {
        pick = records.slice().sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); })[0];
      }
      if (!pick) {
        pick = Object.assign({ id: uid(), name: 'Board', savedAt: Date.now() }, blankScene());
        records = [pick];
        openBoard(pick, 'Board · saved on this device');
        persistNow();
        return;
      }
      openBoard(pick, (pick.name || 'Board') + ' · saved on this device');
    }).catch(function () {
      var rec = Object.assign({ id: uid(), name: 'Board', savedAt: Date.now() }, blankScene());
      records = [rec];
      openBoard(rec, 'Could not read the saved board; starting empty.');
    });
  }

  start();
})();
