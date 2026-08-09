// Anyroad — other cars.
//
// The roads were empty, which is the one thing no real road is. This puts cars
// on them, and the whole design is shaped by the fact that it must cost almost
// nothing: the world is already streaming geometry, decoding elevation PNGs and
// drawing a quarter of a million triangles on a phone.
//
// So there is NO pathfinding and no road graph. Each car is given a WAY — a
// polyline the tile builder already computed in world metres for the ribbon —
// and drives along it at what that class of road is for, in its own lane.
//
// It does not stop at the end of one, though. OSM splits a street into a way
// per block, and dropping a car whenever its way ran out meant traffic
// evaporating every couple of hundred metres in front of you, which reads as
// broken rather than as traffic. A junction IS two ways whose ends touch, so at
// the end of one a car looks for another within a few metres and takes it —
// junction behaviour without a junction table. Cars now last long enough to
// follow, and only leave when they are genuinely out of the world.
//
// Everything the player can actually check is real: they stay on the
// carriageway, keep to their side, slow for what is in front of them, turn at
// junctions, and never appear closer than seventy metres.
//
// Cost per car per frame: advance along a polyline, one terrain height sample,
// one distance check against the player. Thirty of those is not measurable
// against a single road tile's mesh build.
(function (root) {
  'use strict';

  var LEVELS = { none: 0, light: 7, normal: 16, heavy: 30 };
  var SPAWN_NEAR = 70;         // never closer than this to the player
  var SPAWN_FAR = 340;
  // A car you can FOLLOW. The first version dropped a car the instant its way
  // ran out, and OSM splits a single street into a way per block — so cars
  // vanished every couple of hundred metres for no reason the player could
  // see, which reads as broken rather than as traffic. They now turn onto a
  // connecting way at a junction and only leave when they are genuinely out of
  // the world.
  var DESPAWN = 900;
  var LINK_DIST = 16;          // metres — how close two way-ends must be to join
  var MAX_HOPS = 40;           // ways one car may chain before it is retired
  var HIT_LAT = 1.75;          // half a car's width, plus a little
  var HIT_LON = 4.0;           // half a car's length, plus a little

  var cars = [];
  var level = 'normal';
  var cool = 0;
  var seq = 0;

  function clear() { cars.length = 0; cool = 0; }
  function setLevel(l) {
    if (LEVELS[l] === undefined) return;
    level = l;
    var max = LEVELS[level];
    if (cars.length > max) cars.length = max;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // A stable colour per car, so the same one is the same colour for as long as
  // it exists. Real traffic is mostly white, grey, black and silver, with the
  // occasional red — a rainbow of cars reads as a toy box.
  var PAINT = [
    [0.86, 0.87, 0.89], [0.80, 0.81, 0.84], [0.28, 0.30, 0.34], [0.14, 0.15, 0.17],
    [0.55, 0.57, 0.62], [0.72, 0.20, 0.18], [0.20, 0.32, 0.55], [0.35, 0.42, 0.36],
  ];

  // ---- spawning ------------------------------------------------------------
  // Pick a way, pick a point along it far enough away, and check it is clear.
  function trySpawn(car, ctx) {
    var paths = ctx.paths();
    if (!paths.length) return null;
    var p = paths[Math.floor(Math.random() * paths.length)];
    if (!p || p.pts.length < 2) return null;

    var i = Math.floor(Math.random() * (p.pts.length - 1));
    var t = Math.random();
    var a = p.pts[i], b = p.pts[i + 1];
    var x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    var d = Math.hypot(x - car.x, z - car.z);
    if (d < SPAWN_NEAR || d > SPAWN_FAR) return null;

    var dir = Math.random() < 0.5 ? 1 : -1;
    var made = {
      id: ++seq, path: p, i: i, t: t, dir: dir,
      x: x, z: z, y: 0, yaw: 0, vx: 0, vz: 0,
      // To the right of the centreline, in the direction of travel: two cars
      // meeting must pass on the correct sides or the whole thing reads as
      // chaos rather than as traffic.
      //
      // How FAR right matters more than it looks. The player is dropped on the
      // centreline and mostly drives there, so at half*0.5 every oncoming car
      // passed within a car's width of them and clipped them — traffic that
      // hits you for driving normally is not traffic, it is a minefield. Keep
      // as far over as the carriageway allows.
      lane: Math.max(1.0, Math.min(p.half - 1.1, p.half * 0.62)),
      speed: p.cruise * rnd(0.72, 1.0),
      want: p.cruise * rnd(0.72, 1.0),
      tint: PAINT[Math.floor(Math.random() * PAINT.length)],
      hops: 0,
    };
    if (!advance(made, ctx, 0)) return null;
    if (Math.hypot(made.x - car.x, made.z - car.z) < SPAWN_NEAR) return null;
    return made;
  }

  // ---- turning at a junction ----------------------------------------------
  // OSM has no junction table and building one would be a graph pass per tile.
  // But a junction IS two ways whose ends touch, so at the end of a way: look
  // for another whose first or last point is within a few metres, and take it.
  // A scan over the tile's paths sounds expensive and is not — it happens when
  // a car reaches the end of a way, which is once every few hundred metres of
  // driving, not once a frame.
  function linkOn(c, ctx, x, z) {
    if (c.hops >= MAX_HOPS) return false;
    var paths = ctx.paths();
    var best = null, bestD = LINK_DIST * LINK_DIST, bestEnd = 0;
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      if (p === c.path || p.pts.length < 2) continue;
      var head = p.pts[0], tail = p.pts[p.pts.length - 1];
      var dh = (head.x - x) * (head.x - x) + (head.z - z) * (head.z - z);
      var dt2 = (tail.x - x) * (tail.x - x) + (tail.z - z) * (tail.z - z);
      if (dh < bestD) { bestD = dh; best = p; bestEnd = 0; }
      if (dt2 < bestD) { bestD = dt2; best = p; bestEnd = 1; }
    }
    if (!best) return false;
    c.path = best;
    c.hops++;
    // Enter at whichever end we met, driving away from it.
    if (bestEnd === 0) { c.i = 0; c.t = 0; c.dir = 1; }
    else { c.i = best.pts.length - 2; c.t = 1; c.dir = -1; }
    // The new road may be a different class, so take its speed.
    c.want = best.cruise * (0.72 + (c.id % 7) / 25);
    c.lane = Math.max(1.0, Math.min(best.half - 1.1, best.half * 0.62));
    return true;
  }

  // ---- one car, one step ---------------------------------------------------
  // Walk the polyline by however far this frame carries us, then sit in the
  // lane and on the ground. Returns false when there is nowhere left to go.
  function advance(c, ctx, dt) {
    var move = c.speed * dt;
    var guard = 0;
    while (guard++ < 64) {
      var a = c.path.pts[c.i], b = c.path.pts[c.i + 1];
      if (!a || !b) return false;
      var segLen = Math.hypot(b.x - a.x, b.z - a.z) || 0.001;
      var nt = c.t + (c.dir > 0 ? move / segLen : -move / segLen);
      if (nt >= 0 && nt <= 1) { c.t = nt; break; }
      // Off the end of this segment and on to the next.
      if (nt > 1) {
        c.i++; move = (nt - 1) * segLen; c.t = 0;
        if (c.i + 1 >= c.path.pts.length) {
          var e = c.path.pts[c.path.pts.length - 1];
          if (!linkOn(c, ctx, e.x, e.z)) return false;
          move = 0;
        }
      } else {
        c.i--; move = -nt * segLen; c.t = 1;
        if (c.i < 0) {
          var s = c.path.pts[0];
          if (!linkOn(c, ctx, s.x, s.z)) return false;
          move = 0;
        }
      }
    }
    var p0 = c.path.pts[c.i], p1 = c.path.pts[c.i + 1];
    if (!p0 || !p1) return false;
    var cx = p0.x + (p1.x - p0.x) * c.t, cz = p0.z + (p1.z - p0.z) * c.t;
    var dx = (p1.x - p0.x) * c.dir, dz = (p1.z - p0.z) * c.dir;
    var l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // The RIGHT-hand side of the direction of travel. yaw = atan2(dx, dz), so
    // yaw 0 points along +z and turning right goes to +x; the right-hand
    // perpendicular of a heading (dx, dz) is therefore (dz, -dx). Get this
    // backwards and oncoming cars pass you on the wrong side, which reads as
    // chaos rather than as traffic.
    c.x = cx + dz * c.lane;
    c.z = cz - dx * c.lane;
    c.yaw = Math.atan2(dx, dz);
    c.vx = dx * c.speed; c.vz = dz * c.speed;
    var g = ctx.height(c.x, c.z);
    if (g === null) return false;                 // drove off the loaded world
    c.y = g;
    return true;
  }

  // ---- the frame -----------------------------------------------------------
  // Returns a collision with the player, or null.
  function update(car, ctx, dt) {
    if (!ctx || !ctx.height) return null;
    var max = LEVELS[level] || 0;
    var hit = null;

    for (var i = cars.length - 1; i >= 0; i--) {
      var c = cars[i];

      // Dying: parked mid-explosion. No steering, no contact, no advance —
      // just the clock running out on the wreck. It stays in the list so the
      // cars behind still see it as a blocker.
      if (c.dying != null) {
        c.dying += dt;
        if (c.dying > DYING_S) cars.splice(i, 1);
        continue;
      }

      // Slow for whatever is in front. Only against the few cars sharing this
      // way — a full n² sweep for something you register as "the traffic ahead
      // is slowing" is not a trade worth making.
      var block = 0;
      for (var j = 0; j < cars.length; j++) {
        if (j === i) continue;
        var o = cars[j];
        if (o.path !== c.path || o.dir !== c.dir) continue;
        var ax = o.x - c.x, az = o.z - c.z;
        var ahead = ax * Math.sin(c.yaw) + az * Math.cos(c.yaw);
        if (ahead > 0 && ahead < 22 && Math.abs(ax * Math.cos(c.yaw) - az * Math.sin(c.yaw)) < 3) {
          block = Math.max(block, 1 - ahead / 22);
        }
      }
      // …and for the player, who is a car like any other as far as they know.
      var px = car.x - c.x, pz = car.z - c.z;
      var pAhead = px * Math.sin(c.yaw) + pz * Math.cos(c.yaw);
      var pSide = Math.abs(px * Math.cos(c.yaw) - pz * Math.sin(c.yaw));
      if (pAhead > 0 && pAhead < 26 && pSide < 3.2) block = Math.max(block, 1 - pAhead / 26);

      var target = c.want * (1 - block * 0.92);
      c.speed += (target - c.speed) * Math.min(1, dt * 1.6);

      if (!advance(c, ctx, dt)) { cars.splice(i, 1); continue; }
      if (Math.hypot(c.x - car.x, c.z - car.z) > DESPAWN) { cars.splice(i, 1); continue; }

      // Contact. Relative speed is what hurts — being clipped by someone doing
      // your speed in your direction is a scrape, and a head-on is not.
      if (!hit && !car.wrecked && !car.parked) {
        // A car is a BOX, and a round one is why passing in the next lane
        // registered as a collision: centre to centre, two cars in adjacent
        // lanes are about two metres apart, which any circle big enough to
        // cover a car's length also covers. Separate the two axes — across the
        // traffic car's heading and along it — and a pass is a pass.
        var sx = car.x - c.x, sz = car.z - c.z;
        var lon = Math.abs(sx * Math.sin(c.yaw) + sz * Math.cos(c.yaw));
        var lat = Math.abs(sx * Math.cos(c.yaw) - sz * Math.sin(c.yaw));
        // …and a collision needs VERTICAL overlap. The box test lives in x/z,
        // which was fine while nothing left the ground — the moment the wings
        // went on, a plane at altitude "hit" the traffic on the road below it
        // and the damage read as invisible birds. Two car bodies overlap
        // within a couple of metres; a low pass under that is still a crash.
        var alt = Math.abs((car.y || 0) - (c.y || 0));
        if (alt < 2.4 && lat < HIT_LAT && lon < HIT_LON) {
          var relx = c.vx - Math.sin(car.yaw) * car.speed;
          var relz = c.vz - Math.cos(car.yaw) * car.speed;
          var rel = Math.hypot(relx, relz);
          if (rel > 2.5) {
            var damage = Math.min(55, (rel - 2.5) * 1.5);
            car.health = Math.max(0, car.health - damage);
            car.speed *= 0.55;
            c.speed *= 0.5;
            if (car.health <= 0) { car.wrecked = true; car.speed = 0; }
            hit = { damage: damage, rel: rel, health: car.health, x: c.x, z: c.z };
            cars.splice(i, 1);
            continue;
          }
        }
      }
    }

    // Top up. One spawn attempt at a time and on a cooldown, because the
    // attempt can fail (no path, too close, no ground yet) and a while-loop
    // over a failing condition is how a frame budget disappears.
    cool -= dt;
    if (cars.length < max && cool <= 0) {
      cool = 0.25;
      var born = trySpawn(car, ctx);
      if (born) cars.push(born);
    }
    return hit;
  }

  // What the renderer and the mixer need. Rebuilt into the same array — this is
  // consumed immediately and a fresh array 60 times a second is the kind of
  // garbage that shows up as stutter on a phone.
  var draw = [];
  function drawList() {
    draw.length = 0;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      draw.push({ id: c.id, x: c.x, y: c.y, z: c.z, yaw: c.yaw, tint: c.tint,
                  speed: c.speed, vx: c.vx, vz: c.vz, groundY: c.y,
                  // seconds into the death animation, or undefined while alive —
                  // the renderer turns this into flash, shrink and smoke.
                  boom: c.dying });
    }
    return draw;
  }

  // A car takes a few hits before it goes. One-shotting traffic makes the road
  // empty faster than it can be refilled, and an empty road is the thing this
  // module exists to prevent.
  //
  // A killed car does not BLINK OUT — an object that vanishes in one frame
  // reads as a rendering bug, not as a consequence. It enters `dying`: it
  // stops where it is, flashes, burns down and fades over DYING_S, and only
  // then leaves the list. While dying it is a ghost to bolts and to the
  // player's bumper (shooting or crashing into an explosion twice is nonsense)
  // but it still blocks the traffic behind it, because a wreck does.
  var DYING_S = 1.6;
  function shootAt(x, z, radius) {
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.dying != null) continue;                 // already going — a ghost
      if (Math.hypot(c.x - x, c.z - z) > radius + 2.0) continue;
      c.hp = (c.hp === undefined ? 3 : c.hp) - 1;
      c.speed *= 0.6;
      if (c.hp <= 0) { c.dying = 0; c.speed = 0; return { destroyed: true, x: c.x, y: c.y, z: c.z }; }
      return { destroyed: false, x: c.x, y: c.y, z: c.z };
    }
    return null;
  }

  root.Traffic = {
    update: update, drawList: drawList, clear: clear, setLevel: setLevel,
    shootAt: shootAt,
    LEVELS: LEVELS,
    count: function () { return cars.length; },
    level: function () { return level; },
    // Test seam: traffic needs road geometry that only exists once a tile has
    // landed, so a suite needs a way to put one exactly where it can be driven
    // into.
    inject: function (spec) {
      var made = {
        id: ++seq, path: spec.path, i: spec.i || 0, t: spec.t || 0, dir: spec.dir || 1,
        x: spec.x, z: spec.z, y: spec.y || 0, yaw: spec.yaw || 0,
        vx: spec.vx || 0, vz: spec.vz || 0, lane: 0,
        speed: spec.speed || 0, want: spec.speed || 0,
        tint: PAINT[0], hops: 0,
      };
      cars.push(made);
      return made;
    },
  };
})(window);
