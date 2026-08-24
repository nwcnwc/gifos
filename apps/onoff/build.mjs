import { onoffIcon, screenshotPng } from './icon.mjs';
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
        flush(controller) { controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks)))); }
      });
      this.readable = ts.readable; this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js');
const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
for (const need of ['vendor/onoff.js', 'vendor/styles.css', 'vendor/COPYING.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' missing — run vendor.mjs');
}
const SCRIPTS = ['vendor/onoff.js', 'boot.js', 'touch.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/styles.css': read('vendor/styles.css'),
  'COPYING.txt': read('vendor/COPYING.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);
{ const help = read('help.md').trim(); if (help.length < 400) throw new Error('help.md too short'); files['help.md'] = help; }
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/^\s*import\s/m.test(files['vendor/onoff.js']) || /export\s+\{/.test(files['vendor/onoff.js'])) {
  throw new Error('onoff.js still has ESM');
}
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('need db');
if (manifest.capabilities.multiplayer) throw new Error('onoff does not sync a room');
if (manifest.minBuild !== 947) throw new Error('minBuild 947');
if ((listing.author && listing.author.name) === 'GifOS') throw new Error('author is THEM');
if (!read('vendor/onoff.js').includes('FakeAudioContext')) throw new Error('need FakeAudioContext');
if (!read('vendor/onoff.js').includes('ONOFF_LEVELS')) throw new Error('need ONOFF_LEVELS');
if (!html.includes('id="from-start"')) throw new Error('from-start missing');
if (!read('boot.js').includes('resumeIndex')) throw new Error('continue missing');
for (const [n, s] of Object.entries(files)) {
  if (n.endsWith('.js') && /<\/script/i.test(s)) throw new Error(n + ' </script');
}
const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: onoffIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'onoff', 'onoff.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/onoff/onoff.gif —', bytes.length, 'bytes,', (bytes.length/1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
