/*
 * vendor.mjs — pull the pinned CyberChef production build into vendor/.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline and byte-reproducible from
 * what is committed here. Run this only to move the pin.
 *
 *   node apps/cyberchef/vendor.mjs
 *
 * WHAT IT PRODUCES. The official production assets from the CyberChef gh-pages
 * branch (the same files https://gchq.github.io/CyberChef/ serves), minus the
 * gzip/brotli duplicates, the 76 MB standalone zip, Google Analytics, and
 * Tesseract (OCR needs those assets plus a language model fetch, which the
 * sandbox cannot do). JS/CSS are stored gzipped to keep the clone lean;
 * build.mjs inflates them.
 */
import { createWriteStream, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');

// The pin. Moving it is a deliberate act: bump both, rerun this, rebuild the GIF.
const UPSTREAM = 'https://github.com/gchq/CyberChef';
const PIN = '2e048b0290854781db61e20638dca62978379032'; // 2026-08-20 gh-pages deploy of this source
const RAW = 'https://raw.githubusercontent.com/gchq/CyberChef/gh-pages/';
const LICENSE_RAW = 'https://raw.githubusercontent.com/gchq/CyberChef/' + PIN + '/LICENSE';

const MODULES = [
  'Bletchley', 'Charts', 'Ciphers', 'Code', 'Compression', 'Crypto', 'Diff',
  'Encodings', 'File', 'Handlebars', 'Hashing', 'Image', 'Jq', 'PGP',
  'Protobuf', 'PublicKey', 'Regex', 'Serialise', 'Shellcode', 'URL',
  'UserAgent', 'Yara',
  // OCR.js is deliberately omitted: it loads Tesseract from assets/tesseract
  // and then fetches a language model. Neither works with connect-src none.
];

const FILES = [
  { url: RAW + 'index.html', dest: 'index.html' },
  { url: RAW + 'assets/main.js.gz', dest: 'assets/main.js.gz' },
  { url: RAW + 'assets/main.css.gz', dest: 'assets/main.css.gz' },
  { url: RAW + 'assets/main.js.LICENSE.txt', dest: 'assets/main.js.LICENSE.txt' },
  { url: RAW + 'assets/02aafe15b98928fdaa38.ttf', dest: 'assets/02aafe15b98928fdaa38.ttf' },
  { url: RAW + 'images/cook_male-32x32.png', dest: 'images/cook_male-32x32.png' },
  { url: RAW + 'images/cyberchef-128x128.png', dest: 'images/cyberchef-128x128.png' },
  { url: RAW + 'images/fork_me.png', dest: 'images/fork_me.png' },
  { url: LICENSE_RAW, dest: 'LICENSE' },
];
for (const name of MODULES) {
  FILES.push({ url: RAW + 'modules/' + name + '.js.gz', dest: 'modules/' + name + '.js.gz' });
  FILES.push({ url: RAW + 'modules/' + name + '.js.LICENSE.txt', dest: 'modules/' + name + '.js.LICENSE.txt' });
}
for (const f of [
  'Roboto72White.fnt', 'Roboto72White.png',
  'RobotoBlack72White.fnt', 'RobotoBlack72White.png',
  'RobotoMono72White.fnt', 'RobotoMono72White.png',
  'RobotoSlab72White.fnt', 'RobotoSlab72White.png',
]) {
  FILES.push({ url: RAW + 'assets/fonts/' + f, dest: 'fonts/' + f });
}

mkdirSync(join(vendor, 'assets'), { recursive: true });
mkdirSync(join(vendor, 'modules'), { recursive: true });
mkdirSync(join(vendor, 'images'), { recursive: true });
mkdirSync(join(vendor, 'fonts'), { recursive: true });

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'gifos-cyberchef-port' } });
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  const out = join(vendor, dest);
  mkdirSync(dirname(out), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  const buf = readFileSync(out);
  const sha = createHash('sha256').update(buf).digest('hex');
  console.log('  ' + dest + '  ' + buf.length + ' B  ' + sha.slice(0, 12));
  return { dest, bytes: buf.length, sha256: sha };
}

const hashes = [];
async function pool(limit = 6) {
  const q = FILES.slice();
  async function worker() {
    for (;;) {
      const f = q.shift();
      if (!f) return;
      hashes.push(await download(f.url, f.dest));
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
}

console.log('fetching CyberChef production assets @ ' + PIN.slice(0, 10) + '…');
await pool();
hashes.sort((a, b) => a.dest.localeCompare(b.dest));

const notice = [
  'CyberChef',
  'Copyright 2016-2026 Crown Copyright',
  '',
  'This product includes software developed by GCHQ (https://github.com/gchq/CyberChef).',
  'CyberChef is released under the Apache License, Version 2.0, and is covered by',
  'Crown Copyright. See LICENSE in this directory (and packed inside the App GIF).',
  '',
  'This GifOS app is an UNOFFICIAL port. It is not affiliated with, endorsed by,',
  'or blessed by GCHQ. Bugs belong at https://github.com/nwcnwc/gifos/issues —',
  'not upstream.',
  '',
  'Third-party notices from the production bundles ride beside this file as',
  'assets/main.js.LICENSE.txt and modules/*.js.LICENSE.txt; they are concatenated',
  'into the NOTICE packed inside the GIF.',
].join('\n') + '\n';
writeFileSync(join(vendor, 'NOTICE'), notice);

const upstream = [
  'vendor/ is GENERATED. Do not edit it; run node apps/cyberchef/vendor.mjs.',
  '',
  'upstream: ' + UPSTREAM,
  'commit:   ' + PIN,
  'artifacts: gh-pages production build of that commit',
  'skipped:  OCR/Tesseract, .gz/.br duplicates of the download, the 76 MB zip, Google Analytics',
  '',
  'sha256 of each fetched file:',
  ...hashes.map((h) => '  ' + h.sha256 + '  ' + h.bytes + '  ' + h.dest),
].join('\n') + '\n';
writeFileSync(join(vendor, 'UPSTREAM.txt'), upstream);
console.log('wrote vendor/UPSTREAM.txt (' + hashes.length + ' files)');
