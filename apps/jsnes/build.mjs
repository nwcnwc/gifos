// Pack apps/jsnes/ into site/apps/jsnes/jsnes.gif.
// Offline and deterministic: vendor pins are sha256-checked, never fetched.
import { jsnesIcon, screenshotPng } from './icon.mjs';
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
        throw new Error('unsupported format ' + format);
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
const readBin = (p) => readFileSync(join(dir, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const PINS = {
  'vendor/jsnes.min.js': { sha: '84946f0dae4bcf3b2dfebe84ad3bfeb1dbcb413bd9b1a69e1f45910a95fd7b41', bytes: 135545 },
  'vendor/roms/croom.nes': { sha: '33905b739d4886b59f5e56973af036c37fff86d0509d8ccabb8df18b6153758f', bytes: 24592 },
  'vendor/roms/lawn_mower.nes': { sha: '181ef3ff1769a85ae98736e02809e65e5d758b453ebb43ec4b9fe60c93ad224c', bytes: 24592 },
};

for (const [p, pin] of Object.entries(PINS)) {
  if (!existsSync(join(dir, p))) throw new Error('missing ' + p);
  const buf = readBin(p);
  if (buf.length !== pin.bytes) throw new Error(p + ' size ' + buf.length + ' != ' + pin.bytes);
  const h = sha256(buf);
  if (h !== pin.sha) throw new Error(p + ' sha256 mismatch: ' + h);
}

function assertNes(p) {
  const b = readBin(p);
  if (b[0] !== 0x4e || b[1] !== 0x45 || b[2] !== 0x53 || b[3] !== 0x1a) {
    throw new Error(p + ' is not an iNES dump');
  }
}
assertNes('vendor/roms/croom.nes');
assertNes('vendor/roms/lawn_mower.nes');

const engine = read('vendor/jsnes.min.js');
if (/<\/script/i.test(engine)) throw new Error('jsnes.min.js contains </script');

const SAMPLES = [
  {
    id: 'croom', file: 'croom.nes', name: 'Concentration Room',
    by: 'Damian Yerrick', year: '2010', players: 2,
    blurb: 'Match the cards. Two of you can sit at the table.'
  },
  {
    id: 'lawn', file: 'lawn_mower.nes', name: 'Lawn Mower',
    by: 'Shiru', year: '2011', players: 1,
    blurb: 'Cut every blade before the tank runs out.'
  },
];

function romsJs() {
  const parts = ['(function(root){',
    'function dec(s){var b=atob(s),u=new Uint8Array(b.length),i=0;for(;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}',
    'root.SAMPLE_ROMS=['];
  for (const s of SAMPLES) {
    const b64 = readBin(join('vendor', 'roms', s.file)).toString('base64');
    parts.push('{id:' + JSON.stringify(s.id) +
      ',name:' + JSON.stringify(s.name) +
      ',by:' + JSON.stringify(s.by) +
      ',year:' + JSON.stringify(s.year) +
      ',players:' + s.players +
      ',blurb:' + JSON.stringify(s.blurb) +
      ',bytes:dec("' + b64 + '")},');
  }
  parts.push('];})(window);');
  return parts.join('\n');
}

const roms = romsJs();
writeFileSync(join(dir, 'roms.js'), roms);

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const helpMd = read('help.md').replace(/^\uFEFF/, '');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');
if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.author && /gifos/i.test(listing.author.name)) throw new Error('author is them, not GifOS');
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (!manifest.capabilities.multiplayer) throw new Error('capabilities.multiplayer');
if (manifest.capabilities.network) throw new Error('no network — carts are in the GIF');

const SCRIPTS = ['vendor/jsnes.min.js', 'roms.js', 'emu.js', 'touch.js', 'net.js', 'boot.js'];
const html = read('index.html');
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="dpad"')) throw new Error('touch d-pad missing');
if (!html.includes('id="file"')) throw new Error('dump input missing');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': html,
  'style.css': read('style.css'),
  'vendor/jsnes.min.js': engine,
  'roms.js': roms,
  'emu.js': read('emu.js'),
  'touch.js': read('touch.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'help.md': helpMd,
  'COPYING-jsnes.txt': read('vendor/COPYING-jsnes.txt'),
  'COPYING-croom.txt': read('vendor/COPYING-croom.txt'),
  'COPYING-lawn-mower.txt': read('vendor/COPYING-lawn-mower.txt'),
  'COPYING-gpl-3.0.txt': read('vendor/COPYING-gpl-3.0.txt'),
  'COPYING-cc0.txt': read('vendor/COPYING-cc0.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: jsnesIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'jsnes', 'jsnes.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/jsnes/jsnes.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
