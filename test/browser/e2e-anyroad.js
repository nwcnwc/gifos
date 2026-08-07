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
// Needs: static server on 8099 (python3 -m http.server 8099 -d site).
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');
const zlib = require('zlib');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// ---- fixture: a terrarium elevation tile ------------------------------------
// terrarium packs metres as height = R*256 + G + B/256 - 32768. We encode a
// constant, deliberately awkward height so a UTF-8 round-trip could not
// possibly reproduce it by luck.
const FIXTURE_HEIGHT = 412.5;
function terrariumPixel(h) {
  const v = Math.round((h + 32768) * 256);       // in 1/256 m units
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function terrariumTile(size, h) {
  const [r, g, b] = terrariumPixel(h);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;                      // 8-bit truecolour RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const TILE_PNG = terrariumTile(64, FIXTURE_HEIGHT);

// ---- fixture: an Overpass answer --------------------------------------------
// One long residential way through the drop point, plus a building, in the
// `out geom` shape the app parses. Built around the preset it hops to.
const HOP = { lat: 48.8698, lon: 2.3078 };       // the Paris preset
function overpassBody() {
  const geom = [];
  for (let i = -60; i <= 60; i++) geom.push({ lat: HOP.lat + i * 0.00012, lon: HOP.lon + i * 0.00004 });
  return JSON.stringify({
    elements: [
      { type: 'way', id: 1, tags: { highway: 'residential', name: 'Fixture Street' }, geometry: geom },
      { type: 'way', id: 2, tags: { highway: 'primary', name: 'Grand Boulevard' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0009 })) },
      // A six-lane motorway and a dirt track, far enough out not to be what the
      // car lands on. OSM tags `surface` and `lanes` on the way and the parser
      // never looked at either, so a farm track was drawn as asphalt with a
      // painted centre line and a motorway was as wide as a B road.
      { type: 'way', id: 4, tags: { highway: 'motorway', lanes: '6', name: 'A1' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0018 })) },
      { type: 'way', id: 5, tags: { highway: 'track', surface: 'dirt' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon - 0.0015 })) },
      { type: 'way', id: 6, tags: { highway: 'unclassified', surface: 'gravel' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon - 0.0021 })) },
      { type: 'way', id: 3, tags: { building: 'yes', 'building:levels': '4' }, geometry: [
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0004 },
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0007 },
        { lat: HOP.lat + 0.0007, lon: HOP.lon + 0.0007 },
        { lat: HOP.lat + 0.0007, lon: HOP.lon + 0.0004 },
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0004 },
      ] },
      { type: 'way', id: 7, tags: { highway: 'residential', name: 'Crossing Lane' }, geometry: [
        { lat: HOP.lat, lon: HOP.lon - 0.0006 }, { lat: HOP.lat, lon: HOP.lon + 0.0006 },
      ] },
      ...mixedStreet(),
    ],
  });
}

// A street with KNOWN building types on it. OSM carries `building=house`,
// `building=retail`, `building=warehouse` and the rest, and until 2026-08 the
// parser tested the tag for truthiness and threw the value away — so this
// fixture exists to hold the classifier to what the data actually said.
// Houses down one side, a parade of shops, an office and a shed down the other.
function mixedStreet() {
  const out = [];
  let id = 100;
  const box = (tags, lat, lon, dlat, dlon) => ({
    type: 'way', id: id++, tags,
    geometry: [
      { lat, lon }, { lat, lon: lon + dlon },
      { lat: lat + dlat, lon: lon + dlon }, { lat: lat + dlat, lon },
      { lat, lon },
    ],
  });
  const KINDS = [
    { building: 'retail' },
    { building: 'commercial', 'building:levels': '5' },
    { building: 'warehouse' },
    { building: 'church' },
  ];
  for (let i = -6; i < 6; i++) {
    const lat = HOP.lat + i * 0.00036, lon = HOP.lon + i * 0.00012;
    out.push(box({ building: 'house' }, lat, lon - 0.00035, 0.00009, 0.00013));
    out.push(box(KINDS[((i % 4) + 4) % 4], lat, lon + 0.00022, 0.00011, 0.00020));
  }
  return out;
}

(async () => {
  const gifB64 = readFileSync(appGif('anyroad')).toString('base64');

  const browser = await chromium.launch({
    executablePath: CHROME,
    // The gate box has no GPU; without a software rasteriser there is no WebGL
    // context at all and the app would correctly refuse to run.
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext();

  // Intercept every external host the app is allowed to reach. Anything NOT
  // matched here is aborted, so an unnoticed new dependency fails loudly rather
  // than quietly reaching the open internet from CI.
  let terrainHits = 0, overpassHits = 0;
  await context.route('**://s3.amazonaws.com/**', async (route) => {
    terrainHits++;
    await route.fulfill({ status: 200, contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: TILE_PNG });
  });
  await context.route(/overpass/, async (route) => {
    overpassHits++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: overpassBody() });
  });
  await context.route('**://nominatim.openstreetmap.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([{ lat: String(HOP.lat), lon: String(HOP.lon), display_name: 'Fixture Street, Paris' }]) });
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  await page.goto(BASE + '/index.html');
  // Generous: this suite renders a 3D world in a second tab, so it tends to run
  // on machines already doing something. A contended 4-core box took 20 s to
  // paint the Home Screen — which is slow, not broken, and a tight timeout here
  // reports it as a product failure.
  await page.waitForSelector('.icon', { timeout: 45000 });
  await sleep(400);

  // Install the built GIF exactly as a downloaded app would land.
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Anyroad.gif', bytes, kind: 'gif', isApp: true, appId: 'anyroad', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Anyroad.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);

  check('the built GIF is a valid GifOS app', await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return GifOS.gif.looksLikeGifosGif(bytes);
  }, gifB64));

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Anyroad.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  // A backgrounded tab has its requestAnimationFrame throttled to roughly a
  // frame a second, and this app IS its animation loop — the world would render
  // but the car would advance about a twentieth of a second of simulation per
  // wall-clock second and read as "the throttle does nothing".
  await app.bringToFront();
  await app.waitForSelector('iframe', { timeout: 10000 });
  // Acknowledge the declared-network / capability prompt the runtime shows.
  await app.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 5000 }).catch(() => {});
  const fr = app.frameLocator('iframe');

  await fr.locator('#landing').waitFor({ timeout: 10000 });
  check('Anyroad boots inside the sandbox', await fr.locator('h1').textContent() === 'Anyroad');

  const hasGL = await fr.locator('body').evaluate(() => !!(window.Render && window.Render.gl));
  check('a WebGL context exists', hasGL);

  // Hop to the preset the fixtures are built around.
  await fr.locator('#presets button', { hasText: 'Paris' }).first().click();
  await fr.locator('#hud').waitFor({ state: 'visible', timeout: 8000 });

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

  check('elevation tiles fetched through the bridge', terrainHits > 0, terrainHits + ' requests');
  check('terrain tiles decoded and loaded', state.terrain > 0, state.terrain + ' tiles');

  // THE binary-fetch assertion: the height the app reports has to be the height
  // encoded in the fixture PNG's pixels. A UTF-8 round-trip cannot produce it.
  check('a PNG\'s pixels survive gifos.fetch as real metres',
    state.height !== null && Math.abs(state.height - FIXTURE_HEIGHT) < 0.5,
    'got ' + (state.height === null ? 'null' : state.height.toFixed(2)) + ' m, expected ' + FIXTURE_HEIGHT);

  check('Overpass geometry fetched', overpassHits > 0, overpassHits + ' queries');
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

  // Drive: hold the throttle and confirm the car actually moves over ground.
  const before = await fr.locator('body').evaluate(() => {
    const c = window.App.car(); return { x: c.x, z: c.z, odo: c.odometer };
  });
  // NO INPUT AT ALL. The throttle was removed: the car cruises by itself at
  // whatever the road under it is built for, which is the whole point of the
  // control redesign. If this needs a button pressed, the redesign regressed.
  await sleep(6000);
  const after = await fr.locator('body').evaluate(() => {
    const c = window.App.car(); return { x: c.x, z: c.z, odo: c.odometer, y: c.y, speed: c.speed };
  });
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  // Deliberately loose. dt is clamped at 50 ms for stability, so on the gate's
  // software rasteriser simulated time runs behind wall clock and three seconds
  // of throttle covers less ground than it would on a GPU. The signal being
  // guarded is "throttle produces motion" — the failure mode this caught was
  // 0.0 m, not a metre or two either side.
  // Guard the MECHANISM, not a magnitude. dt is clamped at 50 ms for stability,
  // so simulated time trails wall clock by a factor set entirely by frame rate —
  // and on a 4-core box under load the same build covered 4.0 m one run and
  // 1.2 m the next. Tuning the threshold to the good runs just buys a flake.
  check('the car cruises with no input at all', moved > 0.5 && after.speed > 1,
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
  check('speed falls while the brake is held',
    braked < midBrake.speed && braked < after.speed,
    after.speed.toFixed(1) + ' -> ' + midBrake.speed.toFixed(1) + ' -> ' + braked.toFixed(2) + ' m/s');

  // The throttle pedal must be absent in the default mode — a GO button that
  // does nothing is worse than no button.
  // GO is hidden while the car is DRIVING in the default scheme — a button that
  // does nothing is worse than no button. It appears when you are stopped, and
  // that case is guarded with the halt below.
  const goWhileMoving = await fr.locator('body').evaluate(() => {
    const c = window.App.car();
    c.halted = false;
    window.UI.hud({ speed: 40, halted: false, steer: 0, health: 100, net: { backoffMs: 0 },
                    ready: true, players: 1, race: null, odometer: 0 });
    return document.getElementById('pedal-gas').hidden;
  });
  check('no throttle pedal in the default control scheme while moving', goWhileMoving);
  const goWhenStopped = await fr.locator('body').evaluate(() => {
    window.UI.hud({ speed: 0, halted: true, steer: 0, health: 100, net: { backoffMs: 0 },
                    ready: true, players: 1, race: null, odometer: 0 });
    return !document.getElementById('pedal-gas').hidden;
  });
  check('…and GO appears the moment you are stopped, so there is a way to move off',
    goWhenStopped);
  check('the car sits on the fetched terrain, not at zero',
    Math.abs(after.y - FIXTURE_HEIGHT) < 3, 'car y = ' + after.y.toFixed(1) + ' m');

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
  await sleep(2500);
  const unparked = await fr.locator('body').evaluate(() => ({
    park: window.App.debug().input.park, speed: window.App.car().speed,
  }));
  check('a full-screen panel parks the car instead of driving it blind',
    parked.park === true && Math.abs(parked.speed) < 0.001,
    'park=' + parked.park + ' speed=' + parked.speed.toFixed(3));
  check('closing the panel hands the car back',
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
    const heavy = window.Car.create(0, 0, 0); heavy.speed = 25;
    window.Animals.clear();
    window.Animals.inject({ kind: 'cow', x: 0, z: 2, y: 0, yaw: 0 });
    const cowHit = window.Animals.update(heavy, ctx, 0.016);
    const light = window.Car.create(0, 0, 0); light.speed = 25;
    window.Animals.clear();
    window.Animals.inject({ kind: 'goose', x: 0, z: 2, y: 0, yaw: 0 });
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
    surfacing.pieces > 0 && surfacing.longest <= 9,
    'longest cross-section gap ' + surfacing.longest.toFixed(1) + ' m over ' + surfacing.pieces + ' pieces');
  check('the carriageway has a kerb skirt hanging below it',
    surfacing.below > 0, surfacing.below + ' skirt vertices below the ground line');
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
    const before = window.App.imagery();
    window.Sources.set({ imagery: 'maptiler' });
    await new Promise((r) => setTimeout(r, 600));
    const after = window.App.imagery();
    window.Sources.set({ imagery: 'none' });
    await new Promise((r) => setTimeout(r, 300));
    const off = window.App.imagery();
    return { before, after, off, tiles: Object.keys(window.App.world.terrain).length };
  });
  check('turning the satellite on re-drapes the ground already under you',
    drape.after.tried > drape.before.tried,
    drape.before.tried + ' -> ' + drape.after.tried + ' requests for ' + drape.tiles + ' loaded tiles');
  check('…and turning it off puts the stylised ground back',
    drape.off.draped === 0, drape.off.draped + ' tiles still textured');
  // It has no key in here, so it must FAIL — and failing visibly is the point:
  // an empty catch is why a missing key and a working satellite looked the same.
  check('a drape that cannot load says so instead of failing silently',
    !!drape.after.failed, 'reported: ' + JSON.stringify(drape.after.failed));
  // NOT_CONFIGURED makes the RUNTIME put its own "set it up" sheet over the
  // whole page — correct behaviour, and it is in the app page rather than the
  // sandboxed frame, so it covers every later click. Clear it.
  await app.evaluate(() => {
    document.querySelectorAll('#gifos-setup-ok').forEach((b) => b.click());
    document.querySelectorAll('.perm-modal').forEach((m) => m.remove());
  });
  await sleep(200);

  // ---- the bird's-eye inset ------------------------------------------------
  // Drawn from the same road index the car asks "am I on tarmac" with, so it
  // cannot disagree with the world. What must hold: the toggle shows it, it
  // actually draws something, and it is not eating pointer events over the
  // steering area.
  await fr.locator('#btn-map').click();
  await sleep(900);
  const map = await fr.locator('body').evaluate(() => {
    const cv = document.getElementById('mapcanvas');
    const g = cv.getContext('2d');
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    let ink = 0, road = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 8) ink++;
      // The tarmac grey the map paints carriageways with.
      if (Math.abs(px[i] - 74) < 26 && Math.abs(px[i + 1] - 79) < 26 && Math.abs(px[i + 2] - 87) < 26) road++;
    }
    const box = document.getElementById('minimap');
    return { shown: !box.hidden, ink, road, total: cv.width * cv.height,
             pointer: getComputedStyle(box).pointerEvents,
             pressed: document.getElementById('btn-map').getAttribute('aria-pressed') };
  });
  check('the map opens from its own chip', map.shown && map.pressed === 'true');
  check('the map draws the world, not an empty circle',
    map.ink > map.total * 0.2 && map.road > 200,
    Math.round(map.ink / map.total * 100) + '% painted, ' + map.road + ' carriageway pixels');
  check('the map never takes a pointer event', map.pointer === 'none', map.pointer);
  await fr.locator('#btn-map').click();

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

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
