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
    motorway:      { w: 14, tone: 0.62, rank: 6, cruise: 33 },
    motorway_link: { w: 8,  tone: 0.62, rank: 5, cruise: 20 },
    trunk:         { w: 12, tone: 0.60, rank: 6, cruise: 30 },
    trunk_link:    { w: 8,  tone: 0.60, rank: 5, cruise: 19 },
    primary:       { w: 11, tone: 0.58, rank: 5, cruise: 24 },
    primary_link:  { w: 7,  tone: 0.58, rank: 4, cruise: 16 },
    secondary:     { w: 9,  tone: 0.55, rank: 4, cruise: 21 },
    secondary_link:{ w: 6,  tone: 0.55, rank: 3, cruise: 15 },
    tertiary:      { w: 8,  tone: 0.52, rank: 3, cruise: 19 },
    tertiary_link: { w: 6,  tone: 0.52, rank: 3, cruise: 15 },
    residential:   { w: 7,  tone: 0.48, rank: 2, cruise: 14 },
    unclassified:  { w: 6,  tone: 0.46, rank: 2, cruise: 14 },
    living_street: { w: 6,  tone: 0.46, rank: 2, cruise: 14 },
    service:       { w: 4,  tone: 0.42, rank: 1, cruise: 9 },
    track:         { w: 3.5,tone: 0.38, rank: 1, cruise: 8 },
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
      // Two different ways a dense tile refuses to load, and both mean the same
      // thing — this query is too big for this tile:
      //   "response too large"  the GifOS bridge's own 8 MB response cap
      //   HTTP 504              Overpass gave up on the query's cost
      // Either way, drop the buildings and take the roads. Without the 504 case
      // a city centre retries the identical too-expensive query forever, which
      // reads to the player as an app that simply never finishes loading.
      if (wantBuildings && (/too large/i.test(err.message || '') || err.status === 504)) {
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
        // Reversed: the ear test runs in the (x, z) plane, where a
        // counter-clockwise triangle faces DOWN once y is up. Emitting them
        // reversed means every roof and lake faces the sky, which is the only
        // way they survive back-face culling.
        idx.push(i2, i1, i0);
        v.splice(k, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;                              // degenerate; take what we have
    }
    if (v.length === 3) idx.push(v[2], v[1], v[0]);
    return idx;
  }

  function toWorld(frame, flat) {
    var pts = [];
    for (var i = 0; i < flat.length; i += 2) pts.push(frame.toWorld(flat[i], flat[i + 1]));
    return pts;
  }

  // ---- scenery -------------------------------------------------------------
  // OSM knows where the woods are, but asking for them is a whole extra layer
  // in every Overpass query — on donated infrastructure, for scenery. So the
  // trees are GROWN instead: a deterministic scatter over the tile, rejected
  // wherever the world already has something (road, building, water, cliff).
  //
  // Deterministic matters. The hash is over the world position, so a tile
  // rebuilt after the frame re-pins grows the SAME wood in the SAME place —
  // otherwise every re-pin would replant the countryside in front of you.
  //
  // This is the biggest single thing the app can do for the look of a place
  // with no satellite drape, because bare heightfield green is exactly what a
  // landscape does not look like. It is also why it is one static mesh per
  // tile: 300 trees as 300 draw calls would cost more than everything else in
  // the frame put together.
  var TREE_STEP = 34;          // metres between candidate sites
  var TREE_MAX = 240;          // per tile — a hard ceiling on bytes AND on fill
  var TREE_CLEAR = 4.0;        // metres of clearance from a carriageway edge

  function hash2(x, z) {
    var h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }

  // A cone on a stick. Eight triangles for the canopy, four for the trunk, and
  // at any distance you actually see one from a car that is enough — the shape
  // and the colour do the work, not the polygon count.
  function tree(x, base, z, h, r, tint, out) {
    var trunkR = Math.max(0.12, r * 0.13), trunkH = h * 0.34;
    var bark = [0.26, 0.20, 0.15];
    var v0 = out.pos.length / 3;
    var i, ang, nx, nz;
    for (i = 0; i < 4; i++) {
      ang = i * Math.PI / 2 + 0.4;
      nx = Math.cos(ang); nz = Math.sin(ang);
      out.pos.push(x + nx * trunkR, base, z + nz * trunkR);
      out.pos.push(x + nx * trunkR, base + trunkH, z + nz * trunkR);
      out.nrm.push(nx, 0, nz, nx, 0, nz);
      out.col.push(bark[0], bark[1], bark[2], bark[0], bark[1], bark[2]);
    }
    for (i = 0; i < 4; i++) {
      var a = v0 + i * 2, b = a + 1, c = v0 + ((i + 1) % 4) * 2, d = c + 1;
      out.idx.push(a, c, b, b, c, d);
    }
    // Canopy: two stacked rings pinched to a point, which reads as a broadleaf
    // crown from the side and as a blob from above — both of which are right.
    var ringY = [base + trunkH * 0.75, base + h * 0.62], ringR = [r, r * 0.66];
    var rings = [];
    for (var ri = 0; ri < 2; ri++) {
      var start = out.pos.length / 3;
      for (i = 0; i < 6; i++) {
        ang = i * Math.PI / 3;
        nx = Math.cos(ang); nz = Math.sin(ang);
        out.pos.push(x + nx * ringR[ri], ringY[ri], z + nz * ringR[ri]);
        out.nrm.push(nx * 0.7, 0.35, nz * 0.7);
        // Every leaf face slightly its own colour, so a wood is not one flat
        // green shape with a hole cut in the sky.
        var j = hash2(x + i * 3.1, z + ri * 7.7) * 0.18 - 0.09;
        out.col.push(tint[0] + j, tint[1] + j * 0.8, tint[2] + j * 0.5);
      }
      rings.push(start);
    }
    var apex = out.pos.length / 3;
    out.pos.push(x, base + h, z);
    out.nrm.push(0, 1, 0);
    out.col.push(tint[0] * 1.12, tint[1] * 1.12, tint[2] * 1.12);
    for (i = 0; i < 6; i++) {
      var i2 = (i + 1) % 6;
      out.idx.push(rings[0] + i, rings[1] + i2, rings[0] + i2);
      out.idx.push(rings[0] + i, rings[1] + i, rings[1] + i2);
      out.idx.push(rings[1] + i, apex, rings[1] + i2);
    }
  }

  function scatter(frame, tile, geom, roadIndex, wallIndex) {
    var out = { pos: [], nrm: [], col: [], idx: [] };
    if (!tile) return pack(out, ['pos', 'nrm', 'col']);
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    var c1 = frame.toWorld(b.north, b.west), c2 = frame.toWorld(b.south, b.east);
    var x0 = Math.min(c1.x, c2.x), x1 = Math.max(c1.x, c2.x);
    var z0 = Math.min(c1.z, c2.z), z1 = Math.max(c1.z, c2.z);
    var planted = 0;
    var probe = [];

    for (var gx = Math.floor(x0 / TREE_STEP); gx * TREE_STEP < x1 && planted < TREE_MAX; gx++) {
      for (var gz = Math.floor(z0 / TREE_STEP); gz * TREE_STEP < z1 && planted < TREE_MAX; gz++) {
        var r1 = hash2(gx, gz), r2 = hash2(gx + 91.3, gz - 47.9), r3 = hash2(gx * 1.7, gz * 2.3 + 5.1);
        // Clumping: trees come in copses, and a uniform scatter is the one
        // arrangement no landscape on Earth has.
        var clump = hash2(Math.floor(gx / 4) * 3.7, Math.floor(gz / 4) * 5.9);
        if (r3 > 0.20 + clump * 0.72) continue;
        var x = (gx + r1) * TREE_STEP, z = (gz + r2) * TREE_STEP;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;

        var road = nearestRoad(roadIndex, x, z);
        if (road && road.dist < road.halfWidth + TREE_CLEAR) continue;
        probe.length = 0;
        nearWalls(wallIndex, x, z, probe);
        var blocked = false;
        for (var w = 0; w < probe.length; w += 4) {
          // Anything within a few metres of a footprint edge is a courtyard, a
          // pavement or the inside of the building itself.
          if (segDist(x, z, probe[w], probe[w + 1], probe[w + 2], probe[w + 3]) < 5) { blocked = true; break; }
        }
        if (blocked) continue;

        var y = root.Terrain.heightAt(frame, x, z);
        if (y === null || y < 0.6) continue;            // not loaded, or in the sea
        // No trees on a cliff: sample the slope the same way the car does.
        var yn = root.Terrain.heightAt(frame, x + 6, z), ye = root.Terrain.heightAt(frame, x, z + 6);
        if (yn !== null && ye !== null && Math.max(Math.abs(yn - y), Math.abs(ye - y)) > 4.2) continue;

        var h = 5.5 + r1 * 7.5, rad = 1.7 + r2 * 2.1;
        // Conifer above the treeline-ish, broadleaf below, and a few dying back
        // to autumn either way.
        var conifer = y > 900 || r3 < 0.06;
        var tint = conifer ? [0.16 + r1 * 0.05, 0.30 + r2 * 0.07, 0.20 + r1 * 0.05]
                           : [0.22 + r2 * 0.14, 0.38 + r1 * 0.12, 0.16 + r2 * 0.08];
        if (r2 > 0.93) tint = [0.52, 0.40, 0.16];       // one in fifteen has turned
        tree(x, y, z, conifer ? h * 1.25 : h, conifer ? rad * 0.62 : rad, tint, out);
        planted++;
      }
    }
    return pack(out, ['pos', 'nrm', 'col']);
  }

  function tileCentre(frame, tile) {
    if (!tile) return null;
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    return frame.toWorld((b.north + b.south) / 2, (b.west + b.east) / 2);
  }

  function segDist(x, z, ax, az, bx, bz) {
    var vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz;
    var t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
    return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
  }

  // Build all four meshes for one tile's geometry.
  function build(frame, geom, tile) {
    var roads = { pos: [], uv: [], tone: [], idx: [] };
    for (var i = 0; i < geom.ways.length; i++) {
      var cls = ROAD_CLASS[geom.ways[i][0]];
      if (!cls) continue;
      ribbon(frame, toWorld(frame, geom.ways[i][1]), cls.w / 2, 0.18, roads, cls.tone);
    }

    // binfo carries (baseY, seed) per vertex: the shader needs the building's
    // own ground level to lay out floors, and a stable per-building seed so a
    // street is not one uniform grey. Neither can be derived in the fragment
    // stage — world Y alone cannot tell a ground floor from a fifth floor on a
    // hill, which is exactly how a terrace ends up with staggered windows.
    var walls = { pos: [], nrm: [], tone: [], binfo: [], idx: [] };
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

    // The two indices are built BEFORE the scenery, because the scatter asks
    // both of them where it may not plant.
    var roadIndex = buildIndex(frame, geom);
    var wallIndex = buildWallIndex(frame, geom);
    return {
      roads: pack(roads, ['pos', 'uv', 'tone']),
      buildings: pack(walls, ['pos', 'nrm', 'tone', 'binfo']),
      water: pack(water, ['pos']),
      trees: root.Sources.current.quality === 'normal' ? scatter(frame, tile, geom, roadIndex, wallIndex) : null,
      // Where this tile sits, so the draw loop can drop DISTANT scenery without
      // rebuilding anything. Trees are the most numerous thing in the world and
      // the ones a kilometre away are a green haze the fog eats anyway.
      centre: tileCentre(frame, tile),
      index: roadIndex,
      walls: wallIndex,
    };
  }

  // ---- building walls, for collision --------------------------------------
  // Same bucketing trick as the road index, over the footprint EDGES. A city
  // tile can hold a thousand buildings and the car needs an answer every frame,
  // so the only thing a query may touch is the handful of edges in its own cell
  // and the eight around it.
  function buildWallIndex(frame, geom) {
    var segs = [], map = Object.create(null);
    for (var b = 0; b < geom.bld.length; b++) {
      var poly = toWorld(frame, geom.bld[b][1]);
      if (poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
      if (poly.length < 3) continue;
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], c = poly[(i + 1) % poly.length];
        var idx = segs.length / 4;
        segs.push(a.x, a.z, c.x, c.z);
        var x0 = Math.floor(Math.min(a.x, c.x) / CELL), x1 = Math.floor(Math.max(a.x, c.x) / CELL);
        var z0 = Math.floor(Math.min(a.z, c.z) / CELL), z1 = Math.floor(Math.max(a.z, c.z) / CELL);
        for (var cx = x0; cx <= x1; cx++) for (var cz = z0; cz <= z1; cz++) {
          var k = cx + ',' + cz;
          (map[k] || (map[k] = [])).push(idx);
        }
      }
    }
    return { segs: new Float32Array(segs), map: map, cell: CELL };
  }

  // Every wall edge whose cell neighbourhood contains (x, z). Returns a flat
  // array [x1,z1,x2,z2, …] because the caller runs it per frame and an array of
  // objects here would be a per-frame allocation storm.
  function nearWalls(index, x, z, out) {
    if (!index) return out;
    var cx = Math.floor(x / index.cell), cz = Math.floor(z / index.cell);
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var list = index.map[(cx + dx) + ',' + (cz + dz)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i] * 4;
        out.push(index.segs[o], index.segs[o + 1], index.segs[o + 2], index.segs[o + 3]);
      }
    }
    return out;
  }

  // ---- "am I on tarmac?" ---------------------------------------------------
  // The car needs this every frame, and a city tile holds thousands of segments,
  // so a linear scan is out. Segments are bucketed into a coarse uniform grid at
  // BUILD time (once per tile) and the query looks only at the car's own cell
  // and its eight neighbours — a couple of dozen segments instead of thousands.
  var STRIDE = 6;  // x1,z1,x2,z2,halfWidth,cruise
  var CELL = 64;   // metres; comfortably larger than the longest reasonable step

  function buildIndex(frame, geom) {
    var segs = [], map = Object.create(null);
    function cellKey(cx, cz) { return cx + ',' + cz; }
    for (var w = 0; w < geom.ways.length; w++) {
      var cls = ROAD_CLASS[geom.ways[w][0]];
      if (!cls) continue;
      var pts = toWorld(frame, geom.ways[w][1]);
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1];
        var idx = segs.length / STRIDE;
        segs.push(a.x, a.z, b.x, b.z, cls.w / 2, cls.cruise);
        // Stamp the segment into every cell its bounding box touches, so a long
        // segment is found from anywhere along it.
        var x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
        var z0 = Math.floor(Math.min(a.z, b.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z) / CELL);
        for (var cx = x0; cx <= x1; cx++) for (var cz = z0; cz <= z1; cz++) {
          var k = cellKey(cx, cz);
          (map[k] || (map[k] = [])).push(idx);
        }
      }
    }
    return { segs: new Float32Array(segs), map: map, cell: CELL };
  }

  // Perpendicular distance from (x,z) to the nearest carriageway, and that
  // road's half width. Returns null when this tile has nothing near.
  function nearestRoad(index, x, z) {
    if (!index) return null;
    var cx = Math.floor(x / index.cell), cz = Math.floor(z / index.cell);
    var best = Infinity, bestHalf = 0, bestCruise = 14;
    var bestX = 0, bestZ = 0, bestVX = 0, bestVZ = 1;
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var list = index.map[(cx + dx) + ',' + (cz + dz)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i] * STRIDE;
        var ax = index.segs[o], az = index.segs[o + 1];
        var bx = index.segs[o + 2], bz = index.segs[o + 3];
        var vx = bx - ax, vz = bz - az;
        var len2 = vx * vx + vz * vz;
        var t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
        var px = ax + vx * t, pz = az + vz * t;
        var d = Math.hypot(x - px, z - pz);
        if (d < best) {
          best = d; bestHalf = index.segs[o + 4]; bestCruise = index.segs[o + 5];
          // The POINT, not just the distance. The wildlife walks toward the
          // nearest carriageway to cross it, and the unstick rescue puts the
          // car back down on it — both need somewhere to aim, and recomputing
          // it in the caller would mean walking the index twice.
          bestX = px; bestZ = pz;
          bestVX = vx; bestVZ = vz;
        }
      }
    }
    return best === Infinity ? null
      : { dist: best, halfWidth: bestHalf, cruise: bestCruise, x: bestX, z: bestZ, dx: bestVX, dz: bestVZ };
  }

  function extrude(frame, poly, height, out) {
    if (poly.length < 3) return;
    if (poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
    if (poly.length < 3) return;
    // OSM building ways come in both windings, and the wall normal is derived
    // from edge direction — so half of every city would face inward and vanish.
    // Normalise to positive signed area first; then the per-edge normal below
    // is reliably outward.
    var signed = 0;
    for (var s = 0; s < poly.length; s++) {
      var pa = poly[s], pb = poly[(s + 1) % poly.length];
      signed += pa.x * pb.z - pb.x * pa.z;
    }
    if (signed < 0) poly.reverse();
    // One ground height for the whole footprint: a building does not follow the
    // hill, it sits on it (and per-corner heights make walls visibly skew).
    var base = Infinity;
    for (var i = 0; i < poly.length; i++) base = Math.min(base, groundAt(frame, poly[i].x, poly[i].z, 0));
    if (!isFinite(base)) base = 0;
    var top = base + height;
    var tone = 0.5 + Math.min(0.35, height / 160);
    // A stable seed from the footprint's first corner — same building, same
    // colour, every time it is rebuilt after a re-pin.
    var seed = Math.abs(Math.sin(poly[0].x * 12.9898 + poly[0].z * 78.233) * 43758.5453) % 1;

    for (var e = 0; e < poly.length; e++) {
      var a = poly[e], b = poly[(e + 1) % poly.length];
      var dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      var nx = dz / len, nz = -dx / len;
      var v0 = out.pos.length / 3;
      out.pos.push(a.x, base, a.z, b.x, base, b.z, a.x, top, a.z, b.x, top, b.z);
      for (var k = 0; k < 4; k++) { out.nrm.push(nx, 0, nz); out.tone.push(tone); out.binfo.push(base, seed); }
      out.idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
    }
    // Roof.
    var tris = triangulate(poly);
    var rbase = out.pos.length / 3;
    for (var r = 0; r < poly.length; r++) {
      out.pos.push(poly[r].x, top, poly[r].z);
      out.nrm.push(0, 1, 0);
      out.tone.push(tone + 0.08);
      out.binfo.push(base, seed);
    }
    for (var t = 0; t < tris.length; t++) out.idx.push(rbase + tris[t]);
  }

  function pack(o, attrs) {
    var m = { count: o.idx.length };
    attrs.forEach(function (a) {
      var key = a === 'pos' ? 'positions' : a === 'nrm' ? 'normals'
              : a === 'uv' ? 'uvs' : a === 'col' ? 'colors' : a;
      m[key] = new Float32Array(o[a]);
    });
    m.indices = (o.pos.length / 3 > 65535) ? new Uint32Array(o.idx) : new Uint16Array(o.idx);
    return m;
  }

  root.Roads = {
    TILE_ZOOM: TILE_ZOOM,
    loadTile: loadTile, build: build, ROAD_CLASS: ROAD_CLASS, nearestRoad: nearestRoad,
    nearWalls: nearWalls,
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
