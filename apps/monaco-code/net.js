/* Invite shares the file tree as a pair editor. Last write wins per file.
 * Invite is OS chrome — this file only says to press it. */
(function (root) {
  'use strict';

  var api = null, filesDb = null, cursorsDb = null;
  var me = { id: null, name: 'You' };
  var on = false, subscribed = false, owner = true;
  var lastAt = Object.create(null);
  var skip = Object.create(null);

  function statusOf(list) {
    var n = 0, names = [];
    (list || []).forEach(function (r) {
      if (r && r.id && r.id.indexOf('who_') === 0 && r.at && Date.now() - r.at < 12000) {
        n++;
        if (r.id !== 'who_' + me.id) names.push(r.name || 'Friend');
      }
    });
    if (!on) return 'Press Invite in the bar above to pair-edit these files.';
    if (n <= 1) return 'Waiting for a friend… Invite sends the link.';
    if (names.length === 1) return names[0] + ' is in this editor.';
    return names.length + ' friends in this editor.';
  }

  function publishFile(rec) {
    if (!on || !filesDb || !me.id || !rec) return;
    var row = {
      id: rec.id,
      name: rec.name,
      lang: rec.lang,
      text: rec.text,
      at: Date.now(),
      by: me.id,
      byName: me.name
    };
    lastAt[row.id] = row.at;
    skip[row.id] = true;
    filesDb.put(row).catch(function (e) {
      if (Mp.onStatus) Mp.onStatus(String((e && e.message) || e || 'Could not share.'), true);
    });
  }

  function publishCursor(fileId, line, col) {
    if (!on || !cursorsDb || !me.id) return;
    cursorsDb.put({
      id: 'cur_' + me.id,
      fileId: fileId || '',
      line: line | 0,
      col: col | 0,
      name: me.name,
      at: Date.now()
    }).catch(function () {});
  }

  function beat() {
    if (!on || !cursorsDb || !me.id) return;
    cursorsDb.put({ id: 'who_' + me.id, at: Date.now(), name: me.name }).catch(function () {});
  }

  function applyFiles(list) {
    var files = [];
    (list || []).forEach(function (r) {
      if (!r || r.id == null || !r.name) return;
      files.push(r);
    });
    if (Mp.onFiles) Mp.onFiles(files);
  }

  function applyCursors(list) {
    var live = [];
    (list || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (r.id.indexOf('cur_') === 0 && r.id !== 'cur_' + me.id && r.at && Date.now() - r.at < 15000) {
        live.push(r);
      }
    });
    if (Mp.onCursors) Mp.onCursors(live);
    if (Mp.onStatus) Mp.onStatus(statusOf(list), false);
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) {
      if (Mp.onStatus) Mp.onStatus(statusOf([]), false);
      return;
    }
    try {
      filesDb = filesDb || api.db('files');
      cursorsDb = cursorsDb || api.db('cursors');
    } catch (e) { return; }
    var who = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    var info = api.info ? api.info() : Promise.resolve({ owner: true });
    Promise.all([who, info]).then(function (pair) {
      var id = pair[0], inf = pair[1];
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      owner = !(inf && inf.owner === false);
      on = true;
      if (!subscribed) {
        subscribed = true;
        filesDb.subscribe(applyFiles);
        cursorsDb.subscribe(applyCursors);
      }
      beat();
    }).catch(function () {});
  }

  var hb = 0;
  function startBeat() {
    if (hb) return;
    hb = setInterval(beat, 3000);
  }

  var Mp = {
    watch: watch,
    publishFile: publishFile,
    publishCursor: publishCursor,
    beat: beat,
    startBeat: startBeat,
    remember: function (id, at) { if (id) lastAt[id] = at || Date.now(); },
    get me() { return me; },
    get owner() { return owner; },
    get live() { return on; },
    onFiles: null,
    onCursors: null,
    onStatus: null
  };
  root.MonacoMp = Mp;
})(typeof window !== 'undefined' ? window : this);
