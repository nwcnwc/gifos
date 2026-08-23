/*
 * vendor.mjs — fetch Squoosh's WASM codecs from the pinned upstream commit.
 *
 * Offline builds read what is already in vendor/. This is the ONLY step that
 * needs the network, and it is deliberately NOT part of build.mjs (same split
 * as fps-simple/vendor.mjs). Run it only to move the pin.
 *
 *   node apps/squoosh/vendor.mjs
 *
 * WHAT IT FETCHES. The compiled encoder glue + wasm that Squoosh ships in
 * codecs/<name>/enc (and oxipng's wasm-pack pkg). Single-threaded builds
 * only — the MT variants spawn pthreads the sandbox would have to host, and
 * the ST AVIF encoder is the one Squoosh itself falls back to.
 *
 * Google Analytics is NOT in this tree. Squoosh's app shell (Preact, the
 * service worker, gtag) is not vendored; we take the codecs and write our
 * own UI.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

// Moving the pin is a deliberate act: bump both, rerun this, rebuild the GIF.
const UPSTREAM = 'https://github.com/GoogleChromeLabs/squoosh';
const PIN = 'e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3'; // 2024-08-19 "Replace deprecated terser plugin"

const FILES = [
  ['mozjpeg_enc.js',   'codecs/mozjpeg/enc/mozjpeg_enc.js'],
  ['mozjpeg_enc.wasm', 'codecs/mozjpeg/enc/mozjpeg_enc.wasm'],
  ['webp_enc.js',      'codecs/webp/enc/webp_enc.js'],
  ['webp_enc.wasm',    'codecs/webp/enc/webp_enc.wasm'],
  ['avif_enc.js',      'codecs/avif/enc/avif_enc.js'],
  ['avif_enc.wasm',    'codecs/avif/enc/avif_enc.wasm'],
  ['jxl_enc.js',       'codecs/jxl/enc/jxl_enc.js'],
  ['jxl_enc.wasm',     'codecs/jxl/enc/jxl_enc.wasm'],
  ['qoi_enc.js',       'codecs/qoi/enc/qoi_enc.js'],
  ['qoi_enc.wasm',     'codecs/qoi/enc/qoi_enc.wasm'],
  ['oxipng.js',        'codecs/oxipng/pkg/squoosh_oxipng.js'],
  ['oxipng.wasm',      'codecs/oxipng/pkg/squoosh_oxipng_bg.wasm'],
  ['LICENSE-squoosh.txt', 'LICENSE'],
  ['LICENSE-mozjpeg.md',  'codecs/mozjpeg/LICENSE.codec.md'],
  ['LICENSE-oxipng.md',   'codecs/oxipng/LICENSE.codec.md'],
];

const raw = (path) =>
  'https://raw.githubusercontent.com/GoogleChromeLabs/squoosh/' + PIN + '/' + path;

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

const hashes = [];
for (const [out, src] of FILES) {
  process.stdout.write('fetch ' + src + ' … ');
  const buf = await get(raw(src));
  writeFileSync(join(vendor, out), buf);
  const sha = createHash('sha256').update(buf).digest('hex');
  hashes.push({ file: out, bytes: buf.length, sha256: sha });
  console.log((buf.length / 1024).toFixed(0) + ' KB  ' + sha.slice(0, 12));
}

const notice = [
  'Vendored from ' + UPSTREAM,
  'Pin: ' + PIN,
  'Fetched: ' + new Date().toISOString().slice(0, 10),
  '',
  'These are Squoosh\'s compiled WASM codecs (Apache-2.0). The GifOS app',
  'shell is original; Google Analytics and Squoosh\'s Preact UI are NOT here.',
  '',
  'file                        bytes  sha256',
  ...hashes.map((h) =>
    (h.file.padEnd(24) + String(h.bytes).padStart(10) + '  ' + h.sha256)),
  '',
].join('\n');
writeFileSync(join(vendor, 'UPSTREAM.txt'), notice);
console.log('wrote vendor/UPSTREAM.txt — ' + hashes.length + ' files, pin ' + PIN.slice(0, 10));
