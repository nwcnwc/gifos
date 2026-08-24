// Pack apps/polygon-shredder/ into site/apps/polygon-shredder/polygon-shredder.gif
import { polygonShredderIcon, screenshotPng } from './icon.mjs';
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

const PINS = {
  'vendor/three.min.js': '6fb7a49250a57704831fd137e7e155d642d064da1f512ec3ef48279ed14d1db3',
  'vendor/shaders.js': '09910a630616d514f5dbea09eac1af4dab02b3dd5751f8b199bd3b677bb6539f',
  'vendor/shredder.js': 'edfc13e2f60f395b37712b2f01308e60acb91a44084d752a22fe2a336e224c8a',
};

for (const need of [
  'vendor/three.min.js', 'vendor/OrbitControls.js', 'vendor/shaders.js',
  'vendor/Simulation.js', 'vendor/shredder.js',
  'vendor/COPYING-polygon-shredder.txt', 'vendor/COPYING-three.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
function pin(rel, want) {
  const buf = readFileSync(join(dir, rel));
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== want) throw new Error(rel + ' sha256 ' + hex + ' ≠ pin ' + want);
  return buf;
}
for (const [rel, want] of Object.entries(PINS)) pin(rel, want);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'polygon-shredder') throw new Error('appId');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('db + multiplayer required');
}
if (manifest.capabilities.network) throw new Error('no network');
if (manifest.data.save.visibility !== 'private') throw new Error('save private');
if (manifest.data.room.visibility !== 'read-write') throw new Error('room read-write');
if (listing.basedOn.blessed !== false) throw new Error('blessed false');
if (listing.basedOn.name !== 'The Polygon Shredder') throw new Error('basedOn.name');
if (listing.basedOn.url !== 'https://github.com/spite/polygon-shredder') throw new Error('basedOn.url');
if (listing.author.name !== 'spite' || listing.porter.name !== 'GifOS') throw new Error('author/porter');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Creativity') throw new Error('license/category');
if (listing.releaseDate !== '2026-08-24') throw new Error('releaseDate');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/polygon-shredder') throw new Error('homepage');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'requestAnimationFrame', 'CDN', 'Three.js', 'dat.gui']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = [
  'vendor/three.min.js', 'vendor/OrbitControls.js', 'vendor/shaders.js',
  'vendor/Simulation.js', 'vendor/shredder.js', 'app.js', 'mp.js'
];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/three.min.js': read('vendor/three.min.js'),
  'vendor/OrbitControls.js': read('vendor/OrbitControls.js'),
  'vendor/shaders.js': read('vendor/shaders.js'),
  'vendor/Simulation.js': read('vendor/Simulation.js'),
  'vendor/shredder.js': read('vendor/shredder.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING-polygon-shredder.txt': read('vendor/COPYING-polygon-shredder.txt'),
  'COPYING-three.txt': read('vendor/COPYING-three.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('Invite is OS chrome');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes("db('save')")) throw new Error('Invite/save');
if (!files['vendor/shredder.js'].includes('aimFromEvent') || !files['vendor/shredder.js'].includes('pickFloat')) {
  throw new Error('first-tap aim and float-texture probe required');
}
if (!files['app.js'].includes('gifos.onBack') || !files['app.js'].includes('bootMount')) {
  throw new Error('Back-closes-knobs and GPU remount required');
}
if (!files['COPYING-polygon-shredder.txt'].includes('Jaume Sanchez')) throw new Error('COPYING');
if (!files['vendor/shredder.js'].includes('spotlightTexture')) throw new Error('procedural spotlight required');
if (files['vendor/shredder.js'].includes('spotlight.jpg')) throw new Error('do not fetch spotlight.jpg');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

{
  const ctx = { console, Math, THREE: undefined };
  vm.runInNewContext(files['vendor/shaders.js'] + '\nresult = Object.keys(PSShaders).sort().join(",");', ctx);
  if (ctx.result !== 'fs-particles,fs-particles-shadow,texture_fragment_simulation_shader,texture_vertex_simulation_shader,vs-particles') {
    throw new Error('shaders ' + ctx.result);
  }
  console.log('Polygon Shredder shaders ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: polygonShredderIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'polygon-shredder', 'polygon-shredder.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/polygon-shredder/polygon-shredder.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
