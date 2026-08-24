// Pack apps/lost-in-cyberspace/ into site/apps/lost-in-cyberspace/lost-in-cyberspace.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop uses.
//
// A-Frame / aframe.io / any jam server stay behind. The maze generator is
// the original. Offline and deterministic.
//
// Run:  node apps/lost-in-cyberspace/build.mjs
import { cyberspaceIcon, screenshotPng } from './icon.mjs';
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

const NET_SHA = '018b19a1749a8219ef21cc26023f4e55cd8af345bd617370e4cf88bd9fa2b7ea';
for (const need of ['vendor/network.js', 'vendor/COPYING-lost-in-cyberspace.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const netBuf = readFileSync(join(dir, 'vendor', 'network.js'));
const netHex = createHash('sha256').update(netBuf).digest('hex');
if (netHex !== NET_SHA) throw new Error('vendor/network.js sha256 ' + netHex + ' ≠ pin ' + NET_SHA);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'lost-in-cyberspace') throw new Error('appId');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('no network path — A-Frame CDN stays behind');
if (manifest.capabilities.wasm) throw new Error('classic JS');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save must be private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') throw new Error('room must be read-write');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'Lost in CYBERSPACE') throw new Error('basedOn.name');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (/gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('license MIT');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/lost-in-cyberspace') {
  throw new Error('homepage');
}
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['vendor/network.js', 'maze.js', 'app.js'];
const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/network.js': netBuf.toString('utf8'),
  'maze.js': read('maze.js'),
  'app.js': read('app.js'),
  'COPYING-lost-in-cyberspace.txt': read('vendor/COPYING-lost-in-cyberspace.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'help.md': helpMd,
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button');
}
if (!files['app.js'].includes('Invite')) throw new Error('tell the player to press Invite');
if (/aframe/i.test(files['app.js'] + files['maze.js'] + html)) {
  throw new Error('A-Frame stays behind');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n !== 'vendor/network.js' && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM');
  }
  if (n === 'vendor/network.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-lost-in-cyberspace.txt'].includes('Bartek Szopka')) {
  throw new Error('COPYING is not the upstream MIT notice');
}

{
  const ctx = { console, result: null, window: null };
  ctx.window = ctx;
  vm.runInNewContext(
    files['vendor/network.js'] + '\n' + files['maze.js'] + '\n' +
    'result = (function () {\n' +
    '  var w = computeWalls(3, 0);\n' +
    '  if (w.join() !== [0,3,6,1,4,7,2,5].join()) throw new Error("computeWalls " + w);\n' +
    '  var net = randomNetwork();\n' +
    '  if (!net.walls || !net.target || !net.traps || !net.colors) throw new Error("network shape");\n' +
    '  var codes = getNetworkCodes(net);\n' +
    '  if (codes.length !== 4) throw new Error("codes " + codes.length);\n' +
    '  var back = networkFromCodes(codes);\n' +
    '  if (!back.walls || !back.target) throw new Error("roundtrip");\n' +
    '  if (back.target.join() !== net.target.join()) throw new Error("target roundtrip");\n' +
    '  var st = LIC.fresh();\n' +
    '  if (st.time !== 256) throw new Error("time");\n' +
    '  if (LIC.sectorOf(0,0) !== 0 || LIC.sectorOf(7,0) !== 1 || LIC.sectorOf(0,7) !== 2 || LIC.sectorOf(7,7) !== 3) throw new Error("sectors");\n' +
    '  var sc = scoreToCode(90, 12);\n' +
    '  var dec = codeToScore(sc);\n' +
    '  if (dec.time !== 90 || dec.moves !== 12) throw new Error("score " + sc);\n' +
    '  return codes[0];\n' +
    '})();',
    ctx
  );
  console.log('maze generator + score codes ok — sample', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: cyberspaceIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'lost-in-cyberspace', 'lost-in-cyberspace.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/lost-in-cyberspace/lost-in-cyberspace.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (no A-Frame, no jam server)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
