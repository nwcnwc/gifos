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
 * ONLY 8-BIT RGBA IS CACHED. A half-float target read as bytes comes back
 * garbled rather than failing, and a surface that is quietly wrong is worse
 * than a surface that is slow — so anything that is not UnsignedByteType is
 * left to bake, every time, on purpose.
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
    // Byte textures only — see the header.
    if (tex.type !== undefined && THREE.UnsignedByteType !== undefined
        && tex.type !== THREE.UnsignedByteType) return null;
    var w = tex.image && tex.image.width, h = tex.image && tex.image.height;
    if (!w || !h) return null;
    var gl, glTex;
    try {
      gl = renderer.getContext();
      var props = renderer.properties && renderer.properties.get(tex);
      glTex = props && props.__webglTexture;
    } catch (e) { return null; }
    if (!gl || !glTex) return null;
    var fb = null, prev = null, out = null;
    try {
      prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        var buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        if (!gl.getError()) out = buf;
      }
    } catch (e) { out = null; }
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

  function bytesOf(rec) {
    var n = 0;
    for (var k in rec.maps) n += (rec.maps[k].data && rec.maps[k].data.byteLength) || 0;
    return n;
  }

  /** Load last run's surfaces. Must complete BEFORE the engine starts. */
  function preload(api) {
    if (!api || !api.db) return Promise.resolve(0);
    try { db = api.db(COLL); } catch (e) { return Promise.resolve(0); }
    return db.getAll().then(function (rows) {
      var n = 0;
      for (var i = 0; i < (rows || []).length; i++) {
        var r = rows[i];
        if (!r || !r.id || !r.maps) continue;
        mem[r.id] = r; stored += bytesOf(r); n++;
      }
      return n;
    }).catch(function () { return 0; });
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
    if (!db || !fresh.length) return Promise.resolve(0);
    var keys = fresh.slice(); fresh.length = 0;
    var i = 0, wrote = 0;
    function step() {
      if (i >= keys.length) {
        try { console.info('[fps] texture cache: stored ' + wrote + ' surfaces'); } catch (e) {}
        return Promise.resolve(wrote);
      }
      var rec = mem[keys[i++]];
      if (!rec) return step();
      return db.put(rec).then(function () { wrote++; }, function () {})
        .then(function () { return new Promise(function (r) { setTimeout(r, 150); }).then(step); });
    }
    return step();
  }

  root.TexCache = {
    preload: preload, wrap: wrap, flush: flush,
    stats: function () {
      var n = 0; for (var k in mem) n++;
      return { entries: n, bytes: stored, pending: fresh.length, hits: hits, misses: misses, unreadable: unreadable };
    },
  };
})(window);
