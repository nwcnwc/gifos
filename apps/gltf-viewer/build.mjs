// Pack apps/gltf-viewer/ into the finished, downloadable
// site/apps/gltf-viewer/gltf-viewer.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/three-viewer.js
// from the pinned three.js and is run only when the pin moves.
//
// Run:  node apps/gltf-viewer/build.mjs
import { gltfViewerIcon, screenshotPng } from './icon.mjs';
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

for (const need of [
  'vendor/three-viewer.js',
  'vendor/COPYING-three.txt',
  'vendor/COPYING-gltf-viewer.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const THREE_SHA256 = '28b59a3964eb9d9fe337a4e378815cfbcdb5b2f4147620c9e6aa554fc4eaee5e';
const threeBuf = readFileSync(join(dir, 'vendor', 'three-viewer.js'));
const threeHex = createHash('sha256').update(threeBuf).digest('hex');
if (threeHex !== THREE_SHA256) {
  throw new Error('vendor/three-viewer.js sha256 ' + threeHex + ' ≠ pin ' + THREE_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'gltf-viewer') throw new Error('appId must be gltf-viewer');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('gltf-viewer has no network path');
if (manifest.capabilities.wasm) throw new Error('gltf-viewer is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private — the last model stays on this device');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'glTF Viewer') {
  throw new Error('basedOn.name must be glTF Viewer');
}
if (listing.basedOn.url !== 'https://github.com/donmccurdy/three-gltf-viewer') {
  throw new Error('basedOn.url must be donmccurdy/three-gltf-viewer');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Don McCurdy, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must include Utilities');
}
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/gltf-viewer') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/three-viewer.js', 'viewer.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/three-viewer.js': threeBuf.toString('utf8'),
  'viewer.js': read('viewer.js'),
  'app.js': read('app.js'),
  'COPYING-three.txt': read('vendor/COPYING-three.txt'),
  'COPYING-gltf-viewer.txt': read('vendor/COPYING-gltf-viewer.txt'),
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
if (!files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last model privately');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/three-viewer.js' && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  if (n === 'vendor/three-viewer.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-three.txt'].includes('three.js authors')) {
  throw new Error('COPYING-three.txt is not the three.js MIT notice');
}
if (!files['COPYING-gltf-viewer.txt'].includes('Don McCurdy')) {
  throw new Error('COPYING-gltf-viewer.txt is not the upstream MIT notice');
}
if (files['viewer.js'].includes('unpkg') || files['app.js'].includes('unpkg')) {
  throw new Error('remote decoder / HDR path leaked into the port');
}

{
  const ctx = { window: {}, console, atob, btoa, Image: function () {} };
  ctx.window = ctx;
  vm.runInNewContext(files['viewer.js'] + '\n' +
    'result = (function () {\n' +
    '  var V = GltfViewer;\n' +
    '  var glb = new Uint8Array([0x67,0x6c,0x54,0x46,0,0,0,2]).buffer;\n' +
    '  if (!V.isGlb(glb)) throw new Error("glb magic");\n' +
    '  var not = new Uint8Array([0,1,2,3]).buffer;\n' +
    '  if (V.isGlb(not)) throw new Error("false glb");\n' +
    '  var json = V.inlineGltf("{\\"asset\\":{\\"version\\":\\"2.0\\"},\\"buffers\\":[{\\"uri\\":\\"a.bin\\",\\"byteLength\\":3}]}", new Map([["a.bin", new Uint8Array([1,2,3]).buffer]]));\n' +
    '  if (json.buffers[0].uri.indexOf("data:") !== 0) throw new Error("inline buffer");\n' +
    '  var threw = false;\n' +
    '  try { V.inlineGltf("{\\"extensionsUsed\\":[\\"KHR_draco_mesh_compression\\"]}", new Map()); } catch (e) { threw = /Draco/.test(e.message); }\n' +
    '  if (!threw) throw new Error("draco should refuse");\n' +
    '  return true;\n' +
    '})();',
    ctx
  );
  if (!ctx.result) throw new Error('viewer checks failed');
  console.log('GLB magic + inline-gltf + Draco refuse ok');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: gltfViewerIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'gltf-viewer', 'gltf-viewer.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/gltf-viewer/gltf-viewer.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
