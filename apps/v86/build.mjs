// Pack apps/v86/ into site/apps/v86/v86.gif.
// Offline and deterministic: vendor pins are sha256-checked, never fetched.
import { v86Icon, screenshotPng } from './icon.mjs';
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
const readBin = (p) => readFileSync(join(dir, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const PINS = {
  'vendor/libv86.js': { sha: '48b655b70879db182dfced7c561dcc2afb7e84f7603da88169a36036467d9c71', bytes: 357289 },
  'vendor/v86.wasm': { sha: '6121632f6d657d03f2286341ed87edcafd4945fa65ae765b4c7fd0bf2554a9c7', bytes: 2101621 },
  'vendor/seabios.bin': { sha: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98', bytes: 131072 },
  'vendor/vgabios.bin': { sha: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880', bytes: 36352 },
  'vendor/freedos722.img': { sha: '8ecc7604d4c17c16e136d219a92e64747196d9ae044690e90be9ca0468b1ff12', bytes: 737280 },
};

for (const [p, pin] of Object.entries(PINS)) {
  if (!existsSync(join(dir, p))) throw new Error('missing ' + p);
  const buf = readBin(p);
  if (buf.length !== pin.bytes) throw new Error(p + ' size ' + buf.length + ' != ' + pin.bytes);
  const h = sha256(buf);
  if (h !== pin.sha) throw new Error(p + ' sha256 mismatch: ' + h);
}

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const helpMd = read('help.md').replace(/^\uFEFF/, '');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');
if (listing.license !== 'BSD-2-Clause') throw new Error('listing.license must be BSD-2-Clause');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (manifest.minBuild !== 1314) throw new Error('minBuild must be 1314 — capabilities.fullscreen');
if (!manifest.capabilities || manifest.capabilities.wasm !== true) throw new Error('capabilities.wasm');
if (manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (manifest.capabilities.network) throw new Error('no network — BIOS and disk are in the GIF');
if (manifest.assets) throw new Error('no assets pin — keep the floppy inside the GIF');

const lib = read('vendor/libv86.js');
if (/<\/script/i.test(lib)) throw new Error('libv86.js contains </script');

const strMod = (name, buf) =>
  ('window.' + name + '=' + JSON.stringify(buf.toString('base64')) + ';').split('</').join('<\\/');

const dataJs = [
  strMod('V86_WASM_B64', readBin('vendor/v86.wasm')),
  strMod('V86_BIOS_B64', readBin('vendor/seabios.bin')),
  strMod('V86_VGABIOS_B64', readBin('vendor/vgabios.bin')),
  strMod('V86_FDA_B64', readBin('vendor/freedos722.img')),
].join('\n');

const SCRIPTS = ['vendor/libv86.js', 'v86-data.js', 'touch.js', 'boot.js'];
const html = read('index.html');
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="screen_container"')) throw new Error('v86 needs #screen_container');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': html,
  'style.css': read('style.css'),
  'vendor/libv86.js': lib,
  'v86-data.js': dataJs,
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'help.md': helpMd,
  'COPYING-v86.txt': read('COPYING-v86.txt'),
  'COPYING-v86-qemu-floppy.txt': read('COPYING-v86-qemu-floppy.txt'),
  'COPYING-seabios.txt': read('COPYING-seabios.txt'),
  'COPYING-gpl-3.0.txt': read('COPYING-gpl-3.0.txt'),
  'COPYING-freedos.txt': read('COPYING-freedos.txt'),
};

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: v86Icon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'v86', 'v86.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/v86/v86.gif —', (bytes.length / 1024 / 1024).toFixed(2), 'MB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
