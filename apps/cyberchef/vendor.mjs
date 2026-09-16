/*
 * vendor.mjs — pull the pinned CyberChef production build into vendor/.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline and byte-reproducible from
 * what is committed here. Run this only to move the pin.
 *
 *   node apps/cyberchef/vendor.mjs            # VERIFY: upstream still matches vendor/UPSTREAM.txt
 *   node apps/cyberchef/vendor.mjs --repin    # take the current gh-pages build (review the diff!)
 *
 * WHAT IT PRODUCES. The official production assets from the CyberChef gh-pages
 * branch (the same files https://gchq.github.io/CyberChef/ serves), minus the
 * gzip/brotli duplicates, the 76 MB standalone zip, Google Analytics, and
 * Tesseract (OCR needs those assets plus a language model fetch, which the
 * sandbox cannot do). JS/CSS are stored gzipped to keep the clone lean;
 * build.mjs inflates them.
 */
import { createWriteStream, mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');

// The pin. Moving it is a deliberate act: `node apps/cyberchef/vendor.mjs --repin`,
// then review the diff of vendor/UPSTREAM.txt, and rebuild the GIF.
//
// TWO MODES. Without a flag this script VERIFIES: it downloads the artifacts
// to a scratch directory, hashes them, and compares against the sha256 list
// already committed in vendor/UPSTREAM.txt. Any difference is a hard failure
// and vendor/ is not touched. It used to download straight over the committed
// files and record whatever hashes it got — which is no pin at all when the
// artifacts come from gh-pages, a branch upstream force-pushes on every
// deploy: a run six weeks later silently replaced a reviewed build with a
// newer one and rewrote the "expected" hashes to match.
//
// --repin is the deliberate act: fetch the CURRENT gh-pages deploy, record
// its commit (from the GitHub API) and every artifact's hash, and replace the
// committed files. The recorded gh-pages commit is what a later verify run
// fetches from, so the bytes are reproducible for as long as GitHub keeps
// that commit reachable; if it has been garbage-collected, verify says so
// rather than quietly reading the branch tip.
const UPSTREAM = 'https://github.com/gchq/CyberChef';
const PIN = '2e048b0290854781db61e20638dca62978379032'; // the SOURCE commit the vendored gh-pages build was made from (2026-08-20)
const REPIN = process.argv.includes('--repin');
const UPSTREAM_TXT = join(vendor, 'UPSTREAM.txt');
// The gh-pages commit the committed artifacts were fetched from, as recorded
// by the last --repin ("pages:" line). Unknown for the first pinned build,
// which predates this record — verify then reads the branch tip and holds it
// to the recorded hashes, which is the guarantee that matters.
function recordedPages() {
  try { const m = /^pages:\s+([0-9a-f]{40})/m.exec(readFileSync(UPSTREAM_TXT, 'utf8')); return m ? m[1] : null; } catch (e) { return null; }
}
function recordedHashes() {
  const out = new Map();
  try {
    for (const line of readFileSync(UPSTREAM_TXT, 'utf8').split('\n')) {
      const m = /^\s+([0-9a-f]{64})\s+(\d+)\s+(\S.*)$/.exec(line);
      if (m) out.set(m[3], { sha256: m[1], bytes: +m[2] });
    }
  } catch (e) {}
  return out;
}
async function currentPagesCommit() {
  const r = await fetch('https://api.github.com/repos/gchq/CyberChef/commits/gh-pages', { headers: { 'User-Agent': 'gifos-cyberchef-port', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub API: HTTP ' + r.status + ' looking up the gh-pages tip');
  return (await r.json()).sha;
}
const PAGES = REPIN ? await currentPagesCommit() : recordedPages();
const RAW = 'https://raw.githubusercontent.com/gchq/CyberChef/' + (PAGES || 'gh-pages') + '/';
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

// Downloads land in a scratch directory first — NEVER over the committed
// files — and are promoted only on --repin, after every one has arrived.
const scratch = mkdtempSync(join(tmpdir(), 'cyberchef-vendor-'));

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'gifos-cyberchef-port' } });
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  const out = join(scratch, dest);
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

console.log((REPIN ? 'RE-PINNING: fetching' : 'VERIFYING: fetching') + ' CyberChef production assets from ' + (PAGES ? 'gh-pages@' + PAGES.slice(0, 10) : 'the gh-pages tip (no pages: record yet)') + '…');
await pool();
hashes.sort((a, b) => a.dest.localeCompare(b.dest));

if (!REPIN) {
  // VERIFY: what arrived must be byte-for-byte what was reviewed and committed.
  const want = recordedHashes();
  const bad = [];
  for (const h of hashes) {
    const w = want.get(h.dest);
    if (!w) bad.push('  NOT RECORDED  ' + h.dest);
    else if (w.sha256 !== h.sha256) bad.push('  CHANGED       ' + h.dest + '  recorded ' + w.sha256.slice(0, 12) + '  fetched ' + h.sha256.slice(0, 12));
  }
  for (const dest of want.keys()) if (!hashes.some((h) => h.dest === dest)) bad.push('  MISSING       ' + dest);
  rmSync(scratch, { recursive: true, force: true });
  if (bad.length) {
    console.error('\nUPSTREAM DIFFERS FROM THE VENDORED BUILD — vendor/ left untouched:\n' + bad.join('\n') +
      '\n\nIf upstream moved on and you mean to take the new build: review it, then\n  node apps/cyberchef/vendor.mjs --repin\nand read the diff of vendor/UPSTREAM.txt before committing.');
    process.exit(1);
  }
  console.log('VERIFIED: ' + hashes.length + ' artifacts match vendor/UPSTREAM.txt');
  process.exit(0);
}

// RE-PIN: every artifact arrived; promote the scratch tree over vendor/.
for (const h of hashes) {
  const out = join(vendor, h.dest);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(join(scratch, h.dest), out);
}
rmSync(scratch, { recursive: true, force: true });

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
  'pages:    ' + PAGES + '   (the gh-pages commit these artifacts were fetched from; verify fetches this, not the branch tip)',
  'artifacts: gh-pages production build of that commit',
  'skipped:  OCR/Tesseract, .gz/.br duplicates of the download, the 76 MB zip, Google Analytics',
  '',
  'sha256 of each fetched file:',
  ...hashes.map((h) => '  ' + h.sha256 + '  ' + h.bytes + '  ' + h.dest),
].join('\n') + '\n';
writeFileSync(join(vendor, 'UPSTREAM.txt'), upstream);
console.log('wrote vendor/UPSTREAM.txt (' + hashes.length + ' files)');
