import { coilIcon, screenshotPng } from './icon.mjs';
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
for (const need of ['vendor/coil.js', 'vendor/jquery.min.js', 'vendor/util.js', 'vendor/assets.js', 'vendor/COPYING.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' missing');
}
const SCRIPTS = ['vendor/jquery.min.js', 'vendor/assets.js', 'vendor/util.js', 'core.js', 'vendor/coil.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/reset.css': read('vendor/reset.css'),
  'vendor/main.css': read('vendor/main.css'),
  'COPYING.txt': read('vendor/COPYING.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);
{ const help = read('help.md').trim(); if (help.length < 400) throw new Error('help.md too short'); files['help.md'] = help; }
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no modules');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script id="(?:vertex|fragment)Shader"[\s\S]*?<\/script>/g, ''))) {
  throw new Error('index.html has an external URL');
}
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('need db');
if (manifest.capabilities.multiplayer) throw new Error('coil does not sync a room');
if (manifest.minBuild !== 947) throw new Error('minBuild 947');
if ((listing.author && listing.author.name) === 'GifOS') throw new Error('author is THEM');
if (html.includes('facebook') || html.includes('twitter-share')) throw new Error('no share widgets');
if (!html.includes('src="core.js"')) throw new Error('core.js not loaded');
if (!read('vendor/coil.js').includes('CoilCore.pointInPoly')) throw new Error('vendor must enclose via CoilCore');
for (const [n, s] of Object.entries(files)) {
  if (n.endsWith('.js') && /<\/script/i.test(s)) throw new Error(n + ' </script');
}
const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: coilIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'coil', 'coil.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/coil/coil.gif —', bytes.length, 'bytes,', (bytes.length/1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
