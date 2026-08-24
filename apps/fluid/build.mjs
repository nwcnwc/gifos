// Pack apps/fluid/ into site/apps/fluid/fluid.gif.
import { fluidIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const pin = (rel, hex) => {
  const buf = readFileSync(join(dir, rel));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== hex) throw new Error(rel + ' sha256 ' + got + ' ≠ pin ' + hex);
  return buf;
};

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
pin('vendor/script.js', '20a14f1537ec11d891cb1ef9f3ac7d17dbb255c1325623e4760c27a566cb1783');
pin('vendor/dat.gui.min.js', '27976ca8ac2e125de97163455131890e8686ed2afc2007cd5524080b7d53ef7b');

for (const need of ['vendor/COPYING-fluid.txt', 'vendor/COPYING-dat-gui.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'fluid') throw new Error('appId must be fluid');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('must declare capabilities.db');
if (manifest.capabilities.network) throw new Error('fluid has no network path');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/PavelDoGreat/WebGL-Fluid-Simulation') {
  throw new Error('basedOn.url must be PavelDoGreat/WebGL-Fluid-Simulation');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/dat.gui.min.js': read('vendor/dat.gui.min.js'),
  'vendor/script.js': read('vendor/script.js'),
  'app.js': read('app.js'),
  'COPYING-fluid.txt': read('vendor/COPYING-fluid.txt'),
  'COPYING-dat-gui.txt': read('vendor/COPYING-dat-gui.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of ['vendor/dat.gui.min.js', 'vendor/script.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (/gtag\(|google-analytics|analytics\.js/i.test(html + files['app.js'])) throw new Error('tracking leaked');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save settings privately');
}
if (!files['vendor/script.js'].includes('window.FluidConfig') || !files['vendor/script.js'].includes('function ga(){}')) {
  throw new Error('script.js must expose FluidConfig and stub ga');
}
if (!files['vendor/script.js'].includes('window.FluidNoGL') || !files['app.js'].includes('FluidNoGL')) {
  throw new Error('must degrade honestly when WebGL is missing');
}
if (!files['app.js'].includes('snap') || !files['app.js'].includes('onBack')) {
  throw new Error('app.js must snapshot the swirl and handle Back');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' uses ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: fluidIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'fluid', 'fluid.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/fluid/fluid.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
