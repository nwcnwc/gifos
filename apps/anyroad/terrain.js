// Anyroad — the ground.
//
// Elevation arrives as "terrarium" PNGs: metres packed into colour, one pixel
// per post, 256×256 per tile. Decode gives a heightfield; the heightfield gives
// both a mesh to draw and a function to ask "how high is the ground here?",
// which is what the car stands on. Those two must come from the SAME data or
// the car floats above (or sinks into) the thing you can see.
//
// Tiles are stitched with SKIRTS rather than welded vertices. Neighbouring
// terrarium tiles do not share an edge row, so a shared-vertex weld would need
// each tile to know its neighbours before it can be built — which serialises
// loading. A skirt (an apron of geometry dropped straight down at the tile
// border) hides the hairline crack instead, and any tile can be built alone,
// the moment its own bytes land.
(function (root) {
  'use strict';

  var TILE_ZOOM = 14;     // ~2.4 km per tile at the equator; ~9.5 m per height post
  var GRID = 48;          // mesh resolution per tile: GRID+1 squared vertices
  var SKIRT = 60;         // metres of apron dropped at each tile edge
  var CACHE_MAX = 64;     // decoded heightfields held in memory (LRU)

  // ---- terrarium decode ----------------------------------------------------
  // height = (R * 256 + G + B / 256) - 32768, in metres. The offset exists so
  // the format can carry ocean floor as well as mountain.
  function decodeTerrarium(px) {
    var n = px.width * px.height, out = new Float32Array(n), d = px.data;
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      out[i] = (d[o] * 256 + d[o + 1] + d[o + 2] / 256) - 32768;
    }
    return out;
  }

  // ---- the loaded set ------------------------------------------------------
  // key -> { tile, bounds, size, heights, min, max, mesh, used }
  var loaded = {};
  var order = [];   // keys, least-recently-used first

  function touch(key) {
    var i = order.indexOf(key);
    if (i >= 0) order.splice(i, 1);
    order.push(key);
    while (order.length > CACHE_MAX) {
      var drop = order.shift();
      if (loaded[drop] && loaded[drop].mesh && loaded[drop].mesh.release) loaded[drop].mesh.release();
      delete loaded[drop];
    }
  }

  function get(key) { return loaded[key] || null; }

  // Load one tile's heightfield. A "flat" source short-circuits to zeros so the
  // rest of the pipeline (mesh, sampling, the car) is completely unchanged.
  function loadTile(tile) {
    var key = root.Geo.tileKey(tile);
    if (loaded[key]) { touch(key); return Promise.resolve(loaded[key]); }
    var src = root.Sources.terrain;
    var bounds = root.Geo.tileBounds(tile.z, tile.x, tile.y);

    if (src.encoding === 'flat' || !src.url) {
      var flat = { tile: tile, bounds: bounds, size: 2, heights: new Float32Array(4), min: 0, max: 0, mesh: null };
      loaded[key] = flat; touch(key);
      return Promise.resolve(flat);
    }

    var url = root.Sources.expand(src.url, tile);
    return root.Net.pixels(url).then(function (px) {
      var heights = decodeTerrarium(px);
      var min = Infinity, max = -Infinity;
      for (var i = 0; i < heights.length; i++) {
        // Open ocean comes back thousands of metres down. Clamping it to a
        // shallow negative keeps one abyssal post from stretching the tile's
        // range, while still leaving it BELOW the sea plane at y=0 — flatten it
        // to exactly 0 and the coastline disappears.
        if (heights[i] < -25) heights[i] = -25;
        if (heights[i] < min) min = heights[i];
        if (heights[i] > max) max = heights[i];
      }
      var rec = { tile: tile, bounds: bounds, size: px.width, heights: heights,
                  min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max, mesh: null };
      loaded[key] = rec; touch(key);
      return rec;
    });
  }

  // ---- sampling ------------------------------------------------------------
  // THE GROUND IS THE DRAWN GROUND. There used to be two answers to "how high
  // is the ground here": the renderer drew a 48-cell lattice with nearest-
  // sampled heights, while this function did bilinear interpolation over the
  // full 255-pixel heightfield — a DIFFERENT surface, disagreeing by up to
  // metres wherever real terrain curves inside one 33 m lattice cell. Nobody
  // noticed while the roads were as coarse as the mesh; the moment ribbons were
  // densified to hug THIS function every 6 m, they hugged a surface the
  // renderer does not draw, and everywhere the drawn mesh bridged over a dip
  // the road was genuinely underneath the grass. Names right, traffic right,
  // tarmac invisible — measured on any real hillside, never on the flat test
  // fixture, which is exactly why every gate stayed green.
  //
  // So: ONE surface. The lattice both of them use is built once per tile
  // (bilinear samples of the heightfield at the lattice points), the mesh
  // renders it, and this function evaluates the SAME piecewise-linear surface
  // with the SAME diagonal split. Whatever the renderer draws, the cars, the
  // roads and the animals now stand on it by construction.
  function latticeOf(rec) {
    if (rec.lattice) return rec.lattice;
    var n = GRID + 1, s = rec.size, h = rec.heights;
    var lat = new Float32Array(n * n);
    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var px = (i / GRID) * (s - 1), py = (j / GRID) * (s - 1);
        var x0 = Math.min(s - 1, Math.floor(px)), x1 = Math.min(s - 1, x0 + 1);
        var y0 = Math.min(s - 1, Math.floor(py)), y1 = Math.min(s - 1, y0 + 1);
        var sx = px - x0, sy = py - y0;
        lat[j * n + i] = (h[y0 * s + x0] * (1 - sx) + h[y0 * s + x1] * sx) * (1 - sy)
                       + (h[y1 * s + x0] * (1 - sx) + h[y1 * s + x1] * sx) * sy;
      }
    }
    rec.lattice = lat;
    return lat;
  }

  function heightAtGeo(lat, lon) {
    var tx = root.Geo.lonToTileX(lon, TILE_ZOOM), ty = root.Geo.latToTileY(lat, TILE_ZOOM);
    var key = TILE_ZOOM + '/' + Math.floor(tx) + '/' + Math.floor(ty);
    var rec = loaded[key];
    if (!rec) return null;                 // not loaded yet — caller decides
    if (rec.size === 2) return 0;          // flat source
    var g = latticeOf(rec), n = GRID + 1;
    var gu = Math.min(GRID - 1e-6, Math.max(0, (tx - Math.floor(tx)) * GRID));
    var gv = Math.min(GRID - 1e-6, Math.max(0, (ty - Math.floor(ty)) * GRID));
    var cx = Math.floor(gu), cy = Math.floor(gv);
    var sx = gu - cx, sy = gv - cy;
    var a = g[cy * n + cx], b = g[cy * n + cx + 1],
        c = g[(cy + 1) * n + cx], d = g[(cy + 1) * n + cx + 1];
    // The mesh splits each cell into triangles (a,b,c) and (b,d,c) — across
    // the b–c diagonal. Evaluate the matching plane, or the two surfaces part
    // company along every diagonal and the bug comes straight back at half
    // size.
    return (sx + sy <= 1)
      ? a + (b - a) * sx + (c - a) * sy
      : d + (c - d) * (1 - sx) + (b - d) * (1 - sy);
  }

  // Same, in world metres. Returns null when the ground is not loaded, so
  // callers can hold the car still rather than drop it through a hole.
  function heightAt(frame, x, z) {
    var g = frame.toGeo(x, z);
    return heightAtGeo(g.lat, g.lon);
  }

  // ---- mesh ----------------------------------------------------------------
  // A (GRID+1)² lattice over the tile in world space, plus a skirt. Positions
  // are metres in the current frame, so a re-pin rebuilds meshes — which is
  // correct: the frame IS the coordinate system.
  function buildMesh(rec, frame) {
    var n = GRID + 1;
    var b = rec.bounds;
    var vCount = n * n + n * 4;                 // lattice + four skirt edges
    var pos = new Float32Array(vCount * 3);
    var nrm = new Float32Array(vCount * 3);
    var uv = new Float32Array(vCount * 2);
    var idx = [];

    // Vertex heights come from the SHARED lattice — the same array heightAt
    // evaluates. Sampling the heightfield independently here (it used to,
    // nearest-neighbour) is how the drawn ground and the physical ground came
    // to be two different surfaces; see heightAtGeo.
    var lattice = rec.size === 2 ? null : latticeOf(rec);
    function sample(i, j) { return lattice ? lattice[j * n + i] : 0; }

    var p = 0, q = 0, t = 0;
    for (var j = 0; j < n; j++) {
      var v = j / GRID;
      var lat = b.north + (b.south - b.north) * v;   // v=0 is NORTH (tile y counts down)
      for (var i = 0; i < n; i++) {
        var u = i / GRID;
        var lon = b.west + (b.east - b.west) * u;
        var w = frame.toWorld(lat, lon);
        var h = sample(i, j);
        pos[p++] = w.x; pos[p++] = h; pos[p++] = w.z;
        uv[q++] = u; uv[q++] = v;
        nrm[t++] = 0; nrm[t++] = 1; nrm[t++] = 0;    // filled in below
      }
    }

    // Normals by central difference on the lattice we just built — cheaper and
    // smoother than per-face normals, and it matches what the eye expects of a
    // continuous surface.
    for (var jj = 0; jj < n; jj++) for (var ii = 0; ii < n; ii++) {
      var i0 = (jj * n + ii) * 3;
      var xm = (jj * n + Math.max(0, ii - 1)) * 3, xp = (jj * n + Math.min(n - 1, ii + 1)) * 3;
      var zm = (Math.max(0, jj - 1) * n + ii) * 3, zp = (Math.min(n - 1, jj + 1) * n + ii) * 3;
      var dx = pos[xp] - pos[xm], dhx = pos[xp + 1] - pos[xm + 1];
      var dz = pos[zp + 2] - pos[zm + 2], dhz = pos[zp + 1] - pos[zm + 1];
      // Cross the two surface tangents: tX = (dx, dhx, 0), tZ = (0, dhz, dz).
      // dz is NEGATIVE here (row j+1 lies south), which is exactly what flips
      // the naive cross product downward — and a downward normal makes every
      // slope read as unlit rock, which is a lighting bug that looks like an
      // art decision. A heightfield's normal always points up, so assert it.
      var nx = dhx * dz;
      var ny = -dx * dz;
      var nz = dx * dhz;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      var len = Math.hypot(nx, ny, nz) || 1;
      nrm[i0] = nx / len; nrm[i0 + 1] = ny / len; nrm[i0 + 2] = nz / len;
    }

    // Winding: row j+1 lies SOUTH of row j, and south is -z, so the naive
    // (a, c, b) order produces a downward normal and the whole ground gets
    // back-face culled — a sky-blue screen with no error anywhere.
    for (var y = 0; y < GRID; y++) for (var x = 0; x < GRID; x++) {
      var a = y * n + x, bb = a + 1, c = a + n, d = c + 1;
      idx.push(a, bb, c, bb, d, c);
    }

    // Skirt: duplicate each border vertex, drop it, and stitch a wall. Purely
    // cosmetic — it exists so a one-pixel mismatch between neighbouring tiles
    // does not show as a strip of sky along every tile boundary.
    var base = n * n;
    function skirtEdge(getIndex) {
      var start = base;
      for (var k = 0; k < n; k++) {
        var src = getIndex(k) * 3;
        pos[base * 3] = pos[src]; pos[base * 3 + 1] = pos[src + 1] - SKIRT; pos[base * 3 + 2] = pos[src + 2];
        nrm[base * 3] = 0; nrm[base * 3 + 1] = 1; nrm[base * 3 + 2] = 0;
        uv[base * 2] = uv[getIndex(k) * 2]; uv[base * 2 + 1] = uv[getIndex(k) * 2 + 1];
        base++;
      }
      for (var m = 0; m < n - 1; m++) {
        var top0 = getIndex(m), top1 = getIndex(m + 1), bot0 = start + m, bot1 = start + m + 1;
        idx.push(top0, bot0, top1, top1, bot0, bot1);
      }
    }
    skirtEdge(function (k) { return k; });                       // north
    skirtEdge(function (k) { return (n - 1) * n + k; });          // south
    skirtEdge(function (k) { return k * n; });                    // west
    skirtEdge(function (k) { return k * n + (n - 1); });          // east

    return {
      positions: pos, normals: nrm, uvs: uv,
      indices: (vCount > 65535) ? new Uint32Array(idx) : new Uint16Array(idx),
      count: idx.length,
      bounds: b,
    };
  }

  function meshFor(rec, frame) {
    if (!rec.mesh || rec.meshFrame !== frame) {
      rec.mesh = buildMesh(rec, frame);
      rec.meshFrame = frame;
    }
    return rec.mesh;
  }

  root.Terrain = {
    TILE_ZOOM: TILE_ZOOM,
    loadTile: loadTile, get: get, meshFor: meshFor,
    heightAt: heightAt, heightAtGeo: heightAtGeo,
    loadedCount: function () { return order.length; },
    clear: function () { loaded = {}; order = []; },
  };
})(window);
