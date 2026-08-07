// Anyroad — the wildlife.
//
// The world you fetch is geometry: roads, buildings, water, a heightfield.
// Nothing in it MOVES, and a road with nothing living near it is a road you
// stop looking at. So the app grows its own traffic — animals scattered along
// whatever road you happen to be on, that graze, wander, panic when a car comes
// at them, and cost you a windscreen if you get it wrong.
//
// Three things shape this:
//
//  1. THEY ARE NOT A TRAP. An animal is only ever spawned well ahead of the car
//     and never on the carriageway itself: it walks INTO the road while you can
//     see it coming. A hazard you cannot avoid is not a hazard, it is a tax.
//  2. THEY ARE CHEAP. A handful alive at a time, plain circle collision, no
//     pathfinding and no per-frame allocation — this runs inside the same frame
//     budget as a streaming 3D world on a phone.
//  3. THEY BELONG TO THE PLACE. Spawning is anchored to the road index the car
//     is already querying, so animals appear where a driver would meet them
//     rather than in the middle of the sea.
//
// They are deliberately NOT published to multiplayer. Every peer would need the
// same herd in the same place, which means either an authority (there is none —
// see mp.js) or a shared seed plus lockstep simulation. What everyone WOULD see
// is a different animal in a different place, which is worse than each player
// having their own. Damage is yours; the road is shared.
(function (root) {
  'use strict';

  // mass drives damage, run/walk are m/s, size scales the drawn mesh, and r is
  // the collision radius in metres.
  // `shape` is the per-kind stretch of the ONE quadruped mesh (see render.js):
  // wide/low/long. It is the difference between a cow and a goose at a tenth of
  // the cost of a second mesh.
  var KINDS = [
    { id: 'deer',  size: 1.00, r: 0.80, mass: 1.00, walk: 1.4, run: 9.5, tint: [0.62, 0.44, 0.28], shape: [1.00, 1.00, 1.00], label: 'A deer' },
    { id: 'sheep', size: 0.74, r: 0.65, mass: 0.65, walk: 0.7, run: 4.2, tint: [0.88, 0.87, 0.82], shape: [1.15, 0.90, 0.95], label: 'A sheep' },
    { id: 'dog',   size: 0.60, r: 0.50, mass: 0.40, walk: 1.8, run: 8.0, tint: [0.52, 0.38, 0.26], shape: [0.85, 0.85, 1.10], label: 'A dog' },
    { id: 'boar',  size: 0.80, r: 0.70, mass: 0.90, walk: 1.1, run: 6.5, tint: [0.26, 0.22, 0.20], shape: [1.20, 0.78, 1.05], label: 'A boar' },
    { id: 'cow',   size: 1.25, r: 1.00, mass: 1.50, walk: 0.6, run: 3.2, tint: [0.80, 0.77, 0.72], shape: [1.15, 1.05, 1.15], label: 'A cow' },
    { id: 'goose', size: 0.42, r: 0.38, mass: 0.18, walk: 1.0, run: 5.0, tint: [0.93, 0.92, 0.88], shape: [0.75, 1.35, 0.80], label: 'A goose' },
  ];

  var MAX = 7;                 // alive at once
  var SPAWN_NEAR = 60;         // metres — never closer than this to the car
  var SPAWN_FAR = 165;
  var DESPAWN = 280;
  var ROAD_MAX = 55;           // metres from a road: further out nobody sees them
  var CROSS_CHANCE = 0.35;     // of a wander decision becoming a road crossing
  var FLEE_AT = 24;            // metres — how close before they bolt
  var HURT_AT = 2.5;           // m/s below which a bump is just a bump

  var herd = [];
  var cool = 0;
  var seq = 0;

  function clear() { herd.length = 0; cool = 0; }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // ---- spawning ------------------------------------------------------------
  // Ahead of the car in a wide cone, at a distance you could still brake from,
  // and deliberately OFF the carriageway. ctx.nearestRoad answers from the same
  // bucketed index the car uses for "am I on tarmac", so this costs a couple of
  // dozen segment tests, not a scan of the tile.
  function trySpawn(car, ctx) {
    var ang = car.yaw + rnd(-1.0, 1.0);
    var d = rnd(SPAWN_NEAR, SPAWN_FAR);
    var x = car.x + Math.sin(ang) * d, z = car.z + Math.cos(ang) * d;

    var near = ctx.nearestRoad(x, z);
    if (near) {
      if (near.dist > ROAD_MAX) return null;
      // On the tarmac already: step it sideways onto the verge. Materialising an
      // animal in the middle of the lane in front of a moving car is the one
      // thing this must never do.
      if (near.dist < near.halfWidth + 2.5) {
        var push = near.halfWidth + rnd(3, 9) - near.dist;
        var side = Math.random() < 0.5 ? 1 : -1;
        x += Math.cos(ang) * push * side;
        z += -Math.sin(ang) * push * side;
      }
    }

    var y = ctx.height(x, z);
    if (y === null) return null;                 // no ground here yet
    if (ctx.solid && ctx.solid(x, z)) return null;   // inside a building

    var kind = pick(KINDS);
    return {
      id: ++seq, kind: kind,
      x: x, z: z, y: y, yaw: rnd(0, Math.PI * 2),
      state: 'graze', t: rnd(1, 4), speed: 0,
      bob: rnd(0, 6.28), tilt: 0, vy: 0, gone: 0,
    };
  }

  // ---- one animal, one step ------------------------------------------------
  function step(a, car, ctx, dt) {
    if (a.state === 'hit') {
      // Knocked: tumble away from the impact and fade. No ragdoll, no gore —
      // it reads as "you hit something", which is all it has to do.
      a.gone += dt;
      a.vy -= 9.81 * dt;
      a.y += a.vy * dt;
      a.x += Math.sin(a.yaw) * a.speed * dt;
      a.z += Math.cos(a.yaw) * a.speed * dt;
      a.speed *= Math.max(0, 1 - dt * 1.4);
      a.tilt += dt * 6.5;
      var g = ctx.height(a.x, a.z);
      if (g !== null && a.y < g) { a.y = g; a.vy = 0; }
      return;
    }

    // Panic. Measured against the car's NOSE rather than its centre, and only
    // when it is actually coming this way — an animal that bolts from a parked
    // car looks broken.
    var dx = a.x - car.x, dz = a.z - car.z;
    var d = Math.hypot(dx, dz);
    var closing = (Math.sin(car.yaw) * dx + Math.cos(car.yaw) * dz) > 0 && Math.abs(car.speed) > 3;
    if (d < FLEE_AT && closing) {
      a.state = 'flee';
      a.t = 2.4;
      // Straight away from the car, which is at right angles to its path as
      // often as not — so this is escapable and so is the animal.
      a.yaw = Math.atan2(dx, dz) + rnd(-0.5, 0.5);
    }

    a.t -= dt;
    if (a.t <= 0) {
      if (a.state === 'flee') { a.state = 'graze'; a.t = rnd(2, 5); }
      else if (a.state === 'cross') { a.state = 'graze'; a.t = rnd(3, 7); }
      else if (Math.random() < CROSS_CHANCE) {
        // Walk across whatever road is nearest, which is the whole hazard: they
        // are on the verge until they are not.
        var road = ctx.nearestRoad(a.x, a.z);
        if (road && road.dist < ROAD_MAX) {
          a.state = 'cross';
          a.t = rnd(4, 9);
          // Aim THROUGH the nearest point of carriageway rather than at the
          // car: they cross the road, they do not charge the player.
          a.yaw = road.dist > 1
            ? Math.atan2(road.x - a.x, road.z - a.z) + rnd(-0.4, 0.4)
            : a.yaw + rnd(-0.5, 0.5);
        } else { a.state = 'graze'; a.t = rnd(2, 6); }
      } else {
        a.state = 'graze'; a.t = rnd(2, 6);
        a.yaw += rnd(-1.6, 1.6);
      }
    }

    var want = a.state === 'flee' ? a.kind.run : a.state === 'cross' ? a.kind.walk * 2.2 : a.kind.walk;
    if (a.state === 'graze' && Math.random() < 0.4 * dt) want = 0;   // heads down
    a.speed += (want - a.speed) * Math.min(1, dt * 3.5);
    a.x += Math.sin(a.yaw) * a.speed * dt;
    a.z += Math.cos(a.yaw) * a.speed * dt;
    var h = ctx.height(a.x, a.z);
    if (h !== null) a.y = h;
    a.bob += dt * (2.5 + a.speed * 1.6);
  }

  // ---- did we hit it? ------------------------------------------------------
  // Distance from the animal to the car's CENTRELINE SEGMENT, not to its centre
  // point: a car is four metres long and a point test lets a deer pass clean
  // through the bonnet at any speed where a frame covers more than a metre.
  function hitTest(a, car) {
    var fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    var ax = car.x - fx * 1.9, az = car.z - fz * 1.9;
    var vx = fx * 3.9, vz = fz * 3.9;
    var t = Math.max(0, Math.min(1, ((a.x - ax) * vx + (a.z - az) * vz) / (vx * vx + vz * vz)));
    var qx = ax + vx * t, qz = az + vz * t;
    return Math.hypot(a.x - qx, a.z - qz) < (0.95 + a.kind.r * 0.75);
  }

  // ---- the frame -----------------------------------------------------------
  // Returns the hit for this frame, or null. The caller owns what a hit MEANS
  // (damage, a crack in the glass, a note) — this owns only the collision.
  function update(car, ctx, dt) {
    if (!ctx || !ctx.height) return null;
    var hit = null, alert = false;

    for (var i = herd.length - 1; i >= 0; i--) {
      var a = herd[i];
      step(a, car, ctx, dt);

      var away = Math.hypot(a.x - car.x, a.z - car.z);
      if (away > DESPAWN || (a.state === 'hit' && a.gone > 2.2)) { herd.splice(i, 1); continue; }
      if (a.state === 'hit') continue;

      var v = Math.abs(car.speed);
      if (!hit && v > HURT_AT && !car.wrecked && hitTest(a, car)) {
        a.state = 'hit';
        a.gone = 0;
        a.vy = 3.0 + v * 0.12;
        a.speed = Math.max(4, v * 0.55);
        a.yaw = car.yaw + rnd(-0.6, 0.6);
        // Mass is what separates a goose from a cow: the same 90 km/h is a
        // scratch or most of a windscreen depending on what you met.
        var damage = Math.min(45, (v - HURT_AT) * 0.72 * a.kind.mass + 2.5 * a.kind.mass);
        car.health = Math.max(0, car.health - damage);
        car.speed *= Math.max(0.35, 1 - 0.10 * a.kind.mass);
        if (car.health <= 0) { car.wrecked = true; car.speed = 0; }
        hit = { kind: a.kind.id, label: a.kind.label, damage: damage, speed: v, health: car.health };
      } else if (away < 55 && v > 6) {
        // Roughly in front of us and close: worth a word in the status line.
        var bx = a.x - car.x, bz = a.z - car.z;
        var ahead = (Math.sin(car.yaw) * bx + Math.cos(car.yaw) * bz) / Math.max(1, away);
        if (ahead > 0.86) alert = true;
      }
    }

    cool -= dt;
    if (herd.length < MAX && cool <= 0) {
      cool = rnd(0.8, 3.0);
      var born = trySpawn(car, ctx);
      if (born) herd.push(born);
    }

    lastAlert = alert;
    return hit;
  }

  var lastAlert = false;

  // What the renderer needs, and nothing else. Rebuilt per frame into the same
  // array — the draw list is consumed immediately and a fresh array 60 times a
  // second is exactly the garbage that shows up as stutter on a phone.
  var draw = [];
  function drawList() {
    draw.length = 0;
    for (var i = 0; i < herd.length; i++) {
      var a = herd[i];
      // Gait: a small vertical bob while walking, and a lean into a run.
      var moving = Math.min(1, a.speed / Math.max(0.5, a.kind.run));
      var bob = a.state === 'hit' ? 0 : Math.sin(a.bob) * 0.045 * a.kind.size * (0.3 + moving);
      // A knocked animal SINKS out of the world rather than fading: fading
      // needs blending, blending needs a sorted transparent pass, and a sorted
      // transparent pass for one tumbling deer is not a trade worth making.
      var sink = a.state === 'hit' ? Math.min(1, a.gone / 2.2) * 1.6 : 0;
      var s = a.kind.size;
      draw.push({
        x: a.x, y: a.y + bob - sink, z: a.z, yaw: a.yaw,
        shape: [a.kind.shape[0] * s, a.kind.shape[1] * s, a.kind.shape[2] * s],
        tint: a.kind.tint,
        tilt: a.state === 'hit' ? a.tilt : moving * 0.10,
        groundY: a.y - sink,
      });
    }
    return draw;
  }

  root.Animals = {
    update: update, drawList: drawList, clear: clear,
    KINDS: KINDS,
    count: function () { return herd.length; },
    alert: function () { return lastAlert; },
    // Test seam: the spawner is anchored to road data that only exists once a
    // tile has landed, so a suite needs a way to put one exactly where it can
    // then drive into it.
    inject: function (a) {
      var kind = a.kind ? (KINDS.filter(function (k) { return k.id === a.kind; })[0] || KINDS[0]) : KINDS[0];
      var made = { id: ++seq, kind: kind, x: a.x, z: a.z, y: a.y || 0, yaw: a.yaw || 0,
                   state: 'graze', t: 99, speed: 0, bob: 0, tilt: 0, vy: 0, gone: 0 };
      herd.push(made);
      return made;
    },
  };
})(window);
