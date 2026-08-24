// Pack apps/sandspiel/ into site/apps/sandspiel/sandspiel.gif
import { sandspielIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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
const SCRIPTS = ['species.js', 'wasm-bytes.js', 'wasm.js', 'app.js', 'wall.js'];
if (!existsSync(join(dir, 'vendor', 'COPYING-sandspiel.txt'))) throw new Error('COPYING');
if (!existsSync(join(dir, 'vendor', 'UPSTREAM.txt'))) throw new Error('UPSTREAM');
if (!existsSync(join(dir, 'vendor', 'kernel.c'))) throw new Error('kernel.c');

function compileKernel() {
  const src = join(dir, 'vendor', 'kernel.c');
  const out = join(tmpdir(), 'sandspiel-kernel-' + process.pid + '.wasm');
  const r = spawnSync('clang', [
    '--target=wasm32', '-nostdlib', '-O2', '-fno-builtin', '-ffreestanding',
    '-c', '-o', out, src,
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error('clang --target=wasm32 failed: ' + (r.stderr || r.stdout || r.status));
  }
  const bytes = readFileSync(out);
  try { unlinkSync(out); } catch (e) {}
  if (bytes.length < 1000 || bytes[0] !== 0x00 || bytes[1] !== 0x61) throw new Error('kernel.wasm');
  return bytes;
}
const kernel = compileKernel();
const wasmBytesJs = 'window.SAND_WASM_B64=' + JSON.stringify(kernel.toString('base64')) + ';';

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'species.js': read('species.js'),
  'wasm-bytes.js': wasmBytesJs,
  'wasm.js': read('wasm.js'),
  'app.js': read('app.js'),
  'wall.js': read('wall.js'),
  'COPYING-sandspiel.txt': read('vendor/COPYING-sandspiel.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error(s);
if (/type=["']module["']/.test(html)) throw new Error('module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('url');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite');
if (manifest.minBuild !== 947) throw new Error('minBuild');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer || !manifest.capabilities.wasm) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('network');
if (manifest.capabilities.fullscreen) throw new Error('fullscreen');
if (manifest.capabilities.camera) throw new Error('camera');
if (manifest.data.save.visibility !== 'private' ||
    manifest.data.room.visibility !== 'read-write' ||
    manifest.data.boards.visibility !== 'read-write') {
  throw new Error('data');
}
if (!listing.basedOn || listing.basedOn.blessed !== false || listing.basedOn.name !== 'Sandspiel') {
  throw new Error('basedOn');
}
if (!listing.author || /gifos/i.test(listing.author.name) || listing.porter.name !== 'GifOS') throw new Error('credits');
if (listing.license !== 'MIT' || listing.releaseDate !== '2026-08-24') throw new Error('listing');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/sandspiel') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error(bad);
}
const helpBlob = files['help.md'];
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (helpBlob.includes(bad)) throw new Error('help ' + bad);
}
if (!files['COPYING-sandspiel.txt'].includes('Max Bittker')) throw new Error('COPYING');
if (!/file is the world/i.test(listing.tagline)) throw new Error('tagline');
if (!files['app.js'].includes("db('save')")) throw new Error('db save');
if (!files['wasm.js'].includes('WebAssembly.instantiate')) throw new Error('wasm instantiate');
if (!files['app.js'].includes('This toy needs a canvas')) throw new Error('canvas fail sentence');
if (!files['app.js'].includes('gifos.onBack')) throw new Error('onBack');
if (!files['index.html'].includes('id="hint"') || !files['index.html'].includes('Tap to pour')) throw new Error('empty hint');
if (!files['style.css'].includes('touch-action: none')) throw new Error('touch-action');
if (files['app.js'].includes('persist();') && /if \(!paused\) \{\s*uni\.tick\(\);\s*dirty = true;\s*persist\(\);/m.test(files['app.js'])) {
  throw new Error('do not persist every frame');
}
if (!files['wall.js'].includes("db('room')") || !files['wall.js'].includes("db('boards')")) throw new Error('db room/boards');
if (!files['wall.js'].includes('Invite')) throw new Error('Invite copy');
if (!files['wall.js'].includes("kind: 'card'") || !files['wall.js'].includes("kind: 'here'")) throw new Error('wall kinds');
if (files['wall.js'].includes('room.subscribe') === false) throw new Error('room subscribe');
if (/boards\.subscribe/.test(files['wall.js'])) throw new Error('boards must not be subscribed');
if (/firebase|webpack|sentry|serviceWorker/i.test(files['species.js'] + files['app.js'] + files['wall.js'])) {
  throw new Error('upstream stack stays behind');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

{
  const ctx = {
    console, Math, Uint8Array, Array, String, Number, Date,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  };
  ctx.window = ctx;
  vm.runInNewContext(
    files['species.js'] + '\n' +
    'result = (function () {\n' +
    '  var S = window.Sandspiel;\n' +
    '  var Sp = S.Species;\n' +
    '  var u = new S.Universe(6, 6);\n' +
    '  u.setCell(2, 2, S.makeCell(Sp.Sand, 120, 0));\n' +
    '  u.tick();\n' +
    '  if (u.getCell(2, 3).species !== Sp.Sand) throw new Error("sand fall");\n' +
    '  if (u.getCell(2, 2).species !== Sp.Empty) throw new Error("sand left");\n' +
    '  u = new S.Universe(4, 6);\n' +
    '  u.setCell(1, 1, S.makeCell(Sp.Water, 120, 0));\n' +
    '  u.tick();\n' +
    '  if (u.getCell(1, 2).species !== Sp.Water) throw new Error("water fall");\n' +
    '  u = new S.Universe(6, 8);\n' +
    '  u.setCell(2, 2, S.makeCell(Sp.Sand, 120, 0));\n' +
    '  u.setCell(2, 3, S.makeCell(Sp.Water, 120, 0));\n' +
    '  u.setCell(1, 3, S.makeCell(Sp.Wall, 80, 0));\n' +
    '  u.setCell(3, 3, S.makeCell(Sp.Wall, 80, 0));\n' +
    '  u.tick();\n' +
    '  if (u.getCell(2, 3).species !== Sp.Sand) throw new Error("sand sink");\n' +
    '  if (u.getCell(2, 2).species !== Sp.Water) throw new Error("water swap");\n' +
    '  var t;\n' +
    '  for (t = 0; t < 12; t++) u.tick();\n' +
    '  var sandY = -1, waterY = -1, x, y;\n' +
    '  for (x = 0; x < 6; x++) for (y = 0; y < 8; y++) {\n' +
    '    if (u.getCell(x, y).species === Sp.Sand) sandY = Math.max(sandY, y);\n' +
    '    if (u.getCell(x, y).species === Sp.Water) waterY = Math.max(waterY, y);\n' +
    '  }\n' +
    '  if (sandY < 0 || waterY < 0) throw new Error("missing after fall");\n' +
    '  if (sandY < waterY) throw new Error("sand below water " + sandY + " " + waterY);\n' +
    '  u = new S.Universe(5, 5);\n' +
    '  u.setCell(2, 2, S.makeCell(Sp.Lava, 140, 0));\n' +
    '  for (x = -1; x <= 1; x++) for (y = -1; y <= 1; y++) {\n' +
    '    if (x || y) u.setCell(2 + x, 2 + y, S.makeCell(Sp.Water, 120, 0));\n' +
    '  }\n' +
    '  var stone = false;\n' +
    '  for (t = 0; t < 40; t++) {\n' +
    '    u.tick();\n' +
    '    for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) if (u.getCell(x, y).species === Sp.Stone) stone = true;\n' +
    '    if (stone) break;\n' +
    '  }\n' +
    '  if (!stone) throw new Error("lava water stone");\n' +
    '  u = new S.Universe(5, 5);\n' +
    '  u.setCell(2, 2, S.makeCell(Sp.Fire, 200, 0));\n' +
    '  for (x = -1; x <= 1; x++) for (y = -1; y <= 1; y++) {\n' +
    '    if (x || y) u.setCell(2 + x, 2 + y, S.makeCell(Sp.Water, 120, 0));\n' +
    '  }\n' +
    '  var fireGone = false;\n' +
    '  for (t = 0; t < 40; t++) {\n' +
    '    u.tick();\n' +
    '    var f = false;\n' +
    '    for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) if (u.getCell(x, y).species === Sp.Fire) f = true;\n' +
    '    if (!f) { fireGone = true; break; }\n' +
    '  }\n' +
    '  if (!fireGone) throw new Error("fire water");\n' +
    '  u = new S.Universe(8, 8);\n' +
    '  u.setCell(4, 4, S.makeCell(Sp.Wall, 80, 0));\n' +
    '  u.paint(4, 4, 1, Sp.Sand);\n' +
    '  if (u.getCell(4, 4).species !== Sp.Wall) throw new Error("paint overwrite");\n' +
    '  u.paint(3, 4, 1, Sp.Sand);\n' +
    '  if (u.getCell(3, 4).species !== Sp.Sand) throw new Error("paint empty");\n' +
    '  u.paint(4, 4, 1, Sp.Empty);\n' +
    '  if (u.getCell(4, 4).species !== Sp.Empty) throw new Error("paint erase");\n' +
    '  u = new S.Universe(4, 3);\n' +
    '  u.setCell(1, 1, S.makeCell(Sp.Sand, 120, 3));\n' +
    '  u.setCell(2, 0, S.makeCell(Sp.Water, 90, 6));\n' +
    '  var packed = S.packCells(u.cells);\n' +
    '  var cells2 = S.unpackCells(packed, 4 * 3);\n' +
    '  if (cells2.length !== 12) throw new Error("len");\n' +
    '  if (cells2[u.index(1, 1)].species !== Sp.Sand || cells2[u.index(1, 1)].ra !== 120) throw new Error("pack sand");\n' +
    '  if (cells2[u.index(2, 0)].species !== Sp.Water || cells2[u.index(2, 0)].rb !== 6) throw new Error("pack water");\n' +
    '  return packed.length;\n' +
    '})();',
    ctx
  );
  console.log('sand / water / lava / fire / paint / pack ok —', ctx.result);
}

{
  const mod = await WebAssembly.compile(kernel);
  const mem = new WebAssembly.Memory({ initial: 8 });
  const sp = new WebAssembly.Global({ value: 'i32', mutable: true }, 65536);
  const tab = new WebAssembly.Table({ initial: 8, element: 'anyfunc' });
  const env = {};
  for (const i of WebAssembly.Module.imports(mod)) {
    if (i.module !== 'env') continue;
    if (i.kind === 'memory') env[i.name] = mem;
    if (i.kind === 'global') env[i.name] = sp;
    if (i.kind === 'table') env[i.name] = tab;
  }
  const inst = await WebAssembly.instantiate(mod, { env });
  const e = inst.exports;
  if (e.sand_width() !== 180 || e.sand_height() !== 120) throw new Error('wasm size');
  e.sand_init();
  e.sand_set(2, 2, 2, 120, 0);
  e.sand_tick();
  if ((e.sand_get(2, 3) & 255) !== 2) throw new Error('wasm sand fall');
  if ((e.sand_get(2, 2) & 255) !== 0) throw new Error('wasm sand left');
  e.sand_init();
  e.sand_set(1, 1, 3, 120, 0);
  e.sand_tick();
  if ((e.sand_get(1, 2) & 255) !== 3) throw new Error('wasm water fall');
  e.sand_init();
  e.sand_set(4, 4, 1, 80, 0);
  e.sand_paint(4, 4, 1, 2);
  if ((e.sand_get(4, 4) & 255) !== 1) throw new Error('wasm paint overwrite');
  e.sand_paint(3, 4, 1, 2);
  if ((e.sand_get(3, 4) & 255) !== 2) throw new Error('wasm paint empty');
  console.log('wasm kernel sand / water / paint ok —', kernel.length, 'bytes');
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: sandspielIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'sandspiel', 'sandspiel.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/sandspiel/sandspiel.gif —', bytes.length, 'bytes, from', Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
