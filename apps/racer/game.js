/*
 * Racer — the v4 Outrun loop, extracted from Jake Gordon's v4.final.html.
 *
 * Same road, same projection, same traffic. Hooks this port adds, without
 * forking the renderer:
 *
 *   - a seeded RNG so every client builds the identical track
 *   - analog steering (a thumb pad writes a -1..1 axis; keys still snap)
 *   - remote players drawn as extra cars, never inserted into the AI list
 *   - a freeze + reset so a host-started race puts everyone on the line
 *
 * window.Racer is the seam boot.js / net.js / touch.js talk to.
 */
(function (root) {
  'use strict';

  var fps            = 60;
  var step           = 1/fps;
  var width          = 1024;
  var height         = 768;
  var centrifugal    = 0.3;
  var skySpeed       = 0.001;
  var hillSpeed      = 0.002;
  var treeSpeed      = 0.003;
  var skyOffset      = 0;
  var hillOffset     = 0;
  var treeOffset     = 0;
  var segments       = [];
  var cars           = [];
  var canvas         = null;
  var ctx            = null;
  var background     = null;
  var sprites        = null;
  var resolution     = null;
  var roadWidth      = 2000;
  var segmentLength  = 200;
  var rumbleLength   = 3;
  var trackLength    = null;
  var lanes          = 3;
  var fieldOfView    = 100;
  var cameraHeight   = 1000;
  var cameraDepth    = null;
  var drawDistance   = 300;
  var playerX        = 0;
  var playerZ        = null;
  var fogDensity     = 5;
  var position       = 0;
  var speed          = 0;
  var maxSpeed       = segmentLength/step;
  var accel          =  maxSpeed/5;
  var breaking       = -maxSpeed;
  var decel          = -maxSpeed/5;
  var offRoadDecel   = -maxSpeed/2;
  var offRoadLimit   =  maxSpeed/4;
  var totalCars      = 200;
  var currentLapTime = 0;
  var lastLapTime    = null;
  var lapCount       = 0;

  var keyLeft        = false;
  var keyRight       = false;
  var keyFaster      = false;
  var keySlower      = false;
  var steerAxis      = 0;     // analog: -1 .. 1, 0 means "use the keys"

  var frozen         = false; // countdown: no input, no motion
  var remotes        = [];    // [{ offset, z, speed, sprite, name, id }]
  var hud            = {};
  var onLapCb        = null;
  var onTickCb       = null;
  var started        = false;

  // Same track on every client. Math.random would put the palms in different
  // places, so a friend would be "on the road" in a world you cannot see.
  var SEED = 0x52414345; // 'RACE'
  function rng() {
    SEED = (SEED + 0x6D2B79F5) | 0;
    var t = Math.imul(SEED ^ SEED >>> 15, 1 | SEED);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function randInt(min, max) { return Math.round(min + (max - min) * rng()); }
  function randChoice(opts) { return opts[randInt(0, opts.length - 1)]; }
  function reseed() { SEED = 0x52414345; }

  function formatTime(dt) {
    var minutes = Math.floor(dt/60);
    var seconds = Math.floor(dt - (minutes * 60));
    var tenths  = Math.floor(10 * (dt - Math.floor(dt)));
    if (minutes > 0)
      return minutes + "." + (seconds < 10 ? "0" : "") + seconds + "." + tenths;
    else
      return seconds + "." + tenths;
  }

  function updateHud(key, value) {
    if (!hud[key] || !hud[key].dom) return;
    if (hud[key].value !== value) {
      hud[key].value = value;
      hud[key].dom.textContent = value;
    }
  }

  //=========================================================================
  // UPDATE
  //=========================================================================

  function update(dt) {
    if (frozen) {
      speed = 0;
      if (onTickCb) onTickCb(dt);
      updateHud('speed', '0');
      return;
    }

    var n, car, carW, sprite, spriteW;
    var playerSegment = findSegment(position + playerZ);
    var playerW       = SPRITES.PLAYER_STRAIGHT.w * SPRITES.SCALE;
    var speedPercent  = speed / maxSpeed;
    var dx            = dt * 2 * speedPercent;
    var startPosition = position;

    updateCars(dt, playerSegment, playerW);

    position = Util.increase(position, dt * speed, trackLength);

    if (steerAxis) {
      playerX = playerX + dx * steerAxis;
    } else if (keyLeft) {
      playerX = playerX - dx;
    } else if (keyRight) {
      playerX = playerX + dx;
    }

    playerX = playerX - (dx * speedPercent * playerSegment.curve * centrifugal);

    if (keyFaster)
      speed = Util.accelerate(speed, accel, dt);
    else if (keySlower)
      speed = Util.accelerate(speed, breaking, dt);
    else
      speed = Util.accelerate(speed, decel, dt);

    if ((playerX < -1) || (playerX > 1)) {
      if (speed > offRoadLimit)
        speed = Util.accelerate(speed, offRoadDecel, dt);

      for (n = 0; n < playerSegment.sprites.length; n++) {
        sprite  = playerSegment.sprites[n];
        spriteW = sprite.source.w * SPRITES.SCALE;
        if (Util.overlap(playerX, playerW, sprite.offset + spriteW/2 * (sprite.offset > 0 ? 1 : -1), spriteW)) {
          speed = maxSpeed / 5;
          position = Util.increase(playerSegment.p1.world.z, -playerZ, trackLength);
          break;
        }
      }
    }

    for (n = 0; n < playerSegment.cars.length; n++) {
      car  = playerSegment.cars[n];
      carW = car.sprite.w * SPRITES.SCALE;
      if (speed > car.speed) {
        if (Util.overlap(playerX, playerW, car.offset, carW, 0.8)) {
          speed    = car.speed * (car.speed / speed);
          position = Util.increase(car.z, -playerZ, trackLength);
          break;
        }
      }
    }

    // Remote players collide the same way the traffic does: you hit the back
    // of a slower car and take its speed. They are NOT in segment.cars (the
    // AI list), so this is a second pass over the interpolated ghosts.
    for (n = 0; n < remotes.length; n++) {
      car = remotes[n];
      if (!car) continue;
      var dz = Math.abs(((car.z - (position + playerZ)) + trackLength) % trackLength);
      if (dz > segmentLength * 2 && (trackLength - dz) > segmentLength * 2) continue;
      carW = (car.sprite ? car.sprite.w : SPRITES.PLAYER_STRAIGHT.w) * SPRITES.SCALE;
      if (speed > (car.speed || 0) && Util.overlap(playerX, playerW, car.offset, carW, 0.8)) {
        speed = (car.speed || 0) * ((car.speed || 0) / Math.max(speed, 1));
        position = Util.increase(car.z, -playerZ, trackLength);
        break;
      }
    }

    playerX = Util.limit(playerX, -3, 3);
    speed   = Util.limit(speed, 0, maxSpeed);

    skyOffset  = Util.increase(skyOffset,  skySpeed  * playerSegment.curve * (position - startPosition) / segmentLength, 1);
    hillOffset = Util.increase(hillOffset, hillSpeed * playerSegment.curve * (position - startPosition) / segmentLength, 1);
    treeOffset = Util.increase(treeOffset, treeSpeed * playerSegment.curve * (position - startPosition) / segmentLength, 1);

    if (position > playerZ) {
      if (currentLapTime && (startPosition < playerZ)) {
        lastLapTime    = currentLapTime;
        currentLapTime = 0;
        lapCount++;
        updateHud('last_lap_time', formatTime(lastLapTime));
        if (hud.last_lap_time && hud.last_lap_time.wrap) hud.last_lap_time.wrap.style.display = '';
        if (hud.fast_lap_time && (hud.fast_lap_time.best == null || lastLapTime < hud.fast_lap_time.best)) {
          hud.fast_lap_time.best = lastLapTime;
          updateHud('fast_lap_time', formatTime(lastLapTime));
          if (hud.fast_lap_time.wrap) hud.fast_lap_time.wrap.style.display = '';
        }
        if (onLapCb) onLapCb(lastLapTime, lapCount);
      } else {
        currentLapTime += dt;
      }
    }

    updateHud('speed', String(5 * Math.round(speed / 500)));
    updateHud('current_lap_time', formatTime(currentLapTime));
    if (onTickCb) onTickCb(dt);
  }

  function updateCars(dt, playerSegment, playerW) {
    var n, car, oldSegment, newSegment, idx;
    for (n = 0; n < cars.length; n++) {
      car         = cars[n];
      oldSegment  = findSegment(car.z);
      car.offset  = car.offset + updateCarOffset(car, oldSegment, playerSegment, playerW);
      car.z       = Util.increase(car.z, dt * car.speed, trackLength);
      car.percent = Util.percentRemaining(car.z, segmentLength);
      newSegment  = findSegment(car.z);
      if (oldSegment !== newSegment) {
        idx = oldSegment.cars.indexOf(car);
        if (idx >= 0) oldSegment.cars.splice(idx, 1);
        newSegment.cars.push(car);
      }
    }
  }

  function updateCarOffset(car, carSegment, playerSegment, playerW) {
    var i, j, dir, segment, otherCar, otherCarW, lookahead = 20;
    var carW = car.sprite.w * SPRITES.SCALE;

    if ((carSegment.index - playerSegment.index + segments.length) % segments.length > drawDistance)
      return 0;

    for (i = 1; i < lookahead; i++) {
      segment = segments[(carSegment.index + i) % segments.length];

      if ((segment === playerSegment) && (car.speed > speed) && (Util.overlap(playerX, playerW, car.offset, carW, 1.2))) {
        if (playerX > 0.5) dir = -1;
        else if (playerX < -0.5) dir = 1;
        else dir = (car.offset > playerX) ? 1 : -1;
        return dir * 1/i * (car.speed - speed) / maxSpeed;
      }

      for (j = 0; j < segment.cars.length; j++) {
        otherCar  = segment.cars[j];
        otherCarW = otherCar.sprite.w * SPRITES.SCALE;
        if ((car.speed > otherCar.speed) && Util.overlap(car.offset, carW, otherCar.offset, otherCarW, 1.2)) {
          if (otherCar.offset > 0.5) dir = -1;
          else if (otherCar.offset < -0.5) dir = 1;
          else dir = (car.offset > otherCar.offset) ? 1 : -1;
          return dir * 1/i * (car.speed - otherCar.speed) / maxSpeed;
        }
      }
    }

    if (car.offset < -0.9) return 0.1;
    else if (car.offset > 0.9) return -0.1;
    return 0;
  }

  //=========================================================================
  // RENDER
  //=========================================================================

  function render() {
    if (!ctx || !background || !sprites) return;

    var baseSegment   = findSegment(position);
    var basePercent   = Util.percentRemaining(position, segmentLength);
    var playerSegment = findSegment(position + playerZ);
    var playerPercent = Util.percentRemaining(position + playerZ, segmentLength);
    var playerY       = Util.interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);
    var maxy          = height;

    var x  = 0;
    var dx = -(baseSegment.curve * basePercent);

    ctx.clearRect(0, 0, width, height);

    Render.background(ctx, background, width, height, BACKGROUND.SKY,   skyOffset,  resolution * skySpeed  * playerY);
    Render.background(ctx, background, width, height, BACKGROUND.HILLS, hillOffset, resolution * hillSpeed * playerY);
    Render.background(ctx, background, width, height, BACKGROUND.TREES, treeOffset, resolution * treeSpeed * playerY);

    var n, i, segment, car, sprite, spriteScale, spriteX, spriteY;

    for (n = 0; n < drawDistance; n++) {
      segment        = segments[(baseSegment.index + n) % segments.length];
      segment.looped = segment.index < baseSegment.index;
      segment.fog    = Util.exponentialFog(n / drawDistance, fogDensity);
      segment.clip   = maxy;

      Util.project(segment.p1, (playerX * roadWidth) - x,      playerY + cameraHeight, position - (segment.looped ? trackLength : 0), cameraDepth, width, height, roadWidth);
      Util.project(segment.p2, (playerX * roadWidth) - x - dx, playerY + cameraHeight, position - (segment.looped ? trackLength : 0), cameraDepth, width, height, roadWidth);

      x  = x + dx;
      dx = dx + segment.curve;

      if ((segment.p1.camera.z <= cameraDepth) ||
          (segment.p2.screen.y >= segment.p1.screen.y) ||
          (segment.p2.screen.y >= maxy))
        continue;

      Render.segment(ctx, width, lanes,
                     segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w,
                     segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w,
                     segment.fog, segment.color);

      maxy = segment.p1.screen.y;
    }

    for (n = (drawDistance - 1); n > 0; n--) {
      segment = segments[(baseSegment.index + n) % segments.length];

      for (i = 0; i < segment.cars.length; i++) {
        car         = segment.cars[i];
        sprite      = car.sprite;
        spriteScale = Util.interpolate(segment.p1.screen.scale, segment.p2.screen.scale, car.percent);
        spriteX     = Util.interpolate(segment.p1.screen.x,     segment.p2.screen.x,     car.percent) + (spriteScale * car.offset * roadWidth * width / 2);
        spriteY     = Util.interpolate(segment.p1.screen.y,     segment.p2.screen.y,     car.percent);
        Render.sprite(ctx, width, height, resolution, roadWidth, sprites, car.sprite, spriteScale, spriteX, spriteY, -0.5, -1, segment.clip);
      }

      // Friends on the same road, drawn with the segment they currently sit on
      // so they clip behind hills the same way the traffic does.
      for (i = 0; i < remotes.length; i++) {
        car = remotes[i];
        if (!car || findSegment(car.z) !== segment) continue;
        var pct = Util.percentRemaining(car.z, segmentLength);
        sprite      = car.sprite || SPRITES.PLAYER_STRAIGHT;
        spriteScale = Util.interpolate(segment.p1.screen.scale, segment.p2.screen.scale, pct);
        spriteX     = Util.interpolate(segment.p1.screen.x,     segment.p2.screen.x,     pct) + (spriteScale * car.offset * roadWidth * width / 2);
        spriteY     = Util.interpolate(segment.p1.screen.y,     segment.p2.screen.y,     pct);
        Render.sprite(ctx, width, height, resolution, roadWidth, sprites, sprite, spriteScale, spriteX, spriteY, -0.5, -1, segment.clip);
      }

      for (i = 0; i < segment.sprites.length; i++) {
        sprite      = segment.sprites[i];
        spriteScale = segment.p1.screen.scale;
        spriteX     = segment.p1.screen.x + (spriteScale * sprite.offset * roadWidth * width / 2);
        spriteY     = segment.p1.screen.y;
        Render.sprite(ctx, width, height, resolution, roadWidth, sprites, sprite.source, spriteScale, spriteX, spriteY, (sprite.offset < 0 ? -1 : 0), -1, segment.clip);
      }

      if (segment === playerSegment) {
        var steer = speed * (steerAxis ? steerAxis : (keyLeft ? -1 : keyRight ? 1 : 0));
        Render.player(ctx, width, height, resolution, roadWidth, sprites, speed / maxSpeed,
                      cameraDepth / playerZ,
                      width / 2,
                      (height / 2) - (cameraDepth / playerZ * Util.interpolate(playerSegment.p1.camera.y, playerSegment.p2.camera.y, playerPercent) * height / 2),
                      steer,
                      playerSegment.p2.world.y - playerSegment.p1.world.y);
      }
    }
  }

  function findSegment(z) {
    return segments[Math.floor(z / segmentLength) % segments.length];
  }

  //=========================================================================
  // ROAD
  //=========================================================================

  function lastY() { return (segments.length === 0) ? 0 : segments[segments.length - 1].p2.world.y; }

  function addSegment(curve, y) {
    var n = segments.length;
    segments.push({
      index: n,
      p1: { world: { y: lastY(), z:  n    * segmentLength }, camera: {}, screen: {} },
      p2: { world: { y: y,       z: (n+1) * segmentLength }, camera: {}, screen: {} },
      curve: curve,
      sprites: [],
      cars: [],
      color: Math.floor(n / rumbleLength) % 2 ? COLORS.DARK : COLORS.LIGHT
    });
  }

  function addSprite(n, sprite, offset) {
    segments[n].sprites.push({ source: sprite, offset: offset });
  }

  function addRoad(enter, hold, leave, curve, y) {
    var startY   = lastY();
    var endY     = startY + (Util.toInt(y, 0) * segmentLength);
    var n, total = enter + hold + leave;
    for (n = 0; n < enter; n++)
      addSegment(Util.easeIn(0, curve, n / enter), Util.easeInOut(startY, endY, n / total));
    for (n = 0; n < hold; n++)
      addSegment(curve, Util.easeInOut(startY, endY, (enter + n) / total));
    for (n = 0; n < leave; n++)
      addSegment(Util.easeInOut(curve, 0, n / leave), Util.easeInOut(startY, endY, (enter + hold + n) / total));
  }

  var ROAD = {
    LENGTH: { NONE: 0, SHORT:  25, MEDIUM:   50, LONG:  100 },
    HILL:   { NONE: 0, LOW:    20, MEDIUM:   40, HIGH:   60 },
    CURVE:  { NONE: 0, EASY:    2, MEDIUM:    4, HARD:    6 }
  };

  function addStraight(num) {
    num = num || ROAD.LENGTH.MEDIUM;
    addRoad(num, num, num, 0, 0);
  }
  function addHill(num, height) {
    num    = num    || ROAD.LENGTH.MEDIUM;
    height = height || ROAD.HILL.MEDIUM;
    addRoad(num, num, num, 0, height);
  }
  function addCurve(num, curve, height) {
    num    = num    || ROAD.LENGTH.MEDIUM;
    curve  = curve  || ROAD.CURVE.MEDIUM;
    height = height || ROAD.HILL.NONE;
    addRoad(num, num, num, curve, height);
  }
  function addLowRollingHills(num, height) {
    num    = num    || ROAD.LENGTH.SHORT;
    height = height || ROAD.HILL.LOW;
    addRoad(num, num, num,  0,                height / 2);
    addRoad(num, num, num,  0,               -height);
    addRoad(num, num, num,  ROAD.CURVE.EASY,  height);
    addRoad(num, num, num,  0,                0);
    addRoad(num, num, num, -ROAD.CURVE.EASY,  height / 2);
    addRoad(num, num, num,  0,                0);
  }
  function addSCurves() {
    addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,  -ROAD.CURVE.EASY,    ROAD.HILL.NONE);
    addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,   ROAD.CURVE.MEDIUM,  ROAD.HILL.MEDIUM);
    addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,   ROAD.CURVE.EASY,   -ROAD.HILL.LOW);
    addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,  -ROAD.CURVE.EASY,    ROAD.HILL.MEDIUM);
    addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM,  -ROAD.CURVE.MEDIUM, -ROAD.HILL.MEDIUM);
  }
  function addBumps() {
    addRoad(10, 10, 10, 0,  5);
    addRoad(10, 10, 10, 0, -2);
    addRoad(10, 10, 10, 0, -5);
    addRoad(10, 10, 10, 0,  8);
    addRoad(10, 10, 10, 0,  5);
    addRoad(10, 10, 10, 0, -7);
    addRoad(10, 10, 10, 0,  5);
    addRoad(10, 10, 10, 0, -2);
  }
  function addDownhillToEnd(num) {
    num = num || 200;
    addRoad(num, num, num, -ROAD.CURVE.EASY, -lastY() / segmentLength);
  }

  function resetRoad() {
    segments = [];
    reseed();

    addStraight(ROAD.LENGTH.SHORT);
    addLowRollingHills();
    addSCurves();
    addCurve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.MEDIUM, ROAD.HILL.LOW);
    addBumps();
    addLowRollingHills();
    addCurve(ROAD.LENGTH.LONG * 2, ROAD.CURVE.MEDIUM, ROAD.HILL.MEDIUM);
    addStraight();
    addHill(ROAD.LENGTH.MEDIUM, ROAD.HILL.HIGH);
    addSCurves();
    addCurve(ROAD.LENGTH.LONG, -ROAD.CURVE.MEDIUM, ROAD.HILL.NONE);
    addHill(ROAD.LENGTH.LONG, ROAD.HILL.HIGH);
    addCurve(ROAD.LENGTH.LONG, ROAD.CURVE.MEDIUM, -ROAD.HILL.LOW);
    addBumps();
    addHill(ROAD.LENGTH.LONG, -ROAD.HILL.MEDIUM);
    addStraight();
    addSCurves();
    addDownhillToEnd();

    resetSprites();
    resetCars();

    segments[findSegment(playerZ).index + 2].color = COLORS.START;
    segments[findSegment(playerZ).index + 3].color = COLORS.START;
    for (var n = 0; n < rumbleLength; n++)
      segments[segments.length - 1 - n].color = COLORS.FINISH;

    trackLength = segments.length * segmentLength;
  }

  function resetSprites() {
    var n, i;

    addSprite(20,  SPRITES.BILLBOARD07, -1);
    addSprite(40,  SPRITES.BILLBOARD06, -1);
    addSprite(60,  SPRITES.BILLBOARD08, -1);
    addSprite(80,  SPRITES.BILLBOARD09, -1);
    addSprite(100, SPRITES.BILLBOARD01, -1);
    addSprite(120, SPRITES.BILLBOARD02, -1);
    addSprite(140, SPRITES.BILLBOARD03, -1);
    addSprite(160, SPRITES.BILLBOARD04, -1);
    addSprite(180, SPRITES.BILLBOARD05, -1);

    addSprite(240,                  SPRITES.BILLBOARD07, -1.2);
    addSprite(240,                  SPRITES.BILLBOARD06,  1.2);
    addSprite(segments.length - 25, SPRITES.BILLBOARD07, -1.2);
    addSprite(segments.length - 25, SPRITES.BILLBOARD06,  1.2);

    for (n = 10; n < 200; n += 4 + Math.floor(n / 100)) {
      addSprite(n, SPRITES.PALM_TREE, 0.5 + rng() * 0.5);
      addSprite(n, SPRITES.PALM_TREE,   1 + rng() * 2);
    }

    for (n = 250; n < 1000; n += 5) {
      addSprite(n, SPRITES.COLUMN, 1.1);
      addSprite(n + randInt(0, 5), SPRITES.TREE1, -1 - (rng() * 2));
      addSprite(n + randInt(0, 5), SPRITES.TREE2, -1 - (rng() * 2));
    }

    for (n = 200; n < segments.length; n += 3) {
      addSprite(n, randChoice(SPRITES.PLANTS), randChoice([1, -1]) * (2 + rng() * 5));
    }

    var side, sprite, offset;
    for (n = 1000; n < (segments.length - 50); n += 100) {
      side = randChoice([1, -1]);
      addSprite(n + randInt(0, 50), randChoice(SPRITES.BILLBOARDS), -side);
      for (i = 0; i < 20; i++) {
        sprite = randChoice(SPRITES.PLANTS);
        offset = side * (1.5 + rng());
        addSprite(n + randInt(0, 50), sprite, offset);
      }
    }
  }

  function resetCars() {
    cars = [];
    var n, car, segment, offset, z, sprite, spd;
    for (n = 0; n < totalCars; n++) {
      offset = rng() * randChoice([-0.8, 0.8]);
      z      = Math.floor(rng() * segments.length) * segmentLength;
      sprite = randChoice(SPRITES.CARS);
      spd    = maxSpeed / 4 + rng() * maxSpeed / (sprite === SPRITES.SEMI ? 4 : 2);
      car = { offset: offset, z: z, sprite: sprite, speed: spd };
      segment = findSegment(car.z);
      segment.cars.push(car);
      cars.push(car);
    }
  }

  function reset(options) {
    options = options || {};
    canvas.width  = width  = Util.toInt(options.width,  width);
    canvas.height = height = Util.toInt(options.height, height);
    lanes                  = Util.toInt(options.lanes,          lanes);
    roadWidth              = Util.toInt(options.roadWidth,      roadWidth);
    cameraHeight           = Util.toInt(options.cameraHeight,   cameraHeight);
    drawDistance           = Util.toInt(options.drawDistance,   drawDistance);
    fogDensity             = Util.toInt(options.fogDensity,     fogDensity);
    fieldOfView            = Util.toInt(options.fieldOfView,    fieldOfView);
    segmentLength          = Util.toInt(options.segmentLength,  segmentLength);
    rumbleLength           = Util.toInt(options.rumbleLength,   rumbleLength);
    if (options.totalCars != null) totalCars = Util.toInt(options.totalCars, totalCars);
    cameraDepth            = 1 / Math.tan((fieldOfView / 2) * Math.PI / 180);
    playerZ                = (cameraHeight * cameraDepth);
    resolution             = height / 480;

    if ((segments.length === 0) || options.segmentLength || options.rumbleLength || options.rebuild)
      resetRoad();
  }

  function fitCanvas() {
    var wrap = canvas && canvas.parentElement;
    var w = (wrap && wrap.clientWidth)  || root.innerWidth  || 640;
    var h = (wrap && wrap.clientHeight) || root.innerHeight || 480;
    // Keep the 4:3 bitmap the renderer was tuned for; CSS stretches it.
    var cap = (h < 500) ? 640 : 1024;
    var nh = Math.round(cap * 0.75);
    if (width !== cap || height !== nh) reset({ width: cap, height: nh });
  }

  function startLine() {
    position = 0;
    playerX = 0;
    speed = 0;
    currentLapTime = 0;
    lastLapTime = null;
    lapCount = 0;
    skyOffset = hillOffset = treeOffset = 0;
    updateHud('speed', '0');
    updateHud('current_lap_time', formatTime(0));
  }

  function bindHud() {
    hud = {
      speed:            { value: null, dom: document.getElementById('speed_value') },
      current_lap_time: { value: null, dom: document.getElementById('current_lap_time_value') },
      last_lap_time:    { value: null, dom: document.getElementById('last_lap_time_value'), wrap: document.getElementById('last_lap_time') },
      fast_lap_time:    { value: null, dom: document.getElementById('fast_lap_time_value'), wrap: document.getElementById('fast_lap_time') }
    };
  }

  function start(opts) {
    if (started) return;
    started = true;
    opts = opts || {};
    canvas = document.getElementById('canvas');
    ctx    = canvas.getContext('2d');
    bindHud();
    if (opts.drawDistance) drawDistance = opts.drawDistance;
    if (opts.totalCars != null) totalCars = opts.totalCars;

    Game.run({
      canvas: canvas, render: render, update: update, stats: Game.stats(), step: step,
      images: ['background', 'sprites'],
      keys: [
        { keys: [KEY.LEFT,  KEY.A], mode: 'down', action: function() { keyLeft   = true;  } },
        { keys: [KEY.RIGHT, KEY.D], mode: 'down', action: function() { keyRight  = true;  } },
        { keys: [KEY.UP,    KEY.W], mode: 'down', action: function() { keyFaster = true;  } },
        { keys: [KEY.DOWN,  KEY.S], mode: 'down', action: function() { keySlower = true;  } },
        { keys: [KEY.LEFT,  KEY.A], mode: 'up',   action: function() { keyLeft   = false; } },
        { keys: [KEY.RIGHT, KEY.D], mode: 'up',   action: function() { keyRight  = false; } },
        { keys: [KEY.UP,    KEY.W], mode: 'up',   action: function() { keyFaster = false; } },
        { keys: [KEY.DOWN,  KEY.S], mode: 'up',   action: function() { keySlower = false; } }
      ],
      ready: function(images) {
        background = images[0];
        sprites    = images[1];
        reset({});
        fitCanvas();
        var loading = document.getElementById('loading');
        if (loading) loading.hidden = true;
      }
    });

    root.addEventListener('resize', fitCanvas);
  }

  root.Racer = {
    start: start,
    setSteer: function (v) { steerAxis = Util.limit(v, -1, 1); },
    setFaster: function (on) { keyFaster = !!on; },
    setSlower: function (on) { keySlower = !!on; },
    setRemotes: function (list) { remotes = list || []; },
    freeze: function (on) { frozen = !!on; if (frozen) speed = 0; },
    isFrozen: function () { return frozen; },
    startLine: startLine,
    setBest: function (t) {
      if (!hud.fast_lap_time) bindHud();
      if (t == null || !isFinite(t)) return;
      hud.fast_lap_time.best = t;
      updateHud('fast_lap_time', formatTime(t));
      if (hud.fast_lap_time.wrap) hud.fast_lap_time.wrap.style.display = '';
    },
    best: function () { return hud.fast_lap_time && hud.fast_lap_time.best; },
    onLap: function (cb) { onLapCb = cb; },
    onTick: function (cb) { onTickCb = cb; },
    state: function () {
      return {
        x: playerX,
        z: position + playerZ,
        speed: speed,
        maxSpeed: maxSpeed,
        lap: lapCount,
        lapTime: currentLapTime,
        lastLap: lastLapTime,
        trackLength: trackLength || 0
      };
    },
    spriteFor: function (id) {
      var cars = SPRITES.CARS;
      var h = 0;
      id = String(id || '');
      for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      return cars[h % cars.length];
    }
  };
})(window);
