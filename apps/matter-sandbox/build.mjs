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
