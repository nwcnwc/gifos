/*
 * BeepBox — GifOS shell.
 *
 * Starts the vendored editor, keeps the song JSON in gifos.db('songs') so
 * the file IS the save, and wires jam + phone zoom. Invite is OS chrome.
 */
(function (root) {
  'use strict';

  var editor = null;
  var songsDb = null;
  var prefsDb = null;
  var saveTimer = 0;
  var lastPacked = '';
  var applying = false;
  var started = false;

  function pack(j) {
    try { return JSON.stringify(j); } catch (e) { return ''; }
  }

  function songJson() {
    if (!editor || !editor.doc || !editor.doc.song || !editor.doc.song.toJsonObject) return null;
    try { return editor.doc.song.toJsonObject(); } catch (e1) { return null; }
  }

  function applySong(json, asNew) {
    if (!json || !editor || !editor.doc || !editor.doc.song) return;
    var p = pack(json);
    if (p && p === lastPacked) return;
    applying = true;
    try {
      editor.doc.song.fromJsonObject(json);
      if (editor.doc.notifier && editor.doc.notifier.changed) editor.doc.notifier.changed();
      if (asNew && editor.doc.goBackToStart) editor.doc.goBackToStart();
      lastPacked = p;
      if (songsDb) {
        songsDb.put({ id: 'current', json: json, at: Date.now() }).catch(function () {});
      }
    } catch (e2) {
      try { console.warn('BeepBox: could not apply song', e2); } catch (e3) {}
    }
    applying = false;
  }

  function persist() {
    if (applying) return;
    var json = songJson();
    var p = pack(json);
    if (!p || p === lastPacked) return;
    lastPacked = p;
    if (songsDb) {
      songsDb.put({ id: 'current', json: json, at: Date.now() }).catch(function () {});
    }
    if (root.BeepNet && root.BeepNet.noteLocalChange) root.BeepNet.noteLocalChange();
  }

  function scheduleSave() {
    if (applying) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function flushPrefs() {
    if (!prefsDb || !root.GifOSBeepboxShim) return;
    var mem = root.GifOSBeepboxShim.memL || {};
    var keys = Object.keys(mem), i;
    for (i = 0; i < keys.length; i++) {
      prefsDb.put({ id: keys[i], value: mem[keys[i]] }).catch(function () {});
    }
  }

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    try { prefsDb = root.gifos.db('prefs'); } catch (e4) {}
    if (!prefsDb) return Promise.resolve();
    return prefsDb.getAll().then(function (rows) {
      var shim = root.GifOSBeepboxShim;
      (rows || []).forEach(function (r) {
        if (r && r.id && r.value != null && shim && shim.local) {
          shim.local.setItem(r.id, r.value);
        }
      });
      if (shim && shim.local) shim.local.setItem('displayBrowserUrl', 'false');
    }).catch(function () {});
  }

  function loadSong() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve(null);
    try { songsDb = root.gifos.db('songs'); } catch (e5) {}
    if (!songsDb) return Promise.resolve(null);
    return songsDb.get('current').then(function (row) {
      if (row && row.json && row.json.format === 'BeepBox') return row.json;
      return null;
    }).catch(function () { return null; });
  }

  function hideFileTraps() {
    var bad = { shortenUrl: 1, viewPlayer: 1, copyEmbed: 1, copyUrl: 1, shareUrl: 1 };
    var opts = document.querySelectorAll('select option');
    var i, v, t;
    for (i = opts.length - 1; i >= 0; i--) {
      v = opts[i].value;
      t = (opts[i].textContent || '').toLowerCase();
      if (bad[v] || /song url|html embed|song player|shorten song/.test(t)) {
        opts[i].remove();
      }
    }
  }

  function hashFromJson(json) {
    try {
      var s = new root.beepbox.Song();
      s.fromJsonObject(json);
      return s.toBase64String();
    } catch (e6) { return ''; }
  }

  function hasNotes(json) {
    return !!(json && json.channels && json.channels[0] && json.channels[0].patterns &&
      json.channels[0].patterns[0] && json.channels[0].patterns[0].notes &&
      json.channels[0].patterns[0].notes.length);
  }

  var triedEditor = false;
  function startEditor(box) {
    if (editor || triedEditor) return editor;
    triedEditor = true;
    try {
      editor = new root.beepbox.SongEditor(box);
    } catch (eStart) {
      root.BeepBootError = (eStart && eStart.stack) || String(eStart);
      try { console.warn('BeepBox: SongEditor', eStart); } catch (e8) {}
    }
    root.BeepEditor = editor;
    return editor;
  }

  var attached = false;
  function attach() {
    if (attached) return;
    attached = true;
    hideFileTraps();
    setTimeout(hideFileTraps, 0);
    setTimeout(hideFileTraps, 400);

    if (editor && editor.doc && editor.doc.notifier && editor.doc.notifier.watch) {
      editor.doc.notifier.watch(scheduleSave);
    }
    root.addEventListener('hashchange', scheduleSave);

    if (root.BeepTouch) root.BeepTouch.init();

    if (root.BeepNet) {
      root.BeepNet.init({
        getJson: songJson,
        applyJson: function (j) { applySong(j, false); }
      });
    }

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (editor && editor.doc && editor.doc.undo) editor.doc.undo();
      });
    }

    root.addEventListener('pagehide', function () { persist(); flushPrefs(); });
    root.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { persist(); flushPrefs(); }
    });
    setInterval(flushPrefs, 8000);
    setInterval(persist, 2500);
  }

  function boot() {
    var box = document.getElementById('beepboxEditorContainer');
    if (!box || !root.beepbox || !root.beepbox.SongEditor) {
      if (box) box.textContent = 'BeepBox failed to load.';
      return;
    }

    loadPrefs().then(loadSong).then(function (saved) {
      var initial = saved || root.BEEPBOX_SEED || null;
      if (initial) {
        var hash = hashFromJson(initial);
        if (hash) {
          try { root.location.hash = hash; } catch (e7) {}
        }
      }

      startEditor(box);

      if (initial) {
        if (!hasNotes(songJson())) {
          lastPacked = '';
          applySong(initial, !saved);
        } else {
          lastPacked = pack(songJson());
        }
      }

      if (!started) {
        started = true;
        var json = songJson() || initial;
        if (songsDb && json) {
          songsDb.put({ id: 'current', json: json, at: Date.now() }).catch(function () {});
          lastPacked = pack(json);
        }
      }

      attach();
    }).catch(function (err) {
      try { console.warn(err); } catch (e9) {}
      startEditor(box);
      attach();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
