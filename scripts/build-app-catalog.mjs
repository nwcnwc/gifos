#!/usr/bin/env node
/*
 * build-app-catalog.mjs — compose site/apps/ (the PUBLISHED store catalog) from
 * apps/ (the app SOURCE trees).
 *
 *   apps/<slug>/manifest.json   the app's own manifest — source of truth for
 *                               appId, names, version, accent, capabilities
 *   apps/<slug>/listing.json    the store-only fields — author, tagline, long
 *                               description, dates, categories, tags, license
 *   apps/<slug>/screenshot.png  the master cover art
 *   site/apps/<slug>/<slug>.gif the finished App GIF (lives INSIDE the publish
 *                               boundary — .github/workflows/pages.yml ships
 *                               only site/, so a GIF anywhere else is not
 *                               downloadable; it is not duplicated at the repo
 *                               root, which would put 8 MB in every clone twice
 *                               and let the two copies drift)
 *
 * Outputs (generated but COMMITTED — Pages serves static files, there is no
 * build step on deploy):
 *
 *   site/apps/index.json        one fetch for the whole store grid
 *   site/apps/<slug>/app.json   the detail page's record
 *   site/apps/<slug>/cover.jpg  the card/detail image
 *
 * THE COVER RULE. The store must never reference the App GIF as an image. A
 * grid of 8 MB GIFs would download the entire store to render one screen. The
 * cover.jpg exists precisely so the GIF goes over the wire exactly once, when
 * the user presses Install. e2e-app-store.js enforces this at the network
 * level; this script is the other half — it emits `cover`, and the byte size of
 * `gif` so the store can warn before a large download.
 *
 * Run: node scripts/build-app-catalog.mjs [--check]
 *   --check  verify the committed catalog matches the sources; write nothing.
 *            (This is what CI / the test battery runs.)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'apps');
const OUT = path.join(ROOT, 'site', 'apps');
const CHECK = process.argv.includes('--check');

// The canonical navigation set. An app may sit in more than one, but not in a
// category invented at listing time — free-text categories are how a store's
// navigation rots. Add one here, deliberately, and the store picks it up.
const CATEGORIES = [
  'Games', 'Learning', 'Productivity', 'Creativity',
  'Media', 'Social', 'Utilities', 'Developer', 'Health',
];

const CATALOG_VERSION = '1.0';

let errors = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); errors++; };

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// A GIFOSSIG block names the identity that signed the bytes (gifos-sign.js:
// { v, type: 'domain'|'email', id, alg, sig, ts }). We record the CLAIM here —
// a build script has no business fetching a domain key — and the store verifies
// it for real, in the browser, against the bytes it just downloaded.
function signatureClaim(bytes) {
  const at = bytes.indexOf(Buffer.from('GIFOSSIG'));
  if (at < 0) return null;
  // GIF application extension: <8-byte marker><3-byte auth> then length-prefixed
  // sub-blocks until a zero byte. The JSON can span several sub-blocks.
  let p = at + 11;
  const parts = [];
  while (p < bytes.length) { const n = bytes[p]; if (!n) break; parts.push(bytes.subarray(p + 1, p + 1 + n)); p += 1 + n; }
  try {
    const sig = JSON.parse(Buffer.concat(parts).toString('utf8'));
    return { type: sig.type || '', id: sig.id || '', ts: sig.ts || null };
  } catch (e) { return { type: '', id: '', ts: null }; }
}

async function coverFrom(srcPng, outJpg) {
  const sharp = (await import('sharp')).default;
  // 1200px wide is enough for a retina detail page; the grid card uses the same
  // file scaled down. Quality 82 keeps a UI screenshot crisp at a fraction of
  // the PNG's size.
  return sharp(srcPng).resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer()
    .then((buf) => writeOut(outJpg, buf));
}

// Write, or (in --check mode) compare. Returns true if the file on disk is
// already what we would have written.
function writeOut(p, contents) {
  const buf = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  const rel = path.relative(ROOT, p);
  const same = fs.existsSync(p) && Buffer.compare(fs.readFileSync(p), buf) === 0;
  if (CHECK) {
    if (!same) fail(rel + ' is stale — run: node scripts/build-app-catalog.mjs');
    return same;
  }
  if (!same) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); console.log('  → ' + rel); }
  return same;
}

// A cover is regenerated only when its source changes: sharp is not
// deterministic enough across versions to diff a re-encode, so --check compares
// existence + mtime ordering instead of bytes.
function coverIsCurrent(srcPng, outJpg) {
  if (!fs.existsSync(outJpg)) return false;
  return fs.statSync(outJpg).mtimeMs >= fs.statSync(srcPng).mtimeMs;
}

async function buildApp(slug) {
  const dir = path.join(SRC, slug);
  const manifestPath = path.join(dir, 'manifest.json');
  const listingPath = path.join(dir, 'listing.json');
  if (!fs.existsSync(listingPath)) return null;   // a source tree with no listing is simply not in the store
  if (!fs.existsSync(manifestPath)) { fail(slug + ': listing.json with no manifest.json'); return null; }

  const m = readJSON(manifestPath);
  const l = readJSON(listingPath);
  const outDir = path.join(OUT, slug);
  const gifPath = path.join(outDir, slug + '.gif');

  if (!fs.existsSync(gifPath)) {
    fail(slug + ': no built GIF at ' + path.relative(ROOT, gifPath) + ' — build it, then move it here');
    return null;
  }
  const gifBytes = fs.readFileSync(gifPath);
  if (!(gifBytes[0] === 0x47 && gifBytes[1] === 0x49 && gifBytes[2] === 0x46)) { fail(slug + ': ' + slug + '.gif is not a GIF'); return null; }
  if (!gifBytes.includes(Buffer.from('GIFOS1.0'))) fail(slug + ': ' + slug + '.gif carries no GifOS filesystem — it is not an App GIF');

  for (const f of ['tagline', 'description', 'author', 'releaseDate', 'categories', 'license']) {
    if (!l[f]) fail(slug + ': listing.json is missing "' + f + '"');
  }
  if (!m.appId) fail(slug + ': manifest.json has no appId');
  if (!m.version) fail(slug + ': manifest.json has no version');
  if (!isoDate(l.releaseDate)) fail(slug + ': releaseDate must be YYYY-MM-DD');
  if (l.updated && !isoDate(l.updated)) fail(slug + ': updated must be YYYY-MM-DD');
  if (!Array.isArray(l.categories) || !l.categories.length) fail(slug + ': categories must be a non-empty array');
  for (const c of l.categories || []) if (!CATEGORIES.includes(c)) fail(slug + ': unknown category "' + c + '" (known: ' + CATEGORIES.join(', ') + ')');
  if (l.tagline && l.tagline.length > 120) fail(slug + ': tagline is ' + l.tagline.length + ' chars — keep it under 120, it has to fit a card');

  // Cover art: the master PNG lives with the source; the store gets a JPEG.
  const coverSrc = path.join(dir, l.cover || 'screenshot.png');
  const coverOut = path.join(outDir, 'cover.jpg');
  if (!fs.existsSync(coverSrc)) fail(slug + ': cover art missing at ' + path.relative(ROOT, coverSrc));
  else if (CHECK) { if (!coverIsCurrent(coverSrc, coverOut)) fail(path.relative(ROOT, coverOut) + ' is missing or older than its source'); }
  else if (!coverIsCurrent(coverSrc, coverOut)) await coverFrom(coverSrc, coverOut);

  const rec = {
    catalog: CATALOG_VERSION,
    slug,
    appId: m.appId,
    name: m.name || slug,
    shortName: m.shortName || m.name || slug,
    version: m.version,
    tagline: l.tagline,
    description: l.description,
    author: l.author,
    releaseDate: l.releaseDate,
    updated: l.updated || l.releaseDate,
    categories: l.categories,
    tags: l.tags || [],
    license: l.license,
    homepage: l.homepage || '',
    accent: m.accent || null,
    capabilities: m.capabilities || {},
    cover: '/apps/' + slug + '/cover.jpg',
    screenshots: (l.screenshots || []).map((_, i) => '/apps/' + slug + '/shot-' + (i + 1) + '.jpg'),
    gif: '/apps/' + slug + '/' + slug + '.gif',
    bytes: gifBytes.length,
    sha256: crypto.createHash('sha256').update(gifBytes).digest('hex'),
    signature: signatureClaim(gifBytes),
  };

  // Screenshots (beyond the cover) get the same JPEG treatment.
  for (let i = 0; i < (l.screenshots || []).length; i++) {
    const s = path.join(dir, l.screenshots[i]);
    const o = path.join(outDir, 'shot-' + (i + 1) + '.jpg');
    if (!fs.existsSync(s)) { fail(slug + ': screenshot missing at ' + path.relative(ROOT, s)); continue; }
    if (CHECK) { if (!coverIsCurrent(s, o)) fail(path.relative(ROOT, o) + ' is missing or older than its source'); }
    else if (!coverIsCurrent(s, o)) await coverFrom(s, o);
  }

  writeOut(path.join(outDir, 'app.json'), JSON.stringify(rec, null, 2) + '\n');
  return rec;
}

const slugs = fs.readdirSync(SRC).filter((d) => fs.statSync(path.join(SRC, d)).isDirectory()).sort();
console.log((CHECK ? 'Checking' : 'Building') + ' app catalog from ' + slugs.length + ' source tree(s)…');

const records = [];
for (const slug of slugs) {
  const rec = await buildApp(slug);
  if (rec) records.push(rec);
}

// The index carries only what the GRID needs — no `description`, so browsing
// the store stays a small download however long the listings grow. The detail
// page fetches app.json.
const index = {
  catalog: CATALOG_VERSION,
  categories: CATEGORIES,
  apps: records.map((r) => ({
    slug: r.slug, appId: r.appId, name: r.name, shortName: r.shortName,
    version: r.version, tagline: r.tagline, author: r.author,
    releaseDate: r.releaseDate, updated: r.updated,
    categories: r.categories, tags: r.tags, accent: r.accent,
    cover: r.cover, bytes: r.bytes, signature: r.signature,
  })),
};
writeOut(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

// A stray directory under site/apps with no source tree is a leftover: it would
// still be published, and still be installable, with nobody maintaining it.
if (fs.existsSync(OUT)) {
  for (const d of fs.readdirSync(OUT)) {
    if (!fs.statSync(path.join(OUT, d)).isDirectory()) continue;
    if (!records.find((r) => r.slug === d)) fail('site/apps/' + d + ' has no source tree in apps/ — delete it, or add apps/' + d + '/listing.json');
  }
}

if (errors) { console.error('\n' + errors + ' problem(s). Catalog NOT ' + (CHECK ? 'valid' : 'written cleanly') + '.'); process.exit(1); }
console.log((CHECK ? 'Catalog is current' : 'Catalog built') + ' — ' + records.length + ' app(s).');
