// Pack apps/matter-sandbox/ into the finished, downloadable
// site/apps/matter-sandbox/matter-sandbox.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Run:  node apps/matter-sandbox/build.mjs
import { matterSandboxIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

{
  const Orig = globalThis.CompressionStream;
  globalThis.CompressionStream = class CompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (Orig) return new Orig(format);
        throw new TypeError('unsupported format ' + format);
      }
      const chunks = [];
      const ts = new TransformStream({
        transform(chunk) { chunks.push(Buffer.from(chunk)); },
        flush(controller) {
          controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks))));
        }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (!existsSync(join(dir, 'vendor', 'matter.min.js'))) {
  throw new Error('vendor/matter.min.js is missing');
}
if (!existsSync(join(dir, 'vendor', 'COPYING-matter-js.txt'))) {
  throw new Error('vendor/COPYING-matter-js.txt is missing');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'connect-src', 'localStorage', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/matter.min.js', 'physics.js', 'app.js', 'net.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/matter.min.js': read('vendor/matter.min.js'),
  'physics.js': read('physics.js'),
  'app.js': read('app.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'COPYING-matter-js.txt': read('vendor/COPYING-matter-js.txt'),
};

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (manifest.name !== 'Matter Sandbox') throw new Error('manifest.name must be Matter Sandbox');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.world || manifest.data.world.visibility !== 'read-only') {
  throw new Error('manifest.data.world must be read-only — the host publishes the pile');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('matter-sandbox has no network path');
if (listing.basedOn?.name !== 'matter.js') {
  throw new Error('listing.basedOn.name must be matter.js');
}
if (listing.author?.name !== 'Liam Brummitt') {
  throw new Error('listing.author.name must be Liam Brummitt — they are the author, GifOS is the porter');
}
if (listing.porter?.name !== 'GifOS') {
  throw new Error('listing.porter.name must be GifOS');
}
if (listing.basedOn?.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/matter.min.js' && (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s))) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  if (n === 'vendor/matter.min.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

if (!files['boot.js'].includes('function persistNow')) {
  throw new Error('boot.js must persistNow so close can flush the pile');
}
if (!files['boot.js'].includes("addEventListener('pagehide'")) {
  throw new Error('boot.js must flush on pagehide');
}
if (!/if \(saveTimer\) return/.test(files['boot.js'])) {
  throw new Error('persist must not retrigger an armed debounce');
}
if (/if \(saveTimer\) clearTimeout\(saveTimer\);\s*saveTimer = setTimeout/.test(files['boot.js'])) {
  throw new Error('persist retriggers while dirty — the pile never writes');
}
if (!files['boot.js'].includes('MSPhysics.isDirty()) persist()')) {
  throw new Error('onTick must still persist while dirty');
}

function loadPhysics() {
  const sandbox = {
    console,
    Math, Date, parseInt, parseFloat, NaN, Infinity, undefined, isFinite, isNaN,
    performance: { now: () => Date.now() },
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(files['vendor/matter.min.js'], sandbox);
  vm.runInContext(files['physics.js'], sandbox);
  return sandbox;
}

{
  const sandbox = loadPhysics();
  const P = sandbox.MSPhysics;
  const M = sandbox.Matter;
  if (!P || typeof P.create !== 'function') throw new Error('physics.js did not attach MSPhysics');
  if (!M || M.version !== '0.20.0') throw new Error('expected matter-js 0.20.0, got ' + (M && M.version));
  P.create();
  P.resetArena();
  const n0 = P.bodyCount();
  if (n0 < 20) throw new Error('arena should have a sling + pyramids, got ' + n0 + ' bodies');
  if (!P.findSling() || !P.findSling().rock) throw new Error('arena is missing the slingshot');
  const box = P.addBox(80, 40);
  if (!box) throw new Error('addBox failed');
  const y0 = box.position.y;
  for (let i = 0; i < 50; i++) P.step(1000 / 60);
  if (box.position.y <= y0 + 20) throw new Error('box did not fall');
  const rag = P.addRagdoll(200, 120);
  if (!rag || rag.bodies.length !== 10) throw new Error('ragdoll should be 10 bodies');
  const snap = P.exportScene();
  if (!snap.b || snap.b.length !== P.bodyCount()) throw new Error('export body count mismatch');
  P.clearToys();
  if (P.bodyCount() !== 0) throw new Error('clearToys should leave only walls');
  P.importScene(snap);
  if (P.bodyCount() !== snap.b.length) {
    throw new Error('importScene lost bodies: ' + P.bodyCount() + ' vs ' + snap.b.length);
  }
  if (!P.findSling()) throw new Error('importScene lost the slingshot');
  P.setGravity(0);
  const floater = P.addBall(400, 80);
  const fy = floater.position.y;
  for (let i = 0; i < 30; i++) P.step(1000 / 60);
  if (Math.abs(floater.position.y - fy) > 25) throw new Error('gravity 0 should not drop a ball');
  P.setGravity(1);
}

function makeMemDb() {
  const cols = new Map();
  return function (name) {
    if (!cols.has(name)) cols.set(name, new Map());
    const store = cols.get(name);
    return {
      get(id) { return Promise.resolve(store.has(id) ? store.get(id) : null); },
      put(row) {
        store.set(row.id, JSON.parse(JSON.stringify(row)));
        return Promise.resolve();
      },
      getAll() { return Promise.resolve([...store.values()].map((r) => JSON.parse(JSON.stringify(r)))); },
      delete(id) { store.delete(id); return Promise.resolve(); },
      subscribe(fn) { fn([...store.values()]); }
    };
  };
}

function makeEl(id) {
  const s = new Set();
  return {
    id, hidden: false, textContent: '', innerHTML: '', value: '10',
    style: {}, width: 800, height: 600, clientWidth: 800, clientHeight: 600,
    classList: {
      add: (c) => s.add(c),
      remove: (c) => s.delete(c),
      toggle(c, on) {
        if (on === true) s.add(c);
        else if (on === false) s.delete(c);
        else if (s.has(c)) s.delete(c);
        else s.add(c);
      },
      contains: (c) => s.has(c)
    },
    addEventListener() {},
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    getContext() {
      const noop = function () {};
      return {
        fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', lineCap: '',
        font: '', textAlign: '',
        setTransform: noop, fillRect: noop, fill: noop, stroke: noop,
        beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
        arc: noop, fillText: noop
      };
    },
    setPointerCapture() {},
    releasePointerCapture() {}
  };
}

function loadApp(dbFn) {
  const ids = ['world', 'stage', 'hint', 'pauseBtn', 'stackBtn', 'resetBtn', 'grav', 'gravN',
    'friend-bar', 'friend-scores', 'friend-status', 'shareBtn', 'leaveBtn'];
  const els = {};
  for (const id of ids) els[id] = makeEl(id);
  const docListeners = {};
  const winListeners = {};
  let now = 0;
  let tid = 0;
  const timeouts = [];
  const raf = [];
  const document = {
    readyState: 'complete',
    hidden: false,
    body: { classList: makeEl('body').classList },
    getElementById: (id) => els[id] || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
    removeEventListener() {},
    activeElement: null
  };
  const sandbox = {
    console, Math, Date, parseInt, parseFloat, NaN, Infinity, undefined,
    isFinite, isNaN, Error, TypeError,
    performance: { now: () => now },
    devicePixelRatio: 1,
    document,
    navigator: { userAgent: 'node' }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.gifos = {
    db: dbFn,
    info: () => Promise.resolve({ owner: true }),
    me: () => Promise.resolve({ id: 'host', name: 'Hana' }),
    onBack() {}
  };
  sandbox.setTimeout = function (fn, ms) {
    const id = ++tid;
    timeouts.push({ id, fn, at: now + (ms || 0) });
    return id;
  };
  sandbox.clearTimeout = function (id) {
    for (let i = timeouts.length - 1; i >= 0; i--) {
      if (timeouts[i].id === id) timeouts.splice(i, 1);
    }
  };
  sandbox.requestAnimationFrame = function (fn) {
    raf.push(fn);
    return ++tid;
  };
  sandbox.cancelAnimationFrame = function () {};
  sandbox.addEventListener = function (ev, fn) {
    (winListeners[ev] = winListeners[ev] || []).push(fn);
  };
  sandbox.removeEventListener = function () {};
  function fireDue() {
    timeouts.sort((a, b) => a.at - b.at);
    while (timeouts.length && timeouts[0].at <= now) timeouts.shift().fn();
  }
  sandbox._pump = function (ms, dt) {
    dt = dt || 16;
    const end = now + ms;
    while (now < end) {
      now += dt;
      fireDue();
      const fns = raf.splice(0);
      for (const fn of fns) fn(now);
    }
  };
  sandbox._winListeners = winListeners;
  sandbox._docListeners = docListeners;
  vm.createContext(sandbox);
  vm.runInContext(files['vendor/matter.min.js'], sandbox);
  vm.runInContext(files['physics.js'], sandbox);
  vm.runInContext(files['app.js'], sandbox);
  vm.runInContext(files['net.js'], sandbox);
  vm.runInContext(files['boot.js'], sandbox);
  return sandbox;
}

async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

{
  const db = makeMemDb();
  const a = loadApp(db);
  await settle();
  if (!a.MSPhysics || !a.MSPhysics.engine()) throw new Error('boot did not mount the world');
  const n0 = a.MSPhysics.bodyCount();
  if (n0 < 20) throw new Error('first-boot arena too small: ' + n0);
  a.MSPhysics.addBox(80, 40);
  a.MSPhysics.addBox(140, 40);
  const n1 = a.MSPhysics.bodyCount();
  if (n1 !== n0 + 2) throw new Error('dropped boxes missing: ' + n0 + ' -> ' + n1);
  if (!a.MSPhysics.isDirty()) throw new Error('drops should leave the world dirty');
  a._pump(1600);
  await settle();
  const row = await db('save').get('scene');
  if (!row || !row.scene || !row.scene.b) throw new Error('persist never wrote a scene while the world stayed dirty');
  if (row.scene.b.length !== n1) {
    throw new Error('persist wrote ' + row.scene.b.length + ' bodies, want ' + n1);
  }
  const b = loadApp(db);
  await settle();
  const n2 = b.MSPhysics.bodyCount();
  if (n2 !== n1) {
    throw new Error('reopen restored ' + n2 + ' bodies, want ' + n1 + ' (dropped boxes did not survive close)');
  }

  const dbHide = makeMemDb();
  const c = loadApp(dbHide);
  await settle();
  const c0 = c.MSPhysics.bodyCount();
  c.MSPhysics.addBox(90, 50);
  c.MSPhysics.addBox(150, 50);
  const c1 = c.MSPhysics.bodyCount();
  (c._winListeners.pagehide || []).forEach((fn) => fn({ type: 'pagehide' }));
  await settle();
  const d = loadApp(dbHide);
  await settle();
  const dN = d.MSPhysics.bodyCount();
  if (dN !== c1 || dN !== c0 + 2) {
    throw new Error('pagehide reopen restored ' + dN + ', want ' + c1);
  }
  console.log('persist/reopen ok —', n0, '->', n1, 'bodies survived close');
}

{
  const sandbox = loadPhysics();
  const P = sandbox.MSPhysics;
  P.create();
  P.resetArena();
  P.addRagdoll(280, 140);
  const M = sandbox.Matter;
  for (let i = 0; i < 55; i++) M.Engine.update(P.engine(), 1000 / 60);
  const s = P.findSling();
  if (s && s.elastic) M.Composite.remove(P.engine().world, s.elastic);
  if (s && s.rock) {
    M.Body.setPosition(s.rock, { x: 390, y: 360 });
    M.Body.setVelocity(s.rock, { x: 14, y: 6 });
    M.Body.setAngularVelocity(s.rock, 0.25);
  }
  for (let i = 0; i < 10; i++) M.Engine.update(P.engine(), 1000 / 60);
  const scene = {
    bodies: P.snapshotBodies(),
    constraints: P.snapshotConstraints(),
    gravity: P.gravity()
  };
  if (scene.bodies.length < 20) throw new Error('cover scene is too empty');
  const shot = screenshotPng(scene);
  if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
  writeFileSync(join(dir, 'screenshot.png'), shot);
}

const bytes = await gif.encode(files, { preview: matterSandboxIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'matter-sandbox', 'matter-sandbox.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/matter-sandbox/matter-sandbox.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
