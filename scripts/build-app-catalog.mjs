#!/usr/bin/env node
/*
 * build-app-catalog.mjs — compose site/apps/ (the PUBLISHED store catalog) from
 * apps/ (the app SOURCE trees).
 *
 *   apps/<slug>/manifest.json   the app's own manifest — source of truth for
 *                               appId, names, version, accent, capabilities
 *   apps/<slug>/listing.json    the store-only fields — author, tagline, long
 *                               description, dates, categories, tags, license,
 *                               and for a port of someone else's work: basedOn
 *                               + porter (author is THEM, never GifOS)
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

// The edge build the App Store itself shipped in (site/store.html's first
// commit). It is the floor for every listing's minBuild, because a build with
// no store cannot install from the store — a listing claiming to run on build
// 300 is not generous, it is untrue. Bump this only if the store is ever
// rewritten in a way that invalidates older installs.
const STORE_BUILD = 947;

let errors = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); errors++; };

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// https:// only, no userinfo. Same hygiene as gifos-cash.js: a listing must
// not ship a javascript: donate or a https://user:pass@… "homepage".
function httpsUrl(s, what) {
  if (typeof s !== 'string' || !s.trim()) { fail(what + ' is missing'); return null; }
  let u;
  try { u = new URL(s.trim()); } catch (e) { fail(what + ' is not a URL'); return null; }
  if (u.protocol !== 'https:') { fail(what + ' must be https://'); return null; }
  if (u.username || u.password) { fail(what + ' must not carry userinfo'); return null; }
  if (!u.hostname) { fail(what + ' has no host'); return null; }
  return u;
}

function hostOf(u) {
  return (u && u.hostname || '').replace(/^www\./, '').toLowerCase();
}

// A person on a listing: {name, url}. A bare string is accepted and normalised
// — several first-party listings still say "GifOS" — so the published catalog
// is always an object and store.js never has to guess.
function person(v, what, opts) {
  const needUrl = !!(opts && opts.requiredUrl);
  let name = '', url = '';
  if (typeof v === 'string') {
    name = v.trim();
  } else if (v && typeof v === 'object' && !Array.isArray(v)) {
    name = String(v.name || '').trim();
    url = String(v.url || '').trim();
  } else {
    fail(what + ' must be {name, url} (or a name string)');
    return null;
  }
  if (!name) { fail(what + ' needs a name'); return null; }
  if (!url && name.toLowerCase() === 'gifos') url = 'https://gifos.app';
  if (url) {
    if (!httpsUrl(url, what + '.url')) return null;
  } else if (needUrl) {
    fail(what + ' needs a url');
    return null;
  }
  return url ? { name, url } : { name };
}

function isGifosPerson(p) {
  if (!p) return false;
  if (String(p.name || '').trim().toLowerCase() === 'gifos') return true;
  try { return hostOf(new URL(p.url || '')) === 'gifos.app'; } catch (e) { return false; }
}

// The named product this listing is a port of. Absent on first-party apps.
// Present ⇒ author is THEM and porter is required — that is the rule that
// stops "Author: GifOS" on someone else's work coming back.
function basedOn(v, slug) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    fail(slug + ': basedOn must be an object {name, url}');
    return null;
  }
  const name = String(v.name || '').trim();
  if (!name) fail(slug + ': basedOn.name is required — the named product this is a port of');
  const u = httpsUrl(v.url, slug + ': basedOn.url');
  let donate = '';
  if (v.donate) {
    const d = httpsUrl(v.donate, slug + ': basedOn.donate');
    if (d) {
      const h = hostOf(d);
      if (h === 'gifos.app' || h === 'stripe.com' || h.endsWith('.stripe.com')) {
        fail(slug + ': basedOn.donate must be the upstream project\'s own page, not a GifOS or Stripe checkout');
      } else {
        donate = v.donate.trim();
      }
    }
  }
  if (v.blessed != null && typeof v.blessed !== 'boolean') {
    fail(slug + ': basedOn.blessed must be a boolean (default false)');
  }
  if (!name || !u) return null;
  const out = { name, url: v.url.trim(), blessed: v.blessed === true };
  if (donate) out.donate = donate;
  return out;
}

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

// crop: optional { top, bottom, left, right } in the SOURCE image's own pixels.
// Screenshots are taken through the GifOS shell, so the master usually has the
// run.html toolbar across the top — shell chrome, not the app. Cropped away, a
// grid of thumbnails shows two different apps instead of two identical
// headers. The author states it, because only they know their own capture.
async function coverFrom(srcPng, outJpg, crop) {
  const sharp = (await import('sharp')).default;
  let img = sharp(srcPng);
  const c = crop || {};
  if (c.top || c.bottom || c.left || c.right) {
    const m = await img.metadata();
    const left = c.left || 0, top = c.top || 0;
    const width = m.width - left - (c.right || 0);
    const height = m.height - top - (c.bottom || 0);
    if (width <= 0 || height <= 0) throw new Error('coverCrop removes the whole image');
    img = img.extract({ left, top, width, height });
  }
  // 1200px wide is enough for a retina detail page; the grid card uses the same
  // file scaled down. Quality 82 keeps a UI screenshot crisp at a fraction of
  // the PNG's size.
  return img.resize({ width: 1200, withoutEnlargement: true })
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


// A first-party app that took its IDEA from someone else's product, without
// being a port of their code. Author stays GifOS. Mutually exclusive with
// basedOn: a port is not "inspired by".
function inspiredBy(v, slug) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    fail(slug + ': inspiredBy must be an object {name, url}');
    return null;
  }
  const name = String(v.name || '').trim();
  if (!name) fail(slug + ': inspiredBy.name is required');
  const u = httpsUrl(v.url, slug + ': inspiredBy.url');
  const by = String(v.by || '').trim();
  if (!name || !u) return null;
  const out = { name, url: v.url.trim() };
  if (by) out.by = by;
  return out;
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

  // AUTHOR / PORT. author is who the work is by. A port of someone else's
  // named product sets basedOn + porter; author is then THEM, and GifOS as
  // author is a build failure — that is how "this is UVR, moved into GifOS"
  // stops being a sentence the catalog will ship. First-party listings omit
  // both basedOn and porter, so the published record does not print GifOS twice.
  const author = person(l.author, slug + ': author');
  const based = basedOn(l.basedOn, slug);
  let porter = null;
  if (based) {
    if (author && isGifosPerson(author)) {
      fail(slug + ': a port of ' + based.name + ' cannot list GifOS as the author — they are the author, GifOS is the porter');
    }
    if (!l.porter) fail(slug + ': basedOn requires porter (who made this GifOS surface)');
    else porter = person(l.porter, slug + ': porter', { requiredUrl: true });
  } else if (l.porter) {
    fail(slug + ': porter is only for ports — drop it, or add basedOn');
  }
  const inspired = inspiredBy(l.inspiredBy, slug);
  if (based && inspired) {
    fail(slug + ': basedOn and inspiredBy are different claims — a port is not "inspired by". Pick basedOn.');
  }

  // MIN BUILD — the oldest GifOS build this app actually runs on, as a build
  // number (the monotonic counter in site/js/build.js; version.json maps each
  // release to the edge build it was cut from).
  //
  // This is REQUIRED, and it is required for the same reason browser-support's
  // honesty rules are: an app that says nothing is indistinguishable from an
  // app whose author never thought about it, and the store then offers an
  // install it knows will not work. That is not hypothetical — Offline Cheap
  // Text LLM BitNet needs the install-time asset tier, which does not exist in
  // 0.9.5, the release most visitors are running. Without a declared floor the
  // store downloads a gigabyte of weights onto a computer that cannot read
  // them, and the player is left with an icon that opens onto nothing.
  //
  // Derive it, don't guess it: take the build in which the NEWEST OS feature
  // the app needs landed (git log the site/ change, then
  // ANCHOR_BUILD + `git rev-list --count <anchor>..<sha> -- site`), and for an
  // app that needs nothing newer than the store itself, STORE_BUILD. Over-
  // stating costs a player an update they did not strictly need; under-stating
  // costs them an app that does not work, so when in doubt, state the higher.
  if (!Number.isInteger(m.minBuild)) {
    fail(slug + ': manifest.json must declare "minBuild" — the oldest GifOS build this app runs on (an integer; see apps/README.md). The store cannot warn a player off an app their computer cannot run without it.');
  } else if (m.minBuild < STORE_BUILD) {
    fail(slug + ': minBuild ' + m.minBuild + ' predates the App Store itself (build ' + STORE_BUILD + ') — a build with no store cannot install from it, so that floor is not true.');
  } else {
    // The part of the floor a human should not have to remember. Each entry is
    // an OS feature a manifest can ASK FOR, next to the build it first existed
    // in — so a manifest that asks for it and claims to run on an older build
    // is caught here instead of in a player's hands. Judgement still sets the
    // number; this only stops it being obviously wrong.
    const FEATURE_BUILD = [
      // Provider apps serving AI roles: runtime 1176, Providers folder 1177.
      ['provides', (x) => !!x.provides, 1177],
      // Install-time assets (site/js/gifos-assets.js) — absent from every
      // release cut so far, which is exactly why this field exists.
      ['assets', (x) => Array.isArray(x.assets) && x.assets.length > 0, 1178],
      // capabilities.pool: a room fetches a map tile once, not once per player.
      ['capabilities.pool', (x) => !!(x.capabilities || {}).pool, 1089],
      // capabilities.gpu (WebGPU allow-policy on the app frame) landed after
      // the 0.9.7 cut (build 1249), so the first build that grants it is 1250.
      ['capabilities.gpu', (x) => !!(x.capabilities || {}).gpu, 1250],
      // capabilities.pointer (allow-pointer-lock on the app frame) — without it
      // a first-person app mounts, renders, and cannot aim: the SecurityError
      // lands inside the sandbox where the player never sees it.
      ['capabilities.pointer', (x) => !!(x.capabilities || {}).pointer, 1285],
      // capabilities.fullscreen — TWO hatches under one ability: the fullscreen
      // permissions policy on the app frame and the allow-orientation-lock
      // sandbox token. Without it a phone plays a first-person game in a
      // portrait strip, and both refusals (TypeError, SecurityError) land inside
      // the sandbox where the player never sees them. Landed in build 1314.
      ['capabilities.fullscreen', (x) => !!(x.capabilities || {}).fullscreen, 1314],
      // optional assets: skipped at install/boot; gifos.assets() fetches that
      // one pin. Older runtimes download every pin on boot, so a zoo of
      // optional models would be a gigabyte surprise — the app must claim
      // the runtime that honours optional.
      ['optional assets', (x) => Array.isArray(x.assets) && x.assets.some((a) => a && a.optional), 1381],
    ];
    for (const [what, uses, since] of FEATURE_BUILD) {
      if (uses(m) && m.minBuild < since) {
        fail(slug + ': manifest uses ' + what + ', which arrived in build ' + since + ', but claims minBuild ' + m.minBuild + ' — raise the floor.');
      }
    }
  }
  if (!isoDate(l.releaseDate)) fail(slug + ': releaseDate must be YYYY-MM-DD');
  if (l.updated && !isoDate(l.updated)) fail(slug + ': updated must be YYYY-MM-DD');
  if (!Array.isArray(l.categories) || !l.categories.length) fail(slug + ': categories must be a non-empty array');
  for (const c of l.categories || []) if (!CATEGORIES.includes(c)) fail(slug + ': unknown category "' + c + '" (known: ' + CATEGORIES.join(', ') + ')');
  if (l.tagline && l.tagline.length > 120) fail(slug + ': tagline is ' + l.tagline.length + ' chars — keep it under 120, it has to fit a card');

  // Install-time assets (site/js/gifos-assets.js): validate the manifest's
  // declaration, and for origin-relative URLs prove the pinned file really
  // sits inside the publish boundary with EXACTLY the declared hash — the
  // catalog must never list an install that cannot complete, and a re-uploaded
  // asset whose manifest pin wasn't updated is a drift this catches at build.
  //
  // DOCTRINE (docs/providers.md, Nathan 2026-08-09): the assets pattern is
  // reserved for weights genuinely too big to ride inside a GIF — publicly
  // hosted model files in the tens of MB and up (Hugging Face-style pinned
  // URLs). Anything smaller belongs IN the GIF (deflate makes it cheap, and
  // in-GIF means the shared file is complete with no second fetch to fail) —
  // Offline Text to Speech's 5.6 MB engine and Chess Grandmaster's Stockfish both do.
  // Enforced here so the doctrine can't erode one convenient listing at a
  // time; the floor is mechanical, the 40 MB+ guidance is judgement.
  const ASSET_MIN_BYTES = 8 * 1024 * 1024;
  let download = 0;
  if (m.assets && !Array.isArray(m.assets)) fail(slug + ': manifest.assets must be an array');
  for (const a of (Array.isArray(m.assets) ? m.assets : [])) {
    const tag = slug + ' asset "' + ((a && a.path) || '?') + '"';
    if (!a || typeof a !== 'object') { fail(slug + ': malformed assets entry'); continue; }
    if (!a.path || String(a.path).includes('..') || String(a.path)[0] === '/') fail(tag + ': path must be a bare relative name');
    if (!/^[0-9a-f]{64}$/.test(String(a.sha256 || '').toLowerCase())) fail(tag + ': sha256 must be 64 hex chars');
    const url = String(a.url || '');
    const rel = /^\/[^/]/.test(url);
    if (!rel && !/^https:\/\//.test(url)) { fail(tag + ': url must be https:// or origin-relative /…'); continue; }
    if (rel) {
      const p = path.join(ROOT, 'site', url);
      if (!fs.existsSync(p)) { fail(tag + ': pinned file missing at site' + url); continue; }
      const b = fs.readFileSync(p);
      const hex = crypto.createHash('sha256').update(b).digest('hex');
      if (hex !== String(a.sha256).toLowerCase()) fail(tag + ': site' + url + ' does not match the pinned sha256 — re-pin the manifest or restore the file');
      if (a.bytes && Number(a.bytes) !== b.length) fail(tag + ': declared bytes ' + a.bytes + ' ≠ actual ' + b.length);
      if (b.length < ASSET_MIN_BYTES) fail(tag + ': ' + b.length + ' bytes is small enough to ride INSIDE the GIF — pack it (assets are reserved for big model weights, docs/providers.md)');
      if (!a.optional) download += b.length;
    } else {
      if (!(Number(a.bytes) > 0)) { fail(tag + ': an absolute-URL asset must declare its true bytes (the store quotes the download, and the size floor needs it)'); continue; }
      if (Number(a.bytes) < ASSET_MIN_BYTES) fail(tag + ': ' + a.bytes + ' bytes is small enough to ride INSIDE the GIF — pack it (assets are reserved for big model weights, docs/providers.md)');
      if (!a.optional) download += Number(a.bytes);
    }
  }

  // Cover art: the master PNG lives with the source; the store gets a JPEG.
  const coverSrc = path.join(dir, l.cover || 'screenshot.png');
  const coverOut = path.join(outDir, 'cover.jpg');
  if (!fs.existsSync(coverSrc)) fail(slug + ': cover art missing at ' + path.relative(ROOT, coverSrc));
  else if (CHECK) { if (!coverIsCurrent(coverSrc, coverOut)) fail(path.relative(ROOT, coverOut) + ' is missing or older than its source'); }
  else if (!coverIsCurrent(coverSrc, coverOut)) await coverFrom(coverSrc, coverOut, l.coverCrop);

  const rec = {
    catalog: CATALOG_VERSION,
    slug,
    appId: m.appId,
    name: m.name || slug,
    shortName: m.shortName || m.name || slug,
    version: m.version,
    minBuild: m.minBuild,
    tagline: l.tagline,
    description: l.description,
    author,
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
    // Extra install-time download the OS fetches and seals (0 for most apps) —
    // the store can honestly say "+N MB download" before Install.
    download,
    provides: m.provides || null,
    sha256: crypto.createHash('sha256').update(gifBytes).digest('hex'),
    signature: signatureClaim(gifBytes),
  };
  if (porter) rec.porter = porter;
  if (based) rec.basedOn = based;
  if (inspired) rec.inspiredBy = inspired;

  // Screenshots (beyond the cover) get the same JPEG treatment.
  for (let i = 0; i < (l.screenshots || []).length; i++) {
    const s = path.join(dir, l.screenshots[i]);
    const o = path.join(outDir, 'shot-' + (i + 1) + '.jpg');
    if (!fs.existsSync(s)) { fail(slug + ': screenshot missing at ' + path.relative(ROOT, s)); continue; }
    if (CHECK) { if (!coverIsCurrent(s, o)) fail(path.relative(ROOT, o) + ' is missing or older than its source'); }
    else if (!coverIsCurrent(s, o)) await coverFrom(s, o, l.coverCrop);
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
    // basedOn belongs in the INDEX so the GRID can say "port of UVR" and
    // search can find "ultimate vocal remover" / "claude of duty" without
    // fetching app.json. Donate does not — that is a detail-page button.
    ...(r.porter ? { porter: r.porter } : {}),
    ...(r.basedOn ? { basedOn: { name: r.basedOn.name, blessed: r.basedOn.blessed } } : {}),
    ...(r.inspiredBy ? { inspiredBy: { name: r.inspiredBy.name, by: r.inspiredBy.by || '' } } : {}),
    // minBuild belongs in the INDEX, not only in each app.json, for the same
    // reason sha256 does (see below): the GRID has to be able to say "needs a
    // newer GifOS" on the card. Learning it only on the detail page would mean
    // the player finds out one press before Install, having already been sold
    // on it — and the grid would go on advertising an app their computer
    // cannot run as though it were ready to install.
    minBuild: r.minBuild,
    releaseDate: r.releaseDate, updated: r.updated,
    categories: r.categories, tags: r.tags, accent: r.accent,
    cover: r.cover, bytes: r.bytes, download: r.download, provides: r.provides, signature: r.signature,
    // sha256 BELONGS IN THE INDEX, not only in each app.json. store.js decides
    // "yours is older" by hashing the installed bytes and comparing to
    // app.sha256 — and the GRID calls outdated() on an INDEX entry. Without
    // this field that comparison read `undefined` for every app, so the grid
    // could only ever say "Installed" and never "Update available". The detail
    // page worked (it loads app.json, which has the hash), so the bug looked
    // like "the store does not know about updates" while the machinery for
    // knowing was right there, one fetch away.
    //
    // It costs 64 bytes an app in a file that is already fetched once per
    // store visit, and it is the difference between a player getting fixes and
    // a player being frozen at install-day code forever.
    sha256: r.sha256,
  })),
};
writeOut(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

// A stray directory under site/apps with no source tree is a leftover: it would
// still be published, and still be installable, with nobody maintaining it.
// EXCEPTION — an UNPUBLISHED app (source tree with listing.unpublished.json,
// the sound-it-out pattern): its built GIF may sit in the publish boundary
// (tests exercise it; direct links work) while it stays out of the store —
// but it must not carry a stale app.json/cover from a previously-listed life,
// or the store's detail route would keep serving a delisted page.
if (fs.existsSync(OUT)) {
  for (const d of fs.readdirSync(OUT)) {
    if (!fs.statSync(path.join(OUT, d)).isDirectory()) continue;
    if (records.find((r) => r.slug === d)) continue;
    if (fs.existsSync(path.join(SRC, d, 'listing.unpublished.json'))) {
      for (const leftover of ['app.json', 'cover.jpg']) {
        if (fs.existsSync(path.join(OUT, d, leftover))) fail('site/apps/' + d + '/' + leftover + ' lingers but the app is unpublished — delete it (the store must not serve a delisted detail page)');
      }
      continue;
    }
    fail('site/apps/' + d + ' has no source tree in apps/ — delete it, or add apps/' + d + '/listing.json');
  }
}

if (errors) { console.error('\n' + errors + ' problem(s). Catalog NOT ' + (CHECK ? 'valid' : 'written cleanly') + '.'); process.exit(1); }
console.log((CHECK ? 'Catalog is current' : 'Catalog built') + ' — ' + records.length + ' app(s).');
