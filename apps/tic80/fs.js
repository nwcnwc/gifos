/*
 * TIC-80 — disk in the icon.
 *
 * The HTML build mounts IDBFS on --fs. IndexedDB is off in the sandbox, so
 * we replace IDBFS.syncfs: populate restores gifos.db('disk'), persist walks
 * /work back into it. Sample carts are seeded if missing.
 */
(function (root) {
  'use strict';

  var WORK = '/work';
  var api = null;
  var seeded = false;
  var persistTimer = 0;
  var lastHash = '';
  var onDisk = null;

  function db(n) { return api && api.db ? api.db(n) : null; }

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
    var names, i, n, p, st;
    try { names = FS.readdir(path); } catch (e) { return; }
    for (i = 0; i < names.length; i++) {
      n = names[i];
      if (n === '.' || n === '..') continue;
      p = path === '/' ? '/' + n : path + '/' + n;
      try { st = FS.stat(p); } catch (e) { continue; }
      if (FS.isDir(st.mode)) walk(p, out);
      else if (FS.isFile(st.mode)) {
        try { out.push({ path: p, bytes: FS.readFile(p) }); } catch (e) {}
      }
    }
  }

  function dirname(p) {
    var i = String(p).lastIndexOf('/');
    return i <= 0 ? '/' : p.slice(0, i);
  }

  function mkdirp(p) {
    var parts = p.split('/'), cur = '', i;
    for (i = 1; i < parts.length; i++) {
      cur += '/' + parts[i];
      try { FS.mkdir(cur); } catch (e) {}
    }
  }

  function writeFile(path, bytes) {
    mkdirp(dirname(path));
    FS.writeFile(path, bytes);
  }

  function seed(rootPath) {
    var carts = root.TIC_CARTS || [];
    var i, c, p;
    for (i = 0; i < carts.length; i++) {
      c = carts[i];
      p = rootPath + '/' + c.file;
      try {
        FS.stat(p);
      } catch (e) {
        try { writeFile(p, c.bytes); } catch (err) {}
      }
    }
    seeded = true;
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
    if (!col) return Promise.resolve();
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
      var have = {}, i, puts = [];
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

  function patch() {
    if (typeof IDBFS === 'undefined') return;
    IDBFS.syncfs = function (mount, populate, callback) {
      var rootPath = (mount && mount.mountpoint) || WORK;
      if (rootPath) WORK = rootPath;
      function done() { try { callback(null); } catch (e) { callback(e); } }
      if (populate) {
        restore().then(function () {
          seed(rootPath);
          done();
        }, function () {
          seed(rootPath);
          done();
        });
      } else {
        persistSoon();
        done();
      }
    };
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
