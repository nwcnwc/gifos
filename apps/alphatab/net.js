/* Last song is private. The host's song is read-only for guests. The
 * playhead (tick + playing) is the live room. Invite is OS chrome. */
(function (root) {
  'use strict';

  var MAX_BYTES = 8 * 1024 * 1024;
  var saveDb = null, songDb = null, followDb = null;
  var me = { id: '', name: '' };
  var applying = false;
  var saveTimer = 0;
  var curTimer = 0;
  var lastSongSig = '';
  var lastCursorAt = 0;
  var onRemoteSong = null;
  var onRemoteCursor = null;

  function db(name) {
    try { return root.gifos && root.gifos.db ? root.gifos.db(name) : null; } catch (e) { return null; }
  }

  function start(hooks) {
    onRemoteSong = hooks && hooks.onSong;
    onRemoteCursor = hooks && hooks.onCursor;
    saveDb = db('save');
    songDb = db('song');
    followDb = db('follow');
    var ready = Promise.resolve();
    if (root.gifos && root.gifos.me) {
      ready = root.gifos.me().then(function (m) { if (m) me = m; }).catch(function () {});
    }
    return ready.then(function () {
      if (songDb && songDb.subscribe) {
        songDb.subscribe(function (rows) {
          var rec = pick(rows, 'file');
          if (!rec) return;
          var sig = (rec.name || '') + ':' + (rec.kind || '') + ':' +
            (rec.tex ? rec.tex.length : 0) + ':' +
            (rec.bytes && (rec.bytes.byteLength || rec.bytes.length) || 0);
          if (sig === lastSongSig) return;
          lastSongSig = sig;
          if (applying) return;
          if (onRemoteSong) onRemoteSong(rec);
        });
      }
      if (followDb && followDb.subscribe) {
        followDb.subscribe(function (rows) {
          var rec = pick(rows, 'cursor');
          if (!rec) return;
          if (rec.by && rec.by === me.id) return;
          if ((rec.at || 0) <= lastCursorAt) return;
          lastCursorAt = rec.at || 0;
          if (onRemoteCursor) onRemoteCursor(rec);
        });
      }
    });
  }

  function pick(rows, id) {
    rows = rows || [];
    for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].id === id) return rows[i];
    return null;
  }

  function bufOf(bytes) {
    if (!bytes) return null;
    if (bytes.buffer && bytes.byteLength != null) {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    if (bytes instanceof ArrayBuffer) return bytes;
    return null;
  }

  function loadSaved() {
    if (!saveDb || !saveDb.get) return Promise.resolve(null);
    return saveDb.get('last').catch(function () { return null; });
  }

  function persist(state) {
    if (applying || !saveDb || !state) return;
    var rec = {
      id: 'last',
      name: state.name || '',
      kind: state.kind || 'tex',
      tick: state.tick | 0,
      speed: state.speed || 1,
      layout: state.layout || 'page',
      stave: state.stave || 'both',
      zoom: state.zoom || 1
    };
    if (state.kind === 'tex') rec.tex = String(state.tex || '').slice(0, MAX_BYTES);
    else if (state.bytes && state.bytes.byteLength <= MAX_BYTES) rec.bytes = new Uint8Array(state.bytes);
    saveDb.put(rec).catch(function () {});
  }

  function scheduleSave(state) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { persist(state); }, 400);
  }

  function publishSong(state) {
    if (!songDb || !state) return;
    var rec = {
      id: 'file',
      name: state.name || 'song',
      kind: state.kind || 'tex',
      at: Date.now()
    };
    if (state.kind === 'tex') {
      rec.tex = String(state.tex || '');
      lastSongSig = rec.name + ':tex:' + rec.tex.length + ':0';
    } else {
      if (!state.bytes || state.bytes.byteLength > MAX_BYTES) return;
      rec.bytes = new Uint8Array(state.bytes);
      lastSongSig = rec.name + ':bytes:0:' + state.bytes.byteLength;
    }
    songDb.put(rec).catch(function () {});
  }

  function publishCursor(state) {
    if (!followDb || !state) return;
    var rec = {
      id: 'cursor',
      tick: state.tick | 0,
      time: state.time || 0,
      playing: !!state.playing,
      speed: state.speed || 1,
      by: me.id,
      name: me.name || '',
      at: Date.now()
    };
    lastCursorAt = rec.at;
    followDb.put(rec).catch(function () {});
  }

  function pulseCursor(state) {
    if (curTimer) return;
    curTimer = setTimeout(function () {
      curTimer = 0;
      publishCursor(state);
    }, 120);
  }

  function setApplying(on) { applying = !!on; }
  function isApplying() { return applying; }

  root.AtNet = {
    MAX_BYTES: MAX_BYTES,
    start: start,
    loadSaved: loadSaved,
    persist: persist,
    scheduleSave: scheduleSave,
    publishSong: publishSong,
    publishCursor: publishCursor,
    pulseCursor: pulseCursor,
    setApplying: setApplying,
    isApplying: isApplying,
    bufOf: bufOf,
    me: function () { return me; }
  };
})(typeof window !== 'undefined' ? window : this);
