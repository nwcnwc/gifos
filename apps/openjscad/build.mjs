// Pack apps/openjscad/ into the finished, downloadable
// site/apps/openjscad/openjscad.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which copies the pinned
// @jscad/modeling UMD bundle and is run only when the pin moves.
//
// Run:  node apps/openjscad/build.mjs
import { openjscadIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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
        transform(chunk, _c, controller) { chunks.push(Buffer.from(chunk)); },
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

for (const need of [
  'vendor/jscad-modeling.min.js',
  'vendor/COPYING-jscad.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const MODELING_SHA256 = '3c4e2acfeadafe519b2e05f557d765390e5cb0e3d223dc148c631b6ebb12e482';
const modelingBuf = readFileSync(join(dir, 'vendor', 'jscad-modeling.min.js'));
const modelingHex = createHash('sha256').update(modelingBuf).digest('hex');
if (modelingHex !== MODELING_SHA256) {
  throw new Error('vendor/jscad-modeling.min.js sha256 ' + modelingHex + ' ≠ pin ' + MODELING_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'openjscad') throw new Error('appId must be openjscad');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('openjscad has no network path');
if (manifest.capabilities.wasm) throw new Error('openjscad is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private — the last script stays on this device');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-only') {
  throw new Error('room must be read-only — guests watch the host script');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'OpenJSCAD') {
  throw new Error('basedOn.name must be OpenJSCAD');
}
if (listing.basedOn.url !== 'https://github.com/jscad/OpenJSCAD.org') {
  throw new Error('basedOn.url must be jscad/OpenJSCAD.org');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is JSCAD Organization, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must include Utilities');
}
if (listing.releaseDate !== '2026-08-30') throw new Error('listing.releaseDate must be 2026-08-30');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/openjscad') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
if (!/lives in this file/i.test(listing.description) && !/live in this file/i.test(listing.description)) {
  throw new Error('listing must say the script lives in the file');
}
if (!/invite/i.test(listing.description)) throw new Error('listing must mention Invite');
if (!/unofficial port/i.test(listing.description)) throw new Error('listing must say unofficial port');

const SCRIPTS = [
  'vendor/jscad-modeling.min.js',
  'engine.js',
  'viewer.js',
  'samples.js',
  'net.js',
  'boot.js'
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/jscad-modeling.min.js': modelingBuf.toString('utf8'),
  'engine.js': read('engine.js'),
  'viewer.js': read('viewer.js'),
  'samples.js': read('samples.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'COPYING-jscad.txt': read('vendor/COPYING-jscad.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['boot.js'].includes('Invite') && !files['net.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['boot.js'].includes("db('save')") || !files['boot.js'].includes("id: 'last'")) {
  throw new Error('boot.js must save the last script privately');
}
if (!files['boot.js'].includes('onBack')) {
  throw new Error('boot.js must register gifos.onBack so Back returns to the model');
}
if (!files['style.css'].includes('touch-action: none')) {
  throw new Error('style.css must set touch-action: none on the canvas so pinch orbits');
}
if (!files['engine.js'].includes('createElement') || !files['engine.js'].includes('new Function')) {
  throw new Error('engine.js must compile via a script tag in the app (CSP) and Function in Node');
}
if (!files['samples.js'].includes('cuboid') || !files['samples.js'].includes('gearProfile')) {
  throw new Error('samples.js must ship cube and gear scripts');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/jscad-modeling.min.js' && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  if (n === 'vendor/jscad-modeling.min.js' || n === 'engine.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-jscad.txt'].includes('JSCAD Organization')) {
  throw new Error('COPYING-jscad.txt is not the upstream MIT notice');
}

{
  const ctx = {
    console,
    atob, btoa,
    Float32Array, Uint8Array, ArrayBuffer, DataView, Blob,
    Math, Date, JSON, Error, Array, Object, String, Number, Boolean, parseInt, parseFloat
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInNewContext(
    files['vendor/jscad-modeling.min.js'] + '\n' +
    files['engine.js'] + '\n' +
    files['samples.js'] + '\n' +
    'result = (function () {\n' +
    '  var E = JscadEngine;\n' +
    '  var S = JscadSamples;\n' +
    '  if (!jscadModeling) throw new Error("no jscadModeling");\n' +
    '  var cube = E.run(S.cube, { size: 20, hole: 13 });\n' +
    '  if (!cube.mesh.count) throw new Error("cube produced no triangles");\n' +
    '  if (cube.mesh.count < 80) throw new Error("cube mesh too thin: " + cube.mesh.count);\n' +
    '  var gear = E.run(S.gear, { teeth: 16, thick: 6, bore: 4 });\n' +
    '  if (gear.mesh.count < 40) throw new Error("gear mesh too thin: " + gear.mesh.count);\n' +
    '  var stl = E.meshToStl(gear.mesh);\n' +
    '  if (!(stl instanceof ArrayBuffer) || stl.byteLength < 84) throw new Error("stl size");\n' +
    '  var dv = new DataView(stl);\n' +
    '  if (dv.getUint32(80, true) !== gear.mesh.count) throw new Error("stl count");\n' +
    '  var threw = false;\n' +
    '  try { E.run("const main = () => 1\\nmodule.exports = { main }"); } catch (e) { threw = /triangles|shape|nothing/i.test(e.message); }\n' +
    '  if (!threw) throw new Error("non-solid main should refuse");\n' +
    '  threw = false;\n' +
    '  try { E.run("module.exports = {}"); } catch (e) { threw = /main/.test(e.message); }\n' +
    '  if (!threw) throw new Error("missing main should refuse");\n' +
    '  return { cube: cube.mesh.count, gear: gear.mesh.count, stl: stl.byteLength };\n' +
    '})();',
    ctx
  );
  if (!ctx.result || !ctx.result.cube || !ctx.result.gear) throw new Error('engine checks failed');
  console.log('cube', ctx.result.cube, 'tris · gear', ctx.result.gear, 'tris · stl', ctx.result.stl, 'bytes');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: openjscadIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'openjscad', 'openjscad.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/openjscad/openjscad.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
