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
  var TREE_DISTANCE = 1100;    // metres — scenery only, measured to the tile centre

  // Hard ceilings on how much world is resident, because a metre radius does
  // NOT imply a tile count. Web Mercator tiles shrink with latitude — the same
  // 3 km asks for 25 tiles in Paris and 49 in Edinburgh, and 49 tiles is a
  // quarter of a million triangles, which on a modest device drops the frame
  // rate far enough that the clamped physics step turns the car into a snail.
  // tilesAround() sorts nearest-first, so taking a prefix keeps what matters.
  var MAX_TERRAIN_TILES = 25;
  var MAX_ROAD_TILES = 9;

  // Every GL mesh a built road tile owns. Listed once: a mesh missing from this
  // list is a buffer that is never released, and the leak only shows up as a
  // browser tab that dies after twenty minutes of driving.
  var MESHES = ['roads', 'buildings', 'water', 'trees', 'shadows', 'treeShadows'];

  var world = {
    frame: null,
    terrain: {},     // key -> { rec, mesh, texture }
    roads: {},       // key -> { geom, built }
    wanted: { terrain: [], roads: [] },
    place: '',
  };

  var car = null, controls = null, canvas = null;
  var camera = { x: 0, y: 40, z: -30, tx: 0, ty: 0, tz: 0, settled: false };
  var running = false, lastT = 0, clock = 0, frames = 0;
  var hopAnim = 0;   // seconds of WALL CLOCK since the drop began; drives the descent
  var hopT0 = 0;

  // ---- streaming -----------------------------------------------------------
  // Drop everything the car has driven away from. Without this the resident set
  // only ever grows: drive ten kilometres and you are still drawing — and still
  // holding GL buffers for — the tiles you started on.
  function evict(store, want) {
    var keep = {};
    for (var i = 0; i < want.length; i++) keep[root.Geo.tileKey(want[i])] = 1;
    for (var k in store) {
      if (keep[k]) continue;
      var slot = store[k];
      if (slot && slot.rec && slot.rec.mesh && slot.rec.mesh.release) slot.rec.mesh.release();
      if (slot && slot.built) {
        MESHES.forEach(function (m) {
          if (slot.built[m] && slot.built[m].release) slot.built[m].release();
        });
      }
      delete store[k];
    }
  }

  function ensureTerrain() {
    if (!world.frame) return;
    var want = root.Geo.tilesAround(world.frame, car.x, car.z, TERRAIN_RADIUS, root.Terrain.TILE_ZOOM)
      .slice(0, MAX_TERRAIN_TILES);
    world.wanted.terrain = want;
    evict(world.terrain, want);
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
    var want = root.Geo.tilesAround(world.frame, car.x, car.z, ROAD_RADIUS, root.Roads.TILE_ZOOM)
      .slice(0, MAX_ROAD_TILES);
    world.wanted.roads = want;
    evict(world.roads, want);
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

  // ---- getting unstuck -----------------------------------------------------
  // Some footprints are a horseshoe, an archway, or a courtyard with one gap,
  // and a car that noses into one can be held there for ever: the wall slide
  // turns it along the wall, the cruise drives it back in, and every escape
  // route is another wall. Reverse helps and is why it exists — but there are
  // geometries where reverse is not enough, and there the only honest answer is
  // to put the car back on the nearest road.
  //
  // It uses the SAME road index the car asks "am I on tarmac" with, so it lands
  // on real carriageway rather than a guess, facing along it.
  function nearestRoadPoint(x, z) {
    var best = null;
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.index) continue;
      var hit = root.Roads.nearestRoad(r.built.index, x, z);
      if (hit && (!best || hit.dist < best.dist)) best = hit;
    }
    return best;
  }

  function unstick() {
    if (!world.frame || !car) return false;
    // Look a little wider than the car's own cell: whatever it is wedged in,
    // the way out is usually the road it came off.
    var best = null;
    for (var ring = 0; ring <= 3 && !best; ring++) {
      var step = ring * 45;
      for (var a = 0; a < 8 && !best; a++) {
        var ang = a * Math.PI / 4;
        var hit = nearestRoadPoint(car.x + Math.sin(ang) * step, car.z + Math.cos(ang) * step);
        if (hit && (!best || hit.dist < best.dist)) best = hit;
        if (ring === 0) break;                   // the first probe is the car itself
      }
    }
    if (best) {
      // Facing along the carriageway, in whichever direction is closer to the
      // way the car was already pointing — being rescued into a U-turn is its
      // own small punishment.
      var yaw = Math.atan2(best.dx, best.dz);
      var flip = Math.cos(yaw - car.yaw) < 0;
      root.Car.place(car, best.x, best.z, flip ? yaw + Math.PI : yaw);
    } else {
      // No road data at all: back the car out along its own nose and turn it
      // around. Not elegant, but it is never a dead end.
      root.Car.place(car, car.x - Math.sin(car.yaw) * 7, car.z - Math.cos(car.yaw) * 7, car.yaw + Math.PI);
    }
    var h = root.Terrain.heightAt(world.frame, car.x, car.z);
    if (h !== null) car.y = h;
    root.UI.note(best ? 'Back on the road.' : 'Reversed you out.');
    return true;
  }

  // ---- on tarmac, or not ---------------------------------------------------
  // Recomputed a few times a second rather than every frame: the answer cannot
  // change meaningfully inside 60 ms even at motorway speed, and the query
  // touches every loaded tile's index.
  var roadCheckAt = 0;
  function updateOnRoad(nowMs) {
    if (nowMs - roadCheckAt < 120) return;
    roadCheckAt = nowMs;
    var best = null;
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.index) continue;
      var hit = root.Roads.nearestRoad(r.built.index, car.x, car.z);
      if (hit && (!best || hit.dist < best.dist)) best = hit;
    }
    // No road data loaded at all is NOT "off road" — that would punish the
    // player for our streaming being slow. Only a known-and-distant road is.
    car.onRoad = best ? best.dist <= best.halfWidth + 1.2 : true;
    // Cruise at what this road is for. Off tarmac, a walking-pace-ish amble —
    // it is the same idea as a speed limit, and it makes the class of road you
    // picked actually matter to how the drive feels.
    var target = car.onRoad && best ? best.cruise : 8;
    if (controls && controls.setCruise) controls.setCruise(target);
    car.cruise = target;
  }

  // ---- hitting buildings ---------------------------------------------------
  // One reused array for the candidate wall edges: this runs every frame, and
  // allocating a fresh list of segments 60 times a second is exactly the kind
  // of garbage that shows up as periodic stutter on a phone.
  var wallScratch = [];
  var shake = 0;
  function collideBuildings(dtNow) {
    wallScratch.length = 0;
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.walls) continue;
      root.Roads.nearWalls(r.built.walls, car.x, car.z, wallScratch);
    }
    if (!wallScratch.length) return;
    var hit = root.Car.collide(car, wallScratch, dtNow);
    if (!hit || hit.impact < 0.4) return;
    shake = Math.min(1, Math.max(shake, hit.impact / 16));
    if (hit.damage > 0) root.UI.damage(car.health, hit.crash, hit.damage);
  }

  // ---- the wildlife --------------------------------------------------------
  // animals.js owns the herd and the collision; this owns what a hit MEANS.
  // The context object is the seam: the module never reaches into world state,
  // it asks two questions — where is the ground, and where is the nearest road.
  var beastScratch = [];
  var animalCtx = {
    height: function (x, z) { return root.Terrain.heightAt(world.frame, x, z); },
    nearestRoad: nearestRoadPoint,
    // Is there a building here? Asked at spawn time only. Nothing stops a deer
    // WALKING through a wall — that would be a second collision system for
    // something you see from thirty metres — but a sheep that materialises
    // inside an office block is visible from the road, and in a city that is
    // most of the verge.
    solid: function (x, z) {
      beastScratch.length = 0;
      for (var k in world.roads) {
        var r = world.roads[k];
        if (!r || !r.built || !r.built.walls) continue;
        root.Roads.nearWalls(r.built.walls, x, z, beastScratch);
      }
      for (var i = 0; i < beastScratch.length; i += 4) {
        if (root.Roads.segDist(x, z, beastScratch[i], beastScratch[i + 1],
                               beastScratch[i + 2], beastScratch[i + 3]) < 4) return true;
      }
      return false;
    },
  };

  function wildlife(dt) {
    if (root.Sources.current.wildlife === 'off') { root.Animals.clear(); return; }
    var hit = root.Animals.update(car, animalCtx, dt);
    if (!hit) return;
    shake = Math.min(1, Math.max(shake, 0.25 + hit.damage / 40));
    root.UI.damage(car.health, true, hit.damage);
    root.UI.note(hit.label + '! ' + Math.round(hit.damage) + '% off the windscreen.');
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
      t.built = root.Roads.build(world.frame, t.geom, t.tile);
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
    root.Animals.clear();          // the herd belongs to the place you left
    world.terrain = {}; world.roads = {};
    world.place = label || (lat.toFixed(4) + ', ' + lon.toFixed(4));
    // A hop is a fresh car, so the glass has to be fresh too — otherwise you
    // arrive somewhere new at 100% condition looking through the last place's
    // windscreen.
    car = root.Car.create(0, 0, Math.random() * Math.PI * 2);
    car.y = 0;
    root.UI.clearCracks();
    hopAnim = 0;
    hopT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
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

    // The smoothing lags, and while it catches up the camera can end up inside
    // the car — the near plane then slices the bodywork and you are looking at
    // the inside of the doors. Enforce a hard floor on the chase distance after
    // the lerp rather than trusting it never to get there.
    var MIN_BACK = 4.5;
    var dx = camera.x - car.x, dz = camera.z - car.z;
    var dist = Math.hypot(dx, dz);
    if (dist < MIN_BACK) {
      // Push straight back along the car's heading if we are practically on top
      // of it, otherwise outward along whatever offset we already have.
      var ux = dist > 0.01 ? dx / dist : -fx, uz = dist > 0.01 ? dz / dist : -fz;
      camera.x = car.x + ux * MIN_BACK;
      camera.z = car.z + uz * MIN_BACK;
      camera.y = Math.max(camera.y, car.y + 2.2);
    }

    camera.tx = car.x + fx * ahead;
    camera.ty = car.y + 1.4;
    camera.tz = car.z + fz * ahead;

    // Impact shake. Decays fast — a long shake reads as a broken camera rather
    // than as a crash.
    if (shake > 0.001) {
      var amp = shake * 1.4;
      camera.x += (Math.sin(clock * 71.0) + Math.sin(clock * 37.3)) * amp * 0.5;
      camera.y += Math.sin(clock * 53.7) * amp * 0.35;
      camera.z += (Math.cos(clock * 61.0) + Math.cos(clock * 43.1)) * amp * 0.5;
      shake *= Math.max(0, 1 - dt * 5.5);
    }
  }

  // ---- frame ---------------------------------------------------------------
  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t; clock += dt; frames++;
    // The descent is WALL-CLOCK, not accumulated dt. dt is clamped to 50 ms so a
    // long frame cannot teleport the car, which means on a slow device
    // simulated time runs behind real time — and a three-second intro measured
    // in simulated seconds becomes ten real ones with the controls dead. The
    // rAF timestamp shares performance.now()'s origin, so this is exact.
    hopAnim = (t - hopT0) / 1000;

    // A full-screen panel is open, so nobody is driving. THIS is what made the
    // race sheet feel like it broke the car: the world kept running behind it,
    // the cruise kept the throttle open, and by the time you closed it you had
    // driven blind into a building — bounced off backwards, at a speed the HUD
    // showed as positive. Reading a panel now parks the car.
    controls.setPark(root.UI.panelOpen());
    var input = controls.sample(dt);

    // Still falling: keep trying to put the landing on a road. The descent is
    // the budget for this — by the time control is handed over, either a road
    // was found or this is genuinely the middle of nowhere.
    if (!placedOnRoad && hopAnim < 2.6) placedOnRoad = snapToRoad();

    // Nothing responds until the ground exists — otherwise the first two
    // seconds are spent driving an invisible car across a void.
    var grounded = root.Terrain.heightAt(world.frame, car.x, car.z) !== null;
    if (grounded && hopAnim > 2.6) {
      updateOnRoad(t);
      // SUBSTEP when the car would cross more ground in one frame than the
      // collision test can see. Contact is detected within 0.95 m of a wall, so
      // a single 2 m step can start outside a building and finish outside the
      // far side having never been tested against it — the car tunnels through
      // at exactly the speeds where hitting a building should matter most.
      var travel = Math.abs(car.speed) * dt;
      var steps = Math.min(4, Math.max(1, Math.ceil(travel / 0.6)));
      for (var st = 0; st < steps; st++) {
        root.Car.update(car, input, dt / steps, world.frame);
        collideBuildings(dt / steps);
      }
      wildlife(dt);
    } else if (grounded) {
      car.y = root.Terrain.heightAt(world.frame, car.x, car.z);
    }

    updateCamera(dt);
    ensureTerrain(); ensureRoads(); buildPending();
    root.MP.tick(car, dt);

    // Assemble the scene from whatever has actually loaded.
    var scene = { eye: [camera.x, camera.y, camera.z], target: [camera.tx, camera.ty, camera.tz],
                  fov: 60 + Math.min(14, Math.abs(car.speed) * 0.35), far: DRAW_DISTANCE, time: clock,
                  terrain: [], roads: [], buildings: [], water: [], trees: [], shadows: [],
                  cars: [], animals: root.Animals.drawList() };

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
      if (r.built.shadows) scene.shadows.push(r.built.shadows);
      // Scenery has its own, much shorter draw distance. Roads and buildings
      // are what you navigate by and must reach the horizon; trees at a
      // kilometre are three hundred draw-calls' worth of fill inside the fog
      // band, and dropping them is invisible.
      if (r.built.trees && (!r.built.centre
          || Math.hypot(r.built.centre.x - car.x, r.built.centre.z - car.z) < TREE_DISTANCE)) {
        scene.trees.push(r.built.trees);
        // Their shadows go with them — a shadow with nothing standing in it is
        // worse than no shadow.
        if (r.built.treeShadows) scene.shadows.push(r.built.treeShadows);
      }
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
      // The read-out was |speed| and nothing else, so a car reversing at 36 km/h
      // and a car doing 36 km/h up the road were the same number on the screen.
      // The direction is not a detail — it is the difference between the two
      // things that can be happening.
      reverse: car.speed < -0.3,
      steer: input.steer,
      place: world.place,
      loading: pendingCount(),
      ready: grounded && roadsBuilt() > 0,
      net: root.Net.stats(),
      airborne: car.airborne,
      offRoad: !car.onRoad,
      // Offered, not forced: 2.5 s of full power going nowhere is stuck, and
      // the player decides whether to take the rescue.
      stuck: car.stillT > 2.5,
      beast: root.Animals.alert(),
      health: car.health,
      wrecked: car.wrecked,
      players: root.MP.count(),
      race: root.MP.raceState(car),
      odometer: car.odometer,
    });
  }

  function roadsBuilt() {
    var n = 0;
    for (var k in world.roads) if (world.roads[k] && world.roads[k].built) n++;
    return n;
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

    car = root.Car.create(0, 0, 0);
    world.frame = root.Geo.frame(0, 0);

    // UI.init FIRST: it builds the element map, and the control layer needs the
    // steering pad out of it. Built the other way round, steerEl is undefined
    // and the pad silently does nothing — the one control the redesign exists
    // to make visible.
    root.UI.init({
      onHop: hop,
      onSearch: search,
      onPedal: function (which, on) { controls.setPedal(which, on); },
      onRespawn: function () { if (world.frame) hop(world.frame.lat0, world.frame.lon0, world.place); },
      onRepair: function () { root.Car.repair(car); },
      onUnstick: unstick,
      car: function () { return car; },
      frame: function () { return world.frame; },
    });

    controls = root.Car.controls(canvas, {
      steerEl: root.UI.steerPad(),
      onFirstTouch: function () { root.UI.dismissCoach(); },
      // Tilt is a brokered capability: GifOS does the iOS permission dance and
      // hands back orientation events. The app never touches the sensor itself.
      onTiltEnable: function (cb) { root.Host.motion(cb); },
      onStick: function (st) { root.UI.showStick(st); },
    });
    controls.bindSpeed(function () { return car.speed; });

    root.Sources.load().then(function () {
      applyControlPrefs();
      root.UI.ready();
    });
    root.Sources.onChange(applyControlPrefs);
    root.MP.init();
  }

  function applyControlPrefs() {
    if (!controls) return;
    var scheme = root.Sources.current.scheme || 'wheel';
    controls.setScheme(scheme);
    controls.setMode({
      auto: root.Sources.current.throttle !== 'manual',
      tilt: scheme === 'tilt',
    });
    root.UI.setScheme(scheme);
    // The brake pedal is redundant in stick mode — pulling the stick down IS
    // the brake — but harmless, so it stays for anyone who reaches for it.
    root.UI.setThrottleMode(root.Sources.current.throttle);
  }

  function releaseWorld() {
    for (var tk in world.terrain) {
      var s = world.terrain[tk];
      if (s && s.rec && s.rec.mesh && s.rec.mesh.release) s.rec.mesh.release();
    }
    for (var rk in world.roads) {
      var r = world.roads[rk];
      if (!r || !r.built) continue;
      MESHES.forEach(function (m) {
        if (r.built[m] && r.built[m].release) r.built[m].release();
      });
    }
  }

  root.App = {
    boot: boot, hop: hop, search: search, world: world, unstick: unstick,
    hasHopped: function () { return hopped; },
    car: function () { return car; },
    // Why the car is or is not moving, in one call. The loop has several gates
    // (ground loaded, descent finished, input) and from the outside every one
    // of them looks identical: a stationary car.
    debug: function () {
      return {
        running: running, hopAnim: hopAnim, frames: frames,
        grounded: world.frame ? root.Terrain.heightAt(world.frame, car.x, car.z) !== null : false,
        input: controls ? JSON.parse(JSON.stringify(controls.input)) : null,
        speed: car.speed, x: car.x, z: car.z, y: car.y,
      };
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
