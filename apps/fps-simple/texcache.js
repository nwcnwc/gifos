/*
 * FPS Simple — the world's surfaces, kept between launches.
 *
 * Seventeen surfaces plus the soldiers' camo are generated at boot. On a
 * machine with a graphics chip nobody notices. On one without — a ChromeOS
 * Linux container with no /dev/dri, where every pixel goes through SwiftShader
 * on the CPU — it was tens of seconds, every single launch, of work whose
 * answer never changes.
 *
 * THE PIXELS LIVE ON THE GPU, WHICH IS THE WHOLE DIFFICULTY. The first attempt
 * at this assumed the bake was CPU-side and read `texture.image.data`. It is
 * not: the forge renders each surface with a shader into a render target, so
 * `image` carries only {width, height, depth} and `data` is null. That version
 * silently cached nothing — seventeen bakes again on the second launch — which
 * is why the check that catches it (count the bakes, expect zero) is worth more
 * than the cache itself.
 *
 * So the pixels are fetched the only way render-target pixels can be: bind the
 * texture to a framebuffer and readPixels. That is cheap here precisely because
 * the device is slow — with no GPU there is no bus to cross, the "GPU" memory
 * is main memory.
 *
 * IT TRIES RATHER THAN PREJUDGES. An earlier version refused anything that was
 * not UnsignedByteType and thereby refused every texture in the game — the
 * counter read 0 on every device and said nothing about why. Whether a read is
 * legal is a question the driver answers better than a type constant does: an
 * incompatible format fails the readPixels, getError catches it, and the set is
 * baked as before. A set is stored ALL or NOTHING, so a surface can never come
 * back with one map missing, which would render wrong rather than slow.
 *
 * WHERE IT GOES. A sandboxed app frame has an opaque origin: no IndexedDB, no
 * localStorage, no Cache API (the runtime withholds allow-same-origin
 * deliberately). What it has is gifos.db, which for the app's OWNER — anyone
 * opening it from their own desktop, i.e. every solo launch — is backed by real
 * IndexedDB, one atomic transaction per record, persisted with the icon. A
 * guest in someone else's room gets an in-memory store that dies with the tab,
 * so a guest bakes as before: correct, and no worse than today.
 *
 * THE KEY IS THE RECIPE — surface, shader source, size, seed, tints, params.
 * Change the engine and the shader changes, so the key changes, and a stale
 * entry cannot be mistaken for a fresh one. There is no version to forget.
 *
 * NOT CACHED, and not needing to be: the ~48 s of shader compilation. WebGL
 * cannot ship or store a compiled program, but the browser already keeps them
 * on disk — measured cold 127.7 s, warm 46.6 s, the compile phase gone on the
 * second launch.
 */
(function (root) {
  'use strict';

  var COLL = 'textures';
  var BUDGET = 64 * 1024 * 1024;
  var mem = Object.create(null);
  var fresh = [];
  var db = null;
  var stored = 0;
  var hits = 0, misses = 0, unreadable = 0;

  // One line, once, naming the first reason nothing could be cached. Silence is
  // what let this ship broken twice.
  var explained = false, whyMsg = '', lastFlush = '';
  function whyNot(msg) {
    if (explained) return;
    explained = true; whyMsg = msg;
    try { console.info('[fps] texture cache OFF: ' + msg); } catch (e) {}
  }

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function keyOf(spec) {
    return [spec.key, spec.size, spec.seed, spec.worldSize, spec.relief,
      spec.tintA && spec.tintA.getHex ? spec.tintA.getHex() : '',
      spec.tintB && spec.tintB.getHex ? spec.tintB.getHex() : '',
      spec.param && spec.param.toArray ? spec.param.toArray().join('_') : '',
      hash(String(spec.glsl || ''))].join('|');
  }

  // How a texture is READ. Wrong here does not throw, it changes how the street
  // looks, so every one of these is copied off the real texture.
  var PROPS = ['format', 'type', 'colorSpace', 'encoding', 'wrapS', 'wrapT',
               'minFilter', 'magFilter', 'generateMipmaps', 'flipY',
               'premultiplyAlpha', 'unpackAlignment', 'anisotropy'];

  /** Pull an RGBA8 texture's pixels back off the GPU. Null if we must not. */
  function readback(renderer, tex) {
    var THREE = root.COD && root.COD.THREE;
    if (!renderer || !tex || !tex.isTexture || !THREE) return null;
    // TRY, DO NOT PREJUDGE. This used to refuse anything that was not
    // UnsignedByteType, and refused every texture in the game — nothing was ever
    // cached, on either device, and the counter said 0 for days. Whether a read
    // is legal is a question the driver answers better than a type constant: an
    // incompatible format fails the readPixels and getError catches it, which is
    // the same "no" arrived at honestly.
    void THREE;
    var w = tex.image && tex.image.width, h = tex.image && tex.image.height;
    if (!w || !h) return null;
    var gl, glTex;
    try {
      gl = renderer.getContext();
      var props = renderer.properties && renderer.properties.get(tex);
      glTex = props && props.__webglTexture;
    } catch (e) { return null; }
    if (!gl || !glTex) { whyNot('no gl texture yet for ' + (tex.name || '?')); return null; }
    var fb = null, prev = null, out = null;
    try {
      prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, 0);
      var st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (st === gl.FRAMEBUFFER_COMPLETE) {
        var buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        var err = gl.getError();
        if (!err) out = buf; else whyNot('readPixels error 0x' + err.toString(16));
      } else { whyNot('framebuffer incomplete 0x' + st.toString(16)); }
    } catch (e) { whyNot('readPixels threw: ' + (e && e.message || e)); out = null; }
    try { if (fb) { gl.bindFramebuffer(gl.FRAMEBUFFER, prev || null); gl.deleteFramebuffer(fb); } } catch (e) {}
    return out;
  }

  function freeze(renderer, set) {
    var rec = { maps: Object.create(null), plain: Object.create(null) }, any = false, missed = false;
    for (var k in set) {
      var v = set[k];
      if (v && v.isTexture) {
        var data = readback(renderer, v);
        if (!data) { missed = true; continue; }
        var m = { w: v.image.width, h: v.image.height, data: data, p: {} };
        for (var i = 0; i < PROPS.length; i++) if (v[PROPS[i]] !== undefined) m.p[PROPS[i]] = v[PROPS[i]];
        rec.maps[k] = m; any = true;
      } else if (v == null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
        rec.plain[k] = v;
      } else { missed = true; }
    }
    // All or nothing. A set restored with one map missing is a surface that
    // renders wrong, which is worse than one that renders slowly.
    if (!any || missed) { if (missed) unreadable++; return null; }
    return rec;
  }

  function thaw(rec) {
    var THREE = root.COD && root.COD.THREE;
    if (!THREE || !THREE.DataTexture) return null;
    var set = {};
    for (var k in rec.maps) {
      var m = rec.maps[k];
      var t = new THREE.DataTexture(m.data, m.w, m.h);
      for (var pk in m.p) { try { t[pk] = m.p[pk]; } catch (e) {} }
      t.needsUpdate = true;
      set[k] = t;
    }
    for (var p2 in rec.plain) set[p2] = rec.plain[p2];
    return set;
  }

  // PIXELS TRAVEL AS TEXT, and that is not a style choice.
  //
  // A map is a 65 KB Uint8Array. Sent as one, it crosses the sandbox bridge and
  // lands in storage as an object with sixty-five thousand numeric keys —
  // megabytes of it, per map. On a desktop that is merely wasteful; on a Moto
  // g24 it was about a minute EACH, so four maps landed in four minutes and the
  // cache looked broken. Base64 is a fifth of the size, serialises as one
  // string, and decodes fast enough that nobody notices.
  function toB64(u8) {
    var CH = 0x8000, out = '';
    for (var i = 0; i < u8.length; i += CH) {
      out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(out);
  }
  function fromB64(str) {
    var bin = atob(str), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function bytesOf(rec) {
    var n = 0;
    for (var k in rec.maps) n += (rec.maps[k].data && rec.maps[k].data.byteLength) || 0;
    return n;
  }

  /** Load last run's surfaces. Must complete BEFORE the engine starts. */
  function preload(api) {
    // EVERY BAIL SAYS WHY. This module can fail completely silently — no db, no
    // restore, no write, and stats that look merely empty rather than broken —
    // which is exactly how it sat unnoticed: 27 surfaces baked every launch on
    // the phone while a desktop restored them in 247ms.
    if (!api || !api.db) { whyMsg = 'no gifos.db when preload ran'; return Promise.resolve(0); }
    try { db = api.db(COLL); } catch (e) {
      whyMsg = 'gifos.db(' + COLL + ') threw: ' + ((e && e.message) || e);
      return Promise.resolve(0);
    }
    return db.get('all').then(function (row) {
      // SAY WHAT CAME BACK. The write side reports "27 surfaces in 1607ms" and
      // the next launch still bakes all 27 from scratch, so the failure is on
      // THIS side — and an empty `why` cannot tell "no row" from "a row I could
      // not decode".
      if (!row) { whyMsg = 'no saved row came back from the store'; return 0; }
      if (!row.sets) { whyMsg = 'row came back WITHOUT sets (keys: ' + Object.keys(row).join(',') + ')'; return 0; }
      var n = 0, bad = 0;
      for (var k in row.sets) {
        var src = row.sets[k];
        var rec = { id: k, maps: Object.create(null), plain: src.plain || {} }, ok = true;
        for (var mk in src.maps) {
          var m = src.maps[mk];
          try { rec.maps[mk] = { w: m.w, h: m.h, p: m.p || {}, data: fromB64(m.b64) }; }
          catch (e2) { ok = false; break; }
        }
        if (!ok) { bad++; continue; }
        mem[k] = rec; stored += bytesOf(rec); n++;
      }
      if (!n) whyMsg = 'row had ' + Object.keys(row.sets).length + ' sets but none decoded (' + bad + ' failed)';
      return n;
    }).catch(function (e) {
      whyMsg = 'reading the saved row threw: ' + ((e && e.message) || e);
      return 0;
    });
  }

  /** Wrap a material system's forge. Idempotent; the forge is built lazily. */
  function wrap(sys) {
    var forge = sys && sys._forge;
    if (!forge || forge.__gifosCached || typeof forge.build !== 'function') return;
    forge.__gifosCached = true;
    var orig = forge.build.bind(forge);
    forge.build = function (spec) {
      var key = null;
      try { key = keyOf(spec); } catch (e) { return orig(spec); }
      var hit = mem[key];
      if (hit) {
        try { var s = thaw(hit); if (s) { hits++; return s; } } catch (e) {}
      }
      misses++;
      var built = orig(spec);
      try {
        var renderer = (typeof sys._renderer === 'function') ? sys._renderer() : null;
        var rec = freeze(renderer, built);
        if (rec) {
          var size = bytesOf(rec);
          if (size && stored + size <= BUDGET) {
            rec.id = key; mem[key] = rec; stored += size; fresh.push(key);
          }
        }
      } catch (e) {}
      return built;
    };
  }

  /**
   * Write back what this run baked — AFTER the gate opens. It is megabytes of
   * structured clone crossing a postMessage bridge into IndexedDB, and none of
   * it is worth one frame of the game the player is now waiting to start.
   */
  function flush() {
    if (!db) { lastFlush = 'NOT WRITTEN — no db (preload never got one)'; return Promise.resolve(0); }
    if (!fresh.length) { lastFlush = 'nothing new to write'; return Promise.resolve(0); }
    fresh.length = 0;
    var t0 = Date.now();
    // ONE RECORD. NOT ONE PER SURFACE, AND CERTAINLY NOT ONE PER MAP.
    //
    // Measured: 26 surfaces took 59 SECONDS to write, ~2.3 s each, for 5.3 MB
    // that IndexedDB should swallow in well under a second. The size was never
    // the problem — the COUNT was. Every put notifies the collection changed,
    // and a change pushes the collection back across the sandbox bridge, so
    // writing 26 records into a growing 5 MB collection moves something like
    // 130 MB of messages. Quadratic, and invisible until you time it.
    //
    // One write, one notification, one copy. And it matters beyond the wait:
    // this runs while the player is walking down the street, so 59 seconds of
    // it was 59 seconds of competing with the game for a phone's single slow
    // core.
    var payload = { id: 'all', v: 1, sets: {} }, count = 0;
    var tEnc = 0, encBytes = 0;   // measured, because "the write is slow" is not a cause
    try {
      for (var k in mem) {
        var rec = mem[k], maps = {};
        for (var mk in rec.maps) {
          var m = rec.maps[mk];
          var e0 = Date.now();
          var b64 = m.b64 || toB64(m.data);
          tEnc += Date.now() - e0;
          encBytes += b64.length;
          maps[mk] = { w: m.w, h: m.h, p: m.p, b64: b64 };
        }
        payload.sets[k] = { maps: maps, plain: rec.plain };
        count++;
      }
    } catch (e) {
      lastFlush = 'could not encode: ' + (e && e.message || e);
      return Promise.resolve(0);
    }
    var tPut = Date.now();
    return db.put(payload).then(function () {
      lastFlush = count + ' surfaces in ' + (Date.now() - t0) + 'ms'
        + ' (encode ' + tEnc + 'ms for ' + Math.round(encBytes / 1048576) + 'MB b64'
        + ', put ' + (Date.now() - tPut) + 'ms)';
      try { console.info('[fps] texture cache: ' + lastFlush); } catch (e) {}
      return count;
    }, function (e) {
      lastFlush = 'write refused after ' + (Date.now() - t0) + 'ms: ' + (e && e.message || e);
      try { console.info('[fps] texture cache: ' + lastFlush); } catch (e2) {}
      return 0;
    });
  }

  root.TexCache = {
    preload: preload, wrap: wrap, flush: flush,
    stats: function () {
      var n = 0; for (var k in mem) n++;
      return { entries: n, bytes: stored, pending: fresh.length, hits: hits,
               misses: misses, unreadable: unreadable, why: whyMsg, flush: lastFlush };
    },
  };
})(window);
