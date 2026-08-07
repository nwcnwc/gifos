// Anyroad — the blaster.
//
// A gun on the roof, firing straight ahead. It is ON by default, and the reason
// it earns that is not spectacle: the wildlife is a hazard you are supposed to
// avoid, and until now the only two outcomes were avoiding it or paying for it.
// This is the third one. An animal that has been shot is off the road before
// you reach it, so the blaster is a way of DEALING with the hazard rather than
// a way of ignoring it — you still have to see the deer, and you still have to
// do something about it in time.
//
// Three decisions worth writing down:
//
//  1. PROJECTILES, NOT HITSCAN. A hitscan blaster is one line of code and no
//     fun: nothing crosses the gap, so there is no lead, no travel, and no
//     reason to fire early. A bolt at 180 m/s takes most of a second to reach
//     something at the edge of the fog, which is exactly the window in which
//     the decision is interesting.
//  2. IT STOPS AT WALLS. The bolt is tested against the same wall index the
//     car collides with, so it cannot shoot through a building — the world
//     already knows what is solid and a second answer would be a second
//     answer to disagree with.
//  3. TRAFFIC TAKES SEVERAL. One-shotting cars empties the road faster than it
//     refills, and an empty road is what traffic.js exists to prevent.
(function (root) {
  'use strict';

  var SPEED = 180;             // m/s
  var RANGE = 260;             // metres before a bolt gives up
  var COOLDOWN = 0.16;         // seconds between shots
  var MAX_BOLTS = 24;
  var HIT_R = 1.6;             // metres of forgiveness on a hit

  var bolts = [];
  var cool = 0;
  var enabled = true;
  var seq = 0;

  function setEnabled(on) { enabled = !!on; if (!enabled) bolts.length = 0; }
  function isEnabled() { return enabled; }
  function clear() { bolts.length = 0; cool = 0; }

  // The muzzle: on the roof, a little forward of centre, which is where the
  // barrel is drawn (see render.js). Bolts have to LEAVE from where the gun is
  // or the first thing you notice is that they do not.
  function muzzle(car) {
    return {
      x: car.x + Math.sin(car.yaw) * 1.1,
      y: car.y + 1.72,
      z: car.z + Math.cos(car.yaw) * 1.1,
    };
  }

  function fire(car) {
    if (!enabled || cool > 0 || !car || car.wrecked) return false;
    if (bolts.length >= MAX_BOLTS) return false;
    cool = COOLDOWN;
    var m = muzzle(car);
    // The car's own speed is added, because a bolt that ignores it visibly
    // trails behind the car at motorway speed.
    var vf = SPEED + Math.max(0, car.speed);
    bolts.push({
      id: ++seq,
      x: m.x, y: m.y, z: m.z,
      vx: Math.sin(car.yaw) * vf, vz: Math.cos(car.yaw) * vf,
      yaw: car.yaw, travelled: 0,
    });
    return true;
  }

  // Did this step cross a wall? The bolt moves a long way in one frame at
  // 180 m/s, so this is a SEGMENT against the wall segments — a point test at
  // the new position would shoot straight through any building thinner than
  // one frame of travel.
  function hitWall(x0, z0, x1, z1, walls) {
    for (var i = 0; i < walls.length; i += 4) {
      var ax = walls[i], az = walls[i + 1], bx = walls[i + 2], bz = walls[i + 3];
      var rx = x1 - x0, rz = z1 - z0;
      var sx = bx - ax, sz = bz - az;
      var den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;              // parallel
      var t = ((ax - x0) * sz - (az - z0) * sx) / den;
      var u = ((ax - x0) * rz - (az - z0) * rx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        // The wall's normal, facing the side the shot came FROM — a scorch
        // mark laid on the far face of the wall is a mark nobody ever sees.
        var nl = Math.hypot(sx, sz) || 1;
        var nx = sz / nl, nz = -sx / nl;
        if (nx * (x0 - ax) + nz * (z0 - az) < 0) { nx = -nx; nz = -nz; }
        return { x: x0 + rx * t, z: z0 + rz * t, nx: nx, nz: nz };
      }
    }
    return null;
  }

  var wallScratch = [];

  // Returns the list of things that happened this frame, for the caller to turn
  // into noise and notes. Owning the consequences here would mean this module
  // knowing about the HUD, which is the one thing it does not need to know.
  function update(car, ctx, dt) {
    if (cool > 0) cool -= dt;
    if (!bolts.length) return null;
    var events = null;

    for (var i = bolts.length - 1; i >= 0; i--) {
      var b = bolts[i];
      var nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
      var step = Math.hypot(nx - b.x, nz - b.z);
      b.travelled += step;

      var hit = null;

      // Animals first — they are the reason the gun is here.
      if (ctx.animals) {
        var beast = ctx.animals(nx, nz, HIT_R);
        if (beast) hit = { kind: 'animal', what: beast, x: beast.x, y: beast.y + 0.8, z: beast.z };
      }
      // Then traffic.
      if (!hit && ctx.traffic) {
        var veh = ctx.traffic(nx, nz, HIT_R);
        if (veh) hit = { kind: veh.destroyed ? 'wreck' : 'car', what: veh, x: veh.x, y: veh.y + 0.9, z: veh.z };
      }
      // Then the world. Buildings and tree trunks are the same index.
      if (!hit && ctx.walls) {
        wallScratch.length = 0;
        ctx.walls(b.x, b.z, wallScratch);
        ctx.walls(nx, nz, wallScratch);
        var w = hitWall(b.x, b.z, nx, nz, wallScratch);
        if (w) hit = { kind: 'wall', x: w.x, y: b.y, z: w.z, nx: w.nx, nz: w.nz };
      }
      // And the ground, if you are shooting downhill.
      if (!hit && ctx.height) {
        var g = ctx.height(nx, nz);
        if (g !== null && b.y < g + 0.2) hit = { kind: 'ground', x: nx, y: g, z: nz };
      }

      if (hit) {
        bolts.splice(i, 1);
        (events || (events = [])).push(hit);
        continue;
      }
      b.x = nx; b.z = nz;
      if (b.travelled > RANGE) bolts.splice(i, 1);
    }
    return events;
  }

  // Rebuilt into the same array — consumed immediately, and a fresh array 60
  // times a second is the garbage that shows up as stutter on a phone.
  var draw = [];
  function drawList() {
    draw.length = 0;
    for (var i = 0; i < bolts.length; i++) {
      draw.push({ x: bolts[i].x, y: bolts[i].y, z: bolts[i].z, yaw: bolts[i].yaw });
    }
    return draw;
  }

  root.Blaster = {
    fire: fire, update: update, drawList: drawList, clear: clear,
    setEnabled: setEnabled, enabled: isEnabled,
    count: function () { return bolts.length; },
    muzzle: muzzle,
    SPEED: SPEED, RANGE: RANGE,
  };
})(window);
