// Anyroad — the built world: roads, buildings, water.
//
// Geometry comes from OpenStreetMap through Overpass, one query per tile, and
// is turned into three meshes laid over the terrain. Three things drive the
// design here, all of them consequences of where the data comes from:
//
//  - Overpass is donated infrastructure with a per-IP budget. One query per
//    tile, cached hard, and never re-asked for a tile we already hold.
//  - The GifOS fetch bridge caps a response at 8 MB. A dense city tile with
//    every building can blow past that, so a tile that comes back too large is
//    retried WITHOUT buildings and remembered as dense — degraded, not broken.
//  - What gets persisted is the parsed geometry, not the JSON and not the mesh.
//    Meshes are rebuilt whenever the frame re-pins; the JSON is ten times the
//    size of what we keep. And the cache is capped, because a GifOS app's db
//    is baked into its GIF when you save it.
(function (root) {
  'use strict';

  var TILE_ZOOM = 15;          // ~1.2 km per tile: small enough that a city tile fits
  var CACHE_MAX = 48;          // tiles of parsed geometry kept in the db
  var MAX_BUILDINGS = 1200;    // per tile, densest-first is not worth the bytes

  // Metres of carriageway per OSM highway class, and how light the surface is.
  // Anything not listed is not drawn — service alleys and footpaths would
  // quadruple the geometry for very little of the feeling of driving.
  var ROAD_CLASS = {
    motorway:      { w: 14, tone: 0.62, rank: 6 },
    motorway_link: { w: 8,  tone: 0.62, rank: 5 },
    trunk:         { w: 12, tone: 0.60, rank: 6 },
    trunk_link:    { w: 8,  tone: 0.60, rank: 5 },
    primary:       { w: 11, tone: 0.58, rank: 5 },
    primary_link:  { w: 7,  tone: 0.58, rank: 4 },
    secondary:     { w: 9,  tone: 0.55, rank: 4 },
    secondary_link:{ w: 6,  tone: 0.55, rank: 3 },
    tertiary:      { w: 8,  tone: 0.52, rank: 3 },
    tertiary_link: { w: 6,  tone: 0.52, rank: 3 },
    residential:   { w: 7,  tone: 0.48, rank: 2 },
    unclassified:  { w: 6,  tone: 0.46, rank: 2 },
    living_street: { w: 6,  tone: 0.46, rank: 2 },
    service:       { w: 4,  tone: 0.42, rank: 1 },
    track:         { w: 3.5,tone: 0.38, rank: 1 },
  };

  function bboxOf(tile) {
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    // Overpass wants south,west,north,east.
    return b.south + ',' + b.west + ',' + b.north + ',' + b.east;
  }

  function query(tile, withBuildings) {
    var bb = bboxOf(tile);
    var parts = ['way["highway"~"^(' + Object.keys(ROAD_CLASS).join('|') + ')$"](' + bb + ');'];
    if (withBuildings) parts.push('way["building"](' + bb + ');');
    parts.push('way["natural"="water"](' + bb + ');');
    return '[out:json][timeout:25];(' + parts.join('') + ');out geom;';
  }

  // ---- parse ---------------------------------------------------------------
  // Overpass `out geom` inlines each way's coordinates, so no node table to
  // resolve. Coordinates are rounded to 6 decimals (~0.1 m) — beyond that we
  // would be storing noise at real cost.
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  function parse(json, withBuildings) {
    var ways = [], bld = [], wat = [];
    var els = (json && json.elements) || [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (!e.geometry || e.geometry.length < 2) continue;
      var flat = [];
      for (var g = 0; g < e.geometry.length; g++) { flat.push(r6(e.geometry[g].lat), r6(e.geometry[g].lon)); }
      var tags = e.tags || {};
      if (tags.highway && ROAD_CLASS[tags.highway]) {
        ways.push([tags.highway, flat]);
      } else if (tags.building && withBuildings) {
        if (bld.length < MAX_BUILDINGS) bld.push([buildingHeight(tags), flat]);
      } else if (tags.natural === 'water') {
        wat.push(flat);
      }
    }
    return { ways: ways, bld: bld, wat: wat };
  }

  function buildingHeight(tags) {
    var h = parseFloat(tags.height);
    if (isFinite(h) && h > 0) return Math.min(300, h);
    var lv = parseFloat(tags['building:levels']);
    if (isFinite(lv) && lv > 0) return Math.min(300, lv * 3.2);
    return 8;   // a plausible two storeys when nobody said
  }

  // ---- persistence ---------------------------------------------------------
  // A private collection: a guest in a race keeps their own cache and none of
  // this ever crosses the relay, which is a control-plane pipe with a hard
  // bandwidth budget — syncing a map cache through it would sink multiplayer.
  var index = null;   // key -> lastUsed, mirrored in memory to avoid a read per tile

  function db() { return root.Host.db('roadcache'); }

  function loadIndex() {
    if (index) return Promise.resolve(index);
    return db().get('index').then(function (rec) {
      index = (rec && rec.map) || {};
      return index;
    }).catch(function () { index = {}; return index; });
  }

  function saveIndex() {
    return db().put({ id: 'index', map: index }).catch(function () {});
  }

  function evictIfNeeded() {
    var keys = Object.keys(index);
    if (keys.length <= CACHE_MAX) return Promise.resolve();
    keys.sort(function (a, b) { return index[a] - index[b]; });      // oldest first
    var drop = keys.slice(0, keys.length - CACHE_MAX);
    return Promise.all(drop.map(function (k) {
      delete index[k];
      return db().delete('t' + k).catch(function () {});
    }));
  }

  // ---- fetch or recall -----------------------------------------------------
  var memory = {};   // key -> parsed geometry, this session

  function loadTile(tile) {
    var key = root.Geo.tileKey(tile);
    if (memory[key]) return Promise.resolve(memory[key]);

    return loadIndex().then(function () {
      return db().get('t' + key).catch(function () { return null; });
    }).then(function (rec) {
      if (rec && rec.ways) {
        var hit = { ways: rec.ways, bld: rec.bld || [], wat: rec.wat || [], dense: !!rec.dense };
        memory[key] = hit;
        index[key] = Date.now(); saveIndex();
        return hit;
      }
      return fetchTile(tile, key);
    });
  }

  function fetchTile(tile, key) {
    var wantBuildings = root.Sources.current.quality !== 'low';
    var url = root.Sources.roads.url;

    function ask(withBuildings) {
      return root.Net.json(url + '?data=' + encodeURIComponent(query(tile, withBuildings)))
        .then(function (json) { return parse(json, withBuildings); });
    }

    return ask(wantBuildings).catch(function (err) {
      // "response too large" is the 8 MB bridge cap: the tile is dense, so drop
      // the buildings and take the roads. Recorded so we never pay for the
      // oversized attempt on this tile again.
      if (wantBuildings && /too large/i.test(err.message || '')) {
        return ask(false).then(function (g) { g.dense = true; return g; });
      }
      throw err;
    }).then(function (geom) {
      memory[key] = geom;
      index[key] = Date.now();
      return db().put({
        id: 't' + key, ways: geom.ways, bld: geom.bld, wat: geom.wat, dense: !!geom.dense,
      }).catch(function () {}).then(evictIfNeeded).then(saveIndex).then(function () { return geom; });
    });
  }

  // ---- geometry building ---------------------------------------------------
  // All three meshes are built in world metres against the current frame, with
  // heights sampled from the SAME terrain the car drives on.
  function groundAt(frame, x, z, lift) {
    var h = root.Terrain.heightAt(frame, x, z);
    return (h === null ? 0 : h) + lift;
  }

  // A polyline to a ribbon. Vertex normals are mitred so the surface stays
  // continuous through a bend instead of showing a wedge of terrain at every
  // corner; the mitre is limited so a hairpin does not fire a spike off to
  // infinity.
  function ribbon(frame, pts, halfWidth, lift, out, tone) {
    if (pts.length < 2) return;
    var n = pts.length;
    var left = [], right = [];
    for (var i = 0; i < n; i++) {
      var prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
      var dx = next.x - prev.x, dz = next.z - prev.z;
      var len = Math.hypot(dx, dz) || 1;
      var nx = -dz / len, nz = dx / len;          // left-hand normal
      // Mitre: widen by 1/cos(half-angle) where the path turns.
      var scale = 1;
      if (i > 0 && i < n - 1) {
        var ax = pts[i].x - pts[i - 1].x, az = pts[i].z - pts[i - 1].z;
        var bx = pts[i + 1].x - pts[i].x, bz = pts[i + 1].z - pts[i].z;
        var la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
        var cosA = (ax * bx + az * bz) / (la * lb);
        scale = Math.min(3, 1 / Math.max(0.34, Math.sqrt((1 + cosA) / 2)));
      }
      var w = halfWidth * scale;
      left.push({ x: pts[i].x + nx * w, z: pts[i].z + nz * w });
      right.push({ x: pts[i].x - nx * w, z: pts[i].z - nz * w });
    }
    var base = out.pos.length / 3;
    var along = 0;   // metres travelled down THIS way, for the centre-line dash
    for (var k = 0; k < n; k++) {
      if (k > 0) along += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      var l = left[k], r = right[k];
      out.pos.push(l.x, groundAt(frame, l.x, l.z, lift), l.z);
      out.pos.push(r.x, groundAt(frame, r.x, r.z, lift), r.z);
      // v runs ACROSS the ribbon (0 at one kerb, 1 at the other) so the shader
      // can paint a centre line and kerb edges with no extra geometry; u runs
      // ALONG it in metres, which is what makes the dashes a fixed size on the
      // ground instead of stretching with the length of the way.
      out.uv.push(along, 0, along, 1);
      out.tone.push(tone, tone);
    }
    for (var s = 0; s < n - 1; s++) {
      var a = base + s * 2, b = a + 1, c = a + 2, d = a + 3;
      out.idx.push(a, c, b, b, c, d);
    }
  }

  // Ear clipping. Building footprints and lakes are small, simple polygons, so
  // an O(n²) clip is far cheaper than the code to do better.
  function triangulate(poly) {
    var n = poly.length;
    if (n < 3) return [];
    var idx = [], v = [];
    for (var i = 0; i < n; i++) v.push(i);
    // Orientation: work counter-clockwise so the ear test has one sign.
    var area = 0;
    for (var j = 0; j < n; j++) {
      var p = poly[j], q = poly[(j + 1) % n];
      area += p.x * q.z - q.x * p.z;
    }
    if (area < 0) v.reverse();

    function cross(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); }
    function inside(a, b, c, p) {
      return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    }

    var guard = 0;
    while (v.length > 3 && guard++ < n * n) {
      var clipped = false;
      for (var k = 0; k < v.length; k++) {
        var i0 = v[(k + v.length - 1) % v.length], i1 = v[k], i2 = v[(k + 1) % v.length];
        var a = poly[i0], b = poly[i1], c = poly[i2];
        if (cross(a, b, c) <= 0) continue;              // reflex, not an ear
        var ok = true;
        for (var m = 0; m < v.length; m++) {
          var vi = v[m];
          if (vi === i0 || vi === i1 || vi === i2) continue;
          if (inside(a, b, c, poly[vi])) { ok = false; break; }
        }
        if (!ok) continue;
        idx.push(i0, i1, i2);
        v.splice(k, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;                              // degenerate; take what we have
    }
    if (v.length === 3) idx.push(v[0], v[1], v[2]);
    return idx;
  }

  function toWorld(frame, flat) {
    var pts = [];
    for (var i = 0; i < flat.length; i += 2) pts.push(frame.toWorld(flat[i], flat[i + 1]));
    return pts;
  }

  // Build all three meshes for one tile's geometry.
  function build(frame, geom) {
    var roads = { pos: [], uv: [], tone: [], idx: [] };
    for (var i = 0; i < geom.ways.length; i++) {
      var cls = ROAD_CLASS[geom.ways[i][0]];
      if (!cls) continue;
      ribbon(frame, toWorld(frame, geom.ways[i][1]), cls.w / 2, 0.18, roads, cls.tone);
    }

    var walls = { pos: [], nrm: [], tone: [], idx: [] };
    for (var b = 0; b < geom.bld.length; b++) {
      extrude(frame, toWorld(frame, geom.bld[b][1]), geom.bld[b][0], walls);
    }

    var water = { pos: [], idx: [] };
    for (var w = 0; w < geom.wat.length; w++) {
      var poly = toWorld(frame, geom.wat[w]);
      if (poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
      var tris = triangulate(poly);
      var base = water.pos.length / 3;
      // Water sits at the lowest ground under its own outline, so a lake reads
      // as filling a basin rather than draped over one.
      var low = Infinity;
      for (var pi = 0; pi < poly.length; pi++) low = Math.min(low, groundAt(frame, poly[pi].x, poly[pi].z, 0));
      if (!isFinite(low)) low = 0;
      for (var pj = 0; pj < poly.length; pj++) water.pos.push(poly[pj].x, low + 0.3, poly[pj].z);
      for (var ti = 0; ti < tris.length; ti++) water.idx.push(base + tris[ti]);
    }

    return {
      roads: pack(roads, ['pos', 'uv', 'tone']),
      buildings: pack(walls, ['pos', 'nrm', 'tone']),
      water: pack(water, ['pos']),
    };
  }

  function extrude(frame, poly, height, out) {
    if (poly.length < 3) return;
    if (poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
    if (poly.length < 3) return;
    // One ground height for the whole footprint: a building does not follow the
    // hill, it sits on it (and per-corner heights make walls visibly skew).
    var base = Infinity;
    for (var i = 0; i < poly.length; i++) base = Math.min(base, groundAt(frame, poly[i].x, poly[i].z, 0));
    if (!isFinite(base)) base = 0;
    var top = base + height;
    var tone = 0.5 + Math.min(0.35, height / 160);

    for (var e = 0; e < poly.length; e++) {
      var a = poly[e], b = poly[(e + 1) % poly.length];
      var dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      var nx = dz / len, nz = -dx / len;
      var v0 = out.pos.length / 3;
      out.pos.push(a.x, base, a.z, b.x, base, b.z, a.x, top, a.z, b.x, top, b.z);
      for (var k = 0; k < 4; k++) { out.nrm.push(nx, 0, nz); out.tone.push(tone); }
      out.idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
    }
    // Roof.
    var tris = triangulate(poly);
    var rbase = out.pos.length / 3;
    for (var r = 0; r < poly.length; r++) {
      out.pos.push(poly[r].x, top, poly[r].z);
      out.nrm.push(0, 1, 0);
      out.tone.push(tone + 0.08);
    }
    for (var t = 0; t < tris.length; t++) out.idx.push(rbase + tris[t]);
  }

  function pack(o, attrs) {
    var m = { count: o.idx.length };
    attrs.forEach(function (a) {
      var key = a === 'pos' ? 'positions' : a === 'nrm' ? 'normals' : a === 'uv' ? 'uvs' : a;
      m[key] = new Float32Array(o[a]);
    });
    m.indices = (o.pos.length / 3 > 65535) ? new Uint32Array(o.idx) : new Uint16Array(o.idx);
    return m;
  }

  root.Roads = {
    TILE_ZOOM: TILE_ZOOM,
    loadTile: loadTile, build: build, ROAD_CLASS: ROAD_CLASS,
    clearCache: function () {
      memory = {};
      return loadIndex().then(function () {
        var keys = Object.keys(index);
        index = {};
        return Promise.all(keys.map(function (k) { return db().delete('t' + k).catch(function () {}); }))
          .then(saveIndex);
      });
    },
    cacheSize: function () { return index ? Object.keys(index).length : 0; },
  };
})(window);
