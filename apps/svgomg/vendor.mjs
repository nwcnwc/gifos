/*
 * vendor.mjs — rebuild vendor/ from the pinned SVGOMG + SVGO sources.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move a pin.
 *
 *   node apps/svgomg/vendor.mjs
 *
 * WHAT IT FETCHES
 *   SVGO 4.0.0's already-bundled browser ESM (the engine SVGOMG 1.17.0
 *   rollups into its worker). Wrapped here as a classic IIFE on
 *   window.SVGO so the GifOS runtime can inline it as a <script>.
 *   SVGOMG's MIT licence, plugin list, and the car-lite demo picture.
 *
 * Google Analytics, the service worker, and SVGOMG's Preact UI are NOT
 * here. We take the engine + the plugin names and write our own shell.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

const SVGOMG = 'https://github.com/jakearchibald/svgomg';
const SVGOMG_PIN = 'f925656d40a507c512bf95ee14ad16445a4ad3ed'; // 1.17.0, SVGO 4.0.0
const SVGO_VER = '4.0.0';

// Moving a pin is a deliberate act: bump URL + SHA256 together.
const FILES = [
  {
    out: 'svgo.browser.js',
    url: 'https://unpkg.com/svgo@' + SVGO_VER + '/dist/svgo.browser.js',
    sha256: 'dc4790ecbd3d36f3f0f23f00d0759e1a287dae8f08723976cc347efe8cf9240b',
    bytes: 780200,
  },
  {
    out: 'COPYING-svgo.txt',
    url: 'https://unpkg.com/svgo@' + SVGO_VER + '/LICENSE',
    sha256: 'd2b5640808aeec9c243152ae733cf9cca3a86189ad7817bf50335290dbb31012',
    bytes: 1064,
  },
  {
    out: 'COPYING-svgomg.txt',
    url: 'https://raw.githubusercontent.com/jakearchibald/svgomg/' + SVGOMG_PIN + '/LICENSE.md',
    sha256: 'fc238e99233704853d397eb25d538edfd5f2ddb2ad86d903bb33af99753897bb',
    bytes: 1080,
  },
  {
    out: 'config.json',
    url: 'https://raw.githubusercontent.com/jakearchibald/svgomg/' + SVGOMG_PIN + '/src/config.json',
    sha256: '54cf1c98fc23df61aacd5365e78712accfac27d551e2f15f860468483bb2c7c3',
    bytes: 5478,
  },
  {
    out: 'car-lite.svg',
    url: 'https://raw.githubusercontent.com/jakearchibald/svgomg/' + SVGOMG_PIN + '/src/test-svgs/car-lite.svg',
    sha256: '9b940dfea98e7b6e19fa692848591e01152f4802f0e9f434b09d098e41e7ebfe',
    bytes: 26539,
  },
];

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const hashes = [];
const fetched = {};
for (const f of FILES) {
  process.stdout.write('fetch ' + f.out + ' … ');
  const buf = await get(f.url);
  const hex = sha256(buf);
  if (buf.length !== f.bytes || hex !== f.sha256) {
    throw new Error(f.out + ' sha256 ' + hex + ' / ' + buf.length +
      ' bytes ≠ pin ' + f.sha256 + ' / ' + f.bytes + ' — move the pin deliberately.');
  }
  fetched[f.out] = buf;
  hashes.push({ file: f.out, bytes: buf.length, sha256: hex });
  console.log((buf.length / 1024).toFixed(0) + ' KB  ' + hex.slice(0, 12));
}

const EXPORT = 'export{VERSION,_collections,builtinPlugins,mapNodesToParents,optimize,querySelector,querySelectorAll}';
let src = fetched['svgo.browser.js'].toString('utf8');
if (!src.trimEnd().endsWith(EXPORT)) {
  throw new Error('svgo.browser.js export shape changed — re-check the IIFE wrap');
}
src = src.replace(new RegExp(EXPORT.replace(/[{}]/g, '\\$&') + '\\s*$'), '');
if (/\bimport\s|export\s|import\.meta|new Function\(|\beval\(/.test(src)) {
  throw new Error('svgo.browser.js still contains ESM/eval after stripping the export');
}
if (/<\/script/i.test(src)) throw new Error('svgo.browser.js contains </script — cannot inline');

const wrapped =
  '// SVGO v' + SVGO_VER + ' browser bundle, wrapped as a classic IIFE for GifOS.\n' +
  '// Source: unpkg.com/svgo@' + SVGO_VER + '/dist/svgo.browser.js\n' +
  '(function(){\n"use strict";\n' +
  src +
  '\nwindow.SVGO={optimize:optimize,VERSION:VERSION};\n})();\n';

{
  const ctx = { console };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(wrapped, ctx);
  if (!ctx.SVGO || typeof ctx.SVGO.optimize !== 'function') {
    throw new Error('wrapped SVGO did not expose window.SVGO.optimize');
  }
  if (ctx.SVGO.VERSION !== SVGO_VER) {
    throw new Error('SVGO.VERSION is ' + ctx.SVGO.VERSION + ', expected ' + SVGO_VER);
  }
  const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!-- x --><rect x="0" y="0" width="10" height="10" fill="#ff0000"/></svg>';
  const out = ctx.SVGO.optimize(svg, { plugins: ['preset-default'] });
  if (!out || !out.data || !out.data.includes('<svg') || out.data.length >= svg.length) {
    throw new Error('SVGO smoke optimize did not shrink a tiny SVG');
  }
  console.log('SVGO smoke:', svg.length, '→', out.data.length, 'bytes, v' + ctx.SVGO.VERSION);
}

writeFileSync(join(vendor, 'svgo.js'), wrapped);
writeFileSync(join(vendor, 'COPYING-svgo.txt'), fetched['COPYING-svgo.txt']);
writeFileSync(join(vendor, 'COPYING-svgomg.txt'), fetched['COPYING-svgomg.txt']);
writeFileSync(join(vendor, 'config.json'), fetched['config.json']);
writeFileSync(join(vendor, 'car-lite.svg'), fetched['car-lite.svg']);

const notice = [
  'Vendored from ' + SVGOMG + ' @ ' + SVGOMG_PIN + ' (SVGOMG 1.17.0)',
  'Engine: svgo@' + SVGO_VER + ' dist/svgo.browser.js (MIT, Kir Belevich)',
  'Fetched: ' + new Date().toISOString().slice(0, 10),
  '',
  'The GifOS app shell is original. Google Analytics, the service worker,',
  'and SVGOMG\'s Preact UI are NOT here.',
  '',
  'file                        bytes  sha256',
  ...hashes.map((h) =>
    (h.file.padEnd(24) + String(h.bytes).padStart(10) + '  ' + h.sha256)),
  '',
].join('\n');
writeFileSync(join(vendor, 'UPSTREAM.txt'), notice + '\n');
console.log('wrote vendor/{svgo.js, config.json, car-lite.svg, COPYING-*, UPSTREAM.txt}');
