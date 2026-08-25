#!/usr/bin/env node
/*
 * Per-app launch pages at site/go/<slug>/ so a tweet can unfurl the store
 * listing cover and then actually run the app.
 *
 * X/Twitterbot does not run JavaScript. It fetches the HTML and reads
 * og:image / twitter:image. gifos.app/?run=<slug> is index.html, whose card
 * is the generic og.png. /store/<slug> is 404.html (Join card) until JS
 * rewrites it. Both would show the wrong picture.
 *
 * These pages are static (GitHub Pages has no user-agent switch):
 *   og:image = https://gifos.app/apps/<slug>/cover.jpg  (the listing graphic)
 *   twitter:card = summary_large_image
 *   humans: location.replace to /?run=<slug>
 * No HTTP redirect and no meta-refresh — a crawler that followed either
 * would land on index.html and unfurl og.png instead of the cover.
 *
 * Run: node scripts/build-go-pages.mjs
 * Catalog build calls writeGoPages() so --check stays honest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_APPS = path.join(ROOT, 'site', 'apps');
const OUT_GO = path.join(ROOT, 'site', 'go');

export function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function jpegSize(p) {
  try {
    const b = fs.readFileSync(p);
    let i = 2;
    while (i + 9 < b.length && b[i] === 0xff) {
      const m = b[i + 1];
      if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0x01) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  } catch (e) {}
  return null;
}

export function ogDescription(rec) {
  let t = rec.tagline || rec.description || ('Run ' + (rec.name || rec.slug) + ' on GifOS.');
  t = String(t)
    .replace(/\s*The file is the save\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > 200) t = t.slice(0, 197) + '…';
  return t;
}

export function goPageHtml(rec) {
  const slug = rec.slug;
  const name = rec.name || slug;
  const title = name + ' on GifOS';
  const desc = ogDescription(rec);
  const run = 'https://gifos.app/?run=' + encodeURIComponent(slug);
  // ?store on the go page: same card for the crawler (the cover), but a human
  // lands on the store LISTING instead of straight in the app. Share hands
  // out both forms (site/js/store.js) — before this, Share gave the raw
  // /?run= and /store/ links, which unfurl the generic og.png, so the go
  // pages existed and nothing ever used them.
  const listing = 'https://gifos.app/store/' + encodeURIComponent(slug);
  const page = 'https://gifos.app/go/' + encodeURIComponent(slug) + '/';
  const img = 'https://gifos.app/apps/' + encodeURIComponent(slug) + '/cover.jpg';
  const sz = jpegSize(path.join(OUT_APPS, slug, 'cover.jpg'));
  const imgSize = sz
    ? '\n<meta property="og:image:width" content="' + sz.width + '">\n<meta property="og:image:height" content="' + sz.height + '">'
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${escHtml(page)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GifOS">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${escHtml(page)}">
<meta property="og:image" content="${escHtml(img)}">${imgSize}
<meta property="og:image:alt" content="${escHtml(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(desc)}">
<meta name="twitter:image" content="${escHtml(img)}">
<meta name="twitter:image:alt" content="${escHtml(title)}">
<script>location.replace(/(^|[?&])store([=&]|$)/.test(location.search) ? ${JSON.stringify(listing)} : ${JSON.stringify(run)});</script>
</head>
<body>
<p>Opening <a href="${escHtml(run)}">${escHtml(name)} on GifOS</a>… (or the <a href="${escHtml(listing)}">store listing</a>)</p>
</body>
</html>
`;
}

export function writeGoPages(records, { check = false } = {}) {
  let errors = 0;
  const fail = (msg) => { console.error('  ✗ ' + msg); errors++; };
  const listed = new Set(records.map((r) => r.slug));
  for (const rec of records) {
    if (!rec || !rec.slug) continue;
    const html = goPageHtml(rec);
    const p = path.join(OUT_GO, rec.slug, 'index.html');
    const buf = Buffer.from(html);
    const same = fs.existsSync(p) && Buffer.compare(fs.readFileSync(p), buf) === 0;
    if (check) {
      if (!same) fail('site/go/' + rec.slug + '/index.html is stale — run: node scripts/build-go-pages.mjs');
    } else if (!same) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
      console.log('  → site/go/' + rec.slug + '/index.html');
    }
  }
  if (fs.existsSync(OUT_GO)) {
    for (const d of fs.readdirSync(OUT_GO)) {
      const dir = path.join(OUT_GO, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      if (listed.has(d)) continue;
      const rel = 'site/go/' + d;
      if (check) fail(rel + ' has no listed app — delete it');
      else {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('  × ' + rel);
      }
    }
  }
  return errors;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const indexPath = path.join(OUT_APPS, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('site/apps/index.json missing — run: node scripts/build-app-catalog.mjs');
    process.exit(1);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const records = (index.apps || []).map((a) => {
    const p = path.join(OUT_APPS, a.slug, 'app.json');
    if (fs.existsSync(p)) return { ...a, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
    return a;
  });
  const n = writeGoPages(records, { check: process.argv.includes('--check') });
  if (n) {
    console.error('\n' + n + ' problem(s). Go pages NOT valid.');
    process.exit(1);
  }
  console.log('Go pages current — ' + records.length + ' app(s).');
}
