// Anyroad — the car.
//
// Arcade physics, not a simulator. The job is that a real road feels good to
// follow: quick to turn at town speed, lazy at motorway speed, and honest about
// hills — a climb should cost you and a descent should run away with you,
// because that is the only way the elevation data you fetched is ever FELT
// rather than merely seen.
//
// The car is not constrained to roads. hop.earth lets you leave the tarmac and
// so does this; off-road just costs grip and top speed.
(function (root) {
  'use strict';

  var GRAVITY = 9.81;

  function create(x, z, yaw) {
    return {
      x: x || 0, z: z || 0, y: 0,
      yaw: yaw || 0, pitch: 0, roll: 0,
      speed: 0,            // metres/second along the heading; negative is reverse
      steer: 0,            // smoothed steering, -1..1
      onRoad: true,
      airborne: false,
      vy: 0,
      odometer: 0,
    };
  }

  // Controls arrive as a plain object so the same physics serve keyboard,
  // touch, and a replayed ghost.
  function blankInput() { return { throttle: 0, brake: 0, steer: 0, handbrake: false }; }

  function update(car, input, dt, frame) {
    dt = Math.min(dt, 0.05);           // a long frame must not teleport the car

    // --- steering: smoothed, and less authoritative the faster you go -------
    var target = Math.max(-1, Math.min(1, input.steer));
    car.steer += (target - car.steer) * Math.min(1, dt * 9);
    var v = Math.abs(car.speed);
    // Full lock at a crawl, about a third of it at motorway speed.
    var authority = 1 / (1 + v * 0.055);
    var turnRate = car.steer * 2.4 * authority * Math.min(1, v / 2.2);
    if (input.handbrake) turnRate *= 1.7;               // slide the back out
    car.yaw += turnRate * dt * (car.speed < 0 ? -1 : 1);

    // --- longitudinal ------------------------------------------------------
    // Tarmac versus everything else. Until the road index existed, onRoad was
    // set once at spawn and never updated, so a field drove exactly like a
    // motorway — which is most of why the world felt weightless.
    var grip = car.onRoad ? 1 : 0.55;
    var power = 11.5 * grip;                            // m/s² at full throttle
    var maxSpeed = (car.onRoad ? 62 : 19);              // ~220 km/h vs ~68 off road
    var accel = 0;

    if (input.throttle > 0) {
      // Falls off as you approach top speed, so acceleration feels like a car
      // rather than a rocket with a speed clamp.
      accel += power * input.throttle * Math.max(0.08, 1 - v / maxSpeed);
    }
    if (input.brake > 0) {
      if (car.speed > 0.4) accel -= 16 * input.brake * grip;
      else accel -= 7 * input.brake;                     // into reverse
    }
    if (input.handbrake) accel -= Math.sign(car.speed) * 9;

    // Drag and rolling resistance.
    accel -= Math.sign(car.speed) * (0.0021 * car.speed * car.speed + (car.onRoad ? 0.45 : 1.9));

    // Hills. pitch>0 means nose up, so gravity pulls backwards along the body.
    accel -= GRAVITY * Math.sin(car.pitch) * 0.85;

    car.speed += accel * dt;
    if (Math.abs(car.speed) < 0.12 && input.throttle === 0) car.speed = 0;
    car.speed = Math.max(-14, Math.min(maxSpeed, car.speed));

    // --- move --------------------------------------------------------------
    var dx = Math.sin(car.yaw) * car.speed * dt;
    var dz = Math.cos(car.yaw) * car.speed * dt;
    car.x += dx; car.z += dz;
    car.odometer += Math.abs(car.speed) * dt;

    // --- sit on the ground --------------------------------------------------
    settle(car, frame, dt);
    return car;
  }

  // Put the car on the terrain and orient it to the slope. Ground height is
  // sampled at four points around the wheelbase rather than one, so the car
  // leans into a camber instead of pivoting about its centre.
  function settle(car, frame, dt) {
    var h = root.Terrain.heightAt(frame, car.x, car.z);
    if (h === null) return;                    // ground not loaded: hold still

    var fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    var rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
    var L = 1.5, W = 0.9;
    function at(ox, oz) {
      var s = root.Terrain.heightAt(frame, car.x + ox, car.z + oz);
      return s === null ? h : s;
    }
    var front = at(fx * L, fz * L), back = at(-fx * L, -fz * L);
    var left = at(-rx * W, -rz * W), right = at(rx * W, rz * W);

    var groundY = (front + back + left + right) / 4;

    // Falling: if the wheels are above the ground, the car is in the air and
    // gravity has it. This is what makes a crest launch you.
    if (car.y > groundY + 0.05) {
      car.airborne = true;
      car.vy -= GRAVITY * dt;
      car.y += car.vy * dt;
      if (car.y <= groundY) { car.y = groundY; car.vy = 0; car.airborne = false; }
    } else {
      // A little suspension travel, so kerbs and ruts do not snap the body.
      car.y += (groundY - car.y) * Math.min(1, dt * 14);
      car.vy = Math.max(0, (groundY - car.y) / Math.max(dt, 0.001));
      car.airborne = false;
      if (car.vy > 6) { car.y = groundY; car.vy = 0; }
    }

    var targetPitch = Math.atan2(front - back, L * 2);
    var targetRoll = Math.atan2(right - left, W * 2);
    car.pitch += (targetPitch - car.pitch) * Math.min(1, dt * 8);
    car.roll += (targetRoll - car.roll) * Math.min(1, dt * 8);
  }

  // ---- input -------------------------------------------------------------
  // Keyboard and touch fill the same structure. Touch steering is a virtual
  // wheel: drag anywhere on the left of the screen and how far you have moved
  // horizontally IS the steering angle, which beats on-screen arrows because
  // your thumb never has to find a target.
  function controls(surface, opts) {
    opts = opts || {};
    var steerEl = opts.steerEl || null;
    var onFirstTouch = opts.onFirstTouch || null;
    var input = blankInput();
    var keys = {};
    var pedal = { throttle: false, brake: false };

    // The driving keys are bound on WINDOW, so they also fire while you are
    // typing in the search box — and space is the handbrake, which called
    // preventDefault() and ate every space you tried to type. "Golden Gate
    // Bridge" came out as "GoldenGateBridge". Arrows were swallowed too, so the
    // caret could not be moved, and W/A/S/D silently held the throttle open
    // behind the landing sheet.
    //
    // So: while the focus is in a text field, the car hears nothing at all.
    function isTyping(el) {
      if (!el) return false;
      var tag = (el.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function onKeyDown(e) {
      if (isTyping(e.target)) return;          // no preventDefault, no key recorded
      var k = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k) >= 0) e.preventDefault();
      keys[k] = true;
    }
    // Key-UP always clears, even mid-typing. Otherwise pressing a key on the
    // canvas and releasing it after focus moved into a field leaves it stuck
    // down forever — a throttle you cannot let go of.
    function onKeyUp(e) {
      var k = e.key.toLowerCase();
      if (!isTyping(e.target) && ['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k) >= 0) e.preventDefault();
      keys[k] = false;
    }
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    // A lost focus must not leave the throttle pinned.
    root.addEventListener('blur', function () { keys = {}; });

    // ---- touch steering ----------------------------------------------------
    // Two ways in, because they suit different hands:
    //
    //  PAD (the visible control) — ABSOLUTE. Where your thumb sits across the
    //    pad IS the steering angle, so the knob under it is a true read-out and
    //    full lock is reachable without a long drag. This is the discoverable
    //    one; it is the thing on screen with a label.
    //  CANVAS left half — RELATIVE to where you first touched, so you can drive
    //    without looking down and without hunting for the pad.
    //
    // Either way the wheel springs back to centre on release.
    var steerTouch = null;    // { id, mode:'pad'|'free', startX }
    var DEAD = 0.05;          // fraction of half-width treated as straight ahead

    function fromPad(clientX) {
      var r = steerEl.getBoundingClientRect();
      var half = r.width / 2;
      var v = (clientX - (r.left + half)) / half;
      if (Math.abs(v) < DEAD) return 0;
      v = (v - Math.sign(v) * DEAD) / (1 - DEAD);
      return Math.max(-1, Math.min(1, v));
    }
    function fromFree(clientX) {
      var span = Math.max(70, surface.clientWidth * 0.20);
      return Math.max(-1, Math.min(1, (clientX - steerTouch.startX) / span));
    }

    function steerDown(e, mode) {
      if (steerTouch) return;
      steerTouch = { id: e.pointerId, mode: mode, startX: e.clientX };
      input.steer = mode === 'pad' ? fromPad(e.clientX) : 0;
      var el = mode === 'pad' ? steerEl : surface;
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
      if (steerEl) steerEl.classList.add('active');
      if (onFirstTouch) { onFirstTouch(); onFirstTouch = null; }
    }
    function steerMove(e) {
      if (!steerTouch || e.pointerId !== steerTouch.id) return;
      input.steer = steerTouch.mode === 'pad' ? fromPad(e.clientX) : fromFree(e.clientX);
    }
    function steerUp(e) {
      if (!steerTouch || e.pointerId !== steerTouch.id) return;
      steerTouch = null; input.steer = 0;
      if (steerEl) steerEl.classList.remove('active');
    }

    if (steerEl) {
      steerEl.addEventListener('pointerdown', function (e) { e.preventDefault(); steerDown(e, 'pad'); });
      steerEl.addEventListener('pointermove', steerMove);
      steerEl.addEventListener('pointerup', steerUp);
      steerEl.addEventListener('pointercancel', steerUp);
    }
    surface.addEventListener('pointerdown', function (e) {
      if (e.clientX < surface.clientWidth / 2) steerDown(e, 'free');
      else if (onFirstTouch) { onFirstTouch(); onFirstTouch = null; }
    });
    surface.addEventListener('pointermove', steerMove);
    surface.addEventListener('pointerup', steerUp);
    surface.addEventListener('pointercancel', steerUp);

    return {
      input: input,
      setPedal: function (which, on) {
        pedal[which] = on;
        if (on && onFirstTouch) { onFirstTouch(); onFirstTouch = null; }
      },
      steering: function () { return steerTouch !== null; },
      // Called once per frame. Touch owns the wheel while a finger is down;
      // otherwise the keyboard does; otherwise it recentres. Written as one
      // explicit precedence chain because the old version mixed a decay term
      // into the touch path and the wheel drifted while you held it.
      sample: function () {
        var kThrottle = (keys['w'] || keys['arrowup']) ? 1 : 0;
        var kBrake = (keys['s'] || keys['arrowdown']) ? 1 : 0;
        var kSteer = ((keys['d'] || keys['arrowright']) ? 1 : 0) - ((keys['a'] || keys['arrowleft']) ? 1 : 0);
        input.throttle = Math.max(kThrottle, pedal.throttle ? 1 : 0);
        input.brake = Math.max(kBrake, pedal.brake ? 1 : 0);
        input.handbrake = !!keys[' '];
        if (steerTouch) { /* the finger owns it */ }
        else if (kSteer !== 0) input.steer = kSteer;
        else input.steer = 0;
        return input;
      },
      keys: keys,
    };
  }

  root.Car = { create: create, update: update, controls: controls, blankInput: blankInput };
})(window);
