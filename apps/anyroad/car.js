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
      health: 100,
      wrecked: false,
      contactT: 0,        // seconds of unbroken contact with a wall
      hurtCool: 0,        // seconds until another impact may be charged
      revArm: 0,          // seconds the brake has been held at a standstill
      stillT: 0,          // seconds of going nowhere — what "stuck" is read from
    };
  }

  // ---- hitting things -----------------------------------------------------
  // The car is approximated by three circles down its centreline rather than one
  // — a single circle either sticks out past the bumpers or lets the nose clip
  // into a corner before anything registers.
  //
  // ONE number decides what kind of crash it was: the closing speed along the
  // wall's normal. That already encodes both things worth distinguishing — a
  // fast but glancing hit has a small normal component and should scrape, a
  // square hit at the same speed has a large one and should hurt. No separate
  // angle test is needed, and none of the edge cases that come with one.
  var BODY_R = 0.95;
  var SAMPLE = [1.55, 0, -1.55];      // metres along the heading
  var CRASH_AT = 4.5;                 // m/s closing: below this you bounce off
  var HURT_AT = 3.0;                  // m/s closing: below this, no damage at all

  function collide(car, walls, dt) {
    if (!walls || !walls.length) { car.contactT = 0; return null; }
    var fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    var pushX = 0, pushZ = 0, best = 0, bnx = 0, bnz = 0, touched = false;

    for (var s = 0; s < SAMPLE.length; s++) {
      var px = car.x + fx * SAMPLE[s], pz = car.z + fz * SAMPLE[s];
      for (var i = 0; i < walls.length; i += 4) {
        var ax = walls[i], az = walls[i + 1], bx = walls[i + 2], bz = walls[i + 3];
        var vx = bx - ax, vz = bz - az;
        var len2 = vx * vx + vz * vz;
        if (len2 < 1e-6) continue;
        var t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2));
        var qx = ax + vx * t, qz = az + vz * t;
        var dx = px - qx, dz = pz - qz;
        var d = Math.hypot(dx, dz);
        if (d >= BODY_R) continue;
        touched = true;
        var nx, nz;
        if (d > 1e-4) { nx = dx / d; nz = dz / d; }
        else { var l = Math.sqrt(len2); nx = -vz / l; nz = vx / l; }   // dead centre on the edge
        var pen = BODY_R - d;
        pushX += nx * pen; pushZ += nz * pen;
        var closing = -(car.speed * (fx * nx + fz * nz));
        if (closing > best) { best = closing; bnx = nx; bnz = nz; }
      }
    }
    if (!touched) { car.contactT = 0; return null; }

    // Separate first, always — otherwise a car that comes to rest inside a wall
    // stays inside it, and every later frame re-reports a collision.
    car.x += pushX; car.z += pushZ;

    // A PARKED car is pushed clear and nothing else. It has no velocity to
    // convert into a rebound, and giving it one anyway is how a car resting
    // against a building bounced off it at 4 m/s for as long as a panel was
    // open — the park brake zeroed the speed and the next frame's rebound put
    // it straight back.
    if (car.parked) { car.contactT = 0; car.speed = 0; return null; }

    // FIRST frame of contact is the impact. Everything after it is resting or
    // scraping, and must not be charged as a fresh crash — with auto-cruise the
    // car drives itself back into the wall the instant it bounces off, so
    // damaging every frame of contact ground a 11 km/h nudge down to 74%
    // health and would eventually total a parked car.
    var fresh = car.contactT === 0 && car.hurtCool <= 0;
    car.contactT += (dt || 0.016);

    if (best <= 0.05) return { impact: 0, damage: 0, crash: false };

    // Sustained contact always slides along the wall, whatever the speed. That
    // is what stops the bounce-cruise-bounce loop: instead of buzzing against
    // the building, the car ends up running alongside it and drives away.
    var scrape = !fresh || best < CRASH_AT;

    var damage = 0;
    if (scrape) {
      var tx = -bnz, tz = bnx;
      if (tx * fx + tz * fz < 0) { tx = -tx; tz = -tz; }
      var want = Math.atan2(tx, tz);
      var diff = ((want - car.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      car.yaw += diff * (fresh ? 0.45 : 0.22);
      car.speed *= fresh ? 0.90 : 0.97;
    } else {
      // Crash: most of the energy goes into the building, and you come off it.
      car.speed = -Math.min(4.5, best * 0.22);
    }

    if (fresh && best > HURT_AT) {
      // One crash is one crash. A bounce breaks contact, the cruise drives the
      // car straight back in, and without this every rebound is charged again —
      // holding the nose against a building slowly totalled it.
      car.hurtCool = 1.0;
      damage = (best - HURT_AT) * 2.6;
      car.health = Math.max(0, car.health - damage);
      if (car.health <= 0) { car.wrecked = true; car.speed = 0; }
    }
    return { impact: fresh ? best : 0, damage: damage, crash: !scrape };
  }

  function repair(car) {
    car.health = 100; car.wrecked = false; car.contactT = 0;
    car.revArm = 0; car.stillT = 0;
  }

  // Put the car down somewhere clean, facing somewhere sensible, at rest. Used
  // by the unstick rescue and by anything else that teleports the car — all of
  // the little counters have to be cleared together or the frame after the
  // rescue still thinks it is mid-crash.
  function place(car, x, z, yaw) {
    car.x = x; car.z = z;
    if (yaw != null) car.yaw = yaw;
    car.speed = 0; car.vy = 0;
    car.contactT = 0; car.hurtCool = 0; car.revArm = 0; car.stillT = 0;
    car.airborne = false;
    return car;
  }

  // ---- reverse, which is a GEAR and not an accident -----------------------
  // Reverse used to be whatever fell out of "brake past zero": hold the brake at
  // a standstill and the car accelerated backwards with no ceiling but the
  // -14 m/s clamp, while the speed read-out — |speed| — happily showed 50 km/h.
  // Three seconds on the brake pedal put you 20 m back up the road at what the
  // HUD called thirty-six km/h forwards. The suite even printed it and passed.
  //
  // So reverse is now an explicit thing with three rules:
  //  - it must be ASKED for: the brake at a standstill arms it after a beat,
  //    so an ordinary stop is a stop and not a slow roll backwards;
  //  - it is SLOW: REV_MAX is a car-park speed, not a motorway one;
  //  - it is never faster than REV_MAX no matter what pushed you there — a
  //    rebound off a building, or gravity on a hill you stalled on.
  var REV_MAX = 5.5;                  // m/s ≈ 20 km/h, and it is a hard floor
  var REV_ARM = 0.45;                 // seconds of brake at a stop before reverse

  // Controls arrive as a plain object so the same physics serve keyboard,
  // touch, and a replayed ghost. `park` is the whole-car override: a panel is
  // over the screen, so the car is not being driven and must not be creeping
  // into a building while the player reads it.
  function blankInput() { return { throttle: 0, brake: 0, steer: 0, handbrake: false, autoTarget: 0, park: false }; }

  function update(car, input, dt, frame) {
    dt = Math.min(dt, 0.05);           // a long frame must not teleport the car
    // BEFORE the wrecked early-return, because collide() reads it and a wrecked
    // car resting against a wall bounces off it exactly as enthusiastically as
    // a healthy one — and being wrecked puts a panel on the screen, so it is
    // precisely when the car is supposed to be sitting still.
    car.parked = !!input.park;
    if (car.hurtCool > 0) car.hurtCool -= dt;
    if (car.wrecked) {
      // Wrecked: no drive, no steering authority, just roll to a halt and sit.
      car.speed *= Math.max(0, 1 - dt * 2.5);
      if (Math.abs(car.speed) < 0.2) car.speed = 0;
      var dxw = Math.sin(car.yaw) * car.speed * dt, dzw = Math.cos(car.yaw) * car.speed * dt;
      car.x += dxw; car.z += dzw;
      settle(car, frame, dt);
      return car;
    }

    // Parked: the player is reading a panel, not driving. No throttle, no
    // steering, and the brake is on — but reverse must NOT arm, or coming back
    // from the race sheet would find the car quietly backing down the street.
    var park = car.parked;
    var inThrottle = park ? 0 : input.throttle;
    var inBrake = park ? 1 : input.brake;
    var inHand = park ? false : !!input.handbrake;
    var autoTarget = park ? 0 : input.autoTarget;

    // --- steering: smoothed, and less authoritative the faster you go -------
    var target = park ? 0 : Math.max(-1, Math.min(1, input.steer));
    car.steer += (target - car.steer) * Math.min(1, dt * 9);
    var v = Math.abs(car.speed);
    // Full lock at a crawl, about a third of it at motorway speed.
    var authority = 1 / (1 + v * 0.055);
    var turnRate = car.steer * 2.4 * authority * Math.min(1, v / 2.2);
    if (inHand) turnRate *= 1.7;                        // slide the back out
    car.yaw += turnRate * dt * (car.speed < 0 ? -1 : 1);

    // --- longitudinal ------------------------------------------------------
    // Tarmac versus everything else. Until the road index existed, onRoad was
    // set once at spawn and never updated, so a field drove exactly like a
    // motorway — which is most of why the world felt weightless.
    var grip = car.onRoad ? 1 : 0.55;
    var power = 11.5 * grip;                            // m/s² at full throttle
    var maxSpeed = (car.onRoad ? 62 : 19);              // ~220 km/h vs ~68 off road
    var accel = 0;

    if (inThrottle > 0) {
      // Falls off as you approach top speed, so acceleration feels like a car
      // rather than a rocket with a speed clamp.
      accel += power * inThrottle * Math.max(0.08, 1 - v / maxSpeed);
      // Auto-throttle eases off near the target instead of bouncing off it, so
      // cruising is steady rather than a sawtooth between full power and none.
      //
      // SIGNED, and that is the whole point. Comparing |speed| to the target
      // meant a car travelling BACKWARDS at 8 m/s read as "already up to
      // speed", so the cruise cut the power that would have pulled it forward
      // again — a rebound off a building, or a hill, and the car reversed away
      // for as long as you let it, gathering speed the read-out called
      // positive. Against the signed speed, anything below the target (and
      // every reverse speed is) gets full power.
      if (autoTarget > 0 && car.speed > autoTarget * 0.88) {
        accel *= Math.max(0, 1 - (car.speed - autoTarget * 0.88) / (autoTarget * 0.18));
      }
    }
    // Brake, and — only when asked for — reverse.
    if (inBrake > 0) {
      if (car.speed > 0.4) { accel -= 16 * inBrake * grip; car.revArm = 0; }
      else if (park) { car.revArm = 0; if (car.speed > -0.2) car.speed = Math.max(0, car.speed); }
      else {
        car.revArm += dt;
        if (car.revArm >= REV_ARM) accel -= 7 * inBrake;   // deliberate reverse
        else if (car.speed > -0.05) car.speed = Math.max(0, car.speed);  // an ordinary stop
      }
    } else car.revArm = 0;
    if (inHand) accel -= Math.sign(car.speed) * 9;

    // Drag and rolling resistance.
    accel -= Math.sign(car.speed) * (0.0021 * car.speed * car.speed + (car.onRoad ? 0.45 : 1.9));

    // Hills. pitch>0 means nose up, so gravity pulls backwards along the body.
    accel -= GRAVITY * Math.sin(car.pitch) * 0.85;

    car.speed += accel * dt;
    if (Math.abs(car.speed) < 0.12 && inThrottle === 0) car.speed = 0;
    // The reverse floor is not conditional on HOW you ended up going backwards.
    // A rebound, a slope, a mis-set stick — none of them may exceed a speed you
    // could not reverse at deliberately.
    car.speed = Math.max(-REV_MAX, Math.min(maxSpeed, car.speed));
    // Parked means PARKED. The brake alone gets it to nearly zero, but a car
    // resting against a wall is pushed out a few centimetres every frame by the
    // collision solver, and "nearly zero" plus a nudge is a car that creeps at
    // walking pace for as long as the panel is open. Reading a menu should not
    // move you.
    if (park && Math.abs(car.speed) < 1.2) car.speed = 0;

    // --- move --------------------------------------------------------------
    var dx = Math.sin(car.yaw) * car.speed * dt;
    var dz = Math.cos(car.yaw) * car.speed * dt;
    car.x += dx; car.z += dz;
    car.odometer += Math.abs(car.speed) * dt;

    // How long we have been going nowhere while being asked to go somewhere.
    // Some building footprints are a courtyard or a re-entrant corner, and a
    // car that noses into one can be held there by the wall slide with the
    // cruise pushing it back in for ever. That is not a crash the player can
    // drive out of, so it has to be DETECTED — see App.unstick().
    // Only counted while power is actually being asked for and the brake is
    // off: a deliberate stop at a junction is not being stuck, and offering to
    // rescue someone who is simply parked is noise.
    if (park || inThrottle === 0 || inBrake > 0) car.stillT = 0;
    else if (Math.abs(car.speed) < 1.0) car.stillT += dt;
    else car.stillT = 0;

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

    // Auto-throttle ("cruise") is the DEFAULT, and it is the answer to the real
    // complaint about the first build: a throttle you must hold, or worse tap,
    // occupies the thumb that should be steering. Every widely-played mobile
    // racer removes it — Mario Kart Tour auto-accelerates with no setting at
    // all. Here the target speed comes from the road class under the car, so a
    // residential street cruises at ~50 km/h and a motorway at ~120, and the
    // player's remaining job is steering and braking.
    // SCHEME decides what the thumbs do:
    //   'wheel' — a steering wheel you turn, plus a brake. Speed is the road's.
    //   'stick' — one floating thumb anywhere: sideways steers, and UP/DOWN
    //             trims a speed SET-POINT which holds when you let go. That
    //             last part is what makes it a rubber band rather than a
    //             joystick: a joystick springs back to zero, this keeps the
    //             speed you dialled in.
    var mode = { auto: true, tilt: false, scheme: 'wheel', park: false };
    var roadCruise = 0;            // m/s the road under us is built for
    var setPoint = null;           // m/s the player has dialled in (stick mode)
    var tilt = { active: false, neutral: null, value: 0 };

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
    var steerTouch = null;    // { id, mode:'pad'|'free'|'stick', startX, startY }
    var DEAD = 0.05;          // fraction of half-width treated as straight ahead
    var stick = { x: 0, y: 0, active: false, ox: 0, oy: 0 };
    var STICK_SPAN = 78;      // px of travel for full deflection
    var TRIM_RATE = 11;       // m/s of set-point change per second at full push

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

    function steerDown(e, m) {
      if (steerTouch) return;
      steerTouch = { id: e.pointerId, mode: m, startX: e.clientX, startY: e.clientY };
      if (m === 'stick') {
        // The stick is born WHERE THE THUMB LANDS — no target to hunt for, and
        // it works anywhere on the screen, which is the whole point.
        stick.active = true; stick.ox = e.clientX; stick.oy = e.clientY;
        stick.x = 0; stick.y = 0;
        if (setPoint === null) setPoint = Math.max(0, roadCruise);
      }
      input.steer = m === 'pad' ? fromPad(e.clientX) : 0;
      var el = m === 'pad' ? steerEl : surface;
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
      if (steerEl) steerEl.classList.add('active');
      if (onFirstTouch) { onFirstTouch(); onFirstTouch = null; }
    }
    function steerMove(e) {
      if (!steerTouch || e.pointerId !== steerTouch.id) return;
      if (steerTouch.mode === 'stick') {
        stick.x = Math.max(-1, Math.min(1, (e.clientX - stick.ox) / STICK_SPAN));
        // Screen y grows downward; pushing UP must mean faster.
        stick.y = Math.max(-1, Math.min(1, (stick.oy - e.clientY) / STICK_SPAN));
        input.steer = stick.x;
        if (opts.onStick) opts.onStick(stick);
        return;
      }
      input.steer = steerTouch.mode === 'pad' ? fromPad(e.clientX) : fromFree(e.clientX);
    }
    function steerUp(e) {
      if (!steerTouch || e.pointerId !== steerTouch.id) return;
      var steerTouchWasStick = steerTouch.mode === 'stick';
      steerTouch = null; input.steer = 0;
      // Releasing latches the speed you are ACTUALLY doing, not the one you
      // were still climbing toward. "Let go and it keeps this speed" is the
      // promise; without this you release at 60 and drift up to 100.
      if (steerTouchWasStick) setPoint = Math.max(0, Math.abs(speedRef()));
      stick.active = false; stick.x = 0; stick.y = 0;
      if (opts.onStick) opts.onStick(stick);
      if (steerEl) steerEl.classList.remove('active');
    }

    if (steerEl) {
      steerEl.addEventListener('pointerdown', function (e) { e.preventDefault(); steerDown(e, 'pad'); });
      steerEl.addEventListener('pointermove', steerMove);
      steerEl.addEventListener('pointerup', steerUp);
      steerEl.addEventListener('pointercancel', steerUp);
    }
    surface.addEventListener('pointerdown', function (e) {
      // Stick mode takes the WHOLE screen — "anywhere" is the feature. Wheel
      // mode keeps the left half as a look-free steering area, with the right
      // half left alone for the pedal.
      if (mode.scheme === 'stick') { e.preventDefault(); steerDown(e, 'stick'); return; }
      if (e.clientX < surface.clientWidth / 2) steerDown(e, 'free');
      else if (onFirstTouch) { onFirstTouch(); onFirstTouch = null; }
    });
    surface.addEventListener('pointermove', steerMove);
    surface.addEventListener('pointerup', steerUp);
    surface.addEventListener('pointercancel', steerUp);

    // The stick needs to know how fast we are actually going to decide whether
    // to coast or brake; the caller supplies it rather than the control layer
    // reaching into the car.
    var speedRef = function () { return 0; };
    function carSpeedRef() { return speedRef(); }

    // ---- tilt steering -------------------------------------------------
    // gamma is the left/right tilt of the device. The neutral point is captured
    // the first time a reading arrives (and re-captured on request), because
    // nobody holds a phone at exactly zero — assuming flat would put a constant
    // steering bias on every player.
    function onOrient(e) {
      if (!mode.tilt || e.gamma == null) return;
      if (tilt.neutral === null) tilt.neutral = e.gamma;
      var d = e.gamma - tilt.neutral;
      var RANGE = 26;                       // degrees for full lock
      var dead = 2.5;
      if (Math.abs(d) < dead) { tilt.value = 0; return; }
      d = d - (d > 0 ? dead : -dead);
      tilt.value = Math.max(-1, Math.min(1, d / RANGE));
    }

    return {
      input: input,
      setMode: function (m) {
        if (m.auto != null) mode.auto = !!m.auto;
        if (m.tilt != null && !!m.tilt !== mode.tilt) {
          mode.tilt = !!m.tilt;
          tilt.neutral = null; tilt.value = 0;
          if (mode.tilt && opts.onTiltEnable) opts.onTiltEnable(onOrient);
        }
      },
      recentreTilt: function () { tilt.neutral = null; },
      // A full-screen panel is open, so nobody is driving. Set here rather than
      // poked onto `input` from outside, so the whole precedence chain still
      // lives in sample() and there is one place that decides what the car
      // hears.
      setPark: function (on) { mode.park = !!on; },
      setCruise: function (mps) { roadCruise = mps; },
      bindSpeed: function (fn) { speedRef = fn; },
      setScheme: function (name) {
        mode.scheme = name;
        // Leaving stick mode drops the dialled-in speed, so switching back does
        // not resume at a set-point the player set ten minutes ago.
        if (name !== 'stick') setPoint = null;
      },
      stick: function () { return stick; },
      setPoint: function () { return setPoint; },
      setPedal: function (which, on) {
        pedal[which] = on;
        if (on && onFirstTouch) { onFirstTouch(); onFirstTouch = null; }
      },
      steering: function () { return steerTouch !== null; },
      // Called once per frame. Touch owns the wheel while a finger is down;
      // otherwise the keyboard does; otherwise it recentres. Written as one
      // explicit precedence chain because the old version mixed a decay term
      // into the touch path and the wheel drifted while you held it.
      sample: function (dt) {
        dt = dt || 0.016;
        input.park = mode.park;
        var kThrottle = (keys['w'] || keys['arrowup']) ? 1 : 0;
        var kBrake = (keys['s'] || keys['arrowdown']) ? 1 : 0;
        var kSteer = ((keys['d'] || keys['arrowright']) ? 1 : 0) - ((keys['a'] || keys['arrowleft']) ? 1 : 0);
        input.brake = Math.max(kBrake, pedal.brake ? 1 : 0);
        input.handbrake = !!keys[' '];

        // Throttle.
        if (mode.scheme === 'stick') {
          // Rubber band: while held, the vertical deflection TRIMS the
          // set-point; released, it simply stays. Down past zero becomes the
          // brake, so one thumb covers accelerate, hold, slow and stop.
          if (setPoint === null) setPoint = Math.max(0, roadCruise);
          if (stick.active) setPoint += stick.y * TRIM_RATE * dt;
          setPoint = Math.max(-3, Math.min(62, setPoint));
          if (setPoint <= 0) {
            input.autoTarget = 0; input.throttle = 0;
            input.brake = Math.max(input.brake, 1);
          } else {
            input.autoTarget = setPoint;
            input.throttle = (input.brake > 0 || input.handbrake) ? 0 : 1;
            // Overshooting the set-point (downhill, or after trimming down)
            // should ease off, and brake if it is a long way over.
            var over = Math.abs(carSpeedRef()) - setPoint;
            if (over > 0.5) input.throttle = 0;
            if (over > 4) input.brake = Math.max(input.brake, 0.7);
          }
        } else if (mode.auto) {
          input.autoTarget = roadCruise;
          input.throttle = (input.brake > 0 || input.handbrake) ? 0 : 1;
          // The keyboard still works, and still overrides: a desktop player
          // holding W should get full power, not cruise.
          if (kThrottle) { input.throttle = 1; input.autoTarget = 0; }
        } else {
          input.autoTarget = 0;
          input.throttle = Math.max(kThrottle, pedal.throttle ? 1 : 0);
        }

        // Steering precedence: finger, then tilt, then keys, then centre.
        if (steerTouch) { /* the finger owns it */ }
        else if (mode.tilt) input.steer = tilt.value;
        else if (kSteer !== 0) input.steer = kSteer;
        else input.steer = 0;
        return input;
      },
      keys: keys,
    };
  }

  root.Car = { create: create, update: update, controls: controls, blankInput: blankInput,
               collide: collide, repair: repair, place: place,
               REV_MAX: REV_MAX, REV_ARM: REV_ARM };
})(window);
