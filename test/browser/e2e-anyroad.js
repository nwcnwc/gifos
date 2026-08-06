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
      { type: 'way', id: 1, tags: { highway: 'residential' }, geometry: geom },
      { type: 'way', id: 2, tags: { highway: 'primary' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0009 })) },
      { type: 'way', id: 3, tags: { building: 'yes', 'building:levels': '4' }, geometry: [
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0004 },
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0007 },
        { lat: HOP.lat + 0.0007, lon: HOP.lon + 0.0007 },
        { lat: HOP.lat + 0.0007, lon: HOP.lon + 0.0004 },
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0004 },
      ] },
    ],
  });
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
  check('no throttle pedal in the default control scheme',
    await fr.locator('#pedal-gas').isHidden());
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
      // readPixels' origin is bottom-left, so a LOW y is the foreground ground.
      const ground = read(Math.floor(cv.width / 2), Math.floor(cv.height * 0.12));
      const sky = read(Math.floor(cv.width / 2), Math.floor(cv.height * 0.95));
      resolve({ ground: ground, sky: sky,
                diff: Math.abs(ground[0] - sky[0]) + Math.abs(ground[1] - sky[1]) + Math.abs(ground[2] - sky[2]) });
    }));
  }));
  check('the renderer draws ground, not just sky', painted.diff > 40,
    'ground rgb ' + painted.ground.join(',') + ' vs sky ' + painted.sky.join(','));

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
