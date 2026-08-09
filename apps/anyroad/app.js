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
    terrainEpoch: 0, // bumped per terrain-tile arrival; stale incomplete builds rebuild against it
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
  //
  // hopGen: which world a tile load belongs to. A hop empties world.terrain and
  // world.roads, but a request already in flight knows nothing about that — it
  // resolves seconds later and writes the OLD city into the NEW maps. One such
  // Paris record arriving during the Tokyo descent was enough to superimpose
  // the two cities: snapToRoad snapped the fresh car onto the Paris way
  // (12,000 km from the Tokyo origin), and from there the streaming want-list —
  // which follows the car — asked for more Paris tiles, evict kept them, and
  // the world locked itself to the wrong city with the right name on the HUD.
  // Every load captures the generation it was launched under and a resolution
  // from a previous generation is discarded unread.
  var hopGen = 0;
  // RETAIN is the hysteresis: a tile stays resident out to this multiple of the
  // load radius after it leaves the want-list. Without it, a car wobbling over
  // a tile boundary destroys and rebuilds the same meshes repeatedly — the data
  // is cached so nothing is re-fetched, but the triangulation is paid again
  // every time, and that is a frame hitch on exactly the boundary you are
  // driving across.
  var RETAIN = 1.5;
  function evict(store, want, keepNear) {
    var keep = {};
    for (var i = 0; i < want.length; i++) keep[root.Geo.tileKey(want[i])] = 1;
    if (keepNear) for (var j = 0; j < keepNear.length; j++) keep[root.Geo.tileKey(keepNear[j])] = 1;
    for (var k in store) {
      if (keep[k]) continue;
      var slot = store[k];
      // NEVER drop a tile that is still in flight. Evicting it deletes the
      // marker, a later frame sees no record and asks for the same tile again,
      // and the answer that does arrive is written into a world that has
      // already moved on. That is the abandonment you can watch on the loading
      // map: a queue that never drains because its work keeps being cancelled.
      if (slot && slot.pending) continue;
      if (slot && slot.rec && slot.rec.mesh && slot.rec.mesh.release) slot.rec.mesh.release();
      if (slot && slot.built) {
        MESHES.forEach(function (m) {
          if (slot.built[m] && slot.built[m].release) slot.built[m].release();
        });
      }
      delete store[k];
    }
  }

  // Where to centre the streaming window. Not on the car — AHEAD of it, by a
  // distance that grows with speed. A disc centred on a car doing 30 m/s spends
  // half its budget on ground already behind the windscreen, and the tile you
  // are about to need is the one at the edge that never gets loaded in time.
  // Capped so that stopping does not leave the world lopsided.
  function lookAhead(radius) {
    var lead = Math.min(radius * 0.55, Math.abs(car.speed) * 18);
    return { x: car.x + Math.sin(car.yaw) * lead, z: car.z + Math.cos(car.yaw) * lead };
  }

  function ensureTerrain() {
    if (!world.frame) return;
    var eye = lookAhead(TERRAIN_RADIUS);
    var want = root.Geo.tilesAround(world.frame, eye.x, eye.z, TERRAIN_RADIUS, root.Terrain.TILE_ZOOM)
      .slice(0, MAX_TERRAIN_TILES);
    world.wanted.terrain = want;
    // Hysteresis is measured from the CAR, not from the look-ahead point:
    // what must not be destroyed is the ground you can still see behind you.
    evict(world.terrain, want,
          root.Geo.tilesAround(world.frame, car.x, car.z, TERRAIN_RADIUS * RETAIN, root.Terrain.TILE_ZOOM)
            .slice(0, Math.round(MAX_TERRAIN_TILES * RETAIN)));
    var launched = 0;
    for (var i = 0; i < want.length && launched < 3; i++) {
      var key = root.Geo.tileKey(want[i]);
      if (world.terrain[key]) continue;
      world.terrain[key] = { pending: true };
      launched++;
      (function (tile, k, gen) {
        root.Terrain.loadTile(tile).then(function (rec) {
          if (gen !== hopGen) return;      // a hop happened; this is the old city
          world.terrain[k] = { rec: rec, tile: tile, mesh: null, texture: null };
          // New ground exists. Any road tile built while THIS was missing has
          // geometry pinned at y≈0 under it — the epoch is what tells
          // buildPending those guesses are now answerable.
          world.terrainEpoch++;
          maybeLoadImagery(tile, k);
        }).catch(function (err) {
          if (gen !== hopGen) return;
          world.terrain[k] = { failed: true, error: err };
          root.UI.note('Elevation tile failed: ' + err.message);
        });
      })(want[i], key, hopGen);
    }
  }

  function ensureRoads() {
    if (!world.frame) return;
    var eye = lookAhead(ROAD_RADIUS);
    var want = root.Geo.tilesAround(world.frame, eye.x, eye.z, ROAD_RADIUS, root.Roads.TILE_ZOOM)
      .slice(0, MAX_ROAD_TILES);
    world.wanted.roads = want;
    evict(world.roads, want,
          root.Geo.tilesAround(world.frame, car.x, car.z, ROAD_RADIUS * RETAIN, root.Roads.TILE_ZOOM)
            .slice(0, Math.round(MAX_ROAD_TILES * RETAIN)));
    var launched = 0;
    for (var i = 0; i < want.length && launched < 2; i++) {
      var key = root.Geo.tileKey(want[i]);
      if (world.roads[key]) continue;
      world.roads[key] = { pending: true, tile: want[i] };
      launched++;
      (function (tile, k, gen) {
        root.Roads.loadTile(tile).then(function (geom) {
          if (gen !== hopGen) return;      // a hop happened; this is the old city
          world.roads[k] = { geom: geom, tile: tile, built: null };
        }).catch(function (err) {
          if (gen !== hopGen) return;
          // A busy Overpass is not a bug and must not look like one: drop the
          // record so the tile is retried once the backoff expires.
          world.roads[k] = err.busy ? null : { failed: true, tile: tile };
          if (err.busy) delete world.roads[k];
          root.UI.note(err.busy ? 'Map server busy — retrying' : 'Roads failed: ' + err.message);
        });
      })(want[i], key, hopGen);
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
    // The snap is a NUDGE, never a journey. Unbounded, it once carried the car
    // to the nearest road ANYWHERE in world.roads — which, when a stale tile
    // from the previous city slipped in mid-descent, was 12,000 km away. Past
    // this radius the honest answer is "you asked for the middle of nowhere",
    // and the car lands exactly where the player pointed.
    var SNAP_MAX = 2000 * 2000;
    var best = null, bestD = SNAP_MAX;
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
        // A rescue that lands you in the pool you just drowned in is not a
        // rescue. Deep water only: a ford is a legitimate place to be put.
        if (hit) { var w = waterAtPoint(hit.x, hit.z); if (w && w.deep) hit = null; }
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
      // around. Not elegant, but it is never a dead end. Walk backwards until
      // the ground is dry, so "reversed you out" of a pool means out of it.
      var bx = car.x, bz = car.z, back = 0;
      do {
        back += 7;
        bx = car.x - Math.sin(car.yaw) * back;
        bz = car.z - Math.cos(car.yaw) * back;
      } while (back < 70 && (function () { var w = waterAtPoint(bx, bz); return w && w.deep; })());
      root.Car.place(car, bx, bz, car.yaw + Math.PI);
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
    car.surface = best && car.onRoad ? best.surface : 2;   // off road IS rough
    car.street = best && car.onRoad ? (best.name || '') : '';
    watchStreets(nowMs);
    // Cruise at what this road is for. Off tarmac, a walking-pace-ish amble —
    // it is the same idea as a speed limit, and it makes the class of road you
    // picked actually matter to how the drive feels.
    var target = car.onRoad && best ? best.cruise : 8;
    if (controls && controls.setCruise) controls.setCruise(target);
    car.cruise = target;
  }

  // ---- street names --------------------------------------------------------
  // OSM has carried `name` on every way in every response the app has ever
  // made — the parser took the class, the surface and the lane count and left
  // it. Driving down a road that cannot tell you what it is called is a map
  // with the labels torn off.
  //
  // Two different things: the road you are ON, which comes free with the "am I
  // on tarmac" query the car already makes, and the roads you PASS, which is
  // every other named way whose carriageway comes within a junction's reach.
  var streetScratch = [];
  var announced = {};      // name -> when we last called it out
  var passing = [];        // { name, side, at } — the last few, for the HUD

  function watchStreets(nowMs) {
    // Only worth doing while actually moving: a parked car should not narrate
    // the same junction to you every second.
    if (Math.abs(car.speed) < 2) return;
    streetScratch.length = 0;
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.index) continue;
      root.Roads.namesNear(r.built.index, car.x, car.z, 26, streetScratch);
    }
    for (var i = 0; i < streetScratch.length; i++) {
      var s = streetScratch[i];
      if (!s.name || s.name === car.street) continue;
      // Once per road per half minute. Without this a long junction, or a road
      // running parallel to yours, reads out continuously.
      if (announced[s.name] && nowMs - announced[s.name] < 30000) continue;
      announced[s.name] = nowMs;
      // Which side it went by, in the car's own frame.
      var dx = s.x - car.x, dz = s.z - car.z;
      var right = Math.sin(car.yaw + Math.PI / 2) * dx + Math.cos(car.yaw + Math.PI / 2) * dz;
      passing.push({ name: s.name, side: right >= 0 ? 1 : -1, at: nowMs });
      if (passing.length > 3) passing.shift();
    }
    // Forget roads we left a long way behind, so coming back around announces
    // them again.
    if (Object.keys(announced).length > 60) announced = {};
  }

  // ---- hitting buildings ---------------------------------------------------
  // One reused array for the candidate wall edges: this runs every frame, and
  // allocating a fresh list of segments 60 times a second is exactly the kind
  // of garbage that shows up as periodic stutter on a phone.
  var wallScratch = [];
  var shake = 0;

  // Is the car IN water? Asked per substep, right before the physics, so a fast
  // car cannot skip across a pool between frames the way it used to tunnel
  // through walls.
  // Is this SPOT water? Same index as updateInWater, but for an arbitrary
  // point — the rescue needs it to avoid dropping you back in.
  function waterAtPoint(x, z) {
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.wet) continue;
      var w = root.Roads.waterAt(r.built.wet, x, z);
      if (w) return w;
    }
    return null;
  }

  // COMING THROUGH THE ROOF.
  //
  // Falling into somebody's living room is the best accident this game has, and
  // it was happening silently — you simply appeared indoors, because building
  // collision is skipped above 4 m and the roof is not a wall. A crash you do
  // not hear or feel is not a crash, it is a teleport.
  //
  // So the moment the descent crosses a roof plane is caught explicitly and
  // paid for: slates and dust, a hole punched where you went in, the whole
  // screen shaking, and enough of your speed left behind that you arrive inside
  // rather than through the floor.
  var lastY = null;
  function roofTopAt(x, z) {
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.roofs) continue;
      var hit = root.Roads.roofAt(r.built.roofs, x, z);
      if (hit) {
        var g = root.Terrain.heightAt(world.frame, x, z);
        return (g === null ? car.y : g) + hit.height;
      }
    }
    return null;
  }

  function checkRoofStrike() {
    if (!world.frame) { lastY = car.y; return; }
    if (!(car.flying || car.falling) || car.vy >= 0) { lastY = car.y; return; }
    var top = roofTopAt(car.x, car.z);
    if (top === null) { lastY = car.y; return; }
    if (lastY !== null && lastY > top && car.y <= top) {
      var fall = Math.min(1, Math.abs(car.vy) / 26);
      // Slates first, then the structural thud underneath it.
      root.Sound.glass();
      root.Sound.crash(0.6 + fall * 0.4);
      shake = Math.min(1, Math.max(shake, 0.55 + fall * 0.45));
      // Debris: a ring of dust punched outward from the hole, plus the hole.
      for (var a = 0; a < 7; a++) {
        var ang = (a / 7) * Math.PI * 2, rad = 1.2 + a * 0.35;
        puff(car.x + Math.cos(ang) * rad, top + 0.4, car.z + Math.sin(ang) * rad, 1.1 + fall * 1.3);
      }
      puff(car.x, top + 0.9, car.z, 3.2 + fall * 2.0);
      scorches.push({ x: car.x, y: top + 0.05, z: car.z, nx: 0, nz: 1, age: 0 });
      if (scorches.length > MAX_SCORCH) scorches.shift();
      // Going through a roof COSTS you. Most of the fall energy is spent on the
      // structure, so you drop into the room rather than continuing to the
      // cellar — and the aircraft, if you still had one, does not survive it.
      car.vy *= 0.28;
      car.speed *= 0.45;
      car.flying = false; car.falling = true;
      car.health = Math.max(0, car.health - (14 + fall * 46));
      if (car.health <= 0) { car.wrecked = true; car.speed = 0; }
      root.UI.note('Straight through the roof.');
    }
    lastY = car.y;
  }

  function updateInWater() {
    var hit = null;
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.wet) continue;
      hit = root.Roads.waterAt(r.built.wet, car.x, car.z);
      if (hit) break;
    }
    var was = car.inWater;
    car.inWater = !!hit;
    car.deepWater = !!(hit && hit.deep);
    // One splash on ENTRY, scaled by how fast you hit it — arriving at 100 km/h
    // is a different noise from rolling in. The deep variant carries the gulp
    // underneath it, which is the only warning you get after the fact.
    if (car.inWater && !was) {
      root.Sound.splash(Math.min(1, Math.abs(car.speed) / 22), car.deepWater);
      root.UI.note(car.deepWater
        ? 'In deep — you are not driving out of this one.'
        : 'Through the shallows.');
    }
  }

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
    if (hit.crash) root.Sound.crash(Math.min(1, hit.impact / 18));
    else if (hit.impact > 1) root.Sound.scrape();
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
    // They make noise whether or not you hit them — an animal you can HEAR at
    // the roadside before you see it is a warning, which is what turns them
    // from a tax into a hazard.
    var heard = root.Animals.nextCall(car);
    if (heard) root.Sound.call(heard.kind, car, heard.x, heard.z);
    if (!hit) return;
    shake = Math.min(1, Math.max(shake, 0.25 + hit.damage / 40));
    root.Sound.thump(hit.kind, Math.min(1, hit.damage / 25));
    root.UI.damage(car.health, true, hit.damage);
    root.UI.note(hit.label + '! ' + Math.round(hit.damage) + '% off the windscreen.');
  }

  // ---- other cars ----------------------------------------------------------
  // traffic.js needs somewhere to drive: the world-space polylines the tile
  // builder already computed for the road ribbons. Rebuilt per call rather than
  // cached because tiles come and go, and it is a handful of array pushes.
  var pathScratch = [];
  var trafficCtx = {
    height: function (x, z) { return root.Terrain.heightAt(world.frame, x, z); },
    paths: function () {
      pathScratch.length = 0;
      for (var k in world.roads) {
        var r = world.roads[k];
        if (!r || !r.built || !r.built.paths) continue;
        for (var i = 0; i < r.built.paths.length; i++) pathScratch.push(r.built.paths[i]);
      }
      return pathScratch;
    },
  };

  // ---- the blaster ---------------------------------------------------------
  // The gun owns the bolts; this owns what a hit MEANS. Everything it needs is
  // a function: the same wall index the car collides with, and the two things
  // that can be shot.
  var blasterCtx = {
    height: function (x, z) { return root.Terrain.heightAt(world.frame, x, z); },
    walls: function (x, z, out) {
      for (var k in world.roads) {
        var r = world.roads[k];
        if (!r || !r.built || !r.built.walls) continue;
        root.Roads.nearWalls(r.built.walls, x, z, out);
      }
      return out;
    },
    animals: function (x, z, rad) { return root.Animals.shootAt(x, z, rad); },
    traffic: function (x, z, rad) { return root.Traffic.shootAt(x, z, rad); },
    // Other PLAYERS, from the same ghost list the renderer draws. A ghost is
    // an interpolated position, so this is aiming at where you SEE them —
    // which is the only fair thing to aim at, and means a laggy friend is hard
    // to hit rather than mysteriously invulnerable.
    players: function (x, z, rad) {
      var gs = root.MP.ghosts();
      for (var i = 0; i < gs.length; i++) {
        var g = gs[i];
        if (Math.hypot(g.x - x, g.z - z) < rad + 1.4) return g;
      }
      return null;
    },
  };

  function blaster(input, dt) {
    root.Blaster.setEnabled(root.Sources.current.blaster !== 'off');
    if (input.fire && !car.wrecked && root.Blaster.fire(car)) root.Sound.blast();
    var events = root.Blaster.update(car, blasterCtx, dt);
    if (!events) return;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      root.Sound.zap(e.kind);
      if (e.kind === 'player') {
        // Claim it on my own row; their browser decides what it costs them.
        root.MP.shoot(e.what.id);
        root.UI.note('Hit ' + (e.what.name || 'them') + '.');
      } else if (e.kind === 'animal') {
        hits.animals++;
        root.UI.note(e.what.label + ' — cleared.');
      } else if (e.kind === 'wreck') {
        hits.cars++;
        puff(e.x, e.y, e.z, 1.0);
      } else if (e.kind === 'car') {
        puff(e.x, e.y, e.z, 0.4);
      } else if (e.kind === 'wall') {
        // The shot LANDS somewhere, and the wall remembers. Capped and FIFO —
        // sixty marks is a fight's worth, and the mark is the point, not a
        // damage model.
        scorches.push({ x: e.x, y: e.y, z: e.z, nx: e.nx || 0, nz: e.nz || 1, age: 0 });
        if (scorches.length > MAX_SCORCH) scorches.shift();
        puff(e.x, e.y, e.z, 0.35);
      } else if (e.kind === 'ground') {
        puff(e.x, e.y + 0.3, e.z, 0.3);
      }
    }
  }
  var hits = { animals: 0, cars: 0 };

  // ---- impact debris -------------------------------------------------------
  // Scorches persist (a mark is a record); puffs are the half-second of smoke
  // and spark that makes a hit read as a HIT rather than a disappearance.
  var MAX_SCORCH = 60;
  var scorches = [];
  var puffs = [];
  function puff(x, y, z, size) {
    if (puffs.length > 24) puffs.shift();
    puffs.push({ x: x, y: y, z: z, size: size, age: 0 });
  }
  function updatePuffs(dt) {
    for (var i = puffs.length - 1; i >= 0; i--) {
      puffs[i].age += dt;
      if (puffs[i].age > 0.9) puffs.splice(i, 1);
    }
    for (var s = 0; s < scorches.length; s++) if (scorches[s].age < 1) scorches[s].age += dt;
  }

  function otherCars(dt) {
    root.Traffic.setLevel(root.Sources.current.traffic);
    var hit = root.Traffic.update(car, trafficCtx, dt);
    root.Sound.traffic(car, root.Traffic.drawList());
    if (!hit) return;
    shake = Math.min(1, Math.max(shake, 0.35 + hit.damage / 40));
    root.Sound.crash(Math.min(1, hit.rel / 22));
    root.UI.damage(car.health, true, hit.damage);
    root.UI.note('Collision — ' + Math.round(hit.damage) + '% condition gone.');
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
  //
  // A build is not necessarily the LAST build. terrainReadyFor only vouches
  // for the ground under the tile's own square, but `out geom` ways run far
  // beyond it — over terrain that may not exist yet, where every ground sample
  // is a guess pinned at y≈0. Those guesses used to be permanent: the city
  // past the loaded ground was baked underground, terrain later loaded in
  // above the corpse, and the world ended at a hard line of grass with the
  // street names still working. A tile that built with misses now says so
  // (built.incomplete), and is rebuilt whenever new terrain has arrived since
  // — still one build per frame, and it converges: a rebuild with zero misses
  // is final.
  function buildPending() {
    for (var k in world.roads) {
      var t = world.roads[k];
      if (!t || t.pending || t.failed) continue;
      if (t.built && !(t.built.incomplete && t.epoch !== world.terrainEpoch) && !t.coverStale) continue;
      if (!t.built && !terrainReadyFor(t.tile)) continue;
      if (t.built) {
        MESHES.forEach(function (m) {
          if (t.built[m] && t.built[m].release) t.built[m].release();
        });
      }
      t.built = root.Roads.build(world.frame, t.geom, t.tile, coverAt);
      t.epoch = world.terrainEpoch;
      t.coverStale = false;
      return;
    }
  }

  // ---- optional satellite drape -------------------------------------------
  // Re-drape EVERYTHING that is already loaded. Without this, turning the
  // satellite on did nothing you could see: imagery was requested at exactly
  // one moment — when a terrain tile finished loading — so switching source
  // afterwards left every tile around you with the drape it was born with, and
  // the only way to see the change was to hop somewhere else. "I added a key
  // and nothing improved" was the honest report of a real bug.
  function redrape() {
    var src = root.Sources.imagery;
    imagery.tried = 0; imagery.ok = 0; imagery.failed = '';
    for (var k in world.terrain) {
      var slot = world.terrain[k];
      if (!slot || !slot.rec) continue;
      if (!src || !src.api) {
        // Back to stylised — and back to OSM-only planting. A forest grown
        // from a photograph the player has since switched off would be
        // scenery with no source; the stale-mark sends those tiles back
        // through the scatter without their masks.
        slot.texture = null;
        if (slot.cover) { slot.cover = null; markCoverStale(slot.tile); }
        continue;
      }
      maybeLoadImagery(slot.tile, k);
    }
  }

  // What the drape is actually doing, so the HUD can say so. A satellite layer
  // that silently does nothing is indistinguishable from one that is switched
  // off, and that is exactly how this failed.
  var imagery = { tried: 0, ok: 0, failed: '' };

  // Hand a road tile's buildings the photograph they are standing in, so their
  // ROOFS can take their colour from it. Roads are z15 and terrain z14, so a
  // road tile is always exactly one quadrant of ONE terrain tile — there is no
  // ambiguity about which image a building belongs to, and no need to split a
  // mesh across two of them.
  //
  // Deliberately NOT cached: the rectangle is in world metres, and world
  // metres are relative to a frame that moves on every hop and every re-pin.
  // A cached rect outlives its frame and drapes the roofs of one city in the
  // photograph of another; recomputing it is two multiplies per tile per frame.
  function drapedBuildings(r) {
    var built = r.built.buildings;
    var src = root.Sources.imagery;
    if (!built || !src || !src.api || !r.tile || !world.frame) return built;
    var px = r.tile.x >> 1, py = r.tile.y >> 1;
    var slot = world.terrain[root.Geo.tileKey({ z: root.Terrain.TILE_ZOOM, x: px, y: py })];
    if (!slot || !slot.texture) return built;      // no photo yet: procedural roofs
    var b = root.Geo.tileBounds(root.Terrain.TILE_ZOOM, px, py);
    var nw = world.frame.toWorld(b.north, b.west);
    var se = world.frame.toWorld(b.south, b.east);
    return { mesh: built, texture: slot.texture, rect: [nw.x, nw.z, se.x, se.z] };
  }

  // ---- satellite tree cover -------------------------------------------------
  // "Areas that are clearly forests from the satellite photos" should grow
  // forest — even where OSM never had the polygon, which in most of the world
  // is most of the forest. The photograph is already here (the drape), so the
  // classifier is one 64x64 readback per imagery tile: canopy is the DARK
  // green — darker than grass, darker than crops, green where water is blue
  // and shadow is grey. The mask feeds the same scatter that plants tagged
  // woodland (roads.js), and OSM tags still win wherever they exist: this
  // only speaks where the map is silent.
  var COVER_N = 64;
  var coverCanvas = null;
  function treeCoverOf(bmp) {
    try {
      if (!coverCanvas) coverCanvas = document.createElement('canvas');
      coverCanvas.width = COVER_N; coverCanvas.height = COVER_N;
      var g = coverCanvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0, COVER_N, COVER_N);
      var d = g.getImageData(0, 0, COVER_N, COVER_N).data;
      var mask = new Uint8Array(COVER_N * COVER_N), any = 0;
      for (var i = 0; i < mask.length; i++) {
        var r = d[i * 4], gr = d[i * 4 + 1], b = d[i * 4 + 2];
        var lum = 0.30 * r + 0.59 * gr + 0.11 * b;
        if (gr > r + 4 && gr > b + 10 && lum < 118) { mask[i] = 1; any = 1; }
      }
      return any ? mask : null;      // an empty mask changes nothing — skip the rebuilds
    } catch (e) { return null; }     // a zero-size or unreadable bitmap is not a forest
  }

  // Tree cover under a world point, 0..1, or null where no photograph has
  // arrived (and the scatter falls back to guessing). 3x3 cells averaged so a
  // single dark pixel is a fraction, not a forest.
  function coverAt(x, z) {
    if (!world.frame) return null;
    var geo = world.frame.toGeo(x, z);
    var tz = root.Terrain.TILE_ZOOM;
    var tx = root.Geo.lonToTileX(geo.lon, tz), ty = root.Geo.latToTileY(geo.lat, tz);
    var slot = world.terrain[root.Geo.tileKey({ z: tz, x: Math.floor(tx), y: Math.floor(ty) })];
    if (!slot || !slot.cover) return null;
    var cx = Math.min(COVER_N - 1, Math.floor((tx - Math.floor(tx)) * COVER_N));
    var cy = Math.min(COVER_N - 1, Math.floor((ty - Math.floor(ty)) * COVER_N));
    var sum = 0, n = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var px = cx + dx, py = cy + dy;
      if (px < 0 || py < 0 || px >= COVER_N || py >= COVER_N) continue;
      sum += slot.cover[py * COVER_N + px]; n++;
    }
    return n ? sum / n : null;
  }

  // A photograph just landed, so every road tile under it was built against a
  // world that did not yet know where its trees were. Mark exactly those tiles
  // (a z15 road tile sits under the z14 imagery tile at x>>1, y>>1) and let
  // buildPending rebuild them at its usual one-per-frame pace.
  function markCoverStale(tile) {
    for (var k in world.roads) {
      var t = world.roads[k];
      if (t && t.tile && (t.tile.x >> 1) === tile.x && (t.tile.y >> 1) === tile.y) t.coverStale = true;
    }
  }

  function maybeLoadImagery(tile, key) {
    var src = root.Sources.imagery;
    if (!src || !src.api || !tile) return;
    imagery.tried++;
    root.Net.apiBitmap(src.api, root.Sources.expand(src.path, tile)).then(function (bmp) {
      var slot = world.terrain[key];
      if (!slot || !slot.rec) return;
      imagery.ok++;
      slot.cover = treeCoverOf(bmp);   // read the pixels BEFORE the GPU owns them
      slot.texture = root.Render.textureFor('img' + key, bmp);
      if (slot.cover) markCoverStale(tile);
      if (bmp.close) bmp.close();
    }).catch(function (err) {
      // Imagery is a bonus and must never block the drive — but it must not
      // fail SILENTLY either. An empty catch here is why a missing key, a
      // rejected request and a working satellite layer all looked identical
      // from the driver's seat.
      imagery.failed = (err && err.message) || 'request failed';
      if (imagery.tried - imagery.ok <= 1) {
        root.UI.note('Satellite imagery: ' + imagery.failed + ' — check the key in GifOS Settings.');
      }
    });
  }

  // ---- hop -----------------------------------------------------------------
  var hopped = false, placedOnRoad = false;
  var lastImagery = 'none';

  function hop(lat, lon, label) {
    hopped = true;
    hopGen++;                      // orphan every tile load still in flight
    placedOnRoad = false;
    world.sea = null;
    world.frame = root.Geo.frame(lat, lon);
    // Meshes hold GL buffers; a hop throws the whole world away, so they have to
    // be released explicitly or every hop leaks a few hundred MB of VRAM.
    releaseWorld();
    root.Terrain.clear();
    root.Animals.clear();          // the herd belongs to the place you left
    announced = {}; passing.length = 0;
    root.Traffic.clear();          // …and so does the traffic
    root.Blaster.clear();
    // The first tap on a place IS the gesture a browser requires before it will
    // start an audio graph. Nothing is primed before the player has asked for
    // anything, which is also why there is no sound on the landing sheet.
    root.Sound.unlock(root.Sources.current.sound);
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
    root.UI.rememberPlace(lat, lon, world.place);
    // Say it BEFORE the empty world arrives. A regional Overpass answers 200
    // with no elements outside its extract, which renders as terrain with no
    // roads on it — indistinguishable from open country, and the player has no
    // way to guess that the source they picked simply does not hold this part
    // of the planet.
    if (!root.Sources.roadsCover(lat, lon)) {
      root.UI.note('The road source "' + root.Sources.roads.name + '" does not cover here — ' +
                   'there will be no roads. Pick a worldwide one in Settings.');
    }
    ensureTerrain(); ensureRoads();
    root.UI.showDrive();
    if (!running) { running = true; lastT = 0; requestAnimationFrame(frame); }
  }

  // What every road tile around the car is doing, for the loading map. The
  // want-list is already sorted nearest-first by the streamer, so this costs a
  // walk over at most MAX_ROAD_TILES entries.
  //
  // Worth the pixels because the loader is otherwise INVISIBLE: through a
  // windscreen, "empty countryside" and "third in a queue behind two city
  // tiles" look exactly the same, and the player has no way to choose the
  // direction that will actually have roads in it.
  function tileMap() {
    if (!world.frame) return null;
    var here = root.Geo.tilesAround(world.frame, car.x, car.z, 1, root.Roads.TILE_ZOOM)[0];
    if (!here) return null;
    var want = world.wanted.roads, out = [];
    for (var i = 0; i < want.length; i++) {
      var t = want[i], k = root.Geo.tileKey(t), slot = world.roads[k];
      var st = 'want', detail = 2;
      if (slot && slot.built) {
        // READY IS NOT ONE THING. A tile whose query was too expensive comes
        // back with less in it — and the worst case, roads with no buildings,
        // looks from the driving seat exactly like a street of empty lots.
        // Calling that "done" in green was a lie the map was telling.
        detail = slot.geom && slot.geom.detail != null ? slot.geom.detail : 2;
        st = detail >= 2 ? 'ready' : (detail === 1 ? 'partial' : 'roadsonly');
      }
      else if (slot && slot.geom) st = 'building';
      else if (slot && slot.failed) st = 'failed';
      else if (slot && slot.pending) st = 'loading';
      var q = root.Roads.tileState(k);
      out.push({ dx: t.x - here.x, dy: t.y - here.y, state: st, detail: detail,
                 queue: q ? q.queue : -1, running: !!(q && q.running),
                 mirror: q ? q.mirror : '' });
    }
    out.heading = car.yaw;
    return out;
  }

  // ---- filling the map in around you ---------------------------------------
  // Only ever writes to DISK. A filled tile is parsed geometry in IndexedDB; it
  // is NOT made resident, gets no GL buffers and is never drawn, so the frame
  // cost of this is zero and the phone-killing residency caps are untouched.
  //
  // Politeness first, and it is not optional with donated servers: this runs
  // only when the network is completely idle — nothing queued, nothing in
  // flight, no mirror backing us off — and asks for exactly one tile at a time.
  // The player's own driving always wins, because their tiles are already in
  // the queue this waits on.
  var fillRing = 2;
  function backgroundFill() {
    if (!world.frame || !root.Sources.fillsAhead()) return;
    var st = root.Net.stats();
    if (st.pending || st.active || st.backoffMs) return;
    if (root.Roads.cacheBytes() >= root.Sources.offlineBytes()) return;
    // Work outwards in rings from the car, taking the first tile that is
    // neither resident nor already on disk.
    var want = root.Geo.tilesAround(world.frame, car.x, car.z,
                                    ROAD_RADIUS * fillRing, root.Roads.TILE_ZOOM);
    for (var i = 0; i < want.length; i++) {
      var t = want[i], k = root.Geo.tileKey(t);
      if (world.roads[k] || root.Roads.isCached(k)) continue;
      root.Roads.loadTile(t).catch(function () {});
      return;
    }
    // That whole ring is on disk. Widen, up to a sane horizon.
    fillRing = Math.min(8, fillRing + 1);
  }

  // Repair, and get out of whatever you were repaired in. Deliberately app-side
  // rather than inside the button's handler: repairing IN a pool is a loop —
  // the panel closes, the water check runs on the very next substep, and you
  // drown again in two and a half seconds — so the fix is part of what
  // "repair" means, not a detail of one button, and it has to be testable
  // without clicking anything.
  // Is the car WEDGED — inside a building, or hard against one? Repairing in
  // there is the same trap as repairing in a pool: the panel closes, you are
  // still surrounded by wall, and the next nudge kills you again. Crashing
  // through a roof and ending up in someone's living room is a great thing to
  // happen; being unable to leave is not.
  var wedgeScratch = [];
  function wedgedInGeometry() {
    wedgeScratch.length = 0;
    for (var k in world.roads) {
      var r = world.roads[k];
      if (!r || !r.built || !r.built.walls) continue;
      root.Roads.nearWalls(r.built.walls, car.x, car.z, wedgeScratch);
    }
    for (var w = 0; w < wedgeScratch.length; w += 4) {
      if (root.Roads.segDist(car.x, car.z, wedgeScratch[w], wedgeScratch[w + 1],
                             wedgeScratch[w + 2], wedgeScratch[w + 3]) < 2.6) return true;
    }
    return false;
  }

  function repairAndRescue() {
    var wasWet = car.inWater;
    var wasWedged = !wasWet && wedgedInGeometry();
    root.Car.repair(car);
    if (wasWet || wasWedged) {
      unstick();
      car.inWater = false; car.deepWater = false; car.sink = 0;
      root.UI.note(wasWet ? 'Fished you out.' : 'Towed you out.');
    }
    return { rescued: wasWet || wasWedged, wedged: wasWedged,
             x: car.x, z: car.z, inWater: car.inWater };
  }

  // Wings on, wings off. Two separate decisions: taking off is free, and
  // deciding to be a car again at 300 m is not — you fall, and the landing is
  // judged on how fast you were going down when you arrived.
  function toggleFlight() {
    if (car.flying) {
      root.Car.beCar(car);
      root.UI.note('Wings off — brace.');
      root.Sound.thump && root.Sound.thump(0.5);
    } else if (!car.falling && !car.wrecked) {
      root.Car.takeOff(car);
      root.UI.note('Up. GO climbs, BRAKE descends, steer to turn.');
    }
    return !!car.flying;
  }

  // ---- put the flag on a road ----------------------------------------------
  // The flag is dropped on a random bearing at the distance the player asked
  // for, which means it lands wherever it lands: a lake, a cliff, the wrong
  // side of a river. A race nobody can finish is not a race.
  //
  // So the tile under the flag is FETCHED — one query, straight away, rather
  // than waiting for somebody to drive fifteen kilometres — and the flag is
  // moved to the nearest road in it. Once, and marked, because the race record
  // is shared read-write and two players nudging the flag at each other would
  // never settle.
  var flagAsked = null, flagBusy = false;
  var fireworks = 0;          // seconds of celebration left to draw
  function snapRaceFlag() {
    if (!world.frame || !root.MP.hasRace() || flagBusy) return;
    var st = root.MP.raceState(car);
    if (!st || st.snapped) return;
    var geo = world.frame.toGeo(st.finish.x, st.finish.z);
    var tile = { z: root.Roads.TILE_ZOOM,
                 x: Math.floor(root.Geo.lonToTileX(geo.lon, root.Roads.TILE_ZOOM)),
                 y: Math.floor(root.Geo.latToTileY(geo.lat, root.Roads.TILE_ZOOM)) };
    var key = root.Geo.tileKey(tile);
    if (flagAsked === key && !root.Roads.isCached(key)) return;   // already asked, still coming
    flagAsked = key;
    flagBusy = true;
    root.Roads.loadTile(tile).then(function (geom) {
      var idx = root.Roads.buildIndex(world.frame, geom);
      var hit = root.Roads.nearestRoad(idx, st.finish.x, st.finish.z);
      // Only accept a road that is actually NEAR the flag. nearestRoad answers
      // from whatever is in the index, and an index with one lonely track in a
      // corner would drag the flag half a tile.
      if (hit && hit.dist < 400) {
        root.MP.snapFinish(world.frame.toGeo(hit.x, hit.z)).then(function (moved) {
          if (moved) root.UI.note('Flag moved to the nearest road — ' + Math.round(hit.dist) + ' m.');
        });
      } else {
        // Nothing driveable within 400 m: leave it where it is rather than
        // teleport it somewhere arbitrary, and say so.
        root.MP.snapFinish(geo);
        root.UI.note('No road near the flag — it stays where it fell.');
      }
    }).catch(function () { /* busy server: try again next time round */ })
      .then(function () { flagBusy = false; });
  }

  // ---- camera --------------------------------------------------------------
  function updateCamera(dt) {
    var back = 8.5, up = 3.4, ahead = 9;
    // Pull the camera out and up with speed, so fast feels fast.
    var v = Math.abs(car.speed);
    back += v * 0.09; up += v * 0.02;
    // FLYING IS A DIFFERENT CHASE. A car's camera is tuned for 15 m/s near the
    // ground; an aeroplane cruises at 46 and the same rules put it a speck away
    // down the middle of the screen. Hold it closer, a little above, and stop
    // scaling the distance with speed — in the air, speed is read from the
    // ground going past, not from how small your own aircraft looks.
    if (car.flying || car.falling) {
      back = 13; up = 4.2; ahead = 26;
    }

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

    // DO NOT LET THE HILL EAT THE CAR. The chase camera sits a fixed height
    // above the ground UNDER ITSELF, which is fine on the flat and wrong on
    // every incline: driving uphill, the slope between the camera and the car
    // is higher than both, so the ground swallows the car and you are steering
    // a dirt bank. Driving downhill the same thing happens over the crest.
    //
    // March the line of sight and lift the eye until it clears. For a sample at
    // fraction t whose ground is g, the ray height there is
    // lerp(camY, targetY, t), so the eye must satisfy
    //   camY >= (g + clearance - targetY * t) / (1 - t)
    // and the answer is the largest such requirement along the line.
    var aimY = car.y + 1.4;
    var need = camera.y;
    // No terrain lifting while airborne: the ground is hundreds of metres below
    // and the clearance walk would shove the eye up with it for no reason.
    for (var si = 1; si <= 6 && !(car.flying || car.falling); si++) {
      var t2 = si / 8;                        // stop short of the car itself
      var sx = camera.x + (car.x - camera.x) * t2;
      var sz = camera.z + (car.z - camera.z) * t2;
      var gy = root.Terrain.heightAt(world.frame, sx, sz);
      if (gy === null) continue;
      var req = (gy + 1.6 - aimY * t2) / (1 - t2);
      if (req > need) need = req;
    }
    // Rise fast, fall slow: snapping down the far side of a crest is a lurch,
    // while being slow to rise means a frame or two of looking at soil.
    var upRate = need > camera.y ? Math.min(1, dt * 9) : Math.min(1, dt * 2.2);
    camera.y += (need - camera.y) * upRate;

    camera.tx = car.x + fx * ahead;
    camera.ty = aimY;
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

    // BIRD'S EYE is the same camera, flown up — not an inset. The old canvas
    // minimap was a second renderer with a second copy of the world's read
    // path, and it rotted exactly as second copies do (it walked the road
    // index at the previous stride and painted garbage at 8 Hz, which is why
    // it both lost the roads and ate the frame rate). This is one world, one
    // renderer, one more place to put the eye: pull up until the streets read
    // as a map, keep driving, pull back down. Heading-up follows from the
    // geometry for free — the eye trails the car's yaw, so forward stays
    // roughly screen-up, which is the only orientation a windscreen instrument
    // makes sense in.
    // COCKPIT: the eye goes where the driver's head is — behind the wheel,
    // just right of centre, at eye height — and looks along the bonnet. The
    // near plane would slice through the car's own bodywork from in here, so
    // the player's car is not drawn in this view at all (see the scene build).
    cockK += ((viewName() === 'cockpit' ? 1 : 0) - cockK) * Math.min(1, dt * 5.0);
    if (cockK > 0.001) {
      var rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);     // the car's right
      var cex = car.x + fx * 0.15 + rx * 0.34;
      var cez = car.z + fz * 0.15 + rz * 0.34;
      var cey = car.y + 1.18;
      camera.x += (cex - camera.x) * cockK;
      camera.y += (cey - camera.y) * cockK;
      camera.z += (cez - camera.z) * cockK;
      camera.tx += ((car.x + fx * 40) - camera.tx) * cockK;
      camera.ty += ((car.y + 1.05) - camera.ty) * cockK;
      camera.tz += ((car.z + fz * 40) - camera.tz) * cockK;
    }

    birdK += ((viewName() === 'bird' ? 1 : 0) - birdK) * Math.min(1, dt * 2.4);
    if (birdK > 0.001) {
      var H = 235 + v * 2.2;                 // higher when faster: see further ahead
      var bex = car.x - fx * H * 0.30, bez = car.z - fz * H * 0.30;
      var bey = car.y + H;
      var btx = car.x + fx * H * 0.20, btz = car.z + fz * H * 0.20;
      camera.x += (bex - camera.x) * birdK;
      camera.y += (bey - camera.y) * birdK;
      camera.z += (bez - camera.z) * birdK;
      camera.tx += (btx - camera.tx) * birdK;
      camera.ty += (car.y - camera.ty) * birdK;
      camera.tz += (btz - camera.tz) * birdK;
    }
  }
  // THREE points of view on one button: chase, cockpit, bird. Each is the same
  // camera in a different place — there is still exactly one renderer and one
  // world, which is the rule that killed the old inset minimap.
  var VIEWS = ['chase', 'cockpit', 'bird'];
  var viewIdx = 0, birdK = 0, cockK = 0;
  function cycleView() {
    viewIdx = (viewIdx + 1) % VIEWS.length;
    return VIEWS[viewIdx];
  }
  function viewName() { return VIEWS[viewIdx]; }

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
        // Asked per SUBSTEP, before the physics: a fast car must not skip
        // across an 8 m pool between frames the way it used to tunnel walls.
        //
        // This call went missing once already — the function survived a later
        // edit and its only caller did not, so every pool on the map was
        // decorative for a day. Anything that reads "you are in water" and is
        // not wired into the loop is dead code that looks alive.
        // Ground hazards stop applying once you are properly off it. Below a
        // few metres they still do, which is what makes a low pass over a
        // street genuinely risky rather than a cheat.
        var airborne = (car.flying || car.falling) && car.agl > 4;
        if (!airborne) updateInWater(); else { car.inWater = false; car.deepWater = false; }
        root.Car.update(car, input, dt / steps, world.frame);
        checkRoofStrike();
        if (!airborne) collideBuildings(dt / steps);
      }
      wildlife(dt);
      otherCars(dt);
      blaster(input, dt);
      root.Sound.drive({
        speed: car.speed, throttle: input.throttle, brake: input.brake > 0,
        onRoad: car.onRoad, surface: car.surface || 0, idle: Math.abs(car.speed) < 0.3,
      });
    } else if (grounded) {
      car.y = root.Terrain.heightAt(world.frame, car.x, car.z);
    }

    updateCamera(dt);
    ensureTerrain(); ensureRoads(); buildPending(); backgroundFill();
    root.MP.tick(car, dt);
    snapRaceFlag();

    // Assemble the scene from whatever has actually loaded.
    var scene = { eye: [camera.x, camera.y, camera.z], target: [camera.tx, camera.ty, camera.tz],
                  fov: 60 + Math.min(14, Math.abs(car.speed) * 0.35), far: DRAW_DISTANCE, time: clock,
                  terrain: [], roads: [], buildings: [], water: [], pools: [], trees: [], shadows: [],
                  cars: [], animals: root.Animals.drawList(),
                  bolts: root.Blaster.drawList() };

    for (var tk in world.terrain) {
      var slot = world.terrain[tk];
      if (!slot || !slot.rec) continue;
      scene.terrain.push({ mesh: root.Terrain.meshFor(slot.rec, world.frame), texture: slot.texture });
    }
    for (var rk in world.roads) {
      var r = world.roads[rk];
      if (!r || !r.built) continue;
      scene.roads.push(r.built.roads);
      scene.buildings.push(drapedBuildings(r));
      scene.water.push(r.built.water);
      if (r.built.pools) scene.pools.push(r.built.pools);
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

    // The flag stands in the world for as long as the race exists — it does not
    // vanish when YOU finish, because the other drivers are still coming and
    // because "where was it?" is a fair question afterwards. It moves only when
    // a new race drops a new one.
    var rs = root.MP.hasRace() ? root.MP.raceState(car) : null;
    if (rs && rs.finish) {
      var fy = root.Terrain.heightAt(world.frame, rs.finish.x, rs.finish.z);
      var fdx = rs.finish.x - camera.x, fdz = rs.finish.z - camera.z;
      var fdist = Math.hypot(fdx, fdz);
      scene.flag = { x: rs.finish.x, y: (fy === null ? car.y : fy), z: rs.finish.z,
                     spin: clock * 0.25,
                     // Both clamped: at close range they are their true size,
                     // and far away they hold a legible width instead of
                     // dwindling to a hairline.
                     beam: Math.max(1, Math.min(9, fdist / 150)),
                     grow: Math.max(1, Math.min(3.2, fdist / 420)) };
      // Fireworks over the flag when somebody crosses the line. Reuses the puff
      // system, thrown upward and outward so it reads as a burst rather than
      // as smoke.
      if (fireworks > 0) {
        fireworks -= dt;
        if (Math.random() < 0.55) {
          var fa = Math.random() * Math.PI * 2, fr = Math.random() * 26;
          puff(scene.flag.x + Math.cos(fa) * fr,
               scene.flag.y + 30 + Math.random() * 55,
               scene.flag.z + Math.sin(fa) * fr, 5 + Math.random() * 7);
        }
      }
    } else {
      fireworks = 0;
    }

    // From the driver's seat you are INSIDE the bodywork, and the near plane
    // would cut it into a wall of triangles across the view. Drop your own car
    // once the blend is mostly there; everyone else's stays.
    if (cockK < 0.6) {
      scene.cars.push({ x: car.x, y: car.y, z: car.z, yaw: car.yaw, pitch: car.pitch, roll: car.roll,
                        tint: [0.90, 0.24, 0.22], blaster: root.Blaster.enabled(),
                        plane: car.flying || car.falling,
                        // The shadow falls where the GROUND is, not where the
                        // aircraft is. Without this it defaulted to s0.y and
                        // flew along at altitude with the plane, which reads as
                        // the shadow being in the wrong place because it is.
                        groundY: root.Terrain.heightAt(world.frame, car.x, car.z) });
    }
    root.MP.ghosts().forEach(function (g) {
      scene.cars.push({ x: g.x, y: g.y, z: g.z, yaw: g.yaw, pitch: 0, roll: 0, tint: g.tint });
    });
    // Traffic goes through the same list as the players' cars: one mesh, one
    // program, one matrix each. Thirty of them is thirty uniform writes.
    root.Traffic.drawList().forEach(function (t) {
      var entry = { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: 0, roll: 0,
                    tint: t.tint, groundY: t.groundY };
      if (t.boom != null) {
        // The death, staged: a flash (emissive spike), then the wreck chars,
        // shrinks and sinks until the ground takes it. Scale and emit ride the
        // car program's existing uShape/uEmit, so this costs two uniforms.
        var k = Math.min(1, t.boom / 1.6);
        entry.emit = Math.max(0, 1 - t.boom / 0.22);            // the flash
        entry.scale = Math.max(0.05, 1 - k * k * 0.95);          // then the fade
        entry.y -= k * k * 1.1;
        entry.tint = [0.16 + entry.emit * 0.8, 0.14 + entry.emit * 0.5, 0.13];
        if (t.boom < 0.7 && Math.random() < 0.5) puff(t.x, t.y + 1.2, t.z, 0.7);
      }
      scene.cars.push(entry);
    });

    // Decals: scorch marks on the walls, and the smoke of anything currently
    // exploding. One batched draw; corners are computed here because only the
    // app knows the camera (for billboards) and the wall normals (for marks).
    updatePuffs(dt);
    if (scorches.length || puffs.length) {
      var decals = scene.decals = [];
      for (var sc2 = 0; sc2 < scorches.length; sc2++) {
        var s2 = scorches[sc2];
        // A quad on the wall plane, nudged out along the normal so it wins the
        // depth test against the face it marks.
        var rx = -s2.nz, rz = s2.nx, hw = 0.62;
        decals.push({
          corners: [
            s2.x - rx * hw + s2.nx * 0.06, s2.y - hw * 0.9, s2.z - rz * hw + s2.nz * 0.06,
            s2.x + rx * hw + s2.nx * 0.06, s2.y - hw * 0.9, s2.z + rz * hw + s2.nz * 0.06,
            s2.x + rx * hw + s2.nx * 0.06, s2.y + hw * 1.1, s2.z + rz * hw + s2.nz * 0.06,
            s2.x - rx * hw + s2.nx * 0.06, s2.y + hw * 1.1, s2.z - rz * hw + s2.nz * 0.06,
          ],
          tint: [0.07, 0.06, 0.06], alpha: 0.78 * Math.min(1, s2.age * 6),
        });
      }
      if (puffs.length) {
        // Billboards need the camera's right/up; derive once per frame.
        var vdx = camera.tx - camera.x, vdy = camera.ty - camera.y, vdz = camera.tz - camera.z;
        var vl = Math.hypot(vdx, vdy, vdz) || 1; vdx /= vl; vdy /= vl; vdz /= vl;
        var rx2 = vdz, ry2 = 0, rz2 = -vdx;
        var rl = Math.hypot(rx2, rz2) || 1; rx2 /= rl; rz2 /= rl;
        var ux = vdy * rz2 - vdz * ry2, uy = vdz * rx2 - vdx * rz2, uz = vdx * ry2 - vdy * rx2;
        for (var pf = 0; pf < puffs.length; pf++) {
          var p2 = puffs[pf];
          var t2 = p2.age / 0.9;
          var r2 = (0.5 + t2 * 2.2) * p2.size;
          var heat = Math.max(0, 1 - p2.age / 0.18);            // orange first, smoke after
          decals.push({
            corners: [
              p2.x - rx2 * r2 - ux * r2, p2.y - ry2 * r2 - uy * r2, p2.z - rz2 * r2 - uz * r2,
              p2.x + rx2 * r2 - ux * r2, p2.y + ry2 * r2 - uy * r2, p2.z + rz2 * r2 - uz * r2,
              p2.x + rx2 * r2 + ux * r2, p2.y + ry2 * r2 + uy * r2, p2.z + rz2 * r2 + uz * r2,
              p2.x - rx2 * r2 + ux * r2, p2.y - ry2 * r2 + uy * r2, p2.z - rz2 * r2 + uz * r2,
            ],
            tint: [0.24 + heat * 0.75, 0.22 + heat * 0.36, 0.20], alpha: 0.55 * (1 - t2),
          });
        }
      }
    }

    try { root.Render.draw(scene); }
    catch (e) { running = false; root.UI.fatal(e.message); return; }

    root.UI.hud({
      speed: Math.abs(car.speed) * 3.6,
      // The read-out was |speed| and nothing else, so a car reversing at 36 km/h
      // and a car doing 36 km/h up the road were the same number on the screen.
      // The direction is not a detail — it is the difference between the two
      // things that can be happening.
      reverse: car.speed < -0.3,
      halted: car.halted,
      steer: input.steer,
      place: world.place,
      street: car.street || '',
      passing: passing,
      loading: pendingCount(),
      tiles: tileMap(),
      view: viewName(),
      flying: car.flying, falling: car.falling, agl: Math.round(car.agl || 0),
      ready: grounded && roadsBuilt() > 0,
      net: root.Net.stats(),
      airborne: car.airborne,
      offRoad: !car.onRoad,
      // Offered, not forced: 2.5 s of full power going nowhere is stuck, and
      // the player decides whether to take the rescue.
      stuck: car.stillT > 2.5,
      beast: root.Animals.alert(),
      blaster: root.Blaster.enabled(),
      cleared: hits.animals,
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
      onRepair: repairAndRescue,
      onUnstick: unstick,
      onView: cycleView,
      onFly: toggleFlight,
      car: function () { return car; },
      frame: function () { return world.frame; },
      world: function () { return world; },
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
      // The saved offline size has to reach the cache before the first tile
      // lands, or the first drive of every session evicts against the default.
      root.Roads.setCacheBudget(root.Sources.offlineBytes());
      root.UI.ready();
    });
    root.Sources.onChange(applyControlPrefs);
    // The imagery source is the one setting that must reach tiles ALREADY on
    // the ground — see redrape().
    root.Sources.onChange(function () {
      var now = root.Sources.current.imagery;
      if (now === lastImagery) return;
      lastImagery = now;
      redrape();
    });
    root.MP.init();
    // Somebody shot at you. Your browser decides what that costs — nobody has
    // authority over your car but you. Small, on purpose.
    // ANYONE finishing is an event for EVERYONE. Fireworks over the flag, a
    // fanfare, and a line saying who it was and where they came.
    root.MP.onFinish(function (f) {
      var ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][f.place] || (f.place + 'th');
      root.Sound.fanfare(f.place);
      fireworks = 3.4;
      root.UI.note(f.mine
        ? 'FINISHED — ' + ord + ' in ' + (f.ms / 1000).toFixed(1) + 's'
        : f.name + ' finished ' + ord + ' — ' + (f.ms / 1000).toFixed(1) + 's');
    });
    root.MP.onHit(function (n) {
      if (car.wrecked) return;
      car.health = Math.max(0, car.health - 6 * n);
      root.UI.bulletHole();
      root.Sound.zap('player');
      shake = Math.min(1, Math.max(shake, 0.30));
      if (car.health <= 0) { car.wrecked = true; car.speed = 0; }
    });
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
    repairAndRescue: repairAndRescue, toggleFlight: toggleFlight,
    redrape: redrape,
    imagery: function () {
      return { source: root.Sources.current.imagery, tried: imagery.tried,
               ok: imagery.ok, failed: imagery.failed,
               draped: Object.keys(world.terrain).filter(function (k) {
                 return world.terrain[k] && world.terrain[k].texture;
               }).length };
    },
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
        camera: { x: camera.x, y: camera.y, z: camera.z },
        view: viewName(),
      flying: car.flying, falling: car.falling, agl: Math.round(car.agl || 0), birdK: birdK, cockK: cockK,
        scorches: scorches.length, puffs: puffs.length,
      };
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
