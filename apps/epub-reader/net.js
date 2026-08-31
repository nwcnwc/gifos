/* Last book is private. The host's EPUB is read-only for guests. The follow
 * cursor (chapter + page + optional pointer) is the live room. Invite is OS chrome. */
(function (root) {
  'use strict';

  var MAX_BYTES = 8 * 1024 * 1024;
  var saveDb = null, docDb = null, followDb = null;
  var me = { id: '', name: '' };
  var applying = false;
  var saveTimer = 0;
  var ptrTimer = 0;
  var lastPtr = null;
  var onRemoteDoc = null;
  var onRemoteCursor = null;
  var lastDocSig = '';
  var lastCursorAt = 0;

  function db(name) {
    try { return root.gifos && root.gifos.db ? root.gifos.db(name) : null; } catch (e) { return null; }
  }

  function start(hooks) {
    onRemoteDoc = hooks && hooks.onDoc;
    onRemoteCursor = hooks && hooks.onCursor;
    saveDb = db('save');
    docDb = db('doc');
    followDb = db('follow');
    var ready = Promise.resolve();
    if (root.gifos && root.gifos.me) {
      ready = root.gifos.me().then(function (m) { if (m) me = m; }).catch(function () {});
    }
    return ready.then(function () {
      if (docDb && docDb.subscribe) {
        docDb.subscribe(function (rows) {
          var rec = pick(rows, 'file');
          if (!rec || !rec.bytes) return;
          var sig = rec.name + ':' + (rec.bytes.byteLength || rec.bytes.length || 0);
          if (sig === lastDocSig) return;
          lastDocSig = sig;
          if (applying) return;
          if (onRemoteDoc) onRemoteDoc(rec);
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

  function persist(viewer) {
    if (applying || !saveDb || !viewer || !viewer.bytes) return;
    var rec = {
      id: 'last',
      name: viewer.name || '',
      title: viewer.title || '',
      spine: viewer.spineIndex,
      page: viewer.pageI,
      fontPx: viewer.fontPx,
      fraction: viewer.pageN > 1 ? viewer.pageI / (viewer.pageN - 1) : 0
    };
    if (viewer.bytes.byteLength <= MAX_BYTES) rec.bytes = new Uint8Array(viewer.bytes);
    saveDb.put(rec).catch(function () {});
  }

  function scheduleSave(viewer) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { persist(viewer); }, 400);
  }

  function publishDoc(viewer) {
    if (!docDb || !viewer || !viewer.bytes) return;
    if (viewer.bytes.byteLength > MAX_BYTES) return;
    lastDocSig = (viewer.name || '') + ':' + viewer.bytes.byteLength;
    docDb.put({
      id: 'file',
      name: viewer.name || 'book.epub',
      bytes: new Uint8Array(viewer.bytes),
      at: Date.now()
    }).catch(function () {});
  }

  function publishCursor(viewer, ptr, pointing) {
    if (!followDb || !viewer) return;
    var rec = {
      id: 'cursor',
      spine: viewer.spineIndex,
      page: viewer.pageI,
      pages: viewer.pageN,
      fraction: viewer.pageN > 1 ? viewer.pageI / (viewer.pageN - 1) : 0,
      pointing: !!pointing,
      by: me.id,
      name: me.name || '',
      at: Date.now()
    };
    lastCursorAt = rec.at;
    if (ptr) { rec.px = ptr.x; rec.py = ptr.y; }
    followDb.put(rec).catch(function () {});
  }

  function point(viewer, ptr, pointing) {
    lastPtr = ptr;
    if (!pointing) {
      clearTimeout(ptrTimer);
      publishCursor(viewer, ptr, false);
      return;
    }
    if (ptrTimer) return;
    ptrTimer = setTimeout(function () {
      ptrTimer = 0;
      publishCursor(viewer, lastPtr, true);
    }, 80);
  }

  function setApplying(on) { applying = !!on; }
  function isApplying() { return applying; }

  root.EpubNet = {
    MAX_BYTES: MAX_BYTES,
    start: start,
    loadSaved: loadSaved,
    persist: persist,
    scheduleSave: scheduleSave,
    publishDoc: publishDoc,
    publishCursor: publishCursor,
    point: point,
    setApplying: setApplying,
    isApplying: isApplying,
    bufOf: bufOf,
    me: function () { return me; }
  };
})(typeof window !== 'undefined' ? window : this);
