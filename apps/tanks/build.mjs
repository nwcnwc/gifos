// Pack apps/tanks/ into site/apps/tanks/tanks.gif
import { tanksIcon, screenshotPng } from './icon.mjs';
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
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of ['vendor/COPYING-tanks.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'tanks') throw new Error('appId');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('db + multiplayer');
}
if (manifest.capabilities.network) throw new Error('no network — Node+socket.io stays behind');
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') throw new Error('players read-write');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('unofficial');
if (/gifos/i.test(listing.author.name)) throw new Error('author is them');
if (listing.license !== 'MIT') throw new Error('MIT');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/tanks') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['sim.js', 'net.js', 'app.js'];
const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'sim.js': read('sim.js'),
  'net.js': read('net.js'),
  'app.js': read('app.js'),
  'COPYING-tanks.txt': read('vendor/COPYING-tanks.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'help.md': helpMd,
};
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button');
}
if (!files['app.js'].includes('Invite') && !html.includes('Invite')) throw new Error('tell the player to press Invite');
if (/socket\.io|express|firebase/i.test(files['app.js'] + files['net.js'])) throw new Error('their server stays behind');
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' uses ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-tanks.txt'].includes('Bergström') && !files['COPYING-tanks.txt'].includes('Bergstrom') && !files['COPYING-tanks.txt'].includes('underscorediscovery')) {
  throw new Error('COPYING is not the upstream MIT notice');
}

const shotPath = join(dir, 'screenshot.png');
if (existsSync(shotPath) && readFileSync(shotPath)[0] === 0x89) {
  const keep = readFileSync(shotPath);
  if (keep.length < 1000) throw new Error('screenshot.png looks empty');
} else {
  const shot = screenshotPng();
  if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
  writeFileSync(shotPath, shot);
}
const bytes = await gif.encode(files, { preview: tanksIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tanks', 'tanks.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tanks/tanks.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (no Node, no socket.io)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
