/*
 * wv-tiles.js — GIBS tiles: the address, the queue, and the two caches.
 *
 * THE ADDRESS. NASA's Global Imagery Browse Services serves WMTS in EPSG:4326
 * — plain plate carrée, which is also how this app draws — so the arithmetic is
 * honest: level 0 is a 512 px tile covering 288°, and every level halves it.
 *
 *     https://gibs.earthdata.nasa.gov/wmts/epsg4326/best
 *        /{layer}/default/{time}/{tileMatrixSet}/{level}/{row}/{col}.{ext}
 *
 * THE QUEUE. Every tile goes through gifos.fetch, which is an RPC to the OS
 * page, so requests are not free and cannot be cancelled once sent. The queue
 * therefore does the cancelling: a tile that is no longer on screen is dropped
 * before it is ever sent, and what is left is served nearest-the-centre first.
 * Panning fast must not spend the connection on tiles nobody will see.
 *
 * THE TWO CACHES. Decoded bitmaps live in memory and are evicted by count.
 * The BYTES live in gifos.db, which means they are inside the app's icon:
 * everything you have looked at is still there on a plane, and it travels if
 * you hand someone the GIF. That is also why it is capped and visible — the
 * user's own file grows with it, so "Offline & storage" shows the number and
 * has a button that empties it.
 */
(function () {
  'use strict';

  var U = window.WVUtil;

  var HOST = 'https://gibs.earthdata.nasa.gov';
  var ENDPOINT = HOST + '/wmts/epsg4326/best';
  var TILE = 512;                 // GIBS EPSG:4326 tile size
  var RES0 = 0.5625;              // degrees per pixel at level 0
  var MAX_INFLIGHT = 8;
  var MEM_TILES = 220;            // decoded bitmaps held in memory
  var DEFAULT_BUDGET = 24 * 1024 * 1024;

  var T = {
    TILE: TILE,
    RES0: RES0,
    net: 'unknown',               // 'live' | 'offline' | 'unknown'
    stats: { fetched: 0, fromDb: 0, failed: 0, bytes: 0 },
  };

  T.res = function (level) { return RES0 / Math.pow(2, level); };
  T.span = function (level) { return RES0 * TILE / Math.pow(2, level); };

  /*
   * Which level to ask for, given how many degrees ONE DEVICE PIXEL covers.
   *
   * Two mistakes are easy here and both are expensive. Choosing by CSS pixels
   * on a phone at dpr 3 fetches a quarter of the detail the screen can show and
   * the map looks soft. Rounding UP always (the obvious `ceil`) fetches the
   * next level down — four times the tiles — to downscale them by five; at
   * whole-Earth zoom that is 15 tiles where 3 would have been sharper than the
   * display. So: nearest level, with a small bias towards the finer one, and
   * never finer than the layer actually has (asking a 2 km layer for level 8
   * is a screen of 404s).
   */
  T.levelFor = function (resPerDevicePx, layer) {
    var want = Math.round(Math.log(RES0 / resPerDevicePx) / Math.LN2 + 0.2);
    return U.clamp(want, 0, layer && layer.z != null ? layer.z : 8);
  };

  T.matrixSize = function (level) {
    var span = T.span(level);
    return { w: Math.ceil(360 / span), h: Math.ceil(180 / span) };
  };

  // The TIME segment of the URL. GIBS keys the archive by it, and each layer's
  // period decides the shape: a day for daily imagery, the first of the month
  // for a monthly composite, an ISO instant for the geostationary feeds that
  // land every ten minutes, and the literal "default" for things that do not
  // change (Blue Marble, coastlines).
  T.timeOf = function (layer, day, minutes) {
    if (layer.period === 'static') return 'default';
    var d = U.snapDay(day, layer);
    if (layer.period === '30min' || layer.period === '10min') {
      var step = layer.period === '30min' ? 30 : 10;
      var m = Math.floor((minutes || 0) / step) * step;
      return d + 'T' + U.pad(Math.floor(m / 60)) + ':' + U.pad(m % 60) + ':00Z';
    }
    return d;
  };

  T.url = function (layer, time, level, row, col) {
    return ENDPOINT + '/' + layer.id + '/default/' + time + '/' + layer.set +
           '/' + level + '/' + row + '/' + col + '.' + layer.fmt;
  };

  T.key = function (layerId, time, level, row, col) {
    return layerId + '|' + time + '|' + level + '|' + row + '|' + col;
  };

  // ---- memory cache --------------------------------------------------------
  var mem = new Map();            // key -> { bmp, at }
  var missing = new Map();        // key -> at   (a 404 is DATA: no imagery here)
  var failed = new Map();         // key -> at   (a network failure: retry later)

  function memPut(key, bmp) {
    mem.set(key, { bmp: bmp, at: Date.now() });
    if (mem.size > MEM_TILES) {
      // Evict the oldest quarter in one pass rather than one per insert.
      var arr = Array.from(mem.entries()).sort(function (a, b) { return a[1].at - b[1].at; });
      for (var i = 0; i < arr.length / 4; i++) {
        var v = mem.get(arr[i][0]);
        if (v && v.bmp && v.bmp.close) { try { v.bmp.close(); } catch (e) {} }
        mem.delete(arr[i][0]);
      }
    }
  }

  T.peek = function (key) {
    var v = mem.get(key);
    if (!v) return null;
    v.at = Date.now();
    return v.bmp;
  };
  T.isMissing = function (key) { return missing.has(key); };
  T.isFailed = function (key) {
    var at = failed.get(key);
    if (!at) return false;
    if (Date.now() - at > 20000) { failed.delete(key); return false; }
    return true;
  };

  // ---- the byte cache in gifos.db -----------------------------------------
  // Bytes go in their OWN collection and are read one at a time: the platform
  // hands every subscriber a WHOLE collection on every change, so tiles must
  // never live beside anything the UI subscribes to.
  var db = null, idxDb = null;
  var index = { id: 'idx', keys: {}, bytes: 0 };
  var indexDirty = false;
  var budget = DEFAULT_BUDGET;
  var writing = 0;

  T.attach = function (gifos, opts) {
    if (!gifos || !gifos.db) return Promise.resolve(false);
    db = gifos.db('tiles');
    idxDb = gifos.db('tilecache');
    if (opts && opts.budget) budget = opts.budget;
    return idxDb.get('idx').then(function (rec) {
      if (rec && rec.keys) index = { id: 'idx', keys: rec.keys, bytes: rec.bytes || 0 };
      return true;
    }).catch(function () { return false; });
  };

  var flushIndex = U.debounce(function () {
    if (!idxDb || !indexDirty) return;
    indexDirty = false;
    idxDb.put({ id: 'idx', keys: index.keys, bytes: index.bytes }).catch(function () {});
  }, 1500);

  T.cacheStats = function () {
    var pinned = 0, pinnedBytes = 0, n = 0;
    for (var k in index.keys) {
      var e = index.keys[k];
      n++;
      if (e.p) { pinned++; pinnedBytes += e.s || 0; }
    }
    return { tiles: n, bytes: index.bytes, pinned: pinned, pinnedBytes: pinnedBytes, budget: budget };
  };

  T.clearCache = function (keepPinned) {
    if (!db) return Promise.resolve();
    var keys = Object.keys(index.keys).filter(function (k) {
      return !(keepPinned && index.keys[k].p);
    });
    var chain = Promise.resolve();
    keys.forEach(function (k) {
      chain = chain.then(function () {
        return db.delete(k).catch(function () {});
      }).then(function () {
        index.bytes -= (index.keys[k].s || 0);
        delete index.keys[k];
      });
    });
    return chain.then(function () {
      if (index.bytes < 0) index.bytes = 0;
      indexDirty = true;
      flushIndex();
    });
  };

  function evictIfNeeded() {
    if (index.bytes <= budget) return;
    var entries = [];
    for (var k in index.keys) {
      if (!index.keys[k].p) entries.push([k, index.keys[k]]);
    }
    entries.sort(function (a, b) { return (a[1].t || 0) - (b[1].t || 0); });
    var i = 0;
    (function step() {
      if (index.bytes <= budget * 0.85 || i >= entries.length) { indexDirty = true; flushIndex(); return; }
      var k = entries[i++][0];
      var e = index.keys[k];
      delete index.keys[k];
      index.bytes -= (e.s || 0);
      db.delete(k).catch(function () {}).then(step);
    })();
  }

  function store(key, bytes, mime, pin) {
    if (!db || writing > 12) return;
    var have = index.keys[key];
    if (have && !pin) return;
    writing++;
    db.put({ id: key, b: bytes, m: mime, t: Date.now() }).then(function () {
      var size = bytes.byteLength || bytes.length || 0;
      if (!have) index.bytes += size;
      index.keys[key] = { s: size, t: Date.now(), p: pin ? 1 : (have && have.p) || 0 };
      indexDirty = true;
      flushIndex();
      evictIfNeeded();
    }).catch(function () {}).then(function () { writing--; });
  }

  T.pin = function (key) {
    var e = index.keys[key];
    if (e) { e.p = 1; indexDirty = true; flushIndex(); }
  };
  T.cached = function (key) { return !!index.keys[key]; };

  // ---- decoding ------------------------------------------------------------
  function toBitmap(bytes, mime) {
    var blob = new Blob([bytes], { type: mime });
    if (window.createImageBitmap) {
      return createImageBitmap(blob).catch(function () { return viaImage(blob); });
    }
    return viaImage(blob);
  }
  function viaImage(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  // ---- the queue -----------------------------------------------------------
  var queue = [];                 // { key, url, layer, pri, pin }
  var inflight = 0;
  var pending = new Set();
  var onTile = null;              // called when a tile lands: repaint

  T.onTile = function (fn) { onTile = fn; };

  // Everything queued but not yet sent is thrown away when the view moves. The
  // ones already in flight will land in the caches and cost nothing to keep.
  T.dropQueued = function () { queue.length = 0; };

  T.want = function (layer, time, level, row, col, pri, pin) {
    var key = T.key(layer.id, time, level, row, col);
    if (mem.has(key) || pending.has(key) || missing.has(key) || T.isFailed(key)) return key;
    pending.add(key);
    queue.push({ key: key, url: T.url(layer, time, level, row, col), pri: pri || 0, pin: !!pin });
    pump();
    return key;
  };

  function pump() {
    if (!queue.length || inflight >= MAX_INFLIGHT) return;
    queue.sort(function (a, b) { return a.pri - b.pri; });
    while (inflight < MAX_INFLIGHT && queue.length) {
      var job = queue.shift();
      inflight++;
      run(job);
    }
  }

  function done(key) {
    pending.delete(key);
    inflight--;
    pump();
  }

  function run(job) {
    var key = job.key;
    // The device's own copy first — it is faster than the wire and it is the
    // whole point of the cache when there is no wire at all.
    var local = index.keys[key] && db
      ? db.get(key).catch(function () { return null; })
      : Promise.resolve(null);

    local.then(function (rec) {
      if (rec && rec.b) {
        T.stats.fromDb++;
        return toBitmap(rec.b, rec.m || 'image/jpeg').then(function (bmp) {
          memPut(key, bmp);
          if (job.pin) T.pin(key);
          done(key);
          if (onTile) onTile(key);
        });
      }
      return fetchTile(job);
    }).catch(function () {
      failed.set(key, Date.now());
      T.stats.failed++;
      done(key);
    });
  }

  function fetchTile(job) {
    var key = job.key;
    if (!window.gifos || !gifos.fetch) { failed.set(key, Date.now()); done(key); return; }
    return gifos.fetch(job.url, { method: 'GET' }).then(function (r) {
      if (r.status === 404 || r.status === 400) {
        // GIBS answers 404 for a tile with no data — a cloudless swath gap, a
        // day before the instrument flew. That is information, not a failure:
        // remember it so the queue never asks twice.
        missing.set(key, Date.now());
        T.net = 'live';
        done(key);
        return;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        T.net = 'live';
        T.stats.fetched++;
        T.stats.bytes += bytes.byteLength;
        // Believe the server's own content-type, and fall back to the URL's
        // extension. GIBS is consistent, but a decoder handed the wrong type is
        // a blank tile with no error anywhere.
        var ct = String((r.headers && r.headers['content-type']) || '').split(';')[0].trim();
        var mime = /^image\//.test(ct) ? ct : (job.url.slice(-3) === 'png' ? 'image/png' : 'image/jpeg');
        return toBitmap(bytes, mime).then(function (bmp) {
          memPut(key, bmp);
          store(key, bytes, mime, job.pin);
          done(key);
          if (onTile) onTile(key);
        });
      });
    }).catch(function (err) {
      var msg = String(err && err.message || err);
      if (/^OFFLINE|^UNREACHABLE|Failed to fetch|NetworkError/.test(msg)) T.net = 'offline';
      failed.set(key, Date.now());
      T.stats.failed++;
      done(key);
    });
  }

  T.busy = function () { return inflight + queue.length; };

  // A frame of an animation, or a region being taken offline, needs to be
  // COMPLETE before it is shown — this resolves when every tile asked for is
  // either in memory or known to be absent.
  T.settle = function (keys, timeoutMs) {
    var t0 = Date.now();
    return new Promise(function (resolve) {
      (function check() {
        var left = keys.filter(function (k) { return !mem.has(k) && !missing.has(k) && !T.isFailed(k); });
        if (!left.length || Date.now() - t0 > (timeoutMs || 12000)) return resolve(!left.length);
        setTimeout(check, 90);
      })();
    });
  };

  window.WVTiles = T;
})();
