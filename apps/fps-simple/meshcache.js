/*
 * FPS Simple — built geometry, kept between launches.
 *
 * THE STREET IS THE SAME STREET EVERY TIME. One seed, one engine, no input:
 * the buildings, the props, the weapon in your hands, the soldiers and the
 * grid they walk on are computed from the same numbers on every launch and
 * come out bit-for-bit identical. Computing them again is not caution, it is
 * waste — measured on a SwiftShader fleet box, 1.1 s for ONE rifle viewmodel,
 * 0.5 s for the navigation grid and 0.5 s for three soldier variants, every
 * single time the app opens.
 *
 * So they are built once and kept.
 *
 * WHAT IS KEPT, AND WHAT DELIBERATELY IS NOT
 *
 *   weapon   the merged, mask-baked viewmodel geometry per assembly, plus the
 *            model's `nodes` (muzzle, sight, grips — plain arrays).
 *   variant  a soldier's ONE skinned geometry, its part table and its weapon
 *            anchor points.
 *   nav      the walkability grid (flags / floor / enclosure) and the cover
 *            point list. DATA, not geometry, and by far the best ratio here:
 *            ~340 KB buys back half a second.
 *
 *   NOT MATERIALS, EVER. Every material in this game is procedural: its maps
 *   are rendered on the GPU into render targets and its shader is patched at
 *   runtime by `render.patcher`. Serialising one would produce a material that
 *   LOOKS restored and draws untextured, which is far worse than slow. So a
 *   restored soldier calls upstream's own `resolveMaterials()` and a restored
 *   viewmodel calls `this.mats.get(matKey)` — exactly as a freshly built one
 *   does. Geometry is cached; the look of it is always rebuilt.
 *
 *   NOT THE WORLD. See the note above measureWorld() — it is measured, not
 *   assumed, and the number is the reason.
 *
 * HOW, WITHOUT INVENTING A FORMAT. Everything above is either a
 * THREE.BufferGeometry or plain data. A BufferGeometry is stored as what it
 * actually is — its attribute arrays, its index, its groups and its bounding
 * volumes — because the arrays are TYPED arrays and structured clone carries
 * those across the sandbox bridge as themselves. That matters: three's own
 * Object3D.toJSON() writes every vertex as a plain JS number in a plain JS
 * array, which for a 60k-vertex viewmodel is megabytes of boxed numbers to
 * clone, store and re-read. (toJSON was tried first and could not even be
 * reached — see the note on the weapon model below.)
 *
 * AND IT IS CHECKED, NOT ASSUMED. The texture cache base64s its pixels because
 * a Uint8Array was once seen landing in storage as an object with 65 000
 * numeric keys. Every array read back here goes through asTyped(), which
 * rebuilds anything that is not already a typed array and counts it in
 * `stats.reshaped` — so if that ever starts happening again it shows up as a
 * number rather than as a mystery. Measured on a fleet box across a full
 * cold-then-warm pair: reshaped 0. Typed arrays make the round trip intact.
 *
 * WHY THE KEY IS THE RECIPE, NOT A VERSION. A cached record is keyed by what
 * produced it: its name, the world seed, and a hash of THE ENGINE BUNDLE
 * ITSELF. The bundle is inlined into this page as script text (the GifOS
 * runtime rewrites every <script src> that way), so hashing it is a real
 * question with a real answer — move the pin, change one vertex of one
 * building, and every key changes. The old fingerprint hashed THREE.REVISION
 * and the list of system ids, neither of which moves when the geometry does;
 * that was a key that could not tell last week's street from this week's, and
 * handing a stale nav grid to a rebuilt street is agents walking through
 * walls. Hashing 1.8 MB costs 20-60 ms on a fleet box, once, and it is stamped
 * in the stats as `fpMs` so it never has to be guessed at again.
 *
 * ONE RECORD, ONE WRITE. Learned expensively on the texture side: every write
 * notifies the collection changed, and a change pushes the whole collection
 * back across the sandbox bridge. Twenty-six writes into a growing 5 MB
 * collection took 59 SECONDS; the same bytes in one record took 1.5. The cost
 * is the number of writes, never their size.
 *
 * AND IT WRITES AFTER THE GATE OPENS, never before, because this runs while
 * somebody is walking down a street on a phone with one slow core.
 *
 * WHAT IT BOUGHT, AND WHAT IT DID NOT — A/B'd ON ONE BOX, SAME PROFILE, SAME
 * TEXTURE CACHE, SAME COMPILED-SHADER CACHE, MINUTES APART. The only variable
 * was whether this cache's one record was present:
 *
 *                     rebuilt      restored
 *     weapons init     1320 ms       429 ms      -891
 *     nav               488 ms         1 ms      -487
 *     variants (3)      538 ms         3 ms      -535
 *     prewarmMaterials  406 ms      2282 ms     +1876   <-- read this one
 *     READY            7753 ms      7677 ms       -76
 *
 * The geometry work is genuinely gone. Most of the wall clock is not, because
 * on a box with NO GRAPHICS CHIP the boot after the world is bounded by SHADER
 * COMPILATION in the GPU process, not by this thread — and the 2.4 s of CPU
 * work removed here was what used to overlap it. Take the CPU work away and
 * `AiSystem.prewarmMaterials()` simply stands and waits for the same queue.
 * Time MOVED; most of it did not disappear. End to end on a fresh install,
 * warm launch: 8.7 s before, 8.3 s after (READY 7679 ms -> 7156 ms).
 *
 * That is worth saying plainly rather than quoting the per-phase numbers and
 * calling it a two-second win. It also says where the next second and a half
 * is: prewarm is now 1.7-2.3 s of a 7.2 s boot, and it is the SAME shape of
 * problem boot.js already solved for `COD.prewarm` — front-loaded work nobody
 * is waiting on yet, sitting in front of the Play button. On a device with a
 * real driver and a warm on-disk program cache the balance should differ, but
 * that is a measurement to take on the phone, not an assumption to ship.
 */
(function (root) {
  'use strict';

  var COLL = 'meshes';
  var mem = Object.create(null);       // key -> frozen record
  var fresh = [];
  var db = null;
  var fingerprint = '';
  var hits = 0, misses = 0, lastFlush = '', notes = [];
  var bytes = 0, fpMs = 0, worldBytes = 0;

  // Refuse to grow past this. Nothing here is close to it today (weapons plus
  // variants plus nav measured ~7 MB), but a cache with no ceiling is a phone
  // with no storage, and the failure is silent.
  var BUDGET = 24 * 1024 * 1024;

  function note(m) {
    if (notes.length < 8) notes.push(m);
    try { console.info('[fps] mesh cache: ' + m); } catch (e) {}
  }

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* ------------------------------------------------------------------ */
  /* the key                                                            */
  /* ------------------------------------------------------------------ */

  // WHAT THE ENGINE IS, HONESTLY. The GifOS runtime inlines every <script src>
  // as script TEXT, so the whole engine bundle is sitting in this document and
  // can simply be read. The longest script in the page is it by a wide margin
  // (1.8 MB against a few tens of KB for everything of ours), and if that ever
  // stops being true the fallback below still refuses to hand back geometry
  // built by a bundle we could not identify.
  var fpTried = false;
  function engineFingerprint() {
    if (fpTried) return fingerprint;      // '' is an answer too, and a final one
    fpTried = true;
    var t0 = Date.now(), best = '', src = null;
    try {
      var s = document.getElementsByTagName('script');
      for (var i = 0; i < s.length; i++) {
        var txt = s[i].textContent || '';
        if (txt.length > best.length) best = txt;
      }
      // Prove it is the engine and not, say, this file, before trusting it.
      if (best.length > 200000 && best.indexOf('[world] built in') >= 0) src = best;
    } catch (e) {}
    if (!src) {
      // NO KEY IS BETTER THAN A WRONG KEY. Every get() below misses and every
      // put() is dropped, so the game builds exactly as it did before caching
      // existed. Slow beats a street restored from somebody else's engine.
      fingerprint = '';
      note('cannot see the engine bundle — caching off');
      return '';
    }
    fingerprint = hash(src) + '.' + src.length.toString(36);
    fpMs = Date.now() - t0;
    return fingerprint;
  }

  var seedTag = '';
  /** The world seed, from boot. Part of every key: one seed, one street. */
  function useSeed(seed) { seedTag = String(seed); }

  function keyFor(kind, name) {
    var fp = engineFingerprint();
    if (!fp) return '';
    return kind + '|' + name + '|' + seedTag + '|' + fp;
  }

  /* ------------------------------------------------------------------ */
  /* plain data, and refusing anything else                             */
  /* ------------------------------------------------------------------ */

  // A node table, a part list and a set of weapon anchors are all supposed to
  // be numbers, strings and arrays of them. If one of them is secretly a
  // THREE.Vector3 it would cross the bridge as {x,y,z} with no prototype, come
  // back as an object where the engine expects an array, and `fromArray` would
  // quietly produce NaN — a weapon whose muzzle is nowhere. So it is CHECKED,
  // and anything else refuses the whole record.
  function plain(v, depth) {
    if (v == null) return true;
    var t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return true;
    if (t !== 'object' || (depth || 0) > 6) return false;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) if (!plain(v[i], (depth || 0) + 1)) return false;
      return true;
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return false;
    for (var k in v) if (!plain(v[k], (depth || 0) + 1)) return false;
    return true;
  }

  function clonePlain(v) {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(clonePlain(v[i])); return a; }
    var o = {};
    for (var k in v) o[k] = clonePlain(v[k]);
    return o;
  }

  /* ------------------------------------------------------------------ */
  /* geometry, as what it actually is                                   */
  /* ------------------------------------------------------------------ */

  var TYPES = null;
  function typeTable() {
    if (TYPES) return TYPES;
    TYPES = { Int8Array: Int8Array, Uint8Array: Uint8Array, Uint8ClampedArray: Uint8ClampedArray,
              Int16Array: Int16Array, Uint16Array: Uint16Array, Int32Array: Int32Array,
              Uint32Array: Uint32Array, Float32Array: Float32Array, Float64Array: Float64Array };
    return TYPES;
  }

  function arrayBytes(a) { return (a && a.byteLength) || 0; }

  /** A BufferGeometry, frozen. Null (with a note) if it is not one we can keep. */
  function freezeGeo(g, what) {
    if (!g || !g.attributes) { note(what + ': not a geometry'); return null; }
    var rec = { attrs: {}, index: null, groups: null, sphere: null, box: null, n: g.name || '' };
    for (var k in g.attributes) {
      var a = g.attributes[k];
      // An interleaved attribute shares one buffer with its neighbours, so
      // storing it stores the whole buffer once per attribute. Nothing in this
      // engine produces one today; if that changes, refuse rather than bloat.
      if (!a || a.isInterleavedBufferAttribute || !a.array || !a.array.BYTES_PER_ELEMENT) {
        note(what + ': attribute "' + k + '" is not a plain typed array');
        return null;
      }
      rec.attrs[k] = { t: a.array.constructor.name, n: a.itemSize, z: !!a.normalized, d: a.array };
    }
    var idx = g.getIndex();
    if (idx) {
      if (!idx.array || !idx.array.BYTES_PER_ELEMENT) { note(what + ': index is not a typed array'); return null; }
      rec.index = { t: idx.array.constructor.name, d: idx.array };
    }
    if (g.groups && g.groups.length) {
      rec.groups = [];
      for (var i = 0; i < g.groups.length; i++) {
        var gr = g.groups[i];
        rec.groups.push({ s: gr.start, c: gr.count, m: gr.materialIndex });
      }
    }
    // Both are computed by the builders and at least one is DELIBERATE: a
    // soldier's bounding sphere is inflated 1.45x because animated poses reach
    // outside the bind pose. Recomputing it on restore would cull a running
    // man's arms. So it travels.
    if (g.boundingSphere) {
      rec.sphere = { x: g.boundingSphere.center.x, y: g.boundingSphere.center.y,
                     z: g.boundingSphere.center.z, r: g.boundingSphere.radius };
    }
    if (g.boundingBox) {
      rec.box = { ax: g.boundingBox.min.x, ay: g.boundingBox.min.y, az: g.boundingBox.min.z,
                  bx: g.boundingBox.max.x, by: g.boundingBox.max.y, bz: g.boundingBox.max.z };
    }
    return rec;
  }

  function geoBytes(rec) {
    var n = 0;
    for (var k in rec.attrs) n += arrayBytes(rec.attrs[k].d);
    if (rec.index) n += arrayBytes(rec.index.d);
    return n;
  }

  /**
   * A typed array as it came back from storage. Structured clone SHOULD hand
   * one back as itself; this is where we find out for certain rather than
   * assume, because the texture cache was bitten by exactly this (a Uint8Array
   * that landed as an object with 65 000 numeric keys). An object is rebuilt
   * once, loudly, so the cost is visible instead of mysterious.
   */
  var reshaped = 0;
  function asTyped(name, d) {
    var C = typeTable()[name];
    if (!C) return null;
    if (d instanceof C) return d;
    if (ArrayBuffer.isView(d)) return new C(d.buffer, d.byteOffset, d.byteLength / C.BYTES_PER_ELEMENT);
    if (d instanceof ArrayBuffer) return new C(d);
    if (Array.isArray(d)) { reshaped++; return C.from(d); }
    if (d && typeof d === 'object') {           // the numeric-keys pathology
      reshaped++;
      var len = d.length, out;
      if (len == null) { len = 0; for (var k in d) { var i = +k; if (i + 1 > len) len = i + 1; } }
      out = new C(len);
      for (var j = 0; j < len; j++) out[j] = d[j] || 0;
      return out;
    }
    return null;
  }

  function thawGeo(rec) {
    var THREE = root.COD && root.COD.THREE;
    if (!THREE || !rec) return null;
    var g = new THREE.BufferGeometry();
    g.name = rec.n || '';
    for (var k in rec.attrs) {
      var a = rec.attrs[k];
      var arr = asTyped(a.t, a.d);
      if (!arr) return null;
      g.setAttribute(k, new THREE.BufferAttribute(arr, a.n, a.z));
    }
    if (rec.index) {
      var ia = asTyped(rec.index.t, rec.index.d);
      if (!ia) return null;
      g.setIndex(new THREE.BufferAttribute(ia, 1));
    }
    if (rec.groups) for (var i = 0; i < rec.groups.length; i++) g.addGroup(rec.groups[i].s, rec.groups[i].c, rec.groups[i].m);
    if (rec.sphere) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(rec.sphere.x, rec.sphere.y, rec.sphere.z), rec.sphere.r);
    else g.computeBoundingSphere();
    if (rec.box) g.boundingBox = new THREE.Box3(new THREE.Vector3(rec.box.ax, rec.box.ay, rec.box.az),
                                                new THREE.Vector3(rec.box.bx, rec.box.by, rec.box.bz));
    else g.computeBoundingBox();
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* store                                                              */
  /* ------------------------------------------------------------------ */

  function store(key, rec, size) {
    if (!key || mem[key]) return;
    if (bytes + size > BUDGET) { note('budget: refused ' + key.split('|')[0] + ' (' + (size / 1048576).toFixed(1) + ' MB)'); return; }
    mem[key] = rec; bytes += size; fresh.push(key);
  }

  // What a record weighs, whatever shape it is: every typed array in it. Used
  // both for the budget and so `stats.MB` reads the same on a warm launch (when
  // nothing new was stored) as on the cold one that stored it.
  function recBytes(v, depth) {
    if (!v || typeof v !== 'object' || (depth || 0) > 8) return 0;
    if (v.byteLength != null && (ArrayBuffer.isView(v) || v instanceof ArrayBuffer)) return v.byteLength;
    var n = 0;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) n += recBytes(v[i], (depth || 0) + 1) || 32; return n; }
    for (var k in v) n += recBytes(v[k], (depth || 0) + 1);
    return n;
  }

  /** Load everything kept last time. Must finish BEFORE the engine starts. */
  function preload(api) {
    if (!api || !api.db) return Promise.resolve(0);
    try { db = api.db(COLL); } catch (e) { return Promise.resolve(0); }
    return db.get('all').then(function (row) {
      if (!row || !row.items) return 0;
      var n = 0;
      for (var k in row.items) { mem[k] = row.items[k]; bytes += recBytes(row.items[k]); n++; }
      return n;
    }).catch(function () { return 0; });
  }

  function got(k, rec) { if (rec) hits++; else misses++; return rec; }

  /* ------------------------------------------------------------------ */
  /* the weapon viewmodels                                              */
  /* ------------------------------------------------------------------ */

  // WHAT A WEAPON MODEL ACTUALLY IS, and why the first attempt cached nothing.
  //
  // `MeshCache.put('weapon', ...)` reported `models:0 misses:1` and the note it
  // now prints says why: what `buildRifle()` returns is NOT a THREE.Object3D
  // and has no toJSON. It is a plain descriptor —
  //
  //   { id, label, fxClass, body: Assembly, moving: { magazine: Assembly, … },
  //     nodes: { muzzle:[x,y,z], sight:[…], gripR:{pos,finger,back}, … } }
  //
  // — where an Assembly is a Map of material key -> a LIST of untransformed
  // BufferGeometry pieces. Serialising that would keep the pieces and none of
  // the work: the expensive part is downstream, in Viewmodel.addWeapon, which
  // merges each bucket (mergeGeometries + mergeVertices) and then bakes
  // curvature masks into every vertex. Measured on a SwiftShader fleet box:
  // 1136 ms for a single rifle.
  //
  // So the seam moved one level down, into addWeapon's own per-assembly build,
  // and what is kept is the MERGED, MASK-BAKED geometry per material — the
  // finished article. The model that comes back carries stand-in assemblies
  // whose build() simply hands those over, and a `_gifosBaked` flag that tells
  // the patched viewmodel not to bake masks into geometry that already has
  // them. `nodes` travels as the plain data it is.
  //
  // ALL OR NOTHING, per weapon: a viewmodel restored with one assembly missing
  // is a rifle with no magazine, which is worse than a slow one. The record is
  // only written once every assembly of that weapon has been captured, and it
  // is only used if every assembly it names comes back.
  //
  // ONE THING DOES DIFFER, AND IT IS SAID OUT LOUD RATHER THAN HIDDEN. The mask
  // bake draws from the viewmodel's own Rng, so skipping it leaves that stream
  // a few draws ahead of where a fresh build would have left it. Everything
  // downstream of it is per-shot recoil jitter — kick, yaw, roll, sway — which
  // is deliberately random and shared with nobody. The world's RNG, which IS
  // shared and which decides what the street looks like, is a different stream
  // entirely and is not touched.

  var wpBuild = Object.create(null);   // weapon id -> { nodes, meta, asm: {name: {matKey: geoRec}} }
  var wpLive = Object.create(null);    // weapon id -> { asmName: Map<matKey, geometry> }

  /** The model hook: a whole viewmodel, restored, or null. */
  function getWeapon(name) {
    var k = keyFor('weapon', name);
    var rec = k && mem[k];
    if (!rec || !rec.asm) return got(k, null);
    // ALL OF IT OR NONE OF IT. Everything is thawed up front, so a record that
    // is short one assembly is refused before the engine has committed to it —
    // a rifle with no magazine is worse than a rifle that took a second.
    var live = Object.create(null);
    var names = [rec.bodyName].concat(rec.movingNames);
    for (var i = 0; i < names.length; i++) {
      var maps = rec.asm[names[i]];
      if (!maps) { note('weapon:' + name + ' kept record has no "' + names[i] + '" — rebuilding'); return got(k, null); }
      var m = new Map();
      for (var mk in maps) {
        var g = thawGeo(maps[mk]);
        if (!g) return got(k, null);
        m.set(mk, g);
      }
      live[names[i]] = m;
    }
    wpLive[rec.id] = live;
    var stand = function (n) { return { name: n, build: function () { return live[n]; } }; };
    var model = { id: rec.id, label: rec.label, fxClass: rec.fxClass,
                  nodes: rec.nodes, _gifosBaked: true,
                  body: stand(rec.bodyName), moving: {} };
    for (var j = 0; j < rec.movingNames.length; j++) model.moving[rec.movingKeys[j]] = stand(rec.movingNames[j]);
    hits++;
    return model;
  }

  /** The assembly hook: this assembly's merged, mask-baked geometry, or null. */
  function getWeaponAsm(id, asmName) {
    var live = wpLive[id];
    return (live && live[asmName]) || null;
  }

  /** Upstream just built one; remember the shape of it (not the geometry yet). */
  function putWeaponModel(name, model) {
    if (!model || model._gifosBaked) return;          // ours, nothing to learn
    // The key is the name the engine ASKED for; the geometry arrives labelled
    // with the model's own id. They are the same string today for all three
    // weapons, and if they ever stop being, a record filed under one and looked
    // up under the other is a rifle handed back for a pistol. Refuse instead.
    if (model.id !== name) { note('weapon:' + name + ' builds a model called "' + model.id + '" — not cached'); return; }
    if (!plain(model.nodes)) { note('weapon:' + name + ' nodes are not plain data — not cached'); return; }
    var movingNames = [], movingKeys = [];
    for (var part in model.moving) {
      var a = model.moving[part];
      if (!a || !a.name) { note('weapon:' + name + ' assembly "' + part + '" has no name — not cached'); return; }
      movingKeys.push(part); movingNames.push(a.name);
    }
    if (!model.body || !model.body.name) { note('weapon:' + name + ' has no body assembly — not cached'); return; }
    wpBuild[name] = {
      id: model.id, label: model.label, fxClass: model.fxClass,
      nodes: clonePlain(model.nodes), bodyName: model.body.name,
      movingNames: movingNames, movingKeys: movingKeys,
      asm: Object.create(null), want: movingNames.length + 1,
    };
  }

  /** One assembly's merged, mask-baked geometry, straight out of addWeapon. */
  function putWeaponAsm(id, asmName, matKey, geo) {
    var rec = wpBuild[id];
    if (!rec) return;
    var maps = rec.asm[asmName] || (rec.asm[asmName] = Object.create(null));
    var g = freezeGeo(geo, 'weapon:' + id + '/' + asmName + '/' + matKey);
    if (!g) { delete wpBuild[id]; return; }        // one refusal loses the weapon
    maps[matKey] = g;
  }

  // SEALED AT THE END, NOT AS IT ARRIVES. Counting assemblies as they turn up
  // cannot tell "the last assembly has started" from "the last assembly has
  // finished" — an assembly arrives one material at a time, so a record written
  // the moment the final assembly appeared would be missing every material
  // after its first. Nothing is written until the engine has stopped building,
  // which is what flush() means.
  function sealWeapons() {
    for (var id in wpBuild) {
      var rec = wpBuild[id];
      var have = 0, size = 0;
      for (var an in rec.asm) { have++; for (var mk in rec.asm[an]) size += geoBytes(rec.asm[an][mk]); }
      if (have !== rec.want) { note('weapon:' + id + ' built ' + have + ' of ' + rec.want + ' assemblies — not cached'); continue; }
      var k = keyFor('weapon', id);
      store(k, { id: rec.id, label: rec.label, fxClass: rec.fxClass, nodes: rec.nodes,
                 bodyName: rec.bodyName, movingNames: rec.movingNames,
                 movingKeys: rec.movingKeys, asm: rec.asm }, size);
    }
    wpBuild = Object.create(null);
  }

  /* ------------------------------------------------------------------ */
  /* the soldiers                                                       */
  /* ------------------------------------------------------------------ */

  // A variant is one skinned BufferGeometry (position, normal, uv, colour,
  // skinIndex, skinWeight, index and one group per material slot), a part
  // table, and the weapon's anchor points — which are already plain arrays,
  // because upstream calls .toArray() on them.
  //
  // The MATERIALS are not kept and must not be: they are procedural, camo maps
  // and all, and `render.patcher` rewrites their shaders. The patched engine
  // calls its own resolveMaterials() with the slot list recovered from the part
  // table, so a restored soldier's materials are built exactly as a fresh
  // soldier's are.
  //
  // Also dropped: the weapon's raw part meshes (`steel`, `polymer`, `rubber`,
  // `glass`). They are consumed while the character is stitched together and
  // nothing reads them afterwards — the animator wants only the anchors.

  function getVariant(name) {
    var k = keyFor('variant', name);
    var rec = k && mem[k];
    if (!rec) return got(k, null);
    var g = thawGeo(rec.geo);
    if (!g) return got(k, null);
    hits++;
    return { geometry: g, parts: rec.parts, weapon: rec.weapon, stats: rec.stats };
  }

  function putVariant(name, v) {
    var k = keyFor('variant', name);
    if (!k || mem[k] || !v) return;
    if (!plain(v.parts) || !plain(v.stats)) { note('variant:' + name + ' part table is not plain data'); return; }
    var w = {};
    if (v.weapon) {
      for (var f in v.weapon) {
        var val = v.weapon[f];
        // Only the anchors — arrays of three numbers. Everything else in that
        // object is a mesh record or a matrix and is not wanted.
        if (Array.isArray(val) && val.length === 3 && plain(val)) w[f] = val.slice();
      }
    }
    var geo = freezeGeo(v.geometry, 'variant:' + name);
    if (!geo) return;
    store(k, { geo: geo, parts: clonePlain(v.parts), weapon: w, stats: clonePlain(v.stats) }, geoBytes(geo));
  }

  /* ------------------------------------------------------------------ */
  /* the navigation grid                                                */
  /* ------------------------------------------------------------------ */

  // THE EASY WIN, AND IT IS NOT GEOMETRY AT ALL. Building the grid casts about
  // two rays per cell into the physics BVH — 221 x 221 cells, 38 741 of them
  // walkable — and the cover pass casts eight more from every candidate. That
  // is 497 ms on a fleet box and the better part of a second on the phone, and
  // it produces three typed arrays and a list of 1353 plain points: ~340 KB.
  //
  // It is a pure function of the STATIC COLLISION WORLD, which is a pure
  // function of the engine bundle and the seed — both of which are in the key.
  // Nothing else about a grid is worth keeping: nx/nz/minX/minZ come straight
  // back out of the constructor (which still runs), and gScore/came/visitStamp
  // are A* scratch.
  //
  // `claimed` is normalised back to -1 on the way in. It is mutated during play
  // as agents take cover, and a grid restored with somebody's dead claim on it
  // is cover nobody can use.

  function getNav(grid, cover) {
    var k = keyFor('nav', 'grid');
    var rec = k && mem[k];
    if (!rec) return got(k, null);
    // The grid's shape is derived from the world bounds; if it does not match
    // what this run just constructed, the record is for a different street.
    if (rec.nx !== grid.nx || rec.nz !== grid.nz || rec.cell !== grid.cell) {
      note('nav: grid is ' + grid.nx + 'x' + grid.nz + ', kept one is ' + rec.nx + 'x' + rec.nz + ' — rebuilding');
      misses++; return null;
    }
    var flags = asTyped('Uint8Array', rec.flags);
    var floor = asTyped('Float32Array', rec.floor);
    var enc = asTyped('Uint8Array', rec.enclosure);
    var n = grid.nx * grid.nz;
    if (!flags || !floor || !enc || flags.length !== n || floor.length !== n || enc.length !== n) {
      note('nav: kept arrays are the wrong length — rebuilding');
      misses++; return null;
    }
    grid.flags = flags; grid.floor = floor; grid.enclosure = enc;
    grid.walkableCount = rec.walkable; grid.buildMs = 0;
    var pts = [];
    for (var i = 0; i < rec.cover.length; i++) {
      var p = rec.cover[i];
      pts.push({ x: p.x, y: p.y, z: p.z, dx: p.dx, dz: p.dz, high: !!p.high,
                 dist: p.dist, claimed: -1, score: 0 });
    }
    cover.points = pts;
    cover.buildMs = 0;
    hits++;
    return true;
  }

  function putNav(grid, cover) {
    var k = keyFor('nav', 'grid');
    if (!k || mem[k] || !grid || !grid.flags) return;
    var pts = [];
    for (var i = 0; i < cover.points.length; i++) {
      var p = cover.points[i];
      pts.push({ x: p.x, y: p.y, z: p.z, dx: p.dx, dz: p.dz, high: !!p.high, dist: p.dist });
    }
    var rec = { nx: grid.nx, nz: grid.nz, cell: grid.cell, walkable: grid.walkableCount,
                flags: grid.flags.slice(), floor: grid.floor.slice(),
                enclosure: grid.enclosure.slice(), cover: pts };
    store(k, rec, arrayBytes(rec.flags) + arrayBytes(rec.floor) + arrayBytes(rec.enclosure) + pts.length * 64);
  }

  /* ------------------------------------------------------------------ */
  /* the world: measured, and left alone                                */
  /* ------------------------------------------------------------------ */

  /**
   * WHY THE WORLD IS NOT CACHED, IN BYTES.
   *
   * It is the biggest single item left — 35.8 s of a 44 s cold load on a
   * SwiftShader fleet box, ~3.4 s of the phone's warm load — so it was the
   * first thing looked at, and the seam is real: WorldSystem's generation pass
   * writes into an Assembler and `finalize()` turns that into meshes, so
   * handing back merged geometry would skip the whole of it.
   *
   * What stopped it is size, and the number is not close. This walks the
   * finished world and adds up exactly what would have to be stored — every
   * static batch, every instanced prototype's geometry and instance matrices,
   * and the collision proxies. The street is 603k static triangles and 1129k
   * instanced triangles across 7989 instances; a vertex carries position,
   * normal, uv and a mask colour (44 bytes) and every triangle carries a
   * 32-bit index.
   *
   * MEASURED ON A FLEET BOX: 61.6 MB. That is written into `mesh.worldMB` on
   * every run, so it stays a measurement and not a memory.
   *
   * For scale, everything this file DOES keep — a whole viewmodel, three
   * soldiers and the nav grid — is 7.1 MB, and the texture cache's 5.1 MB is
   * already the biggest thing this app writes. 61.6 MB is nearly nine times the
   * one and twelve times the other, to buy back 2.0 s here and ~3.4 s on the
   * phone, on a device with one slow core and a sandboxed IndexedDB behind a
   * postMessage bridge. It is also 61.6 MB of somebody's phone, kept forever,
   * for one app.
   *
   * Doing it properly would need its own storage design — chunking so no single
   * record is enormous, quantised positions and half-float normals to get the
   * 44 bytes a vertex down, and an eviction policy with a real budget. That is
   * a different piece of work from this one, and guessing at it would be the
   * expensive kind of guess: a world that comes back wrong is far worse than a
   * world that takes three seconds.
   */
  function measureWorld(ctx) {
    var n = 0;
    try {
      var world = ctx.peek('world');
      if (!world || !world.root) return 0;
      var seen = [];
      world.root.traverse(function (o) {
        var g = o.geometry;
        if (g && g.attributes && seen.indexOf(g) < 0) {
          seen.push(g);
          for (var k in g.attributes) n += arrayBytes(g.attributes[k].array);
          if (g.getIndex && g.getIndex()) n += arrayBytes(g.getIndex().array);
        }
        if (o.instanceMatrix) n += arrayBytes(o.instanceMatrix.array);
        if (o.instanceColor) n += arrayBytes(o.instanceColor.array);
      });
    } catch (e) { return 0; }
    worldBytes = n;
    return n;
  }

  /* ------------------------------------------------------------------ */

  /** Write back, after the player is already in. One record, one write. */
  function flush() {
    try { sealWeapons(); } catch (e) { note('sealing the weapons failed: ' + (e && e.message || e)); }
    if (!db || !fresh.length) return Promise.resolve(0);
    fresh.length = 0;
    var t0 = Date.now(), n = 0, items = {};
    for (var k in mem) { items[k] = mem[k]; n++; }
    return db.put({ id: 'all', v: 2, items: items }).then(function () {
      lastFlush = n + ' records, ' + (bytes / 1048576).toFixed(1) + ' MB in ' + (Date.now() - t0) + 'ms';
      try { console.info('[fps] mesh cache: ' + lastFlush); } catch (e) {}
      return n;
    }, function (e) {
      lastFlush = 'refused: ' + (e && e.message || e);
      try { console.info('[fps] mesh cache: ' + lastFlush); } catch (e2) {}
      return 0;
    });
  }

  root.MeshCache = {
    preload: preload, flush: flush, useSeed: useSeed, measureWorld: measureWorld,
    getWeapon: getWeapon, getWeaponAsm: getWeaponAsm,
    putWeaponModel: putWeaponModel, putWeaponAsm: putWeaponAsm,
    getVariant: getVariant, putVariant: putVariant,
    getNav: getNav, putNav: putNav,
    stats: function () {
      var n = 0; for (var k in mem) n++;
      return { models: n, hits: hits, misses: misses, MB: +(bytes / 1048576).toFixed(2),
               worldMB: +(worldBytes / 1048576).toFixed(1), fpMs: fpMs, reshaped: reshaped,
               flush: lastFlush, notes: notes };
    },
  };
})(window);
