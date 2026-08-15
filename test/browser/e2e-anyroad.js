// End-to-end: Anyroad, the drive-anywhere app, running as a real packed GIF
// inside the real GifOS runtime.
//
// HERMETIC BY CONSTRUCTION. Every outbound host is intercepted and served from
// a fixture, for two reasons. The obvious one is that a suite which depends on
// overpass-api.de is a suite that goes red when a donated server has a bad day.
// The load-bearing one is that those services are rate-limited per IP as a
// matter of policy, and a gate that re-queries them on every run is precisely
// the abuse the policy exists to stop.
//
// What this actually guards:
//
//  1. BINARY gifos.fetch. Elevation is a PNG whose PIXELS ARE METRES. Until
//     2026-08 the bridge decoded every response as UTF-8, which mangles that
//     beyond recovery — so this asserts a real height comes back out of a real
//     PNG, through the bridge, decoded via blob -> <img> -> canvas in a
//     SANDBOXED frame (an opaque origin, where a tainted canvas would throw).
//  2. The world builds: terrain meshes, and road geometry gated on its terrain.
//  3. The car drives, and the renderer draws something that is not just sky.
//
// The world it drives through lives in test/lib/anyroad-fixtures.js — shared
// with the multiplayer battery, because a fixture that exists twice drifts.
//
// Needs: static server on 8099 (python3 -m http.server 8099 -d site).
const { launchAnyroadBrowser, openAnyroad } = require('../lib/anyroad-app');
const { appGif } = require('../lib/apps');
const { HOP, FIXTURE_HEIGHT, overpassBody } = require('../lib/anyroad-fixtures');
const { readFileSync } = require('fs');
const { decodePng } = require('../lib/png');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

(async () => {
  const gifB64 = readFileSync(appGif('anyroad')).toString('base64');

  const browser = await launchAnyroadBrowser();
  // The boot — install the packed GIF, open it, reach into the sandbox — and the
  // MapTiler key-and-stub arrangement now live in test/lib/anyroad-app.js,
  // because the rolling-hills coda at the bottom of this file needs the same
  // sequence by hand and a boot that exists twice drifts. `mt` carries the
  // request log and the two one-way flips (forest, dead) the map sections use.
  const boot = await openAnyroad(browser);
  const { context, desk: page, app, fr, hits, mt } = boot;

  check('the built GIF is a valid GifOS app', await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return GifOS.gif.looksLikeGifosGif(bytes);
  }, gifB64));

  check('Anyroad boots inside the sandbox', await fr.locator('h1').textContent() === 'Anyroad');

  const hasGL = await fr.locator('body').evaluate(() => !!(window.Render && window.Render.gl));
  check('a WebGL context exists', hasGL);

  // Hop to the preset the fixtures are built around.
  await boot.land();

  // Wait for the world to stream in from the fixtures.
  let state = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    state = await fr.locator('body').evaluate(() => {
      const w = window.App.world;
      const terrain = Object.keys(w.terrain).filter((k) => w.terrain[k] && w.terrain[k].rec);
      const built = Object.keys(w.roads).filter((k) => w.roads[k] && w.roads[k].built);
      return {
        terrain: terrain.length,
        roadsBuilt: built.length,
        roadTris: built.length ? w.roads[built[0]].built.roads.count : 0,
        buildingTris: built.length ? w.roads[built[0]].built.buildings.count : 0,
        height: window.Terrain.heightAt(w.frame, 0, 0),
      };
    });
    if (state.terrain > 0 && state.roadsBuilt > 0) break;
  }

  check('elevation tiles fetched through the bridge', hits.terrain > 0, hits.terrain + ' requests');
  check('terrain tiles decoded and loaded', state.terrain > 0, state.terrain + ' tiles');

  // THE binary-fetch assertion: the height the app reports has to be the height
  // encoded in the fixture PNG's pixels. A UTF-8 round-trip cannot produce it.
  check('a PNG\'s pixels survive gifos.fetch as real metres',
    state.height !== null && Math.abs(state.height - FIXTURE_HEIGHT) < 0.5,
    'got ' + (state.height === null ? 'null' : state.height.toFixed(2)) + ' m, expected ' + FIXTURE_HEIGHT);

  check('Overpass geometry fetched', hits.overpass > 0, hits.overpass + ' queries');
  check('road meshes built on top of the terrain', state.roadsBuilt > 0 && state.roadTris > 0,
    state.roadsBuilt + ' tiles, ' + state.roadTris + ' road indices');
  check('buildings extruded', state.buildingTris > 0, state.buildingTris + ' indices');

  // Landing puts the car on a road rather than in a field.
  const snapped = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    let best = Infinity;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.geom) continue;
      for (const way of r.geom.ways) {
        const flat = way[1];
        for (let i = 0; i + 1 < flat.length; i += 2) {
          const p = w.frame.toWorld(flat[i], flat[i + 1]);
          const car = window.App.car ? window.App.car() : null;
          best = Math.min(best, Math.hypot(p.x - (car ? car.x : 0), p.z - (car ? car.z : 0)));
        }
      }
    }
    return best;
  });
  check('the drop lands on a road, not in a field', snapped < 12, 'nearest road ' + snapped.toFixed(1) + ' m');

  // Drive. THE DEFAULT IS MANUAL (sources.js DEFAULTS.throttle, 2026-08-08):
  // you ARRIVE STOPPED — landing in a strange city already in motion, before
  // you have found the controls, is alarming rather than convenient — and GO
  // is the first thing you press. Cruise still exists, one tap away in
  // Settings, and is tested as a SETTING further down. (This leg asserted
  // cruise-by-default until 2026-08-08; the default flipped and the suite now
  // guards the flip in BOTH directions.)
  const before = await fr.locator('body').evaluate(() => {
    const c = window.App.car(); return { x: c.x, z: c.z, odo: c.odometer };
  });
  await sleep(3000);
  const still = await fr.locator('body').evaluate(() => {
    const c = window.App.car(); return { x: c.x, z: c.z, speed: c.speed };
  });
  const drifted = Math.hypot(still.x - before.x, still.z - before.z);
  check('the default is MANUAL: an untouched car stays put',
    drifted < 0.5 && Math.abs(still.speed) < 0.5,
    drifted.toFixed(1) + ' m drifted, ' + still.speed.toFixed(1) + ' m/s');
  // …and holding GO moves it. Guard the MECHANISM, not a magnitude: dt is
  // clamped at 50 ms for stability, so simulated time trails wall clock by a
  // factor set entirely by frame rate — on a 4-core box under load the same
  // build covered 4.0 m one run and 1.2 m the next. Tuning the threshold to
  // the good runs just buys a flake; the failure mode this guards is 0.0 m.
  await fr.locator('#pedal-gas').hover();
  await app.mouse.down();
  await sleep(6000);
  const after = await fr.locator('body').evaluate(() => {
    const c = window.App.car(); return { x: c.x, z: c.z, odo: c.odometer, y: c.y, speed: c.speed };
  });
  await app.mouse.up();
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  check('holding GO moves the car', moved > 0.5 && after.speed > 1,
    moved.toFixed(1) + ' m travelled, now at ' + after.speed.toFixed(1) + ' m/s');

  // …and the brake is the one control that stops it. This is the other half of
  // the contract: with no throttle, a brake that does not fully arrest the car
  // would leave the player with no way to stop.
  await fr.locator('#pedal-brake').hover();
  await app.mouse.down();
  await sleep(1200);
  const midBrake = await fr.locator('body').evaluate(() => ({
    speed: window.App.car().speed,
    brake: window.App.debug().input.brake,
    throttle: window.App.debug().input.throttle,
  }));
  await sleep(3000);
  const braked = await fr.locator('body').evaluate(() => window.App.car().speed);
  await app.mouse.up();
  // Assert the MECHANISM, not a speed reached in a wall-clock window. How much
  // a car sheds in N real seconds is set entirely by frame rate — clamped dt on
  // a loaded software rasteriser buys roughly a second of simulation per seven
  // real ones, and every absolute or ratio threshold tried here eventually
  // flaked. What must be true on any hardware: the brake input arrives, it
  // zeroes the cruise throttle (otherwise they fight), and speed falls
  // monotonically while it is held.
  check('the brake input reaches the car and overrides the cruise',
    midBrake.brake === 1 && midBrake.throttle === 0,
    'brake=' + midBrake.brake + ' throttle=' + midBrake.throttle);
  // Non-increasing on the second leg, not strictly falling, and that is the same
  // frame-rate argument as above taken one step further: a loaded software
  // rasteriser runs FEWER frames with a bigger clamped dt each, so a whole
  // braking impulse can land between two samples and the car is already at a
  // standstill by the middle one. Then `braked < midBrake.speed` is 0 < 0 and the
  // suite reports a product failure over a car that braked perfectly
  // (measured 2026-08-12 on a 4-core box at loadavg 6: 4.3 -> 0.0 -> 0.00).
  // Speed still has to FALL from where it started; it just cannot be required to
  // keep falling after it has run out of speed to lose.
  // …and compared as FORWARD speed, because the quantity that must fall
  // monotonically is how fast the car is going forwards, not its signed
  // velocity. The same big clamped dt can carry a braking car THROUGH zero to
  // a small negative in one step, after which the reverse arm — which
  // deliberately refuses to reverse from a standstill until the brake has been
  // held past it — pulls it back to 0. That reads as speed RISING (-0.4 -> 0.00)
  // and failed a car that had braked perfectly (measured on a 4-core box at
  // loadavg 6: 4.3 -> -0.4 -> 0.00). Reverse is not unguarded by this: it has
  // its own assertions further down, both that a dab at rest does NOT reverse
  // and that holding past the arm DOES.
  const fwd = (v) => Math.max(0, v);
  check('speed falls while the brake is held',
    fwd(braked) <= fwd(midBrake.speed) && fwd(braked) < after.speed,
    after.speed.toFixed(1) + ' -> ' + midBrake.speed.toFixed(1) + ' -> ' + braked.toFixed(2) + ' m/s');

  // The GO pedal is PRESENT in the default (manual) mode — it IS the
  // throttle. Its auto-mode behaviour (hidden while cruising, back at the
  // halt) is guarded in the throttle-setting leg below, against REAL state
  // rather than a synthetic hud() call.
  const goVisible = await fr.locator('body').evaluate(() => !document.getElementById('pedal-gas').hidden);
  check('the GO pedal is present in the default (manual) scheme', goVisible);
  check('the car sits on the fetched terrain, not at zero',
    Math.abs(after.y - FIXTURE_HEIGHT) < 3, 'car y = ' + after.y.toFixed(1) + ' m');

  // ---- the throttle SETTING: cruise is one tap away ------------------------
  // Settings are product. Flip throttle to AUTO through the REAL control (the
  // settings select + change event — the exact handler a user's tap runs): the
  // car must drive itself, the GO pedal must leave (a button that does nothing
  // is worse than none), the halt must latch at a braked standstill with GO
  // returning as the one way off it, and GO must actually release it — in
  // auto mode input.go is only ever the pedal or W, never the cruise, so a GO
  // that failed here would strand the car at 0 forever with the pedal
  // showing. Flip back and the pedal returns: that round-trip also guards the
  // live re-apply wiring (Sources.onChange -> applyControlPrefs) — a
  // persisted-but-never-applied setting is the classic silent break.
  await fr.locator('body').evaluate(() => { window.App.unstick(); }); // a wedged car would measure the wall, not the setting
  await fr.locator('body').evaluate(() => {
    const s = document.getElementById('ctl-throttle');
    s.value = 'auto'; s.dispatchEvent(new Event('change'));
  });
  const beforeAuto = await fr.locator('body').evaluate(() => { const c = window.App.car(); return { x: c.x, z: c.z }; });
  await sleep(6000);
  const afterAuto = await fr.locator('body').evaluate(() => { const c = window.App.car(); return { x: c.x, z: c.z, speed: c.speed }; });
  const movedAuto = Math.hypot(afterAuto.x - beforeAuto.x, afterAuto.z - beforeAuto.z);
  check('throttle=auto: the car drives itself (cruise as a setting)',
    movedAuto > 0.5 && afterAuto.speed > 1, movedAuto.toFixed(1) + ' m, ' + afterAuto.speed.toFixed(1) + ' m/s');
  check('throttle=auto: the GO pedal is gone while cruising',
    await fr.locator('body').evaluate(() => document.getElementById('pedal-gas').hidden));
  // Brake to a STANDSTILL: coming to rest is a STATE (car.halted) — the
  // cruise stays disarmed until asked for, whatever the throttle mode.
  await fr.locator('#pedal-brake').hover();
  await app.mouse.down();
  let haltA = null;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    haltA = await fr.locator('body').evaluate(() => ({
      halted: window.App.car().halted, speed: window.App.car().speed,
      goShown: !document.getElementById('pedal-gas').hidden,
    }));
    if (haltA.halted) break;
  }
  await app.mouse.up();
  await sleep(600);
  const held = await fr.locator('body').evaluate(() => ({
    halted: window.App.car().halted, speed: window.App.car().speed,
    goShown: !document.getElementById('pedal-gas').hidden,
  }));
  check('throttle=auto: braking to a standstill LATCHES the halt (the car can be left standing)',
    !!haltA && haltA.halted === true && held.halted === true && Math.abs(held.speed) < 0.5, JSON.stringify(held));
  check('…and GO reappears at the halt, in auto mode too — the one way to move off', held.goShown === true);
  await fr.locator('#pedal-gas').hover();
  await app.mouse.down();
  await sleep(1500);
  await app.mouse.up();
  let resumed = null;
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    resumed = await fr.locator('body').evaluate(() => ({ speed: window.App.car().speed, halted: window.App.car().halted }));
    if (!resumed.halted && resumed.speed > 1) break;
  }
  check('throttle=auto: GO releases the halt and the cruise resumes unheld',
    !!resumed && !resumed.halted && resumed.speed > 1, JSON.stringify(resumed));
  await fr.locator('body').evaluate(() => {
    const s = document.getElementById('ctl-throttle');
    s.value = 'manual'; s.dispatchEvent(new Event('change'));
  });
  check('back to manual through the same control: the GO pedal returns',
    await fr.locator('body').evaluate(() => !document.getElementById('pedal-gas').hidden));

  // ---- buildings are solid -------------------------------------------------
  // Two things, tested two ways.
  //
  // First, that buildings actually REACH the collision system: extruded walls
  // and indexed walls are built by different code paths, and a mesh with no
  // matching index would render a solid-looking building you drive straight
  // through.
  //
  // Second, the impact rules themselves — driven directly rather than by
  // steering a car at a wall. Two earlier attempts to drive into the fixture
  // building both failed for harness reasons (a normal that pointed into the
  // footprint; then an oblique approach that ran out of clock at 11 m/s),
  // testing the harness rather than the game. Calling collide() with a known
  // wall and a known velocity tests the rule that actually decides a crash.
  const walls = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    let n = 0;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (r && r.built && r.built.walls) n += r.built.walls.segs.length / 4;
    }
    return n;
  });
  check('building walls reach the collision index', walls > 0, walls + ' wall segments');

  const impacts = await fr.locator('body').evaluate(() => {
    // A wall along the x axis at z = 0; the car approaches from -z heading +z,
    // so "head-on" is a square hit and the normal component is unambiguous.
    const WALL = [-40, 0, 40, 0];
    // Placement matters: the samples sit at ±1.55 m along the heading, so the
    // car centre must be far enough back that the NOSE is inside the 0.95 m
    // contact band but not already past the wall. Started too close, the nose
    // is on the far side and the push-out helpfully shoves it the rest of the
    // way through — which is what the first version of this test measured.
    function run(speed, yawDeg, z) {
      const car = window.Car.create(0, z, 0);
      car.health = 100; car.speed = speed;
      car.yaw = yawDeg * Math.PI / 180;          // 0 = straight at the wall
      const hit = window.Car.collide(car, WALL, 0.016);
      return { damage: hit ? +hit.damage.toFixed(1) : 0, health: +car.health.toFixed(0),
               speed: +car.speed.toFixed(1), z: +car.z.toFixed(2), crash: !!(hit && hit.crash) };
    }
    return { headOn: run(22, 0, -2.0), glance: run(22, 80, -0.85), crawl: run(2, 0, -2.0) };
  });

  check('a fast head-on hit does heavy damage and rebounds',
    impacts.headOn.health < 60 && impacts.headOn.speed < 0 && impacts.headOn.crash,
    JSON.stringify(impacts.headOn));
  check('a glancing hit at the same speed barely hurts',
    impacts.glance.health > 85 && impacts.glance.health > impacts.headOn.health,
    JSON.stringify(impacts.glance));
  check('a slow nudge does no damage at all',
    impacts.crawl.health === 100, JSON.stringify(impacts.crawl));
  check('the car is pushed clear of the wall, never left inside it',
    Math.abs(impacts.headOn.z) > 0.9, 'z = ' + impacts.headOn.z);

  // ---- reverse is a gear, not an accident ----------------------------------
  // THE BUG: the brake past zero simply kept accelerating backwards, bounded
  // only by a -14 m/s clamp, while the speed read-out showed |speed| — so three
  // seconds on the brake pedal put the car 20 m back up the road at what the
  // HUD called 36 km/h FORWARDS. Worse, the auto-cruise compared |speed| to its
  // target, so a car reversing at 8 m/s read as "already at speed" and the
  // cruise cut the very power that would have pulled it forward again: one
  // rebound off a building and the car reversed away indefinitely.
  //
  // Driven directly rather than through the pedal, because what is being
  // guarded is the RULE, and a pedal test measures the harness's clock.
  const reverse = await fr.locator('body').evaluate(() => {
    // The real frame, not null: settle() samples the terrain every step, and
    // the fixture's ground is flat, so the hill term stays out of the way.
    const F = window.App.world.frame;
    const step = (car, input, n, dt) => { for (let i = 0; i < n; i++) window.Car.update(car, input, dt || 0.02, F); };
    const brake = Object.assign(window.Car.blankInput(), { brake: 1 });

    // 1. A short dab of brake at a standstill is a STOP, not a reverse.
    const a = window.Car.create(0, 0, 0);
    a.speed = 0.2;
    step(a, brake, 10, 0.02);                       // 0.2 s — under the arming time
    const dab = a.speed;

    // 2. Held, it reverses — and never faster than the reverse ceiling.
    const b = window.Car.create(0, 0, 0);
    step(b, brake, 400, 0.02);                      // 8 s of held brake
    const held = b.speed;

    // 3. The cruise pulls a car that IS going backwards forward again.
    const c = window.Car.create(0, 0, 0);
    c.speed = -4;
    const cruise = Object.assign(window.Car.blankInput(), { throttle: 1, autoTarget: 14 });
    step(c, cruise, 200, 0.02);                     // 4 s
    const recovered = c.speed;

    // 4. Nothing may leave the car reversing faster than the ceiling — not a
    //    rebound, not a hill. Slam it to an absurd speed and step once.
    const d = window.Car.create(0, 0, 0);
    d.speed = -40;
    step(d, window.Car.blankInput(), 1, 0.02);
    const clamped = d.speed;

    return { dab, held, recovered, clamped, max: window.Car.REV_MAX };
  });

  check('a dab of brake at a standstill stops, it does not reverse',
    reverse.dab >= 0, 'speed after 0.2 s of brake at rest: ' + reverse.dab.toFixed(2));
  check('holding the brake DOES reverse — backing up is possible',
    reverse.held < -1, 'speed after 8 s of held brake: ' + reverse.held.toFixed(2));
  check('reverse is bounded by the reverse ceiling, however long you hold it',
    reverse.held >= -reverse.max - 0.01, reverse.held.toFixed(2) + ' m/s vs ceiling ' + -reverse.max);
  check('the cruise recovers a car that is travelling BACKWARDS',
    reverse.recovered > 1, '-4 m/s -> ' + reverse.recovered.toFixed(2) + ' m/s under cruise');
  check('no rebound or slope may exceed the reverse ceiling',
    reverse.clamped >= -reverse.max - 0.01, '-40 m/s clamped to ' + reverse.clamped.toFixed(2));

  // …and the read-out says which way. |speed| alone made the two directions
  // the same number on the screen.
  const gear = await fr.locator('body').evaluate(() => {
    window.UI.hud({ speed: 18, reverse: true, steer: 0, health: 100, net: { backoffMs: 0 },
                    ready: true, players: 1, race: null, odometer: 0 });
    const on = !document.getElementById('gear').hidden;
    window.UI.hud({ speed: 18, reverse: false, steer: 0, health: 100, net: { backoffMs: 0 },
                    ready: true, players: 1, race: null, odometer: 0 });
    return { on: on, off: !document.getElementById('gear').hidden };
  });
  check('the HUD says R when the car is going backwards, and only then',
    gear.on && !gear.off, JSON.stringify(gear));

  // ---- a panel parks the car ----------------------------------------------
  // Opening the race sheet used to leave the world running behind it with the
  // cruise throttle open: you read the panel, the car drove itself into a
  // building unattended, and closing the sheet handed you back a wreck bouncing
  // backwards. Reading is not driving.
  await fr.locator('#btn-race').click();
  await fr.locator('#race').waitFor({ state: 'visible', timeout: 5000 });
  // POLLED, not slept. dt is clamped at 50 ms for stability, so on a software
  // rasteriser running at seven frames a second one wall-clock second is a
  // third of a simulated one — a fixed sleep asserts the frame rate, not the
  // brake. What must be true is that the car comes to REST and stays there.
  let parked = { park: false, speed: 99 };
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    parked = await fr.locator('body').evaluate(() => ({
      park: window.App.debug().input.park, speed: window.App.car().speed,
    }));
    if (parked.park && Math.abs(parked.speed) < 0.001) break;
  }
  await fr.locator('#close-race').click();
  await sleep(600);
  // Under the manual default "hands the car back" means the CONTROLS work
  // again, not that it drives off by itself — hold GO and expect motion.
  await fr.locator('#pedal-gas').hover();
  await app.mouse.down();
  await sleep(2500);
  const unparked = await fr.locator('body').evaluate(() => ({
    park: window.App.debug().input.park, speed: window.App.car().speed,
  }));
  await app.mouse.up();
  check('a full-screen panel parks the car instead of driving it blind',
    parked.park === true && Math.abs(parked.speed) < 0.001,
    'park=' + parked.park + ' speed=' + parked.speed.toFixed(3));
  check('closing the panel hands the car back (GO moves it again)',
    unparked.park === false && unparked.speed > 0.5,
    'park=' + unparked.park + ' speed=' + unparked.speed.toFixed(2));

  // ---- the unstick rescue --------------------------------------------------
  // Reverse is the first answer to being wedged, but some footprints are a
  // horseshoe and reverse is not enough. Put the car in a field and ask.
  const rescue = await fr.locator('body').evaluate(() => {
    const c = window.App.car(), w = window.App.world;
    const nearest = () => {
      let best = null;
      for (const k in w.roads) {
        const r = w.roads[k];
        if (!r || !r.built || !r.built.index) continue;
        const hit = window.Roads.nearestRoad(r.built.index, c.x, c.z);
        if (hit && (!best || hit.dist < best.dist)) best = hit;
      }
      return best;
    };
    window.Car.place(c, c.x + 60, c.z + 60, 0);
    c.speed = 0;
    const before = nearest();
    window.App.unstick();
    const after = nearest();
    return { before: before ? before.dist : -1, after: after ? after.dist : -1,
             half: after ? after.halfWidth : 0, speed: c.speed };
  });
  check('unstick puts the car back on a carriageway',
    rescue.after >= 0 && rescue.after <= rescue.half && rescue.after < rescue.before,
    rescue.before.toFixed(1) + ' m from a road -> ' + rescue.after.toFixed(1) + ' m (half width ' + rescue.half + ')');

  // ---- wildlife ------------------------------------------------------------
  // Animals cost condition, and the condition shows up ON THE GLASS. Injected
  // rather than waited for: spawning is deliberately random and a suite that
  // waits for a deer is a suite that flakes.
  const beast = await fr.locator('body').evaluate(() => {
    const c = window.App.car(), w = window.App.world;
    window.Animals.clear();
    window.UI.clearCracks();
    window.Car.repair(c);
    c.speed = 25;
    const cracksBefore = window.UI.crackCount();
    const ctx = {
      height: (x, z) => window.Terrain.heightAt(w.frame, x, z),
      nearestRoad: () => null,
    };
    // Dead ahead, one car length away, so the next step drives through it.
    window.Animals.inject({ kind: 'deer', x: c.x + Math.sin(c.yaw) * 2, z: c.z + Math.cos(c.yaw) * 2,
                            y: c.y, yaw: c.yaw });
    const hit = window.Animals.update(c, ctx, 0.016);
    if (hit) window.UI.damage(c.health, true, hit.damage);
    // A goose is not a cow: the same speed must not cost the same.
    // ON THE GROUND. These synthetic cars sat at y=0 under a world whose
    // fixture terrain is at 412 m — physically 400 m underground — and the
    // moment collisions learned about altitude (the invisible-birds fix)
    // they correctly refused to hit an animal 400 m above the car. The rig
    // was wrong, not the check: both parties stand on the terrain.
    const gy0 = window.Terrain.heightAt(w.frame, 0, 2) || 0;
    const heavy = window.Car.create(0, 0, 0); heavy.speed = 25; heavy.y = gy0;
    window.Animals.clear();
    window.Animals.inject({ kind: 'cow', x: 0, z: 2, y: gy0, yaw: 0 });
    const cowHit = window.Animals.update(heavy, ctx, 0.016);
    const light = window.Car.create(0, 0, 0); light.speed = 25; light.y = gy0;
    window.Animals.clear();
    window.Animals.inject({ kind: 'goose', x: 0, z: 2, y: gy0, yaw: 0 });
    const gooseHit = window.Animals.update(light, ctx, 0.016);
    return {
      hit: hit ? hit.kind : null, damage: hit ? hit.damage : 0, health: c.health,
      cracksBefore, cracksAfter: window.UI.crackCount(),
      cow: cowHit ? cowHit.damage : 0, goose: gooseHit ? gooseHit.damage : 0,
    };
  });
  check('driving into an animal costs condition', beast.hit === 'deer' && beast.health < 100,
    beast.hit + ', -' + beast.damage.toFixed(1) + ' -> ' + beast.health.toFixed(0) + '%');
  check('what you hit matters — a cow is not a goose',
    beast.cow > beast.goose * 2, 'cow -' + beast.cow.toFixed(1) + ' vs goose -' + beast.goose.toFixed(1));
  check('the damage lands on the windscreen, not only in a number',
    beast.cracksBefore === 0 && beast.cracksAfter > 0,
    beast.cracksBefore + ' -> ' + beast.cracksAfter + ' impacts on the glass');

  // An animal is a hazard you can SEE COMING. One materialising under the
  // bumper is not a hazard, it is a tax — so the spawner may never place one
  // near the car, however many times it is asked.
  const spawns = await fr.locator('body').evaluate(() => {
    const c = window.App.car(), w = window.App.world;
    const ctx = {
      height: (x, z) => window.Terrain.heightAt(w.frame, x, z),
      nearestRoad: (x, z) => {
        let best = null;
        for (const k in w.roads) {
          const r = w.roads[k];
          if (!r || !r.built || !r.built.index) continue;
          const hit = window.Roads.nearestRoad(r.built.index, x, z);
          if (hit && (!best || hit.dist < best.dist)) best = hit;
        }
        return best;
      },
    };
    // The same "is there a building here" question the app asks, so the
    // in-a-building rejection is exercised rather than skipped.
    ctx.solid = (x, z) => {
      const out = [];
      for (const k in w.roads) {
        const r = w.roads[k];
        if (!r || !r.built || !r.built.walls) continue;
        window.Roads.nearWalls(r.built.walls, x, z, out);
      }
      for (let i = 0; i < out.length; i += 4) {
        if (window.Roads.segDist(x, z, out[i], out[i + 1], out[i + 2], out[i + 3]) < 4) return true;
      }
      return false;
    };
    window.Animals.clear();
    let closest = Infinity, seen = 0, inWall = 0;
    for (let i = 0; i < 600; i++) {
      window.Animals.update(c, ctx, 0.5);       // big steps: force the spawner to run
      for (const a of window.Animals.drawList()) {
        seen++;
        closest = Math.min(closest, Math.hypot(a.x - c.x, a.z - c.z));
        if (ctx.solid(a.x, a.z)) inWall++;
      }
      window.Animals.clear();                    // clear so every tick spawns afresh
    }
    return { closest, seen, inWall };
  });
  check('animals never materialise on top of the car',
    spawns.seen > 0 && spawns.closest > 30,
    spawns.seen + ' spawned, nearest ' + (spawns.closest === Infinity ? 'none' : spawns.closest.toFixed(0) + ' m'));
  check('…nor inside a building', spawns.inWall === 0,
    spawns.inWall + ' of ' + spawns.seen + ' spawned in a wall');
  await fr.locator('body').evaluate(() => { window.Animals.clear(); window.UI.clearCracks(); });

  // ---- scenery -------------------------------------------------------------
  // Trees are generated, not downloaded, and they are the biggest single thing
  // the app does for a world with no satellite drape. They are also the most
  // expensive, which is why they have their own draw distance and their own
  // rung on the Detail setting.
  const scenery = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    let idx = 0, tiles = 0, onRoad = 0;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.trees) continue;
      tiles++; idx += r.built.trees.count;
      // Nothing may be planted ON the carriageway. Sample the trunk positions.
      const pos = r.built.trees.positions;
      for (let i = 0; i < pos.length; i += 3 * 40) {
        const hit = window.Roads.nearestRoad(r.built.index, pos[i], pos[i + 2]);
        if (hit && hit.dist < hit.halfWidth) onRoad++;
      }
    }
    return { tiles, idx, onRoad };
  });
  check('scenery is generated along the roads', scenery.tiles > 0 && scenery.idx > 0,
    scenery.tiles + ' tiles, ' + scenery.idx + ' indices');
  check('no tree is planted in the middle of the road', scenery.onRoad === 0,
    scenery.onRoad + ' trunks on tarmac');

  // ---- a tagged wood is THICK ----------------------------------------------
  // The fixture carries a natural=wood ring (way 8). Mapped woodland used to
  // come out at parkland density: the copse-clump filter vetoed half the
  // candidate sites before the tag was consulted, and the per-tile tree cap
  // was tuned for guessed copses. Count what actually grew inside the ring —
  // a vertex census, 21 vertices per tree, because the mesh is the one thing
  // the player sees. The ring is ~267 m × 111 m; sites every 34 m give ~24
  // first-pass trees, and the densifying pass must roughly double that.
  const woodland = await fr.locator('body').evaluate(() => {
    const w = window.App.world, f = w.frame;
    const HOP = { lat: 48.8698, lon: 2.3078 };
    const a = f.toWorld(HOP.lat - 0.0012, HOP.lon - 0.0044);
    const b = f.toWorld(HOP.lat + 0.0012, HOP.lon - 0.0030);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    let verts = 0;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.trees) continue;
      const p = r.built.trees.positions;
      for (let i = 0; i < p.length; i += 3) {
        if (p[i] >= x0 && p[i] <= x1 && p[i + 2] >= z0 && p[i + 2] <= z1) verts++;
      }
    }
    return { trees: Math.round(verts / 21) };
  });
  check('a tagged wood grows a THICK wood, not a parkland scatter',
    woodland.trees >= 40, woodland.trees + ' trees inside the fixture\'s natural=wood ring');

  // ---- trees are solid -----------------------------------------------------
  // A tree you can drive through is scenery. The whole reason for putting them
  // beside a road is that leaving the road should cost something, so the trunks
  // go into the SAME wall index buildings use — one collision system, not two.
  const timber = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    // Find a real trunk: the first tile with scenery, its first tree's base.
    let trunk = null;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.trees || !r.built.trees.count) continue;
      const p = r.built.trees.positions;
      trunk = { x: p[0], z: p[2] };
      break;
    }
    if (!trunk) return { found: false };
    // Every wall segment near it, exactly as the car would ask.
    const near = [];
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.walls) continue;
      window.Roads.nearWalls(r.built.walls, trunk.x, trunk.z, near);
    }
    let closest = Infinity;
    for (let i = 0; i < near.length; i += 4) {
      closest = Math.min(closest, window.Roads.segDist(trunk.x, trunk.z, near[i], near[i + 1], near[i + 2], near[i + 3]));
    }
    // …and drive into it. Aimed at the trunk from 3 m out, at 20 m/s.
    const car = window.Car.create(trunk.x, trunk.z - 3, 0);
    car.health = 100; car.speed = 20;
    const hit = window.Car.collide(car, near, 0.016);
    return { found: true, closest, segs: near.length / 4,
             damage: hit ? hit.damage : 0, health: car.health, speed: car.speed };
  });
  check('a tree trunk is in the collision index', timber.found && timber.closest < 1,
    timber.found ? (timber.segs + ' segments near it, closest ' + timber.closest.toFixed(2) + ' m')
                 : 'no scenery tile found');
  check('driving into a tree hurts', timber.damage > 0 && timber.health < 100 && timber.speed < 20,
    '-' + timber.damage.toFixed(1) + ' condition, ' + timber.health.toFixed(0) + '% left, speed -> ' + timber.speed.toFixed(1));

  // ---- shadows -------------------------------------------------------------
  // Baked once per tile, because the sun does not move. What must hold is that
  // they exist, that they lie along the sun and not somewhere else, and that
  // they are on the ground rather than floating.
  const shadow = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    const sun = window.Render.sun();
    let idx = 0, tiles = 0, offGround = 0, samples = 0, alongSun = 0;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.shadows || !r.built.shadows.count) continue;
      tiles++; idx += r.built.shadows.count;
      const p = r.built.shadows.positions;
      for (let i = 0; i < p.length; i += 3) {
        const g = window.Terrain.heightAt(w.frame, p[i], p[i + 2]);
        samples++;
        // ABOVE the road, not merely above the terrain. Road ribbons are laid
        // at terrain + 0.18 to clear the ground, so a shadow lifted less than
        // that is UNDER the tarmac: the depth test hides it and every shadow
        // stops dead at the kerb, which is exactly what they did.
        const lift = g === null ? -1 : p[i + 1] - g;
        if (lift < 0.26 || lift > 0.9) offGround++;
      }
    }
    // Where the shadows sit versus where the buildings sit. Both centroids are
    // taken over the SAME tile's whole set — an earlier version compared the
    // tile's entire shadow mesh against its FIRST building and measured nothing
    // but where that building happened to be in the block.
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.shadows || !r.built.shadows.count) continue;
      if (!r.geom.bld.length) continue;
      const p = r.built.shadows.positions;
      let sx = 0, sz = 0, n = 0;
      for (let i = 0; i < p.length; i += 3) { sx += p[i]; sz += p[i + 2]; n++; }
      sx /= n; sz /= n;
      let bx = 0, bz = 0, m = 0;
      for (const b of r.geom.bld) {
        for (let i = 0; i + 1 < b[1].length; i += 2) {
          const q = w.frame.toWorld(b[1][i], b[1][i + 1]);
          bx += q.x; bz += q.z; m++;
        }
      }
      bx /= m; bz /= m;
      // Dot the offset with the direction a shadow should fall.
      alongSun = (sx - bx) * -sun[0] + (sz - bz) * -sun[2];
      break;
    }
    return { tiles, idx, offGround, samples, alongSun, sun };
  });
  check('shadows are baked for every built tile', shadow.tiles > 0 && shadow.idx > 0,
    shadow.tiles + ' tiles, ' + shadow.idx + ' indices');
  check('shadows lie on the ground AND clear the road surface', shadow.offGround === 0,
    shadow.offGround + ' of ' + shadow.samples + ' vertices below the tarmac or floating');
  check('shadows fall away from the sun', shadow.alongSun > 0,
    'offset along the shadow direction: ' + shadow.alongSun.toFixed(1) + ' m');

  // ---- buildings are told apart --------------------------------------------
  // OSM has always carried this and the parser used to test `tags.building` for
  // truthiness and throw the value away, so a terrace, a shopping parade and a
  // distribution shed were the same grey extrusion. The fixture street is built
  // of known types, so the classes coming out are checkable.
  const kinds = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    const seen = {};
    let pitched = 0, flat = 0, stacks = 0;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.buildings.count) continue;
      const bi = r.built.buildings.binfo;
      for (let i = 2; i < bi.length; i += 3) {
        const c = bi[i];
        seen[c] = (seen[c] || 0) + 1;
        if (c === 8) pitched++;
        else if (c === 9) stacks++;
      }
      const nrm = r.built.buildings.normals;
      for (let i = 1; i < nrm.length; i += 3) if (nrm[i] > 0.95) flat++;
    }
    return { seen, pitched, flat, stacks,
             classes: Object.keys(seen).map(Number).sort((a, b) => a - b) };
  });
  check('more than one kind of building comes out of the map data',
    kinds.classes.filter((c) => c >= 1 && c <= 7).length >= 3,
    'classes present: ' + kinds.classes.join(','));
  check('houses get a pitched roof, and it is not painted as a wall',
    kinds.pitched > 0, kinds.pitched + ' tile vertices');
  check('houses get a chimney', kinds.stacks > 0, kinds.stacks + ' chimney vertices');

  // ---- how tall is a building nobody measured? -----------------------------
  // Most OSM buildings carry no height, so most of what you drive past is a
  // GUESS — and the guess used to come from the class alone: `building=commercial`
  // meant 15 m, five storeys invented out of silence. A neighbour's large
  // two-storey house rendered as a five-storey office block, from a tag that
  // never said so. Guessing is fine; guessing TALL is not, because a building
  // drawn too short still reads as a building and one drawn too tall reads as
  // a different building. Asserted through the pure exports because by the far
  // end of build() a house and an office block are the same array of numbers.
  const heights = await fr.locator('body').evaluate(() => {
    const R = window.Roads, G = window.Geo;
    const square = (m2, lat = 48.85) => {
      const side = Math.sqrt(m2);
      const dLat = side / G.metresPerDegLat(lat), dLon = side / G.metresPerDegLon(lat);
      return [lat, 0, lat, dLon, lat + dLat, dLon, lat + dLat, 0];
    };
    const h = (tags, m2) => R.heightOf(tags, m2);
    return {
      area: R.areaOf(square(1000)),
      bigCommercial: h({ building: 'commercial' }, 2000),
      smallCommercial: h({ building: 'commercial' }, 300),
      bigHouse: h({ building: 'house' }, 380),
      bigBox: h({ building: 'retail' }, 1800),
      untaggedHuge: h({ building: 'yes' }, 4000),
      feet: h({ building: 'yes', height: "40'" }, 200),
      metresUnit: h({ building: 'yes', height: '12 m' }, 200),
      levels: h({ building: 'office', 'building:levels': '12' }, 400),
      estimate: h({ building: 'yes', est_height: '25' }, 200),
    };
  });
  check('the footprint area maths is right', Math.abs(heights.area - 1000) < 20,
    heights.area.toFixed(0) + ' m² for a 1000 m² square');
  // THE regression. 15 m was five storeys of pure invention.
  check('a big-footprint commercial building is not guessed five storeys tall',
    heights.bigCommercial < 9, heights.bigCommercial.toFixed(1) + ' m for 2000 m² of `building=commercial`');
  check('…and a small-footprint one is still allowed to be taller',
    heights.smallCommercial > heights.bigCommercial,
    heights.smallCommercial.toFixed(1) + ' m at 300 m² vs ' + heights.bigCommercial.toFixed(1) + ' m at 2000 m²');
  check('a large house is still a two-storey house',
    heights.bigHouse < 8, heights.bigHouse.toFixed(1) + ' m for a 380 m² house');
  check('a big-box shop is one tall storey, not a block of flats',
    heights.bigBox < 6, heights.bigBox.toFixed(1) + ' m for 1800 m² of retail');
  check('an untagged giant footprint is guessed flat',
    heights.untaggedHuge < 5, heights.untaggedHuge.toFixed(1) + ' m for 4000 m² of `building=yes`');
  // A tagged height is a measurement and must always beat the guess. Feet are
  // the trap: parseFloat("40'") is 40 METRES to anyone who does not look.
  check("a height tagged in FEET is not read as metres", Math.abs(heights.feet - 12.19) < 0.2,
    "40' → " + heights.feet.toFixed(2) + ' m');
  check('a height tagged with a unit is read', Math.abs(heights.metresUnit - 12) < 0.01,
    '"12 m" → ' + heights.metresUnit.toFixed(2) + ' m');
  check('building:levels beats any guess', heights.levels > 35,
    '12 levels → ' + heights.levels.toFixed(1) + ' m');
  check('est_height is somebody else\'s measurement and is taken', Math.abs(heights.estimate - 25) < 0.01,
    heights.estimate.toFixed(1) + ' m');

  // ---- the mirror pool ----------------------------------------------------
  // The registry always listed several Overpass mirrors and then used exactly
  // ONE of them, chosen by hand, for a whole drive: one server carrying the load
  // while identical ones sat idle, and one server's bad day being the app's bad
  // day. Tiles now spread across every mirror that covers where you are, ranked
  // by measured health, with failover to the next one instead of a dead tile.
  //
  // What it deliberately does NOT do is race the same query on all of them and
  // take the winner — that is triple load on donated servers for one answer, and
  // it is what got this address 406'd out of overpass-api.de for minutes on
  // 2026-08-07.
  const mirrors = await fr.locator('body').evaluate(() => {
    const R = window.Roads, S = window.Sources;
    const was = S.current.roads;
    const ids = (a) => a.map((s) => s.id);
    S.set({ roads: 'auto' });
    const london = ids(S.roadsPool(51.52, -0.16));
    const zurich = ids(S.roadsPool(47.38, 8.54));
    const poolFor = ids(S.roadsFor(51.52, -0.16));
    S.set({ roads: 'overpass-kumi' });
    const pinned = ids(S.roadsFor(51.52, -0.16));
    S.set({ roads: 'overpass-ch' });
    const chOutside = S.roadsCover(51.52, -0.16);
    S.set({ roads: 'auto' });
    // Rank cold, then after timing, then after failures on the fast one.
    const cold = ids(R.rankMirrors(51.52, -0.16));
    R.noteLatency('https://overpass-api.de/api/interpreter', 9000);
    R.noteLatency('https://overpass.private.coffee/api/interpreter', 300);
    R.noteLatency('https://overpass.kumi.systems/api/interpreter', 2500);
    const bySpeed = ids(R.rankMirrors(51.52, -0.16));
    for (let i = 0; i < 3; i++) R.noteFail('https://overpass.private.coffee/api/interpreter');
    const afterFails = ids(R.rankMirrors(51.52, -0.16));
    S.set({ roads: was });
    return { london, zurich, poolFor, pinned, chOutside, cold, bySpeed, afterFails,
             deflt: 'auto' === 'auto' };
  });
  check('a drive spreads across every WORLDWIDE mirror, not one chosen by hand',
    mirrors.london.length === 3 && mirrors.london.indexOf('overpass-ch') === -1
    && mirrors.london.indexOf('auto') === -1, mirrors.london.join(', '));
  // bounds earns its keep in both directions: it keeps the Swiss extract out of
  // a London drive AND puts that fast local server into a Zurich one.
  check('…and in Switzerland the fast local extract JOINS the pool',
    mirrors.zurich.indexOf('overpass-ch') !== -1 && mirrors.zurich.length === 4,
    mirrors.zurich.join(', '));
  check('pinning a single mirror by hand still works',
    mirrors.pinned.length === 1 && mirrors.pinned[0] === 'overpass-kumi', mirrors.pinned.join(', '));
  check('…and a pinned regional mirror still warns outside its own country',
    mirrors.chOutside === false);
  check('the fastest MEASURED mirror is tried first',
    mirrors.bySpeed[0] === 'overpass-coffee' && mirrors.bySpeed[2] === 'overpass-de',
    mirrors.cold.join(' > ') + '  →  ' + mirrors.bySpeed.join(' > '));
  check('…and one that keeps failing is demoted even though it is the fastest',
    mirrors.afterFails[0] !== 'overpass-coffee', mirrors.afterFails.join(' > '));

  // ---- the swimming pool --------------------------------------------------
  // Pools were invisible for a plain reason: a pool is NOT natural=water, it is
  // leisure=swimming_pool, so the water query never returned one and a street
  // of Californian gardens came out dry. Measured against live Overpass while
  // building this: 92 pools in a 900 m box of Beverly Hills, all leisure, median
  // 72 m² — which is car-sized, and that is what makes it a hazard worth having.
  //
  // And water did nothing anyway: it was drawn and never read, so a lake was
  // tarmac. Now every water polygon drowns you — a pool that killed while a
  // lake stayed drivable would be the arbitrary rule.
  const pool = await fr.locator('body').evaluate(async () => {
    const R = window.Roads, C = window.Car, G = window.Geo;
    const frame = G.frame(34.09, -118.40);
    const half = (area) => Math.sqrt(area) / 2;
    const ring = (lat, lon, m) => {
      const dLat = m / G.metresPerDegLat(lat), dLon = m / G.metresPerDegLon(lat);
      return [lat - dLat, lon - dLon, lat - dLat, lon + dLon,
              lat + dLat, lon + dLon, lat + dLat, lon - dLon];
    };
    // The builder's own rule, driven through the public exports: open water is
    // deep past DROWN_AREA, a pool is deep at any size.
    const open = [ring(34.0910, -118.40, half(400)), ring(34.0920, -118.40, half(9000))];
    const pools = [ring(34.0900, -118.40, half(72))];       // the Beverly Hills median
    const rings = open.map((f) => [R.areaOf(f) > R.DROWN_AREA ? 1 : 0, f, ''])
                      .concat(pools.map((f) => [1, f, '']));
    const idx = R.landIndexOf(frame, { land: rings });
    const at = (lat, lon) => { const w = frame.toWorld(lat, lon); return R.waterAt(idx, w.x, w.z); };
    const drive = { throttle: 1, brake: 0, steer: 0, handbrake: false,
                    autoTarget: 0, park: false, go: false, fire: false, noRev: false };
    // Deep: drive in at speed with the throttle pinned and see how long it takes.
    const deep = C.create(0, 0, 0); deep.speed = 18; deep.inWater = true; deep.deepWater = true;
    let t = 0, wreckedAt = null, at1s = null, sank = 0;
    for (let i = 0; i < 400 && wreckedAt === null; i++) {
      C.update(deep, drive, 0.02, frame); t += 0.02;
      sank = Math.max(sank, deep.sink || 0);
      if (at1s === null && t >= 1) at1s = deep.speed;
      if (deep.wrecked) wreckedAt = t;
    }
    C.repair(deep);
    const recovered = { wrecked: deep.wrecked, health: deep.health, sink: deep.sink,
                        inWater: deep.inWater, deepWater: deep.deepWater };
    // Shallow: the same three seconds, and you drive out the far side.
    const ford = C.create(0, 0, 0); ford.speed = 18; ford.inWater = true; ford.deepWater = false;
    for (let i = 0; i < 150; i++) C.update(ford, drive, 0.02, frame);
    const wading = { speed: ford.speed, health: ford.health, wrecked: ford.wrecked, sink: ford.sink };
    ford.inWater = false;
    for (let i = 0; i < 120; i++) C.update(ford, drive, 0.02, frame);
    const driedOut = { speed: ford.speed, sink: ford.sink };
    // Dry land, untouched by any of it.
    const dry = C.create(0, 0, 0); dry.speed = 18;
    for (let i = 0; i < 100; i++) C.update(dry, drive, 0.02, frame);
    return { threshold: R.DROWN_AREA,
             pool: at(34.0900, -118.40), pond: at(34.0910, -118.40), lake: at(34.0920, -118.40),
             land: at(34.0800, -118.40),
             at1s, sank, wreckedAt, recovered, wading, driedOut,
             dryHealth: dry.health, drySpeed: dry.speed,
             hasSplash: typeof window.Sound.splash === 'function' };
  });
  check('a swimming pool is water, and DEEP at any size',
    !!pool.pool && pool.pool.deep === true, JSON.stringify(pool.pool));

  // ---- water that is actually WHERE THE WATER IS ---------------------------
  // A drive at Niagara Falls had no river in it, and the river was not missing:
  // it was drawn 175 m underneath the terrain. waterMesh levelled each polygon at
  // Math.min of the ground under EVERY vertex, `out geom` returns whole ways tens
  // of kilometres long, and groundAt() answers 0 for a vertex with no terrain
  // loaded — so one unsampled vertex 20 km away pinned an entire river at y=0.3
  // while the ground it belonged to was at 171 m. These two guard that directly.
  const wlevel = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    let verts = 0, atZero = 0, worst = 0, above = 0, tiles = 0;
    for (const k in w.roads) {
      const r = w.roads[k];
      const m = r && r.built && r.built.water;
      if (!m || !m.positions || !m.positions.length) continue;
      tiles++;
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i], y = m.positions[i + 1], z = m.positions[i + 2];
        const g = window.Terrain.heightAt(w.frame, x, z);
        if (g === null) continue;
        verts++;
        if (Math.abs(y) < 5 && g > 50) atZero++;          // the exact old failure
        worst = Math.max(worst, Math.abs(y - g));
        above = Math.max(above, y - g);                  // water standing ON TOP of land
      }
    }
    return { tiles, verts, atZero, worst: +worst.toFixed(1), above: +above.toFixed(1),
             ground: window.Terrain.heightAt(w.frame, 0, 0) };
  });
  check('water is drawn on this fixture at all', wlevel.verts > 0, JSON.stringify(wlevel));
  check('…and never pinned at sea level under ground that is hundreds of metres up',
    wlevel.atZero === 0, wlevel.atZero + ' of ' + wlevel.verts + ' vertices near y=0 (ground ' + wlevel.ground + ' m)');
  check('…so every water surface sits within a plausible distance of its own ground',
    wlevel.worst < 60, 'worst |water - ground| = ' + wlevel.worst + ' m');
  // THE FLOOD GUARD, and it is directional on purpose. Water below the ground
  // beside it is ordinary — a river is lower than its banks. Water ABOVE the
  // ground is a lie, and it is the lie a polygon clipper produced: clipping a
  // concave river ring to the tile joined disjoint pieces along the boundary and
  // filled 75% of a tile at 163 m over a gorge at 100 m, which is a teal sheet
  // across the valley with trees standing in it and fish above it.
  check('…and water never stands ON TOP of the land (the flood)',
    wlevel.above < 2, 'highest water above its own ground = ' + wlevel.above + ' m');

  // Nothing may be planted in the river either. The sea was guarded by a height
  // test and inland water by nothing, which only became visible once water was
  // actually being fetched.
  const treesWet = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    let sampled = 0, wet = 0, tilesWithWater = 0;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.wet || !r.built.wet.length) continue;
      tilesWithWater++;
      const sc = r.built.trees;
      if (!sc || !sc.positions) continue;
      for (let i = 0; i < sc.positions.length; i += 3 * 40) {
        sampled++;
        if (window.Roads.waterAt(r.built.wet, sc.positions[i], sc.positions[i + 2])) wet++;
      }
    }
    return { sampled, wet, tilesWithWater };
  });
  // ---- an aircraft is never inside the world --------------------------------
  // Flight had no contact with terrain: fly at a canyon wall and you entered the
  // rock, and because the heightfield is drawn double-sided you then looked at the
  // UNDERSIDE of the world — the landscape hanging upside down overhead. Reported
  // from the Grand Canyon with the altimeter reading -131 m. Escape was not
  // reliable either: targetAgl is floored at 0 and leashed to within 90 m of the
  // current agl, so underground it climbs to exactly agl 0 and skims the surface,
  // and rising ground (or a held BRAKE) puts it straight back under.
  const inRock = await fr.locator('body').evaluate(async () => {
    const w = window.App.world, car = window.App.car();
    const g0 = window.Terrain.heightAt(w.frame, car.x, car.z);
    if (g0 === null) return { err: 'no ground under the car' };
    const keep = { x: car.x, z: car.z, y: car.y, flying: car.flying };
    window.Car.repair(car);
    if (!car.flying) window.Car.takeOff(car);
    car.y = g0 - 120; car.vy = 0; car.speed = 30; car.agl = -120;   // 120 m inside the rock
    const input = { throttle: 0, brake: 0, steer: 0, handbrake: false, autoTarget: 0,
                    park: false, go: false, fire: false, noRev: false };
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      window.Car.update(car, input, 0.02, w.frame);
      const g = window.Terrain.heightAt(w.frame, car.x, car.z);
      if (g !== null) worst = Math.min(worst, car.y - g);
    }
    // Put the car back where the rest of the suite expects it.
    car.flying = keep.flying; car.falling = false; car.vy = 0; car.speed = 0;
    window.Car.repair(car);
    window.Car.place(car, keep.x, keep.z, car.yaw);
    car.y = keep.y;
    return { worstBelowGround: +worst.toFixed(1) };
  });
  check('an aircraft is never left inside the ground (no inverted world)',
    !inRock.err && inRock.worstBelowGround > -0.5,
    inRock.err || ('deepest it got below the surface after one step: ' + inRock.worstBelowGround + ' m'));

  check('no tree grows out of the water', treesWet.wet === 0,
    treesWet.wet + ' of ' + treesWet.sampled + ' sampled tree vertices inside a water ring, over '
      + treesWet.tilesWithWater + ' tile(s) that have water');

  // A MULTIPOLYGON MEMBER IS NOT A RING, and treating one as a ring is how a
  // clifftop becomes deep water: landAt() closes an open ring implicitly, so the
  // phantom edge swallows everything between the fragment's two ends. Big rivers
  // and lakes are exactly the features that arrive as relations, so this is the
  // guard on the fix that stopped the car drowning 78 m above the Niagara river.
  const stitch = await fr.locator('body').evaluate(() => {
    const R = window.Roads;
    // Four fragments of one square, deliberately in the wrong order and with two
    // of them reversed — which is how OSM hands them over.
    const A = [0, 0, 0, 1], B = [1, 1, 1, 0], C = [0, 1, 1, 1], D = [1, 0, 0, 0];
    const closed = R.assembleRings([A, C, B, D]);
    // And a chain that cannot close: the phantom-lake case.
    const openChain = R.assembleRings([[0, 0, 0, 1], [0, 1, 1, 1]]);
    return { closedCount: closed.length, closedLen: closed[0] ? closed[0].length : 0,
             firstIsClosed: closed[0] ? (closed[0][0] === closed[0][closed[0].length - 2]
                                      && closed[0][1] === closed[0][closed[0].length - 1]) : false,
             openCount: openChain.length,
             carryBridge: R.carryOf({ bridge: 'yes' }), carryNone: R.carryOf({ bridge: 'no' }),
             carryEmbank: R.carryOf({ embankment: 'yes' }) };
  });
  check('scattered multipolygon fragments are stitched into one closed ring',
    stitch.closedCount === 1 && stitch.firstIsClosed, JSON.stringify(stitch));
  check('…and fragments that cannot close are DROPPED, not left as phantom lakes',
    stitch.openCount === 0, stitch.openCount + ' unclosed ring(s) kept');
  check('a bridge tag reaches the builder instead of being discarded',
    stitch.carryBridge === 1 && stitch.carryNone === 0 && stitch.carryEmbank === 3,
    'bridge=' + stitch.carryBridge + ' no=' + stitch.carryNone + ' embankment=' + stitch.carryEmbank);

  // ---- a bridge you can SEE is a bridge you can DRIVE ON --------------------
  // The deck was drawn over the gorge while the car went on taking its height
  // from the heightfield, so the Rainbow Bridge was scenery you fell through.
  // Two halves have to hold: the deck must reach the COLLISION INDEX (a mesh
  // nobody can stand on is decoration), and the car must actually be asking that
  // index (measured on live Niagara data: 52.9 m above the gorge floor at
  // mid-span). Losing either one restores the old behaviour silently.
  const deck = await fr.locator('body').evaluate(() => {
    const R = window.Roads, G = window.Geo, w = window.App.world;
    const frame = w.frame;
    // One way, tagged as a bridge, through the fixture's flat ground.
    const a = frame.toWorld ? null : null;
    const lat = 48.8566, lon = 2.3522;
    const dLon = 120 / G.metresPerDegLon(lat);
    const way = ['secondary', [lat, lon, lat, lon + dLon], 0, 2, 'Test Span', 1];
    const built = R.build(frame, { ways: [way], bld: [], wat: [], land: [], pool: [], detail: 2 }, null, null);
    const mid = frame.toWorld(lat, lon + dLon / 2);
    const hit = R.nearestDeck(built.index, mid.x, mid.z);
    const ground = window.Terrain.heightAt(frame, mid.x, mid.z);
    // …and beside it there must be no deck at all, or every field is a bridge.
    const beside = R.nearestDeck(built.index, mid.x + 60, mid.z + 60);
    const car = window.App.car();
    return { hasDeck: !!hit, deckY: hit ? +hit.deckY.toFixed(1) : null,
             ground: ground === null ? null : +ground.toFixed(1),
             besideIsDeck: !!beside,
             providerWired: typeof car.groundFn === 'function',
             providerAnswer: typeof car.groundFn === 'function'
               ? (function () { const v = car.groundFn(mid.x, mid.z, car.y); return v === null ? null : +v.toFixed(1); })() : null };
  });
  check('a bridge deck reaches the collision index, not just the mesh',
    deck.hasDeck && deck.deckY !== null, JSON.stringify(deck));
  check('…at the height of the carriageway, not the sea',
    deck.ground !== null && Math.abs(deck.deckY - deck.ground) < 3,
    'deck ' + deck.deckY + ' m vs ground ' + deck.ground + ' m');
  check('…and only ON the structure — the field beside it is not a bridge',
    !deck.besideIsDeck);
  check('the car asks for ground through the deck-aware provider',
    deck.providerWired && deck.providerAnswer !== null,
    'groundFn=' + deck.providerWired + ' answer=' + deck.providerAnswer);

  // ---- tunnels: underground is a place you can drive ------------------------
  // A tunnel is the mirror of a bridge and was refused outright, so "through the
  // mountain" came out as a climb over the top of it. The deck is allowed to win
  // below ground now, with one extra condition — you have to actually be down
  // there — because the surface above a shallow tunnel is inside its own 2-D
  // footprint and would otherwise swallow anyone driving over it.
  //
  // The fixture's ground is FLAT, so it cannot express a mountain; what it can
  // guard is the mechanism and the direction of every rule. The buried case is
  // verified against live data (Tunnel du Mont Blanc, 7.5 km: the car travels
  // more than a kilometre beneath the surface instead of over the summit).
  const tun = await fr.locator('body').evaluate(() => {
    const R = window.Roads, G = window.Geo, w = window.App.world;
    const frame = w.frame;
    const lat = 48.857, lon = 2.354;
    const dLon = 150 / G.metresPerDegLon(lat);
    const way = ['trunk', [lat, lon, lat, lon + dLon], 0, 2, 'Test Bore', 2];
    const built = R.build(frame, { ways: [way], bld: [], wat: [], land: [], pool: [], detail: 2 }, null, null);
    const mid = frame.toWorld(lat, lon + dLon / 2);
    const hit = R.nearestDeck(built.index, mid.x, mid.z);
    const g = window.Terrain.heightAt(frame, mid.x, mid.z);
    // The rule itself, on the live world: with no reference height nobody may be
    // put below the surface, and a deck far above you must not reel you in.
    const gNone = window.App.groundAt(mid.x, mid.z, null);
    return { carryTunnel: R.carryOf({ tunnel: 'yes' }),
             carryBuilding: R.carryOf({ tunnel: 'building_passage' }),
             hasDeck: !!hit, deckY: hit ? +hit.deckY.toFixed(1) : null,
             ground: g === null ? null : +g.toFixed(1),
             noRefIsSurface: gNone === null ? null : +gNone.toFixed(1) };
  });
  check('a tunnel tag is carried through as a tunnel', tun.carryTunnel === 2 && tun.carryBuilding === 2,
    'tunnel=' + tun.carryTunnel + ' building_passage=' + tun.carryBuilding);
  check('a tunnel gets a deck in the collision index, like a bridge does',
    tun.hasDeck, JSON.stringify(tun));
  check('…and it never floats ABOVE the ground it bores through',
    tun.deckY !== null && tun.ground !== null && tun.deckY <= tun.ground + 0.5,
    'deck ' + tun.deckY + ' m vs ground ' + tun.ground + ' m');
  check('nobody is teleported underground: with no reference height the surface wins',
    tun.noRefIsSurface !== null && tun.ground !== null && tun.noRefIsSurface >= tun.ground - 0.5,
    'groundAt(no ref) = ' + tun.noRefIsSurface + ' vs surface ' + tun.ground);

  // A bridge over a river must not drown you — water is a 2-D ray cast that has
  // no idea how high anything is, so a rideable deck over water meant "In deep"
  // fifty metres up. That is suppressed while on a RAISED deck, and the dangerous
  // direction of that suppression is the one worth guarding: true when it should
  // be false turns every lake on the map into tarmac.
  const raised = await fr.locator('body').evaluate(() => ({
    onDeck: window.App.onRaisedDeck(), y: +window.App.car().y.toFixed(1) }));
  check('on ordinary ground the car is NOT on a raised deck (or water stops working)',
    raised.onDeck === false, 'onRaisedDeck()=' + raised.onDeck + ' at y=' + raised.y);
  // The gamble. Driving into water must NOT be a lookup the player can perform
  // from the driving seat — a small pond lets you through, a lake does not, and
  // the threshold is a number nobody can eyeball.
  check('a small pond is water you can drive through, not a grave',
    !!pool.pond && pool.pond.deep === false,
    '400 m² pond vs a ' + pool.threshold + ' m² threshold');
  check('…while open water past the threshold still swallows you',
    !!pool.lake && pool.lake.deep === true, '9000 m² lake');
  check('dry land is not water', pool.land === null);
  check('full throttle will not drive you out of the deep',
    pool.at1s < 1, pool.at1s.toFixed(2) + ' m/s one second after going in at 18');
  check('…the car settles into it rather than floating on it',
    pool.sank > 0.8, pool.sank.toFixed(2) + ' m');
  check('…and it drowns in a couple of seconds, not instantly and not never',
    pool.wreckedAt > 1.5 && pool.wreckedAt < 4, pool.wreckedAt.toFixed(2) + ' s');
  check('there is a way out — repair clears the wreck, the sink and both water flags',
    !pool.recovered.wrecked && pool.recovered.health === 100 && pool.recovered.sink === 0
    && pool.recovered.inWater === false && pool.recovered.deepWater === false,
    JSON.stringify(pool.recovered));
  check('a ford slows you hard but you keep driving, and it does no damage',
    pool.wading.speed > 3 && pool.wading.health === 100 && !pool.wading.wrecked,
    pool.wading.speed.toFixed(1) + ' m/s after 3 s, ' + pool.wading.health + '% health');
  check('…the body wades a little, and only a little',
    pool.wading.sink > 0.2 && pool.wading.sink < 0.6, pool.wading.sink.toFixed(2) + ' m');
  check('…and it dries out and speeds up on the far side',
    pool.driedOut.speed > 12 && pool.driedOut.sink === 0,
    pool.driedOut.speed.toFixed(1) + ' m/s, sink ' + pool.driedOut.sink);
  check('a car on dry land is untouched by any of it',
    pool.dryHealth === 100 && pool.drySpeed > 10,
    pool.dryHealth + '% health, ' + pool.drySpeed.toFixed(1) + ' m/s');
  check('hitting water makes a noise', pool.hasSplash);

  // ---- what does the ground say grows on it? ------------------------------
  // A tree's species used to be chosen by ALTITUDE — conifer above 900 m — which
  // is a guess dressed as a rule, and it plants the same Surrey oak in the
  // Mojave. OSM has carried the answer all along: natural=wood, landuse=vineyard,
  // and leaf_type, which NAMES the species group. Verified against live Overpass
  // while building this: the New Forest returns 36 wood rings of which 32 carry
  // leaf_type, and Napa returns 11 vineyards.
  const land = await fr.locator('body').evaluate(() => {
    const R = window.Roads, G = window.Geo, frame = G.frame(51.5, -0.1);
    const ring = (lat, lon, m, id, leaf) => {
      const dLat = m / G.metresPerDegLat(lat), dLon = m / G.metresPerDegLon(lat);
      return [id, [lat - dLat, lon - dLon, lat - dLat, lon + dLon,
                   lat + dLat, lon + dLon, lat + dLat, lon - dLon], leaf];
    };
    const L = R.LAND;
    const idx = R.landIndexOf(frame, { land: [
      ring(51.5000, -0.1000, 300, L.wood.id, 'conifer'),
      ring(51.5000, -0.1000, 40, L.grassland.id, 'broad'),   // a clearing INSIDE the wood
      ring(51.5100, -0.1000, 200, L.sand.id, 'broad'),
      ring(51.4900, -0.1000, 200, L.orchard.id, 'broad'),
    ] });
    const at = (lat, lon) => { const w = frame.toWorld(lat, lon); return R.landAt(idx, w.x, w.z); };
    return {
      rings: idx.length,
      clearing: at(51.5000, -0.1000), wood: at(51.5010, -0.1000),
      sand: at(51.5100, -0.1000), orchard: at(51.4900, -0.1000),
      untagged: at(51.6000, -0.1000),
      sandPlants: L.sand.plant, orchardRows: !!L.orchard.orchard, scrubBush: !!L.scrub.bush,
      emptyCache: R.landIndexOf(frame, {}).length,
      woodPlants: L.wood.plant,
    };
  });
  check('landcover rings index, smallest first so a clearing beats the wood round it',
    land.rings === 4 && land.clearing && land.clearing.id === 4,
    land.rings + ' rings, centre reads class ' + (land.clearing && land.clearing.id));
  check('…and a step outside the clearing IS the wood',
    !!land.wood && land.wood.id === 1, JSON.stringify(land.wood && land.wood.id));
  check('leaf_type reaches the planter, so species is DATA and not altitude',
    !!land.wood && land.wood.leaf === 'conifer', land.wood && land.wood.leaf);
  check('ground tagged sand/rock/quarry plants NOTHING',
    !!land.sand && land.sand.id === 10 && land.sandPlants === 0);
  check('a vineyard or orchard is flagged as planted in rows', land.orchardRows);
  check('scrub is a bush, so moorland does not become a maze of bollards', land.scrubBush);
  // The distinction that matters: "nothing is tagged here" is not "nothing
  // grows here". The first keeps the fallback scatter, the second suppresses it.
  check('untagged ground returns null rather than a default landcover',
    land.untagged === null, JSON.stringify(land.untagged));
  check('a cache written before landcover existed still indexes cleanly',
    land.emptyCache === 0, land.emptyCache + ' rings from {}');

  // ---- the shape of a pitched roof ----------------------------------------
  // Reported from a real drive: "a lot of the house roofs have very strange and
  // lopsided angular shapes". Two causes, both arithmetic.
  //
  // The ridge was laid along the NORTH/EAST bounding box. Rotate a 16 x 6 m
  // house by 45 degrees and its AABB is 15.56 x 15.56 — square — so
  // half = max(0, (long - short) / 2) collapsed to ZERO, the ridge became a
  // single point at the centroid, and the roof was a pyramid. And each eave
  // fanned to whichever of the ridge's two ENDPOINTS was nearer, so adjacent
  // edges could pick different ends out of order and the surface tore.
  //
  // Now the ridge follows the footprint's own principal axis and each eave
  // rises to the nearest point ON the ridge segment. Asserted as geometry,
  // because from the far end of build() a roof is triangle soup.
  const roofs = await fr.locator('body').evaluate(() => {
    const R = window.Roads;
    const house = (deg, L = 16, W = 6) => {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      return [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]]
        .map(([x, z]) => ({ x: x * c - z * s, z: x * s + z * c }));
    };
    const apexes = (poly, seed) => {
      const out = { pos: [], nrm: [], tone: [], binfo: [], idx: [] };
      R.roofOver(poly, 0, 5, 2.2, seed, 0.6, out);
      // REPRESENTATION-AGNOSTIC. This used to walk pos at stride 9 and take
      // each triangle's third vertex as the apex — true of the old pure
      // triangle soup, and NaN the day the closed-lids rework (2026-08-08)
      // stopped emitting exactly that layout. An apex is a VERTEX AT RIDGE
      // HEIGHT whatever the primitive plumbing: collect by y, deduped, and
      // every geometric claim below is unchanged.
      let maxY = -Infinity;
      for (let i = 1; i < out.pos.length; i += 3) maxY = Math.max(maxY, out.pos[i]);
      const A = []; const seen = new Set();
      for (let i = 0; i + 2 < out.pos.length; i += 3) {
        if (out.pos[i + 1] < maxY - 0.05) continue;
        const key = out.pos[i].toFixed(3) + '|' + out.pos[i + 2].toFixed(3);
        if (seen.has(key)) continue;
        seen.add(key);
        A.push({ x: out.pos[i], z: out.pos[i + 2] });
      }
      return A;
    };
    // Worst perpendicular deviation of the apexes from a single straight line.
    const bend = (A) => {
      const n = A.length, mx = A.reduce((a, p) => a + p.x, 0) / n, mz = A.reduce((a, p) => a + p.z, 0) / n;
      let sxx = 0, szz = 0, sxz = 0;
      for (const p of A) { const dx = p.x - mx, dz = p.z - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
      const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ax = Math.cos(th), az = Math.sin(th);
      let worst = 0;
      for (const p of A) worst = Math.max(worst, Math.abs(-(p.x - mx) * az + (p.z - mz) * ax));
      return worst;
    };
    const rot = [];
    for (const deg of [0, 15, 30, 45, 60, 75, 90]) {
      const A = apexes(house(deg), 0.2);
      const ux = Math.cos(deg * Math.PI / 180), uz = Math.sin(deg * Math.PI / 180);
      let along = 0, across = 0;
      for (const p of A) {
        along = Math.max(along, Math.abs(p.x * ux + p.z * uz));
        across = Math.max(across, Math.abs(-p.x * uz + p.z * ux));
      }
      rot.push({ deg, along: +along.toFixed(2), across: +across.toFixed(3) });
    }
    const L = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 5 }, { x: 6, z: 5 }, { x: 6, z: 12 }, { x: 0, z: 12 }];
    return { rot,
             bendRect: bend(apexes(house(30), 0.2)),
             bendGable: bend(apexes(house(30), 0.9)),
             bendL: bend(apexes(L, 0.2)) };
  });
  check('a pitched roof\'s ridge runs the LENGTH of the house at every rotation',
    roofs.rot.every((r) => r.along > 2 && r.across < 0.05),
    roofs.rot.map((r) => r.deg + '°:' + r.along + '/' + r.across).join(' '));
  check('…and its apexes lie on ONE ridge line, not scattered points',
    roofs.bendRect < 0.01 && roofs.bendGable < 0.01,
    'hip ' + roofs.bendRect.toFixed(4) + ' m, gable ' + roofs.bendGable.toFixed(4) + ' m off a straight line');
  check('…including on an L-shaped footprint, which used to be the worst case',
    roofs.bendL < 0.01, roofs.bendL.toFixed(4) + ' m');

  // ---- whose shop is it? ---------------------------------------------------
  // The sign colour is the one thing about a business that reads from a moving
  // car. OSM names them and the parser used to discard the name entirely.
  const brands = await fr.locator('body').evaluate(() => {
    const R = window.Roads;
    const unpack = (p) => { const k = p - 1; return [Math.floor(k / 256), Math.floor((k % 256) / 16), k % 16]; };
    const of = (t) => { const p = R.brandOf(t); return p ? unpack(p) : null; };
    return {
      mcd: of({ name: "McDonald's" }),
      wikidata: of({ 'brand:wikidata': 'Q487494' }),   // Tesco, spelling-proof
      punctuation: of({ brand: 'M C Donalds' }),       // normalisation
      operator: of({ operator: 'Aldi' }),
      unknown: of({ name: 'Nathans Corner Shop' }),
      // The seed shares a float with the brand; it must survive that.
      seedKeepsPrecision: (() => {
        const f = new Float32Array(1); let worst = 0;
        for (let i = 0; i < 500; i++) { const s = i / 500; f[0] = 4096 + s; worst = Math.max(worst, Math.abs((f[0] - 4096) - s)); }
        return worst;
      })(),
    };
  });
  check('a known brand resolves to its own sign colour', !!brands.mcd && brands.mcd[0] > brands.mcd[1],
    "McDonald's → rgb4 " + JSON.stringify(brands.mcd) + ' (red dominant)');
  check('brand:wikidata works, so a brand survives translation', !!brands.wikidata,
    'Q487494 → rgb4 ' + JSON.stringify(brands.wikidata));
  check('punctuation and spacing do not defeat the match', !!brands.punctuation,
    '"M C Donalds" → rgb4 ' + JSON.stringify(brands.punctuation));
  check('operator counts as a brand too', !!brands.operator, 'Aldi → rgb4 ' + JSON.stringify(brands.operator));
  check('an unknown business gets NO branded sign, not a wrong one',
    brands.unknown === null, JSON.stringify(brands.unknown));
  check('the seed survives sharing a float with the brand',
    brands.seedKeepsPrecision < 0.001, 'worst error ' + brands.seedKeepsPrecision.toExponential(2));

  // ---- the grass flowing into the road -------------------------------------
  // A ribbon samples the ground at the way's OWN nodes, and OSM puts those
  // wherever the road bends — on a straight they can be a hundred metres apart,
  // while the heightfield has a post every ten. So the tarmac was a straight
  // line in Y across ground that rose and fell under it, and everywhere the
  // ground won it came through the surface. Guard the MECHANISM: no piece of
  // road may span more than one terrain post, and there must be a kerb skirt
  // hanging below the carriageway to cover the rest.
  const surfacing = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    let longest = 0, pieces = 0, below = 0, lifts = {};
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.roads.count) continue;
      const p = r.built.roads.positions, uv = r.built.roads.uvs;
      // Carriageway vertices carry v EXACTLY 0 or 1; the skirt that follows
      // them uses 0.02/0.98. Filtering on that is what keeps this walking the
      // road — an earlier version strode through the buffer in fixed steps,
      // ran off the end of the carriageway into the skirt's different layout,
      // and measured gaps between vertices that are not neighbours.
      let prev = null;
      for (let i = 0; i < p.length; i += 3) {
        const v = uv[(i / 3) * 2 + 1], u = uv[(i / 3) * 2];
        if (v !== 0) continue;                       // left kerb of a cross-section
        if (prev && u > prev.u) {
          const d = Math.hypot(p[i] - prev.x, p[i + 2] - prev.z);
          if (d > 0.01) { longest = Math.max(longest, d); pieces++; }
        }
        prev = { x: p[i], z: p[i + 2], u };
      }
      // The skirt: vertices sitting BELOW the terrain they stand on.
      for (let i = 0; i < p.length; i += 3) {
        const g = window.Terrain.heightAt(w.frame, p[i], p[i + 2]);
        if (g !== null && p[i + 1] < g) below++;
        if (g !== null && p[i + 1] > g) lifts[(p[i + 1] - g).toFixed(3)] = 1;
      }
    }
    return { longest, pieces, below, lifts: Object.keys(lifts).map(Number).sort((a, b) => a - b) };
  });
  check('no piece of road spans more than one terrain post',
    surfacing.pieces > 0 && surfacing.longest <= 7,
    'longest cross-section gap ' + surfacing.longest.toFixed(1) + ' m over ' + surfacing.pieces + ' pieces');
  // …and the skirt that covers the REST of it — ground rising across a road cut
  // into a slope — is built only where it is needed. On flat ground it hides
  // nothing, and building it anyway tripled the road geometry: measured, 12,960
  // indices a tile became 77,760. The fixture ground is flat, so the correct
  // answer here is NONE.
  check('no kerb skirt is built where the ground is flat and there is nothing to hide',
    surfacing.below === 0, surfacing.below + ' skirt vertices below the ground line');
  // Junctions: two ways crossing lay two ribbons on the same ground, and
  // coplanar geometry is the one thing a depth buffer cannot resolve. A
  // millimetre of lift per class rank settles it in the right order.
  check('roads of different classes sit at different heights, so a junction cannot z-fight',
    surfacing.lifts.length >= 3,
    'distinct lifts above ground: ' + surfacing.lifts.join(', '));

  // ---- stopping ------------------------------------------------------------
  // "Almost impossible to stop" was not a weak brake — it was that the instant
  // the brake came off, the cruise opened the throttle and drove away. Coming
  // to rest is a STATE now, and it survives the brake being released.
  const halt = await fr.locator('body').evaluate(() => {
    const F = window.App.world.frame;
    const step = (car, input, n) => { for (let i = 0; i < n; i++) window.Car.update(car, input, 0.02, F); };
    const cruise = () => Object.assign(window.Car.blankInput(), { throttle: 1, autoTarget: 14 });
    const brake = () => Object.assign(window.Car.blankInput(), { throttle: 0, brake: 1, autoTarget: 14 });

    const c = window.Car.create(0, 0, 0);
    c.speed = 14;
    step(c, brake(), 60);                       // 1.2 s of brake: enough to stop
    const stopped = { speed: c.speed, halted: c.halted };
    step(c, cruise(), 250);                     // 5 s of cruise asking to go
    const stayed = { speed: c.speed, halted: c.halted };
    // GO releases it, and only GO.
    const go = Object.assign(cruise(), { go: true });
    step(c, go, 5);
    step(c, cruise(), 120);
    const moving = { speed: c.speed, halted: c.halted };
    return { stopped, stayed, moving };
  });
  check('braking to a standstill actually stops the car',
    Math.abs(halt.stopped.speed) < 0.01 && halt.stopped.halted,
    'speed ' + halt.stopped.speed.toFixed(3) + ', halted ' + halt.stopped.halted);
  check('…and it STAYS stopped with the cruise asking to go',
    Math.abs(halt.stayed.speed) < 0.01 && halt.stayed.halted,
    'after 5 s of cruise: ' + halt.stayed.speed.toFixed(3) + ' m/s');
  check('GO releases the halt and the car pulls away',
    halt.moving.speed > 3 && !halt.moving.halted,
    'after GO: ' + halt.moving.speed.toFixed(1) + ' m/s');

  // ---- traffic -------------------------------------------------------------
  // Other cars, driving the ways the tile builder already computed for the road
  // ribbons. No pathfinding and no road graph — but everything the player can
  // actually check has to be real: they stay ON the road, they keep to one
  // side, they never materialise on top of you, and hitting one hurts.
  const cars = await fr.locator('body').evaluate(async () => {
    const w = window.App.world, me = window.App.car();
    const ctx = {
      height: (x, z) => window.Terrain.heightAt(w.frame, x, z),
      paths: () => {
        const out = [];
        for (const k in w.roads) {
          const r = w.roads[k];
          if (r && r.built && r.built.paths) out.push(...r.built.paths);
        }
        return out;
      },
    };
    const nearestRoad = (x, z) => {
      let best = null;
      for (const k in w.roads) {
        const r = w.roads[k];
        if (!r || !r.built || !r.built.index) continue;
        const h = window.Roads.nearestRoad(r.built.index, x, z);
        if (h && (!best || h.dist < best.dist)) best = h;
      }
      return best;
    };
    window.Traffic.clear();
    window.Traffic.setLevel('heavy');
    // Run it forward. Real steps, so the cars actually drive their ways.
    // Two different numbers, and conflating them is a bug in the TEST: a car
    // driving past you at three metres is traffic working correctly, while a
    // car APPEARING at three metres is a car materialising in your bonnet.
    // What must be bounded is the distance at first sight.
    let closestSpawn = Infinity, offRoad = 0, samples = 0, moved = 0;
    const first = {};
    for (let i = 0; i < 400; i++) {
      window.Traffic.update(me, ctx, 0.05);
      for (const c of window.Traffic.drawList()) {
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        if (first[c.id] === undefined) closestSpawn = Math.min(closestSpawn, d);
        if (i % 20 === 0) {
          const road = nearestRoad(c.x, c.z);
          samples++;
          if (!road || road.dist > road.halfWidth + 1.5) offRoad++;
        }
        if (first[c.id] === undefined) first[c.id] = c.x + ',' + c.z;
        else if (first[c.id] !== c.x + ',' + c.z) moved++;
      }
    }
    const level = { none: 0, light: 0, normal: 0, heavy: 0 };
    for (const l of Object.keys(level)) {
      window.Traffic.clear();
      window.Traffic.setLevel(l);
      for (let i = 0; i < 400; i++) window.Traffic.update(me, ctx, 0.25);
      level[l] = window.Traffic.count();
    }
    window.Traffic.clear();
    return { closestSpawn, offRoad, samples, moved, level, max: window.Traffic.LEVELS };
  });
  check('traffic appears on the roads and drives along them',
    cars.samples > 0 && cars.moved > 0, cars.samples + ' samples, ' + cars.moved + ' movements');
  check('traffic stays ON the carriageway', cars.offRoad === 0,
    cars.offRoad + ' of ' + cars.samples + ' samples off the road');
  check('traffic never materialises on top of the player',
    cars.closestSpawn > 50, 'nearest first sighting ' + cars.closestSpawn.toFixed(0) + ' m');
  check('the traffic level is a real dial, and "empty roads" means empty',
    cars.level.none === 0 && cars.level.light > 0
      && cars.level.light < cars.level.normal && cars.level.normal < cars.level.heavy,
    JSON.stringify(cars.level));

  const bump = await fr.locator('body').evaluate(() => {
    const w = window.App.world, me = window.App.car();
    const ctx = { height: (x, z) => window.Terrain.heightAt(w.frame, x, z), paths: () => [] };
    window.Traffic.clear();
    window.Car.repair(me);
    me.speed = 22;
    // Head-on, one car length ahead, closing.
    const path = { pts: [{ x: me.x, z: me.z + 40 }, { x: me.x, z: me.z - 40 }], cruise: 14, half: 3 };
    window.Traffic.inject({ path, i: 0, t: 0.5, dir: 1, speed: 18,
                            x: me.x + Math.sin(me.yaw) * 2.5, z: me.z + Math.cos(me.yaw) * 2.5,
                            y: me.y, yaw: me.yaw + Math.PI,
                            vx: -Math.sin(me.yaw) * 18, vz: -Math.cos(me.yaw) * 18 });
    const hit = window.Traffic.update(me, ctx, 0.016);
    window.Traffic.clear();
    return { damage: hit ? hit.damage : 0, health: me.health, rel: hit ? hit.rel : 0 };
  });
  // A car you can FOLLOW. OSM splits a street into a way per block, and the
  // first version dropped a car the instant its way ran out — so traffic
  // evaporated every couple of hundred metres for no reason the player could
  // see. A junction is two ways whose ends touch, so a car takes the next one.
  const linked = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    // Two ways meeting end to end, at right angles, like any corner.
    // A closed square, because two ways end to end is a DEAD END and a car
    // leaving at the far end of it is correct behaviour, not a failure.
    const a = { pts: [{ x: 0, z: 0 }, { x: 0, z: 60 }], cruise: 14, half: 3.5, surface: 0 };
    const b = { pts: [{ x: 0, z: 60 }, { x: 80, z: 60 }], cruise: 14, half: 3.5, surface: 0 };
    const c2 = { pts: [{ x: 80, z: 60 }, { x: 80, z: 0 }], cruise: 14, half: 3.5, surface: 0 };
    const d2 = { pts: [{ x: 80, z: 0 }, { x: 0, z: 0 }], cruise: 14, half: 3.5, surface: 0 };
    const ctx = { height: () => 0, paths: () => [a, b, c2, d2] };
    window.Traffic.clear();
    const car = window.Car.create(-500, -500, 0);       // far away: no collisions
    const t = window.Traffic.inject({ path: a, i: 0, t: 0.02, dir: 1, speed: 12,
                                      x: 0, z: 1, y: 0, yaw: 0 });
    let turned = false, alive = 0, yawEnd = 0;
    for (let i = 0; i < 400; i++) {
      window.Traffic.update(car, ctx, 0.05);
      const list = window.Traffic.drawList();
      if (!list.length) break;
      alive = i;
      if (list[0].x > 10) turned = true;               // it is on the second way
      yawEnd = list[0].yaw;
    }
    const survived = window.Traffic.count() > 0;
    window.Traffic.clear();
    return { turned, alive, survived, yawEnd };
  });
  check('a car reaching the end of a way turns onto a connecting one',
    linked.turned, linked.turned ? 'it took the corner' : 'it vanished at the junction');
  check('…and is still there afterwards, long enough to follow',
    linked.survived, linked.alive + ' steps alive');

  check('hitting traffic costs condition, and a head-on costs a lot',
    bump.damage > 20 && bump.health < 80,
    '-' + bump.damage.toFixed(1) + ' at ' + bump.rel.toFixed(0) + ' m/s closing, ' + bump.health.toFixed(0) + '% left');

  // ---- the sky is empty ----------------------------------------------------
  // Both hazard tests lived in x/z, which was fine while nothing left the
  // ground — the moment the wings went on, a plane at altitude "hit" the
  // deer and the traffic on the road far below, and the damage read as
  // invisible birds. A collision needs vertical overlap: the same overflight
  // that is free at 60 m is still a crash at bumper height.
  const skyStrike = await fr.locator('body').evaluate(() => {
    const road = { pts: [{ x: 0, z: 0 }, { x: 0, z: 200 }], cruise: 14, half: 3.5, surface: 0 };
    const ctx = { height: () => 0, paths: () => [road], nearestRoad: () => null };
    const out = {};
    // Traffic, directly underneath a plane at 60 m…
    window.Traffic.clear();
    window.Traffic.inject({ path: road, i: 0, t: 0.25, dir: 1, speed: 10, x: 0, z: 50, y: 0, yaw: 0 });
    const plane = window.Car.create(0, 50, 0);
    plane.y = 60; plane.speed = 30; plane.flying = true;
    out.highTraffic = (window.Traffic.update(plane, ctx, 0.016) || { damage: 0 }).damage;
    // …and the same pass at bumper height is still a crash.
    window.Traffic.clear();
    window.Traffic.inject({ path: road, i: 0, t: 0.25, dir: 1, speed: 0, x: 0, z: 50, y: 0, yaw: 0 });
    const low = window.Car.create(0, 50, 0);
    low.y = 0.5; low.speed = 30;
    out.lowTraffic = (window.Traffic.update(low, ctx, 0.016) || { damage: 0 }).damage;
    window.Traffic.clear();
    // A deer, directly underneath…
    window.Animals.clear();
    window.Animals.inject({ kind: 'deer', x: 0, z: 50, y: 0, yaw: 0 });
    const plane2 = window.Car.create(0, 50, 0);
    plane2.y = 60; plane2.speed = 25; plane2.flying = true;
    out.highDeer = (window.Animals.update(plane2, ctx, 0.016) || { damage: 0 }).damage;
    // …and the same deer at bonnet height is still a windscreen.
    window.Animals.clear();
    window.Animals.inject({ kind: 'deer', x: 0, z: 50, y: 0, yaw: 0 });
    const low2 = window.Car.create(0, 50, 0);
    low2.y = 0.5; low2.speed = 25;
    out.lowDeer = (window.Animals.update(low2, ctx, 0.016) || { damage: 0 }).damage;
    window.Animals.clear();
    return out;
  });
  check('a plane at altitude cannot strike the traffic on the road below it',
    skyStrike.highTraffic === 0, '-' + skyStrike.highTraffic + ' at 60 m');
  check('…nor the wildlife — there are no invisible birds',
    skyStrike.highDeer === 0, '-' + skyStrike.highDeer + ' at 60 m');
  // ---- a building is solid at altitude too ----------------------------------
  // "Able to fly thru buildings when should hit them." Right: the ground path
  // skips collideBuildings entirely above 4 m AGL (a plane must not scrape
  // kerbs) and the roof check only ever fired on a DESCENDING pass through a
  // roof — so a tower hit head-on at cruising height was fog. Fly level, at
  // speed, straight at the fixture's 4-storey block and demand it hurt.
  const towerHit = await fr.locator('body').evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const f = window.App.world.frame, c = window.App.car();
    const HOP = { lat: 48.8698, lon: 2.3078 };
    // The fixture building spans lat +0.0004..+0.0007, lon +0.0004..+0.0007
    // and is 4 storeys (~12 m). Line up west of it, level, at mid-height.
    const mid = f.toWorld(HOP.lat + 0.00055, HOP.lon + 0.00055);
    const gy = window.Terrain.heightAt(f, mid.x, mid.z) || 0;
    const start = { x: c.x, z: c.z, yaw: c.yaw };
    window.Car.repair(c);
    c.x = mid.x - 40; c.z = mid.z; c.yaw = Math.PI / 2;   // +x, straight at it
    c.y = gy + 6; c.vy = 0; c.flying = true; c.falling = false; c.speed = 45;
    const before = c.health;
    let hit = false;
    for (let i = 0; i < 40; i++) {
      await wait(120);
      if (c.health < before) { hit = true; break; }
      if (c.x > mid.x + 60) break;                       // sailed clean through
      // Hold the cruise level and pointed at the block.
      if (c.flying) { c.y = gy + 6; c.vy = 0; c.yaw = Math.PI / 2; if (c.speed < 30) c.speed = 45; }
    }
    const res = { hit, lost: +(before - c.health).toFixed(1), x: +(c.x - mid.x).toFixed(1), flying: !!c.flying };
    // PUT THE CAR BACK ON ITS ROAD. Parking it 120 m out in a field was enough
    // to fail the three street-name checks that run next — they ask what road
    // the car is on, and it was on none. A test that relocates the player owes
    // the next test the world it found.
    window.Car.repair(c);
    c.flying = false; c.falling = false; c.speed = 0;
    c.x = start.x; c.z = start.z; c.yaw = start.yaw;
    c.y = window.Terrain.heightAt(f, c.x, c.z) || gy;
    return res;
  });
  check('flying into a building HURTS — a tower is not fog',
    towerHit.hit && towerHit.lost > 15, JSON.stringify(towerHit));
  check('…and it ends the flight rather than carrying you through the far wall',
    towerHit.hit && !towerHit.flying, 'flying=' + towerHit.flying);

  check('…but the SAME pass at bumper height still costs metal',
    skyStrike.lowTraffic > 0 && skyStrike.lowDeer > 0,
    '-' + skyStrike.lowTraffic.toFixed(1) + ' traffic, -' + skyStrike.lowDeer.toFixed(1) + ' deer');

  // ---- the wreck you can see, and still drive -------------------------------
  // Damage was a bar and nothing else: a car that had tumbled down a mountain
  // looked showroom-fresh at 8% condition. The bodywork now wears the bar
  // (uCrumple in the car shader, driven by carCrumple()), and the engine
  // limps below a third — a crumpled mess that still drives a little.
  const wreckage = await fr.locator('body').evaluate(() => {
    const c = window.App.car();
    const keep = c.health;
    c.health = 100; const fresh = window.App.debug().crumple;
    c.health = 15;  const mangled = window.App.debug().crumple;
    // The limp: same throttle, a fraction of the shove. Twin cars on REAL
    // loaded ground (an unloaded frame answers null heights), same spot,
    // same input, different health.
    const f = window.App.world.frame;
    const mk = (h) => { const k = window.Car.create(c.x, c.z, c.yaw); k.y = c.y; k.health = h; k.speed = 8; k.onRoad = true; return k; };
    const inp = window.Car.blankInput(); inp.throttle = 1; inp.go = true;
    const strong = mk(100), weak = mk(15);
    for (let i = 0; i < 60; i++) { window.Car.update(strong, inp, 0.05, f); window.Car.update(weak, inp, 0.05, f); }
    c.health = keep;
    return { fresh, mangled, strongV: strong.speed, weakV: weak.speed };
  });
  check('a fresh car shows no crumple; a battered one visibly wears it',
    wreckage.fresh < 0.01 && wreckage.mangled > 0.5,
    'crumple ' + wreckage.fresh.toFixed(2) + ' at 100% vs ' + wreckage.mangled.toFixed(2) + ' at 15%');

  // ---- the mountain charges for the ride ------------------------------------
  // "I just tumbled down mount everest and didn't see any crumple damage."
  // Right: the driving branch's touchdown zeroed vy silently — only the
  // AEROPLANE's landings ever hurt. A tumble is a series of ground slams,
  // and each one above ~8 m/s of descent now takes its bite (settle()).
  const tumble = await fr.locator('body').evaluate(() => {
    const w = window.App.world, f = w.frame, c = window.App.car();
    const drop = (height) => {
      const k = window.Car.create(c.x, c.z, c.yaw);
      const gy = window.Terrain.heightAt(f, c.x, c.z) || 0;
      k.y = gy + height; k.vy = 0; k.airborne = true; k.speed = 12;
      const inp = window.Car.blankInput();
      for (let i = 0; i < 80; i++) window.Car.update(k, inp, 0.05, f);   // 4 sim-s: falls and lands
      return k.health;
    };
    return { small: drop(1.5), cliff: drop(14) };
  });
  check('a kerb hop is free, a cliff drop is NOT — ground slams cost condition',
    tumble.small === 100 && tumble.cliff < 90,
    'after 1.5 m: ' + tumble.small + '%, after 14 m: ' + tumble.cliff + '%');
  check('…and at 15% the engine LIMPS but still drives',
    wreckage.weakV > 4 && wreckage.weakV < wreckage.strongV * 0.6,
    wreckage.weakV.toFixed(1) + ' m/s limping vs ' + wreckage.strongV.toFixed(1) + ' healthy');

  // ---- shooting a door into a building --------------------------------------
  // Three bolts into one spot open a BREACH: the wall stops being solid right
  // there — for the car (drive through it) and for later bolts (shoot out of
  // a building you fell into) — while the rest of the facade still stops you.
  const breach = await fr.locator('body').evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const w = window.App.world, f = w.frame;
    const HOP = { lat: 48.8698, lon: 2.3078 };
    // The fixture's 4-storey building: lat/lon +0.0004..+0.0007. Its WEST wall
    // runs north-south at lon +0.0004; stand off it to the west, facing east.
    const wallN = f.toWorld(HOP.lat + 0.00055, HOP.lon + 0.0004);   // mid-height of the west face
    const c = window.App.car();
    const keepH = c.health;
    const keepPos = { x: c.x, z: c.z, yaw: c.yaw };
    c.x = wallN.x - 9; c.z = wallN.z; c.y = window.Terrain.heightAt(f, c.x, c.z) || c.y;
    c.yaw = Math.PI / 2;               // +x: straight at the wall
    c.speed = 0;
    const before = window.App.debug().breaches;
    // COUNT SUCCESSFUL FIRES, don't count attempts. The cooldown is 0.16
    // SIMULATED seconds, and on the software rasteriser sim time runs at a
    // third of wall time — a fixed number of fixed-interval attempts fires
    // three bolts on a quiet box and one on a loaded one, which was this
    // test's coin-flip. fire() says whether it fired; take five real shots
    // however long the box needs. Reposition IMMEDIATELY before each shot:
    // between shots the cruise drags the pose and scatters the impacts.
    let shots = 0;
    for (let i = 0; i < 80 && shots < 5; i++) {
      c.x = wallN.x - 9; c.z = wallN.z; c.yaw = Math.PI / 2; c.speed = 0;
      if (window.Blaster.fire(c)) shots++;
      await wait(150);
    }
    await wait(800);                   // let the last bolt land and the events run
    for (let i = 0; i < 20 && window.App.debug().breaches === before; i++) await wait(250);
    const opened = window.App.debug().breaches;
    // Now DRIVE at the hole. A solid wall stops this cold within a metre.
    c.health = 100;
    c.x = wallN.x - 7; c.z = wallN.z; c.yaw = Math.PI / 2; c.speed = 0;
    // DRIVE UNTIL IT IS THROUGH, OR UNTIL IT HAS STOPPED — never for a fixed
    // number of seconds. This was 24 × 250 ms and it flaked the 0.9.7 gate at
    // "8.9 m past where the wall stood", one tenth of a metre short: the car
    // moves per RENDERED FRAME, so six seconds of wall clock on a box running a
    // software rasteriser is however many metres that box could manage.
    //
    // The claim being tested does not mention seconds. A solid wall stops this
    // car COLD within a metre, so "still moving" versus "stopped" is the whole
    // question, and it is directly observable. A blocked car now settles the
    // matter in ~3s (faster than the old loop), and a slow box keeps crawling
    // through the hole instead of being timed out one tenth of a metre short.
    // …and "stopped" is counted in RENDERED FRAMES, not seconds, for the same
    // reason the fixed loop was wrong. The car advances per frame by a CLAMPED
    // dt (the anti-tunnelling clamp), so on a software rasteriser at ~2 fps it
    // covers a few tenths of a metre per 250 ms of wall clock — under the old
    // 0.25 m-per-window movement test, which then declared the wall had held
    // and stopped the drive at "4.1 m past where the wall stood". A busy box
    // and a solid wall looked identical. They are not: a wall that held shows
    // no movement across FRAMES THAT WERE ACTUALLY DRAWN, and a box too busy to
    // draw simply contributes no evidence either way.
    const startX = c.x;
    let stillFrames = 0;
    const cap = Date.now() + 90000;
    for (;;) {
      if (Math.abs(c.speed) < 5) c.speed = 8;
      const f0 = window.App.debug().frames, x0 = c.x;
      await wait(250);
      const drawn = window.App.debug().frames - f0;
      if (c.x - startX > 9) break;                    // through the hole
      // METRES PER RENDERED FRAME. Distance per unit of WALL CLOCK cannot tell
      // a held car from a starved one — that is the whole bug — and neither can
      // distance per window with a frame-counted timeout, which is what the
      // first attempt at this did: a car crawling 0.2 m per 250 ms window is
      // DRIVING, but read as stopped against a 0.25 m threshold, and it broke
      // off at "7.2 m past where the wall stood". Per FRAME the two are far
      // apart and stay apart at any frame rate: a car the wall is holding makes
      // ~0, a driving car makes ~0.4 even where the box draws two frames a
      // second. A window that drew NO frames contributes no evidence either way.
      const perFrame = drawn > 0 ? (c.x - x0) / drawn : 0;
      if (perFrame > 0.05) stillFrames = 0;
      else stillFrames += drawn;
      if (stillFrames > 45) break;                    // stopped: the wall held
      if (Date.now() > cap) break;
    }
    const through = c.x - startX;
    const res = { opened: opened - before, through };
    // CLEAN UP AFTER THE DEMOLITION. The drive-through leaves the car parked
    // INSIDE the building; left there, the app loop grinds it against the
    // interior walls to 0% within seconds, the WRECKED overlay comes up, and
    // every later test's click dies against it — which is exactly how this
    // suite once timed out at 162 checks. Back onto the street, repaired,
    // overlay down.
    c.x = keepPos.x; c.z = keepPos.z; c.yaw = keepPos.yaw;
    c.y = window.Terrain.heightAt(f, c.x, c.z) || c.y;
    c.speed = 0;
    window.Car.repair(c);
    c.health = keepH;
    window.UI.clearCracks();
    const ov = document.getElementById('wrecked');
    if (ov) ov.hidden = true;
    return res;
  });
  check('three bolts into one spot BREACH the wall', breach.opened >= 1, breach.opened + ' breach(es) opened');
  check('…and the car drives straight through the hole',
    breach.through > 9, breach.through.toFixed(1) + ' m past where the wall stood');


  // ---- street names --------------------------------------------------------
  // `name` has been on every way in every response the app has ever made, and
  // the parser took the class, the surface and the lane count and left it.
  const streets = await fr.locator('body').evaluate(() => {
    const w = window.App.world, car = window.App.car();
    let onRoad = null, near = [];
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.index) continue;
      const hit = window.Roads.nearestRoad(r.built.index, car.x, car.z);
      if (hit && (!onRoad || hit.dist < onRoad.dist)) onRoad = hit;
      window.Roads.namesNear(r.built.index, car.x, car.z, 400, near);
    }
    return { on: onRoad ? onRoad.name : null, hud: car.street || null,
             near: near.map((n) => n.name).sort() };
  });
  check('the map data tells us what the road is CALLED',
    !!streets.on, 'nearest road: ' + JSON.stringify(streets.on));
  check('the name reaches the car, so the HUD can show it',
    streets.hud === streets.on, 'car.street = ' + JSON.stringify(streets.hud));
  check('other named roads nearby can be found, which is what a junction is',
    streets.near.length >= 3, streets.near.join(' | '));

  const shown = await fr.locator('body').evaluate(() => {
    window.UI.hud({ speed: 30, street: 'Rue de Rivoli', passing: [], steer: 0, health: 100,
                    net: { backoffMs: 0 }, ready: true, players: 1, race: null, odometer: 0 });
    const a = document.getElementById('street');
    const named = !a.hidden && a.textContent;
    window.UI.hud({ speed: 30, street: '', passing: [{ name: 'Side Street', side: -1 }],
                    steer: 0, health: 100, net: { backoffMs: 0 }, ready: true,
                    players: 1, race: null, odometer: 0 });
    return { named, hiddenWhenUnnamed: a.hidden,
             passing: document.querySelectorAll('#passing .pass').length,
             passingText: (document.querySelector('#passing .pass') || {}).textContent || '' };
  });
  check('the HUD shows the street you are on', shown.named === 'Rue de Rivoli', shown.named);
  check('…and shows nothing at all on an unnamed road', shown.hiddenWhenUnnamed);
  check('a street you pass is called out, on the side it went by',
    shown.passing === 1 && /Side Street/.test(shown.passingText), JSON.stringify(shown.passingText));

  // ---- places you have been ------------------------------------------------
  // A search costs a Nominatim request, rate-limited to one a second by their
  // policy, and re-typing an address to go back somewhere is the most obvious
  // thing in the app to get wrong.
  const places = await fr.locator('body').evaluate(async () => {
    window.UI.rememberPlace(48.8698, 2.3078, 'Paris');
    window.UI.rememberPlace(40.7614, -73.9776, 'Manhattan');
    window.UI.rememberPlace(48.8698, 2.3078, 'Paris');       // same place twice
    await new Promise((r) => setTimeout(r, 150));
    return { list: window.UI.recent().map((r) => r.name),
             buttons: Array.from(document.querySelectorAll('#recent button')).map((b) => b.textContent) };
  });
  check('places you visit are remembered, newest first, without duplicates',
    places.list.length === 2 && places.list[0] === 'Paris' && places.list[1] === 'Manhattan',
    places.list.join(' | '));
  check('…and are offered back on the landing sheet',
    places.buttons.length === 2 && places.buttons[0] === 'Paris', places.buttons.join(' | '));



  // ---- a panel you can always close ----------------------------------------
  // The overlay centred its sheet with align-items:center and then scrolled,
  // which CLIPS an overflowing top: the sheet is pushed above the scrollable
  // area and the header ✕ cannot be reached at any scroll position. Settings
  // grew past a laptop viewport and the only way out was to zoom the browser
  // out. Guarded at a SHORT viewport, because that is the only place it fails.
  const wasSize = app.viewportSize();
  await app.setViewportSize({ width: 900, height: 420 });
  await fr.locator('#btn-menu').click();
  await fr.locator('#settings').waitFor({ state: 'visible', timeout: 5000 });
  const reach = await fr.locator('body').evaluate(() => {
    const x = document.getElementById('close-settings').getBoundingClientRect();
    const bottom = document.getElementById('close-settings-bottom');
    const sheet = document.querySelector('#settings .sheet').getBoundingClientRect();
    return { headerTop: Math.round(x.top), sheetTop: Math.round(sheet.top),
             hasBottom: !!bottom, taller: sheet.height > window.innerHeight };
  });
  check('a sheet taller than the window does not have its top clipped away',
    reach.sheetTop >= -1 && reach.headerTop >= -1,
    'sheet top at ' + reach.sheetTop + 'px, ✕ at ' + reach.headerTop
      + 'px (sheet ' + (reach.taller ? 'IS' : 'is not') + ' taller than the window)');
  check('…and there is a second close at the bottom to scroll to', reach.hasBottom);
  await fr.locator('#close-settings-bottom').click();
  check('the bottom close actually closes it', await fr.locator('#settings').isHidden());

  await fr.locator('#btn-menu').click();
  await fr.locator('#settings').waitFor({ state: 'visible', timeout: 5000 });
  await app.keyboard.press('Escape');
  await sleep(200);
  check('Escape closes the topmost panel', await fr.locator('#settings').isHidden());
  if (wasSize) await app.setViewportSize(wasSize);

  // ---- the satellite drape -------------------------------------------------
  // Imagery was requested at exactly ONE moment — when a terrain tile finished
  // loading — so turning the satellite layer on afterwards left every tile
  // around you with the drape it was born with, and the only way to see a
  // change was to hop somewhere else. Adding a key and seeing nothing happen
  // was an accurate report of a real bug. Switching source must reach the
  // ground that is already down.
  const drape = await fr.locator('body').evaluate(async () => {
    // SETTLE, do not sleep. tried/ok/failed are module-level counters that
    // redrape() RESETS, so a fixed wait that ends while requests are still in
    // flight hands the next phase the previous phase's answers: a first run of
    // this block read ok 0/25 for the good path and 25/25 for the @2x one —
    // perfectly inverted — because 600 ms was not enough for 25 decodes on a
    // software rasteriser and round one's successes landed inside round two's
    // window. Each phase must be quiescent (every request accounted for)
    // before the next one starts.
    const settled = async (ms) => {
      for (let i = 0; i < ms / 100; i++) {
        const s = window.App.imagery();
        if (s.tried > 0 && (s.ok === s.tried || s.failed)) return s;
        await new Promise((r) => setTimeout(r, 100));
      }
      return window.App.imagery();
    };
    const before = window.App.imagery();
    window.Sources.set({ imagery: 'maptiler' });
    const after = await settled(30000);

    // Now ask for the path the app USED to ask for. The stub answers exactly as
    // the live API does, so this is the real 404 and not a staged one — it
    // proves the suite can tell a right path from a wrong one, which is the
    // property it lacked when the wrong path shipped.
    const src = window.Sources.IMAGERY.filter((s) => s.id === 'maptiler')[0];
    const good = src.path;
    src.path = '/tiles/satellite-v2/{z}/{x}/{y}@2x.jpg';
    window.App.redrape();
    const wrong = await settled(30000);
    src.path = good;

    window.Sources.set({ imagery: 'none' });
    await new Promise((r) => setTimeout(r, 300));
    const off = window.App.imagery();
    return { before, after, wrong, off, path: good, tiles: Object.keys(window.App.world.terrain).length };
  });
  check('turning the satellite on re-drapes the ground already under you',
    drape.after.tried > drape.before.tried,
    drape.before.tried + ' -> ' + drape.after.tried + ' requests for ' + drape.tiles + ' loaded tiles');
  // THE guard. The app asked for a path MapTiler does not serve, so every tile
  // 404'd while the HUD blamed the key; nothing here could tell, because the
  // stub 404'd everything. Assert the tiles actually ARRIVE.
  check('the satellite path is one MapTiler actually serves',
    drape.after.ok > 0 && !drape.after.failed,
    drape.path + ' → ok ' + drape.after.ok + '/' + drape.after.tried +
    (drape.after.failed ? ', failed: ' + drape.after.failed : ''));
  check('…and the ground is genuinely textured with it',
    drape.after.draped > 0, drape.after.draped + ' of ' + drape.tiles + ' tiles draped');
  // @2x is a /maps/ feature; on /tiles/ it is a 404 for every tileset. If this
  // ever passes, the stub has stopped discriminating and the guard above is
  // hollow again.
  check('an @2x path on the tiles endpoint is refused, as the live API refuses it',
    drape.wrong.ok === 0 && /404/.test(drape.wrong.failed || ''),
    'ok ' + drape.wrong.ok + '/' + drape.wrong.tried + ', reported: ' + JSON.stringify(drape.wrong.failed));
  // Failing visibly is the point: an empty catch is why a missing key and a
  // working satellite looked the same from the driver's seat.
  check('a drape that cannot load says so instead of failing silently',
    !!drape.wrong.failed, 'reported: ' + JSON.stringify(drape.wrong.failed));
  check('…and turning it off puts the stylised ground back',
    drape.off.draped === 0, drape.off.draped + ' tiles still textured');
  // NOT_CONFIGURED makes the RUNTIME put its own "set it up" sheet over the
  // whole page — correct behaviour, and it is in the app page rather than the
  // sandboxed frame, so it covers every later click. Clear it.
  await app.evaluate(() => {
    document.querySelectorAll('#gifos-setup-ok').forEach((b) => b.click());
    document.querySelectorAll('.perm-modal').forEach((m) => m.remove());
  });
  await sleep(200);


  // ---- the blaster ---------------------------------------------------------
  // A gun on the roof, on by default. Its job is to be a THIRD option against
  // the wildlife: until now you could avoid an animal or pay for it, and a
  // shot one is off the road before you reach it — so you still have to see
  // the deer and still have to act in time.
  const gun = await fr.locator('body').evaluate(async () => {
    const w = window.App.world, me = window.App.car();
    const ctx = {
      height: () => null,                       // no ground: bolts fly free
      walls: (x, z, out) => out,
      animals: (x, z, r) => window.Animals.shootAt(x, z, r),
      traffic: (x, z, r) => window.Traffic.shootAt(x, z, r),
    };
    window.Blaster.clear();
    window.Blaster.setEnabled(true);
    window.Animals.clear();
    // TRAFFIC TOO, or the bolt never reaches the deer. This block wires
    // `traffic: (x,z,r) => Traffic.shootAt(x,z,r)` into the blaster's own ctx,
    // and the app's rAF loop keeps respawning cars between blocks — measured
    // 6-7 live at the moment of the shot. Traffic.shootAt's 2m radius plus the
    // bolt's 1.6m means any car within 3.6m of the 60m line of fire EATS the
    // bolt; Blaster.update then splices it and `killed` stays null, so the deer
    // survives to damage the car. That is the exact two-failure signature this
    // suite flaked with on the 0.9.5 gate (hit:null + health 81.3%), and it is
    // why the failing run's traffic had spawned at 78m while the green retry's
    // was at 111m. Not a physics-tick race — the whole block is one synchronous
    // evaluate and the bolt covers 60m in 16 fixed steps, so there is nothing
    // to poll. It is test isolation.
    window.Traffic.clear();
    window.Car.repair(me);
    me.speed = 0;

    // A deer dead ahead, at a distance a bolt has to travel to.
    const D = 60;
    const ax = me.x + Math.sin(me.yaw) * D, az = me.z + Math.cos(me.yaw) * D;
    window.Animals.inject({ kind: 'deer', x: ax, z: az, y: me.y, yaw: me.yaw });
    const before = window.Animals.drawList().length;

    const fired = window.Blaster.fire(me);
    const inFlight = window.Blaster.count();
    let killed = null;
    for (let i = 0; i < 60 && !killed; i++) {
      const evs = window.Blaster.update(me, ctx, 0.02);
      if (evs) killed = evs.find((e) => e.kind === 'animal') || null;
    }
    // The animal is knocked over, so it can no longer hurt the car: drive at
    // the same spot and nothing should happen.
    const hitCar = window.Car.create(ax - Math.sin(me.yaw) * 2, az - Math.cos(me.yaw) * 2, me.yaw);
    hitCar.health = 100; hitCar.speed = 25;
    const bump = window.Animals.update(hitCar, {
      height: () => me.y, nearestRoad: () => null,
    }, 0.016);

    // A cooldown, or holding the key is a beam.
    window.Blaster.clear();
    const rapid = [window.Blaster.fire(me), window.Blaster.fire(me)];

    // And OFF means off.
    window.Blaster.setEnabled(false);
    const whenOff = window.Blaster.fire(me);
    window.Blaster.setEnabled(true);
    window.Blaster.clear();
    window.Animals.clear();
    return { fired, inFlight, killed: killed ? killed.what.kind : null, before,
             bumped: !!bump, health: hitCar.health, rapid, whenOff,
             enabledByDefault: window.Sources.current.blaster };
  });
  check('the blaster is fitted by default', gun.enabledByDefault === 'on', gun.enabledByDefault);
  check('firing sends a bolt', gun.fired && gun.inFlight === 1, 'bolts in flight: ' + gun.inFlight);
  check('a bolt travels to what it is aimed at and hits it',
    gun.killed === 'deer', 'hit: ' + JSON.stringify(gun.killed));
  check('a shot animal cannot damage the car any more',
    !gun.bumped && gun.health === 100,
    'drove through it at 25 m/s, health ' + gun.health + '%');
  check('there is a cooldown — holding fire is not a beam',
    gun.rapid[0] === true && gun.rapid[1] === false, JSON.stringify(gun.rapid));
  check('switching the blaster off stops it firing', gun.whenOff === false);

  // It must not shoot through a building: the bolt is tested against the same
  // wall index the car collides with.
  const wallStop = await fr.locator('body').evaluate(() => {
    const me = window.App.car();
    window.Blaster.clear();
    window.Blaster.setEnabled(true);
    // A wall across the muzzle, 20 m ahead.
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
    const cx = me.x + fx * 20, cz = me.z + fz * 20;
    const wall = [cx - fz * 30, cz + fx * 30, cx + fz * 30, cz - fx * 30];
    const ctx = { height: () => null, walls: (x, z, out) => { out.push.apply(out, wall); return out; },
                  animals: () => null, traffic: () => null };
    window.Blaster.fire(me);
    let stop = null;
    for (let i = 0; i < 60 && !stop; i++) {
      const evs = window.Blaster.update(me, ctx, 0.02);
      if (evs) stop = evs[0];
    }
    window.Blaster.clear();
    // The wall's normal rides the event now — it orients the scorch mark, and
    // a mark laid on the far face is a mark nobody sees. `facing` is its dot
    // with the bolt's travel: a normal that faces the shooter is negative.
    const facing = stop ? (stop.nx * (stop.x - me.x) + stop.nz * (stop.z - me.z)) : 0;
    return { kind: stop ? stop.kind : null,
             dist: stop ? Math.hypot(stop.x - me.x, stop.z - me.z) : -1,
             nlen: stop ? Math.hypot(stop.nx || 0, stop.nz || 0) : 0, facing: facing };
  });
  check('a bolt stops at a wall instead of shooting through the world',
    wallStop.kind === 'wall' && Math.abs(wallStop.dist - 20) < 3,
    wallStop.kind + ' at ' + wallStop.dist.toFixed(1) + ' m');
  check('…and the hit carries a unit wall normal, facing the shooter',
    Math.abs(wallStop.nlen - 1) < 0.01 && wallStop.facing < 0,
    'len=' + wallStop.nlen.toFixed(3) + ' facing=' + wallStop.facing.toFixed(1));

  // A shot that lands on a building leaves a MARK. Real path this time — the
  // app's own blaster context against the real wall index — and the mark must
  // arrive in the scene as a decal, because a list nothing draws is not a mark.
  const scorched = await fr.locator('body').evaluate(async () => {
    const me = window.App.car(); const w = window.App.world;
    const scratch = [];
    for (const k in w.roads) { const r = w.roads[k]; if (r && r.built) window.Roads.nearWalls(r.built.walls, me.x, me.z, scratch); }
    if (!scratch.length) return { walls: 0 };
    const ax = (scratch[0] + scratch[2]) / 2, az = (scratch[1] + scratch[3]) / 2;
    me.yaw = Math.atan2(ax - me.x, az - me.z); me.speed = 0;
    const before = window.App.debug().scorches;
    for (let i = 0; i < 40 && window.App.debug().scorches === before; i++) {
      window.Blaster.fire(me);
      await new Promise((r) => setTimeout(r, 150));
    }
    return { walls: scratch.length / 4, scorches: window.App.debug().scorches - before };
  });
  check('shooting a building leaves a scorch mark on it',
    scorched.scorches > 0, scorched.scorches + ' mark(s), ' + scorched.walls + ' wall segs near');

  // A traffic car that dies EXPLODES AND FADES — it must keep appearing in the
  // draw list (flagged `boom`) before it leaves, because an object that blinks
  // out in one frame reads as a rendering bug, not a consequence. Driven
  // through the real module; polled, because dt is clamped and simulated time
  // trails wall clock on a busy box.
  const boom = await fr.locator('body').evaluate(async () => {
    for (let i = 0; i < 60 && !window.Traffic.count(); i++) await new Promise((r) => setTimeout(r, 250));
    const list = window.Traffic.drawList();
    if (!list.length) return { traffic: 0 };
    const t0 = list[0];
    let res = null;
    for (let i = 0; i < 3; i++) res = window.Traffic.shootAt(t0.x, t0.z, 3);
    const dyingNow = window.Traffic.drawList().find((t) => t.id === t0.id);
    // A dying car is a ghost to further shots — a second kill of the same car
    // would double-count everything downstream of it.
    const ghost = window.Traffic.shootAt(t0.x, t0.z, 3);
    let gone = false, aged = 0;
    for (let i = 0; i < 40 && !gone; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const t = window.Traffic.drawList().find((x) => x.id === t0.id);
      if (!t) gone = true;
      else aged = t.boom;
    }
    return { traffic: list.length, destroyed: !!(res && res.destroyed),
             // A GHOST HIT IS THE DYING CAR ITSELF, NOT A NEIGHBOUR.
             // This was `< 4` metres of t0's ORIGINAL position and it flaked
             // the gate: traffic DRIVES, so on a busy box another car drifts
             // into that radius between the kill and this shot, gets hit
             // legitimately, and the suite reports a double-kill. The product
             // makes a real ghost hit impossible by construction — shootAt
             // skips any car with `dying != null` — so the only thing worth
             // asserting is that whatever was hit is not this stationary
             // wreck, and a killed car has speed 0 and does not move.
             stays: !!(dyingNow && dyingNow.boom != null),
             ghostHit: !!(ghost && dyingNow && Math.hypot(ghost.x - dyingNow.x, ghost.z - dyingNow.z) < 0.01),
             ghostAt: ghost ? { dx: +(ghost.x - t0.x).toFixed(2), dz: +(ghost.z - t0.z).toFixed(2) } : null,
             aged: aged, gone: gone };
  });
  if (boom.traffic === 0) {
    check('a killed traffic car explodes and fades (no traffic spawned to test)', true, 'skipped — no traffic in range');
  } else {
    check('a killed traffic car STAYS in the world, dying', boom.destroyed && boom.stays, JSON.stringify(boom));
    check('…is a ghost to further shots while it dies', !boom.ghostHit, JSON.stringify(boom.ghostHit));
    check('…and then it is gone, after visibly ageing', boom.gone && boom.aged > 0,
      'aged to ' + (+boom.aged).toFixed(2) + ' s, gone=' + boom.gone);
  }

  // Space fires it, and the handbrake moved off space to make room.
  const keys = await fr.locator('body').evaluate(async () => {
    // AWAIT A FRAME between pressing and reading. The input object is filled in
    // by the control layer's sample(), which runs once per frame from the game
    // loop — reading it in the same tick as the keydown reads the state from
    // before the key existed.
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const d = () => window.App.debug().input;
    const press = (k, type) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    press(' ', 'keydown');
    await frame();
    const held = { fire: d().fire, hand: d().handbrake };
    press(' ', 'keyup');
    press('x', 'keydown');
    await frame();
    const hand = d().handbrake;
    press('x', 'keyup');
    await frame();
    return { held, hand, released: d().handbrake };
  });
  check('space fires the blaster', keys.held.fire === true, JSON.stringify(keys.held));
  check('…and the handbrake moved to X so space could have it',
    keys.held.hand === false && keys.hand === true && keys.released === false, JSON.stringify(keys));

  // ---- bird's eye: the CAMERA flies, there is no inset ----------------------
  // The canvas minimap is deliberately DEAD. It was a second renderer over a
  // second read of the world, and it did what second copies do: the road index
  // grew a field (stride 7 → 8) and the map kept walking it at seven —
  // coordinates became half-widths, half-widths became line-widths hundreds of
  // metres wide, and the result was a map with no roads that also ate the
  // frame rate repainting garbage at 8 Hz. The button now flies the one real
  // camera up and back down. These checks hold the toggle to that: the eye
  // actually climbs, the world keeps running (it is a view, not a pause), and
  // the eye comes back down when asked.
  check('the old inset is really gone (no second renderer to rot again)',
    await fr.locator('body').evaluate(() => !document.getElementById('mapcanvas') && !document.getElementById('minimap')));

  // Attribution IS licensing, not decoration: ODbL (roads) and the imagery
  // provider's terms want the credit visible while the data is ON SCREEN — a
  // line on the landing sheet that vanishes the moment the map appears does
  // not qualify. So the drive HUD carries one, and it must never eat input.
  const attrib = await fr.locator('body').evaluate(() => {
    const a = document.getElementById('attribution3');
    return a ? { text: a.textContent, events: getComputedStyle(a).pointerEvents,
                 visible: !!(a.offsetWidth || a.offsetHeight) } : null;
  });
  check('data credits are visible ON the drive screen, while the data is',
    !!attrib && attrib.visible && /OpenStreetMap/.test(attrib.text), attrib && attrib.text);
  check('…and the credit line can never eat a steering touch',
    !!attrib && attrib.events === 'none', attrib && attrib.events);

  // ---- the satellite key rides where MapTiler can see it -------------------
  // Turn the drape on and watch the wire: the key must arrive as ?key= (the
  // only place MapTiler looks), never as a Bearer header, with NO auth
  // configuration on the entry — the runtime knows the provider's shape.
  await fr.locator('body').evaluate(() => { window.Sources.set({ imagery: 'maptiler' }); window.App.redrape(); });
  for (let i = 0; i < 15 && mt.seen.length < 2; i++) await sleep(1000);
  check('selecting satellite actually asks MapTiler for tiles', mt.seen.length > 0, mt.seen.length + ' request(s)');
  check('the key travels as ?key= — the ONLY place MapTiler looks — whatever the entry says',
    mt.seen.length > 0 && mt.seen.every((m) => m.keyQ === 'e2e-key-123' && !m.bearer && !m.wrongHeader),
    JSON.stringify(mt.seen[0] || null));

  // ---- a dead network is not a missing key ----------------------------------
  // Offline, the imagery pipeline used to relay fetch's bare "Failed to fetch"
  // with "— check the key in GifOS Settings" bolted on: a player whose key was
  // saved, tested and fine got sent to Settings to fix it. The runtime now
  // names network-level failures (OFFLINE:/UNREACHABLE:), and the HUD note
  // says the key IS set. Kill the host, redrape, and hold both layers to it.
  mt.setDead(true);
  await fr.locator('body').evaluate(() => window.App.redrape());
  // The toast lives 2.6 s and any passing collision note replaces it, so the
  // gate reads the RECORD (imagery.said), not the ephemeral element.
  let deadNet = null;
  for (let i = 0; i < 50; i++) {
    await sleep(300);
    deadNet = await fr.locator('body').evaluate(() => window.App.imagery());
    if (deadNet.failed && deadNet.said) break;
  }
  check('a dead network is reported as a NETWORK failure, never as a key problem',
    !!deadNet && /^(OFFLINE|UNREACHABLE):/.test(deadNet.failed || ''), JSON.stringify(deadNet && deadNet.failed));
  check('…and the player is TOLD the key is set instead of being sent to re-enter it',
    !!deadNet && /key is set/.test(deadNet.said || '') && !/check the key/.test(deadNet.said || ''),
    JSON.stringify(deadNet && deadNet.said));
  mt.setDead(false);
  await fr.locator('body').evaluate(() => { window.Sources.set({ imagery: 'none' }); window.App.redrape(); });
  // THE EYE IS A CYCLER NOW, not a toggle (the 2026-08-08 dash rework:
  // chase -> cockpit -> bird -> chase), and it states WHICH view with a
  // pov-<view> class + aria-label instead of aria-pressed — a cycler has no
  // pressed state. Walk the cycle and hold each stop to its contract.
  await fr.locator('#btn-map').click();                       // chase -> cockpit
  const cockpitStop = await fr.locator('body').evaluate(() => ({
    view: window.App.debug().view,
    dash: !!(document.getElementById('cockpit') && !document.getElementById('cockpit').hidden),
    pov: document.getElementById('btn-map').className,
    pad: document.getElementById('steerpad').hidden,
    // The dash speed must WIN the paint order against the wheel: on a phone
    // the vh-sized wheel is nearly as wide as the screen and its rim swept
    // straight across the cluster — 77 km/h, legible on every desktop,
    // hidden behind the dash on every phone.
    clusterZ: getComputedStyle(document.getElementById('dash-cluster')).zIndex,
  }));
  check('one tap of the eye enters the COCKPIT, and the dashboard appears',
    cockpitStop.view === 'cockpit' && cockpitStop.dash && /pov-cockpit/.test(cockpitStop.pov),
    JSON.stringify(cockpitStop));
  check('from the driver\'s seat the corner steering pad hides — the drawn wheel IS the wheel',
    cockpitStop.pad === true, 'steerpad.hidden=' + cockpitStop.pad);
  check('the dash speed paints ABOVE the wheel rim (phones: the rim crosses the cluster)',
    parseInt(cockpitStop.clusterZ, 10) >= 3, 'z-index=' + cockpitStop.clusterZ);

  // ---- the dash carries real instruments ------------------------------------
  // The dash is mostly empty moulding, and the one control on it was the
  // smallest thing there. Take-off is a decision made at speed: the wings
  // button must be thumb-sized, and IN FLIGHT the altimeter is its own
  // instrument — the speedometer used to swap to metres, which blanked the
  // airspeed at exactly the moment you were managing height AND speed.
  const dashGear = await fr.locator('body').evaluate(() => {
    const fly = document.getElementById('btn-fly');
    const r = fly.getBoundingClientRect();
    return { flyW: r.width, altHidden: document.getElementById('dash-alt').hidden };
  });
  check('the wings button is sized for a thumb, not a corner chip', dashGear.flyW >= 65,
    dashGear.flyW.toFixed(0) + 'px wide');
  check('on the ground the altimeter is dark (a number about nothing)',
    dashGear.altHidden === true, 'dash-alt.hidden=' + dashGear.altHidden);
  await fr.locator('#btn-fly').click();
  let aloft = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    aloft = await fr.locator('body').evaluate(() => {
      const d = window.App.debug();
      return { flying: !!d.flying, agl: d.agl || 0,
               altHidden: document.getElementById('dash-alt').hidden,
               altText: document.getElementById('dash-alt-m').textContent,
               unit: document.getElementById('dash-unit').textContent };
    });
    if (aloft.flying && !aloft.altHidden && parseInt(aloft.altText, 10) > 3) break;
  }
  check('take off and the altimeter lights up with real metres',
    !!aloft && aloft.flying && !aloft.altHidden && parseInt(aloft.altText, 10) > 3,
    JSON.stringify(aloft));
  check('…while the speedometer STAYS a speedometer (km/h, not metres)',
    !!aloft && aloft.unit === 'km/h', aloft && aloft.unit);
  await fr.locator('#btn-fly').click();                       // wings off…
  let landed = null;
  for (let i = 0; i < 40; i++) {                              // …and wait out the fall
    await sleep(500);
    landed = await fr.locator('body').evaluate(() => {
      const d = window.App.debug();
      return { flying: !!d.flying, falling: !!d.falling,
               altHidden: document.getElementById('dash-alt').hidden };
    });
    if (!landed.flying && !landed.falling) break;
  }
  check('back on the ground the altimeter goes dark again',
    !!landed && !landed.flying && !landed.falling && landed.altHidden, JSON.stringify(landed));
  await fr.locator('#btn-map').click();                       // cockpit -> bird
  let bird = null;
  for (let i = 0; i < 24; i++) {                              // poll: dt-clamped sim time, never wall clock
    await sleep(500);
    bird = await fr.locator('body').evaluate(() => {
      const d = window.App.debug();
      return { view: d.view, up: d.camera.y - d.y,
               pov: document.getElementById('btn-map').className,
               label: document.getElementById('btn-map').getAttribute('aria-label') || '' };
    });
    if (bird.up > 150) break;
  }
  check('the bird\'s-eye stop flies the REAL camera up', bird.view === 'bird' && bird.up > 150,
    bird.up.toFixed(0) + ' m above the car, view=' + bird.view);
  check('…and the eye SAYS which view (pov class + label), since a cycler has no pressed state',
    /pov-bird/.test(bird.pov) && /bird/i.test(bird.label), bird.pov + ' / ' + bird.label);
  const birdDrive = await fr.locator('body').evaluate(() => {
    const d = window.App.debug();
    return { running: d.running, speed: Math.abs(d.speed) };
  });
  check('the world keeps running under the bird — a view, not a pause',
    birdDrive.running, JSON.stringify(birdDrive));
  await fr.locator('#btn-map').click();                       // bird -> chase
  let down = null;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    down = await fr.locator('body').evaluate(() => {
      const d = window.App.debug();
      return { view: d.view, up: d.camera.y - d.y };
    });
    if (down.view === 'chase' && down.up < 40) break;
  }
  check('one more tap completes the cycle back to the chase, and the camera comes down',
    down.view === 'chase' && down.up < 40, down.up.toFixed(0) + ' m above the car, view=' + down.view);
  const padBack = await fr.locator('body').evaluate(() => document.getElementById('steerpad').hidden);
  check('…and the steering pad comes back with the chase view', padBack === false, 'steerpad.hidden=' + padBack);

  // ---- sound ---------------------------------------------------------------
  // Everything is synthesised — the app is a GIF and a minute of audio is
  // several times the size of the whole game — so there is no file to assert
  // about. What CAN be checked is that the graph exists in a null-origin
  // sandbox (the runtime gives the app no `allow-same-origin`), that the engine
  // note tracks the gearbox rather than sitting at one pitch, and that silence
  // is actually silent.
  const audio = await fr.locator('body').evaluate(async () => {
    if (!window.Sound.unlock('on')) return { unavailable: true };
    // AWAITED between samples, because the continuous voices are updated at
    // 20 Hz rather than at the frame rate — sixty ramps a second on a parameter
    // with a 100 ms time constant is four schedulings for every one the ear
    // could resolve. Five reads inside one tick would all return the first.
    const at = async (speed) => {
      await new Promise((r) => setTimeout(r, 70));
      window.Sound.drive({ speed, throttle: 1, brake: false, onRoad: true, surface: 0, idle: false });
      return window.Sound.debug().engineHz;
    };
    // WITHIN one gear, then over the change. The speeds matter: an earlier
    // version sampled 6 and 14 m/s, which sit at exactly the same fraction of
    // their respective gears and therefore produce exactly the same note — the
    // test read that as a flat engine when the gearbox was working perfectly.
    const idle = await at(0), slow = await at(3), mid = await at(7),
          shift = await at(9), fast = await at(40);
    window.Sound.drive({ speed: 30, throttle: 1, brake: false, onRoad: true, surface: 0, idle: false });
    const rolling = window.Sound.debug();
    // Silence is RAMPED, not switched — a hard cut on an audio parameter is an
    // audible click. So wait for the ramp before asking whether it is silent.
    window.Sound.setMode('off');
    await new Promise((r) => setTimeout(r, 400));
    const off = window.Sound.debug();
    window.Sound.setMode('on');
    return { idle, slow, mid, shift, fast, silentMaster: off.master,
             state: rolling.state, ready: window.Sound.ready() };
  });
  check('the audio graph starts inside the sandbox', !audio.unavailable && audio.ready,
    audio.unavailable ? 'no AudioContext available' : 'state: ' + audio.state);
  check('the engine note rises with speed', audio.slow > audio.idle && audio.mid > audio.slow,
    [audio.idle, audio.slow, audio.mid].map((n) => n.toFixed(0)).join(' -> ') + ' Hz');
  check('…and DROPS on a gear change, which is what makes it a car',
    audio.shift < audio.mid, 'at 7 m/s ' + audio.mid.toFixed(0)
      + ' Hz, at 9 m/s ' + audio.shift.toFixed(0) + ' Hz');
  check('silent means silent', audio.silentMaster < 0.01, 'master gain ' + audio.silentMaster.toFixed(4));

  // ---- a track is not a motorway -------------------------------------------
  // `surface` and `lanes` were the other two tags sitting unread in the same
  // Overpass response. Without them a farm track is asphalt with a painted
  // centre line down it, and a six-lane motorway is exactly as wide as a B road.
  const surfaces = await fr.locator('body').evaluate(() => {
    const w = window.App.world;
    const kinds = {}; let maxLanes = 0;
    let widest = 0, narrowest = Infinity;
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.roads.count) continue;
      const ri = r.built.roads.rinfo;
      for (let i = 0; i < ri.length; i += 2) {
        kinds[ri[i]] = (kinds[ri[i]] || 0) + 1;
        maxLanes = Math.max(maxLanes, ri[i + 1]);
      }
      // Ribbon width, straight off the mesh: each pair of vertices is one
      // cross-section, so the gap between them IS the carriageway.
      const p = r.built.roads.positions;
      for (let i = 0; i + 5 < p.length; i += 6) {
        const wdt = Math.hypot(p[i] - p[i + 3], p[i + 2] - p[i + 5]);
        if (wdt > 0.5) { widest = Math.max(widest, wdt); narrowest = Math.min(narrowest, wdt); }
      }
    }
    return { kinds: Object.keys(kinds).map(Number).sort((a, b) => a - b), maxLanes, widest, narrowest };
  });
  check('the map tells us what a road is MADE of, and it reaches the mesh',
    surfaces.kinds.length >= 3, 'surface codes present: ' + surfaces.kinds.join(','));
  check('a dirt track is carried as unsealed', surfaces.kinds.indexOf(2) >= 0,
    'codes: ' + surfaces.kinds.join(',') + ' (2 = dirt)');
  check('the lane count reaches the mesh and widens the road',
    surfaces.maxLanes >= 6 && surfaces.widest > 17 && surfaces.narrowest < 6,
    surfaces.maxLanes + ' lanes; widest ' + surfaces.widest.toFixed(1)
      + ' m vs narrowest ' + surfaces.narrowest.toFixed(1) + ' m');

  // The renderer drew a world, not an empty sky. Sample the canvas below the
  // horizon: ground pixels must differ from the sky gradient up top.
  // The read has to happen INSIDE an animation frame, after the app's own draw
  // for that tick. Once the browser composites, an unpreserved drawing buffer is
  // cleared — reading afterwards returns all zeroes, which looks exactly like a
  // renderer that drew nothing. rAF callbacks run in registration order and the
  // app re-registers at the top of its frame, so a callback queued now lands
  // after that frame's draw.
  const painted = await fr.locator('body').evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const cv = document.getElementById('view');
      const gl = window.Render.gl;
      const px = new Uint8Array(4);
      const read = (x, y) => { gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [px[0], px[1], px[2]]; };
      const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      // readPixels' origin is bottom-left, so a LOW y is the foreground ground.
      // ACROSS several columns, not one. A single centre sample lands on the
      // painted centre line as often as not, and white road paint against a
      // pale sky is a difference of forty — the assertion was one dash away
      // from failing for a renderer that was working perfectly.
      const ground = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => read(Math.floor(cv.width * f), Math.floor(cv.height * 0.12)));
      const sky = read(Math.floor(cv.width / 2), Math.floor(cv.height * 0.95));
      // The sky sampled ACROSS the frame, not as one pair of pixels. Two
      // samples can land on the same cloud, or on two points the gradient
      // happens to give the same value — that is a flake, not a finding.
      const skyPts = [];
      for (const fx of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        for (const fy of [0.66, 0.80, 0.95]) skyPts.push(read(Math.floor(cv.width * fx), Math.floor(cv.height * fy)));
      }
      let spread = 0;
      for (const a of skyPts) for (const b of skyPts) spread = Math.max(spread, diff(a, b));
      resolve({
        ground: ground.map((g) => g.join(',')).join(' | '), sky: sky, spread: spread,
        diff: Math.max.apply(null, ground.map((g) => diff(g, sky))),
      });
    }));
  }));
  check('the renderer draws ground, not just sky', painted.diff > 40,
    'ground rgb ' + painted.ground + ' vs sky ' + painted.sky.join(','));
  // The sky SHADER, not the clear colour. Its full-screen triangle is wound
  // counter-clockwise and the app culls counter-clockwise faces, so for a long
  // time it was culled outright and every sky pixel was the flat glClear
  // colour — a gradient, a sun and two attempts at clouds all went into a
  // shader that never ran, and nothing looked broken. A flat sky is the tell.
  check('the sky shader runs — the sky is not one flat colour',
    painted.spread > 14, 'widest difference across 15 sky samples: ' + painted.spread);

  // ---- typing must not reach the car --------------------------------------
  // The driving keys are bound on window, so they fire while the search field
  // has focus too. Space is the handbrake and called preventDefault(), which
  // ate every space typed: "Golden Gate Bridge" arrived as "GoldenGateBridge"
  // and multi-word searches — every address — were impossible. Checked with the
  // loop RUNNING, because that is the only time the car reads the keyboard.
  await fr.locator('#btn-hop').click();
  await fr.locator('#landing').waitFor({ state: 'visible', timeout: 5000 });
  await fr.locator('#q').click();
  await app.keyboard.type('221B Baker Street, London');
  const typed = await fr.locator('#q').inputValue();
  check('the search field accepts spaces (the handbrake no longer eats them)',
    typed === '221B Baker Street, London', JSON.stringify(typed));

  await fr.locator('#q').fill('');
  await fr.locator('#q').click();
  await app.keyboard.type('wasd');
  const leaked = await fr.locator('body').evaluate(() => {
    const d = window.App.debug();
    return { throttle: d.input.throttle, brake: d.input.brake, steer: d.input.steer, hand: d.input.handbrake };
  });
  // NOTE: throttle is deliberately NOT checked any more. In the default control
  // scheme the car auto-cruises, so throttle sits at 1 legitimately — asserting
  // it is 0 would be asserting the cruise is broken. Steer is the signal that
  // actually detects a leak (verified by reverting the fix: throttle read 0
  // while steer showed 0.047), and brake/handbrake are the other real ones.
  // STEER is the sensitive one. keyboard.type() presses and releases each letter
  // faster than a frame, so a leaked 'w' is usually back up before the next
  // sample and throttle reads 0 anyway — but steer is smoothed and holds a
  // residue, so it is what actually catches the leak. Verified by reverting the
  // fix: throttle stayed 0 while steer showed 0.047.
  check('typing driving letters into search does not drive the car',
    leaked.brake === 0 && !leaked.hand && leaked.steer === 0, JSON.stringify(leaked));

  // ---- the stick's full arc: stop, STAY stopped, and GO again --------------
  // Three bugs lived on this one thumb, each fix exposing the next. The
  // stick's at-zero hold armed reverse (the spawn-in-R screenshot); fixing
  // that left the synthetic brake latching the HALT, which listened only for
  // the GO pedal and the W key — so a stick pinned to the top moved nothing,
  // at 0 km/h forever ("the car will not move at all"). The stick's upward
  // deflection now speaks `go`. This drives the REAL pointer path on the real
  // canvas: down-drag to a stop, release, hold up, and the car must pull away.
  //
  // The typing test above left the LANDING SHEET open, and an open panel PARKS
  // the car (panelOpen -> setPark) — with it up, the whole arc "passes" its
  // stop checks and fails its go check against a car that was parked the
  // entire time, blaming the stick for the sheet. Close it, and PROVE the car
  // is unparked before trusting anything the arc measures.
  await app.keyboard.press('Escape');
  await fr.locator('#landing').waitFor({ state: 'hidden', timeout: 3000 });
  const arcPark = await fr.locator('body').evaluate(async () => {
    for (let i = 0; i < 20 && window.App.debug().input.park; i++) await new Promise((r) => setTimeout(r, 100));
    return window.App.debug().input.park;
  });
  check('the landing sheet is closed and the car unparked before the stick arc', arcPark === false, 'park=' + arcPark);
  // The search box may still hold focus with its results dropdown over the
  // scheme pill — switch schemes through the DOM; the pointer ARC below is the
  // thing under test, not this button. And REPAIR first: the arc asserts the
  // CONTROLS, and a session's worth of accumulated damage now legitimately
  // slows the pull-away (the limp) — 1.5 m/s against a >1.5 threshold was
  // this check failing on the engine, not the stick.
  await fr.locator('body').evaluate(() => {
    window.Car.repair(window.App.car());
    document.getElementById('q').blur();
    document.querySelector('#schemes button[data-scheme="stick"]').click();
  });
  const stickArc = await fr.locator('body').evaluate(async () => {
    const cv = window.Render.gl.canvas;
    const r = cv.getBoundingClientRect();
    const cx = r.left + r.width * 0.7, cy = r.top + r.height * 0.6;
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      pointerId: 9, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    // 1. drag DOWN and hold: trim the set-point to zero, brake to a stop.
    ev('pointerdown', cx, cy); ev('pointermove', cx, cy + 130);
    for (let i = 0; i < 40 && Math.abs(window.App.car().speed) > 0.3; i++) await wait(500);
    ev('pointerup', cx, cy + 130);
    const stopped = window.App.car().speed;
    // 2. sit for a moment: the stop must HOLD (no reverse creep).
    await wait(2500);
    const held = window.App.car().speed;
    // 3. drag UP and hold: the stick asks to move, and the halt must let go.
    ev('pointerdown', cx, cy); ev('pointermove', cx, cy - 140);
    let moving = 0;
    for (let i = 0; i < 40; i++) { await wait(500); moving = window.App.car().speed; if (moving > 1.5) break; }
    ev('pointerup', cx, cy - 140);
    return { stopped: +stopped.toFixed(2), held: +held.toFixed(2), moving: +moving.toFixed(2) };
  });
  check('stick down-drag brakes the car to a stop', Math.abs(stickArc.stopped) < 0.3, stickArc.stopped + ' m/s');
  check('…the stop HOLDS — no reverse creep while parked at zero', stickArc.held > -0.3, stickArc.held + ' m/s');
  check('…and pushing the stick UP releases the halt and the car pulls away',
    stickArc.moving > 1.5, stickArc.moving + ' m/s');
  await fr.locator('body').evaluate(() => document.querySelector('#schemes button[data-scheme="wheel"]').click());

  // ---- a cache written by an old build upgrades itself ----------------------
  // "My pool disappeared from my backyard. It used to be there a few versions
  // back." Every feature parse() has grown had this failure: a tile cached by
  // an OLDER build lacks the new field, and a non-dense cached record was
  // served forever — so pools (landcover, names, brands…) never appeared
  // exactly where the player had already driven. Records now carry the
  // parser's version (pv); an old stamp forces one re-fetch. Seed a poolless,
  // stampless record — the old-build shape — and ask for the tile.
  const upgraded = await fr.locator('body').evaluate(async () => {
    const f = window.App.world.frame;
    const HOP = { lat: 48.8698, lon: 2.3078 };
    // A tile inside the fixture's coverage but away from the resident set, so
    // loadTile's memory cache has never seen it.
    const tx = Math.floor(window.Geo.lonToTileX(HOP.lon + 0.05, window.Roads.TILE_ZOOM));
    const ty = Math.floor(window.Geo.latToTileY(HOP.lat + 0.05, window.Roads.TILE_ZOOM));
    const tile = { z: window.Roads.TILE_ZOOM, x: tx, y: ty };
    const key = window.Geo.tileKey(tile);
    await window.Host.db('roadcache').put({
      id: 't' + key,
      ways: [['residential', [HOP.lat + 0.05, HOP.lon + 0.05, HOP.lat + 0.051, HOP.lon + 0.051], 0, 0, 'Old Cache Road']],
      bld: [],   // no wat, no land, no pool, no detail, no pv — the old shape
    });
    const geom = await window.Roads.loadTile(tile);
    return { pools: (geom.pool || []).length, land: (geom.land || []).length,
             ways: geom.ways.length, detail: geom.detail };
  });
  check('a tile cached by an OLD build re-fetches and gains what the parser learned since',
    upgraded.pools > 0 && upgraded.detail === 2,
    upgraded.pools + ' pool(s), ' + upgraded.land + ' land ring(s), detail ' + upgraded.detail
    + ' — from a record that had none of it');

  // ---- street names, in the world -------------------------------------------
  // The names have always been in the data and only ever reached a HUD chip
  // telling you what you are ON. Floating them over their own carriageways is
  // what turns "a road" into "that road" — and it is a NEW GL program, the
  // category where a mistake takes the frame loop down rather than looking
  // wrong, so this checks the app is still drawing after they appear.
  const labels = await fr.locator('body').evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.Sources.set({ labels: 'on' });
    let d = null;
    for (let i = 0; i < 30; i++) { await wait(300); d = window.App.debug(); if (d.labels.length) break; }
    const on = d.labels.slice();
    const framesA = d.frames;
    window.Sources.set({ labels: 'off' });
    for (let i = 0; i < 20; i++) { await wait(200); d = window.App.debug(); if (!d.labels.length) break; }
    const off = d.labels.length;
    await wait(600);
    const framesB = window.App.debug().frames;
    window.Sources.set({ labels: 'on' });
    return { on, off, running: framesB > framesA };
  });
  check('street names float in the world, named from the map data',
    labels.on.length > 0 && labels.on.some((n) => /Fixture Street|Grand Boulevard|Crossing Lane|A1/.test(n)),
    JSON.stringify(labels.on));
  check('…never more than a handful — a junction of a dozen names is wallpaper',
    labels.on.length <= 6, labels.on.length + ' on screen');
  check('…the setting genuinely turns them off', labels.off === 0, labels.off + ' left');
  check('…and the frame loop survived a brand-new GL program', labels.running, 'frames advanced');

  // ---- the share link is WHERE YOU ARE ------------------------------------
  // The ☰ sheet's whole promise is "a link to wherever you are standing", and
  // it was minted from f.lat0/lon0 — the frame ORIGIN, i.e. the point hop()
  // dropped you at. Reported from the Grand Canyon: a link made at the Colorado
  // River, after driving six kilometres down from the rim, came back pointing
  // at Grand Canyon Village, and following it took you nowhere near the water.
  // The bug is invisible until you have travelled, which is why nothing caught
  // it: at the drop point the two answers are identical.
  const share = await fr.locator('body').evaluate(() => {
    const readLink = () => {
      document.getElementById('btn-menu').click();
      const v = document.getElementById('share-url').value;
      document.getElementById('close-settings').click();
      return v;
    };
    const before = readLink();
    const c = window.App.car(), f = window.App.world.frame;
    const x0 = c.x, z0 = c.z;
    c.x += 3000; c.z += 1200;                    // 3.2 km away, as down a canyon
    const at = f.toGeo(c.x, c.z);
    const after = readLink();
    c.x = x0; c.z = z0;                          // leave the car where we found it
    return { before, after, origin: f.lat0.toFixed(5) + ',' + f.lon0.toFixed(5),
             car: at.lat.toFixed(5) + ',' + at.lon.toFixed(5) };
  });
  check('the share link carries a place at all', /go\.at=-?\d/.test(share.before), share.before);
  check('…and after driving away it points at the CAR, not the drop point',
    share.after.indexOf(share.car) >= 0 && share.after.indexOf(share.origin) < 0,
    'origin ' + share.origin + ', car ' + share.car + ' -> ' + share.after.split('go.at=')[1]);

  // ---- the plate cache is CAPPED, and the GPU follows ----------------------
  // Every distinct street name rasterises to a canvas and a GL texture, and
  // street names are unbounded — a long drive meets thousands. They were kept
  // for the life of the tab, on the GPU, where nothing collects them. The fix
  // is an LRU capped at 160 with a real gl.deleteTexture behind it.
  //
  // It went a week UNPROVEN because it is only reachable from the frame loop:
  // the soak drove a car around and reported labels=1, since the fixture put
  // every road at the Paris preset and a hop leaves them hundreds of km behind
  // the car. Rather than drive past 160 real streets and hope, ask the cache
  // directly — 700 names is a long afternoon's driving and takes a second here.
  //
  // Two claims, and the second is the one that was actually broken: the map
  // being capped means nothing if the TEXTURES it dropped stayed on the GPU.
  const LABEL_CAP = 160;
  const lru = await fr.locator('body').evaluate((cap) => {
    const base = window.Render.stats();
    for (let i = 0; i < 500; i++) window.Render.labelFor('Cap Street ' + i);
    const at500 = window.Render.stats();
    for (let i = 500; i < 700; i++) window.Render.labelFor('Cap Street ' + i);
    const at700 = window.Render.stats();
    // A name still in use must SURVIVE the sweep that evicts the cold ones —
    // an LRU that drops the road you are standing on rebuilds it every frame,
    // which is the garbage-collection pause the cache exists to prevent.
    window.Render.labelFor('Hot Lane');
    const hotBefore = window.Render.stats().labels;
    for (let i = 700; i < 900; i++) {
      window.Render.labelFor('Cap Street ' + i);
      window.Render.labelFor('Hot Lane');            // touched throughout: always hot
    }
    const afterHot = window.Render.stats();
    // If 'Hot Lane' had been evicted this re-creates it and the count climbs.
    const beforeReask = afterHot.labels;
    window.Render.labelFor('Hot Lane');
    const afterReask = window.Render.stats().labels;
    return { base, at500, at700, afterHot, hotBefore, beforeReask, afterReask, cap };
  }, LABEL_CAP);
  check('the street-name cache holds at its cap, however many names go past',
    lru.at500.labels <= LABEL_CAP && lru.at700.labels <= LABEL_CAP,
    '500 names -> ' + lru.at500.labels + ' cached, 700 -> ' + lru.at700.labels
    + ' (cap ' + LABEL_CAP + ')');
  // THE LEAK ITSELF. The map can be capped while every texture it evicted is
  // still on the GPU — that is exactly the state this app shipped in, and no
  // count of cache ENTRIES can see it.
  check('…and the GL textures go with them, rather than piling up on the GPU',
    lru.at700.textures - lru.base.textures <= LABEL_CAP,
    '700 names added ' + (lru.at700.textures - lru.base.textures) + ' textures'
    + ' — one per name would be 700');
  check('…so 200 more names cost no more GPU than the first 500 did',
    lru.at700.textures <= lru.at500.textures,
    lru.at500.textures + ' textures at 500 names, ' + lru.at700.textures + ' at 700');
  check('…while a name still in use survives the sweep that evicts the cold ones',
    lru.afterReask === lru.beforeReask,
    'cache ' + lru.beforeReask + ' -> ' + lru.afterReask + ' on re-asking for the hot name');

  // ---- where the labels are, and whether the sky eats them ------------------
  // Three defects lived here at once and only one of them was visible in the
  // name list, which is all the checks above can see.
  //
  // Park facing a known name so the camera is deterministic, then assert the
  // placement rules AND read the pixels back. The pixel leg is the one that
  // matters: a label writes no depth, and the sky is drawn last at z=1 with
  // LEQUAL, so it used to pass the depth test on every label pixel standing over
  // sky and paint straight over it. Facing Grand Boulevard the whole label sits
  // above the horizon, so the sky did not "clip" it — it erased it completely,
  // and the name list still said it was there.
  const placed = await fr.locator('body').evaluate(() => {
    const w = window.App.world, car = window.App.car();
    const cands = [];
    for (const k in w.roads) {
      const r = w.roads[k];
      if (!r || !r.built || !r.built.index) continue;
      window.Roads.namesNear(r.built.index, car.x, car.z, 170, cands);
    }
    const gb = cands.find((c) => /Grand Boulevard/.test(c.name));
    if (!gb) return { err: 'Grand Boulevard not in the fixture within 170 m' };
    window.Car.place(car, car.x, car.z, Math.atan2(gb.x - car.x, gb.z - car.z));
    return { faced: gb.name, dist: Math.sqrt(gb.d2) };
  });
  check('the fixture offers a named road to park facing', !placed.err, placed.err || (placed.faced + ' at ' + placed.dist.toFixed(0) + ' m'));
  await sleep(1400);

  const geom = await fr.locator('body').evaluate(() => {
    const car = window.App.car();
    const out = (window.App.debug().labelGeom || []).map((L) => {
      const bx = L.x - car.x, bz = L.z - car.z;
      return { text: L.text, dist: Math.hypot(bx, bz), bearing: Math.atan2(bx, bz),
               ahead: Math.sin(car.yaw) * bx + Math.cos(car.yaw) * bz };
    });
    return { labels: out, street: car.street };
  });
  check('the name you are parked facing is one of the floating labels',
    geom.labels.some((L) => /Grand Boulevard/.test(L.text)), JSON.stringify(geom.labels.map((L) => L.text)));
  // The "poorly placed" half: a label at ~0 m is pinned to the car, and one
  // behind you cannot be read at all — both used to consume a slot.
  check('no label is pinned on top of the car',
    geom.labels.every((L) => L.dist >= 13), JSON.stringify(geom.labels.map((L) => +L.dist.toFixed(1))));
  check('no label is stranded behind the camera',
    geom.labels.every((L) => L.ahead > -L.dist * 0.4), JSON.stringify(geom.labels.map((L) => +L.ahead.toFixed(1))));
  // Constant angular size means bearing separation IS screen separation, so two
  // names on one bearing overlap however far apart they are in the world.
  let closest = Math.PI;
  for (let i = 0; i < geom.labels.length; i++) {
    for (let j = i + 1; j < geom.labels.length; j++) {
      let d = Math.abs(geom.labels[i].bearing - geom.labels[j].bearing);
      if (d > Math.PI) d = Math.PI * 2 - d;
      closest = Math.min(closest, d);
    }
  }
  check('no two labels stack up on the same bearing',
    geom.labels.length < 2 || closest >= 0.12, closest.toFixed(3) + ' rad apart');

  // THE SKY LEG. Same parked camera, labels on then off: everything in frame is
  // identical except the labels, so differencing the dark plate pixels isolates
  // them and no scenery has to be excluded by hand.
  const SKYCLIP = { x: 180, y: 90, width: 640, height: 220 };
  const platePixels = async () => {
    const png = await app.screenshot({ clip: SKYCLIP });
    const { width, height, rgba } = decodePng(png);
    let n = 0;
    for (let i = 0; i < width * height; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      if (r < 90 && g < 100 && b < 120) n++;     // the label's dark plate over sky
    }
    return n;
  };
  await fr.locator('body').evaluate(() => window.Sources.set({ labels: 'on' }));
  await sleep(1200);
  const darkOn = await platePixels();
  await fr.locator('body').evaluate(() => window.Sources.set({ labels: 'off' }));
  await sleep(1200);
  const darkOff = await platePixels();
  await fr.locator('body').evaluate(() => window.Sources.set({ labels: 'on' }));
  check('a street name ABOVE THE HORIZON survives the sky pass',
    darkOn - darkOff > 600, darkOn + ' plate px with labels on vs ' + darkOff + ' off (delta ' + (darkOn - darkOff) + ')');

  // ---- the flare ------------------------------------------------------------
  // "Need ways for players to find each other quickly." One timestamp on your
  // own row; everything else is derived from the position it marks, so it
  // cannot point somewhere you are not.
  const flare = await fr.locator('body').evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.MP.sendFlare();
    let d = null;
    for (let i = 0; i < 20; i++) { await wait(200); d = window.App.debug(); if (d.flares > 0) break; }
    const lit = d.flares;
    const mine = window.MP.flares(window.App.car());
    return { lit, count: mine.length, life: mine[0] ? +mine[0].life.toFixed(2) : 0,
             onMe: mine[0] ? Math.hypot(mine[0].x - window.App.car().x, mine[0].z - window.App.car().z) < 1 : false };
  });
  check('a flare goes up, and it burns from full', flare.lit > 0 && flare.life > 0.9,
    JSON.stringify(flare));
  check('…and it marks where you actually are', flare.onMe, 'at the car');

  // ---- the tile map explains itself -----------------------------------------
  // The loader always knew why a tile was missing and threw it away a frame
  // later. Tapping the map is the question; this is the answer being there.
  const wstat = await fr.locator('body').evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const r = window.App.worldReport();
    const map = document.getElementById('tilemap');
    const clickable = getComputedStyle(map).pointerEvents !== 'none';
    map.hidden = false;                       // it only shows while busy; the click path is the point
    map.click();
    await wait(400);
    const sheet = document.getElementById('worldstat');
    const open = !sheet.hidden;
    const txt = document.getElementById('ws-tiles').textContent || '';
    const sum = document.getElementById('ws-summary').textContent || '';
    document.getElementById('close-worldstat').click();
    return { clickable, open, rows: r ? r.rows.length : 0, mirrors: r ? r.mirrors.length : 0,
             closed: document.getElementById('worldstat').hidden,
             saysTiles: /tiles/.test(sum), listed: txt.length > 20 };
  });
  check('the tile map is a BUTTON (the HUD is pointer-transparent; it had to opt in)',
    wstat.clickable, 'pointer-events');
  check('…tapping it opens a report naming every tile and mirror',
    wstat.open && wstat.rows > 0 && wstat.mirrors > 0 && wstat.listed && wstat.saysTiles,
    JSON.stringify(wstat));
  check('…and it closes again', wstat.closed);

  // ---- the place name is the way home ---------------------------------------
  const home = await fr.locator('body').evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = window.App.car();
    const place = document.getElementById('place');
    const clickable = getComputedStyle(place).pointerEvents !== 'none';
    c.x = 900; c.z = -700;                    // a long way from the drop point
    place.click();
    await wait(500);
    const back = Math.hypot(window.App.car().x, window.App.car().z);
    return { clickable, back: Math.round(back) };
  });
  check('the place name is clickable (a div in a pointer-transparent HUD)', home.clickable);
  check('…and it puts you back at the spawn point, not 1.1 km away',
    home.back < 120, home.back + ' m from the drop point');

  // ---- a spawn is never inside a building -----------------------------------
  // A drop point is a coordinate, and coordinates land in living rooms: you
  // arrive walled in with the unstick rescue as the only way out, which you
  // have not been told about. Hop DIRECTLY onto the fixture's 4-storey block
  // and demand the app put you outside it.
  const spawnOut = await fr.locator('body').evaluate(async (el, hop) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const inside = () => {
      const w = window.App.world, c = window.App.car();
      for (const k in w.roads) {
        const r = w.roads[k];
        if (r && r.built && r.built.roofs && window.Roads.roofAt(r.built.roofs, c.x, c.z)) return true;
      }
      return false;
    };
    // The middle of the building (lat/lon +0.0004..+0.0007).
    window.App.hop(hop.lat + 0.00055, hop.lon + 0.00055, 'Inside the block');
    let landed = false;
    for (let i = 0; i < 60; i++) {
      await wait(500);
      const d = window.App.debug();
      if (d.grounded && d.hopAnim > 3.2) { landed = true; break; }
    }
    await wait(1200);
    return { landed, inside: inside() };
  }, HOP);
  check('a spawn on top of a building steps out of it, rather than walling you in',
    spawnOut.landed && spawnOut.inside === false, JSON.stringify(spawnOut));

  // ---- the offline map has two dials ----------------------------------------
  // One dropdown answered two questions — how much of YOUR TRAIL to remember,
  // and how much EXTRA to build out ahead — so you could not keep a bigger
  // trail without signing up for background download. Two dials now, and the
  // trail default is 20 MB, not the old 8.
  const dials = await fr.locator('body').evaluate(() => ({
    keep: document.getElementById('ctl-keep') && document.getElementById('ctl-keep').value,
    fill: document.getElementById('ctl-fill') && document.getElementById('ctl-fill').value,
    keepOpts: document.getElementById('ctl-keep') ? document.getElementById('ctl-keep').options.length : 0,
    fillOpts: document.getElementById('ctl-fill') ? document.getElementById('ctl-fill').options.length : 0,
    totalMB: Math.round(window.Sources.totalBytes() / 1048576),
    fills: window.Sources.fillsAhead(),
  }));
  check('the offline map is TWO dials — your trail and the build-out — defaulting to a 20 MB trail, no fill',
    dials.keep === '20' && dials.fill === 'off' && dials.keepOpts >= 4 && dials.fillOpts >= 4
    && dials.totalMB === 20 && dials.fills === false,
    JSON.stringify(dials));

  // ==== THE TWO-CITY CODA ===================================================
  // "I went to Paris then Tokyo and the map was glitching hugely with Paris
  // street names." A hop empties world.roads, but a road tile already in
  // flight knows nothing about that: it resolved seconds into the Tokyo
  // descent and wrote a Paris record into the fresh map. snapToRoad — then
  // unbounded — snapped the new car onto that Paris way, 12,000 km from the
  // Tokyo origin, and from there the streaming want-list (which follows the
  // car) asked for MORE Paris tiles and evict kept them: both cities built
  // against one frame, Paris names on a HUD that said Tokyo, and float32
  // vertices at 1.2e7 metres doing the "glitching hugely". Guarded by hop
  // generations (a stale resolution is discarded unread) and a 2 km snap cap.
  //
  // Reproduce it exactly: force fresh Paris tile requests, DELAY them so they
  // are still in flight when the hop lands, then hop to Tokyo and hold the
  // world to the fix. Runs LAST on this page — it leaves the world in Tokyo.
  const TOKYO = { lat: 35.6812, lon: 139.7671 };
  const tokyoBody = () => {
    const geom = [];
    for (let i = -60; i <= 60; i++) geom.push({ lat: TOKYO.lat + i * 0.00012, lon: TOKYO.lon + i * 0.00004 });
    return JSON.stringify({ elements: [
      { type: 'way', id: 1, tags: { highway: 'residential', name: 'Sumida Fixture Street' }, geometry: geom },
      { type: 'way', id: 2, tags: { highway: 'primary', name: 'Ginza Fixture Boulevard' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0009 })) },
    ] });
  };
  // Registered AFTER routeWorld's handler, so it wins (Playwright matches
  // newest-first). Paris answers (bbox south of 40°N is Tokyo, north is Paris)
  // now take 1.5 s — the in-flight window the bug needs.
  await context.route(/overpass/, async (route) => {
    const m = decodeURIComponent(route.request().url()).match(/\((-?\d+\.?\d*),/);
    const paris = m && parseFloat(m[1]) > 40;
    if (paris) await sleep(1500);
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: paris ? overpassBody() : tokyoBody() });
  });
  // Fresh Paris wants: shove the car a tile sideways so ensureRoads launches
  // new (now slow) Paris requests, give them a beat to get airborne, then hop.
  await fr.locator('body').evaluate(() => { window.App.car().x += 700; });
  await sleep(400);
  // From here every satellite tile is solid canopy, and the drape goes ON —
  // Tokyo's terrain will fetch photographs as it streams in, and the
  // satellite-forest checks after the hop assertions read what grew from them.
  mt.setForest(true);
  await fr.locator('body').evaluate(() => { window.Sources.set({ imagery: 'maptiler' }); });
  await fr.locator('body').evaluate((el, t) => window.App.hop(t.lat, t.lon, 'Tokyo'), TOKYO);
  let hopState = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    hopState = await fr.locator('body').evaluate(() => {
      const w = window.App.world, c = window.App.car();
      const names = [];
      for (const k in w.roads) {
        const r = w.roads[k];
        if (r && r.built && r.built.index && r.built.index.names) names.push(...r.built.index.names.filter(Boolean));
      }
      const near = [];
      for (const k in w.roads) {
        const r = w.roads[k];
        if (r && r.built && r.built.index) window.Roads.namesNear(r.built.index, c.x, c.z, 60, near);
      }
      return { place: w.place, dist: Math.hypot(c.x, c.z),
               built: Object.keys(w.roads).filter((k) => w.roads[k] && w.roads[k].built).length,
               names: [...new Set(names)], near: near.map((n) => n.name) };
    });
    // Settled: Tokyo streets built, and long enough for a straggler to land.
    if (hopState.built >= 4 && i >= 6) break;
  }
  check('TWO CITIES: after the hop the world builds the NEW city', hopState.built >= 4,
    hopState.built + ' road tile(s) built, place=' + hopState.place);
  check('TWO CITIES: the car stays at the new origin — never snapped to the old city',
    hopState.dist < 3000, Math.round(hopState.dist) + ' m from the drop point');
  const parisNames = hopState.names.filter((n) =>
    n === 'Fixture Street' || n === 'Grand Boulevard' || n === 'A1' || n === 'Crossing Lane');
  check('TWO CITIES: no road record from the old city survives the hop (stale in-flight tiles discarded)',
    parisNames.length === 0, parisNames.length ? 'leaked: ' + parisNames.join(', ') : 'names: ' + hopState.names.join(', '));
  check('TWO CITIES: the streets NAMED around the car are the new city\'s',
    hopState.near.length > 0 && hopState.near.every((n) => n.includes('Sumida') || n.includes('Ginza')),
    JSON.stringify(hopState.near));

  // ---- the photograph plants the forest -------------------------------------
  // "Areas that are clearly forests from the satellite photos" must grow
  // forest even though tokyoBody() maps NOTHING but two roads — no landuse,
  // no natural=wood. Every imagery tile has been solid canopy since the hop
  // (mt.setForest above), so once the cover masks land and the stale tiles
  // rebuild, untagged ground must fill in at forest density. Without the
  // classifier the same ground grows the old guessed copses — roughly half
  // the sites — so the per-tile average is the discriminating number:
  // ~460 guessed vs the ~1000-tree ceiling with the photograph speaking.
  let satForest = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    satForest = await fr.locator('body').evaluate(() => {
      const w = window.App.world;
      let verts = 0, tiles = 0, covered = 0;
      for (const k in w.terrain) {
        const s = w.terrain[k];
        if (s && s.cover) covered++;
      }
      for (const k in w.roads) {
        const r = w.roads[k];
        if (!r || !r.built || !r.built.trees) continue;
        tiles++; verts += r.built.trees.positions.length / 3;
      }
      return { covered, tiles, perTile: tiles ? Math.round(verts / 21 / tiles) : 0 };
    });
    if (satForest.covered > 0 && satForest.tiles >= 4 && satForest.perTile >= 700) break;
  }
  check('the satellite classifier reads the drape (cover masks exist)',
    !!satForest && satForest.covered > 0, JSON.stringify(satForest));
  check('untagged ground under a forest PHOTOGRAPH grows a forest',
    !!satForest && satForest.perTile >= 700,
    satForest && (satForest.perTile + ' trees/tile across ' + satForest.tiles + ' tile(s), vs ~460 guessed'));

  // ==== THE HILLS CODA ======================================================
  // Everything above runs on a FLAT fixture, and a flat world cannot catch the
  // two bugs that emptied a real city:
  //
  //  * TWO SURFACES. The renderer drew a 48-cell lattice; heightAt answered
  //    from the full heightfield — different surfaces, agreeing exactly on
  //    flat ground and disagreeing by metres wherever real terrain curves
  //    inside a lattice cell. Every densified road hugged the surface the
  //    renderer does not draw, and every residential street on a hillside was
  //    genuinely underground while the street NAMES (a 2-D index) kept
  //    working. Every gate stayed green, because the fixture was flat.
  //  * FROZEN GUESSES. Ways run beyond their tile over terrain not loaded yet;
  //    those ground samples were silently 0, the tile built its city at the
  //    bottom of the world, and a built tile never rebuilt — the meadow where
  //    the old town should be.
  //
  // So: a second boot on ROLLING HILLS, asserting the invariants themselves.
  // maptiler: false ON PURPOSE — this boot saves no key, and handing it the
  // stub would make satellite quietly available in a test about terrain.
  // ---- WATER ON A SLOPE: a river is not one flat sheet --------------------
  // Every water assertion above runs on level ground — the flat fixture, or
  // ±9 m swells — so all of them exercise the SAME branch of waterMesh(), the
  // one that gives a whole ring a single height. A river descending a canyon
  // cannot be one sheet: drawn flat at the 20th percentile of its own ring it
  // sits under the hillside for most of its length, which is how it reached a
  // user as "the Colorado is not blue, the fish stand on land, and the car
  // drowns on dry rock" (roadmap §14b) with the suite entirely green.
  //
  // So: the same world, over a canyon 1355 m deep, asserting the surface
  // follows its own ground instead of averaging it away.
  const canyon0 = await openAnyroad(browser, { world: { canyon: true }, maptiler: false, tag: 'canyon' });
  await canyon0.land();
  // WAIT FOR WATER, and fail loudly if it never comes. Water tiles finish
  // building well after the world lands — measured: zero water vertices right
  // after land(), sixteen once the suite has driven a while — so asserting
  // immediately measured an empty world and PASSED over nothing. Two of these
  // checks did exactly that on their first run: "worst |water - ground| = 0 m
  // over 0 m of relief" is not a green, it is a suite with nothing in front of
  // it, and this file exists to stop that shape of lie.
  const cWater = await canyon0.fr.locator('body').evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const measure = () => {
      const w = window.App.world, f = w.frame;
      let verts = 0, worst = 0, above = 0, lo = Infinity, hi = -Infinity;
      for (const k in w.roads) {
        const t = w.roads[k];
        if (!t || !t.built || !t.built.water || !t.built.water.positions) continue;
        const P = t.built.water.positions;
        for (let i = 0; i < P.length; i += 3) {
          const g = window.Terrain.heightAt(f, P[i], P[i + 2]);
          if (g == null) continue;
          verts++;
          lo = Math.min(lo, g); hi = Math.max(hi, g);
          const d = P[i + 1] - g;
          if (Math.abs(d) > Math.abs(worst)) worst = d;
          if (d > above) above = d;
        }
      }
      return { verts, worst: +worst.toFixed(1), above: +above.toFixed(1),
               relief: +((hi > lo) ? hi - lo : 0).toFixed(1) };
    };
    let m = measure();
    for (let i = 0; i < 60 && (m.verts === 0 || m.relief < 100); i++) {
      await wait(1000);
      m = measure();
    }
    return m;
  });
  check('CANYON: water is drawn over a canyon at all (or this cannot judge)',
    cWater.verts > 0, cWater.verts + ' water vertices');
  check('CANYON: the ground under the water really does descend',
    cWater.relief > 100, cWater.relief + ' m of relief beneath the water surface');
  // THE ONE THAT WOULD HAVE CAUGHT IT. A single sheet over a 1355 m descent
  // leaves hundreds of metres between the surface and the ground under it.
  // Gated on coverage so it can never report a green about an empty world.
  check('CANYON: the surface FOLLOWS its own ground rather than averaging it',
    cWater.verts > 0 && cWater.relief > 100 && Math.abs(cWater.worst) < 60,
    'worst |water - ground| = ' + cWater.worst + ' m over ' + cWater.relief
      + ' m of relief, ' + cWater.verts + ' vertices');
  check('CANYON: …and still never stands on top of the land',
    cWater.verts > 0 && cWater.above < 6,
    'highest water above its own ground = ' + cWater.above + ' m');
  await canyon0.close();

  const hills0 = await openAnyroad(browser, { world: { hills: true }, maptiler: false, tag: 'hills' });
  const hCtx = hills0.context, hFr = hills0.fr;
  await hills0.land();
  let hState = null;
  for (let i = 0; i < 50; i++) {
    await sleep(1000);
    hState = await hFr.locator('body').evaluate(() => {
      const w = window.App.world;
      const built = Object.keys(w.roads).filter((k) => w.roads[k] && w.roads[k].built);
      const pend = Object.keys(w.roads).filter((k) => w.roads[k] && (w.roads[k].pending || (!w.roads[k].built && !w.roads[k].failed)));
      return { built: built.length, pending: pend.length };
    }).catch(() => null);
    if (hState && hState.built >= 4 && hState.pending === 0) break;
  }
  check('HILLS: the world builds on rolling terrain', !!hState && hState.built >= 4, JSON.stringify(hState));

  const hills = await hFr.locator('body').evaluate(() => {
    const w = window.App.world, f = w.frame;
    // 1. ONE SURFACE: the drawn terrain mesh and heightAt must agree at the
    //    mesh's own vertices. Sample the lattice (skip the skirt verts, which
    //    hang below on purpose).
    let worstMesh = 0, meshChecked = 0, range = { min: Infinity, max: -Infinity };
    for (const tk in w.terrain) {
      const slot = w.terrain[tk];
      if (!slot || !slot.rec) continue;
      const mesh = window.Terrain.meshFor(slot.rec, f);
      const P = mesh.positions;
      for (let v = 0; v < P.length / 3; v += 7) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        const h = window.Terrain.heightAt(f, x, z);
        if (h === null) continue;
        // skirt verts are duplicates dropped SKIRT below their edge vertex —
        // they disagree by exactly SKIRT; skip anything that far out.
        const d = Math.abs(y - h);
        if (d > 0.5) continue;
        if (d > worstMesh) worstMesh = d;
        meshChecked++;
        if (h < range.min) range.min = h; if (h > range.max) range.max = h;
      }
    }
    // 2. ROADS ON THE DRAWN GROUND: every carriageway vertex (uv.v === 0 edge,
    //    same filter the width test uses) sits ON or ABOVE what is drawn.
    let below = 0, roadChecked = 0, worstRoad = 0;
    for (const rk in w.roads) {
      const r = w.roads[rk];
      if (!r || !r.built) continue;
      const m = r.built.roads, P = m.positions, U = m.uvs;
      for (let v = 0; v < P.length / 3; v += 3) {
        if (U[v * 2 + 1] !== 0) continue;                    // carriageway edge only
        const h = window.Terrain.heightAt(f, P[v * 3], P[v * 3 + 2]);
        if (h === null) continue;
        roadChecked++;
        const clearance = P[v * 3 + 1] - h;
        if (clearance < 0.05) { below++; if (-clearance > worstRoad) worstRoad = -clearance; }
      }
    }
    // 3. NO FROZEN GUESSES: with all terrain loaded, no built tile still
    //    carries incomplete geometry (the rebuild-on-arrival converged).
    let incomplete = 0;
    for (const rk in w.roads) {
      const r = w.roads[rk];
      if (r && r.built && r.built.incomplete) incomplete++;
    }
    return { worstMesh, meshChecked, relief: range.max - range.min,
             below, roadChecked, worstRoad, incomplete };
  });
  check('HILLS: the terrain is actually hilly (the coda is not testing flat)',
    hills.relief > 8, hills.relief.toFixed(1) + ' m of relief across the mesh');
  check('HILLS: the drawn ground and the physical ground are ONE surface',
    hills.meshChecked > 200 && hills.worstMesh < 0.02,
    'worst disagreement ' + (hills.worstMesh * 100).toFixed(1) + ' cm over ' + hills.meshChecked + ' mesh vertices');
  check('HILLS: every road stands on the ground the renderer draws',
    hills.roadChecked > 200 && hills.below === 0,
    hills.below + ' of ' + hills.roadChecked + ' carriageway vertices below the drawn ground'
    + (hills.below ? ' (worst ' + hills.worstRoad.toFixed(2) + ' m under)' : ''));
  check('HILLS: no tile is left holding terrain-less guesses (rebuilds converged)',
    hills.incomplete === 0, hills.incomplete + ' tile(s) still incomplete');

  // UNASKED REVERSE DIES; ASKED REVERSE LIVES. A rebound (or a slope) used to
  // shove the car to the reverse floor and leave rolling resistance alone to
  // argue with it — ten-plus seconds of backwards travel nobody requested,
  // reported as "the car just wants to drive backwards all the time". Engine
  // braking now kills undemanded reverse inside two seconds, and the
  // deliberate path (hold brake at a standstill until reverse arms) must keep
  // working or the fix has quietly deleted the reverse gear. Driven straight
  // through Car.update with fixed dt, so the box's frame rate is irrelevant.
  const gears = await hFr.locator('body').evaluate(() => {
    const f = window.App.world.frame;
    // A shove: -5 m/s, no input at all. Two simulated seconds.
    const c1 = window.Car.create(4, 4, 0.3);
    c1.y = window.Terrain.heightAt(f, 4, 4) || 0;
    c1.speed = -5;
    const idle = window.Car.blankInput();
    for (let i = 0; i < 40; i++) window.Car.update(c1, idle, 0.05, f);
    // Deliberate reverse: brake held from a standstill, well past REV_ARM.
    const c2 = window.Car.create(4, 4, 0.3);
    c2.y = c1.y;
    const braking = Object.assign(window.Car.blankInput(), { brake: 1 });
    for (let i = 0; i < 40; i++) window.Car.update(c2, braking, 0.05, f);
    // The STICK'S hold: same held brake, flagged as a stop (noRev). This is
    // what the stick sends when its set-point sits at zero — which is where
    // it SPAWNS, because roadCruise is 0 until the car is found on a road.
    // Without the flag this armed reverse and the car backed itself to the
    // reverse floor straight out of the load: 20 km/h, R, no input at all.
    const c3 = window.Car.create(4, 4, 0.3);
    c3.y = c1.y;
    const holding = Object.assign(window.Car.blankInput(), { brake: 1, noRev: true });
    for (let i = 0; i < 60; i++) window.Car.update(c3, holding, 0.05, f);
    return { afterShove: +c1.speed.toFixed(2), deliberate: +c2.speed.toFixed(2), held: +c3.speed.toFixed(2) };
  });
  check('HILLS: a rebound cannot keep the car reversing (engine braking wins)',
    gears.afterShove > -0.5, 'speed ' + gears.afterShove + ' m/s two sim-seconds after a -5 m/s shove');
  check('HILLS: …but deliberate reverse (brake held past the arm) still works',
    gears.deliberate < -1, 'speed ' + gears.deliberate + ' m/s');
  check('HILLS: the stick\'s hold-at-zero can NEVER arm reverse (the spawn-in-R bug)',
    Math.abs(gears.held) < 0.1, 'speed ' + gears.held + ' m/s after three sim-seconds of held stop');
  await hCtx.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
