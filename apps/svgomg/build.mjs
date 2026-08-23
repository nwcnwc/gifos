// Pack apps/svgomg/ into site/apps/svgomg/svgomg.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the
// pinned SVGOMG / SVGO sources and is run only when a pin moves.
//
// Run:  node apps/svgomg/build.mjs
// Do not run scripts/build-app-catalog.mjs from this work — the catalog index
// is shared. This file writes site/apps/svgomg/{svgomg.gif,app.json,cover.jpg}.
import { deflateRawSync } from 'node:zlib';
import { svgomgIcon, screenshotPng } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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

if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (!listing.author || listing.author.name !== 'jakearchibald') {
  throw new Error('listing.author must be jakearchibald');
}
if (!listing.porter) throw new Error('listing.porter is required on a port');
if (listing.basedOn.name !== 'SVGOMG') throw new Error('listing.basedOn.name must be SVGOMG');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must start with Utilities');
}
if (manifest.capabilities && manifest.capabilities.network) {
  throw new Error('SVGOMG has no network path. Do not declare capabilities.network.');
}
if (manifest.capabilities && manifest.capabilities.wasm) {
  throw new Error('SVGO is JavaScript. Do not declare capabilities.wasm.');
}

for (const need of ['vendor/svgo.js', 'vendor/config.json', 'vendor/car-lite.svg',
                    'vendor/COPYING-svgomg.txt', 'vendor/COPYING-svgo.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/svgomg/vendor.mjs first (it needs the network).');
  }
}

const SVGO_SHA = '68ca37ab272e4c4abc5f4fcd828e5ca704ca9ceb482676324155e563e2c5490d';
const svgoBuf = readFileSync(join(dir, 'vendor', 'svgo.js'));
const svgoJs = svgoBuf.toString('utf8');
if (sha256(svgoBuf) !== SVGO_SHA) {
  throw new Error('vendor/svgo.js sha256 drifted from pin — rerun vendor.mjs or move the pin');
}
if (!svgoJs.includes('window.SVGO={optimize:optimize,VERSION:VERSION}')) {
  throw new Error('vendor/svgo.js is not the IIFE wrap build.mjs expects');
}
if (/<\/script/i.test(svgoJs)) throw new Error('svgo.js contains </script — cannot inline');
if (/\bimport\s|export\s|import\.meta|new Function\(|\beval\(/.test(svgoJs.replace(/^\/\/.*$/mg, ''))) {
  throw new Error('svgo.js contains ESM/eval — classic-script path cannot carry it');
}

const config = JSON.parse(read('vendor/config.json'));
if (!Array.isArray(config.plugins) || config.plugins.length < 40) {
  throw new Error('vendor/config.json is not SVGOMG\'s plugin list');
}
const pluginsJs = 'window.SVGOMG_PLUGINS=' + JSON.stringify(config.plugins) + ';\n';
const demoText = read('vendor/car-lite.svg');
if (!demoText.includes('<svg')) throw new Error('vendor/car-lite.svg is not an SVG');
const demoJs = 'window.SVGOMG_DEMO=' + JSON.stringify({ name: 'car-lite.svg', text: demoText }) + ';\n';

const appJs = read('app.js');
const indexHtml = read('index.html');
const styleCss = read('style.css');

{
  const code = [appJs, indexHtml].map((s) => s.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n')).join('\n');
  for (const bad of ['new Function(', 'eval(', 'XMLHttpRequest', 'WebSocket',
                     'navigator.sendBeacon', 'fetch(', 'gtag(', 'google-analytics', 'analytics.js']) {
    if (code.includes(bad)) throw new Error('app uses ' + bad + ', which this port must not.');
  }
}
if (/google-analytics|gtag\(|www\.google-analytics/i.test(indexHtml + appJs)) {
  throw new Error('Google Analytics leaked into the port — strip it.');
}

// Smoke: the wrapped engine shrinks the demo picture with SVGOMG's defaults.
{
  const ctx = { console };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(svgoJs, ctx);
  vm.runInNewContext(pluginsJs, ctx);
  if (!ctx.SVGO || ctx.SVGO.VERSION !== '4.0.0') {
    throw new Error('packed SVGO is not v4.0.0 (got ' + (ctx.SVGO && ctx.SVGO.VERSION) + ')');
  }
  const plugins = [];
  for (const p of ctx.SVGOMG_PLUGINS) {
    if (!p.enabledByDefault) continue;
    plugins.push({ name: p.id, params: { floatPrecision: 3, transformPrecision: 5 } });
  }
  const out = ctx.SVGO.optimize(demoText, { plugins, js2svg: { pretty: false } });
  if (!out || !out.data || !out.data.includes('<svg')) {
    throw new Error('SVGO failed to optimize the demo SVG');
  }
  if (out.data.length >= demoText.length) {
    throw new Error('demo SVG did not shrink (' + demoText.length + ' → ' + out.data.length + ')');
  }
  console.log('demo smoke:', demoText.length, '→', out.data.length, 'bytes');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': indexHtml,
  'style.css': styleCss,
  'svgo.js': svgoJs,
  'plugins.js': pluginsJs,
  'demo.js': demoJs,
  'app.js': appJs,
  'COPYING-svgomg.txt': read('vendor/COPYING-svgomg.txt'),
  'COPYING-svgo.txt': read('vendor/COPYING-svgo.txt'),
};

const html = files['index.html'];
for (const s of ['svgo.js', 'plugins.js', 'demo.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
for (const [n, s] of Object.entries(files)) {
  if (n.endsWith('.js') && /<\/script/i.test(s)) {
    throw new Error(n + ' contains </script — cannot inline safely');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: svgomgIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'svgomg');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'svgomg.gif'), bytes);

const sharp = (await import('sharp')).default;
const cover = await sharp(shot)
  .resize({ width: 1200, withoutEnlargement: true })
  .jpeg({ quality: 82, progressive: true, mozjpeg: true })
  .toBuffer();
writeFileSync(join(outDir, 'cover.jpg'), cover);

const rec = {
  catalog: '1.0',
  slug: 'svgomg',
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
  cover: '/apps/svgomg/cover.jpg',
  screenshots: [],
  gif: '/apps/svgomg/svgomg.gif',
  bytes: bytes.length,
  download: 0,
  provides: null,
  sha256: sha256(bytes),
  signature: null,
  porter: listing.porter,
  basedOn: listing.basedOn,
};
writeFileSync(join(outDir, 'app.json'), JSON.stringify(rec, null, 2) + '\n');

console.log('wrote site/apps/svgomg/svgomg.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote site/apps/svgomg/app.json + cover.jpg');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
