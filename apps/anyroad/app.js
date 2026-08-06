// Anyroad — boot, the world streamer, and the loop.
//
// The streamer is the interesting part. Two tile grids at different zooms
// (terrain is cheap and wants to reach the horizon; roads are expensive and
// only matter nearby), loaded nearest-first so the ground under the car is
// there before the scenery. Road meshes are gated on their terrain having
// landed — building one early would lay the tarmac at sea level and there is no
// way to notice that except by driving into it.
(function (root) {
  'use strict';

  var TERRAIN_RADIUS = 3000;   // metres of elevation around the car
  var ROAD_RADIUS = 1200;      // metres of OSM geometry — one Overpass query per tile
  var DRAW_DISTANCE = 6000;

  var world = {
    frame: null,
    terrain: {},     // key -> { rec, mesh, texture }
    roads: {},       // key -> { geom, built }
    wanted: { terrain: [], roads: [] },
    place: '',
  };

  var car = null, controls = null, canvas = null;
  var camera = { x: 0, y: 40, z: -30, tx: 0, ty: 0, tz: 0, settled: false };
  var running = false, lastT = 0, clock = 0;
  var hopAnim = 0;   // seconds since the drop began; drives the descent

  // ---- streaming -----------------------------------------------------------
  function ensureTerrain() {
    if (!world.frame) return;
    var want = root.Geo.tilesAround(world.frame, car.x, car.z, TERRAIN_RADIUS, root.Terrain.TILE_ZOOM);
    world.wanted.terrain = want;
    var launched = 0;
    for (var i = 0; i < want.length && launched < 3; i++) {
      var key = root.Geo.tileKey(want[i]);
      if (world.terrain[key]) continue;
      world.terrain[key] = { pending: true };
      launched++;
      (function (tile, k) {
        root.Terrain.loadTile(tile).then(function (rec) {
          world.terrain[k] = { rec: rec, mesh: null, texture: null };
          maybeLoadImagery(tile, k);
        }).catch(function (err) {
          world.terrain[k] = { failed: true, error: err };
          root.UI.note('Elevation tile failed: ' + err.message);
        });
      })(want[i], key);
    }
  }

  function ensureRoads() {
    if (!world.frame) return;
    var want = root.Geo.tilesAround(world.frame, car.x, car.z, ROAD_RADIUS, root.Roads.TILE_ZOOM);
    world.wanted.roads = want;
    var launched = 0;
    for (var i = 0; i < want.length && launched < 2; i++) {
      var key = root.Geo.tileKey(want[i]);
      if (world.roads[key]) continue;
      world.roads[key] = { pending: true, tile: want[i] };
      launched++;
      (function (tile, k) {
        root.Roads.loadTile(tile).then(function (geom) {
          world.roads[k] = { geom: geom, tile: tile, built: null };
        }).catch(function (err) {
          // A busy Overpass is not a bug and must not look like one: drop the
          // record so the tile is retried once the backoff expires.
          world.roads[k] = err.busy ? null : { failed: true, tile: tile };
          if (err.busy) delete world.roads[k];
          root.UI.note(err.busy ? 'Map server busy — retrying' : 'Roads failed: ' + err.message);
        });
      })(want[i], key);
    }
  }

  // ---- the sea -------------------------------------------------------------
  // Coastlines are not in the road data and open ocean is not an OSM polygon,
  // so the sea is simply a plane at y=0: terrain that dips below it IS the
  // seabed. One static quad in frame coordinates, big enough that you cannot
  // drive off it before the frame re-pins.
  function seaMesh() {
    if (world.sea) return world.sea;
    var S = 30000;
    world.sea = {
      positions: new Float32Array([-S, 0, -S, S, 0, -S, S, 0, S, -S, 0, S]),
      indices: new Uint16Array([0, 2, 1, 0, 3, 2]),
      count: 6,
    };
    return world.sea;
  }

  // Only draw it where there is actually coast — inland, a sea plane at zero
  // would slice through any valley that happens to sit near sea level.
  function seaVisible() {
    for (var k in world.terrain) {
      var s = world.terrain[k];
      if (s && s.rec && s.rec.min < -1) return true;
    }
    return false;
  }

  // ---- landing on a road ---------------------------------------------------
  // You hop to a coordinate, but what you want is to be ON a road facing along
  // it — being dropped in the middle of a field is the difference between "a
  // map viewer with a car" and a driving game. Runs during the descent, once
  // any road geometry exists.
  function snapToRoad() {
    if (!world.frame) return false;
    var best = null, bestD = Infinity;
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.geom) continue;
      for (var w = 0; w < r.geom.ways.length; w++) {
        var flat = r.geom.ways[w][1];
        for (var i = 0; i + 3 < flat.length; i += 2) {
          var p = world.frame.toWorld(flat[i], flat[i + 1]);
          var d = (p.x - car.x) * (p.x - car.x) + (p.z - car.z) * (p.z - car.z);
          if (d < bestD) {
            bestD = d;
            best = { p: p, q: world.frame.toWorld(flat[i + 2], flat[i + 3]) };
          }
        }
      }
    }
    if (!best) return false;
    car.x = best.p.x; car.z = best.p.z;
    car.yaw = Math.atan2(best.q.x - best.p.x, best.q.z - best.p.z);
    return true;
  }

  // Terrain must be present under a road tile before its mesh can be built.
  function terrainReadyFor(tile) {
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    var pts = [[b.north, b.west], [b.north, b.east], [b.south, b.west], [b.south, b.east],
               [(b.north + b.south) / 2, (b.west + b.east) / 2]];
    for (var i = 0; i < pts.length; i++) {
      if (root.Terrain.heightAtGeo(pts[i][0], pts[i][1]) === null) return false;
    }
    return true;
  }

  // One build per frame at most: building a dense tile is tens of milliseconds
  // and doing several back to back is a visible hitch.
  function buildPending() {
    for (var k in world.roads) {
      var t = world.roads[k];
      if (!t || t.pending || t.failed || t.built) continue;
      if (!terrainReadyFor(t.tile)) continue;
      t.built = root.Roads.build(world.frame, t.geom);
      return;
    }
  }

  // ---- optional satellite drape -------------------------------------------
  function maybeLoadImagery(tile, key) {
    var src = root.Sources.imagery;
    if (!src || !src.api) return;
    root.Net.apiBitmap(src.api, root.Sources.expand(src.path, tile)).then(function (bmp) {
      var slot = world.terrain[key];
      if (!slot || !slot.rec) return;
      slot.texture = root.Render.textureFor('img' + key, bmp);
      if (bmp.close) bmp.close();
    }).catch(function () { /* imagery is a bonus; never block the drive on it */ });
  }

  // ---- hop -----------------------------------------------------------------
  var hopped = false, placedOnRoad = false;

  function hop(lat, lon, label) {
    hopped = true;
    placedOnRoad = false;
    world.sea = null;
    world.frame = root.Geo.frame(lat, lon);
    // Meshes hold GL buffers; a hop throws the whole world away, so they have to
    // be released explicitly or every hop leaks a few hundred MB of VRAM.
    releaseWorld();
    root.Terrain.clear();
    world.terrain = {}; world.roads = {};
    world.place = label || (lat.toFixed(4) + ', ' + lon.toFixed(4));
    car = root.Car.create(0, 0, Math.random() * Math.PI * 2);
    car.y = 0;
    hopAnim = 0;
    camera.settled = false;
    root.MP.setFrame(world.frame, lat, lon, world.place);
    root.UI.setPlace(world.place);
    ensureTerrain(); ensureRoads();
    root.UI.showDrive();
    if (!running) { running = true; lastT = 0; requestAnimationFrame(frame); }
  }

  // ---- camera --------------------------------------------------------------
  function updateCamera(dt) {
    var back = 8.5, up = 3.4, ahead = 9;
    // Pull the camera out and up with speed, so fast feels fast.
    var v = Math.abs(car.speed);
    back += v * 0.09; up += v * 0.02;

    var fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    var wantX = car.x - fx * back, wantZ = car.z - fz * back;
    var groundY = root.Terrain.heightAt(world.frame, wantX, wantZ);
    var wantY = (groundY === null ? car.y : Math.max(groundY, car.y)) + up;

    // The parachute drop: start high above and fall into the chase position.
    if (hopAnim < 3.2) {
      var t = Math.min(1, hopAnim / 3.2);
      var ease = 1 - Math.pow(1 - t, 3);
      wantY += (1 - ease) * 900;
      back += (1 - ease) * 40;
    }

    var k = camera.settled ? Math.min(1, dt * 4.5) : 1;
    camera.x += (wantX - camera.x) * k;
    camera.y += (wantY - camera.y) * k;
    camera.z += (wantZ - camera.z) * k;
    camera.settled = true;

    camera.tx = car.x + fx * ahead;
    camera.ty = car.y + 1.4;
    camera.tz = car.z + fz * ahead;
  }

  // ---- frame ---------------------------------------------------------------
  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t; clock += dt; hopAnim += dt;

    var input = controls.sample();

    // Still falling: keep trying to put the landing on a road. The descent is
    // the budget for this — by the time control is handed over, either a road
    // was found or this is genuinely the middle of nowhere.
    if (!placedOnRoad && hopAnim < 2.6) placedOnRoad = snapToRoad();

    // Nothing responds until the ground exists — otherwise the first two
    // seconds are spent driving an invisible car across a void.
    var grounded = root.Terrain.heightAt(world.frame, car.x, car.z) !== null;
    if (grounded && hopAnim > 2.6) {
      root.Car.update(car, input, dt, world.frame);
    } else if (grounded) {
      car.y = root.Terrain.heightAt(world.frame, car.x, car.z);
    }

    updateCamera(dt);
    ensureTerrain(); ensureRoads(); buildPending();
    root.MP.tick(car, dt);

    // Assemble the scene from whatever has actually loaded.
    var scene = { eye: [camera.x, camera.y, camera.z], target: [camera.tx, camera.ty, camera.tz],
                  fov: 60 + Math.min(14, Math.abs(car.speed) * 0.35), far: DRAW_DISTANCE, time: clock,
                  terrain: [], roads: [], buildings: [], water: [], cars: [] };

    for (var tk in world.terrain) {
      var slot = world.terrain[tk];
      if (!slot || !slot.rec) continue;
      scene.terrain.push({ mesh: root.Terrain.meshFor(slot.rec, world.frame), texture: slot.texture });
    }
    for (var rk in world.roads) {
      var r = world.roads[rk];
      if (!r || !r.built) continue;
      scene.roads.push(r.built.roads);
      scene.buildings.push(r.built.buildings);
      scene.water.push(r.built.water);
    }
    if (seaVisible()) scene.water.push(seaMesh());

    scene.cars.push({ x: car.x, y: car.y, z: car.z, yaw: car.yaw, pitch: car.pitch, roll: car.roll,
                      tint: [0.90, 0.24, 0.22] });
    root.MP.ghosts().forEach(function (g) {
      scene.cars.push({ x: g.x, y: g.y, z: g.z, yaw: g.yaw, pitch: 0, roll: 0, tint: g.tint });
    });

    try { root.Render.draw(scene); }
    catch (e) { running = false; root.UI.fatal(e.message); return; }

    root.UI.hud({
      speed: Math.abs(car.speed) * 3.6,
      place: world.place,
      loading: pendingCount(),
      net: root.Net.stats(),
      airborne: car.airborne,
      players: root.MP.count(),
      race: root.MP.raceState(car),
      odometer: car.odometer,
    });
  }

  function pendingCount() {
    var n = 0;
    for (var k in world.terrain) if (world.terrain[k] && world.terrain[k].pending) n++;
    for (var j in world.roads) if (world.roads[j] && world.roads[j].pending) n++;
    return n;
  }

  // ---- search --------------------------------------------------------------
  // Nominatim allows one request per second and explicitly forbids client-side
  // autocomplete, so this fires on submit only — never as you type.
  function search(q) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' + encodeURIComponent(q);
    return root.Net.json(url).then(function (list) {
      return (list || []).map(function (r) {
        return { lat: parseFloat(r.lat), lon: parseFloat(r.lon), name: r.display_name };
      });
    });
  }

  // ---- boot ----------------------------------------------------------------
  function boot() {
    canvas = document.getElementById('view');
    try { root.Render.init(canvas); }
    catch (e) { root.UI.fatal(e.message); return; }

    controls = root.Car.controls(canvas);
    car = root.Car.create(0, 0, 0);
    world.frame = root.Geo.frame(0, 0);

    root.UI.init({
      onHop: hop,
      onSearch: search,
      onPedal: function (which, on) { controls.setPedal(which, on); },
      onRespawn: function () { if (world.frame) hop(world.frame.lat0, world.frame.lon0, world.place); },
      car: function () { return car; },
      frame: function () { return world.frame; },
    });

    root.Sources.load().then(function () {
      root.UI.ready();
    });
    root.MP.init();
  }

  function releaseWorld() {
    for (var tk in world.terrain) {
      var s = world.terrain[tk];
      if (s && s.rec && s.rec.mesh && s.rec.mesh.release) s.rec.mesh.release();
    }
    for (var rk in world.roads) {
      var r = world.roads[rk];
      if (!r || !r.built) continue;
      ['roads', 'buildings', 'water'].forEach(function (m) {
        if (r.built[m] && r.built[m].release) r.built[m].release();
      });
    }
  }

  root.App = {
    boot: boot, hop: hop, search: search, world: world,
    hasHopped: function () { return hopped; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
