// Pack apps/keeweb/ into the finished, downloadable
// site/apps/keeweb/keeweb.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/kdbxweb.js and
// vendor/argon2.js from the pins and is run only when a pin moves.
//
// Run:  node apps/keeweb/build.mjs
import { deflateRawSync } from 'node:zlib';
import { keewebIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Same polyfill as hat-sh/build.mjs.
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
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const f of ['vendor/kdbxweb.js', 'vendor/argon2.js']) {
  if (!existsSync(join(dir, f))) {
    throw new Error(f + ' is missing — run node apps/keeweb/vendor.mjs first (it needs the network).');
  }
}

const kdbx = read('vendor/kdbxweb.js');
const argon = read('vendor/argon2.js');
const appJs = read('app.js');
const html = read('index.html');
const css = read('style.css');

for (const [n, s] of [['kdbxweb.js', kdbx], ['argon2.js', argon], ['app.js', appJs]]) {
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely.');
}
if (/^\s*export\s|export\{|import\.meta/m.test(kdbx) || /^\s*export\s|export\{|import\.meta/m.test(argon)) {
  throw new Error('vendor scripts use ESM syntax — the classic-script inline path cannot carry it.');
}

const codeLines = (s) => s.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}).join('\n');
const src = codeLines(appJs) + '\n' + codeLines(html);
for (const bad of ['XMLHttpRequest', 'WebSocket(', 'fetch(', 'new Function(', 'eval(']) {
  if (src.includes(bad)) throw new Error('app source uses ' + bad + ' — this vault has no network path.');
}
for (const plug of ['dropbox', 'webdav', 'gdrive', 'onedrive', 'googleapis', 'dropboxapi']) {
  if (new RegExp('\\b' + plug + '\\b', 'i').test(codeLines(appJs))) {
    throw new Error('app.js still mentions ' + plug + ' — those KeeWeb plugins stay stripped.');
  }
}
if (manifest.capabilities && manifest.capabilities.network) {
  throw new Error('manifest declares network — this vault is local-only.');
}
if (manifest.capabilities && manifest.capabilities.wasm) {
  throw new Error('manifest declares wasm — Argon2 is pure JS on purpose.');
}

const SCRIPTS = ['vendor/kdbxweb.js', 'vendor/argon2.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': html,
  'style.css': css,
  'app.js': appJs,
  'vendor/kdbxweb.js': kdbx,
  'vendor/argon2.js': argon,
  'COPYING-keeweb.txt': read('vendor/COPYING-keeweb.txt'),
  'COPYING-kdbxweb.txt': read('vendor/COPYING-kdbxweb.txt'),
  'COPYING-noble-hashes.txt': read('vendor/COPYING-noble-hashes.txt'),
};

for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

const bytes = await gif.encode(files, { preview: keewebIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'keeweb');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'keeweb.gif'), bytes);

const rec = {
  catalog: '1.0',
  slug: 'keeweb',
  appId: manifest.appId,
  name: manifest.name,
  shortName: manifest.shortName,
  version: manifest.version,
  minBuild: manifest.minBuild,
  tagline: listing.tagline,
  description: listing.description,
  author: listing.author,
  releaseDate: listing.releaseDate,
  updated: listing.updated || listing.releaseDate,
  categories: listing.categories,
  tags: listing.tags || [],
  license: listing.license,
  homepage: listing.homepage || '',
  accent: manifest.accent || null,
  capabilities: manifest.capabilities || {},
  cover: '/apps/keeweb/cover.jpg',
  screenshots: [],
  gif: '/apps/keeweb/keeweb.gif',
  bytes: bytes.length,
  download: 0,
  provides: null,
  sha256: sha256(bytes),
  signature: null,
  porter: listing.porter,
  basedOn: listing.basedOn,
};
writeFileSync(join(outDir, 'app.json'), JSON.stringify(rec, null, 2) + '\n');

if (existsSync(join(dir, 'screenshot.png'))) {
  const sharp = (await import('sharp')).default;
  const cover = await sharp(join(dir, 'screenshot.png'))
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  writeFileSync(join(outDir, 'cover.jpg'), cover);
}

console.log('wrote site/apps/keeweb/keeweb.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (kdbxweb + Argon2 in-GIF, no network)');
if (!existsSync(join(outDir, 'cover.jpg'))) {
  console.log('note: site/apps/keeweb/cover.jpg is missing — generate screenshot.png first');
}
