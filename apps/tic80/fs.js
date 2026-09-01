/*
 * TIC-80 — disk in the icon.
 *
 * The HTML build always mounts IDBFS at /com.nesbox.tic/TIC-80/. --fs=/work
 * is the engine's cart folder (studio_create uses it; missing = exit(1)).
 * IndexedDB is off in the sandbox, so IDBFS.syncfs is stubbed and every
 * write under /work is snapshotted into gifos.db('disk').
 *
 * FS/IDBFS live inside TIC80_START (not window) until build.mjs exports
 * them at FS.staticInit. Patch from preRun, after that export.
 */
(function (root) {
  'use strict';

  var WORK = '/work';
  var api = null;
  var persistTimer = 0;
  var lastHash = '';
  var onDisk = null;
  var hooked = false;

  function db(n) { return api && api.db ? api.db(n) : null; }
  function getFS() {
    if (typeof FS !== 'undefined') return FS;
    if (root.Module && root.Module.FS) return root.Module.FS;
    return null;
  }
  function getIDBFS() {
    if (typeof IDBFS !== 'undefined') return IDBFS;
    if (root.Module && root.Module.IDBFS) return root.Module.IDBFS;
    var fs = getFS();
    return fs && fs.filesystems ? fs.filesystems.IDBFS : null;
  }

  function b64(u8) {
    var s = '', i;
    for (i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s || ''), u = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function bytesOf(x) {
    if (!x) return null;
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (typeof x === 'string') return unb64(x);
    return null;
  }

  function walk(path, out) {
    var fs = getFS();
    var names, i, n, p, st;
    if (!fs) return;
    try { names = fs.readdir(path); } catch (e) { return; }
    for (i = 0; i < names.length; i++) {
      n = names[i];
      if (n === '.' || n === '..') continue;
      p = path === '/' ? '/' + n : path + '/' + n;
      try { st = fs.stat(p); } catch (e) { continue; }
      if (fs.isDir(st.mode)) walk(p, out);
      else if (fs.isFile(st.mode)) {
        try { out.push({ path: p, bytes: fs.readFile(p) }); } catch (e) {}
      }
    }
  }

  function dirname(p) {
    var i = String(p).lastIndexOf('/');
    return i <= 0 ? '/' : p.slice(0, i);
  }

  function mkdirp(p) {
    var fs = getFS();
    if (!fs || !p || p === '/') return;
    if (fs.mkdirTree) {
      try { fs.mkdirTree(p); return; } catch (e) {}
    }
    var parts = p.split('/'), cur = '', i;
    for (i = 1; i < parts.length; i++) {
      cur += '/' + parts[i];
      try { fs.mkdir(cur); } catch (e) {}
    }
  }

  function writeFile(path, bytes) {
    var fs = getFS();
    if (!fs) return;
    mkdirp(dirname(path));
    fs.writeFile(path, bytes);
  }

  function seed(rootPath) {
    var carts = root.TIC_CARTS || [];
    var i, c, p, fs = getFS();
    if (!fs) return;
    mkdirp(rootPath);
    for (i = 0; i < carts.length; i++) {
      c = carts[i];
      p = rootPath + '/' + c.file;
      try {
        fs.stat(p);
      } catch (e) {
        try { writeFile(p, c.bytes); } catch (err) {}
      }
    }
  }

  function restore() {
    var col = db('disk');
    if (!col) return Promise.resolve();
    return col.getAll().then(function (list) {
      var i, r, b;
      for (i = 0; i < (list || []).length; i++) {
        r = list[i];
        if (!r || !r.id || r.id === 'meta') continue;
        b = bytesOf(r.bytes);
        if (!b) continue;
        try { writeFile(r.id, b); } catch (e) {}
      }
    }).catch(function () {});
  }

  function persistNow() {
    var col = db('disk');
    var fs = getFS();
    if (!col || !fs) return Promise.resolve();
    var files = [];
    walk(WORK, files);
    var rows = [], i, h = '';
    for (i = 0; i < files.length; i++) {
      h += files[i].path + ':' + files[i].bytes.length + ';';
      rows.push({ id: files[i].path, bytes: b64(files[i].bytes) });
    }
    if (h === lastHash) return Promise.resolve();
    lastHash = h;
    return col.getAll().then(function (list) {
      var have = {}, puts = [];
      for (i = 0; i < rows.length; i++) {
        have[rows[i].id] = 1;
        puts.push(col.put(rows[i]));
      }
      for (i = 0; i < (list || []).length; i++) {
        if (list[i] && list[i].id && list[i].id !== 'meta' && !have[list[i].id]) {
          puts.push(col.delete(list[i].id));
        }
      }
      return Promise.all(puts);
    }).then(function () {
      if (onDisk) onDisk(listCarts());
    }).catch(function () {});
  }

  function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () { persistTimer = 0; persistNow(); }, 400);
  }

  function listCarts() {
    var files = [], out = [], i, p, ext;
    try { walk(WORK, files); } catch (e) { return out; }
    for (i = 0; i < files.length; i++) {
      p = files[i].path;
      if (p.indexOf('/.local') !== -1) continue;
      ext = (p.split('.').pop() || '').toLowerCase();
      if ('tic lua js gif png moon fnl wren rb py janet nut scm'.split(' ').indexOf(ext) < 0) continue;
      out.push({
        path: p,
        name: p.slice(WORK.length + 1),
        bytes: files[i].bytes
      });
    }
    return out;
  }

  function stubIDBFS() {
    var idb = getIDBFS();
    if (!idb) return;
    idb.syncfs = function (mount, populate, callback) {
      try { callback(null); } catch (e) { try { callback(e); } catch (err) {} }
    };
  }

  function fillWork() {
    mkdirp(WORK);
    return restore().then(function () {
      seed(WORK);
      return persistNow();
    }, function () {
      seed(WORK);
      return persistNow();
    });
  }

  function patch() {
    var fs = getFS();
    if (!fs) return;
    stubIDBFS();
    mkdirp(WORK);
    seed(WORK);
    if (!hooked) {
      var orig = fs.syncfs.bind(fs);
      fs.syncfs = function (populate, callback) {
        if (typeof populate === 'function') {
          callback = populate;
          populate = false;
        }
        stubIDBFS();
        function done(err) {
          if (populate) {
            fillWork().then(function () { if (callback) callback(err); }, function () { if (callback) callback(err); });
          } else {
            persistSoon();
            if (callback) callback(err);
          }
        }
        try { orig(populate, done); }
        catch (e) { done(e); }
      };
      hooked = true;
    }
    fillWork();
  }

  function putCart(name, bytes) {
    var path = WORK + '/' + String(name || 'drop.tic').replace(/^.*[/\\]/, '');
    try { writeFile(path, bytes); } catch (e) { return false; }
    persistSoon();
    return path;
  }

  root.TicFS = {
    init: function (gifos, opts) {
      api = gifos;
      onDisk = opts && opts.onDisk;
      if (root.addEventListener) {
        root.addEventListener('pagehide', function () { persistNow(); });
        root.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') persistNow();
        });
      }
    },
    patch: patch,
    seed: function () { seed(WORK); },
    persist: persistNow,
    listCarts: listCarts,
    putCart: putCart,
    work: WORK,
    bytesOf: bytesOf,
    b64: b64
  };
})(window);
